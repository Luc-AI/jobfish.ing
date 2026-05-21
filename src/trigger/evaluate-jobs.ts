// src/trigger/evaluate-jobs.ts
import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import type { RoleSelection } from '@/lib/supabase/types'
import { buildEvaluationPrompt, callOpenRouter, parseEvaluationResponse } from './lib/evaluate'
import { filterJobsForUser } from './lib/pre-filter'

interface EvaluateJobsPayload {
  jobIds?: string[]
  userIds?: string[]
}

export const evaluateJobsTask = task({
  id: 'evaluate-jobs',
  retry: { maxAttempts: 2 },
  run: async ({ jobIds, userIds }: EvaluateJobsPayload) => {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')

    const supabase = createServiceClient()

    let jobsQuery = supabase
      .from('jobs')
      .select('id, title, company, location, description, industry')
      .eq('is_active', true)

    if (jobIds && jobIds.length > 0) {
      jobsQuery = jobsQuery.in('id', jobIds)
    } else {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      jobsQuery = jobsQuery.gte('date_posted', sevenDaysAgo)
    }

    const { data: jobs, error: jobsError } = await jobsQuery

    if (jobsError || !jobs?.length) {
      console.log('No jobs to evaluate')
      return { evaluatedCount: 0 }
    }

    let profilesQuery = supabase
      .from('profiles')
      .select('id, cv_text')
      .eq('onboarding_completed', true)

    if (userIds && userIds.length > 0) {
      profilesQuery = profilesQuery.in('id', userIds)
    }

    const { data: profiles, error: profilesError } = await profilesQuery

    if (profilesError) throw profilesError

    if (!profiles?.length) {
      console.log('No active users to evaluate for')
      return { evaluatedCount: 0 }
    }

    const profileUserIds = profiles.map(p => p.id)
    const { data: prefsRows } = await supabase
      .from('preferences')
      .select('user_id, target_roles, target_industries, locations, excluded_companies, excluded_industries')
      .in('user_id', profileUserIds)

    const prefsMap = new Map((prefsRows ?? []).map(p => [p.user_id, p]))

    let evaluatedCount = 0
    const errors: string[] = []

    for (const user of profiles) {
      const prefs = prefsMap.get(user.id)

      const candidateJobs = filterJobsForUser(jobs, {
        target_roles: (prefs?.target_roles ?? []) as RoleSelection[],
        excluded_companies: prefs?.excluded_companies ?? [],
        excluded_industries: (prefs?.excluded_industries ?? []) as string[],
      })

      for (const job of candidateJobs) {
        try {
          const prompt = buildEvaluationPrompt({
            jobTitle: job.title,
            jobCompany: job.company,
            jobDescription: job.description ?? '',
            cvText: user.cv_text ?? '',
            targetRoles: (prefs?.target_roles ?? []) as RoleSelection[],
            targetIndustries: (prefs?.target_industries ?? []) as string[],
            locations: prefs?.locations ?? [],
            excludedCompanies: prefs?.excluded_companies ?? [],
          })

          const rawResponse = await callOpenRouter(prompt)
          const { score, reasoning, dimensions, detailed_reasoning } = parseEvaluationResponse(rawResponse)

          await supabase
            .from('job_evaluations')
            .upsert(
              {
                job_id: job.id,
                user_id: user.id,
                score,
                reasoning,
                dimensions,
                detailed_reasoning,
              },
              { onConflict: 'job_id,user_id', ignoreDuplicates: true }
            )

          evaluatedCount++
        } catch (err) {
          const msg = `job ${job.id} / user ${user.id}: ${err instanceof Error ? err.message : String(err)}`
          Sentry.captureException(err, { extra: { jobId: job.id, userId: user.id } })
          console.error(`Evaluation failed for ${msg}`)
          errors.push(msg)
        }
      }
    }

    console.log(`Evaluated ${evaluatedCount} job/user pairs, ${errors.length} errors`)
    return { evaluatedCount, errors }
  },
})
