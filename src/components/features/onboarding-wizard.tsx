'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { posthog } from '@/lib/posthog'
import { LocationPicker } from '@/components/features/location-picker'

type WizardStep = 1 | 2 | 3 | 4 | 'loading'
type RemotePreference = 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'

const REMOTE_OPTIONS: { value: RemotePreference; label: string }[] = [
  { value: 'on-site', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote-ok', label: 'Remote OK' },
  { value: 'remote-solely', label: 'Remote Solely' },
]

interface OnboardingWizardProps {
  userId: string
  initialStep?: 1 | 2 | 3 | 4
}

export function OnboardingWizard({ userId, initialStep = 1 }: OnboardingWizardProps) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [step, setStep] = useState<WizardStep>(initialStep)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Step 1: Name
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Step 2: CV
  const [cvText, setCvText] = useState('')

  // Step 3: Preferences
  const [targetRoles, setTargetRoles] = useState('')
  const [industries, setIndustries] = useState('')
  const [locations, setLocations] = useState<string[]>([])
  const [excludedCompanies, setExcludedCompanies] = useState('')
  const [remotePreference, setRemotePreference] = useState<RemotePreference>('hybrid')

  // Step 4: Notifications
  const [threshold, setThreshold] = useState(7.0)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  function parseCommaSeparated(value: string): string[] {
    return value.split(',').map(s => s.trim()).filter(Boolean)
  }

  async function saveStep1() {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, first_name: firstName, last_name: lastName }, { onConflict: 'id' })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setStep(2)
  }

  async function saveStep2() {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, cv_text: cvText }, { onConflict: 'id' })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setStep(3)
  }

  async function saveStep3() {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase
      .from('preferences')
      .upsert({
        user_id: userId,
        target_roles: parseCommaSeparated(targetRoles),
        industries: parseCommaSeparated(industries),
        locations,
        excluded_companies: parseCommaSeparated(excludedCompanies),
        remote_preference: remotePreference,
      }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setStep(4)
  }

  async function saveStep4() {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        threshold,
        notifications_enabled: notificationsEnabled,
        onboarding_completed: true,
      }, { onConflict: 'id' })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    posthog.capture('onboarding_completed', { user_id: userId })
    setStep('loading')
    try {
      await fetch('/api/onboarding/complete', { method: 'POST' })
    } catch {
      // silent fallback — jobs will appear on next hourly cron
    }
    router.push('/dashboard')
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg space-y-4 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">Finding your first matches…</h1>
          <p className="text-sm text-muted-foreground">
            We're scanning the last 7 days of job postings. This takes about a minute.
          </p>
        </div>
      </div>
    )
  }

  const stepNumber = step as 1 | 2 | 3 | 4

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{stepNumber} of 4</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {step === 1 && "Let's get started"}
            {step === 2 && 'Your CV'}
            {step === 3 && 'Preferences'}
            {step === 4 && 'Notifications'}
          </h1>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              What should we call you?
            </p>
            <div className="space-y-1">
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                placeholder="Ada"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                placeholder="Lovelace"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
              />
            </div>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-end">
              <Button
                onClick={saveStep1}
                disabled={saving || !firstName.trim() || !lastName.trim()}
              >
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Paste your resume text below. The AI uses this to evaluate how well jobs match your background.
            </p>
            <Textarea
              placeholder="Paste your resume text here..."
              value={cvText}
              onChange={e => setCvText(e.target.value)}
              rows={12}
              className="resize-none font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{cvText.length} characters</p>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Back</Button>
              <Button onClick={saveStep2} disabled={saving}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Enter comma-separated values. The AI uses these to evaluate job fit.
            </p>
            <div className="space-y-1">
              <Label>Target roles</Label>
              <Input
                placeholder="Head of Product, VP Biz Dev, PM"
                value={targetRoles}
                onChange={e => setTargetRoles(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Industries</Label>
              <Input
                placeholder="Fintech, SaaS, VC, Deep Tech"
                value={industries}
                onChange={e => setIndustries(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Locations</Label>
              <LocationPicker value={locations} onChange={setLocations} />
            </div>
            <div className="space-y-2">
              <Label>Work arrangement</Label>
              <div className="flex flex-wrap gap-2">
                {REMOTE_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={remotePreference === opt.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRemotePreference(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Excluded companies</Label>
              <Input
                placeholder="BigCorp, SlowBank"
                value={excludedCompanies}
                onChange={e => setExcludedCompanies(e.target.value)}
              />
            </div>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>Back</Button>
              <Button onClick={saveStep3} disabled={saving}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <p className="text-muted-foreground text-sm">
              You'll only be notified when jobs score at or above your threshold.
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Score threshold</Label>
                <span className="text-2xl font-bold">{threshold.toFixed(1)}</span>
              </div>
              <Slider
                min={0}
                max={10}
                step={0.5}
                value={[threshold]}
                onValueChange={([v]) => setThreshold(v)}
              />
              <p className="text-xs text-muted-foreground">
                Only notify me when a job scores {threshold.toFixed(1)} or higher.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Email alerts</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Receive job alerts by email</p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
              />
            </div>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)} disabled={saving}>Back</Button>
              <Button onClick={saveStep4} disabled={saving}>
                {saving ? 'Setting up…' : 'Start fishing'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
