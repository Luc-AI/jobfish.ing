# Onboarding v2 Design

**Date:** 2026-04-09  
**Status:** Approved

---

## Overview

Four changes to the onboarding flow:

1. New name step (step 1) — collect first and last name
2. Geoapify-powered location picker with multi-select chip tags
3. Remote work preference — 4-option toggle saved to DB
4. One-time initial scrape with loading screen after onboarding completes

---

## 1. Data Model

### Migration: `profiles`

Add two nullable columns:

```sql
ALTER TABLE public.profiles
  ADD COLUMN first_name text,
  ADD COLUMN last_name  text;
```

### Migration: `preferences`

Add remote preference column:

```sql
ALTER TABLE public.preferences
  ADD COLUMN remote_preference text DEFAULT 'hybrid'
    CHECK (remote_preference IN ('on-site', 'hybrid', 'remote-ok', 'remote-solely'));
```

The `locations text[]` column is unchanged. Values will now be Geoapify display names (`"Zurich, Switzerland"`) instead of raw user input. The hardcoded `LOCATION_MAP` in `src/trigger/lib/apify.ts` can be removed once this ships.

---

## 2. Onboarding Wizard — 4 Steps

The wizard type changes from `1 | 2 | 3` to `1 | 2 | 3 | 4`. Step counter displays "X of 4".

### Step 1 — Name (new)

- Two required inputs: **First name**, **Last name**
- Submit disabled until both fields are non-empty
- Saves via `profiles` upsert: `{ id: userId, first_name, last_name }`
- On success → step 2

### Step 2 — CV (unchanged, was step 1)

No changes to logic or UI.

### Step 3 — Preferences (was step 2)

- **Locations**: replaced by `LocationPicker` component (see section 3)
- **Remote preference**: new 4-button toggle below locations
  - Options: `On-site` | `Hybrid` | `Remote OK` | `Remote Solely`
  - Default: `Hybrid`
  - Saves as `remote_preference` string value: `'on-site'` | `'hybrid'` | `'remote-ok'` | `'remote-solely'`
- `locations` saves as `string[]` of Geoapify display names
- All other fields (target roles, industries, excluded companies) unchanged

### Step 4 — Notifications (was step 3)

- No UI changes
- On save: sets `onboarding_completed = true` on `profiles`, captures PostHog event
- Immediately transitions to **loading screen** (no redirect yet)
- Calls `POST /api/onboarding/complete` and awaits response
- On success → redirect to `/dashboard`
- On error or timeout (5 min) → redirect to `/dashboard` anyway (silent fallback)

### Loading screen

Replaces the wizard content area while the initial scrape runs. Shows:
- Spinner
- Heading: "Finding your first matches…"
- Subtext: "We're scanning the last 7 days of job postings. This takes about a minute."

---

## 3. Geoapify Location Picker

### Component: `LocationPicker`

**File:** `src/components/features/location-picker.tsx`

**Props:**
```ts
interface LocationPickerProps {
  value: string[]
  onChange: (locations: string[]) => void
}
```

**Behavior:**
- Text input for searching cities
- Keystroke triggers debounced fetch (300ms) to `/api/geoapify/autocomplete?text=...`
- Dropdown shows up to 5 suggestions (city + country display name from Geoapify)
- Selecting a suggestion adds it as a chip tag below the input
- Each chip has an ✕ button to remove it
- Duplicate locations are ignored

### Route handler: `/api/geoapify/autocomplete`

**File:** `src/app/api/geoapify/autocomplete/route.ts`

- `GET` with `?text=` query param
- Calls Geoapify Geocoding Autocomplete API server-side using `GEOAPIFY_API_KEY`
- Filters results to `feature.properties.result_type === 'city'`
- Returns `{ suggestions: string[] }` — display names like `"Zurich, Switzerland"`
- Returns empty array on missing `text` param or API error

**Env var required:** `GEOAPIFY_API_KEY` (already present in `.env.local` and Vercel)

---

## 4. Initial Scrape Task

### Trigger.dev task: `scrape-jobs-initial`

**File:** `src/trigger/scrape-jobs-initial.ts`

**Payload:** `{ userId: string }`

**Run logic:**
1. Fetch the user's preferences from `preferences` table
2. Build Apify input using existing `buildApifyInput()`, but override `timeRange: '7d'`
3. Call `scrapeAll()` to fetch jobs
4. Upsert new jobs into shared `jobs` table (same dedup logic as cron task)
5. Trigger `evaluateJobsTask` with new job IDs — runs for all users (same as cron), which is fine since the new user is now `onboarding_completed = true`

`buildApifyInput` gets an optional `timeRange` parameter (defaults to `'1h'`) so the scheduled cron is unaffected.

### Route handler: `/api/onboarding/complete`

**File:** `src/app/api/onboarding/complete/route.ts`

- `POST`, authenticated (reads user from Supabase session cookie)
- Calls `scrapeJobsInitialTask.triggerAndWait({ userId })` 
- Returns `200` on success, `500` on failure
- Client awaits this response to determine when to redirect

---

## 5. What Is Not Changing

- `evaluateJobsTask` — no changes (already accepts `jobIds`)
- `scrape-jobs` cron task — no changes (remote preference Apify wiring deferred)
- Notifications step UI — no changes
- Dashboard — no changes

---

## Open / Deferred

- **Remote preference → Apify aggregation**: how to combine multiple users' remote preferences in the shared hourly cron. Deferred to a follow-up.
- **`LOCATION_MAP` removal**: safe to delete once the location picker ships and existing users have re-saved preferences (or a migration normalises existing data).
