import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { buildEvaluationPrompt, callOpenRouter, parseEvaluationResponse } from './lib/evaluate'

interface EvaluateJobsPayload {
  jobIds: string[]
  /** If provided, only evaluate for these users (used for new-user backfill) */
  userIds?: string[]
}

export const evaluateJobsTask = task({
  id: 'evaluate-jobs',
  retry: { maxAttempts: 2 },
  run: async ({ jobIds, userIds }: EvaluateJobsPayload) => {
    const supabase = createServiceClient()

    // Fetch the new jobs
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, title, company, location, description')
      .in('id', jobIds)

    if (jobsError || !jobs?.length) {
      console.log('No jobs to evaluate')
      return
    }

    // Fetch active users with complete profiles (optionally scoped to specific users)
    let profilesQuery = supabase
      .from('profiles')
      .select('id, cv_text')
      .eq('onboarding_completed', true)
      .not('cv_text', 'is', null)

    if (userIds && userIds.length > 0) {
      profilesQuery = profilesQuery.in('id', userIds)
    }

    const { data: profiles } = await profilesQuery

    if (!profiles?.length) {
      console.log('No active users to evaluate for')
      return
    }

    // Fetch preferences for those users
    const profileUserIds = profiles.map((p) => p.id)
    const { data: prefsRows } = await supabase
      .from('preferences')
      .select('user_id, target_roles, industries, locations, excluded_companies')
      .in('user_id', profileUserIds)

    const prefsMap = new Map(
      (prefsRows ?? []).map((p) => [p.user_id, p])
    )

    let evaluatedCount = 0

    for (const user of profiles) {
      const prefs = prefsMap.get(user.id)

      for (const job of jobs) {
        try {
          const prompt = buildEvaluationPrompt({
            jobTitle: job.title,
            jobCompany: job.company,
            jobDescription: job.description ?? '',
            cvText: user.cv_text ?? '',
            targetRoles: prefs?.target_roles ?? [],
            industries: prefs?.industries ?? [],
            locations: prefs?.locations ?? [],
            excludedCompanies: prefs?.excluded_companies ?? [],
          })

          const rawResponse = await callOpenRouter(prompt)
          const { score, reasoning, dimensions, detailed_reasoning } = parseEvaluationResponse(rawResponse)

          const { data: evaluation } = await supabase
            .from('job_evaluations')
            .insert({
              job_id: job.id,
              user_id: user.id,
              score,
              reasoning,
              dimensions,
              detailed_reasoning,
            })
            .select('id')
            .single()

          if (evaluation) {
            evaluatedCount++
          }
        } catch (err) {
          Sentry.captureException(err, {
            extra: { jobId: job.id, userId: user.id },
          })
          console.error(`Evaluation failed for job ${job.id} / user ${user.id}:`, err)
          // Continue with next job/user pair — don't abort the batch
        }
      }
    }

    console.log(`Evaluated ${evaluatedCount} job/user pairs`)
    return { evaluatedCount }
  },
})
