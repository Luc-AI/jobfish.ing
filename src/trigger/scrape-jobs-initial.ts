import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { scrapeAll } from './lib/apify'
import { evaluateJobsTask } from './evaluate-jobs'

export const scrapeJobsInitialTask = task({
  id: 'scrape-jobs-initial',
  retry: { maxAttempts: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
  run: async ({ userId }: { userId: string }) => {
    const supabase = createServiceClient()

    const { data: prefs, error } = await supabase
      .from('preferences')
      .select('target_roles, locations, excluded_companies')
      .eq('user_id', userId)
      .single()

    if (error || !prefs) {
      throw new Error(`Failed to fetch preferences for user ${userId}: ${error?.message}`)
    }

    const preferences = [
      {
        target_roles: prefs.target_roles ?? [],
        locations: prefs.locations ?? [],
        excluded_companies: prefs.excluded_companies ?? [],
      },
    ]

    const jobs = await scrapeAll(preferences, '7d')
    console.log(`Initial scrape: ${jobs.length} jobs for user ${userId}`)

    if (jobs.length === 0) return { newJobIds: [] }

    const { data: insertedJobs, error: insertError } = await supabase
      .from('jobs')
      .upsert(
        jobs.map(j => ({
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
          source: j.source,
          description: j.description,
        })),
        { onConflict: 'url', ignoreDuplicates: true }
      )
      .select('id')

    if (insertError) {
      Sentry.captureException(insertError)
      throw new Error(`Failed to upsert jobs: ${insertError.message}`)
    }

    const newJobIds = (insertedJobs ?? []).map(j => j.id)
    if (newJobIds.length === 0) return { newJobIds: [] }

    const result = await evaluateJobsTask.triggerAndWait({ jobIds: newJobIds })
    if (!result.ok) {
      Sentry.captureException(new Error(`evaluate-jobs failed: ${result.error}`))
    }

    return { newJobIds }
  },
})
