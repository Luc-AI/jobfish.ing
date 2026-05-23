# Account Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/account` page for editing name and email, link it from the sidebar dropdown, and reference it from the Notifications page.

**Architecture:** New `/account` route follows the same server-component + server-action + client-form pattern as Preferences and Notifications. Name updates go through a server action (`saveName`); email change calls `supabase.auth.updateUser` client-side (requires the user's session token). The Notifications form gains a static note linking to `/account` for email changes.

**Tech Stack:** Next.js App Router, Supabase Auth + server client, Vitest + Testing Library

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/(app)/account/page.tsx` | Server component: fetch user + profile, render AccountForm |
| Create | `src/app/(app)/account/actions.ts` | Server action: `saveName` |
| Create | `src/components/features/account-form.tsx` | Client form: name section + email change section |
| Create | `src/test/account-form.test.tsx` | Vitest tests for AccountForm |
| Modify | `src/components/layout/app-shell.tsx` | Add "Account settings" link in Account dropdown |
| Modify | `src/components/features/notifications-form.tsx` | Accept `userEmail` prop, add email note with link |
| Modify | `src/app/(app)/notifications/page.tsx` | Pass `userEmail` to NotificationsForm |

---

### Task 1: Server action for name save

**Files:**
- Create: `src/app/(app)/account/actions.ts`

- [ ] **Step 1: Create the server action file**

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateProfile } from '@/lib/supabase/queries'

export async function saveName(values: { firstName: string; lastName: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await updateProfile(user.id, {
    first_name: values.firstName.trim() || null,
    last_name: values.lastName.trim() || null,
  })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(app\)/account/actions.ts
git commit -m "feat: add saveName server action for account settings"
```

---

### Task 2: Account page (server component)

**Files:**
- Create: `src/app/(app)/account/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/queries'
import { AccountForm } from '@/components/features/account-form'
import { saveName } from './actions'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await getProfile(user.id)

  return (
    <div className="p-8 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your name and email address.
        </p>
      </div>

      <AccountForm
        firstName={profile?.first_name ?? ''}
        lastName={profile?.last_name ?? ''}
        email={user.email ?? ''}
        onSaveName={saveName}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(app\)/account/page.tsx
git commit -m "feat: add /account page"
```

---

### Task 3: AccountForm client component

**Files:**
- Create: `src/components/features/account-form.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface AccountFormProps {
  firstName: string
  lastName: string
  email: string
  onSaveName: (values: { firstName: string; lastName: string }) => Promise<void>
}

export function AccountForm({ firstName: initialFirst, lastName: initialLast, email, onSaveName }: AccountFormProps) {
  const [firstName, setFirstName] = useState(initialFirst)
  const [lastName, setLastName] = useState(initialLast)
  const [nameSaving, setNameSaving] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false)

  async function handleSaveName() {
    setNameSaving(true)
    try {
      await onSaveName({ firstName, lastName })
      toast.success('Name updated')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setNameSaving(false)
    }
  }

  async function handleEmailChange() {
    if (!newEmail.trim()) return
    setEmailSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (error) throw error
      setEmailConfirmationSent(true)
      setNewEmail('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to request email change'
      toast.error(message)
    } finally {
      setEmailSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-sm font-semibold">Name</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="first-name">First name</Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="First"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name">Last name</Label>
            <Input
              id="last-name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Last"
            />
          </div>
        </div>
        <Button onClick={handleSaveName} disabled={nameSaving}>
          {nameSaving ? 'Saving…' : 'Save name'}
        </Button>
      </div>

      <div className="border-t" />

      <div className="space-y-4">
        <h2 className="text-sm font-semibold">Email</h2>
        <div className="space-y-1.5">
          <Label>Current email</Label>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-email">New email</Label>
          <Input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={emailConfirmationSent}
          />
        </div>
        {emailConfirmationSent ? (
          <p className="text-sm text-muted-foreground">
            Confirmation sent. Check your inbox to complete the change.
          </p>
        ) : (
          <Button onClick={handleEmailChange} disabled={emailSaving || !newEmail.trim()}>
            {emailSaving ? 'Sending…' : 'Change email'}
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep account-form
```

Expected: no output (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/components/features/account-form.tsx
git commit -m "feat: add AccountForm component"
```

---

### Task 4: Tests for AccountForm

**Files:**
- Create: `src/test/account-form.test.tsx`

- [ ] **Step 1: Write the tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountForm } from '@/components/features/account-form'

const mockUpdateUser = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { updateUser: mockUpdateUser },
  })),
}))

const defaultProps = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  onSaveName: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateUser.mockResolvedValue({ error: null })
})

describe('AccountForm – name section', () => {
  it('renders first and last name inputs pre-filled', () => {
    render(<AccountForm {...defaultProps} />)
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ada')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Lovelace')
  })

  it('calls onSaveName with updated values on save', async () => {
    const onSaveName = vi.fn().mockResolvedValue(undefined)
    render(<AccountForm {...defaultProps} onSaveName={onSaveName} />)
    await userEvent.clear(screen.getByLabelText(/first name/i))
    await userEvent.type(screen.getByLabelText(/first name/i), 'Grace')
    await userEvent.click(screen.getByRole('button', { name: /save name/i }))
    await waitFor(() => {
      expect(onSaveName).toHaveBeenCalledWith({ firstName: 'Grace', lastName: 'Lovelace' })
    })
  })

  it('shows error toast when onSaveName throws', async () => {
    const onSaveName = vi.fn().mockRejectedValue(new Error('DB error'))
    render(<AccountForm {...defaultProps} onSaveName={onSaveName} />)
    await userEvent.click(screen.getByRole('button', { name: /save name/i }))
    await waitFor(() => {
      expect(screen.getByText('Failed to update name')).toBeInTheDocument()
    })
  })
})

describe('AccountForm – email section', () => {
  it('renders current email', () => {
    render(<AccountForm {...defaultProps} />)
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  it('calls supabase.auth.updateUser with new email', async () => {
    render(<AccountForm {...defaultProps} />)
    await userEvent.type(screen.getByLabelText(/new email/i), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: /change email/i }))
    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@example.com' })
    })
  })

  it('shows confirmation message after successful email change request', async () => {
    render(<AccountForm {...defaultProps} />)
    await userEvent.type(screen.getByLabelText(/new email/i), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: /change email/i }))
    await waitFor(() => {
      expect(screen.getByText(/confirmation sent/i)).toBeInTheDocument()
    })
  })

  it('shows error toast when updateUser returns an error', async () => {
    mockUpdateUser.mockResolvedValue({ error: new Error('Invalid email') })
    render(<AccountForm {...defaultProps} />)
    await userEvent.type(screen.getByLabelText(/new email/i), 'bad')
    await userEvent.click(screen.getByRole('button', { name: /change email/i }))
    await waitFor(() => {
      expect(screen.getByText('Invalid email')).toBeInTheDocument()
    })
  })

  it('disables Change email button when input is empty', () => {
    render(<AccountForm {...defaultProps} />)
    expect(screen.getByRole('button', { name: /change email/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/test/account-form.test.tsx
```

Expected: all 8 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/test/account-form.test.tsx
git commit -m "test: add AccountForm tests"
```

---

### Task 5: Update sidebar dropdown with Account settings link

**Files:**
- Modify: `src/components/layout/app-shell.tsx`

- [ ] **Step 1: Replace the DropdownMenuContent block**

`Link` is already imported at the top of this file. Replace the existing `<DropdownMenuContent>` block (currently contains email label + Log out item) with:

```tsx
<DropdownMenuContent side="top" align="start" className="w-52">
  {userEmail && (
    <>
      <DropdownMenuLabel className="font-normal text-xs text-muted-foreground truncate">
        {userEmail}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
    </>
  )}
  <DropdownMenuItem asChild>
    <Link href="/account" className="cursor-pointer">
      <UserCircle className="h-4 w-4 mr-2" />
      Account settings
    </Link>
  </DropdownMenuItem>
  <DropdownMenuSeparator />
  <DropdownMenuItem
    onClick={handleSignOut}
    className="text-destructive focus:text-destructive cursor-pointer"
  >
    <LogOut className="h-4 w-4 mr-2" />
    Log out
  </DropdownMenuItem>
</DropdownMenuContent>
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep app-shell
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/app-shell.tsx
git commit -m "feat: add Account settings link in sidebar dropdown"
```

---

### Task 6: Notifications form — add email reference note

**Files:**
- Modify: `src/components/features/notifications-form.tsx`
- Modify: `src/app/(app)/notifications/page.tsx`

- [ ] **Step 1: Add `userEmail` prop to `NotificationsFormProps` interface**

```ts
interface NotificationsFormProps {
  defaultThreshold: number
  defaultEnabled: boolean
  lastNotifiedAt?: string | null
  userEmail?: string
  onSave: (values: { threshold: number; notificationsEnabled: boolean }) => Promise<void>
}
```

Update the function signature to destructure the new prop:

```tsx
export function NotificationsForm({
  defaultThreshold,
  defaultEnabled,
  lastNotifiedAt,
  userEmail,
  onSave,
}: NotificationsFormProps) {
```

- [ ] **Step 2: Replace the email notifications section**

Find the `<div className="flex items-center justify-between py-4 border-y">` block and replace it with:

```tsx
<div className="py-4 border-y space-y-2">
  <div className="flex items-center justify-between">
    <div>
      <Label>Email notifications</Label>
      <p className="text-sm text-muted-foreground mt-0.5">
        Receive job alerts by email when a match exceeds your threshold.
      </p>
    </div>
    <Switch
      checked={notificationsEnabled}
      onCheckedChange={setNotificationsEnabled}
    />
  </div>
  {userEmail && (
    <p className="text-sm text-muted-foreground">
      Sending to <span className="font-medium text-foreground">{userEmail}</span>.{' '}
      <a href="/account" className="underline underline-offset-2 hover:text-foreground transition-colors">
        Change in Account settings.
      </a>
    </p>
  )}
</div>
```

- [ ] **Step 3: Pass `userEmail` from the notifications page**

In `src/app/(app)/notifications/page.tsx`, add `userEmail={user.email}` to the `<NotificationsForm` props:

```tsx
<NotificationsForm
  defaultThreshold={profile?.threshold ?? 7.0}
  defaultEnabled={profile?.notifications_enabled ?? true}
  lastNotifiedAt={lastEval?.notified_at ?? null}
  userEmail={user.email}
  onSave={saveNotificationSettings}
/>
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "notifications|account"
```

Expected: no output

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/features/notifications-form.tsx src/app/\(app\)/notifications/page.tsx
git commit -m "feat: show account email note in notifications form"
```
