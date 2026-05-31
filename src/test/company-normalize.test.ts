// src/test/company-normalize.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeCompanyName } from '@/lib/companies/normalize'

describe('normalizeCompanyName', () => {
  it.each([
    ['Google LLC', 'google'],
    ['Google', 'google'],
    ['Google Switzerland GmbH', 'google switzerland'],
    ['ACME, Inc.', 'acme'],
    ['acme ag', 'acme'],
    ['Foo Co Ltd', 'foo'],
    ['  Spaced   Out   AG ', 'spaced out'],
    ['Zürich Insurance SA', 'zürich insurance'],
  ])('normalizes %j -> %j', (input, expected) => {
    expect(normalizeCompanyName(input)).toBe(expected)
  })

  it('returns empty string for null/undefined/blank', () => {
    expect(normalizeCompanyName(null)).toBe('')
    expect(normalizeCompanyName(undefined)).toBe('')
    expect(normalizeCompanyName('   ')).toBe('')
  })

  it('does not strip a suffix that is the only token', () => {
    expect(normalizeCompanyName('SA')).toBe('sa')
  })

  it('preserves internal digits and letters', () => {
    expect(normalizeCompanyName('3M Company')).toBe('3m')
  })
})
