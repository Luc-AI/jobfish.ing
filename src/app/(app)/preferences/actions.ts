// src/app/(app)/preferences/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateProfile, updatePreferences } from '@/lib/supabase/queries'
import type { RoleSelection } from '@/lib/supabase/types'

export async function savePreferences(values: {
  cvText: string
  targetRoles: RoleSelection[]
  targetIndustries: string[]
  excludedIndustries: string[]
  locations: string[]
  excludedCompanies: string[]
}) {
  if (!values.targetRoles?.length) throw new Error('At least one target role is required')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await Promise.all([
    updateProfile(user.id, { cv_text: values.cvText }),
    updatePreferences(user.id, {
      target_roles: values.targetRoles,
      target_industries: values.targetIndustries,
      excluded_industries: values.excludedIndustries,
      locations: values.locations,
      excluded_companies: values.excludedCompanies,
    }),
  ])

  revalidatePath('/preferences')
}
