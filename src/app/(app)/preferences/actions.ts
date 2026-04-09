'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateProfile, updatePreferences } from '@/lib/supabase/queries'

export async function savePreferences(values: {
  cvText: string
  targetRoles: string[]
  industries: string[]
  locations: string[]
  excludedCompanies: string[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await Promise.all([
    updateProfile(user.id, { cv_text: values.cvText }),
    updatePreferences(user.id, {
      target_roles: values.targetRoles,
      industries: values.industries,
      locations: values.locations,
      excluded_companies: values.excludedCompanies,
    }),
  ])

  revalidatePath('/preferences')
}
