'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { posthog } from '@/lib/posthog'

interface NotificationsFormProps {
  defaultThreshold: number
  defaultEnabled: boolean
  lastNotifiedAt?: string | null
  onSave: (values: { threshold: number; notificationsEnabled: boolean }) => Promise<void>
}

export function NotificationsForm({
  defaultThreshold,
  defaultEnabled,
  lastNotifiedAt,
  onSave,
}: NotificationsFormProps) {
  const [threshold, setThreshold] = useState(defaultThreshold)
  const [notificationsEnabled, setNotificationsEnabled] = useState(defaultEnabled)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({ threshold, notificationsEnabled })
    posthog.capture('notification_settings_updated', {
      threshold,
      notifications_enabled: notificationsEnabled,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Label>Score threshold</Label>
          <span className="text-3xl font-bold tabular-nums">{threshold.toFixed(1)}</span>
        </div>
        <Slider
          min={0}
          max={10}
          step={0.5}
          value={[threshold]}
          onValueChange={([v]) => setThreshold(v)}
        />
        <p className="text-sm text-muted-foreground">
          Only notify me when a job scores <strong>{threshold.toFixed(1)}</strong> or higher.
        </p>
      </div>

      <div className="flex items-center justify-between py-4 border-y">
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

      {lastNotifiedAt && (
        <p className="text-sm text-muted-foreground">
          Last notification sent:{' '}
          <time dateTime={lastNotifiedAt}>
            {new Date(lastNotifiedAt).toLocaleString()}
          </time>
        </p>
      )}

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save settings'}
      </Button>
    </div>
  )
}
