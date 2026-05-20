// src/trigger/lib/jobich.ts

const JOBICH_BASE_URL = 'https://jobich.ch'

export interface JobichJob {
  id: string
  title: string
  company: string
  location: string | null
  remote_type: 'Remote' | 'Hybrid' | 'Onsite' | null
  description: string | null
  url: string
  posted_at: string | null
  updated_at: string
  source: string
  industry: string | null
}

export interface DeltaResponse {
  added: JobichJob[]
  updated: JobichJob[]
  removed: Array<{ id: string; url: string }>
  server_time: string
}

export interface NormalizedJob {
  external_id: string
  title: string
  company: string
  location: string | null
  remote_type: string | null
  description: string | null
  url: string
  date_posted: string | null
  job_updated_at: string
  source: string
  industry: string | null
}

export function stripHtml(html: string | null): string | null {
  if (!html) return null
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped || null
}

export function parseDate(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

export function normalizeJobichJob(raw: JobichJob): NormalizedJob {
  return {
    external_id: raw.id,
    title: raw.title,
    company: raw.company ?? 'Unknown',
    location: raw.location ?? null,
    remote_type: raw.remote_type ?? null,
    description: stripHtml(raw.description),
    url: raw.url,
    date_posted: parseDate(raw.posted_at),
    job_updated_at: raw.updated_at,
    source: raw.source,
    industry: raw.industry ?? null,
  }
}

export async function fetchDelta(since: string): Promise<DeltaResponse> {
  const apiKey = process.env.JOBICH_API_KEY
  if (!apiKey) throw new Error('JOBICH_API_KEY is not set')

  const url = `${JOBICH_BASE_URL}/api/v1/jobs/changes?since=${encodeURIComponent(since)}`
  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    throw new Error(`Jobich API error ${res.status}: ${await res.text()}`)
  }

  return res.json() as Promise<DeltaResponse>
}
