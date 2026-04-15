# Role Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain text `target_roles` input with a visual hierarchical role picker (category tabs → role chips → per-role YoE counters) used in onboarding step 3 and the preferences page.

**Architecture:** Migrate `preferences.target_roles` from `text[]` to `jsonb` storing `{role, minYoe, maxYoe}[]`. Build a fully-controlled `RolePicker` component backed by a static taxonomy constant. Drop it into the two existing form surfaces and update the scoring pipeline to extract role names and YoE hints.

**Tech Stack:** Next.js 15, React, Supabase (PostgreSQL), Vitest + Testing Library, Tailwind CSS, lucide-react, `cn` utility from `@/lib/utils`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0002_role_picker.sql` | Create | Migrate `target_roles text[]` → `jsonb` |
| `src/lib/roles.ts` | Create | Static role taxonomy constant |
| `src/lib/supabase/types.ts` | Modify | Add `RoleSelection` type; update `preferences.target_roles` |
| `src/components/features/role-picker.tsx` | Create | Controlled RolePicker component |
| `src/test/role-picker.test.tsx` | Create | Component tests for RolePicker |
| `src/trigger/lib/evaluate.ts` | Modify | Accept `RoleSelection[]`; include YoE in prompt |
| `src/test/evaluate.test.ts` | Modify | Update `baseInput.targetRoles` to `RoleSelection[]` |
| `src/trigger/lib/apify.ts` | Modify | Extract `.role` from `RoleSelection[]` for title search |
| `src/trigger/scrape-jobs.ts` | Modify | Update `target_roles` type annotation |
| `src/trigger/scrape-jobs-initial.ts` | Modify | Update `target_roles` type annotation |
| `src/components/features/preferences-form.tsx` | Modify | Swap text input for `RolePicker`; update types |
| `src/app/(app)/preferences/actions.ts` | Modify | Update `targetRoles: string[]` → `RoleSelection[]` |
| `src/test/preferences-form.test.tsx` | Modify | Fix broken test; update `targetRoles` type |
| `src/components/features/onboarding-wizard.tsx` | Modify | Swap step-3 text input for `RolePicker` |
| `src/test/onboarding-wizard.test.tsx` | Modify | Update `targetRoles` in any fixtures if needed |

---

## Task 1: DB Migration + `RoleSelection` Type

**Files:**
- Create: `supabase/migrations/0002_role_picker.sql`
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/0002_role_picker.sql

ALTER TABLE public.preferences
  ALTER COLUMN target_roles
  TYPE jsonb
  USING (
    CASE
      WHEN target_roles IS NULL OR array_length(target_roles, 1) IS NULL
      THEN '[]'::jsonb
      ELSE (
        SELECT jsonb_agg(
          jsonb_build_object('role', r, 'minYoe', 0, 'maxYoe', 0)
        )
        FROM unnest(target_roles) r
      )
    END
  );

ALTER TABLE public.preferences
  ALTER COLUMN target_roles SET DEFAULT '[]'::jsonb;
```

- [ ] **Step 2: Add `RoleSelection` type and update `preferences` in `src/lib/supabase/types.ts`**

Add after the `Json` type definition:

```ts
export type RoleSelection = {
  role: string
  minYoe: number
  maxYoe: number
}
```

In the `preferences` table Row/Insert/Update, change `target_roles: string[]` to `target_roles: RoleSelection[]` in all three places:

```ts
preferences: {
  Row: {
    id: string
    user_id: string
    target_roles: RoleSelection[]   // was string[]
    industries: string[]
    locations: string[]
    excluded_companies: string[]
    updated_at: string
  }
  Insert: {
    id?: string
    user_id: string
    target_roles?: RoleSelection[]  // was string[]
    industries?: string[]
    locations?: string[]
    excluded_companies?: string[]
    updated_at?: string
  }
  Update: {
    id?: string
    user_id?: string
    target_roles?: RoleSelection[]  // was string[]
    industries?: string[]
    locations?: string[]
    excluded_companies?: string[]
    updated_at?: string
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_role_picker.sql src/lib/supabase/types.ts
git commit -m "feat: migrate target_roles to jsonb and add RoleSelection type"
```

