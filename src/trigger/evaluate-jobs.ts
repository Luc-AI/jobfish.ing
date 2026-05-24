// src/trigger/evaluate-jobs.ts
import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import type { RoleSelection } from '@/lib/supabase/types'
import { buildEvaluationPrompt, callOpenRouter, parseEvaluationResponse } from './lib/evaluate'
import { filterJobsForUser } from './lib/pre-filter'
import { sendInstantAlertTask } from './send-instant-alert'
import type { CvSummary } from './summarize-cv'

interface EvaluateJobsPayload {
  jobIds?: string[]
  userIds?: string[]
  since?: string  // YYYY-MM-DD; defaults to 7 days ago
  until?: string  // YYYY-MM-DD; exclusive upper bound for date_posted
  phase?: 'onboarding-1' | 'onboarding-2' | 'cron'
}

export const evaluateJobsTask = task({
  id: 'evaluate-jobs',
  retry: { maxAttempts: 2 },
  run: async ({ jobIds, userIds, since, until, phase }: EvaluateJobsPayload) => {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')

    const supabase = createServiceClient()

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    let jobsQuery = supabase
      .from('jobs')
      .select('id, title, company, location, description, industry')
      .eq('is_active', true)

    if (jobIds && jobIds.length > 0) {
      jobsQuery = jobsQuery.in('id', jobIds)
    } else {
      jobsQuery = jobsQuery.gte('date_posted', since ?? sevenDaysAgo)
      if (until) jobsQuery = jobsQuery.lt('date_posted', until)
    }

    const { data: jobs, error: jobsError } = await jobsQuery

    if (jobsError || !jobs?.length) {
      console.log('No jobs to evaluate')
      return { evaluatedCount: 0 }
    }

    let profilesQuery = supabase
      .from('profiles')
      .select('id, cv_text, cv_summary, years_experience, instant_alert_threshold')
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

      const evaluatedJobIds: string[] = []

      for (const job of candidateJobs) {
        try {
          const prompt = buildEvaluationPrompt({
            jobTitle: job.title,
            jobCompany: job.company,
            jobLocation: job.location ?? null,
            jobIndustry: job.industry ?? null,
            jobDescription: job.description ?? '',
            cvText: user.cv_text ?? '',
            cvSummary: user.cv_summary as CvSummary | null,
            targetRoles: (prefs?.target_roles ?? []) as RoleSelection[],
            targetIndustries: (prefs?.target_industries ?? []) as string[],
            locations: prefs?.locations ?? [],
            excludedCompanies: prefs?.excluded_companies ?? [],
            excludedIndustries: (prefs?.excluded_industries ?? []) as string[],
            yearsExperience: user.years_experience ?? 0,
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
              { onConflict: 'job_id,user_id', ignoreDuplicates: true },
            )

          evaluatedJobIds.push(job.id)
          evaluatedCount++
        } catch (err) {
          const msg = `job ${job.id} / user ${user.id}: ${err instanceof Error ? err.message : String(err)}`
          Sentry.captureException(err, { extra: { jobId: job.id, userId: user.id, phase } })
          console.error(`Evaluation failed for ${msg}`)
          errors.push(msg)
        }
      }

      if (user.instant_alert_threshold != null && evaluatedJobIds.length > 0) {
        // Query for evaluation IDs that meet the threshold for this user's freshly evaluated jobs
        const { data: hotEvals } = await supabase
          .from('job_evaluations')
          .select('id')
          .eq('user_id', user.id)
          .in('job_id', evaluatedJobIds)
          .gte('score', user.instant_alert_threshold)
          .is('instant_alerted_at', null)

        const hotEvalIds = (hotEvals ?? []).map(e => e.id)

        if (hotEvalIds.length > 0) {
          try {
            await sendInstantAlertTask.trigger({ userId: user.id, evaluationIds: hotEvalIds })
          } catch (err) {
            Sentry.captureException(err, { extra: { userId: user.id, hotEvalIds, phase } })
            console.error(`Failed to trigger instant alert for user ${user.id}:`, err)
          }
        }
      }
    }

    if (phase === 'onboarding-2' && errors.length > 0) {
      Sentry.captureMessage('onboarding phase-2: evaluation errors', {
        level: 'warning',
        extra: { userId: userIds?.[0], errorCount: errors.length, errors },
      })
    }

    console.log(`Evaluated ${evaluatedCount} job/user pairs, ${errors.length} errors`)
    return { evaluatedCount, errors }
  },
})
