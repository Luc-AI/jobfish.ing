// src/trigger/sync-jobs.ts
import { schedules } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchDelta, normalizeJobichJob } from './lib/jobich'
import { evaluateJobsTask } from './evaluate-jobs'

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
      const { error } = await supabase
        .from('jobs')
        .update({ is_active: false })
        .in('external_id', delta.removed.map(r => r.id))
      if (error) Sentry.captureException(error)
    }

    let newJobIds: string[] = []

    if (delta.added.length > 0) {
      const normalized = delta.added.map(normalizeJobichJob)
      const { data: inserted, error } = await supabase
        .from('jobs')
        .upsert(
          normalized.map(j => ({
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
          { onConflict: 'external_id', ignoreDuplicates: false }
        )
        .select('id')

      if (error) {
        throw new Error(`Failed to upsert jobs: ${error.message}`)
      }

      newJobIds = (inserted ?? []).map(j => j.id)
    }

    await syncStateTable
      .upsert({ key: 'jobich', last_synced_at: delta.server_time, updated_at: new Date().toISOString() })

    if (newJobIds.length > 0) {
      const result = await evaluateJobsTask.triggerAndWait({ jobIds: newJobIds })
      if (!result.ok) {
        Sentry.captureException(new Error(`evaluate-jobs failed: ${result.error}`))
      }
    }

    console.log(`sync-jobs: +${delta.added.length} added, -${delta.removed.length} removed, ${newJobIds.length} new IDs`)
    return { added: delta.added.length, removed: delta.removed.length, newJobIds }
  },
})
