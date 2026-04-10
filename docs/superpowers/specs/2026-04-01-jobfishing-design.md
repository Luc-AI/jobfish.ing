# jobfishing — System Design Spec

**Date:** 2026-04-01  
**Status:** Approved  
**Domain:** jobfish.ing

---

## 1. Product Vision

**jobfishing** is a push-based job opportunity monitoring system. Instead of browsing job boards daily, users receive intelligent notifications only when opportunities match their CV, preferences, and career aspirations.

The product targets "sleeping potentials" — professionals passively open to new opportunities but unwilling to invest daily time scrolling through noise-filled platforms. The system runs silently in the background and surfaces high-signal alerts only when they matter.

**North star:** A user receives a morning notification for a role they would never have found manually, agrees it was worth their attention, and applies in under 30 seconds.

---

## 2. Architecture Overview

The system has two loosely coupled parts that share a Supabase Postgres database:

1. **Next.js frontend** (Vercel) — user-facing app for auth, onboarding, job feed, preferences, and notification settings
2. **Trigger.dev pipeline** (cloud, free tier) — three chained background tasks that scrape, evaluate, and notify

```
Cron (6h) → scrape-jobs → evaluate-jobs → notify-users
                ↓               ↓               ↓
             Apify          OpenRouter        Resend
                ↓               ↓
                    Supabase Postgres
                        ↑
                  Next.js frontend
```

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | Next.js 15, App Router, TypeScript | Deployed to Vercel |
| UI components | shadcn/ui + Tailwind CSS | Warm, approachable theme. All UI changes use shadcn via MCP. |
| Database + Auth | Supabase (Postgres + RLS) | Google OAuth via Supabase Auth providers |
| Background jobs | Trigger.dev cloud (free tier) | ~$0.20–0.50/month actual compute cost; $5 credit included |
| Scraping | Apify | `fantastic-jobs/career-site-job-listing-api` + `fantastic-jobs/advanced-linkedin-job-search-api` |
| AI evaluation | OpenRouter | Model-agnostic; easy to swap models |
| Email | Resend + React Email | Notification emails with job card + score + reasoning |
| Analytics | PostHog | Event-based; tracks key user actions |
| Error tracking | Sentry | Next.js SDK (client + server) + Node SDK in Trigger.dev tasks |

---

## 4. Authentication

- **Provider:** Supabase Auth with Google OAuth + email/password
- Google credentials configured in Google Cloud Console → added to Supabase Auth dashboard
- Login page offers both: Google OAuth button and email/password form
- On first login, user is redirected to the onboarding wizard
- On subsequent logins, user is redirected to `/dashboard`
- Onboarding completion tracked via `profiles.onboarding_completed` boolean

---

## 5. Database Schema

All tables have Row Level Security enabled. Users can only read/write their own rows. The Trigger.dev pipeline uses a Supabase service role key.

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | FK → `auth.users.id`, primary key |
| `cv_text` | text | Raw CV content pasted by user |
| `threshold` | numeric(3,1) | Score threshold for notifications (0.0–10.0, default 7.0) |
| `notifications_enabled` | bool | Master toggle for email notifications |
| `onboarding_completed` | bool | Controls post-login redirect |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `preferences`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | FK → `profiles.id` |
| `target_roles` | text[] | e.g. ["Head of Product", "VP Biz Dev"] |
| `industries` | text[] | e.g. ["Fintech", "SaaS", "VC"] |
| `locations` | text[] | e.g. ["Zurich", "Remote", "Berlin"] |
| `excluded_companies` | text[] | Companies to never surface |
| `updated_at` | timestamptz | |

### `jobs`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `title` | text | |
| `company` | text | |
| `location` | text | |
| `url` | text | Unique — used for deduplication |
| `source` | text | "linkedin" \| "jobs.ch" \| "company_site" |
| `description` | text | Full job description for AI evaluation |
| `scraped_at` | timestamptz | |

### `job_evaluations` _(central table)_
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `job_id` | uuid | FK → `jobs.id` |
| `user_id` | uuid | FK → `profiles.id` |
| `score` | numeric(3,1) | 0.0–10.0 |
| `reasoning` | text | AI-generated plain-language explanation |
| `dimensions` | jsonb | Breakdown scores: role_fit, company_fit, location, growth_potential |
| `notified_at` | timestamptz | NULL = not yet notified |
| `created_at` | timestamptz | |

### `user_job_actions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | FK → `profiles.id` |
| `job_id` | uuid | FK → `jobs.id` |
| `status` | enum | `saved` \| `hidden` \| `applied` |
| `applied_at` | timestamptz | Set when status = `applied` |

---

## 6. Pipeline — Trigger.dev Tasks

Three tasks defined in `src/trigger/`, chained via Trigger.dev's `.triggerAndWait()` / `.trigger()` pattern.

### `scrape-jobs.ts`
- **Trigger:** Cron schedule, every 1 hour
- **Steps:**
  1. Aggregate all active users' preferences (roles, locations, excluded companies)
  2. Call two Apify actors in parallel: `fantastic-jobs/career-site-job-listing-api` and `fantastic-jobs/advanced-linkedin-job-search-api` — see `docs/superpowers/specs/2026-04-08-apify-integration-design.md`
  3. Normalize both outputs through a single function (actors share identical output schema)
  4. Deduplicate against existing `jobs` table by URL (upsert with ON CONFLICT DO NOTHING)
  5. Insert new jobs into `jobs` table
  6. Trigger `evaluate-jobs` with the list of new job IDs