---

## Task 2: Role Taxonomy

**Files:**
- Create: `src/lib/roles.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ROLE_TAXONOMY } from '@/lib/roles'

describe('ROLE_TAXONOMY', () => {
  it('has 9 top-level categories', () => {
    expect(ROLE_TAXONOMY).toHaveLength(9)
  })

  it('Engineering category has 4 sub-groups', () => {
    const eng = ROLE_TAXONOMY.find(c => c.id === 'engineering')
    expect(eng?.groups).toHaveLength(4)
  })

  it('Product category has a single group with no label', () => {
    const product = ROLE_TAXONOMY.find(c => c.id === 'product')
    expect(product?.groups).toHaveLength(1)
    expect(product?.groups[0].label).toBeNull()
  })

  it('every role is a non-empty string', () => {
    for (const category of ROLE_TAXONOMY) {
      for (const group of category.groups) {
        for (const role of group.roles) {
          expect(typeof role).toBe('string')
          expect(role.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('More category contains Quant Developer', () => {
    const more = ROLE_TAXONOMY.find(c => c.id === 'more')
    const allRoles = more?.groups.flatMap(g => g.roles) ?? []
    expect(allRoles).toContain('Quant Developer')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/test/roles.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/roles'`

- [ ] **Step 3: Create `src/lib/roles.ts`**

```ts
export type RoleGroup = {
  label: string | null
  roles: string[]
}

export type RoleCategory = {
  id: string
  label: string
  groups: RoleGroup[]
}

export const ROLE_TAXONOMY: RoleCategory[] = [
  {
    id: 'engineering',
    label: 'Engineering',
    groups: [
      {
        label: 'SOFTWARE',
        roles: [
          'Software Engineer',
          'Frontend Engineer',
          'Mobile Engineer',
          'DevOps Engineer',
          'QA Engineer',
        ],
      },
      {
        label: 'AI & DATA & ANALYTICS',
        roles: [
          'Machine Learning Engineer',
          'AI / LLM Engineer',
          'AI / ML Research',
          'Data Engineer',
          'Data Scientist',
          'Data Analyst',
        ],
      },
      {
        label: 'CYBERSECURITY',
        roles: [
          'Security Engineer',
          'Offensive Security & Pentesting',
          'SOC & Incident Response',
        ],
      },
      {
        label: 'OTHER',
        roles: [
          'Technical & Solutions Architect',
          'Engineering Manager',
          'IT & Systems Administration',
          'Database Administration',
        ],
      },
    ],
  },
  {
    id: 'product',
    label: 'Product',
    groups: [
      {
        label: null,
        roles: [
          'Product Manager',
          'Technical Product Manager',
          'Product Designer',
          'UX Researcher',
          'UX Writer & Content Designer',
        ],
      },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    groups: [
      {
        label: null,
        roles: [
          'Account Executive',
          'Account Manager',
          'Sales Leadership',
          'Channel / Partner Sales',
          'Sales Development (SDR / BDR)',
          'Strategic Partnerships',
          'Sales Engineer',
        ],
      },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    groups: [
      {
        label: null,
        roles: [
          'Business Analyst',
          'Program Manager',
          'Project Manager',
          'Leadership Development Program',
          'Scrum Master & Agile Coach',
        ],
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    groups: [
      {
        label: null,
        roles: [
          'Growth Marketing',
          'Digital / Performance Marketing',
          'Content Marketing',
          'Social Media / Community',
          'Marketing Operations',
          'Product Marketing',
          'Brand Marketing',
          'PR & External Communications',
          'Field & Event Marketing',
          'Graphic / Brand Design',
          'Motion / Video Production',
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    groups: [
      {
        label: 'CORPORATE FINANCE',
        roles: [
          'FP&A / Strategic Finance',
          'Accounting',
          'Financial Analyst',
          'Corporate Development & M&A',
          'Actuary / Insurance Analytics',
        ],
      },
      {
        label: 'INVESTMENT FINANCE',
        roles: [
          'Investment Banking',
          'Venture Capital / Private Equity',
          'Investor Relations',
          'Treasury & Capital Markets',
          'Sales & Trading',
          'Wealth Management / Private Banking',
          'Asset Management / Portfolio Management',
        ],
      },
    ],
  },
  {
    id: 'customer',
    label: 'Customer',
    groups: [
      {
        label: null,
        roles: [
          'Customer Success Manager',
          'Technical Support Engineer',
          'Implementation / Professional Services',
        ],
      },
    ],
  },
  {
    id: 'people-legal',
    label: 'People & Legal',
    groups: [
      {
        label: 'PEOPLE & TALENT',
        roles: [
          'Human Resources / People Ops',
          'Talent Acquisition / Recruiting',
          'Learning & Development',
        ],
      },
      {
        label: 'LEGAL & COMPLIANCE',
        roles: [
          'Legal',
          'Compliance & Risk Management',
          'Trust & Safety',
          'Financial Crimes & AML',
          'Privacy & Data Protection',
        ],
      },
    ],
  },
  {
    id: 'more',
    label: 'More',
    groups: [
      {
        label: 'STRATEGY & OPS',
        roles: [
          'Strategy & Operations',
          'Revenue / Sales Operations',
          'ESG / Sustainability',
        ],
      },
      {
        label: 'CONSULTING',
        roles: [
          'Strategy / Management Consulting',
          'Technology / IT Consulting',
          'Financial Advisory & Consulting',
        ],
      },
      {
        label: 'QUANTITATIVE FINANCE',
        roles: ['Quant Developer', 'Quant Research'],
      },
      {
        label: 'HARDWARE & EE',
        roles: [
          'Embedded / Firmware Engineer',
          'Semiconductor / Chip Design',
          'Electrical / Hardware Engineer',
          'Robotics Engineer',
          'Industrial Automation',
        ],
      },
      {
        label: 'OTHER',
        roles: ['Technical Writer', 'Developer Relations'],
      },
    ],
  },
]
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/test/roles.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/roles.ts src/test/roles.test.ts
git commit -m "feat: add role taxonomy constant"
```

