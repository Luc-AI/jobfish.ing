import { scoreResponseSchema, type ScoreResponse } from './score-schema'

interface EvaluationInput {
  jobTitle: string
  jobCompany: string
  jobDescription: string
  cvText: string
  targetRoles: string[]
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

  return `You are a career advisor evaluating how well a job matches a candidate's profile.

## Candidate CV
${cvText}

## Candidate Preferences
- Target roles: ${targetRoles.length > 0 ? targetRoles.join(', ') : 'Not specified'}
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
    "company_fit": <number 0.0-10.0>,
    "location": <number 0.0-10.0>,
    "growth_potential": <number 0.0-10.0>
  }
}`
}

export function parseEvaluationResponse(raw: string): ScoreResponse {
  // Strip markdown code blocks if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  const parsed = JSON.parse(cleaned)
  return scoreResponseSchema.parse(parsed)
}

export async function callOpenRouter(prompt: string): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
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
  return data.choices[0].message.content as string
}
