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
import { Clock, Loader2 } from 'lucide-react'
import { posthog } from '@/lib/posthog'
import { LocationPicker } from '@/components/features/location-picker'
import { RolePicker } from '@/components/features/role-picker'
import type { RoleSelection } from '@/lib/supabase/types'

type WizardStep = 1 | 2 | 3 | 4 | 'loading'
export type RemotePreference = 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'

const REMOTE_OPTIONS: { value: RemotePreference; label: string }[] = [
  { value: 'on-site', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote-ok', label: 'Remote OK' },
  { value: 'remote-solely', label: 'Remote Solely' },
]

interface OnboardingInitialValues {
  firstName?: string
  lastName?: string
  cvText?: string
  yearsExperience?: number
  targetRoles?: RoleSelection[]
  targetIndustries?: string
  excludedIndustries?: string
  locations?: string[]
  excludedCompanies?: string
  remotePreference?: RemotePreference
}

const CV_MIN_CHARS = 100

function YoeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const label = value === 10 ? '10+' : String(value)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          YEARS OF EXPERIENCE
        </span>
        <span className="text-sm font-semibold tabular-nums">{label}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={0} max={10} step={1} />
    </div>
  )
}

interface OnboardingWizardProps {
  userId: string
  initialStep?: 1 | 2 | 3 | 4
  initialValues?: OnboardingInitialValues
}

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
  const [yearsExperience, setYearsExperience] = useState(initialValues?.yearsExperience ?? 0)
  const [targetIndustries, setTargetIndustries] = useState(initialValues?.targetIndustries ?? '')
  const [excludedIndustries, setExcludedIndustries] = useState(initialValues?.excludedIndustries ?? '')
  const [locations, setLocations] = useState<string[]>(initialValues?.locations ?? [])
  const [excludedCompanies, setExcludedCompanies] = useState(initialValues?.excludedCompanies ?? '')
  const [remotePreference, setRemotePreference] = useState<RemotePreference>(initialValues?.remotePreference ?? 'hybrid')

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
    const { error: prefError } = await supabase
      .from('preferences')
      .upsert({
        user_id: userId,
        target_roles: targetRoles,
        target_industries: parseCommaSeparated(targetIndustries),
        excluded_industries: parseCommaSeparated(excludedIndustries),
        locations,
        excluded_companies: parseCommaSeparated(excludedCompanies),
        remote_preference: remotePreference,
      }, { onConflict: 'user_id' })
    if (prefError) { setSaving(false); setSaveError(prefError.message); return }
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: userId, years_experience: yearsExperience }, { onConflict: 'id' })
    setSaving(false)
    if (profileError) { setSaveError(profileError.message); return }
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
            <p className="text-xs text-muted-foreground">
              {cvText.trim().length < CV_MIN_CHARS
                ? `${CV_MIN_CHARS - cvText.trim().length} more characters needed`
                : `${cvText.trim().length} characters`}
            </p>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Back</Button>
              <Button onClick={saveStep2} disabled={saving || cvText.trim().length < CV_MIN_CHARS}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              The AI uses these to evaluate job fit.
            </p>
            <div className="space-y-1">
              <RolePicker value={targetRoles} onChange={setTargetRoles} />
            </div>
            <YoeSlider value={yearsExperience} onChange={setYearsExperience} />
            <div className="space-y-1">
              <Label>Preferred industries</Label>
              <Input
                placeholder="Fintech, SaaS, Deep Tech"
                value={targetIndustries}
                onChange={e => setTargetIndustries(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Industries to avoid</Label>
              <Input
                placeholder="Pharma, Oil & Gas"
                value={excludedIndustries}
                onChange={e => setExcludedIndustries(e.target.value)}
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
            {targetRoles.length === 0 && (
              <p className="text-xs text-destructive">Add at least one target role to continue.</p>
            )}
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>Back</Button>
              <Button onClick={saveStep3} disabled={saving || targetRoles.length === 0}>
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
