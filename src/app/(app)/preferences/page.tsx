import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile, getPreferences } from '@/lib/supabase/queries'
import { PreferencesForm } from '@/components/features/preferences-form'
import { savePreferences } from './actions'

export default async function PreferencesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: preferences }] = await Promise.all([
    getProfile(user.id),
    getPreferences(user.id),
  ])

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Preferences</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          The AI uses these to score jobs against your profile.
        </p>
      </div>

      <PreferencesForm
        defaultValues={{
          cvText: profile?.cv_text ?? '',
          targetRoles: preferences?.target_roles ?? [],
          industries: preferences?.industries ?? [],
          locations: preferences?.locations ?? [],
          excludedCompanies: preferences?.excluded_companies ?? [],
        }}
        onSave={savePreferences}
      />
    </div>
  )
}
