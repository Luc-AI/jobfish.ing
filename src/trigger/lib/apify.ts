// src/trigger/lib/apify.ts
// Thin HTTP client + pure-function normalizer for the daily fallback scrape.
// No Trigger.dev SDK imports — this file is unit-testable in isolation.

export type ApifySource = 'linkedin' | 'career_site'

export interface ApifyFallbackRow {
  source: ApifySource
  fetched_at: string
  title: string | null
  company: string | null
  location: string | null
  url: string | null
  raw: Record<string, unknown>
}

export const APIFY_ACTORS: Record<ApifySource, string> = {
  linkedin: 'fantastic-jobs~advanced-linkedin-job-search-api',
  career_site: 'fantastic-jobs~career-site-job-listing-api',
}

export const LINKEDIN_PAYLOAD = {
  aiHasSalary: false,
  aiVisaSponsorshipFilter: false,
  descriptionType: 'text',
  directApply: false,
  excludeATSDuplicate: false,
  externalApplyUrl: false,
  includeAi: true,
  limit: 100,
  locationExclusionSearch: ['Germany', 'Italy', 'France', 'Austria'],
  locationSearch: ['Zurich'],
  noDirectApply: false,
  populateAiRemoteLocation: false,
  populateAiRemoteLocationDerived: false,
  populateExternalApplyURL: true,
  recruiterOnly: false,
  remote: false,
  removeAgency: false,
  timeRange: '24h',
  titleSearch: [
    'HR:*',
    'Organisationsentwicklung:*',
    'Product Manager',
    'Product Owner',
    'Produktmanager',
  ],
} as const

export const CAREER_SITE_PAYLOAD = {
  aiExperienceLevelFilter: ['0-2', '2-5', '5-10'],
  aiHasSalary: false,
  aiVisaSponsorshipFilter: false,
  aiWorkArrangementFilter: ['On-site', 'Hybrid', 'Remote OK'],
  descriptionType: 'text',
  includeAi: true,
  includeLinkedIn: true,
  limit: 100,
  locationExclusionSearch: ['Italy', 'Germany', 'France', 'Austria'],
  locationSearch: ['Zurich'],
  populateAiRemoteLocation: false,
  populateAiRemoteLocationDerived: false,
  'remote only (legacy)': false,
  removeAgency: false,
  timeRange: '24h',
  titleSearch: [
    'Product Manager',
    'Product Owner',
    'Produktmanager',
    'HR:*',
    'Organisationsentwicklung:*',
  ],
} as const

/**
 * Walks candidate keys in order, returns the first non-empty string value.
 * Arrays of strings are joined with ", " (non-strings dropped).
 */
export function firstString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.length > 0) return v
    if (Array.isArray(v)) {
      const joined = v.filter((x): x is string => typeof x === 'string' && x.length > 0).join(', ')
      if (joined.length > 0) return joined
    }
  }
  return null
}

const TITLE_KEYS = ['title', 'job_title'] as const
const COMPANY_KEYS = ['organization', 'company', 'company_name'] as const
const LOCATION_KEYS = [
  'locations_derived',
  'location',
  'locations_raw',
  'cities_derived',
] as const
const URL_KEYS = ['url', 'job_url', 'external_apply_url'] as const

export function normalizeItem(
  source: ApifySource,
  item: Record<string, unknown>,
  fetchedAt: string,
): ApifyFallbackRow {
  return {
    source,
    fetched_at: fetchedAt,
    title: firstString(item, TITLE_KEYS),
    company: firstString(item, COMPANY_KEYS),
    location: firstString(item, LOCATION_KEYS),
    url: firstString(item, URL_KEYS),
    raw: item,
  }
}

/**
 * Calls an Apify actor's run-sync-get-dataset-items endpoint with the given input.
 * Returns the dataset items array. Throws on non-2xx or non-array responses
 * so the caller can isolate per-actor failures.
 */
export async function runActor(
  actorSlug: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new Error('APIFY_API_TOKEN is not set')

  const url = `https://api.apify.com/v2/actors/${actorSlug}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Apify actor ${actorSlug} failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error(`Apify actor ${actorSlug} returned non-array response`)
  }
  return data as Record<string, unknown>[]
}