---

## Task 3: `RolePicker` Component

**Files:**
- Create: `src/components/features/role-picker.tsx`
- Create: `src/test/role-picker.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/test/role-picker.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RolePicker } from '@/components/features/role-picker'
import type { RoleSelection } from '@/lib/supabase/types'

describe('RolePicker', () => {
  const onChange = vi.fn()

  afterEach(() => vi.clearAllMocks())

  it('renders all 9 category buttons', () => {
    render(<RolePicker value={[]} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Engineering' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Product' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Business' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marketing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Customer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'People & Legal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })

  it('does not show SELECTED count when nothing is selected', () => {
    render(<RolePicker value={[]} onChange={onChange} />)
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument()
  })

  it('shows "2 SELECTED" when two roles are pre-selected', () => {
    const value: RoleSelection[] = [
      { role: 'Product Manager', minYoe: 0, maxYoe: 0 },
      { role: 'Technical Product Manager', minYoe: 0, maxYoe: 0 },
    ]
    render(<RolePicker value={value} onChange={onChange} />)
    expect(screen.getByText('2 SELECTED')).toBeInTheDocument()
  })

  it('clicking a category expands its roles', async () => {
    const user = userEvent.setup()
    render(<RolePicker value={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Product' }))
    expect(screen.getByRole('button', { name: 'Product Manager' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'UX Researcher' })).toBeInTheDocument()
  })

  it('clicking an active category collapses it', async () => {
    const user = userEvent.setup()
    render(<RolePicker value={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Product' }))
    await user.click(screen.getByRole('button', { name: 'Product' }))
    expect(screen.queryByRole('button', { name: 'Product Manager' })).not.toBeInTheDocument()
  })

  it('clicking a role chip calls onChange with the new selection', async () => {
    const user = userEvent.setup()
    render(<RolePicker value={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Product' }))
    await user.click(screen.getByRole('button', { name: 'Product Manager' }))
    expect(onChange).toHaveBeenCalledWith([
      { role: 'Product Manager', minYoe: 0, maxYoe: 0 },
    ])
  })

  it('clicking a selected role chip removes it', async () => {
    const user = userEvent.setup()
    const value: RoleSelection[] = [{ role: 'Product Manager', minYoe: 0, maxYoe: 0 }]
    render(<RolePicker value={value} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Product' }))
    await user.click(screen.getByRole('button', { name: 'Product Manager' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('Engineering category shows sub-group labels', async () => {
    const user = userEvent.setup()
    render(<RolePicker value={[]} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Engineering' }))
    expect(screen.getByText('SOFTWARE')).toBeInTheDocument()
    expect(screen.getByText('AI & DATA & ANALYTICS')).toBeInTheDocument()
  })

  it('shows YEARS OF EXPERIENCE section when roles are selected', () => {
    const value: RoleSelection[] = [{ role: 'Product Manager', minYoe: 0, maxYoe: 0 }]
    render(<RolePicker value={value} onChange={onChange} />)
    expect(screen.getByText(/years of experience/i)).toBeInTheDocument()
    expect(screen.getByText('Product Manager')).toBeInTheDocument()
  })

  it('does not show YEARS OF EXPERIENCE when no roles selected', () => {
    render(<RolePicker value={[]} onChange={onChange} />)
    expect(screen.queryByText(/years of experience/i)).not.toBeInTheDocument()
  })

  it('min + button calls onChange with incremented minYoe', async () => {
    const user = userEvent.setup()
    const value: RoleSelection[] = [{ role: 'Product Manager', minYoe: 0, maxYoe: 0 }]
    render(<RolePicker value={value} onChange={onChange} />)
    const increaseButtons = screen.getAllByLabelText('increase')
    await user.click(increaseButtons[0]) // first increase = minYoe
    expect(onChange).toHaveBeenCalledWith([
      { role: 'Product Manager', minYoe: 1, maxYoe: 0 },
    ])
  })

  it('min - button does not go below 0', async () => {
    const user = userEvent.setup()
    const value: RoleSelection[] = [{ role: 'Product Manager', minYoe: 0, maxYoe: 0 }]
    render(<RolePicker value={value} onChange={onChange} />)
    const decreaseButtons = screen.getAllByLabelText('decrease')
    await user.click(decreaseButtons[0])
    expect(onChange).toHaveBeenCalledWith([
      { role: 'Product Manager', minYoe: 0, maxYoe: 0 },
    ])
  })

  it('max + button calls onChange with incremented maxYoe', async () => {
    const user = userEvent.setup()
    const value: RoleSelection[] = [{ role: 'Product Manager', minYoe: 0, maxYoe: 0 }]
    render(<RolePicker value={value} onChange={onChange} />)
    const increaseButtons = screen.getAllByLabelText('increase')
    await user.click(increaseButtons[1]) // second increase = maxYoe
    expect(onChange).toHaveBeenCalledWith([
      { role: 'Product Manager', minYoe: 0, maxYoe: 1 },
    ])
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/test/role-picker.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/features/role-picker'`

