// src/app/(app)/preferences/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateProfile, updatePreferences } from '@/lib/supabase/queries'
import type { RoleSelection } from '@/lib/supabase/types'
import { summarizeCvTask } from '@/trigger/summarize-cv'

export async function savePreferences(values: {
  cvText: string
  targetRoles: RoleSelection[]
  targetIndustries: string[]
  excludedIndustries: string[]
  preferredLanguages: string[]
  companySizes: string[]
  locations: string[]
  excludedCompanies: string[]
  yearsExperience: number
}) {
  if (!values.targetRoles?.length) throw new Error('At least one target role is required')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('cv_text')
    .eq('id', user.id)
    .single()

  await Promise.all([
    updateProfile(user.id, { cv_text: values.cvText, years_experience: values.yearsExperience }),
    updatePreferences(user.id, {
      target_roles: values.targetRoles,
      target_industries: values.targetIndustries,
      excluded_industries: values.excludedIndustries,
      preferred_languages: values.preferredLanguages,
      company_sizes: values.companySizes,
      locations: values.locations,
      excluded_companies: values.excludedCompanies,
    }),
  ])

  if (values.cvText !== existingProfile?.cv_text) {
    await summarizeCvTask.trigger({ userId: user.id })
  }

  revalidatePath('/preferences')
}
