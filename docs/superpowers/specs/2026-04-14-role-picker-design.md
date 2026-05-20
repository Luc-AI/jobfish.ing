# Role Picker — Design Spec
_2026-04-14_

## Overview

Replace the plain comma-separated text input for `target_roles` with a visual, hierarchical role picker (category tabs → role chips → per-role YoE counters). Used in the onboarding wizard (step 3) and the preferences page.

Reference design: Scoutify preferences sidebar.

---

## 1. Data Model

### Migration: `supabase/migrations/0002_role_picker.sql`

```sql
ALTER TABLE public.preferences
  ALTER COLUMN target_roles
  TYPE jsonb
  USING (
    CASE
      WHEN target_roles IS NULL OR array_length(target_roles, 1) IS NULL
      THEN '[]'::jsonb
      ELSE (SELECT jsonb_agg(jsonb_build_object('role', r, 'minYoe', 0, 'maxYoe', 0))
            FROM unnest(target_roles) r)
    END
  );
ALTER TABLE public.preferences ALTER COLUMN target_roles SET DEFAULT '[]'::jsonb;
```

Existing rows are preserved — role strings are promoted to `{role, minYoe: 0, maxYoe: 0}` objects.

### Shared type (added to `src/lib/supabase/types.ts`)

```ts
export type RoleSelection = { role: string; minYoe: number; maxYoe: number }
```

`preferences.target_roles` changes from `string[]` → `RoleSelection[]` in Row, Insert, and Update.

---

## 2. Role Taxonomy (`src/lib/roles.ts`)

Static constant `ROLE_TAXONOMY: RoleCategory[]`. No sub-group label = flat chip list. With sub-groups = all-caps section separator above each group.

```
Engineering
  SOFTWARE: Software Engineer, Frontend Engineer, Mobile Engineer, DevOps Engineer, QA Engineer
  AI & DATA & ANALYTICS: Machine Learning Engineer, AI / LLM Engineer, AI / ML Research,
    Data Engineer, Data Scientist, Data Analyst
  CYBERSECURITY: Security Engineer, Offensive Security & Pentesting, SOC & Incident Response
  OTHER: Technical & Solutions Architect, Engineering Manager,
    IT & Systems Administration, Database Administration

Product (no sub-groups)
  Product Manager, Technical Product Manager, Product Designer,
  UX Researcher, UX Writer & Content Designer

Sales (no sub-groups)
  Account Executive, Account Manager, Sales Leadership, Channel / Partner Sales,
  Sales Development (SDR / BDR), Strategic Partnerships, Sales Engineer

Business (no sub-groups)
  Business Analyst, Program Manager, Project Manager,
  Leadership Development Program, Scrum Master & Agile Coach

Marketing (no sub-groups)
  Growth Marketing, Digital / Performance Marketing, Content Marketing,
  Social Media / Community, Marketing Operations, Product Marketing,
  Brand Marketing, PR & External Communications,
  Field & Event Marketing, Graphic / Brand Design, Motion / Video Production

Finance
  CORPORATE FINANCE: FP&A / Strategic Finance, Accounting, Financial Analyst,
    Corporate Development & M&A, Actuary / Insurance Analytics
  INVESTMENT FINANCE: Investment Banking, Venture Capital / Private Equity,
    Investor Relations, Treasury & Capital Markets, Sales & Trading,
    Wealth Management / Private Banking, Asset Management / Portfolio Management

Customer (no sub-groups)
  Customer Success Manager, Technical Support Engineer,
  Implementation / Professional Services

People & Legal
  PEOPLE & TALENT: Human Resources / People Ops, Talent Acquisition / Recruiting,
    Learning & Development
  LEGAL & COMPLIANCE: Legal, Compliance & Risk Management, Trust & Safety,
    Financial Crimes & AML, Privacy & Data Protection

More
  STRATEGY & OPS: Strategy & Operations, Revenue / Sales Operations, ESG / Sustainability
  CONSULTING: Strategy / Management Consulting, Technology / IT Consulting,
    Financial Advisory & Consulting
  QUANTITATIVE FINANCE: Quant Developer, Quant Research
  HARDWARE & EE: Embedded / Firmware Engineer, Semiconductor / Chip Design,
    Electrical / Hardware Engineer, Robotics Engineer, Industrial Automation
  OTHER: Technical Writer, Developer Relations
```

---

## 3. `RolePicker` Component (`src/components/features/role-picker.tsx`)

### Props

```ts
interface RolePickerProps {
  value: RoleSelection[]
  onChange: (value: RoleSelection[]) => void
}
```

