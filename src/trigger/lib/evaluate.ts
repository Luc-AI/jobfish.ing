import { scoreResponseSchema, type ScoreResponse } from './score-schema'
import type { CvSummary } from '@/lib/types/cv-summary'

interface EvaluationInput {
  jobTitle: string
  jobCompany: string
  jobLocation: string | null
  jobIndustry: string | null
  jobDescription: string
  cvText: string
  cvSummary?: CvSummary | null
  targetRoles: { role: string }[]
  targetIndustries: string[]
  locations: string[]
  excludedCompanies: string[]
  excludedIndustries: string[]
  yearsExperience: number
}

function formatCvSummary(summary: CvSummary): string {
  const lines = [
    `Name: ${summary.name}`,
    `Current Role: ${summary.current_title} (${summary.seniority} level)`,
    `Skills: ${summary.skills.slice(0, 15).join(', ')}`,
  ]

  if (summary.experience.length > 0) {
    lines.push('Recent Experience:')
    summary.experience.forEach(e => lines.push(`- ${e.title} at ${e.company} (${e.duration})`))
  }

  if (summary.education.length > 0) {
    lines.push('Education:')
    summary.education.forEach(e => lines.push(`- ${e.degree}, ${e.institution} (${e.year})`))
  }

  if (summary.key_achievements.length > 0) {
    lines.push('Key Achievements:')
    summary.key_achievements.forEach(a => lines.push(`- ${a}`))
  }

  return lines.join('\n')
}

export function buildEvaluationPrompt(input: EvaluationInput): string {
  const {
    jobTitle,
    jobCompany,
    jobLocation,
    jobIndustry,
    jobDescription,
    cvText,
    cvSummary,
    targetRoles,
    targetIndustries,
    locations,
    excludedCompanies,
    excludedIndustries,
    yearsExperience,
  } = input

  const roleNames = targetRoles.length > 0
    ? targetRoles.map((r) => r.role).join(', ')
    : 'Not specified'

  const experienceLabel =
    yearsExperience === 0 ? 'not specified'
    : yearsExperience === 10 ? '10+ years'
    : `${yearsExperience}+ years`

  const candidateSection = cvSummary
    ? `## Candidate Profile\n${formatCvSummary(cvSummary)}`
    : `## Candidate CV\n${cvText}`

  return `You are a career advisor evaluating how well a job matches a candidate's profile.

${candidateSection}

## Candidate Preferences
- Target roles: ${roleNames}
- Years of total experience: ${experienceLabel}
- Preferred industries: ${targetIndustries.length > 0 ? targetIndustries.join(', ') : 'Not specified'}
- Preferred locations: ${locations.length > 0 ? locations.join(', ') : 'Not specified'}
- Excluded companies: ${excludedCompanies.length > 0 ? excludedCompanies.join(', ') : 'None'}
- Excluded industries: ${excludedIndustries.length > 0 ? excludedIndustries.join(', ') : 'None'}

## Job Posting
Title: ${jobTitle}
Company: ${jobCompany}
Location: ${jobLocation ?? 'Not specified'}
Industry: ${jobIndustry ?? 'Not specified'}
Description:
${jobDescription}

## Instructions

Score how well this job matches the candidate on a scale of 0.0–10.0 using the five dimensions below. Be critical — scores above 8.0 are reserved for genuinely exceptional matches, not merely adequate ones.

### Dimension Definitions

**role_fit** — How closely does the job title, required skills, and described responsibilities align with the candidate's target roles and demonstrated CV experience?
- 0–3: Fundamentally different function (e.g. candidate is a software engineer, role is in sales)
- 4–6: Adjacent or overlapping — some transferable skills but meaningful gaps
- 7–8: Clear alignment between title/responsibilities and the candidate's background
- 9–10: Precise match — title, required skills, and day-to-day work map directly onto CV evidence

**domain_fit** — How well does the company's industry and business domain match the candidate's preferred industries and prior domain experience? Use the Job Industry field as the primary signal; fall back to company/description context only if Industry is "Not specified".
- 0–3: Industry is in the candidate's excluded list, or is a clear mismatch with stated preferences
- 4–6: Neutral — candidate shows no strong domain preference, or the industry is acceptable but not preferred
- 7–8: Industry matches a stated preference, or the candidate has demonstrated relevant domain experience
- 9–10: Industry is a top preference and the candidate has deep domain expertise in it

**experience_fit** — Does the candidate's seniority and years of experience match what the role requires? Parse seniority signals from the job title (Junior / Mid / Senior / Lead / Principal / Director) and description requirements.
- 0–3: Major mismatch — junior role for a highly experienced candidate, or a senior/director role for someone early-career
- 4–6: Mild over- or under-qualification — the candidate could do the role but it is not the right level
- 7–8: Candidate's experience level fits the role's expectations
- 9–10: Candidate's years and seniority are an excellent match for the stated requirements

**location_fit** — How well does the job's location align with the candidate's location preferences? Use the Job Location field as the primary signal — do not infer location from description text. Do not adjust this score based on remote/hybrid/on-site work type — evaluate the stated location only.

Apply the first matching rule:
- **0–2**: Job is in a different country from all of the candidate's preferred locations. Examples: preferred=Zurich, job=Berlin → 1. preferred=London, job=New York → 0.
- **3–4**: Same country, but the job location is more than ~150 km from all preferred locations. Examples: preferred=Geneva, job=Zurich (~260 km) → 3. preferred=London, job=Edinburgh (~660 km) → 3.
- **5–6**: Same country and within ~150 km, but the job is in a different language or cultural region. This applies where meaningful language/cultural barriers exist within the same country. Examples: preferred=Geneva (Romandie), job=Bern (German-speaking) → 5. preferred=Zurich (German-speaking), job=Lugano (Italian-speaking) → 5. preferred=Brussels (French), job=Ghent (Dutch-speaking) → 5. In countries without distinct language regions, skip this band — go directly to 7–8.
- **7–8**: Same country, same language/cultural region, within ~150 km. Examples: preferred=Zurich, job=Basel (~80 km, same region) → 7. preferred=Geneva, job=Lausanne (~60 km, both Romandie) → 8.
- **9–10**: Job is in the same city or immediate metro area as one of the preferred locations. Examples: preferred=Zurich, job=Zurich → 10. preferred=Paris, job=Paris La Défense → 9.
- If the candidate has no stated location preferences ("Not specified"): score 7 — cannot penalise.
- If Job Location is "Not specified": score 6 — cannot assess, slight uncertainty penalty.

**upside** — Does this role represent meaningful career growth or strategic positioning beyond just "it fits"? Consider: step up in seniority, entry into a more prestigious company or sector, new high-value technical domain, leadership opportunity.
- 0–3: Lateral or backward move — no clear growth angle relative to the candidate's trajectory
- 4–6: Reasonable next step but nothing distinctive
- 7–8: Clear growth vector — seniority step up, stronger brand, or meaningful skill expansion
- 9–10: Outstanding opportunity — rare combination of strong fit and high growth potential

### Overall Score

Weight role_fit and experience_fit most heavily — a job that misses on either cannot score above 7.0 regardless of other dimensions. upside is a bonus signal, not a primary driver.

Location mismatch applies a hard cap on the overall score:
- location_fit 0–2: overall score cannot exceed 2.5
- location_fit 3–4: overall score cannot exceed 4.5
- location_fit 5–6: overall score cannot exceed 6.0

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
      model: process.env.OPENROUTER_MODEL ?? 'google/gemini-3.1-flash-lite',
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
