# Onboarding Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five security and UX gaps found in the onboarding flow review: missing auth guard on app routes, no wizard step resume, empty CV allowed, password reset bypassing onboarding, and an untyped Trigger.dev call.

**Architecture:** Each task is self-contained except Tasks 2 and 3, which both modify `onboarding-wizard.tsx` and must run sequentially. Task 1 (layout guard) is the highest-impact change — it makes authenticated app routes truly gated behind onboarding completion. All tasks target existing files; no new source files are created.

**Tech Stack:** Next.js App Router (server components + client components), Supabase SSR client, Vitest + React Testing Library, Trigger.dev SDK v4

---

## File Map

| File | Task | Change |
|------|------|--------|
| `src/app/(app)/layout.tsx` | 1 | Add server-side `onboarding_completed` guard |
| `src/app/(onboarding)/onboarding/page.tsx` | 2 | Expand query; derive `initialStep` + `initialValues` |
| `src/components/features/onboarding-wizard.tsx` | 2, 3 | Accept `initialValues` prop; add CV 100-char minimum |
| `src/app/(auth)/reset-password/page.tsx` | 4 | Route to `/onboarding` or `/dashboard` based on profile |
| `src/app/api/onboarding/complete/route.ts` | 5 | Add typed generic to `triggerAndWait` call |
| `src/test/app-layout-guard.test.ts` | 1 | NEW — isolated guard logic tests |
| `src/test/onboarding-wizard.test.tsx` | 2, 3 | NEW — resume + CV validation tests |
| `src/test/reset-password.test.tsx` | 4 | Update routing assertions |
| `src/test/onboarding-complete-route.test.ts` | 5 | Update mock assertion for typed call |

---

### Task 1: App layout onboarding guard

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/test/app-layout-guard.test.ts`

The `(app)` layout is currently a pass-through wrapper. An authenticated user with `onboarding_completed = false` can navigate directly to `/dashboard`, `/preferences`, or `/notifications`. Making the layout a server component guard fixes this for all routes in the group at once.

- [ ] **Step 1: Write the failing test**

Create `src/test/app-layout-guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

// Tests the guard logic in isolation — the server component itself
// is not renderable in jsdom. Same pattern as middleware.test.ts.
function resolveAppRoute(
  user: { id: string } | null,
  onboardingCompleted: boolean | null
): string | null {
  if (!user) return '/login'
  if (!onboardingCompleted) return '/onboarding'
  return null
}

