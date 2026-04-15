# PR 2 — Scraper Mapping: New Jobs Columns

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured columns to the `jobs` table and update the Apify scraper normalization and upsert to populate them from the callback payload.

**Architecture:** A single migration adds the new columns to `jobs`. `normalizeFantasticJob` in `apify.ts` is expanded to return a richer `NormalizedJob` type. The upsert in `scrape-jobs.ts` passes the new fields. TypeScript types are updated to match. This PR has no dependency on PR 1.

**Tech Stack:** Supabase (SQL migration), TypeScript, Vitest

---

## File Map

| Action | File |
|--------|------|
| Create | `supabase/migrations/0005_jobs_detail_columns.sql` |
| Modify | `src/trigger/lib/apify.ts` |
| Modify | `src/trigger/scrape-jobs.ts` |
| Modify | `src/lib/supabase/types.ts` |
| Modify | `src/test/apify.test.ts` |

---

## Task 1: Write and apply the DB migration

**Files:**
- Create: `supabase/migrations/0005_jobs_detail_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_jobs_detail_columns.sql

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS date_posted        timestamptz    NULL,
  ADD COLUMN IF NOT EXISTS employment_type    text[]         NULL,
  ADD COLUMN IF NOT EXISTS work_arrangement   text           NULL,
  ADD COLUMN IF NOT EXISTS experience_level   text           NULL,
  ADD COLUMN IF NOT EXISTS job_language       text           NULL,
  ADD COLUMN IF NOT EXISTS working_hours      integer        NULL,
  ADD COLUMN IF NOT EXISTS source_domain      text           NULL,
  ADD COLUMN IF NOT EXISTS detail_facts       jsonb          NULL;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: `Applying migration 0005_jobs_detail_columns.sql... done`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_jobs_detail_columns.sql
git commit -m "chore: add detail columns to jobs table"
```

---

## Task 2: Expand NormalizedJob and normalizeFantasticJob

