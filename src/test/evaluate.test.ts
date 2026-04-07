import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildEvaluationPrompt, parseEvaluationResponse } from '@/trigger/lib/evaluate'

describe('buildEvaluationPrompt', () => {
  it('includes job title in the prompt', () => {
    const prompt = buildEvaluationPrompt({
      jobTitle: 'Head of Product',
      jobCompany: 'Acme Corp',
      jobDescription: 'We are looking for...',
      cvText: 'My background includes...',
      targetRoles: ['Product Manager'],
      industries: ['Fintech'],
      locations: ['Zurich'],
      excludedCompanies: [],
    })
    expect(prompt).toContain('Head of Product')
  })

  it('includes CV text in the prompt', () => {
    const prompt = buildEvaluationPrompt({
      jobTitle: 'Head of Product',
      jobCompany: 'Acme Corp',
      jobDescription: 'We are looking for...',
      cvText: 'My unique background',
      targetRoles: [],
      industries: [],
      locations: [],
      excludedCompanies: [],
    })
    expect(prompt).toContain('My unique background')
  })
})

describe('parseEvaluationResponse', () => {
  it('parses valid JSON response', () => {
    const raw = JSON.stringify({
      score: 8.5,
      reasoning: 'Great match.',
      dimensions: { role_fit: 9, company_fit: 8, location: 9, growth_potential: 8 },
    })
    const result = parseEvaluationResponse(raw)
    expect(result.score).toBe(8.5)
    expect(result.reasoning).toBe('Great match.')
  })

  it('parses JSON embedded in markdown code block', () => {
    const raw = '```json\n{"score":7.0,"reasoning":"Good.","dimensions":{"role_fit":7,"company_fit":7,"location":7,"growth_potential":7}}\n```'
    const result = parseEvaluationResponse(raw)
    expect(result.score).toBe(7.0)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseEvaluationResponse('not json')).toThrow()
  })
})