- **Error handling:** Retry 3× on Apify failure. Log failures to Sentry.

### `evaluate-jobs.ts`
- **Trigger:** Called by `scrape-jobs` with new job IDs
- **Steps:**
  1. Fetch all active users (profiles with `onboarding_completed = true`)
  2. For each user × each new job:
     - Build prompt: CV text + preferences + job description
     - Call OpenRouter (model configurable via env var)
     - Parse structured response: `score`, `reasoning`, `dimensions`
     - Insert row into `job_evaluations`
  3. Trigger `notify-users` on completion
- **Error handling:** Per-evaluation errors are logged but don't abort the batch. Retry individual failed evaluations up to 2×.

### `notify-users.ts`
- **Trigger:** Called by `evaluate-jobs`
- **Steps:**
  1. Query `job_evaluations` where `score >= user.threshold` AND `notified_at IS NULL`
  2. For each qualifying evaluation where `user.notifications_enabled = true`:
     - Render React Email template with job card, score, dimension breakdown, reasoning, apply link
     - Send via Resend
     - Set `notified_at = now()`
- **Error handling:** Resend failures logged to Sentry; `notified_at` only set on confirmed send.

---

## 7. Frontend — Routes

### `(auth)`
- `/login` — Google OAuth button + email/password form via Supabase Auth
- Post-auth redirect: `/dashboard` (or `/onboarding` if `onboarding_completed = false`)

### `(onboarding)`
- 3-step wizard (first login only):
  1. **CV** — large textarea for paste, character count
  2. **Preferences** — multi-select for roles, industries, locations; tag input for excluded companies
  3. **Notifications** — threshold slider (1–10) + enable/disable toggle
- On completion: set `onboarding_completed = true`, redirect to `/dashboard`

### `/dashboard`
- Job feed sorted by `score DESC`
- Each job card shows: title, company, location, score badge, expandable AI reasoning, dimension scores
- Actions per card: **Save** / **Hide** / **Apply** (opens URL in new tab + marks applied)
- Hidden jobs filtered from view by default
- Pagination (server-side, not infinite scroll — simpler, works without JS)

### `/preferences`
- Edit CV text (textarea)
- Edit target roles, industries, locations (multi-select)
- Edit excluded companies (tag input)
- Save triggers re-evaluation on next pipeline run (no immediate re-eval in MVP)

### `/notifications`
- Score threshold slider (1–10)
- Enable/disable toggle
- Last notification sent (timestamp)

---

## 8. UI Design

- **Component system:** shadcn/ui exclusively. All UI changes made using shadcn MCP to ensure consistency.
- **Theme:** Warm, friendly, approachable yet professional. Off-white backgrounds, warm stone neutrals, bold typography, minimal chrome.
- **Tailwind config:** Custom warm palette extending shadcn defaults.
- **Responsive:** Mobile-first. Dashboard readable on phone (morning notification → quick check on mobile).

---

## 9. Analytics — PostHog

Initialised in `src/lib/posthog.ts`, wrapped in a `PostHogProvider` in the root layout.

Key events tracked:

| Event | Trigger |
|---|---|
| `onboarding_completed` | Step 3 save |
| `job_viewed` | Job card expanded |
| `job_saved` | Save action |
| `job_hidden` | Hide action |
| `job_applied` | Apply button clicked |
| `preferences_updated` | /preferences save |
| `notification_settings_updated` | /notifications save |

---

## 10. Error Tracking — Sentry

- `sentry.client.config.ts` — browser errors, React component errors
- `sentry.server.config.ts` — API route errors, server component errors
- Trigger.dev tasks use Sentry Node SDK: `Sentry.captureException()` in catch blocks
- Source maps uploaded to Sentry on Vercel build via Sentry Vercel integration

---

## 11. Project Structure

```
jobfishing/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   ├── (onboarding)/
│   │   │   └── page.tsx          # 3-step wizard
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── preferences/
│   │   │   └── page.tsx
│   │   ├── notifications/
│   │   │   └── page.tsx
│   │   └── api/
│   │       └── webhooks/
│   │           └── trigger/      # Trigger.dev webhook endpoint
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives (auto-generated)
│   │   └── features/
│   │       ├── JobCard.tsx
│   │       ├── ScoreBadge.tsx
│   │       ├── PreferencesForm.tsx
│   │       └── OnboardingWizard.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Browser client
│   │   │   ├── server.ts         # Server client (cookies)
│   │   │   └── queries.ts        # Typed query functions
│   │   ├── email/
│   │   │   └── job-notification.tsx  # React Email template
│   │   ├── posthog.ts
│   │   └── utils.ts
│   └── trigger/
│       ├── scrape-jobs.ts
│       ├── evaluate-jobs.ts
│       └── notify-users.ts
├── trigger.config.ts
├── sentry.client.config.ts
├── sentry.server.config.ts
├── .env.local                    # Local secrets (never committed)
└── package.json
```

---

## 12. Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # Trigger.dev tasks only

# Trigger.dev
TRIGGER_SECRET_KEY=

# Apify
APIFY_API_TOKEN=

# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=                 # e.g. anthropic/claude-3-5-haiku

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=                # e.g. jobs@jobfish.ing

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=                # For source map upload
```

---

## 13. Out of Scope (MVP)

- LinkedIn OAuth
- Job search or manual filtering
- Feedback loops ("was this relevant?")
- Admin panel
- Mobile app / PWA
- Public landing page
- Analytics dashboard for users
- Multiple notification channels
