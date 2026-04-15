import { scoreResponseSchema, type ScoreResponse } from './score-schema'
import type { RoleSelection } from '@/lib/supabase/types'

interface EvaluationInput {
  jobTitle: string
  jobCompany: string
  jobDescription: string
  cvText: string
  targetRoles: RoleSelection[]
  industries: string[]
  locations: string[]
  excludedCompanies: string[]
}

export function buildEvaluationPrompt(input: EvaluationInput): string {
  const {
    jobTitle,
    jobCompany,
    jobDescription,
    cvText,
    targetRoles,
    industries,
    locations,
    excludedCompanies,
  } = input

  const roleNames = targetRoles.length > 0
    ? targetRoles.map((r) => r.role).join(', ')
    : 'Not specified'

  const yoeHint = targetRoles.length > 0
    ? targetRoles
        .map((r) => `${r.role}: ${r.yoe === 0 ? 'any' : `${r.yoe}+`} yrs`)
        .join(', ')
    : 'Not specified'

  return `You are a career advisor evaluating how well a job matches a candidate's profile.

## Candidate CV
${cvText}

## Candidate Preferences
- Target roles: ${roleNames}
- Years of experience per role: ${yoeHint}
- Preferred industries: ${industries.length > 0 ? industries.join(', ') : 'Not specified'}
- Preferred locations: ${locations.length > 0 ? locations.join(', ') : 'Not specified'}
- Excluded companies: ${excludedCompanies.length > 0 ? excludedCompanies.join(', ') : 'None'}

## Job Posting
Title: ${jobTitle}
Company: ${jobCompany}
Description:
${jobDescription}

## Instructions
Score how well this job matches the candidate on a scale of 0.0–10.0.
Be honest and critical — scores above 8.0 should be rare and genuinely exceptional matches.

Respond with ONLY valid JSON in this exact format:
{
  "score": <number 0.0-10.0>,
  "reasoning": "<2-3 sentence plain-language explanation for the candidate>",
  "dimensions": {
    "role_fit": <number 0.0-10.0>,
    "domain_fit": <number 0.0-10.0>,
    "experience_fit": <number 0.0-10.0>,
    "location_fit": <number 0.0-10.0>,
    "upside": <number 0.0-10.0>
  },
  "detailed_reasoning": {
    "summary": "<1-2 sentence overall assessment>",
    "strengths": ["<strength 1>", "<strength 2>"],
    "concerns": ["<concern 1>"],
    "red_flags": [],
    "recommendation": "<one sentence action recommendation>",
    "dimension_explanations": {
      "role_fit": "<one sentence>",
      "domain_fit": "<one sentence>",
      "experience_fit": "<one sentence>",
      "location_fit": "<one sentence>",
      "upside": "<one sentence>"
    }
  }
}`
}

export function parseEvaluationResponse(raw: string): ScoreResponse {
  // Extract JSON from a markdown code block if present, otherwise use the raw string
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : raw.trim()

  const parsed = JSON.parse(candidate)
  return scoreResponseSchema.parse(parsed)
}

export async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set')
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3-5-haiku',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`OpenRouter returned no content. Response: ${JSON.stringify(data)}`)
  }
  return content
}
