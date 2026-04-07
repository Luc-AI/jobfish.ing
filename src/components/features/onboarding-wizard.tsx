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
import { posthog } from '@/lib/posthog'

interface OnboardingWizardProps {
  userId: string
  initialStep?: 1 | 2 | 3
}

export function OnboardingWizard({ userId, initialStep = 1 }: OnboardingWizardProps) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [step, setStep] = useState<1 | 2 | 3>(initialStep)
  const [saving, setSaving] = useState(false)

  // Step 1: CV
  const [cvText, setCvText] = useState('')

  // Step 2: Preferences
  const [targetRoles, setTargetRoles] = useState('')
  const [industries, setIndustries] = useState('')
  const [locations, setLocations] = useState('')
  const [excludedCompanies, setExcludedCompanies] = useState('')

  // Step 3: Notifications
  const [threshold, setThreshold] = useState(7.0)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  function parseCommaSeparated(value: string): string[] {
    return value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }

  async function saveStep1() {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ cv_text: cvText })
      .eq('id', userId)
    setSaving(false)
    setStep(2)
  }

  async function saveStep2() {
    setSaving(true)
    await supabase
      .from('preferences')
      .update({
        target_roles: parseCommaSeparated(targetRoles),
        industries: parseCommaSeparated(industries),
        locations: parseCommaSeparated(locations),
        excluded_companies: parseCommaSeparated(excludedCompanies),
      })
      .eq('user_id', userId)
    setSaving(false)
    setStep(3)
  }

  async function saveStep3() {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({
        threshold,
        notifications_enabled: notificationsEnabled,
        onboarding_completed: true,
      })
      .eq('id', userId)
    setSaving(false)
    posthog.capture('onboarding_completed', { user_id: userId })
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{step} of 3</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {step === 1 && 'Your CV'}
            {step === 2 && 'Preferences'}
            {step === 3 && 'Notifications'}
          </h1>
        </div>

        {step === 1 && (
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
            <div className="flex justify-end">
              <Button onClick={saveStep1} disabled={saving}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
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
              <Input
                placeholder="Zurich, Remote, Berlin"
                value={locations}
                onChange={e => setLocations(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Excluded companies</Label>
              <Input
                placeholder="BigCorp, SlowBank"
                value={excludedCompanies}
                onChange={e => setExcludedCompanies(e.target.value)}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Back</Button>
              <Button onClick={saveStep2} disabled={saving}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
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
                <Label>Email notifications</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Receive job alerts by email</p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>Back</Button>
              <Button onClick={saveStep3} disabled={saving}>
                {saving ? 'Setting up…' : 'Start fishing'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
