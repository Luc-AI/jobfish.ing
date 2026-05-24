// src/trigger/lib/pre-filter.ts
import type { RoleSelection } from '@/lib/supabase/types'
import { ROLE_TAXONOMY } from '@/lib/roles'

export interface FilterableJob {
  title: string
  company: string
  industry: string | null
  categories: string[] | null
}

export interface UserPrefsForFilter {
  target_roles: RoleSelection[]
  excluded_companies: string[]
  excluded_industries: string[]
}

export function deriveTargetCategories(roles: RoleSelection[]): string[] {
  const selected = new Set(roles.map(r => r.role))
  const categories = new Set<string>()
  for (const cat of ROLE_TAXONOMY) {
    for (const group of cat.groups) {
      if (group.roles.some(r => selected.has(r))) {
        categories.add(cat.id)
        break
      }
    }
  }
  return [...categories]
}

export function filterJobsForUser<T extends FilterableJob>(
  jobs: T[],
  prefs: UserPrefsForFilter
): T[] {
  return jobs.filter(job => {
    // 1. Category overlap — fail-open when no target categories or null job categories
    const targetCategories = deriveTargetCategories(prefs.target_roles)
    if (targetCategories.length > 0 && job.categories && job.categories.length > 0) {
      const hasOverlap = job.categories.some(c => targetCategories.includes(c))
      if (!hasOverlap) return false
    }

    // 2. Company exclusion
    if (prefs.excluded_companies.length > 0) {
      const companyLower = job.company.toLowerCase()
      if (prefs.excluded_companies.some(c => c.toLowerCase() === companyLower)) {
        return false
      }
    }

    // 3. Industry exclusion — null and "Other" always pass through
    if (
      prefs.excluded_industries.length > 0 &&
      job.industry &&
      job.industry !== 'Other'
    ) {
      const industryLower = job.industry.toLowerCase()
      if (prefs.excluded_industries.some(i => i.toLowerCase() === industryLower)) {
        return false
      }
    }

    return true
  })
}
