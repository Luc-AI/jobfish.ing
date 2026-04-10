# Job Detail Page With Enriched AI Scoring Design

## Goal

Add a simple authenticated job detail page that helps a user evaluate a job in one place by combining:

- relevant job facts
- the full job description
- the total AI score
- enriched stored AI reasoning across five dimensions

The page should stay faithful to stored data. It must not generate fresh AI reasoning on demand.

## Context

The current product already has:

- a dashboard feed at `/dashboard`
- compact job cards with total score and a short expandable explanation
- a Trigger.dev evaluation pipeline that stores `score`, `reasoning`, and `dimensions`

The database schema is still intentionally small:

- `jobs` stores only basic shared posting data
- `job_evaluations` stores per-user scoring data

This feature extends those existing boundaries instead of introducing a new subsystem.

## Product Decisions

The design is based on the following validated choices:

- The detail page should balance fast triage and deep transparency equally.
- Rich AI reasoning should be generated once during the evaluation pipeline and stored in the database.
- The feed should remain compact and link to a dedicated detail page.
- The enriched AI explanation should include narrative and structured evidence, but should stop short of a full audit report.
- The implementation should stay simple and align with existing app conventions, including shadcn usage and current dashboard styling.

## Route Design

Add a new authenticated dynamic route under the existing app area:

- `/dashboard/jobs/[jobId]`

The page should:

- require an authenticated user
- look up the requested job and the current user’s evaluation
- return `notFound()` if the job does not exist or is not available to the user

The feed remains the main browsing surface. Each job card gains a `View details` action that navigates to the detail page.

Because this codebase is on Next.js 16, the route should follow current App Router conventions, including promised `params` and existing repo patterns for server-rendered pages.

## UX Structure

The detail page should remain intentionally compact and readable. It should use existing shadcn primitives and the repo’s current dashboard visual language.

### 1. Header / Triage Section

Purpose: help the user make a quick first-pass decision.

Content:

- job title
- company
- primary location
- key fact chips:
  - work arrangement
  - employment type
  - experience level
  - job language
  - working hours
- total score
- primary actions:
  - `Apply`
  - `Save`
  - `Hide`

### 2. AI Scoring Section

Purpose: explain why the job scored the way it did.

Content:

- total score
- short summary
- five dimension cards, each with:
  - dimension label
  - numeric score
  - one-sentence explanation
- strengths list
- concerns list
- red flags list, only when present
- recommendation

This section should clearly separate AI judgment from raw job-posting content.

### 3. Job Content Section

Purpose: expose the raw posting and key extracted facts.

Content:

- core responsibilities
- requirements summary
- key skills
- full description
- source label and source link

The raw description remains the complete source text. Extracted summaries should sit above it for scanability.

## Data Model

Best practice for this repo is a hybrid schema:

- use explicit columns for stable job facts that are likely to be displayed repeatedly
- use JSONB for flexible display metadata
- keep user-specific AI reasoning on `job_evaluations`

### Jobs Table Changes

Add explicit columns to `jobs`:

- `date_posted timestamptz null`
- `employment_type text[] null`
- `work_arrangement text null`
- `experience_level text null`
- `job_language text null`
- `working_hours integer null`
- `remote boolean default false`
- `source_domain text null`
- `detail_facts jsonb null`

`detail_facts` is for display-ready derived facts, not raw scraper payloads.

Recommended `detail_facts` shape:

```json
{
  "location_display": "Olten, Solothurn, Switzerland",
  "key_skills": ["Product management", "Trading"],
  "core_responsibilities": "Manage the full product life cycle...",
  "requirements_summary": "Requires a Master's degree and 3+ years...",
  "education_requirements": ["postgraduate degree"],
  "keywords": ["Product Manager", "Trading", "Energy Industry"]
}
```

Notes:

- `description` continues to store the full job description text.
- The app should not store the full raw Apify callback in the core `jobs` table.

### Job Evaluations Table Changes

Keep:

- `score`
- `reasoning`

Continue using `dimensions jsonb`, but expand it to five dimensions. Add:

- `detailed_reasoning jsonb null`

Recommended `dimensions` shape:

```json
{
  "role_fit": 8.7,
  "domain_fit": 7.9,
  "experience_fit": 8.2,
  "location_fit": 6.5,
  "upside": 8.0
}
```

Recommended `detailed_reasoning` shape:

```json
{
  "summary": "Strong overall fit for your product background, with some domain ramp-up risk.",
  "strengths": [
    "Clear overlap with product ownership responsibilities",
    "Stakeholder-heavy environment matches prior experience"
  ],
  "concerns": [
    "Energy market context may require onboarding time"
  ],
  "red_flags": [],
  "recommendation": "Worth a serious look if you're open to the industry context.",
  "dimension_explanations": {
    "role_fit": "The scope matches product leadership and roadmap ownership well.",
    "domain_fit": "The role sits in a specialized industry context, which may require some ramp-up.",
    "experience_fit": "Seniority and expected ownership are aligned with the candidate profile.",
    "location_fit": "Location and work arrangement are acceptable but not ideal.",
    "upside": "The role offers meaningful ownership and room to grow."
  }
}
```

### Chosen Five Dimensions

The five dimensions for v1 are:

- `role_fit`
- `domain_fit`
- `experience_fit`
- `location_fit`
- `upside`

These labels are simple, readable in product UI, and broad enough to work across multiple job families.

## Scraper Mapping

Update the scraper-to-job mapping so inserts and upserts populate the new job fields from the Apify callback.

Preferred source mapping:

- `date_posted` <- `date_posted`
- `employment_type` <- `employment_type` or `ai_employment_type`
- `work_arrangement` <- `ai_work_arrangement`
- `experience_level` <- `ai_experience_level`
- `job_language` <- `ai_job_language`
- `working_hours` <- `ai_working_hours`
- `remote` <- `remote_derived`
- `source_domain` <- `source_domain`
- `detail_facts.location_display` <- first useful display value from `locations_derived`
- `detail_facts.key_skills` <- `ai_key_skills`
- `detail_facts.core_responsibilities` <- `ai_core_responsibilities`
- `detail_facts.requirements_summary` <- `ai_requirements_summary`
- `detail_facts.education_requirements` <- `ai_education_requirements`
- `detail_facts.keywords` <- `ai_keywords`

This mapping should favor the AI-normalized fields where they provide a cleaner user-facing value than the raw source.

## Evaluation Pipeline

The Trigger.dev evaluation task remains the single point where AI reasoning is created.

Required changes:

- update the scoring prompt to request five dimensions instead of four
- keep a short `reasoning` field for compact surfaces like the dashboard card
- add `detailed_reasoning` to the response schema
- validate the richer payload with zod before storing it
- store the new data once in `job_evaluations`

The detail page must not trigger a second AI call or derive new reasoning at request time.

## App Data Flow

### Query Layer

Add a detail-page query that loads:

- the requested job
- the current user’s evaluation for that job
- the current user’s job action, if any

The query layer should return UI-ready typed data so page components do not need to reshape raw Supabase responses heavily.

### Dashboard Feed

Keep the existing feed compact.

Changes:

- add a `View details` link on the card
- preserve current score and short explanation behavior
- do not expand the card into a mini detail page

### Detail Page Rendering

Build the page from a small set of focused components and existing shadcn primitives such as cards, badges, separators, and buttons. Follow the repo’s established dashboard styling instead of introducing a new aesthetic.

## Fallback Behavior

During rollout, some existing rows may not yet have enriched data.

Required behavior:

- if `detailed_reasoning` is missing, render the page with:
  - total score
  - existing short `reasoning`
  - numeric dimension scores if present
  - a clear fallback message that detailed AI scoring is not available yet
- if optional job facts are missing, omit those chips or rows
- if a job exists but the user has no evaluation yet, still render job facts and source content with a missing-score state

This avoids forcing a backfill before the page can ship.

## Testing

Add or extend tests in four areas:

### Evaluation schema tests

- validate the five-dimension response
- validate `detailed_reasoning`
- reject incomplete or malformed enriched responses

### Evaluation pipeline tests

- ensure response parsing accepts the richer JSON payload
- ensure the prompt and parser remain aligned

### Query/data-shaping tests

- validate the detail-page data loader shape
- validate fallback behavior when enriched reasoning is absent

### UI tests

- dashboard card renders `View details`
- detail page renders job facts
- detail page renders five dimensions and their explanations
- detail page handles missing enriched reasoning gracefully

## Error Handling

- invalid or inaccessible job IDs should render `notFound()`
- missing optional fields should not render empty placeholders
- missing enriched evaluation data should degrade gracefully instead of failing the page

## Out of Scope

The following are intentionally out of scope for v1:

- on-demand AI generation on page view
- storing full raw scraper payloads in core product tables
- advanced analytics or score-history views
- aggressive normalization into multiple new relational tables
- broad filter/search redesign for the dashboard

## Implementation Boundaries

- scraper mapping owns shared job facts
- evaluation pipeline owns user-specific AI scoring
- query layer shapes data for the UI
- page components render typed data with minimal business logic

This keeps responsibilities aligned with the current architecture and limits surface area.
