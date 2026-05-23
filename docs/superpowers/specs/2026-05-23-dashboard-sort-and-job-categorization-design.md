# Design: Dashboard Sort + Job Categorization

**Date:** 2026-05-23
**Issues:** #94 (Dashboard sort options), #98 (Job categorization pipeline)
**Status:** Approved

---

## #94 — Dashboard Sort Options

### Overview

Add four sort modes to the dashboard feed. All active-job sorts use an exponential decay formula `score × exp(−λ × age_days)` with different λ values. Archived is a plain chronological query for jobs older than 30 days.

### URL param

`?sort=fresh|best|balanced|archived` — default: `fresh`

Pagination and sort compose: changing sort resets to page 1. Paginating preserves sort (`?sort=best&page=2`).

### Sort modes

| Param | Label | λ | Age filter | Order | Micro-copy |
|-------|-------|---|------------|-------|------------|
| `fresh` | Freshest first | 0.15 | ≤ 30 days | decay score DESC | "Newest listings first — score still filters the noise." |
| `best` | Best matches | 0.02 | ≤ 30 days | decay score DESC | "A strong fit from last week still outranks a weaker one posted today." |
| `balanced` | Balanced mix | 0.05 | ≤ 30 days | decay score DESC | "Fit and freshness, both in the mix." |
| `archived` | Archived | n/a | > 30 days | `date_posted DESC` | "Jobs posted more than 30 days ago, oldest finds last." |

**Decay formula:** `score × exp(−λ × max(0, age_days))` where `age_days = extract(epoch from (now() - date_posted)) / 86400`

Half-lives: `fresh` ≈ 5 days, `balanced` ≈ 14 days, `best` ≈ 35 days.

### UI

- Three link-buttons (`fresh | best | balanced`) + one `archived` button in the dashboard header, right-aligned
- Active sort: `variant="default"`, inactive: `variant="ghost"`
- A single micro-copy line below the button group, replacing the current subtitle, showing only the active sort's description
- Button order: Freshest first → Best matches → Balanced mix → Archived

### Data layer

**`getJobFeed` signature change:**
```ts
getJobFeed(userId, page, pageSize, hideHidden, sort: 'fresh' | 'best' | 'balanced' | 'archived' = 'fresh')
```

**Routing:**
- `fresh | best | balanced` → Postgres RPC `get_job_feed_ranked(p_user_id, p_lambda, p_archived, p_offset, p_limit)`
- `archived` → direct Supabase query with `date_posted < now() - interval '30 days'`, ordered by `date_posted DESC`

**Lambda map (TS):**
```ts
const LAMBDA = { fresh: 0.15, best: 0.02, balanced: 0.05 }
```

### Migration: `0011_recommended_feed.sql`

```sql
create or replace function get_job_feed_ranked(
  p_user_id uuid,
  p_lambda float8,
  p_offset int default 0,
  p_limit int default 20
) returns json
language sql
security definer
as $$
  select coalesce(json_agg(result order by ranking_score desc), '[]'::json)
  from (
    select
      je.id,
      je.job_id,
      je.score,
      je.reasoning,
      je.dimensions,
      je.notified_at,
      je.created_at,
      json_build_object(
        'id', j.id,
        'title', j.title,
        'company', j.company,
        'location', j.location,
        'url', j.url,
        'source', j.source,
        'remote_type', j.remote_type,
        'industry', j.industry,
        'synced_at', j.synced_at
      ) as jobs,
      (
        select json_build_object('job_id', uja.job_id, 'status', uja.status, 'applied_at', uja.applied_at)
        from user_job_actions uja
        where uja.user_id = p_user_id and uja.job_id = je.job_id
        limit 1
      ) as user_job_actions,
      je.score * exp(
        -p_lambda * greatest(0,
          extract(epoch from (now() - coalesce(j.date_posted::timestamptz, now()))) / 86400.0
        )
      ) as ranking_score
    from job_evaluations je
    join jobs j on j.id = je.job_id
    where je.user_id = p_user_id
      and j.is_active = true
      and j.date_posted >= now() - interval '30 days'
      and je.job_id not in (
        select job_id from user_job_actions
        where user_id = p_user_id and status = 'hidden'
      )
    offset p_offset
    limit p_limit
  ) result
$$;
```

### Files to change

- `src/lib/supabase/queries.ts` — add `sort` param to `getJobFeed`, branch on sort
- `src/app/(app)/dashboard/page.tsx` — extract `sort` from `searchParams`, pass to `getJobFeed`, render sort control
- `supabase/migrations/0011_recommended_feed.sql` — new SQL function

---

## #98 — Job Categorization Pipeline

### Overview

After newly fetched jobs land in the DB, a new Trigger.dev task assigns each job to 1–3 categories from a fixed taxonomy aligned to the role picker. Runs before evaluation. High recall — over-categorize rather than under-categorize. Never leaves a job uncategorized.

