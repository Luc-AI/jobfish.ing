'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Clock, Loader2, Upload } from 'lucide-react'
import { posthog } from '@/lib/posthog'
import { toast } from 'sonner'
import { RolePicker } from '@/components/features/role-picker'
import { IndustryPicker } from '@/components/features/industry-picker'
import type { RoleSelection } from '@/lib/supabase/types'
import type { CvSummary } from '@/lib/types/cv-summary'

const LANGUAGE_OPTIONS = ['German', 'English', 'French', 'Italian'] as const
const COMPANY_SIZE_OPTIONS = ['Startup', 'Scale-up', 'Mid-market', 'Enterprise'] as const

interface PreferencesValues {
  targetRoles: RoleSelection[]
  targetIndustries: string[]
  excludedIndustries: string[]
  preferredLanguages: string[]
  companySizes: string[]
  locations: string[]
  excludedCompanies: string[]
  yearsExperience: number
}

interface PreferencesFormProps {
  defaultValues: PreferencesValues
  cvSummary: CvSummary | null
  hasCvText: boolean
  onSave: (values: PreferencesValues) => Promise<void>
}

function arrayToInput(arr: string[]) {
  return arr.join(', ')
}

function inputToArray(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

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

const SENIORITY_LABEL: Record<CvSummary['seniority'], string> = {
  junior: 'Junior',
  mid: 'Mid-level',
  senior: 'Senior',
  lead: 'Lead',
  principal: 'Principal',
  director: 'Director',
  executive: 'Executive',
}

function CvSummaryCard({
  summary,
  hasCvText,
  onReupload,
  uploading,
}: {
  summary: CvSummary | null
  hasCvText: boolean
  onReupload: (file: File) => void
  uploading: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const isPending = hasCvText && !summary

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Your CV</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {summary
              ? 'We extracted this from your CV. This is what the AI sees when scoring jobs — no raw text, no personal details.'
              : isPending
              ? 'Your CV is being processed. Check back in a moment.'
              : 'No CV uploaded yet. Upload one to improve job scoring accuracy.'}
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) onReupload(file)
              e.target.value = ''
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="shrink-0 gap-1.5"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading ? 'Uploading…' : summary ? 'Replace CV' : 'Upload PDF'}
          </Button>
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing your CV…
        </div>
      )}

      {summary && (
        <div className="space-y-3 pt-1">
          <div>
            <p className="text-sm font-semibold">{summary.name}</p>
            <p className="text-xs text-muted-foreground">
              {summary.current_title} · {SENIORITY_LABEL[summary.seniority]}
            </p>
          </div>

          {summary.skills.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {summary.skills.slice(0, 15).map(skill => (
                  <span
                    key={skill}
                    className="rounded-md border bg-background px-2 py-0.5 text-xs"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {summary.experience.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Experience</p>
              <ul className="space-y-0.5">
                {summary.experience.map((e, i) => (
                  <li key={i} className="text-xs">
                    <span className="font-medium">{e.title}</span>
                    <span className="text-muted-foreground"> · {e.company} · {e.duration}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.education.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Education</p>
              <ul className="space-y-0.5">
                {summary.education.map((e, i) => (
                  <li key={i} className="text-xs">
                    <span className="font-medium">{e.degree}</span>
                    <span className="text-muted-foreground"> · {e.institution} · {e.year}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.key_achievements.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Key Achievements</p>
              <ul className="space-y-0.5 list-disc list-inside">
                {summary.key_achievements.map((a, i) => (
                  <li key={i} className="text-xs text-muted-foreground">{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PreferencesForm({ defaultValues, cvSummary, hasCvText, onSave }: PreferencesFormProps) {
  const [targetRoles, setTargetRoles] = useState<RoleSelection[]>(defaultValues.targetRoles)
  const [yearsExperience, setYearsExperience] = useState(defaultValues.yearsExperience)
  const [targetIndustries, setTargetIndustries] = useState<string[]>(defaultValues.targetIndustries)
  const [excludedIndustries, setExcludedIndustries] = useState<string[]>(defaultValues.excludedIndustries)
  const [preferredLanguages, setPreferredLanguages] = useState<string[]>(defaultValues.preferredLanguages)
  const [companySizes, setCompanySizes] = useState<string[]>(defaultValues.companySizes)
  const [locations, setLocations] = useState(arrayToInput(defaultValues.locations))
  const [excludedCompanies, setExcludedCompanies] = useState(arrayToInput(defaultValues.excludedCompanies))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [currentSummary, setCurrentSummary] = useState<CvSummary | null>(cvSummary)
  const [hasUploadedCv, setHasUploadedCv] = useState(hasCvText)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        targetRoles,
        yearsExperience,
        targetIndustries,
        excludedIndustries,
        preferredLanguages,
        companySizes,
        locations: inputToArray(locations),
        excludedCompanies: inputToArray(excludedCompanies),
      })
      posthog.capture('preferences_updated')
      toast.success('Preferences saved')
    } catch {
      toast.error('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  async function handleReupload(file: File) {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/cv/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Upload failed')
      }
      setHasUploadedCv(true)
      setCurrentSummary(null) // summary is being re-generated
      toast.success('CV uploaded — your profile is being updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'CV upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <RolePicker value={targetRoles} onChange={setTargetRoles} />
      </div>

      <YoeSlider value={yearsExperience} onChange={setYearsExperience} />

      <div className="space-y-1.5">
        <Label>Preferred industries</Label>
        <IndustryPicker
          value={targetIndustries}
          onChange={setTargetIndustries}
          label="Preferred industries"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Industries to avoid</Label>
        <IndustryPicker
          value={excludedIndustries}
          onChange={setExcludedIndustries}
          label="Industries to avoid"
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

      {targetRoles.length === 0 && (
        <p className="text-xs text-destructive">At least one target role is required.</p>
      )}
      <Button onClick={handleSave} disabled={saving || targetRoles.length === 0} className="w-full md:w-auto h-11 md:h-8">
        {saving ? 'Saving…' : 'Save preferences'}
      </Button>

      <CvSummaryCard
        summary={currentSummary}
        hasCvText={hasUploadedCv}
        onReupload={handleReupload}
        uploading={uploading}
      />
    </div>
  )
}