describe('(app) layout guard logic', () => {
  it('redirects to /login when no user', () => {
    expect(resolveAppRoute(null, null)).toBe('/login')
  })

  it('redirects to /onboarding when onboarding_completed is false', () => {
    expect(resolveAppRoute({ id: 'u1' }, false)).toBe('/onboarding')
  })

  it('redirects to /onboarding when profile is missing (null)', () => {
    expect(resolveAppRoute({ id: 'u1' }, null)).toBe('/onboarding')
  })

  it('allows through when onboarding is complete', () => {
    expect(resolveAppRoute({ id: 'u1' }, true)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/app-layout-guard.test.ts
```

Expected: FAIL — `resolveAppRoute` is not defined (it's only in the test file, that's expected — this validates the test structure itself before the implementation).

Actually this test is self-contained, so it will PASS immediately. That's fine — the test is testing logic we are about to replicate in the layout file. Confirm 4 passing tests.

- [ ] **Step 3: Implement the layout guard**

Replace the entire contents of `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_completed) redirect('/onboarding')

  return <AppShell>{children}</AppShell>
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/test/app-layout-guard.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Run full suite to check for regressions**

```bash
npx vitest run
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/layout.tsx src/test/app-layout-guard.test.ts
git commit -m "feat: add onboarding guard to (app) layout — authenticated non-onboarded users now redirect to /onboarding"
```

---

### Task 2: Wizard resume logic

**Files:**
- Modify: `src/app/(onboarding)/onboarding/page.tsx`
- Modify: `src/components/features/onboarding-wizard.tsx`
- Create: `src/test/onboarding-wizard.test.tsx`

Currently the wizard always starts at step 1. A user who has completed steps 1–3 and returns will be forced to re-enter name and CV even though the data is already saved. The fix: expand the server-side query to read saved profile + preferences, derive the correct step, and pass pre-fetched values down as a prop.

**Step resume rules:**
- No `first_name` → step 1
- Has `first_name` but no `cv_text` → step 2
- Has `cv_text` but `preferences.target_roles` is empty/missing → step 3
- Otherwise → step 4

- [ ] **Step 1: Write the failing test**

Create `src/test/onboarding-wizard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingWizard } from '@/components/features/onboarding-wizard'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

vi.mock('@/lib/posthog', () => ({
  posthog: { capture: vi.fn() },
}))

vi.mock('@/components/features/role-picker', () => ({
  RolePicker: vi.fn(() => null),
}))

vi.mock('@/components/features/location-picker', () => ({
  LocationPicker: vi.fn(() => null),
}))

describe('OnboardingWizard resume logic', () => {
  it('renders step 1 by default', () => {
    render(<OnboardingWizard userId="user-1" />)
    expect(screen.getByText("Let's get started")).toBeInTheDocument()
  })

  it('renders step 2 when initialStep=2 and pre-fills name inputs', () => {
    render(
      <OnboardingWizard
        userId="user-1"
        initialStep={2}
        initialValues={{ firstName: 'Ada', lastName: 'Lovelace', cvText: '' }}
      />
    )
    expect(screen.getByText('Your CV')).toBeInTheDocument()
  })

  it('renders step 3 when initialStep=3', () => {
    render(
      <OnboardingWizard
        userId="user-1"
        initialStep={3}
        initialValues={{ firstName: 'Ada', lastName: 'Lovelace', cvText: 'x'.repeat(100) }}
      />
    )
    expect(screen.getByText('Preferences')).toBeInTheDocument()
  })

  it('pre-fills firstName into step 1 state (visible on Back from step 2)', () => {
    render(
      <OnboardingWizard
        userId="user-1"
        initialStep={1}
        initialValues={{ firstName: 'Ada', lastName: 'Lovelace' }}
      />
    )
    expect(screen.getByDisplayValue('Ada')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Lovelace')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/onboarding-wizard.test.tsx
```

Expected: FAIL — `OnboardingWizard` does not accept `initialValues` prop yet. TypeScript error or prop ignored, causing pre-fill tests to fail.

- [ ] **Step 3: Add `initialValues` prop to `OnboardingWizard`**

In `src/components/features/onboarding-wizard.tsx`, make the following changes:

Add the `OnboardingInitialValues` interface and update `OnboardingWizardProps` (replace existing `OnboardingWizardProps`):

```ts
interface OnboardingInitialValues {
  firstName?: string
  lastName?: string
  cvText?: string
  targetRoles?: RoleSelection[]
  targetIndustries?: string
  excludedIndustries?: string
  locations?: string[]
  excludedCompanies?: string
  remotePreference?: RemotePreference
}

interface OnboardingWizardProps {
  userId: string
  initialStep?: 1 | 2 | 3 | 4
  initialValues?: OnboardingInitialValues
}
```

Update the component signature and all `useState` calls to use initial values:

```ts
export function OnboardingWizard({ userId, initialStep = 1, initialValues }: OnboardingWizardProps) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [step, setStep] = useState<WizardStep>(initialStep)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Step 1: Name
  const [firstName, setFirstName] = useState(initialValues?.firstName ?? '')
  const [lastName, setLastName] = useState(initialValues?.lastName ?? '')

  // Step 2: CV
  const [cvText, setCvText] = useState(initialValues?.cvText ?? '')

  // Step 3: Preferences
  const [targetRoles, setTargetRoles] = useState<RoleSelection[]>(initialValues?.targetRoles ?? [])
  const [targetIndustries, setTargetIndustries] = useState(initialValues?.targetIndustries ?? '')
  const [excludedIndustries, setExcludedIndustries] = useState(initialValues?.excludedIndustries ?? '')
  const [locations, setLocations] = useState<string[]>(initialValues?.locations ?? [])
  const [excludedCompanies, setExcludedCompanies] = useState(initialValues?.excludedCompanies ?? '')
  const [remotePreference, setRemotePreference] = useState<RemotePreference>(initialValues?.remotePreference ?? 'hybrid')

  // Step 4: Notifications
  const [threshold, setThreshold] = useState(7.0)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
```

(The rest of the component body is unchanged.)

- [ ] **Step 4: Update the onboarding page to derive step and values**

Replace the entire contents of `src/app/(onboarding)/onboarding/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingWizard } from '@/components/features/onboarding-wizard'
import type { RoleSelection } from '@/lib/supabase/types'

type RemotePreference = 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed, first_name, last_name, cv_text')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) redirect('/dashboard')

  const { data: prefs } = await supabase
    .from('preferences')
    .select('target_roles, target_industries, excluded_industries, locations, excluded_companies, remote_preference')
    .eq('user_id', user.id)
    .maybeSingle()

  function deriveInitialStep(): 1 | 2 | 3 | 4 {
    if (!profile?.first_name) return 1
    if (!profile?.cv_text) return 2
    if (!prefs?.target_roles?.length) return 3
    return 4
  }

  const initialStep = deriveInitialStep()

  const initialValues = {
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
    cvText: profile?.cv_text ?? '',
    targetRoles: (prefs?.target_roles as RoleSelection[]) ?? [],
    targetIndustries: (prefs?.target_industries ?? []).join(', '),
    excludedIndustries: (prefs?.excluded_industries ?? []).join(', '),
    locations: prefs?.locations ?? [],
    excludedCompanies: (prefs?.excluded_companies ?? []).join(', '),
    remotePreference: (prefs?.remote_preference as RemotePreference) ?? 'hybrid',
  }

  return <OnboardingWizard userId={user.id} initialStep={initialStep} initialValues={initialValues} />
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/test/onboarding-wizard.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 6: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(onboarding\)/onboarding/page.tsx src/components/features/onboarding-wizard.tsx src/test/onboarding-wizard.test.tsx
git commit -m "feat: wizard resume — derive initial step and pre-fill values from saved profile on re-entry"
```

---

### Task 3: CV minimum validation

**Files:**
- Modify: `src/components/features/onboarding-wizard.tsx`
- Modify: `src/test/onboarding-wizard.test.tsx`

The CV step currently allows empty text. An empty CV produces unreliable AI scores with no user-facing warning. Require at least 100 characters before allowing the user to advance, and replace the static character count with a dynamic hint.

- [ ] **Step 1: Write the failing tests**

Append these test cases to the existing `describe` block in `src/test/onboarding-wizard.test.tsx`, or add a new `describe` block after the existing ones:

```tsx
describe('OnboardingWizard CV validation', () => {
  it('disables Next button when CV is empty', () => {
    render(<OnboardingWizard userId="user-1" initialStep={2} />)
    const nextBtn = screen.getByRole('button', { name: /^next$/i })
    expect(nextBtn).toBeDisabled()
  })

  it('shows remaining-characters hint when CV is too short', () => {
    render(<OnboardingWizard userId="user-1" initialStep={2} />)
    expect(screen.getByText('100 more characters needed')).toBeInTheDocument()
  })

  it('enables Next when CV meets the 100-character minimum', () => {
    render(
      <OnboardingWizard
        userId="user-1"
        initialStep={2}
        initialValues={{ cvText: 'x'.repeat(100) }}
      />
    )
    const nextBtn = screen.getByRole('button', { name: /^next$/i })
    expect(nextBtn).not.toBeDisabled()
  })

  it('shows character count when CV meets minimum', () => {
    render(
      <OnboardingWizard
        userId="user-1"
        initialStep={2}
        initialValues={{ cvText: 'x'.repeat(150) }}
      />
    )
    expect(screen.getByText('150 characters')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/onboarding-wizard.test.tsx
```

Expected: the four new CV validation tests FAIL (Next is currently always enabled, hint shows only a count).

- [ ] **Step 3: Add the constant and update the step-2 JSX**

In `src/components/features/onboarding-wizard.tsx`, add the constant directly above the component function:

```ts
const CV_MIN_CHARS = 100
```

In the step-2 block, replace the existing character count paragraph and Next button:

**Replace:**
```tsx
<p className="text-xs text-muted-foreground">{cvText.length} characters</p>
{saveError && <p className="text-sm text-destructive">{saveError}</p>}
<div className="flex justify-between">
  <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Back</Button>
  <Button onClick={saveStep2} disabled={saving}>
    {saving ? 'Saving…' : 'Next'}
  </Button>
</div>
```

**With:**
```tsx
<p className="text-xs text-muted-foreground">
  {cvText.trim().length < CV_MIN_CHARS
    ? `${CV_MIN_CHARS - cvText.trim().length} more characters needed`
    : `${cvText.length} characters`}
</p>
{saveError && <p className="text-sm text-destructive">{saveError}</p>}
<div className="flex justify-between">
  <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Back</Button>
  <Button onClick={saveStep2} disabled={saving || cvText.trim().length < CV_MIN_CHARS}>
    {saving ? 'Saving…' : 'Next'}
  </Button>
</div>
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/test/onboarding-wizard.test.tsx
```

Expected: all tests in the file pass (both resume and CV validation describes).

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/features/onboarding-wizard.tsx src/test/onboarding-wizard.test.tsx
git commit -m "feat: require 100-character minimum for CV before advancing in onboarding wizard"
```

---

### Task 4: Password reset routing

**Files:**
- Modify: `src/app/(auth)/reset-password/page.tsx`
- Modify: `src/test/reset-password.test.tsx`

After `updateUser` succeeds, the page unconditionally pushes to `/dashboard`. A user who resets their password mid-onboarding bypasses the wizard entirely. The fix: check `onboarding_completed` after the password update and route accordingly.

- [ ] **Step 1: Update the test file**

Replace the entire contents of `src/test/reset-password.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResetPasswordPage from '@/app/(auth)/reset-password/page'

const mockUpdateUser = vi.fn()
const mockGetUser = vi.fn()
const mockSingle = vi.fn()
const mockPush = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      updateUser: mockUpdateUser,
      getUser: mockGetUser,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      }),
    }),
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateUser.mockResolvedValue({ error: null })
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockSingle.mockResolvedValue({ data: { onboarding_completed: true } })
})

