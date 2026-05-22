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
import { IndustryPicker } from '@/components/features/industry-picker'
import type { RoleSelection } from '@/lib/supabase/types'

type WizardStep = 1 | 2 | 3 | 4 | 5 | 'loading'
export type RemotePreference = 'on-site' | 'hybrid' | 'remote-ok' | 'remote-solely'

const REMOTE_OPTIONS: { value: RemotePreference; label: string }[] = [
  { value: 'on-site', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote-ok', label: 'Remote OK' },
  { value: 'remote-solely', label: 'Remote Solely' },
]

const LANGUAGE_OPTIONS = ['German', 'English', 'French', 'Italian'] as const
const COMPANY_SIZE_OPTIONS = ['Startup', 'Scale-up', 'Mid-market', 'Enterprise'] as const

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

function MultiChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  value: T[]
  onChange: (v: T[]) => void
}) {
  function toggle(opt: T) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else {
      onChange([...value, opt])
    }
  }
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Button
            key={opt}
            type="button"
            variant={value.includes(opt) ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggle(opt)}
          >
            {opt}
          </Button>
        ))}
      </div>
    </div>
  )
}

export interface OnboardingWizardInitialValues {
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

interface OnboardingWizardProps {
  userId: string
  initialStep?: 1 | 2 | 3 | 4 | 5
  initialValues?: OnboardingWizardInitialValues
}

export function OnboardingWizard({ userId, initialStep = 1, initialValues = {} }: OnboardingWizardProps) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [step, setStep] = useState<WizardStep>(initialStep)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Step 1: Name
  const [firstName, setFirstName] = useState(initialValues.firstName ?? '')
  const [lastName, setLastName] = useState(initialValues.lastName ?? '')

  // Step 2: Preferences
  const [targetRoles, setTargetRoles] = useState<RoleSelection[]>(initialValues.targetRoles ?? [])
  const [yearsExperience, setYearsExperience] = useState(initialValues.yearsExperience ?? 0)
  const [locations, setLocations] = useState<string[]>(initialValues.locations ?? [])
  const [remotePreference, setRemotePreference] = useState<RemotePreference>(initialValues.remotePreference ?? 'hybrid')
  const [excludedCompanies, setExcludedCompanies] = useState(initialValues.excludedCompanies ?? '')

  // Step 3: Advanced
  const [preferredIndustries, setPreferredIndustries] = useState<string[]>(
    initialValues.targetIndustries ? initialValues.targetIndustries.split(',').map(s => s.trim()).filter(Boolean) : []
  )
  const [excludedIndustries, setExcludedIndustries] = useState<string[]>(
    initialValues.excludedIndustries ? initialValues.excludedIndustries.split(',').map(s => s.trim()).filter(Boolean) : []
  )
  const [preferredLanguages, setPreferredLanguages] = useState<string[]>([])
  const [companySizes, setCompanySizes] = useState<string[]>([])

  // Step 4: CV upload
  const [cvUploading, setCvUploading] = useState(false)
  const [cvUploadError, setCvUploadError] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string | null>(null)

  // Step 5: Notifications
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
    const { error: prefError } = await supabase
      .from('preferences')
      .upsert({
        user_id: userId,
        target_roles: targetRoles,
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
    setStep(3)
  }

  async function saveStep3() {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase
      .from('preferences')
      .upsert({
        user_id: userId,
        target_industries: preferredIndustries,
        excluded_industries: excludedIndustries,
        preferred_languages: preferredLanguages,
        company_sizes: companySizes,
      }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setStep(4)
  }

  async function uploadCv(file: File) {
    setCvUploading(true)
    setCvUploadError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/cv/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) {
        setCvUploadError(json.error ?? 'Upload failed. Please try again.')
      } else {
        setExtractedText(json.extractedText)
      }
    } catch {
      setCvUploadError('Upload failed. Please check your connection and try again.')
    } finally {
      setCvUploading(false)
    }
  }

  async function saveStep5() {
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

  const stepNumber = step as 1 | 2 | 3 | 4 | 5

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{stepNumber} of 5</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {step === 1 && "Let's get started"}
            {step === 2 && 'Preferences'}
            {step === 3 && 'Advanced'}
            {step === 4 && 'Your CV'}
            {step === 5 && 'Notifications'}
          </h1>
        </div>

        {/* Step 1: Name */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">What should we call you?</p>
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
              <Button onClick={saveStep1} disabled={saving || !firstName.trim() || !lastName.trim()}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Preferences */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              These help us find jobs that match your background and goals.
            </p>
            <RolePicker value={targetRoles} onChange={setTargetRoles} />
            <YoeSlider value={yearsExperience} onChange={setYearsExperience} />
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
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Back</Button>
              <Button onClick={saveStep2} disabled={saving || targetRoles.length === 0}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Advanced */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Optional filters — leave blank to see all matches.
            </p>
            <div className="space-y-1">
              <Label>Preferred industries</Label>
              <IndustryPicker
                value={preferredIndustries}
                onChange={setPreferredIndustries}
                label="Preferred industries"
              />
            </div>
            <div className="space-y-1">
              <Label>Industries to exclude</Label>
              <IndustryPicker
                value={excludedIndustries}
                onChange={setExcludedIndustries}
                label="Industries to exclude"
              />
            </div>
            <MultiChips
              label="Preferred languages"
              options={LANGUAGE_OPTIONS}
              value={preferredLanguages}
              onChange={setPreferredLanguages}
            />
            <MultiChips
              label="Company size"
              options={COMPANY_SIZE_OPTIONS}
              value={companySizes}
              onChange={setCompanySizes}
            />
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>Back</Button>
              <Button onClick={saveStep3} disabled={saving}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: CV upload */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Upload your CV so the AI can evaluate how well each job matches your background.
              Only PDF files are accepted.
            </p>
            <div className="space-y-2">
              <Label htmlFor="cv-upload">CV (PDF)</Label>
              <Input
                id="cv-upload"
                type="file"
                accept=".pdf,application/pdf"
                disabled={cvUploading}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadCv(file)
                }}
              />
              {cvUploading && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Extracting text…
                </p>
              )}
              {cvUploadError && (
                <p className="text-sm text-destructive">{cvUploadError}</p>
              )}
            </div>
            {extractedText && (
              <div className="space-y-1">
                <Label>Extracted text</Label>
                <Textarea
                  readOnly
                  value={extractedText}
                  rows={10}
                  className="resize-none font-mono text-xs text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  {extractedText.length} characters extracted
                </p>
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)} disabled={cvUploading}>Back</Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(5)} disabled={cvUploading}>
                  Skip for now
                </Button>
                <Button onClick={() => setStep(5)} disabled={cvUploading || !extractedText}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Notifications */}
        {step === 5 && (
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
              <Button variant="outline" onClick={() => setStep(4)} disabled={saving}>Back</Button>
              <Button onClick={saveStep5} disabled={saving}>
                {saving ? 'Setting up…' : 'Start fishing'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
