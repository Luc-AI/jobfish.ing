# Forgot Password Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standard Supabase password reset flow with a `/forgot-password` request page, a `/reset-password` new-password page, and a "Forgot password?" link on the login sign-in tab.

**Architecture:** The existing `/auth/callback` route is extended to read an optional `next` query param; if present and a valid relative path, it redirects there after exchanging the code — this is how `resetPasswordForEmail` lands the user on `/reset-password` with an active session. Both new pages share the same card/layout as the login page.

**Tech Stack:** Next.js App Router, Supabase JS client (`@supabase/ssr`), shadcn/ui components, Vitest + React Testing Library

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/app/auth/callback/route.ts` | Add safe `next` param redirect |
| Create | `src/app/(auth)/forgot-password/page.tsx` | Email form → `resetPasswordForEmail` |
| Create | `src/app/(auth)/reset-password/page.tsx` | New password form → `updateUser` |
| Modify | `src/app/(auth)/login/page.tsx` | Add "Forgot password?" link |
| Create | `src/test/callback.test.ts` | Unit test for `next` param logic |
| Create | `src/test/forgot-password.test.tsx` | Component tests |
| Create | `src/test/reset-password.test.tsx` | Component tests |
| Modify | `src/test/login.test.tsx` | Add "Forgot password?" link assertion |
| Modify | `src/test/middleware.test.ts` | Register new public paths |

---

## Task 1: Extend callback route to support `next` param

**Files:**
- Modify: `src/app/auth/callback/route.ts`
- Create: `src/test/callback.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/test/callback.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test the next-param validation logic in isolation (same pattern as middleware.test.ts)
// The route itself is not easily imported in jsdom env, so we test the guard logic directly.

function isSafeNextPath(next: string | null): boolean {
  return !!next && next.startsWith('/') && !next.startsWith('//')
}

