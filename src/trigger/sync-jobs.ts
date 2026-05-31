// src/trigger/sync-jobs.ts
import { schedules } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchDelta, normalizeJobichJob } from './lib/jobich'
import { evaluateJobsTask } from './evaluate-jobs'
import { categorizeJobsTask } from './categorize-jobs'
import { registerCompanies, type CompanyObservation } from '@/lib/companies/registry'

export const syncJobsTask = schedules.task({
  id: 'sync-jobs',
  cron: '0 * * * *',
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
  run: async () => {
    const supabase = createServiceClient()

    const syncStateTable = supabase.from('sync_state')

    const { data: syncState } = await syncStateTable
      .select('last_synced_at')
      .eq('key', 'jobich')
      .maybeSingle()

    const since = syncState?.last_synced_at
      ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const delta = await fetchDelta(since)

    if (delta.removed.length > 0) {
      const addedUrls = new Set(delta.added.map(j => j.url))
      const urlsToDeactivate = delta.removed.map(r => r.url).filter(u => !addedUrls.has(u))
      if (urlsToDeactivate.length > 0) {
        const { error } = await supabase
          .from('jobs')
          .update({ is_active: false })
          .in('url', urlsToDeactivate)
        if (error) Sentry.captureException(error)
      }
    }

    let newJobIds: string[] = []

    if (delta.added.length > 0) {
      const normalized = delta.added.map(normalizeJobichJob)

      // Deduplicate by URL within the batch — same URL can appear with different external_ids
      const seenUrls = new Set<string>()
      const deduped = normalized.filter(j => {
        if (seenUrls.has(j.url)) return false
        seenUrls.add(j.url)
        return true
      })

      const { data: inserted, error } = await supabase
        .from('jobs')
        .upsert(
          deduped.map(j => ({
            external_id: j.external_id,
            title: j.title,
            company: j.company,
            location: j.location,
            remote_type: j.remote_type,
            description: j.description,
            url: j.url,
            date_posted: j.date_posted,
            job_updated_at: j.job_updated_at,
            source: j.source,
            industry: j.industry,
            is_active: true,
          })),
          { onConflict: 'url', ignoreDuplicates: false }
        )
        .select('id')

      if (error) {
        throw new Error(`Failed to upsert jobs: ${error.message}`)
      }

      newJobIds = (inserted ?? []).map(j => j.id)

      try {
        // normalizeJobichJob defaults a missing company to 'Unknown'; skip that
        // sentinel so it never pollutes the registry.
        const observations: CompanyObservation[] = deduped
          .filter(j => j.company && j.company !== 'Unknown')
          .map(j => ({ name: j.company, source: 'jobich', sampleJobUrl: j.url }))
        await registerCompanies(supabase, observations)
      } catch (err) {
        Sentry.captureException(err)
      }
    }

    const { error: cursorError } = await syncStateTable
      .upsert({ key: 'jobich', last_synced_at: delta.server_time, updated_at: new Date().toISOString() })
    if (cursorError) throw new Error(`Failed to update sync cursor: ${cursorError.message}`)

    if (newJobIds.length > 0) {
      const catResult = await categorizeJobsTask.triggerAndWait({ jobIds: newJobIds })
      if (!catResult.ok) {
        Sentry.captureException(new Error(`categorize-jobs failed: ${catResult.error}`))
      }

      const result = await evaluateJobsTask.triggerAndWait({ jobIds: newJobIds })
      if (!result.ok) {
        Sentry.captureException(new Error(`evaluate-jobs failed: ${result.error}`))
      }
    }

    console.log(`sync-jobs: +${delta.added.length} added, -${delta.removed.length} removed, ${newJobIds.length} new IDs`)
    return { added: delta.added.length, removed: delta.removed.length, newJobIds }
  },
})
