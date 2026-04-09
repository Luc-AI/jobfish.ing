import { describe, it, expect } from 'vitest'
import { scoreResponseSchema } from '@/trigger/lib/score-schema'

describe('scoreResponseSchema', () => {
  it('parses a valid score response', () => {
    const input = {
      score: 8.5,
      reasoning: 'Strong fit for this role.',
      dimensions: {
        role_fit: 9.0,
        company_fit: 8.0,
        location: 9.0,
        growth_potential: 8.0,
      },
    }
    const result = scoreResponseSchema.parse(input)
    expect(result.score).toBe(8.5)
    expect(result.reasoning).toBe('Strong fit for this role.')
  })

  it('rejects score > 10', () => {
    expect(() =>
      scoreResponseSchema.parse({
        score: 11,
        reasoning: 'test',
        dimensions: { role_fit: 10, company_fit: 10, location: 10, growth_potential: 10 },
      })
    ).toThrow()
  })

  it('rejects score < 0', () => {
    expect(() =>
      scoreResponseSchema.parse({
        score: -1,
        reasoning: 'test',
        dimensions: { role_fit: 0, company_fit: 0, location: 0, growth_potential: 0 },
      })
    ).toThrow()
  })

  it('rejects missing reasoning', () => {
    expect(() =>
      scoreResponseSchema.parse({
        score: 5,
        dimensions: { role_fit: 5, company_fit: 5, location: 5, growth_potential: 5 },
      })
    ).toThrow()
  })
})