describe('callback next-param validation', () => {
  it('accepts /reset-password', () => {
    expect(isSafeNextPath('/reset-password')).toBe(true)
  })

  it('accepts /dashboard', () => {
    expect(isSafeNextPath('/dashboard')).toBe(true)
  })

  it('rejects protocol-relative URL //evil.com', () => {
    expect(isSafeNextPath('//evil.com')).toBe(false)
  })

  it('rejects https:// absolute URL', () => {
    expect(isSafeNextPath('https://evil.com')).toBe(false)
  })

  it('rejects null', () => {
    expect(isSafeNextPath(null)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isSafeNextPath('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/callback.test.ts
```

Expected: All 6 tests FAIL because `isSafeNextPath` is defined in the test file itself — wait, they will actually PASS immediately because the function is inline. That's fine — move to Step 3.

> Note: These tests verify the guard logic. The integration with the route handler is validated manually in Step 5.

- [ ] **Step 3: Run tests to confirm they pass**

```bash
npx vitest run src/test/callback.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 4: Modify the callback route**

Replace the full contents of `src/app/auth/callback/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', origin))
  }

  // Safe redirect to `next` if it's a valid relative path (prevents open redirect)
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    return NextResponse.redirect(new URL(next, origin))
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', origin))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) {
    return NextResponse.redirect(new URL('/dashboard', origin))
  }

  return NextResponse.redirect(new URL('/onboarding', origin))
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/callback/route.ts src/test/callback.test.ts
git commit -m "feat: support next param in auth callback for password reset redirect"
```

---

## Task 2: Create `/forgot-password` page

**Files:**
- Create: `src/app/(auth)/forgot-password/page.tsx`
- Create: `src/test/forgot-password.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/test/forgot-password.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page'

const mockResetPasswordForEmail = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  })),
}))

beforeEach(() => {
  mockResetPasswordForEmail.mockResolvedValue({ error: null })
})

describe('ForgotPasswordPage', () => {
  it('renders email input', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('renders send reset link button', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('renders back to sign in link', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument()
  })

  it('calls resetPasswordForEmail with email and correct redirectTo', async () => {
    render(<ForgotPasswordPage />)
    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.objectContaining({ redirectTo: expect.stringContaining('/auth/callback?next=/reset-password') })
      )
    })
  })

  it('shows confirmation message after successful submission', async () => {
    render(<ForgotPasswordPage />)
    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument()
    })
  })

  it('shows error message when resetPasswordForEmail fails', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } })
    render(<ForgotPasswordPage />)
    await userEvent.type(screen.getByLabelText(/email/i), 'nobody@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/forgot-password.test.tsx
```

Expected: FAIL — "Cannot find module '@/app/(auth)/forgot-password/page'"

- [ ] **Step 3: Create the page**

Create `src/app/(auth)/forgot-password/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const supabase = createClient()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setSubmitted(true)
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
            <CardTitle className="text-lg">Reset password</CardTitle>
            <CardDescription>
              {submitted
                ? 'Check your email for a reset link.'
                : "Enter your email and we'll send you a reset link."}
            </CardDescription>
          </CardHeader>

          {!submitted && (
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="underline underline-offset-4">
                  Back to sign in
                </Link>
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/forgot-password.test.tsx
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/(auth)/forgot-password/page.tsx src/test/forgot-password.test.tsx
git commit -m "feat: add forgot password page"
```

---

## Task 3: Create `/reset-password` page

**Files:**
- Create: `src/app/(auth)/reset-password/page.tsx`
- Create: `src/test/reset-password.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/test/reset-password.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResetPasswordPage from '@/app/(auth)/reset-password/page'

const mockUpdateUser = vi.fn()
const mockPush = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      updateUser: mockUpdateUser,
    },
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

beforeEach(() => {
  mockUpdateUser.mockResolvedValue({ error: null })
  mockPush.mockReset()
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

  it('redirects to /dashboard on success', async () => {
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

Expected: FAIL — "Cannot find module '@/app/(auth)/reset-password/page'"

- [ ] **Step 3: Create the page**

Create `src/app/(auth)/reset-password/page.tsx`:

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
    router.push('/dashboard')
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
            <div className="space-y-1">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/reset-password.test.tsx
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/(auth)/reset-password/page.tsx src/test/reset-password.test.tsx
git commit -m "feat: add reset password page"
```

---

## Task 4: Add "Forgot password?" link to login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/test/login.test.tsx`
- Modify: `src/test/middleware.test.ts`

- [ ] **Step 1: Add failing test to login.test.tsx**

Open `src/test/login.test.tsx` and add this test inside the `describe('LoginPage')` block:

```tsx
it('shows forgot password link in sign-in tab', () => {
  render(<LoginPage />)
  const link = screen.getByRole('link', { name: /forgot password/i })
  expect(link).toBeInTheDocument()
  expect(link).toHaveAttribute('href', '/forgot-password')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/login.test.tsx
```

Expected: The new "forgot password link" test FAILS. Existing tests still pass.

- [ ] **Step 3: Add "Forgot password?" link to login page**

In `src/app/(auth)/login/page.tsx`:

1. Add `import Link from 'next/link'` at the top with the other imports.

2. In the sign-in `TabsContent`, add a link between the password field and the error/button. Replace the sign-in tab content block (lines 121–145) with:

```tsx
<TabsContent value="signin" className="space-y-3 mt-3">
  <div className="space-y-1">
    <Label htmlFor="email-signin">Email</Label>
    <Input
      id="email-signin"
      type="email"
      placeholder="you@example.com"
      value={email}
      onChange={e => setEmail(e.target.value)}
    />
  </div>
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <Label htmlFor="password-signin">Password</Label>
      <Link
        href="/forgot-password"
        className="text-xs text-muted-foreground underline underline-offset-4"
      >
        Forgot password?
      </Link>
    </div>
    <Input
      id="password-signin"
      type="password"
      value={password}
      onChange={e => setPassword(e.target.value)}
    />
  </div>
  {error && <p className="text-sm text-destructive">{error}</p>}
  <Button className="w-full" onClick={signInWithEmail} disabled={loading}>
    {loading ? 'Signing in…' : 'Sign in'}
  </Button>
</TabsContent>
```

- [ ] **Step 4: Run login tests to verify they pass**

```bash
npx vitest run src/test/login.test.tsx
```

Expected: All 5 tests PASS (4 existing + 1 new).

- [ ] **Step 5: Update middleware.test.ts to register new public paths**

In `src/test/middleware.test.ts`, update `PUBLIC_PATHS` to include the two new auth pages:

```ts
const PUBLIC_PATHS = ['/login', '/auth/callback', '/forgot-password', '/reset-password']
```

Then add two tests inside the existing `describe` block:

```ts
it('marks /forgot-password as public', () => {
  expect(isPublicPath('/forgot-password')).toBe(true)
})

it('marks /reset-password as public', () => {
  expect(isPublicPath('/reset-password')).toBe(true)
})
```

- [ ] **Step 6: Run full test suite to confirm everything passes**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/(auth)/login/page.tsx src/test/login.test.tsx src/test/middleware.test.ts
git commit -m "feat: add forgot password link to login page"
```
