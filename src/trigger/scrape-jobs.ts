import { schedules, task } from '@trigger.dev/sdk/v3'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { scrapeLinkedIn, scrapeJobsCh, type NormalizedJob } from './lib/apify'
import { evaluateJobsTask } from './evaluate-jobs'

export const scrapeJobsTask = task({
  id: 'scrape-jobs',
  retry: { maxAttempts: 3, minTimeoutInMs: 5000, maxTimeoutInMs: 30000 },
  run: async () => {
    const supabase = createServiceClient()

    // Collect all unique locations and roles from active users to guide scraping
    const { data: preferences } = await supabase
      .from('preferences')
      .select('target_roles, locations')
      .gt('target_roles', '{}')

    const allLocations = [...new Set(
      (preferences ?? []).flatMap(p => p.locations ?? [])
    )].slice(0, 5) // cap to avoid excessive scraping

    const allRoles = [...new Set(
      (preferences ?? []).flatMap(p => p.target_roles ?? [])
    )].slice(0, 10)

    if (allRoles.length === 0) {
      console.log('No active users with preferences. Skipping scrape.')
      return { newJobIds: [] }
    }

    // Scrape from both sources
    const [linkedInJobs, jobsChJobs] = await Promise.allSettled([
      scrapeLinkedIn(allRoles, allLocations[0] ?? 'Switzerland'),
      scrapeJobsCh(allRoles),
    ])

    const rawJobs: NormalizedJob[] = [
      ...(linkedInJobs.status === 'fulfilled' ? linkedInJobs.value : []),
      ...(jobsChJobs.status === 'fulfilled' ? jobsChJobs.value : []),
    ]

    if (linkedInJobs.status === 'rejected') {
      Sentry.captureException(linkedInJobs.reason)
    }
    if (jobsChJobs.status === 'rejected') {
      Sentry.captureException(jobsChJobs.reason)
    }

    console.log(`Scraped ${rawJobs.length} raw jobs`)

    // Deduplicate by URL — upsert, ignore conflicts
    const { data: insertedJobs, error } = await supabase
      .from('jobs')
      .upsert(
        rawJobs.map(j => ({
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

    if (error) {
      Sentry.captureException(error)
      throw new Error(`Failed to insert jobs: ${error.message}`)
    }

    const newJobIds = (insertedJobs ?? []).map(j => j.id)
    console.log(`Inserted ${newJobIds.length} new jobs`)

    if (newJobIds.length > 0) {
      await evaluateJobsTask.trigger({ jobIds: newJobIds })
    }

    return { newJobIds }
  },
})

// Cron: every 6 hours
export const scrapeJobsSchedule = schedules.task({
  id: 'scrape-jobs-schedule',
  cron: '0 */6 * * *',
  run: async () => {
    await scrapeJobsTask.trigger()
  },
})