### Pipeline placement

In `sync-jobs.ts`, after upsert:
```
upsert jobs → categorizeJobsTask.triggerAndWait → evaluateJobsTask.triggerAndWait
```

### DB migration: `0010_job_categories.sql`

```sql
alter table jobs add column categories text[];
-- nullable: null = not yet categorized (existing jobs)
-- new jobs always get categories assigned before evaluation
```

### Taxonomy (17 categories — derived from `src/lib/roles.ts`)

| Category | Covers |
|----------|--------|
| Engineering | Software Engineer, Frontend, Mobile, DevOps, QA, Engineering Manager, Technical Architect, IT & Systems |
| AI & Data | ML Engineer, AI/LLM Engineer, Data Engineer, Data Scientist, Data Analyst |
| Cybersecurity | Security Engineer, Pentesting, SOC & Incident Response |
| Product | Product Manager, Product Owner, Technical PM |
| Design & UX | Product Designer, UX Researcher, UX Writer |
| Sales | AE, AM, SDR/BDR, Sales Leadership, Channel Sales, Strategic Partnerships, Sales Engineer |
| Business | Business Analyst, Program Manager, Project Manager, Scrum Master |
| Marketing | Growth, Digital, Content, Social, Marketing Ops, Product Marketing, Brand, PR, Field, Graphic Design, Motion/Video |
| Finance | FP&A, Accounting, Financial Analyst, Corp Dev, Investment Banking, VC/PE, Treasury, Sales & Trading, Wealth Management |
| Quantitative Finance | Quant Developer, Quant Research |
| Customer Success | Customer Success Manager, Technical Support, Implementation |
| People & HR | HR/People Ops, Talent Acquisition, L&D |
| Legal & Compliance | Legal, Compliance, Trust & Safety, AML, Privacy |
| Strategy & Operations | Strategy & Ops, Revenue Ops, ESG |
| Consulting | Management Consulting, IT Consulting, Financial Advisory |
| Hardware & Embedded | Embedded/Firmware, Semiconductor, Electrical/Hardware, Robotics, Industrial Automation |
| Other | Technical Writer, Developer Relations, anything unclassifiable |

### LLM approach

- Model: `OPENROUTER_MODEL` env var (same as evaluation — Haiku by default)
- Batching: 10 jobs per LLM call (reduces API calls ~10×)
- Each job in batch: `Job ID | Title | Industry | first 300 chars of description`
- Fallback: if batch parse fails → retry per-job → if still fails → assign `['Other']` + capture Sentry warning

**Observability:** Any job that falls back to `['Other']` is captured in Sentry as a warning with `{ jobId, title, industry }`. This surfaces taxonomy gaps over time with no extra infra.

### System prompt

```
You are a job categorization assistant. Your goal is high recall — it is always
worse to miss a relevant category than to assign an extra one.

Rules:
- Always assign at least one category
- Assign at most 3 categories
- If a job could plausibly belong to multiple categories, include all relevant ones
  up to the limit
- Only use categories from the approved taxonomy — never invent new ones
- Respond ONLY with a JSON array: [{ "job_id": "...", "categories": ["..."] }, ...]

Approved taxonomy:
Engineering, AI & Data, Cybersecurity, Product, Design & UX, Sales, Business,
Marketing, Finance, Quantitative Finance, Customer Success, People & HR,
Legal & Compliance, Strategy & Operations, Consulting, Hardware & Embedded, Other

Examples:
- "Senior Full Stack Engineer" → ["Engineering"]
- "Head of Product" → ["Product"]
- "VP of Engineering" → ["Engineering"]
- "ML Platform Engineer" → ["Engineering", "AI & Data"]
- "Platform Security Engineer" → ["Engineering", "Cybersecurity"]
- "Quant Researcher" → ["Quantitative Finance"]
- "Growth Marketing Manager" → ["Marketing"]
- "Chief of Staff" → ["Strategy & Operations", "Business"]
```

### Task: `src/trigger/categorize-jobs.ts`

```
id: 'categorize-jobs'
payload: { jobIds: string[] }
retry: { maxAttempts: 3 }
```

Flow:
1. Fetch jobs by IDs (title, industry, description)
2. Chunk into batches of 10
3. For each batch: build prompt → call LLM → parse JSON response → upsert `categories` to each job
4. On batch parse failure: retry each job individually
5. On individual failure: set `categories = ['Other']`, capture Sentry warning `{ jobId, title, industry }`

### Files to create/change

- `supabase/migrations/0010_job_categories.sql` — add `categories text[]` column
- `src/lib/supabase/types.ts` — add `categories` to jobs Row/Insert/Update
- `src/trigger/categorize-jobs.ts` — new task
- `src/trigger/sync-jobs.ts` — chain `categorizeJobsTask.triggerAndWait` before `evaluateJobsTask`
