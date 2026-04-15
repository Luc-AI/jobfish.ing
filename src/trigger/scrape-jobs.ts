import { schedules } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { scrapeAll, type NormalizedJob } from './lib/apify'
import type { Json, RoleSelection } from '@/lib/supabase/types'
import { evaluateJobsTask } from './evaluate-jobs'

export const scrapeJobsTask = schedules.task({
  id: 'scrape-jobs',
  cron: '0 * * * *', // every hour
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
  run: async () => {
    const supabase = createServiceClient()

    // Fetch preferences only for users who completed onboarding
    const { data: rawPrefs, error: prefsError } = await supabase
      .from('preferences')
      .select(`
        target_roles,
        locations,
        excluded_companies,
        profiles!inner ( onboarding_completed )
      `)
      .eq('profiles.onboarding_completed', true)

    if (prefsError) {
      Sentry.captureException(prefsError)
      throw new Error(`Failed to fetch preferences: ${prefsError.message}`)
    }

    const preferences = ((rawPrefs ?? []) as Array<{
      target_roles: RoleSelection[] | null
      locations: string[] | null
      excluded_companies: string[] | null
    }>).map(p => ({
      target_roles: p.target_roles ?? [],
      locations: p.locations ?? [],
      excluded_companies: p.excluded_companies ?? [],
    }))

    if (preferences.length === 0) {
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
          date_posted: j.date_posted,
          employment_type: j.employment_type,
          work_arrangement: j.work_arrangement,
          experience_level: j.experience_level,
          job_language: j.job_language,
          working_hours: j.working_hours,
          source_domain: j.source_domain,
          detail_facts: j.detail_facts as Json | null,
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
      // No new jobs — but check if any users need a backfill
      await backfillNewUsers(supabase)
      return { newJobIds: [] }
    }

    // Trigger evaluate-jobs with the new job IDs (for all active users)
    const result = await evaluateJobsTask.triggerAndWait({ jobIds: newJobIds })
    if (!result.ok) {
      Sentry.captureException(new Error(`evaluate-jobs failed: ${result.error}`))
    }

    // Also backfill any users who completed onboarding but have no evaluations yet
    await backfillNewUsers(supabase, newJobIds)

    return { newJobIds }
  },
})

async function backfillNewUsers(
  supabase: ReturnType<typeof createServiceClient>,
  excludeJobIds: string[] = []
) {
  // Find users with onboarding done and cv_text but zero evaluations
  const { data: newUsers } = await supabase
    .from('profiles')
    .select('id')
    .eq('onboarding_completed', true)
    .not('cv_text', 'is', null)

  if (!newUsers?.length) return

  const allUserIds = newUsers.map(u => u.id)

  // Among those, find which ones have no evaluations at all
  const { data: evaluated } = await supabase
    .from('job_evaluations')
    .select('user_id')
    .in('user_id', allUserIds)

  const evaluatedUserIds = new Set((evaluated ?? []).map(e => e.user_id))
  const unevaluatedUserIds = allUserIds.filter(id => !evaluatedUserIds.has(id))

  if (unevaluatedUserIds.length === 0) return

  console.log(`Backfilling ${unevaluatedUserIds.length} new user(s) against existing jobs`)

  // Fetch the 100 most recently scraped jobs (excluding ones just evaluated above)
  let jobsQuery = supabase
    .from('jobs')
    .select('id')
    .order('scraped_at', { ascending: false })
    .limit(100)

  if (excludeJobIds.length > 0) {
    jobsQuery = jobsQuery.not('id', 'in', `(${excludeJobIds.join(',')})`)
  }

  const { data: existingJobs } = await jobsQuery
  const backfillJobIds = (existingJobs ?? []).map(j => j.id)

  if (backfillJobIds.length === 0) return

  const backfillResult = await evaluateJobsTask.triggerAndWait({
    jobIds: backfillJobIds,
    userIds: unevaluatedUserIds,
  })

  if (!backfillResult.ok) {
    Sentry.captureException(new Error(`evaluate-jobs backfill failed: ${backfillResult.error}`))
  }
}
