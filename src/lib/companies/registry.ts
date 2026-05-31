// src/lib/companies/registry.ts
// Shared, idempotent company-registry upsert used by both ingest paths.
import type { createServiceClient } from '@/lib/supabase/service'
import { normalizeCompanyName } from './normalize'

type ServiceClient = ReturnType<typeof createServiceClient>

/** Matches the first_seen_source CHECK constraint on the companies table. */
export type CompanySource = 'jobich' | 'apify_linkedin' | 'apify_career_site'

export interface CompanyObservation {
  name: string
  source: CompanySource
  sampleJobUrl?: string | null
}

export interface NewCompany {
  name: string
  source: CompanySource
  sampleJobUrl: string | null
}

/**
 * Registers each observed company. Existing companies (matched on normalized
 * name) get their last_seen_at bumped; genuinely new ones are inserted.
 * Returns only the newly inserted companies. Idempotent under retries via an
 * upsert on the unique name_normalized.
 *
 * Retry note: the SELECT→insert is not atomic, but the unique constraint plus
 * ignoreDuplicates makes concurrent inserts safe. A retry of an already-
 * successful run finds the companies as "existing" and returns [], so callers
 * must treat the discovery notification as best-effort (sent on first success,
 * not re-sent on retry).
 */
export async function registerCompanies(
  supabase: ServiceClient,
  observations: CompanyObservation[],
): Promise<NewCompany[]> {
  // 1. Normalize + dedupe within the batch (first occurrence wins).
  const byNorm = new Map<string, NewCompany>()
  for (const obs of observations) {
    const normalized = normalizeCompanyName(obs.name)
    if (!normalized) continue
    if (!byNorm.has(normalized)) {
      byNorm.set(normalized, {
        name: obs.name.trim(),
        source: obs.source,
        sampleJobUrl: obs.sampleJobUrl ?? null,
      })
    }
  }
  if (byNorm.size === 0) return []

  const normalizedKeys = [...byNorm.keys()]

  // 2. Which of these already exist?
  const { data: existing, error: selectError } = await supabase
    .from('companies')
    .select('name_normalized')
    .in('name_normalized', normalizedKeys)
  if (selectError) throw new Error(`companies select failed: ${selectError.message}`)

  const existingSet = new Set((existing ?? []).map(r => r.name_normalized))
  const nowIso = new Date().toISOString()

  // 3. Bump last_seen_at for the ones we already know.
  const existingKeys = normalizedKeys.filter(k => existingSet.has(k))
  if (existingKeys.length > 0) {
    const { error: bumpError } = await supabase
      .from('companies')
      .update({ last_seen_at: nowIso })
      .in('name_normalized', existingKeys)
    if (bumpError) throw new Error(`companies last_seen bump failed: ${bumpError.message}`)
  }

  // 4. Insert the new ones.
  const newKeys = normalizedKeys.filter(k => !existingSet.has(k))
  if (newKeys.length === 0) return []

  const rows = newKeys.map(k => {
    const c = byNorm.get(k)!
    return {
      name: c.name,
      name_normalized: k,
      first_seen_source: c.source,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      sample_job_url: c.sampleJobUrl,
    }
  })

  const { error: insertError } = await supabase
    .from('companies')
    .upsert(rows, { onConflict: 'name_normalized', ignoreDuplicates: true })
  if (insertError) throw new Error(`companies insert failed: ${insertError.message}`)

  return newKeys.map(k => byNorm.get(k)!)
}
