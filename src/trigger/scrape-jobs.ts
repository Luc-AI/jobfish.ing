import { schedules } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { scrapeAll, type NormalizedJob } from './lib/apify'
import { evaluateJobsTask } from './evaluate-jobs'

export const scrapeJobsTask = schedules.task({
  id: 'scrape-jobs',
  cron: '0 * * * *', // every hour
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
  run: async () => {
    const supabase = createServiceClient()

    // Fetch all active users' preferences to build Apify input
    const { data: preferences, error: prefsError } = await supabase
      .from('preferences')
      .select('target_roles, locations, excluded_companies')

    if (prefsError) {
      Sentry.captureException(prefsError)
      throw new Error(`Failed to fetch preferences: ${prefsError.message}`)
    }

    if (!preferences || preferences.length === 0) {
      console.log('No user preferences found. Skipping scrape.')
      return { newJobIds: [] }
    }

    // Scrape both actors in parallel using aggregated preferences
    const jobs: NormalizedJob[] = await scrapeAll(preferences)
    console.log(`Scraped ${jobs.length} jobs from Apify`)

    if (jobs.length === 0) {
      return { newJobIds: [] }
    }

    // Upsert into jobs table — ON CONFLICT (url) DO NOTHING handles deduplication
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
    console.log(`Inserted ${newJobIds.length} new jobs`)

    if (newJobIds.length === 0) {
      return { newJobIds: [] }
    }

    // Trigger evaluate-jobs with the new job IDs
    const result = await evaluateJobsTask.triggerAndWait({ jobIds: newJobIds })
    if (!result.ok) {
      Sentry.captureException(new Error(`evaluate-jobs failed: ${result.error}`))
    }

    return { newJobIds }
  },
})
