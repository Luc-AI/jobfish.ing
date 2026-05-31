// src/test/apify-lib.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { firstString, normalizeItem, runActor } from '@/trigger/lib/apify'

describe('firstString', () => {
  it('returns the first non-empty string match by candidate key order', () => {
    const obj = { a: '', b: 'hello', c: 'world' }
    expect(firstString(obj, ['a', 'b', 'c'])).toBe('hello')
  })

  it('skips missing keys', () => {
    expect(firstString({ b: 'hi' }, ['a', 'b'])).toBe('hi')
  })

  it('flattens string arrays by joining with ", "', () => {
    expect(firstString({ k: ['Zurich', 'Bern'] }, ['k'])).toBe('Zurich, Bern')
  })

  it('filters non-string entries out of arrays', () => {
    expect(firstString({ k: ['Zurich', 42, null, 'Bern'] }, ['k'])).toBe('Zurich, Bern')
  })

  it('returns null when no key has a usable value', () => {
    expect(firstString({ a: null, b: '', c: [] }, ['a', 'b', 'c'])).toBe(null)
  })

  it('returns null for an empty object', () => {
    expect(firstString({}, ['a', 'b'])).toBe(null)
  })
})

describe('normalizeItem', () => {
  it('normalizes a LinkedIn-shaped item', () => {
    const item = {
      title: 'Product Manager',
      organization: 'Acme AG',
      locations_derived: ['Zurich, Switzerland'],
      url: 'https://linkedin.com/jobs/123',
      description_text: 'long description',
      extra: 'ignored',
    }
    const row = normalizeItem('linkedin', item, '2026-05-28T04:00:00.000Z')
    expect(row).toEqual({
      source: 'linkedin',
      fetched_at: '2026-05-28T04:00:00.000Z',
      title: 'Product Manager',
      company: 'Acme AG',
      location: 'Zurich, Switzerland',
      url: 'https://linkedin.com/jobs/123',
      raw: item,
    })
  })

  it('normalizes a career-site-shaped item with fallback keys', () => {
    const item = {
      job_title: 'Product Owner',
      company_name: 'Foo GmbH',
      location: 'Zurich',
      job_url: 'https://careers.foo.com/abc',
    }
    const row = normalizeItem('career_site', item, '2026-05-28T04:00:00.000Z')
    expect(row.title).toBe('Product Owner')
    expect(row.company).toBe('Foo GmbH')
    expect(row.location).toBe('Zurich')
    expect(row.url).toBe('https://careers.foo.com/abc')
    expect(row.source).toBe('career_site')
  })

  it('returns null fields when extraction misses but always keeps raw', () => {
    const item = { weird_unknown_field: 'x' }
    const row = normalizeItem('linkedin', item, '2026-05-28T04:00:00.000Z')
    expect(row.title).toBe(null)
    expect(row.company).toBe(null)
    expect(row.location).toBe(null)
    expect(row.url).toBe(null)
    expect(row.raw).toEqual(item)
  })

  it('falls back to external_apply_url when url is missing', () => {
    const item = {
      title: 'X',
      organization: 'Y',
      external_apply_url: 'https://apply.example.com/x',
    }
    const row = normalizeItem('linkedin', item, '2026-05-28T04:00:00.000Z')
    expect(row.url).toBe('https://apply.example.com/x')
  })

  it('normalizes a jobs.ch-shaped item (source_url → url)', () => {
    const item = {
      title: 'Product Manager',
      company: 'Clienia Schloessli AG',
      location: 'Zürich',
      source_url: 'https://www.jobs.ch/de/stellenangebote/detail/abc-123/',
      canton: 'ZH',
      source_platform: 'jobs.ch',
    }
    const row = normalizeItem('jobs_ch', item, '2026-05-28T04:00:00.000Z')
    expect(row.source).toBe('jobs_ch')
    expect(row.title).toBe('Product Manager')
    expect(row.company).toBe('Clienia Schloessli AG')
    expect(row.location).toBe('Zürich')
    expect(row.url).toBe('https://www.jobs.ch/de/stellenangebote/detail/abc-123/')
    expect(row.raw).toEqual(item)
  })

  it('falls back to apply_url for jobs.ch when source_url is missing', () => {
    const item = {
      title: 'Product Owner',
      company: 'Foo AG',
      apply_url: 'https://apply.example.ch/po',
    }
    const row = normalizeItem('jobs_ch', item, '2026-05-28T04:00:00.000Z')
    expect(row.url).toBe('https://apply.example.ch/po')
  })
})

describe('runActor', () => {
  let savedToken: string | undefined

  beforeEach(() => {
    savedToken = process.env.APIFY_API_TOKEN
  })

  afterEach(() => {
    if (savedToken === undefined) {
      delete process.env.APIFY_API_TOKEN
    } else {
      process.env.APIFY_API_TOKEN = savedToken
    }
    vi.unstubAllGlobals()
  })

  it('throws when APIFY_API_TOKEN is not set', async () => {
    delete process.env.APIFY_API_TOKEN
    await expect(runActor('any-slug', {})).rejects.toThrow('APIFY_API_TOKEN is not set')
  })

  it('throws on non-2xx response', async () => {
    process.env.APIFY_API_TOKEN = 'test-token'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'upstream boom',
    })))
    await expect(runActor('my-actor-slug', {})).rejects.toThrow(/my-actor-slug/)
    await expect(runActor('my-actor-slug', {})).rejects.toThrow(/500/)
    await expect(runActor('my-actor-slug', {})).rejects.toThrow(/upstream boom/)
  })

  it('throws when the response body is not an array', async () => {
    process.env.APIFY_API_TOKEN = 'test-token'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ not: 'an array' }),
    })))
    await expect(runActor('my-actor-slug', {})).rejects.toThrow(/non-array response/)
  })

  it('reads the token from a custom env var when tokenEnvVar is given', async () => {
    delete process.env.APIFY_API_TOKEN
    process.env.APIFY_API_TOKEN_JOBS_CH = 'jobs-ch-token'
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      capturedUrl = url
      return { ok: true, json: async () => [] }
    }))
    await runActor('jobs-ch-slug', {}, 'APIFY_API_TOKEN_JOBS_CH')
    expect(capturedUrl).toContain('token=jobs-ch-token')
    delete process.env.APIFY_API_TOKEN_JOBS_CH
  })

  it('error message names the missing token env var', async () => {
    delete process.env.APIFY_API_TOKEN_JOBS_CH
    await expect(runActor('jobs-ch-slug', {}, 'APIFY_API_TOKEN_JOBS_CH')).rejects.toThrow(
      'APIFY_API_TOKEN_JOBS_CH is not set',
    )
  })
})
