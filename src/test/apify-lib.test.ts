// src/test/apify-lib.test.ts
import { describe, expect, it } from 'vitest'
import { firstString, normalizeItem } from '@/trigger/lib/apify'

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
})
