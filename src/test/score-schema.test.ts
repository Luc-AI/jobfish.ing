import { describe, it, expect } from 'vitest'
import {
  scoreResponseSchema,
  dimensionsSchema,
  detailedReasoningSchema,
} from '@/trigger/lib/score-schema'

const validDimensions = {
  role_fit: 8.0,
  domain_fit: 7.5,
  experience_fit: 8.5,
  location_fit: 6.0,
  upside: 7.0,
}

const validDetailedReasoning = {
  summary: 'Strong overall fit.',
  strengths: ['Good role overlap'],
  concerns: ['Domain ramp-up'],
  red_flags: [],
  recommendation: 'Worth applying.',
  dimension_explanations: {
    role_fit: 'Scope matches well.',
    domain_fit: 'Industry ramp-up required.',
    experience_fit: 'Seniority is aligned.',
    location_fit: 'Location is acceptable.',
    upside: 'Good growth potential.',
  },
}

describe('dimensionsSchema', () => {
  it('accepts valid five-dimension object', () => {
    const result = dimensionsSchema.parse(validDimensions)
    expect(result.role_fit).toBe(8.0)
    expect(result.domain_fit).toBe(7.5)
    expect(result.experience_fit).toBe(8.5)
    expect(result.location_fit).toBe(6.0)
    expect(result.upside).toBe(7.0)
  })

  it('rejects old four-dimension object (missing upside, domain_fit, experience_fit, location_fit)', () => {
    expect(() =>
      dimensionsSchema.parse({
        role_fit: 8,
        company_fit: 7,
        location: 6,
        growth_potential: 7,
      })
    ).toThrow()
  })

  it('rejects a dimension score above 10', () => {
    expect(() =>
      dimensionsSchema.parse({ ...validDimensions, role_fit: 11 })
    ).toThrow()
  })

  it('rejects a dimension score below 0', () => {
    expect(() =>
      dimensionsSchema.parse({ ...validDimensions, upside: -1 })
    ).toThrow()
  })
})

describe('detailedReasoningSchema', () => {
  it('accepts a full valid payload', () => {
    const result = detailedReasoningSchema.parse(validDetailedReasoning)
    expect(result.summary).toBe('Strong overall fit.')
    expect(result.strengths).toHaveLength(1)
    expect(result.red_flags).toHaveLength(0)
  })

  it('rejects missing summary', () => {
    const { summary: _, ...rest } = validDetailedReasoning
    expect(() => detailedReasoningSchema.parse(rest)).toThrow()
  })

  it('rejects missing recommendation', () => {
    const { recommendation: _, ...rest } = validDetailedReasoning
    expect(() => detailedReasoningSchema.parse(rest)).toThrow()
  })

  it('rejects missing dimension_explanations', () => {
    const { dimension_explanations: _, ...rest } = validDetailedReasoning
    expect(() => detailedReasoningSchema.parse(rest)).toThrow()
  })

  it('rejects dimension_explanations with missing key', () => {
    expect(() =>
      detailedReasoningSchema.parse({
        ...validDetailedReasoning,
        dimension_explanations: {
          role_fit: 'ok',
          domain_fit: 'ok',
          // missing experience_fit, location_fit, upside
        },
      })
    ).toThrow()
  })
})

describe('scoreResponseSchema', () => {
  it('parses a valid full response', () => {
    const input = {
      score: 8.5,
      reasoning: 'Strong fit for this role.',
      dimensions: validDimensions,
      detailed_reasoning: validDetailedReasoning,
    }
    const result = scoreResponseSchema.parse(input)
    expect(result.score).toBe(8.5)
    expect(result.reasoning).toBe('Strong fit for this role.')
    expect(result.dimensions.domain_fit).toBe(7.5)
    expect(result.detailed_reasoning.summary).toBe('Strong overall fit.')
  })

  it('rejects score > 10', () => {
    expect(() =>
      scoreResponseSchema.parse({
        score: 11,
        reasoning: 'test',
        dimensions: validDimensions,
        detailed_reasoning: validDetailedReasoning,
      })
    ).toThrow()
  })

  it('rejects score < 0', () => {
    expect(() =>
      scoreResponseSchema.parse({
        score: -1,
        reasoning: 'test',
        dimensions: validDimensions,
        detailed_reasoning: validDetailedReasoning,
      })
    ).toThrow()
  })

  it('rejects missing reasoning', () => {
    expect(() =>
      scoreResponseSchema.parse({
        score: 5,
        dimensions: validDimensions,
        detailed_reasoning: validDetailedReasoning,
      })
    ).toThrow()
  })

  it('rejects missing detailed_reasoning', () => {
    expect(() =>
      scoreResponseSchema.parse({
        score: 5,
        reasoning: 'test',
        dimensions: validDimensions,
      })
    ).toThrow()
  })
})
