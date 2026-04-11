import { describe, it, expect } from 'vitest'
import { buildEvaluationPrompt, parseEvaluationResponse } from '@/trigger/lib/evaluate'

const baseInput = {
  jobTitle: 'Head of Product',
  jobCompany: 'Acme Corp',
  jobDescription: 'We are looking for...',
  cvText: 'My background includes...',
  targetRoles: ['Product Manager'],
  industries: ['Fintech'],
  locations: ['Zurich'],
  excludedCompanies: [],
}

const validResponse = {
  score: 8.5,
  reasoning: 'Great match.',
  dimensions: {
    role_fit: 9,
    domain_fit: 8,
    experience_fit: 9,
    location_fit: 7,
    upside: 8,
  },
  detailed_reasoning: {
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
  },
}

describe('buildEvaluationPrompt', () => {
  it('includes job title in the prompt', () => {
    expect(buildEvaluationPrompt(baseInput)).toContain('Head of Product')
  })

  it('includes CV text in the prompt', () => {
    expect(buildEvaluationPrompt({ ...baseInput, cvText: 'My unique background' }))
      .toContain('My unique background')
  })

  it('includes all five new dimension names', () => {
    const prompt = buildEvaluationPrompt(baseInput)
    expect(prompt).toContain('role_fit')
    expect(prompt).toContain('domain_fit')
    expect(prompt).toContain('experience_fit')
    expect(prompt).toContain('location_fit')
    expect(prompt).toContain('upside')
  })

  it('includes detailed_reasoning in the prompt', () => {
    expect(buildEvaluationPrompt(baseInput)).toContain('detailed_reasoning')
  })

  it('does not include old dimension names', () => {
    const prompt = buildEvaluationPrompt(baseInput)
    expect(prompt).not.toContain('company_fit')
    expect(prompt).not.toContain('growth_potential')
  })
})

describe('parseEvaluationResponse', () => {
  it('parses a valid full JSON response', () => {
    const result = parseEvaluationResponse(JSON.stringify(validResponse))
    expect(result.score).toBe(8.5)
    expect(result.reasoning).toBe('Great match.')
    expect(result.dimensions.domain_fit).toBe(8)
    expect(result.detailed_reasoning.summary).toBe('Strong overall fit.')
  })

  it('parses JSON embedded in a markdown code block', () => {
    const raw = '```json\n' + JSON.stringify(validResponse) + '\n```'
    const result = parseEvaluationResponse(raw)
    expect(result.score).toBe(8.5)
  })

  it('parses JSON with a leading newline before the code block', () => {
    const raw = '\n```json\n' + JSON.stringify(validResponse) + '\n```'
    const result = parseEvaluationResponse(raw)
    expect(result.score).toBe(8.5)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseEvaluationResponse('not json')).toThrow()
  })

  it('throws when detailed_reasoning is missing', () => {
    const { detailed_reasoning: _, ...without } = validResponse
    expect(() => parseEvaluationResponse(JSON.stringify(without))).toThrow()
  })

  it('throws when dimensions use old keys', () => {
    const bad = {
      ...validResponse,
      dimensions: { role_fit: 8, company_fit: 7, location: 6, growth_potential: 7 },
    }
    expect(() => parseEvaluationResponse(JSON.stringify(bad))).toThrow()
  })

  it('parses JSON when LLM adds prose before the code block', () => {
    const raw = 'Here is the evaluation:\n```json\n' + JSON.stringify(validResponse) + '\n```'
    const result = parseEvaluationResponse(raw)
    expect(result.score).toBe(8.5)
  })

  it('parses JSON when LLM adds prose after the code block', () => {
    const raw = '```json\n' + JSON.stringify(validResponse) + '\n```\nHope this helps!'
    const result = parseEvaluationResponse(raw)
    expect(result.score).toBe(8.5)
  })

  it('parses JSON from a plain fence without json keyword', () => {
    const raw = '```\n' + JSON.stringify(validResponse) + '\n```'
    const result = parseEvaluationResponse(raw)
    expect(result.score).toBe(8.5)
  })
})
