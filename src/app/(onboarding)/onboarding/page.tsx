import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingWizard } from '@/components/features/onboarding-wizard'
import type { RemotePreference } from '@/components/features/onboarding-wizard'
import type { RoleSelection } from '@/lib/supabase/types'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed, first_name, last_name, cv_text, years_experience')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) redirect('/dashboard')

  const { data: prefs } = await supabase
    .from('preferences')
    .select('target_roles, target_industries, excluded_industries, locations, excluded_companies, remote_preference')
    .eq('user_id', user.id)
    .maybeSingle()

  function deriveInitialStep(): 1 | 2 | 3 | 4 {
    if (!profile?.first_name) return 1
    if (!profile?.cv_text) return 2
    if (!prefs?.target_roles?.length) return 3
    return 4
  }

  const initialStep = deriveInitialStep()

  const initialValues = {
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
    cvText: profile?.cv_text ?? '',
    yearsExperience: profile?.years_experience ?? 0,
    targetRoles: (prefs?.target_roles as RoleSelection[]) ?? [],
    targetIndustries: (prefs?.target_industries ?? []).join(', '),
    excludedIndustries: (prefs?.excluded_industries ?? []).join(', '),
    locations: prefs?.locations ?? [],
    excludedCompanies: (prefs?.excluded_companies ?? []).join(', '),
    remotePreference: (prefs?.remote_preference as RemotePreference) ?? 'hybrid',
  }

  return <OnboardingWizard userId={user.id} initialStep={initialStep} initialValues={initialValues} />
}
