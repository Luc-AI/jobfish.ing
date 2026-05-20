# PR 1 — Pipeline: Schema + Evaluation Upgrade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the DB to add `detailed_reasoning` to `job_evaluations`, wipe existing evaluations, update Zod schemas to five dimensions, update the AI prompt and parser, and store `detailed_reasoning` in the evaluation pipeline.

**Architecture:** The migration adds one nullable JSONB column to `job_evaluations` and wipes the table (clean break). The Zod schemas in `score-schema.ts` replace the four old dimension keys with five new ones and add a `detailedReasoningSchema`. The prompt in `evaluate.ts` is updated to request the new format. The `evaluate-jobs.ts` task stores `detailed_reasoning` alongside the existing fields.

**Tech Stack:** Supabase (SQL migration), Zod, Trigger.dev v4 (`@trigger.dev/sdk`), OpenRouter via `fetch`, Vitest

---

## File Map

| Action | File |
|--------|------|
| Create | `supabase/migrations/0004_job_detail_scoring.sql` |
| Modify | `src/trigger/lib/score-schema.ts` |
| Modify | `src/trigger/lib/evaluate.ts` |
| Modify | `src/trigger/evaluate-jobs.ts` |
| Modify | `src/lib/supabase/types.ts` |
| Modify | `src/test/score-schema.test.ts` |
| Modify | `src/test/evaluate.test.ts` |

---

## Task 1: Write and apply the DB migration

**Files:**
- Create: `supabase/migrations/0004_job_detail_scoring.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0004_job_detail_scoring.sql

-- Wipe all existing evaluations (clean break — dimension keys are changing)
TRUNCATE TABLE public.job_evaluations;

-- Add detailed_reasoning column
ALTER TABLE public.job_evaluations
  ADD COLUMN IF NOT EXISTS detailed_reasoning jsonb NULL;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected output: `Applying migration 0004_job_detail_scoring.sql... done`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_job_detail_scoring.sql
git commit -m "chore: add detailed_reasoning column and wipe stale evaluations"
```

---

## Task 2: Update Zod schemas

**Files:**
- Modify: `src/trigger/lib/score-schema.ts`
- Modify: `src/test/score-schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/test/score-schema.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/score-schema.test.ts
```

Expected: multiple FAIL — `dimensionsSchema`, `detailedReasoningSchema` not exported; old dimension keys accepted.

- [ ] **Step 3: Update score-schema.ts**

Replace the full contents of `src/trigger/lib/score-schema.ts`:

```ts
import { z } from 'zod'

export const dimensionsSchema = z.object({
  role_fit: z.number().min(0).max(10),
  domain_fit: z.number().min(0).max(10),
  experience_fit: z.number().min(0).max(10),
  location_fit: z.number().min(0).max(10),
  upside: z.number().min(0).max(10),
})

export const detailedReasoningSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  red_flags: z.array(z.string()),
  recommendation: z.string().min(1),
  dimension_explanations: z.object({
    role_fit: z.string(),
    domain_fit: z.string(),
    experience_fit: z.string(),
    location_fit: z.string(),
    upside: z.string(),
  }),
})

export const scoreResponseSchema = z.object({
  score: z.number().min(0).max(10),
  reasoning: z.string().min(1),
  dimensions: dimensionsSchema,
  detailed_reasoning: detailedReasoningSchema,
})

export type ScoreResponse = z.infer<typeof scoreResponseSchema>
export type Dimensions = z.infer<typeof dimensionsSchema>
export type DetailedReasoning = z.infer<typeof detailedReasoningSchema>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/score-schema.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/lib/score-schema.ts src/test/score-schema.test.ts
git commit -m "feat: update scoring schema to five dimensions and add detailed_reasoning"
```

---

## Task 3: Update the AI prompt and parser

**Files:**
- Modify: `src/trigger/lib/evaluate.ts`
- Modify: `src/test/evaluate.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/test/evaluate.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/evaluate.test.ts
```

Expected: FAIL — prompt missing new dimension names, `detailed_reasoning` not in prompt, parser rejects missing `detailed_reasoning`.

- [ ] **Step 3: Update evaluate.ts**

Replace the full contents of `src/trigger/lib/evaluate.ts`:

```ts
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
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  const parsed = JSON.parse(cleaned)
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/evaluate.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/lib/evaluate.ts src/test/evaluate.test.ts
git commit -m "feat: update evaluation prompt and parser for five dimensions and detailed_reasoning"
```

---

## Task 4: Store detailed_reasoning in the evaluate-jobs task

**Files:**
- Modify: `src/trigger/evaluate-jobs.ts`

- [ ] **Step 1: Update evaluate-jobs.ts to destructure and store detailed_reasoning**

In `src/trigger/evaluate-jobs.ts`, change the destructuring and insert on lines 79–91:

```ts
// was:
const { score, reasoning, dimensions } = parseEvaluationResponse(rawResponse)

const { data: evaluation } = await supabase
  .from('job_evaluations')
  .insert({
    job_id: job.id,
    user_id: user.id,
    score,
    reasoning,
    dimensions,
  })
  .select('id')
  .single()
```

```ts
// becomes:
const { score, reasoning, dimensions, detailed_reasoning } = parseEvaluationResponse(rawResponse)

const { data: evaluation } = await supabase
  .from('job_evaluations')
  .insert({
    job_id: job.id,
    user_id: user.id,
    score,
    reasoning,
    dimensions,
    detailed_reasoning,
  })
  .select('id')
  .single()
```

- [ ] **Step 2: Run all tests to confirm nothing is broken**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/trigger/evaluate-jobs.ts
git commit -m "feat: store detailed_reasoning in job_evaluations"
```

---

## Task 5: Update TypeScript types

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Add detailed_reasoning to job_evaluations Row/Insert/Update**

In `src/lib/supabase/types.ts`, update the `job_evaluations` table type. Find the `Row`, `Insert`, and `Update` blocks and add `detailed_reasoning: Json | null` to each:

```ts
// Row — add after `dimensions: Json | null`:
detailed_reasoning: Json | null

// Insert — add after `dimensions?: Json | null`:
detailed_reasoning?: Json | null

// Update — add after `dimensions?: Json | null`:
detailed_reasoning?: Json | null
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore: add detailed_reasoning to job_evaluations TypeScript types"
```

---

## Task 6: Open PR

- [ ] **Push branch and open PR targeting `develop`**

```bash
git push -u origin feature/pr1-pipeline-schema
gh pr create \
  --base develop \
  --title "feat: five-dimension AI scoring with detailed_reasoning" \
  --body "$(cat <<'EOF'
## Summary
- Migrates DB: adds \`detailed_reasoning jsonb\` to \`job_evaluations\`, wipes stale rows (clean dimension-key break)
- Replaces four old dimensions (role_fit, company_fit, location, growth_potential) with five new ones (role_fit, domain_fit, experience_fit, location_fit, upside)
- Updates Zod schemas, AI prompt, and parser to produce and validate the richer payload
- Stores \`detailed_reasoning\` in the evaluation pipeline

## Test plan
- [ ] \`npx vitest run\` passes locally
- [ ] Deploy to staging; trigger a manual evaluation run; confirm \`job_evaluations\` rows contain \`detailed_reasoning\` JSON
- [ ] Confirm old rows are gone (table was truncated by migration)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
