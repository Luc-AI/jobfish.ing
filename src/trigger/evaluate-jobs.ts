import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { buildEvaluationPrompt, callOpenRouter, parseEvaluationResponse } from './lib/evaluate'
import { notifyUsersTask } from './notify-users'

interface EvaluateJobsPayload {
  jobIds: string[]
}

export const evaluateJobsTask = task({
  id: 'evaluate-jobs',
  retry: { maxAttempts: 2 },
  run: async ({ jobIds }: EvaluateJobsPayload) => {
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

    // Fetch all active users with complete profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, cv_text')
      .eq('onboarding_completed', true)
      .not('cv_text', 'is', null)

    if (!profiles?.length) {
      console.log('No active users to evaluate for')
      return
    }

    // Fetch preferences for those users
    const userIds = profiles.map((p) => p.id)
    const { data: prefsRows } = await supabase
      .from('preferences')
      .select('user_id, target_roles, industries, locations, excluded_companies')
      .in('user_id', userIds)

    const prefsMap = new Map(
      (prefsRows ?? []).map((p) => [p.user_id, p])
    )

    let evaluatedCount = 0
    const evaluationIds: string[] = []

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
          const { score, reasoning, dimensions } = parseEvaluationResponse(rawResponse)

          const { data: evaluation } = await supabase
            .from('job_evaluations')
            .insert({
              job_id: job.id,
              user_id: user.id,
              score,
              reasoning,
              dimensions,
            })
            .select('id')
            .single()

          if (evaluation) {
            evaluationIds.push(evaluation.id)
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

    if (evaluationIds.length > 0) {
      await notifyUsersTask.trigger({ evaluationIds })
    }
  },
})
