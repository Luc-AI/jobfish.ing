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

  it('chunks the existence .in() query for large batches (URL-length guard)', async () => {
    const m = makeMockClient({ existing: [] })
    // 250 distinct names -> ceil(250 / 100) = 3 select chunks.
    const observations = Array.from({ length: 250 }, (_, i) => ({
      name: `Company ${i}`,
      source: 'jobich' as const,
    }))
    const result = await registerCompanies(m.client, observations)

    expect(m.selectIn).toHaveBeenCalledTimes(3)
    // Every chunked select stays within the chunk size. The mock receives
    // .in(column, values), so the values array is the second argument.
    for (const call of m.selectIn.mock.calls) {
      const values = (call as unknown as unknown[])[1] as string[]
      expect(values.length).toBeLessThanOrEqual(100)
    }
    // upsert is body-based, so it is a single call for all new rows.
    expect(m.upsert).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(250)
  })
})
