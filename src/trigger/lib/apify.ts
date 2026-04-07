import { ApifyClient } from 'apify-client'

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN })

export interface NormalizedJob {
  title: string
  company: string
  location: string | null
  url: string
  source: string
  description: string | null
}

// Maps raw Apify actor output to our normalized job shape.
// Returns null if the item is missing required fields.
export function normalizeApifyJob(
  source: string,
  raw: Record<string, unknown>
): NormalizedJob | null {
  const url =
    (raw.jobUrl as string) ??
    (raw.url as string) ??
    (raw.applyUrl as string) ??
    null

  if (!url) return null

  return {
    title: (raw.title as string) ?? (raw.positionName as string) ?? 'Unknown',
    company: (raw.companyName as string) ?? (raw.company as string) ?? 'Unknown',
    location: (raw.location as string) ?? null,
    url,
    source,
    description:
      (raw.description as string) ??
      (raw.descriptionHtml as string) ??
      null,
  }
}

export async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const run = await client.actor(actorId).call(input, { waitSecs: 120 })
  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  return items as Record<string, unknown>[]
}

// Scrape LinkedIn jobs for given keywords and location
export async function scrapeLinkedIn(
  keywords: string[],
  location: string
): Promise<NormalizedJob[]> {
  const items = await runApifyActor('curious_coder/linkedin-jobs-scraper', {
    keywords,
    location,
    maxResults: 50,
  })
  return items
    .map(item => normalizeApifyJob('linkedin', item))
    .filter((j): j is NormalizedJob => j !== null)
}

// Scrape Jobs.ch for given keywords
export async function scrapeJobsCh(keywords: string[]): Promise<NormalizedJob[]> {
  const items = await runApifyActor('apify/jobs-ch-scraper', {
    query: keywords.join(' '),
    maxResults: 50,
  })
  return items
    .map(item => normalizeApifyJob('jobs.ch', item))
    .filter((j): j is NormalizedJob => j !== null)
}
