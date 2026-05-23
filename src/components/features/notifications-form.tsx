'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { posthog } from '@/lib/posthog'
import { toast } from 'sonner'

interface NotificationsFormProps {
  defaultThreshold: number
  defaultEnabled: boolean
  defaultInstantAlertThreshold: number | null
  lastNotifiedAt?: string | null
  onSave: (values: { threshold: number; notificationsEnabled: boolean; instantAlertThreshold: number | null }) => Promise<void>
}

export function NotificationsForm({
  defaultThreshold,
  defaultEnabled,
  defaultInstantAlertThreshold,
  lastNotifiedAt,
  onSave,
}: NotificationsFormProps) {
  const [threshold, setThreshold] = useState(defaultThreshold)
  const [notificationsEnabled, setNotificationsEnabled] = useState(defaultEnabled)
  const [instantAlertsEnabled, setInstantAlertsEnabled] = useState(defaultInstantAlertThreshold !== null)
  const [instantAlertThreshold, setInstantAlertThreshold] = useState(defaultInstantAlertThreshold ?? 9)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ threshold, notificationsEnabled, instantAlertThreshold: instantAlertsEnabled ? instantAlertThreshold : null })
      posthog.capture('notification_settings_updated', {
        threshold,
        notifications_enabled: notificationsEnabled,
      })
      posthog.capture('instant_alert_settings_updated', {
        instant_alert_threshold: instantAlertsEnabled ? instantAlertThreshold : null,
      })
      toast.success('Settings saved')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
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

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Instant alerts</Label>
            <p className="text-sm text-muted-foreground mt-0.5">
              Get an email the moment a job hits your alert score.
            </p>
          </div>
          <Switch
            checked={instantAlertsEnabled}
            onCheckedChange={setInstantAlertsEnabled}
          />
        </div>
        {instantAlertsEnabled && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Alert score</span>
              <span className="text-3xl font-bold tabular-nums">{instantAlertThreshold.toFixed(1)}</span>
            </div>
            <Slider
              min={0}
              max={10}
              step={0.5}
              value={[instantAlertThreshold]}
              onValueChange={([v]) => setInstantAlertThreshold(v)}
            />
            <p className="text-sm text-muted-foreground">
              Fires immediately when a job scores <strong>{instantAlertThreshold.toFixed(1)}</strong> or higher.
              Set above your digest threshold for best results.
            </p>
          </div>
        )}
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

      <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto h-11 md:h-8">
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  )
}
