// src/components/features/preferences-form.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { posthog } from '@/lib/posthog'
import { RolePicker } from '@/components/features/role-picker'
import type { RoleSelection } from '@/lib/supabase/types'

interface PreferencesValues {
  cvText: string
  targetRoles: RoleSelection[]
  targetIndustries: string[]
  excludedIndustries: string[]
  locations: string[]
  excludedCompanies: string[]
}

interface PreferencesFormProps {
  defaultValues: PreferencesValues
  onSave: (values: PreferencesValues) => Promise<void>
}

function arrayToInput(arr: string[]) {
  return arr.join(', ')
}

function inputToArray(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

export function PreferencesForm({ defaultValues, onSave }: PreferencesFormProps) {
  const [cvText, setCvText] = useState(defaultValues.cvText)
  const [targetRoles, setTargetRoles] = useState<RoleSelection[]>(defaultValues.targetRoles)
  const [targetIndustries, setTargetIndustries] = useState(arrayToInput(defaultValues.targetIndustries))
  const [excludedIndustries, setExcludedIndustries] = useState(arrayToInput(defaultValues.excludedIndustries))
  const [locations, setLocations] = useState(arrayToInput(defaultValues.locations))
  const [excludedCompanies, setExcludedCompanies] = useState(arrayToInput(defaultValues.excludedCompanies))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({
      cvText,
      targetRoles,
      targetIndustries: inputToArray(targetIndustries),
      excludedIndustries: inputToArray(excludedIndustries),
      locations: inputToArray(locations),
      excludedCompanies: inputToArray(excludedCompanies),
    })
    posthog.capture('preferences_updated')
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="cv">Your CV</Label>
        <Textarea
          id="cv"
          rows={10}
          className="resize-none font-mono text-sm"
          value={cvText}
          onChange={e => setCvText(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{cvText.length} characters</p>
      </div>

      <div className="space-y-1.5">
        <RolePicker value={targetRoles} onChange={setTargetRoles} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="target-industries">Preferred industries</Label>
        <Input
          id="target-industries"
          placeholder="Fintech, SaaS, Deep Tech"
          value={targetIndustries}
          onChange={e => setTargetIndustries(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="excluded-industries">Industries to avoid</Label>
        <Input
          id="excluded-industries"
          placeholder="Pharma, Oil & Gas"
          value={excludedIndustries}
          onChange={e => setExcludedIndustries(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="locations">Locations</Label>
        <Input
          id="locations"
          placeholder="Zurich, Remote, Geneva"
          value={locations}
          onChange={e => setLocations(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="excluded">Excluded companies</Label>
        <Input
          id="excluded"
          placeholder="BigCorp, SlowBank"
          value={excludedCompanies}
          onChange={e => setExcludedCompanies(e.target.value)}
        />
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save preferences'}
      </Button>
    </div>
  )
}
