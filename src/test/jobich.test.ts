// src/test/jobich.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  stripHtml,
  parseDate,
  normalizeJobichJob,
  fetchDelta,
  type JobichJob,
} from '@/trigger/lib/jobich'

describe('stripHtml', () => {
  it('strips HTML tags leaving plain text', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world')
  })

  it('collapses multiple spaces', () => {
    expect(stripHtml('<div>  foo  </div>')).toBe('foo')
  })

  it('returns null for null input', () => {
    expect(stripHtml(null)).toBeNull()
  })

  it('returns null for empty string after stripping', () => {
    expect(stripHtml('<br/>')).toBeNull()
  })

  it('returns plain text unchanged', () => {
    expect(stripHtml('plain text')).toBe('plain text')
  })
})

describe('parseDate', () => {
  it('returns YYYY-MM-DD for a valid ISO date string', () => {
    expect(parseDate('2026-05-02')).toBe('2026-05-02')
  })

  it('returns YYYY-MM-DD from a full ISO datetime', () => {
    expect(parseDate('2026-05-20T07:27:22.577Z')).toBe('2026-05-20')
  })

  it('returns null for human-readable strings like "Posted 30+ Days Ago"', () => {
    expect(parseDate('Posted 30+ Days Ago')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(parseDate(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull()
  })
})

describe('normalizeJobichJob', () => {
  const base: JobichJob = {
    id: 'abc-123',
    title: 'Sr. UX Designer',
    company: 'Logitech',
    location: 'Lausanne',
    remote_type: 'Hybrid',
    description: '<p>Great role</p>',
    url: 'https://example.com/job/1',
    posted_at: '2026-05-01',
    updated_at: '2026-05-20T07:14:28.577Z',
    source: 'Workday (Logitech)',
    industry: 'IT & Software',
  }

  it('maps all fields correctly', () => {
    const result = normalizeJobichJob(base)
    expect(result.external_id).toBe('abc-123')
    expect(result.title).toBe('Sr. UX Designer')
    expect(result.company).toBe('Logitech')
    expect(result.location).toBe('Lausanne')
    expect(result.remote_type).toBe('Hybrid')
    expect(result.description).toBe('Great role')
    expect(result.url).toBe('https://example.com/job/1')
    expect(result.date_posted).toBe('2026-05-01')
    expect(result.job_updated_at).toBe('2026-05-20T07:14:28.577Z')
    expect(result.source).toBe('Workday (Logitech)')
    expect(result.industry).toBe('IT & Software')
  })

  it('strips HTML from description', () => {
    const result = normalizeJobichJob({ ...base, description: '<p>Hello <b>world</b></p>' })
    expect(result.description).toBe('Hello world')
  })

  it('sets date_posted to null when posted_at is not a valid date', () => {
    const result = normalizeJobichJob({ ...base, posted_at: 'Posted 30+ Days Ago' })
    expect(result.date_posted).toBeNull()
  })

  it('sets description to null when input is null', () => {
    const result = normalizeJobichJob({ ...base, description: null })
    expect(result.description).toBeNull()
  })

  it('sets location to null when input is null', () => {
    const result = normalizeJobichJob({ ...base, location: null })
    expect(result.location).toBeNull()
  })

  it('sets remote_type to null when input is null', () => {
    const result = normalizeJobichJob({ ...base, remote_type: null })
    expect(result.remote_type).toBeNull()
  })
})

describe('fetchDelta', () => {
  beforeEach(() => {
    process.env.JOBICH_API_KEY = 'test-key'
  })

  afterEach(() => {
    delete process.env.JOBICH_API_KEY
    vi.unstubAllGlobals()
  })

  it('calls the correct endpoint with x-api-key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ added: [], updated: [], removed: [], server_time: '2026-05-20T00:00:00Z' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchDelta('2026-05-19T00:00:00Z')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/jobs/changes?since='),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      })
    )
  })

  it('throws when JOBICH_API_KEY is not set', async () => {
    delete process.env.JOBICH_API_KEY
    await expect(fetchDelta('2026-05-19T00:00:00Z')).rejects.toThrow('JOBICH_API_KEY is not set')
  })

  it('throws on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded'),
    }))

    await expect(fetchDelta('2026-05-19T00:00:00Z')).rejects.toThrow('Jobich API error 429')
  })

  it('returns parsed delta response', async () => {
    const mockResponse = {
      added: [{ id: 'job-1', title: 'Engineer', company: 'Acme', location: 'Zurich',
        remote_type: 'Hybrid', description: null, url: 'https://example.com/1',
        posted_at: '2026-05-20', updated_at: '2026-05-20T00:00:00Z', source: 'LinkedIn', industry: 'IT & Software' }],
      updated: [],
      removed: [{ id: 'old-job', url: 'https://example.com/old' }],
      server_time: '2026-05-20T12:00:00Z',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }))

    const result = await fetchDelta('2026-05-19T00:00:00Z')
    expect(result.added).toHaveLength(1)
    expect(result.removed).toHaveLength(1)
    expect(result.server_time).toBe('2026-05-20T12:00:00Z')
  })
})
