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
