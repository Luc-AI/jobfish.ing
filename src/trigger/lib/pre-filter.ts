// src/trigger/lib/pre-filter.ts
import type { RoleSelection } from '@/lib/supabase/types'

export interface FilterableJob {
  title: string
  company: string
  industry: string | null
}

export interface UserPrefsForFilter {
  target_roles: RoleSelection[]
  excluded_companies: string[]
  excluded_industries: string[]
}

export function filterJobsForUser<T extends FilterableJob>(
  jobs: T[],
  prefs: UserPrefsForFilter
): T[] {
  return jobs.filter(job => {
    // 1. Title keyword match — skip entirely if user has no target roles
    if (prefs.target_roles.length > 0) {
      const titleLower = job.title.toLowerCase()
      const matchesRole = prefs.target_roles.some(r =>
        titleLower.includes(r.role.toLowerCase())
      )
      if (!matchesRole) return false
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