Fully controlled. No internal async state.

### Layout

```
☰ ROLES                              2 SELECTED
┌──────────┐ ┌──────────┐ ┌──────────┐
│Engineering│ │ Product 2│ │  Sales   │
└──────────┘ └──────────┘ └──────────┘
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Business │ │Marketing │ │ Finance  │
└──────────┘ └──────────┘ └──────────┘
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Customer │ │P & Legal │ │   More   │
└──────────┘ └──────────┘ └──────────┘

ACTIVE CATEGORY
SUB-GROUP (if any)
[chip] [chip] [chip ✓] [chip]

YEARS OF EXPERIENCE
Role Name A        min [−  0  +]   max [−  0  +]
Role Name B        min [−  2  +]   max [−  0  +]
```

### Behavior

- **Category grid**: 3-column grid of buttons. Clicking sets active category and expands its roles below. Clicking the active category again collapses.
- **Active state**: teal border on the active category button.
- **Selection badge**: categories with ≥1 selected role show a small count badge (top-right corner of the button).
- **Role chips**: rendered as outlined buttons in a wrapping flex row. Selected chips get the teal border style.
- **Sub-group labels**: all-caps text separator, no border, between groups within a category. Omitted for flat categories.
- **Toggle**: clicking a chip adds `{ role, minYoe: 0, maxYoe: 0 }` or removes the matching entry.
- **YoE section**: rendered below the chip panel. Shows one row per selected role (across all categories), in selection order. Each row: `role label | min [− n +] | max [− n +]`. Counters increment/decrement by 1, minimum 0. `maxYoe: 0` = "no maximum" (displayed as 0).
- **Header count**: `{n} SELECTED` shown on the right of the header row; hidden when n = 0.

---

## 4. Integration Points

### Onboarding wizard (`src/components/features/onboarding-wizard.tsx`)

- Step 3 state: `targetRoles: string` → `targetRoles: RoleSelection[]` (default `[]`)
- Replace "Target roles" `<Input>` with `<RolePicker value={targetRoles} onChange={setTargetRoles} />`
- `saveStep3()`: pass `target_roles: targetRoles` directly (already the right shape for jsonb)

### Preferences form (`src/components/features/preferences-form.tsx`)

- `PreferencesValues.targetRoles: string[]` → `RoleSelection[]`
- Replace the text `<Input>` and `arrayToInput`/`inputToArray` helpers for `targetRoles` with `<RolePicker>`
- `onSave` receives `RoleSelection[]` and passes it through unchanged to Supabase

### Scoring pipeline

**`src/trigger/lib/evaluate.ts`**
- `EvaluationInput.targetRoles: string[]` → `RoleSelection[]`
- In `buildEvaluationPrompt`: change target roles line:
  ```
  - Target roles: ${targetRoles.map(r => r.role).join(', ')}
  - Years of experience per role: ${targetRoles.map(r =>
      `${r.role}: ${r.minYoe}–${r.maxYoe === 0 ? 'any' : r.maxYoe} yrs`
    ).join(', ')}
  ```

**`src/trigger/lib/apify.ts`** (line 83)
- `p.target_roles ?? []` → `(p.target_roles ?? []).map(r => r.role)`
- Also update the `preferences` type annotation on line 32 of `scrape-jobs.ts`: `target_roles: RoleSelection[] | null`

### Types (`src/lib/supabase/types.ts`)

- `preferences.Row.target_roles: string[]` → `RoleSelection[]`
- Same for Insert and Update

---

## 5. Files Changed

| File | Change |
|---|---|
| `supabase/migrations/0002_role_picker.sql` | New — DB migration |
| `src/lib/roles.ts` | New — role taxonomy constant |
| `src/lib/supabase/types.ts` | Add `RoleSelection` type; update `preferences.target_roles` |
| `src/components/features/role-picker.tsx` | New — RolePicker component |
| `src/components/features/onboarding-wizard.tsx` | Step 3: swap text input for RolePicker |
| `src/components/features/preferences-form.tsx` | Swap text input for RolePicker |
| `src/trigger/lib/evaluate.ts` | Update `EvaluationInput` type + prompt |
| `src/trigger/lib/apify.ts` | Extract `.role` from RoleSelection array |
| `src/trigger/scrape-jobs.ts` | Update `target_roles` type annotation |

---

## 6. Out of Scope

- Education, Visa Sponsorship, Job Type, Companies filters (visible in Scoutify but not part of this task)
- Free-text custom role input
- Maximum selection limit