- [ ] **Step 3: Create `src/components/features/role-picker.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { LayoutGrid, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROLE_TAXONOMY } from '@/lib/roles'
import type { RoleSelection } from '@/lib/supabase/types'

interface RolePickerProps {
  value: RoleSelection[]
  onChange: (value: RoleSelection[]) => void
}

export function RolePicker({ value, onChange }: RolePickerProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const selectedRoles = new Set(value.map((r) => r.role))
  const activeCategoryData = ROLE_TAXONOMY.find((c) => c.id === activeCategory)

  function toggleRole(role: string) {
    if (selectedRoles.has(role)) {
      onChange(value.filter((r) => r.role !== role))
    } else {
      onChange([...value, { role, minYoe: 0, maxYoe: 0 }])
    }
  }

  function updateYoe(role: string, field: 'minYoe' | 'maxYoe', delta: number) {
    onChange(
      value.map((r) =>
        r.role !== role ? r : { ...r, [field]: Math.max(0, r[field] + delta) }
      )
    )
  }

  function getCategoryCount(categoryId: string): number {
    const cat = ROLE_TAXONOMY.find((c) => c.id === categoryId)
    if (!cat) return 0
    return cat.groups.flatMap((g) => g.roles).filter((r) => selectedRoles.has(r)).length
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <LayoutGrid className="h-3.5 w-3.5" />
          ROLES
        </span>
        {value.length > 0 && (
          <span className="text-xs font-semibold text-primary">
            {value.length} SELECTED
          </span>
        )}
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {ROLE_TAXONOMY.map((cat) => {
          const count = getCategoryCount(cat.id)
          const isActive = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(isActive ? null : cat.id)}
              className={cn(
                'relative rounded border px-2 py-1.5 text-left text-sm transition-colors',
                isActive
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-foreground hover:border-muted-foreground'
              )}
            >
              {cat.label}
              {count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Role chips panel */}
      {activeCategoryData && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {activeCategoryData.label}
          </p>
          {activeCategoryData.groups.map((group, i) => (
            <div key={group.label ?? `_flat_${i}`} className="space-y-1.5">
              {group.label && (
                <p className="text-xs font-semibold tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {group.roles.map((role) => {
                  const isSelected = selectedRoles.has(role)
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={cn(
                        'rounded border px-2 py-1 text-sm transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-foreground hover:border-muted-foreground'
                      )}
                    >
                      {role}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* YoE section */}
      {value.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            YEARS OF EXPERIENCE
          </p>
          {value.map((r) => (
            <div key={r.role} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate">{r.role}</span>
              <span className="text-xs text-muted-foreground">min</span>
              <Counter
                value={r.minYoe}
                onChange={(delta) => updateYoe(r.role, 'minYoe', delta)}
              />
              <span className="text-xs text-muted-foreground">max</span>
              <Counter
                value={r.maxYoe}
                onChange={(delta) => updateYoe(r.role, 'maxYoe', delta)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Counter({
  value,
  onChange,
}: {
  value: number
  onChange: (delta: number) => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(-1)}
        aria-label="decrease"
        className="flex h-6 w-6 items-center justify-center rounded border border-border text-sm hover:border-primary"
      >
        −
      </button>
      <span className="w-6 text-center tabular-nums text-sm">{value}</span>
      <button
        type="button"
        onClick={() => onChange(1)}
        aria-label="increase"
        className="flex h-6 w-6 items-center justify-center rounded border border-border text-sm hover:border-primary"
      >
        +
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/role-picker.test.tsx
```

Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/features/role-picker.tsx src/test/role-picker.test.tsx
git commit -m "feat: add RolePicker component with YoE counters"
```

---

## Task 4: Update `evaluate.ts` + Tests

**Files:**
- Modify: `src/trigger/lib/evaluate.ts`
- Modify: `src/test/evaluate.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `src/test/evaluate.test.ts`, change `baseInput` from `targetRoles: string[]` to `RoleSelection[]`, and add a test for the YoE line:

```ts
import { describe, it, expect } from 'vitest'
import { buildEvaluationPrompt, parseEvaluationResponse } from '@/trigger/lib/evaluate'
import type { RoleSelection } from '@/lib/supabase/types'

const baseInput = {
  jobTitle: 'Head of Product',
  jobCompany: 'Acme Corp',
  jobDescription: 'We are looking for...',
  cvText: 'My background includes...',
  targetRoles: [{ role: 'Product Manager', minYoe: 2, maxYoe: 5 }] as RoleSelection[],
  industries: ['Fintech'],
  locations: ['Zurich'],
  excludedCompanies: [],
}
```

Add one new test at the end of the `buildEvaluationPrompt` describe block:

```ts
it('includes YoE hint in the prompt', () => {
  const prompt = buildEvaluationPrompt(baseInput)
  expect(prompt).toContain('Product Manager: 2–5 yrs')
})

it('renders maxYoe 0 as "any" in the YoE hint', () => {
  const input = {
    ...baseInput,
    targetRoles: [{ role: 'Product Manager', minYoe: 0, maxYoe: 0 }] as RoleSelection[],
  }
  expect(buildEvaluationPrompt(input)).toContain('Product Manager: 0–any yrs')
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/evaluate.test.ts
```

Expected: FAIL on type mismatch and missing YoE line

