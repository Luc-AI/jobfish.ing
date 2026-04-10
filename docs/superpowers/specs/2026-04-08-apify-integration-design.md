# Apify Integration Design

**Date:** 2026-04-08
**Status:** Approved
**Relates to:** `docs/superpowers/specs/2026-04-01-jobfishing-design.md` — replaces the Apify section of the pipeline spec

---

## 1. Overview

The `scrape-jobs` Trigger.dev task calls two Apify actors in parallel every hour. Both actors are provided by `fantastic-jobs` and share an identical output schema, so a single normalization function handles both. Input parameters are built at runtime by aggregating all active users' preferences.

---

## 2. Actors

| | Career Site API | LinkedIn API |
|---|---|---|
| Actor | `fantastic-jobs/career-site-job-listing-api` | `fantastic-jobs/advanced-linkedin-job-search-api` |
| Purpose | Direct ATS and company career site postings | LinkedIn job listings |
| Endpoint | `https://api.apify.com/v2/acts/fantastic-jobs~career-site-job-listing-api/run-sync-get-dataset-items` | `https://api.apify.com/v2/acts/fantastic-jobs~advanced-linkedin-job-search-api/run-sync-get-dataset-items` |
| Auth | `?token=${APIFY_API_TOKEN}` query param | same |
| HTTP method | `POST` | `POST` |
| Response | Dataset items array (jobs) | Dataset items array (jobs) |

The sync endpoint runs the actor and returns dataset items in a single HTTP call. No polling required. Apify's sync endpoint has a 5-minute timeout — well within bounds for `limit: 200` with `timeRange: "1h"`.

---

## 3. Environment Variables

```
APIFY_API_TOKEN=<your token from apify.com/account/integrations>
```

Never hardcode the token. Never commit it. Add to Vercel env vars and Trigger.dev env vars.

---

## 4. Cron Schedule

Every **1 hour** (updated from the original 6h). This matches the `timeRange: "1h"` actor setting — running less frequently than the time window would miss jobs.

```typescript
// In scrape-jobs.ts
schedules.cron({ cron: '0 * * * *' })
```

---

## 5. Input Construction

Before calling either actor, `scrape-jobs` fetches all active users' preferences and aggregates them:

```typescript
// Pseudocode
const prefs = await supabase.from('preferences').select('target_roles, locations, excluded_companies')

const titleSearch       = unique(prefs.flatMap(p => p.target_roles))
const rawLocations      = unique(prefs.flatMap(p => p.locations))
const locationSearch    = rawLocations.filter(l => l.toLowerCase() !== 'remote')
                                       .map(l => toApifyLocation(l))  // "City, Country" format
const hasRemoteUsers    = rawLocations.some(l => l.toLowerCase() === 'remote')
const orgExclusions     = unique(prefs.flatMap(p => p.excluded_companies))
```

### Location format

The API uses phrase matching and requires English names. Format: `"City, Country"`.

Examples:
- `"Zurich"` → `"Zurich, Switzerland"`
- `"Berlin"` → `"Berlin, Germany"`
- `"London"` → `"London, United Kingdom"`
- `"Remote"` → stripped from `locationSearch`, handled via `aiWorkArrangementFilter`

`toApifyLocation(location: string): string` maps user-entered location strings to the correct format. For MVP, this can be a simple lookup map of the locations users actually enter (driven by the multi-select options in the preferences UI).

### Fixed parameters (both actors)

```typescript
const baseInput = {
  timeRange: '1h',
  limit: 200,
  descriptionType: 'text',
  includeAi: true,
  removeAgency: true,
  titleSearch,
  locationSearch,
  organizationExclusionSearch: orgExclusions,
  ...(hasRemoteUsers && {
    aiWorkArrangementFilter: ['Remote OK', 'Remote Solely'],
  }),
}
```

### LinkedIn-specific parameter

```typescript
const linkedInInput = {
  ...baseInput,
  excludeATSDuplicate: true,  // removes jobs already in the career site dataset
}
```

---

## 6. HTTP Call

Both actors are called via `fetch` (no SDK dependency):

```typescript
async function callApifyActor(
  endpoint: string,
  input: Record<string, unknown>
): Promise<unknown[]> {
  const url = `${endpoint}?token=${process.env.APIFY_API_TOKEN}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`Apify error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<unknown[]>
}
```

Both calls run in parallel:

```typescript
const [careerSiteItems, linkedInItems] = await Promise.all([
  callApifyActor(CAREER_SITE_ENDPOINT, baseInput),
  callApifyActor(LINKEDIN_ENDPOINT, linkedInInput),
])
```

---

## 7. Output Normalization

Both actors return the same schema. One function handles both:

```typescript
export interface NormalizedJob {
  title: string
  company: string
  location: string
  url: string
  source: string
  description: string | null
}

export function normalizeFantasticJob(raw: Record<string, unknown>): NormalizedJob | null {
  const url   = raw.url as string | undefined
  const title = raw.title as string | undefined
  const org   = raw.organization as string | undefined

  if (!url || !title || !org) return null

  // Build location: first derived location as "City, Country", or "Remote"
  const derived = raw.locations_derived as Array<{ city?: string; country?: string }> | undefined
  let location = 'Remote'
  if (derived?.[0]?.city && derived[0]?.country) {
    location = `${derived[0].city}, ${derived[0].country}`
  } else if (!raw.remote_derived) {
    location = (raw.locations_alt_raw as string[] | undefined)?.[0] ?? 'Unknown'
  }

  return {
    title,
    company: org,
    location,
    url,
    source: (raw.source as string | undefined) ?? 'unknown',
    description: (raw.description_text as string | undefined) ?? null,
  }
}
```

Items missing `url`, `title`, or `organization` are dropped (return `null`).

---

## 8. Deduplication

Two layers:

1. **At source:** `excludeATSDuplicate: true` on the LinkedIn call removes jobs that are already in the career site dataset. The actors themselves handle this.
2. **At DB:** The `jobs.url` column has a unique constraint. `scrape-jobs` upserts with `ON CONFLICT (url) DO NOTHING` — no explicit dedup logic needed in application code.

---

## 9. Updated File Map

Replaces the Apify section of `docs/superpowers/plans/2026-04-01-pipeline.md`:

| File | Responsibility |
|---|---|
| `src/trigger/lib/apify.ts` | `callApifyActor`, `normalizeFantasticJob`, `buildApifyInput`, `scrapeAll` |
| `src/trigger/scrape-jobs.ts` | Cron task — calls `scrapeAll`, deduplicates, inserts, triggers evaluate-jobs |

---

## 10. What Changes vs. the Original Pipeline Plan

The original plan used placeholder actor IDs (`curious_coder/linkedin-jobs-scraper`, `apify/jobs-ch-scraper`) and a simple `runApifyActor(actorId, input)` wrapper. This spec supersedes that section with:

- Correct actor IDs (`fantastic-jobs/...`)
- Fetch-based HTTP call (no `apify-client` SDK needed)
- Aggregated preference-driven input instead of hardcoded keywords
- Single normalization function for both actors (same output schema)
- Cron updated from 6h to 1h
