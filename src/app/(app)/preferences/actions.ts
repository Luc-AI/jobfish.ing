'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateProfile, updatePreferences, getPreferences } from '@/lib/supabase/queries'
import type { RoleSelection } from '@/lib/supabase/types'
import { tasks } from '@trigger.dev/sdk'
import type { evaluateJobsTask } from '@/trigger/evaluate-jobs'

export async function savePreferences(values: {
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

  const { data: existingPrefs } = await getPreferences(user.id)
  const prevRoles = new Set(((existingPrefs?.target_roles ?? []) as RoleSelection[]).map(r => r.role))
  const nextRoles = new Set(values.targetRoles.map(r => r.role))
  const rolesChanged =
    prevRoles.size !== nextRoles.size || [...nextRoles].some(r => !prevRoles.has(r))

  await Promise.all([
    updateProfile(user.id, { years_experience: values.yearsExperience }),
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

  if (rolesChanged) {
    try {
      await tasks.trigger<typeof evaluateJobsTask>('evaluate-jobs', { userIds: [user.id] })
    } catch {
      // Non-fatal: feed will still hide stale jobs via query-time filter
    }
  }

  revalidatePath('/preferences')
}