**Files:**
- Modify: `src/trigger/lib/apify.ts`
- Modify: `src/test/apify.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to the `normalizeFantasticJob` describe block in `src/test/apify.test.ts`. Append them after the existing tests (do not remove existing tests):

```ts
  it('maps employment_type from ai_employment_type', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/1',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_employment_type: ['full-time'],
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.employment_type).toEqual(['full-time'])
  })

  it('maps employment_type from employment_type when ai_employment_type is absent', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/2',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      employment_type: ['contract'],
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.employment_type).toEqual(['contract'])
  })

  it('sets work_arrangement from ai_work_arrangement', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/3',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_work_arrangement: 'hybrid',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.work_arrangement).toBe('hybrid')
  })

  it('falls back work_arrangement to "remote" when ai_work_arrangement is null and remote_derived is true', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/4',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: true,
      ai_work_arrangement: null,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.work_arrangement).toBe('remote')
  })

  it('maps experience_level from ai_experience_level', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/5',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_experience_level: 'senior',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.experience_level).toBe('senior')
  })

  it('maps working_hours from ai_working_hours', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/6',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_working_hours: 40,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.working_hours).toBe(40)
  })

  it('maps source_domain', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/7',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      source_domain: 'linkedin.com',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.source_domain).toBe('linkedin.com')
  })

  it('builds detail_facts.location_display from locations_derived city and country', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/8',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [{ city: 'Olten', region: 'Solothurn', country: 'Switzerland' }],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.location_display).toBe('Olten, Solothurn, Switzerland')
  })

  it('builds detail_facts.location_display omitting null segments', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/9',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [{ city: 'Zurich', region: null, country: 'Switzerland' }],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.location_display).toBe('Zurich, Switzerland')
  })

  it('sets detail_facts.key_skills from ai_key_skills', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/10',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_key_skills: ['Roadmapping', 'Stakeholder management'],
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.key_skills).toEqual(['Roadmapping', 'Stakeholder management'])
  })

  it('sets detail_facts.core_responsibilities from ai_core_responsibilities', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/11',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_core_responsibilities: 'Own the product roadmap.',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.core_responsibilities).toBe('Own the product roadmap.')
  })

  it('sets detail_facts.requirements_summary from ai_requirements_summary', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/12',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
      ai_requirements_summary: '5+ years experience.',
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts?.requirements_summary).toBe('5+ years experience.')
  })

  it('leaves detail_facts null when no enriched fields are present', () => {
    const raw = {
      title: 'PM',
      organization: 'Acme',
      url: 'https://example.com/13',
      source: 'greenhouse',
      description_text: null,
      locations_derived: [],
      remote_derived: false,
    }
    const job = normalizeFantasticJob(raw)
    expect(job!.detail_facts).toBeNull()
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/apify.test.ts
```

Expected: FAIL — `employment_type`, `work_arrangement`, etc. not on `NormalizedJob`.

- [ ] **Step 3: Update apify.ts**

Replace the `NormalizedJob` interface and `normalizeFantasticJob` function in `src/trigger/lib/apify.ts`. Leave everything else (endpoints, `LOCATION_MAP`, `ApifyInput`, `UserPreference`, `toApifyLocation`, `buildApifyInput`, `callApifyActor`, `scrapeAll`) untouched.

```ts
export interface DetailFacts {
  location_display?: string
  key_skills?: string[]
  core_responsibilities?: string
  requirements_summary?: string
  education_requirements?: string[]
  keywords?: string[]
}

export interface NormalizedJob {
  title: string
  company: string
  location: string
  url: string
  source: string
  description: string | null
  // new detail fields
  date_posted: string | null
  employment_type: string[] | null
  work_arrangement: string | null
  experience_level: string | null
  job_language: string | null
  working_hours: number | null
  source_domain: string | null
  detail_facts: DetailFacts | null
}
```

Replace `normalizeFantasticJob`:

```ts
export function normalizeFantasticJob(raw: Record<string, unknown>): NormalizedJob | null {
  const url = raw.url as string | undefined
  const title = raw.title as string | undefined
  const org = raw.organization as string | undefined

  if (!url || !title || !org) return null

  const derived = raw.locations_derived as Array<{
    city?: string | null
    region?: string | null
    country?: string | null
  }> | undefined

  let location = 'Unknown'
  if (derived?.[0]?.city && derived[0]?.country) {
    location = `${derived[0].city}, ${derived[0].country}`
  } else if (raw.remote_derived) {
    location = 'Remote'
  } else {
    location = (raw.locations_alt_raw as string[] | undefined)?.[0] ?? 'Unknown'
  }

  // work_arrangement: prefer ai field, fall back to 'remote' if remote_derived
  const aiArrangement = raw.ai_work_arrangement as string | null | undefined
  const work_arrangement =
    aiArrangement ?? (raw.remote_derived ? 'remote' : null)

  // detail_facts: only build if at least one enriched field is present
  const firstDerived = derived?.[0]
  const locationDisplay = firstDerived
    ? [firstDerived.city, firstDerived.region, firstDerived.country]
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .join(', ') || undefined
    : undefined

  const keySkills = raw.ai_key_skills as string[] | undefined
  const coreResp = raw.ai_core_responsibilities as string | undefined
  const reqSummary = raw.ai_requirements_summary as string | undefined
  const eduReqs = raw.ai_education_requirements as string[] | undefined
  const keywords = raw.ai_keywords as string[] | undefined

  const hasDetailFacts =
    locationDisplay ||
    keySkills?.length ||
    coreResp ||
    reqSummary ||
    eduReqs?.length ||
    keywords?.length

  const detail_facts: DetailFacts | null = hasDetailFacts
    ? {
        ...(locationDisplay ? { location_display: locationDisplay } : {}),
        ...(keySkills?.length ? { key_skills: keySkills } : {}),
        ...(coreResp ? { core_responsibilities: coreResp } : {}),
        ...(reqSummary ? { requirements_summary: reqSummary } : {}),
        ...(eduReqs?.length ? { education_requirements: eduReqs } : {}),
        ...(keywords?.length ? { keywords } : {}),
      }
    : null

  return {
    title,
    company: org,
    location,
    url,
    source: (raw.source as string | undefined) || 'unknown',
    description: (raw.description_text as string | undefined) ?? null,
    date_posted: (raw.date_posted as string | undefined) ?? null,
    employment_type:
      (raw.ai_employment_type as string[] | undefined) ??
      (raw.employment_type as string[] | undefined) ??
      null,
    work_arrangement: work_arrangement ?? null,
    experience_level: (raw.ai_experience_level as string | undefined) ?? null,
    job_language: (raw.ai_job_language as string | undefined) ?? null,
    working_hours: (raw.ai_working_hours as number | undefined) ?? null,
    source_domain: (raw.source_domain as string | undefined) ?? null,
    detail_facts,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/apify.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/lib/apify.ts src/test/apify.test.ts
git commit -m "feat: expand NormalizedJob with detail columns and update normalizeFantasticJob"
```

---

## Task 3: Update the jobs upsert in scrape-jobs.ts

**Files:**
- Modify: `src/trigger/scrape-jobs.ts`

- [ ] **Step 1: Update the upsert to include new fields**

In `src/trigger/scrape-jobs.ts`, replace the `jobs.map(j => ({...}))` inside the `.upsert(...)` call:

```ts
// was:
jobs.map(j => ({
  title: j.title,
  company: j.company,
  location: j.location,
  url: j.url,
  source: j.source,
  description: j.description,
})),
```

```ts
// becomes:
jobs.map(j => ({
  title: j.title,
  company: j.company,
  location: j.location,
  url: j.url,
  source: j.source,
  description: j.description,
  date_posted: j.date_posted,
  employment_type: j.employment_type,
  work_arrangement: j.work_arrangement,
  experience_level: j.experience_level,
  job_language: j.job_language,
  working_hours: j.working_hours,
  source_domain: j.source_domain,
  detail_facts: j.detail_facts,
})),
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/trigger/scrape-jobs.ts
git commit -m "feat: upsert new detail columns when storing scraped jobs"
```

---

## Task 4: Update TypeScript types

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Add new columns to the jobs table type**

In `src/lib/supabase/types.ts`, update the `jobs` table. Add to `Row`, `Insert`, and `Update` blocks:

```ts
// Row — add after `scraped_at: string`:
date_posted: string | null
employment_type: string[] | null
work_arrangement: string | null
experience_level: string | null
job_language: string | null
working_hours: number | null
source_domain: string | null
detail_facts: Json | null

// Insert — add after `scraped_at?: string`:
date_posted?: string | null
employment_type?: string[] | null
work_arrangement?: string | null
experience_level?: string | null
job_language?: string | null
working_hours?: number | null
source_domain?: string | null
detail_facts?: Json | null

// Update — same as Insert
date_posted?: string | null
employment_type?: string[] | null
work_arrangement?: string | null
experience_level?: string | null
job_language?: string | null
working_hours?: number | null
source_domain?: string | null
detail_facts?: Json | null
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore: add new jobs columns to TypeScript types"
```

---

## Task 5: Open PR

- [ ] **Push branch and open PR targeting `develop`**

```bash
git push -u origin feature/pr2-scraper-mapping
gh pr create \
  --base develop \
  --title "feat: populate job detail columns from Apify callback" \
  --body "$(cat <<'EOF'
## Summary
- Adds 8 new columns to \`jobs\` (employment_type, work_arrangement, experience_level, job_language, working_hours, source_domain, date_posted, detail_facts)
- Expands \`normalizeFantasticJob\` to extract and map these from Apify AI-enriched fields
- Updates the jobs upsert in \`scrape-jobs.ts\` to write the new fields
- Independent of PR 1 — can ship in any order

## Test plan
- [ ] \`npx vitest run\` passes locally
- [ ] After deploy, trigger a manual scrape; inspect a \`jobs\` row in Supabase to confirm new columns are populated

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
