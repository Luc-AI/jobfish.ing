// src/test/company-registry.test.ts
import { describe, expect, it, vi } from 'vitest'
import { registerCompanies } from '@/lib/companies/registry'

function makeMockClient({ existing = [] as string[] } = {}) {
  const selectIn = vi.fn(async () => ({
    data: existing.map(name_normalized => ({ name_normalized })),
    error: null,
  }))
  const updateIn = vi.fn(async () => ({ error: null }))
  const upsert = vi.fn(async () => ({ error: null }))
  const from = vi.fn((table: string) => {
    if (table !== 'companies') throw new Error(`Unexpected table: ${table}`)
    return {
      select: () => ({ in: selectIn }),
      update: () => ({ in: updateIn }),
      upsert,
    }
  })
  const client = { from } as unknown as Parameters<typeof registerCompanies>[0]
  return { client, from, selectIn, updateIn, upsert }
}

describe('registerCompanies', () => {
  it('returns [] and makes no calls for empty observations', async () => {
    const m = makeMockClient()
    const result = await registerCompanies(m.client, [])
    expect(result).toEqual([])
    expect(m.from).not.toHaveBeenCalled()
  })

  it('skips observations whose name normalizes to empty', async () => {
    const m = makeMockClient()
    const result = await registerCompanies(m.client, [
      { name: '   ', source: 'jobich' },
    ])
    expect(result).toEqual([])
    expect(m.from).not.toHaveBeenCalled()
  })

  it('inserts companies not already present and returns them', async () => {
    const m = makeMockClient({ existing: [] })
    const result = await registerCompanies(m.client, [
      { name: 'Acme AG', source: 'apify_linkedin', sampleJobUrl: 'https://x/1' },
    ])
    expect(result).toEqual([
      { name: 'Acme AG', source: 'apify_linkedin', sampleJobUrl: 'https://x/1' },
    ])
    expect(m.upsert).toHaveBeenCalledTimes(1)
    const [rows, opts] = m.upsert.mock.calls[0] as unknown as [Record<string, unknown>[], Record<string, unknown>]
    expect(rows[0]).toMatchObject({
      name: 'Acme AG',
      name_normalized: 'acme',
      first_seen_source: 'apify_linkedin',
      sample_job_url: 'https://x/1',
    })
    expect(opts).toMatchObject({ onConflict: 'name_normalized', ignoreDuplicates: true })
  })

  it('dedupes within the batch by normalized name (first wins)', async () => {
    const m = makeMockClient({ existing: [] })
    const result = await registerCompanies(m.client, [
      { name: 'Acme AG', source: 'apify_linkedin', sampleJobUrl: 'https://x/1' },
      { name: 'ACME, Inc.', source: 'apify_career_site', sampleJobUrl: 'https://x/2' },
    ])
    expect(result).toEqual([
      { name: 'Acme AG', source: 'apify_linkedin', sampleJobUrl: 'https://x/1' },
    ])
  })

  it('does not re-insert existing companies, bumps last_seen, returns []', async () => {
    const m = makeMockClient({ existing: ['acme'] })
    const result = await registerCompanies(m.client, [
      { name: 'Acme AG', source: 'apify_linkedin' },
    ])
    expect(result).toEqual([])
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.updateIn).toHaveBeenCalledTimes(1)
  })
})
