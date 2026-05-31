// src/trigger/backfill-companies.ts
// One-off seed of the companies registry from existing jobs.company values.
// Trigger manually from the dashboard. Idempotent (upsert ignores duplicates).
import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { registerCompanies, type CompanyObservation } from '@/lib/companies/registry'

export const backfillCompaniesTask = task({
  id: 'backfill-companies',
  maxDuration: 600,
  run: async () => {
    const supabase = createServiceClient()
    const pageSize = 1000
    // Keyset pagination on the id PK: advancing by the last id seen (not an
    // offset) means concurrent sync-jobs inserts can't shift the window and
    // skip existing rows mid-backfill.
    let lastId = ''
    let scanned = 0
    let inserted = 0

    for (;;) {
      let query = supabase
        .from('jobs')
        .select('id, company, url')
        .not('company', 'is', null)
        .order('id', { ascending: true })
        .limit(pageSize)
      if (lastId) query = query.gt('id', lastId)
      const { data, error } = await query
      if (error) throw new Error(`backfill-companies select failed: ${error.message}`)
      if (!data || data.length === 0) break

      // normalizeJobichJob defaults a missing company to 'Unknown'; skip that
      // sentinel so it never pollutes the registry.
      const observations: CompanyObservation[] = data
        .filter(r => r.company && r.company !== 'Unknown')
        .map(r => ({ name: r.company as string, source: 'jobich', sampleJobUrl: r.url }))
      const newOnes = await registerCompanies(supabase, observations)

      scanned += data.length
      inserted += newOnes.length
      lastId = data[data.length - 1].id
      if (data.length < pageSize) break
    }

    console.log(`backfill-companies: scanned ${scanned} jobs, inserted ${inserted} companies`)
    await Sentry.flush(2000)
    return { scanned, inserted }
  },
})