- [ ] **Step 3: Update `src/trigger/lib/evaluate.ts`**

Change `EvaluationInput` and `buildEvaluationPrompt`:

```ts
import { scoreResponseSchema, type ScoreResponse } from './score-schema'
import type { RoleSelection } from '@/lib/supabase/types'

interface EvaluationInput {
  jobTitle: string
  jobCompany: string
  jobDescription: string
  cvText: string
  targetRoles: RoleSelection[]
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

  const roleNames = targetRoles.length > 0
    ? targetRoles.map((r) => r.role).join(', ')
    : 'Not specified'

  const yoeHint = targetRoles.length > 0
    ? targetRoles
        .map((r) => `${r.role}: ${r.minYoe}–${r.maxYoe === 0 ? 'any' : r.maxYoe} yrs`)
        .join(', ')
    : 'Not specified'

  return `You are a career advisor evaluating how well a job matches a candidate's profile.

## Candidate CV
${cvText}

## Candidate Preferences
- Target roles: ${roleNames}
- Years of experience per role: ${yoeHint}
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
```

Keep `parseEvaluationResponse` and `callOpenRouter` unchanged.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/evaluate.test.ts
```

Expected: PASS (all existing + 2 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/trigger/lib/evaluate.ts src/test/evaluate.test.ts
git commit -m "feat: update evaluate prompt to use RoleSelection with YoE hints"
```

---

## Task 5: Update Pipeline Type Annotations

**Files:**
- Modify: `src/trigger/lib/apify.ts` (line 73, 83)
- Modify: `src/trigger/scrape-jobs.ts` (line 32)
- Modify: `src/trigger/scrape-jobs-initial.ts` (line 25)
- Modify: `src/trigger/evaluate-jobs.ts` (line 70)

- [ ] **Step 1: Update `src/trigger/lib/apify.ts`**

Add import at top of file:

```ts
import type { RoleSelection } from '@/lib/supabase/types'
```

Change line 73 (the `preferences` parameter type in `scrapeAll` or related function):

```ts
// Before:
target_roles: string[]
// After:
target_roles: RoleSelection[]
```

Change line 83 (the `titleSearch` derivation):

```ts
// Before:
const titleSearch = [...new Set(preferences.flatMap(p => p.target_roles ?? []))]
// After:
const titleSearch = [...new Set(preferences.flatMap(p => (p.target_roles ?? []).map(r => r.role)))]
```

- [ ] **Step 2: Update `src/trigger/scrape-jobs.ts`**

Add import at top:

```ts
import type { RoleSelection } from '@/lib/supabase/types'
```

Change the type annotation on line 32 from:

```ts
target_roles: string[] | null
```

to:

```ts
target_roles: RoleSelection[] | null
```

Also update line 36:

```ts
// Before:
target_roles: p.target_roles ?? [],
// After:
target_roles: p.target_roles ?? [],  // unchanged — type now RoleSelection[]
```

(Line 36 value is unchanged; only the type annotation on line 32 changes.)

- [ ] **Step 3: Update `src/trigger/scrape-jobs-initial.ts`**

Add import at top:

```ts
import type { RoleSelection } from '@/lib/supabase/types'
```

Change the `preferences` array construction (around line 23–27):

```ts
const preferences = [
  {
    target_roles: prefs.target_roles ?? [] as RoleSelection[],
    locations: prefs.locations ?? [],
    excluded_companies: prefs.excluded_companies ?? [],
  },
]
```

- [ ] **Step 4: Update `src/trigger/evaluate-jobs.ts`**

Add import at top:

```ts
import type { RoleSelection } from '@/lib/supabase/types'
```

Change line 70 from:

```ts
targetRoles: prefs?.target_roles ?? [],
```

to:

```ts
targetRoles: (prefs?.target_roles ?? []) as RoleSelection[],
```

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/trigger/lib/apify.ts src/trigger/scrape-jobs.ts src/trigger/scrape-jobs-initial.ts src/trigger/evaluate-jobs.ts
git commit -m "feat: update pipeline to use RoleSelection[] for target_roles"
```

---

## Task 6: Update `preferences-form.tsx` + `actions.ts` + Tests

**Files:**
- Modify: `src/components/features/preferences-form.tsx`
- Modify: `src/app/(app)/preferences/actions.ts`
- Modify: `src/test/preferences-form.test.tsx`

- [ ] **Step 1: Update the test first**

Replace `src/test/preferences-form.test.tsx` with:

```ts
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreferencesForm } from '@/components/features/preferences-form'
import type { RoleSelection } from '@/lib/supabase/types'

const defaultValues = {
  cvText: 'My CV content here.',
  targetRoles: [{ role: 'Head of Product', minYoe: 0, maxYoe: 0 }] as RoleSelection[],
  industries: ['Fintech'],
  locations: ['Zurich'],
  excludedCompanies: [],
}

describe('PreferencesForm', () => {
  it('renders CV textarea with initial value', () => {
    render(<PreferencesForm defaultValues={defaultValues} onSave={vi.fn()} />)
    expect(screen.getByDisplayValue('My CV content here.')).toBeInTheDocument()
  })

  it('renders the role picker with ROLES header', () => {
    render(<PreferencesForm defaultValues={defaultValues} onSave={vi.fn()} />)
    expect(screen.getByText('ROLES')).toBeInTheDocument()
  })

  it('shows pre-selected role count', () => {
    render(<PreferencesForm defaultValues={defaultValues} onSave={vi.fn()} />)
    expect(screen.getByText('1 SELECTED')).toBeInTheDocument()
  })

  it('calls onSave when form is submitted', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<PreferencesForm defaultValues={defaultValues} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/test/preferences-form.test.tsx
```

Expected: FAIL — `targetRoles` type mismatch and missing `ROLES` element

- [ ] **Step 3: Update `src/components/features/preferences-form.tsx`**

Replace the full file:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { posthog } from '@/lib/posthog'
import { RolePicker } from '@/components/features/role-picker'
import type { RoleSelection } from '@/lib/supabase/types'

interface PreferencesValues {
  cvText: string
  targetRoles: RoleSelection[]
  industries: string[]
  locations: string[]
  excludedCompanies: string[]
}

interface PreferencesFormProps {
  defaultValues: PreferencesValues
  onSave: (values: PreferencesValues) => Promise<void>
}

function arrayToInput(arr: string[]) {
  return arr.join(', ')
}

function inputToArray(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

export function PreferencesForm({ defaultValues, onSave }: PreferencesFormProps) {
  const [cvText, setCvText] = useState(defaultValues.cvText)
  const [targetRoles, setTargetRoles] = useState<RoleSelection[]>(defaultValues.targetRoles)
  const [industries, setIndustries] = useState(arrayToInput(defaultValues.industries))
  const [locations, setLocations] = useState(arrayToInput(defaultValues.locations))
  const [excludedCompanies, setExcludedCompanies] = useState(arrayToInput(defaultValues.excludedCompanies))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({
      cvText,
      targetRoles,
      industries: inputToArray(industries),
      locations: inputToArray(locations),
      excludedCompanies: inputToArray(excludedCompanies),
    })
    posthog.capture('preferences_updated')
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="cv">Your CV</Label>
        <Textarea
          id="cv"
          rows={10}
          className="resize-none font-mono text-sm"
          value={cvText}
          onChange={e => setCvText(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{cvText.length} characters</p>
      </div>

      <div className="space-y-1.5">
        <RolePicker value={targetRoles} onChange={setTargetRoles} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="industries">Industries</Label>
        <Input
          id="industries"
          placeholder="Fintech, SaaS, VC"
          value={industries}
          onChange={e => setIndustries(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="locations">Locations</Label>
        <Input
          id="locations"
          placeholder="Zurich, Remote, Berlin"
          value={locations}
          onChange={e => setLocations(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="excluded">Excluded companies</Label>
        <Input
          id="excluded"
          placeholder="BigCorp, SlowBank"
          value={excludedCompanies}
          onChange={e => setExcludedCompanies(e.target.value)}
        />
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save preferences'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Update `src/app/(app)/preferences/actions.ts`**

Change `targetRoles: string[]` to `RoleSelection[]`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateProfile, updatePreferences } from '@/lib/supabase/queries'
import type { RoleSelection } from '@/lib/supabase/types'

export async function savePreferences(values: {
  cvText: string
  targetRoles: RoleSelection[]
  industries: string[]
  locations: string[]
  excludedCompanies: string[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await Promise.all([
    updateProfile(user.id, { cv_text: values.cvText }),
    updatePreferences(user.id, {
      target_roles: values.targetRoles,
      industries: values.industries,
      locations: values.locations,
      excluded_companies: values.excludedCompanies,
    }),
  ])

  revalidatePath('/preferences')
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run src/test/preferences-form.test.tsx
```

Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/features/preferences-form.tsx src/app/(app)/preferences/actions.ts src/test/preferences-form.test.tsx
git commit -m "feat: replace target roles text input with RolePicker in preferences form"
```

---

## Task 7: Update `onboarding-wizard.tsx` + Tests

**Files:**
- Modify: `src/components/features/onboarding-wizard.tsx`
- Modify: `src/test/onboarding-wizard.test.tsx`

- [ ] **Step 1: Run existing wizard tests to establish baseline**

```bash
npx vitest run src/test/onboarding-wizard.test.tsx
```

Expected: PASS (all 7 existing tests — they don't test the roles field directly)

- [ ] **Step 2: Update `src/components/features/onboarding-wizard.tsx`**

Add imports at the top:

```ts
import { RolePicker } from '@/components/features/role-picker'
import type { RoleSelection } from '@/lib/supabase/types'
```

Change the step 3 state declaration (around line 47):

```ts
// Before:
const [targetRoles, setTargetRoles] = useState('')
// After:
const [targetRoles, setTargetRoles] = useState<RoleSelection[]>([])
```

Update `saveStep3()` — remove `parseCommaSeparated(targetRoles)` and pass directly:

```ts
async function saveStep3() {
  setSaving(true)
  setSaveError(null)
  const { error } = await supabase
    .from('preferences')
    .upsert({
      user_id: userId,
      target_roles: targetRoles,
      industries: parseCommaSeparated(industries),
      locations,
      excluded_companies: parseCommaSeparated(excludedCompanies),
      remote_preference: remotePreference,
    }, { onConflict: 'user_id' })
  setSaving(false)
  if (error) { setSaveError(error.message); return }
  setStep(4)
}
```

In the step 3 JSX, replace the "Target roles" `<Label>` + `<Input>` block:

```tsx
{/* Remove this block entirely: */}
{/* <div className="space-y-1">
  <Label>Target roles</Label>
  <Input
    placeholder="Head of Product, VP Biz Dev, PM"
    value={targetRoles}
    onChange={e => setTargetRoles(e.target.value)}
  />
</div> */}

{/* Replace with: */}
<div className="space-y-1">
  <RolePicker value={targetRoles} onChange={setTargetRoles} />
</div>
```

- [ ] **Step 3: Run wizard tests to confirm they still pass**

```bash
npx vitest run src/test/onboarding-wizard.test.tsx
```

Expected: PASS (all 7 tests — none tested the roles text input directly)

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/features/onboarding-wizard.tsx src/test/onboarding-wizard.test.tsx
git commit -m "feat: replace target roles text input with RolePicker in onboarding wizard"
```

---

## Final Check

- [ ] **Run full test suite one last time**

```bash
npx vitest run
```

Expected: all tests pass, no TypeScript errors in IDE

- [ ] **Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors
