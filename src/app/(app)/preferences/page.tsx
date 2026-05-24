import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile, getPreferences } from '@/lib/supabase/queries'
import { PreferencesForm } from '@/components/features/preferences-form'
import { savePreferences } from './actions'
import type { CvSummary } from '@/lib/types/cv-summary'

export default async function PreferencesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: preferences }] = await Promise.all([
    getProfile(user.id),
    getPreferences(user.id),
  ])

  return (
    <div className="px-4 py-8 md:px-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Preferences</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          The AI uses these to score jobs against your profile.
        </p>
      </div>

      <PreferencesForm
        cvSummary={(profile?.cv_summary as CvSummary | null) ?? null}
        hasCvText={!!profile?.cv_text}
        defaultValues={{
          targetRoles: preferences?.target_roles ?? [],
          yearsExperience: profile?.years_experience ?? 0,
          targetIndustries: preferences?.target_industries ?? [],
          excludedIndustries: preferences?.excluded_industries ?? [],
          preferredLanguages: preferences?.preferred_languages ?? [],
          companySizes: preferences?.company_sizes ?? [],
          locations: preferences?.locations ?? [],
          excludedCompanies: preferences?.excluded_companies ?? [],
        }}
        onSave={savePreferences}
      />
    </div>
  )
}