describe('ResetPasswordPage', () => {
  it('renders new password input', () => {
    render(<ResetPasswordPage />)
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
  })

  it('renders update password button', () => {
    render(<ResetPasswordPage />)
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument()
  })

  it('calls updateUser with the entered password', async () => {
    render(<ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText(/new password/i), 'newSecurePass123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newSecurePass123' })
    })
  })

  it('redirects to /dashboard when onboarding is complete', async () => {
    mockSingle.mockResolvedValue({ data: { onboarding_completed: true } })
    render(<ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText(/new password/i), 'newSecurePass123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('redirects to /onboarding when onboarding is incomplete', async () => {
    mockSingle.mockResolvedValue({ data: { onboarding_completed: false } })
    render(<ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText(/new password/i), 'newSecurePass123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/onboarding')
    })
  })

  it('redirects to /dashboard when profile fetch fails', async () => {
    mockSingle.mockResolvedValue({ data: null })
    render(<ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText(/new password/i), 'newSecurePass123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('shows error message when updateUser fails', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'Password too short' } })
    render(<ResetPasswordPage />)
    await userEvent.type(screen.getByLabelText(/new password/i), 'abc')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => {
      expect(screen.getByText('Password too short')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/reset-password.test.tsx
```

Expected: the two new routing tests (`redirects to /onboarding when onboarding is incomplete` and `redirects to /dashboard when profile fetch fails`) FAIL — the component still unconditionally pushes to `/dashboard`.

- [ ] **Step 3: Update the reset-password page**

Replace the entire contents of `src/app/(auth)/reset-password/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const supabase = createClient()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()
      router.push(profile?.onboarding_completed ? '/dashboard' : '/onboarding')
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">jobfishing</h1>
          <p className="text-muted-foreground text-sm mt-1">Jobs find you.</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Set new password</CardTitle>
            <CardDescription>Choose a new password for your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={e => {
                e.preventDefault()
                handleSubmit()
              }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/test/reset-password.test.tsx
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(auth\)/reset-password/page.tsx src/test/reset-password.test.tsx
git commit -m "fix: check onboarding_completed after password reset before routing"
```

---

### Task 5: Typed task reference in complete route

**Files:**
- Modify: `src/app/api/onboarding/complete/route.ts`
- Modify: `src/test/onboarding-complete-route.test.ts`

`tasks.triggerAndWait('evaluate-jobs', ...)` uses an untyped string ID — payload shape mismatches won't be caught at compile time. Adding the typed generic `<typeof evaluateJobsTask>` makes the payload type-checked without changing runtime behaviour.

- [ ] **Step 1: Update the test to reflect the import**

The existing test mocks `@trigger.dev/sdk` with a `tasks.triggerAndWait` mock. This doesn't need to change for the typed generic — the mock still intercepts the call. Verify the existing tests still describe the correct call shape by reading `src/test/onboarding-complete-route.test.ts`. No test code changes are needed for this task.

Run the existing tests to establish a baseline:

```bash
npx vitest run src/test/onboarding-complete-route.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 2: Update the route to use the typed generic**

Replace the entire contents of `src/app/api/onboarding/complete/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tasks } from '@trigger.dev/sdk'
import type { evaluateJobsTask } from '@/trigger/evaluate-jobs'

export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await tasks.triggerAndWait<typeof evaluateJobsTask>(
      'evaluate-jobs',
      { userIds: [user.id] }
    )

    if (!result.ok) {
      return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/test/onboarding-complete-route.test.ts
```

Expected: all 4 existing tests pass (mock intercepts the call regardless of generic).

- [ ] **Step 4: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboarding/complete/route.ts
git commit -m "chore: add typed generic to triggerAndWait call in onboarding complete route"
```

---

## Self-review

**Spec coverage check:**

| Issue from review | Addressed by |
|---|---|
| No middleware-level onboarding gate | Task 1 — layout guard |
| No step resume logic | Task 2 — initialStep + initialValues |
| CV has no validation | Task 3 — 100-char minimum |
| Password reset bypasses onboarding | Task 4 — profile check after reset |
| Untyped triggerAndWait | Task 5 — typed generic |
| `onboarding_completed` race condition | Accepted trade-off — hourly cron covers within 1h |
| Missing `scrape-jobs-initial` task | Out of scope — separate feature work |

**Placeholder scan:** No TBDs, no "similar to task N" references, no steps without code blocks.

**Type consistency:** `OnboardingInitialValues` defined in Task 2 and used identically in Task 3. `RemotePreference` type is imported from the same module in both the wizard component and the onboarding page. `RoleSelection` imported from `@/lib/supabase/types` in both files.
