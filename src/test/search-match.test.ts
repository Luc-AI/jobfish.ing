import { describe, it, expect } from 'vitest'
import {
  parseTokens,
  matchesAllTokens,
  type Searchable,
} from '@/lib/search/match'

describe('parseTokens', () => {
  it('returns empty array for empty / whitespace-only input', () => {
    expect(parseTokens('')).toEqual([])
    expect(parseTokens('   ')).toEqual([])
  })

  it('lowercases tokens and splits on whitespace', () => {
    expect(parseTokens('Stripe Berlin')).toEqual(['stripe', 'berlin'])
    expect(parseTokens('  Stripe   Berlin  ')).toEqual(['stripe', 'berlin'])
  })

  it('drops tokens shorter than 2 characters', () => {
    expect(parseTokens('a stripe')).toEqual(['stripe'])
    expect(parseTokens('go a b')).toEqual(['go'])
  })

  it('caps tokens at 6', () => {
    expect(parseTokens('one two three four five six seven eight')).toEqual([
      'one', 'two', 'three', 'four', 'five', 'six',
    ])
  })
})

describe('matchesAllTokens', () => {
  const row: Searchable = {
    title: 'Senior Software Engineer',
    company: 'Stripe',
    location: 'Berlin, Germany',
    categories: ['payments', 'fintech'],
  }

  it('returns false for empty tokens', () => {
    expect(matchesAllTokens(row, [])).toBe(false)
  })

  it('matches single token in any field', () => {
    expect(matchesAllTokens(row, ['stripe'])).toBe(true)
    expect(matchesAllTokens(row, ['engineer'])).toBe(true)
    expect(matchesAllTokens(row, ['berlin'])).toBe(true)
    expect(matchesAllTokens(row, ['payments'])).toBe(true)
  })

  it('requires every token to match (AND semantics across fields)', () => {
    expect(matchesAllTokens(row, ['stripe', 'berlin'])).toBe(true)
    expect(matchesAllTokens(row, ['stripe', 'payments', 'engineer'])).toBe(true)
    expect(matchesAllTokens(row, ['stripe', 'tokyo'])).toBe(false)
  })

  it('is case-insensitive and substring-based', () => {
    expect(matchesAllTokens(row, ['STRIPE'])).toBe(true)
    expect(matchesAllTokens(row, ['engin'])).toBe(true) // substring of "engineer"
  })

  it('handles null location and empty/null categories', () => {
    const row2: Searchable = {
      title: 'Engineer',
      company: 'Acme',
      location: null,
      categories: null,
    }
    expect(matchesAllTokens(row2, ['acme'])).toBe(true)
    expect(matchesAllTokens(row2, ['payments'])).toBe(false)

    const row3: Searchable = { ...row2, categories: [] }
    expect(matchesAllTokens(row3, ['payments'])).toBe(false)
  })
})
