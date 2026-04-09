import * as Sentry from '@sentry/node'

const CAREER_SITE_ENDPOINT =
  'https://api.apify.com/v2/acts/fantastic-jobs~career-site-job-listing-api/run-sync-get-dataset-items'

const LINKEDIN_ENDPOINT =
  'https://api.apify.com/v2/acts/fantastic-jobs~advanced-linkedin-job-search-api/run-sync-get-dataset-items'

// Maps user-entered city names to the "City, Country" format Apify expects.
// Extend this map as you add more locations to the preferences UI.
const LOCATION_MAP: Record<string, string> = {
  'Zurich': 'Zurich, Switzerland',
  'Zürich': 'Zurich, Switzerland',
  'Geneva': 'Geneva, Switzerland',
  'Genève': 'Geneva, Switzerland',
  'Basel': 'Basel, Switzerland',
  'Bern': 'Bern, Switzerland',
  'Berlin': 'Berlin, Germany',
  'Munich': 'Munich, Germany',
  'Hamburg': 'Hamburg, Germany',
  'Frankfurt': 'Frankfurt, Germany',
  'London': 'London, United Kingdom',
  'Amsterdam': 'Amsterdam, Netherlands',
  'Paris': 'Paris, France',
  'Vienna': 'Vienna, Austria',
  'Stockholm': 'Stockholm, Sweden',
  'Barcelona': 'Barcelona, Spain',
  'Madrid': 'Madrid, Spain',
  'Lisbon': 'Lisbon, Portugal',
  'New York': 'New York, United States',
  'San Francisco': 'San Francisco, United States',
}

export interface NormalizedJob {
  title: string
  company: string
  location: string
  url: string
  source: string
  description: string | null
}

export interface ApifyInput {
  timeRange: string
  limit: number
  descriptionType: string
  includeAi: boolean
  removeAgency: boolean
  titleSearch: string[]
  locationSearch: string[]
  organizationExclusionSearch: string[]
  aiWorkArrangementFilter?: string[]
}

export interface UserPreference {
  target_roles: string[]
  locations: string[]
  excluded_companies: string[]
}

export function toApifyLocation(city: string): string {
  return LOCATION_MAP[city] ?? city
}

export function buildApifyInput(preferences: UserPreference[]): ApifyInput {
  const titleSearch = [...new Set(preferences.flatMap(p => p.target_roles ?? []))]

  const rawLocations = [...new Set(preferences.flatMap(p => p.locations ?? []))]
  const locationSearch = rawLocations
    .filter(l => l.toLowerCase() !== 'remote')
    .map(toApifyLocation)
    .filter((v, i, arr) => arr.indexOf(v) === i)

  const hasRemoteUsers = rawLocations.some(l => l.toLowerCase() === 'remote')
  const organizationExclusionSearch = [
    ...new Set(preferences.flatMap(p => p.excluded_companies ?? [])),
  ]

  return {
    timeRange: '1h',
    limit: 200,
    descriptionType: 'text',
    includeAi: true,
    removeAgency: true,
    titleSearch,
    locationSearch,
    organizationExclusionSearch,
    ...(hasRemoteUsers && { aiWorkArrangementFilter: ['Remote OK', 'Remote Solely'] }),
  }
}

export function normalizeFantasticJob(raw: Record<string, unknown>): NormalizedJob | null {
  const url = raw.url as string | undefined
  const title = raw.title as string | undefined
  const org = raw.organization as string | undefined

  if (!url || !title || !org) return null

  const derived = raw.locations_derived as Array<{ city?: string; country?: string }> | undefined
  let location = 'Unknown'

  if (derived?.[0]?.city && derived[0]?.country) {
    location = `${derived[0].city}, ${derived[0].country}`
  } else if (raw.remote_derived) {
    location = 'Remote'
  } else {
    location = (raw.locations_alt_raw as string[] | undefined)?.[0] ?? 'Unknown'
  }

  return {
    title,
    company: org,
    location,
    url,
    source: ((raw.source as string | undefined) || 'unknown'),
    description: (raw.description_text as string | undefined) ?? null,
  }
}

async function callApifyActor(
  endpoint: string,
  input: ApifyInput & { excludeATSDuplicate?: boolean }
): Promise<NormalizedJob[]> {
  const token = process.env.APIFY_API_TOKEN!

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(270_000),
  })

  if (!res.ok) {
    throw new Error(`Apify error ${res.status}: ${await res.text()}`)
  }

  const items = (await res.json()) as Record<string, unknown>[]
  return items
    .map(normalizeFantasticJob)
    .filter((j): j is NormalizedJob => j !== null)
}

export async function scrapeAll(preferences: UserPreference[]): Promise<NormalizedJob[]> {
  if (!process.env.APIFY_API_TOKEN) throw new Error('APIFY_API_TOKEN is not set')

  const baseInput = buildApifyInput(preferences)

  if (baseInput.titleSearch.length === 0) {
    console.log('No job titles in preferences, skipping Apify scrape.')
    return []
  }

  const [careerSiteResult, linkedInResult] = await Promise.allSettled([
    callApifyActor(CAREER_SITE_ENDPOINT, baseInput),
    callApifyActor(LINKEDIN_ENDPOINT, { ...baseInput, excludeATSDuplicate: true }),
  ])

  const jobs: NormalizedJob[] = []

  if (careerSiteResult.status === 'fulfilled') {
    jobs.push(...careerSiteResult.value)
  } else {
    console.error('Career site actor failed:', careerSiteResult.reason)
    Sentry.captureException(careerSiteResult.reason)
  }

  if (linkedInResult.status === 'fulfilled') {
    jobs.push(...linkedInResult.value)
  } else {
    console.error('LinkedIn actor failed:', linkedInResult.reason)
    Sentry.captureException(linkedInResult.reason)
  }

  return jobs
}
