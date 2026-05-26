// src/lib/supabase/queries.ts
import { createClient } from './server'
import type { Database } from './types'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type PreferencesUpdate = Database['public']['Tables']['preferences']['Update']
type JobActionStatus = Database['public']['Enums']['job_action_status']

export async function getProfile(userId: string) {
  const supabase = await createClient()
  return supabase.from('profiles').select('*').eq('id', userId).single()
}

export async function updateProfile(userId: string, data: Omit<ProfileUpdate, 'id' | 'created_at'>) {
  const supabase = await createClient()
  return supabase.from('profiles').update(data).eq('id', userId)
}

export async function getPreferences(userId: string) {
  const supabase = await createClient()
  return supabase.from('preferences').select('*').eq('user_id', userId).single()
}

export async function updatePreferences(userId: string, data: Omit<PreferencesUpdate, 'id' | 'user_id'>) {
  const supabase = await createClient()
  return supabase.from('preferences').update(data).eq('user_id', userId)
}

export type Chip = { tone: 'pos' | 'warn' | 'neg'; label: string }

export type FeedTab = 'all' | 'saved' | 'applied' | 'dismissed'

export type FeedItem = {
  id: string
  job_id: string
  score: number
  reasoning: string | null
  dimensions: unknown
  notified_at: string | null
  created_at: string
  read_at: string | null
  chips: Chip[]
  is_unread: boolean
  jobs: {
    id: string
    title: string
    company: string
    location: string | null
    url: string
    source: string
    remote_type: string | null
    industry: string | null
    synced_at: string
  }
  user_job_actions: {
    job_id: string
    status: string
    applied_at: string | null
  } | null
}

function firstThreeWords(s: string): string {
  return s.split(/\s+/).slice(0, 3).join(' ')
}

export function deriveChipsFromReasoning(
  detailed_reasoning: { strengths?: string[]; concerns?: string[]; red_flags?: string[] } | null
): Chip[] {
  const chips: Chip[] = []

  const strengths = detailed_reasoning?.strengths ?? []
  const concerns = detailed_reasoning?.concerns ?? []
  const red_flags = detailed_reasoning?.red_flags ?? []

  for (const s of strengths.slice(0, 2)) {
    chips.push({ tone: 'pos', label: firstThreeWords(s) })
  }

  for (const c of concerns) {
    if (chips.length >= 3) break
    chips.push({ tone: 'warn', label: firstThreeWords(c) })
  }

  for (const r of red_flags) {
    if (chips.length >= 3) break
    chips.push({ tone: 'neg', label: firstThreeWords(r) })
  }

  const fallbacks: Chip[] = [
    { tone: 'pos', label: 'Good overall fit' },
    { tone: 'warn', label: 'Review carefully' },
    { tone: 'neg', label: 'Significant concerns' },
  ]

  while (chips.length < 3) {
    chips.push(fallbacks[chips.length])
  }

  return chips
}

export async function getJobFeed(
  userId: string,
  tab: FeedTab = 'all',
  page: number = 1,
  pageSize: number = 20,
): Promise<{ data: FeedItem[]; error: unknown }> {
  const supabase = await createClient()
  const offset = (page - 1) * pageSize

  if (tab === 'all') {
    const { data: prefs } = await supabase
      .from('preferences')
      .select('last_dashboard_visit_at')
      .eq('user_id', userId)
      .maybeSingle()

    const lastVisit = prefs?.last_dashboard_visit_at ?? null
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch dismissed job IDs separately to avoid PostgREST LEFT→INNER JOIN coercion
    // when filtering on an embedded resource (`.not('user_job_actions.status', ...)` breaks LEFT JOIN)
    const { data: dismissedActions } = await supabase
      .from('user_job_actions')
      .select('job_id')
      .eq('user_id', userId)
      .eq('status', 'dismissed')
    const dismissedJobIds = dismissedActions?.map(a => a.job_id) ?? []

    let query = supabase
      .from('job_evaluations')
      .select(`
        id, job_id, score, reasoning, dimensions, notified_at, created_at, read_at, chips,
        detailed_reasoning,
        jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at),
        user_job_actions (job_id, status, applied_at)
      `)
      .eq('user_id', userId)
      .eq('jobs.is_active', true)
      // Include jobs with no notified_at (evaluated but not yet sent) as well as recent ones
      .or(`notified_at.is.null,notified_at.gte.${sevenDaysAgo}`)
      .order('score', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (dismissedJobIds.length > 0) {
      query = query.not('job_id', 'in', `(${dismissedJobIds.join(',')})`)
    }

    const { data: evaluations, error } = await query

    if (error) return { data: [], error }

    type EvalRow = {
      id: string; job_id: string; score: number; reasoning: string | null
      dimensions: unknown; notified_at: string | null; created_at: string
      read_at: string | null; chips: unknown; detailed_reasoning: unknown
      jobs: unknown; user_job_actions: unknown
    }

    const items: FeedItem[] = ((evaluations ?? []) as EvalRow[]).map(e => {
      const rawAction = Array.isArray(e.user_job_actions)
        ? (e.user_job_actions[0] ?? null)
        : (e.user_job_actions as { job_id: string; status: string; applied_at: string | null } | null)

      const chips: Chip[] = Array.isArray(e.chips) && e.chips.length > 0
        ? (e.chips as Chip[])
        : deriveChipsFromReasoning(
            e.detailed_reasoning as { strengths?: string[]; concerns?: string[]; red_flags?: string[] } | null
          )

      const is_unread =
        e.read_at === null &&
        (lastVisit === null || (e.notified_at !== null && e.notified_at > lastVisit))

      return {
        id: e.id,
        job_id: e.job_id,
        score: e.score,
        reasoning: e.reasoning,
        dimensions: e.dimensions,
        notified_at: e.notified_at,
        created_at: e.created_at,
        read_at: e.read_at,
        chips,
        is_unread,
        jobs: e.jobs as FeedItem['jobs'],
        user_job_actions: rawAction,
      }
    })

    return { data: items, error: null }
  }

  if (tab === 'saved' || tab === 'dismissed') {
    const { data: evaluations, error } = await supabase
      .from('job_evaluations')
      .select(`
        id, job_id, score, reasoning, dimensions, notified_at, created_at, read_at, chips,
        detailed_reasoning,
        jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at),
        user_job_actions!inner (job_id, status, applied_at)
      `)
      .eq('user_id', userId)
      .eq('jobs.is_active', true)
      .eq('user_job_actions.status', tab)
      .order('score', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) return { data: [], error }

    type EvalRow = {
      id: string; job_id: string; score: number; reasoning: string | null
      dimensions: unknown; notified_at: string | null; created_at: string
      read_at: string | null; chips: unknown; detailed_reasoning: unknown
      jobs: unknown; user_job_actions: unknown
    }

    const items: FeedItem[] = ((evaluations ?? []) as EvalRow[]).map(e => {
      const rawAction = Array.isArray(e.user_job_actions)
        ? (e.user_job_actions[0] ?? null)
        : (e.user_job_actions as { job_id: string; status: string; applied_at: string | null } | null)

      const chips: Chip[] = Array.isArray(e.chips) && e.chips.length > 0
        ? (e.chips as Chip[])
        : deriveChipsFromReasoning(
            e.detailed_reasoning as { strengths?: string[]; concerns?: string[]; red_flags?: string[] } | null
          )

      return {
        id: e.id,
        job_id: e.job_id,
        score: e.score,
        reasoning: e.reasoning,
        dimensions: e.dimensions,
        notified_at: e.notified_at,
        created_at: e.created_at,
        read_at: e.read_at,
        chips,
        is_unread: false,
        jobs: e.jobs as FeedItem['jobs'],
        user_job_actions: rawAction,
      }
    })

    return { data: items, error: null }
  }

  // applied tab — sort by applied_at DESC
  const { data: evaluations, error } = await supabase
    .from('job_evaluations')
    .select(`
      id, job_id, score, reasoning, dimensions, notified_at, created_at, read_at, chips,
      detailed_reasoning,
      jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at),
      user_job_actions!inner (job_id, status, applied_at)
    `)
    .eq('user_id', userId)
    .eq('jobs.is_active', true)
    .eq('user_job_actions.status', 'applied')
    .order('applied_at', { referencedTable: 'user_job_actions', ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error) return { data: [], error }

  type EvalRow = {
    id: string; job_id: string; score: number; reasoning: string | null
    dimensions: unknown; notified_at: string | null; created_at: string
    read_at: string | null; chips: unknown; detailed_reasoning: unknown
    jobs: unknown; user_job_actions: unknown
  }

  const items: FeedItem[] = ((evaluations ?? []) as EvalRow[]).map(e => {
    const rawAction = Array.isArray(e.user_job_actions)
      ? (e.user_job_actions[0] ?? null)
      : (e.user_job_actions as { job_id: string; status: string; applied_at: string | null } | null)

    const chips: Chip[] = Array.isArray(e.chips) && e.chips.length > 0
      ? (e.chips as Chip[])
      : deriveChipsFromReasoning(
          e.detailed_reasoning as { strengths?: string[]; concerns?: string[]; red_flags?: string[] } | null
        )

    return {
      id: e.id,
      job_id: e.job_id,
      score: e.score,
      reasoning: e.reasoning,
      dimensions: e.dimensions,
      notified_at: e.notified_at,
      created_at: e.created_at,
      read_at: e.read_at,
      chips,
      is_unread: false,
      jobs: e.jobs as FeedItem['jobs'],
      user_job_actions: rawAction,
    }
  })

  return { data: items, error: null }
}

export async function markJobRead(userId: string, jobId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('job_evaluations')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .is('read_at', null)
}

export async function upsertLastVisit(userId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('preferences')
    .update({ last_dashboard_visit_at: new Date().toISOString() })
    .eq('user_id', userId)
}

export async function upsertJobAction(userId: string, jobId: string, status: JobActionStatus) {
  const supabase = await createClient()
  return supabase
    .from('user_job_actions')
    .upsert(
      { user_id: userId, job_id: jobId, status, applied_at: status === 'applied' ? new Date().toISOString() : null },
      { onConflict: 'user_id,job_id' }
    )
}

export interface AppliedJob {
  job_id: string
  title: string
  company: string
  location: string | null
  url: string
  applied_at: string | null
  score: number | null
}

export async function getAppliedJobs(userId: string): Promise<{ data: AppliedJob[]; error: unknown }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_job_actions')
    .select(`
      job_id,
      applied_at,
      jobs!inner (id, title, company, location, url),
      job_evaluations (score)
    `)
    .eq('user_id', userId)
    .eq('status', 'applied')
    .order('applied_at', { ascending: false })

  if (error) return { data: [], error }

  type ActionRow = {
    job_id: string; applied_at: string | null
    jobs: unknown; job_evaluations: unknown
  }

  const items: AppliedJob[] = ((data ?? []) as ActionRow[]).map(row => {
    const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs
    const evaluation = Array.isArray(row.job_evaluations)
      ? (row.job_evaluations[0] ?? null)
      : row.job_evaluations

    return {
      job_id: row.job_id,
      title: (job as { title: string } | null)?.title ?? '',
      company: (job as { company: string } | null)?.company ?? '',
      location: (job as { location: string | null } | null)?.location ?? null,
      url: (job as { url: string } | null)?.url ?? '',
      applied_at: row.applied_at,
      score: (evaluation as { score: number } | null)?.score ?? null,
    }
  })

  return { data: items, error: null }
}

export interface JobDetailData {
  job: {
    id: string
    title: string
    company: string
    location: string | null
    url: string
    source: string
    description: string | null
    remote_type: string | null
    industry: string | null
    date_posted: string | null
    job_updated_at: string | null
    synced_at: string
    employment_type: string[] | null
    experience_level: string | null
    job_language: string | null
    working_hours: number | null
  }
  evaluation: {
    id: string
    score: number
    reasoning: string | null
    dimensions: {
      role_fit: number
      domain_fit: number
      experience_fit: number
      location_fit: number
      upside: number
    } | null
    detailed_reasoning: {
      summary: string
      strengths: string[]
      concerns: string[]
      red_flags: string[]
      recommendation: string
      dimension_explanations: {
        role_fit: string
        domain_fit: string
        experience_fit: string
        location_fit: string
        upside: string
      }
    } | null
  } | null
  action: {
    status: 'saved' | 'dismissed' | 'applied'
    applied_at: string | null
  } | null
}

export async function getJobDetail(userId: string, jobId: string): Promise<JobDetailData | null> {
  const supabase = await createClient()

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(`
      id, title, company, location, url, source, description,
      remote_type, industry, date_posted, job_updated_at, synced_at,
      employment_type, experience_level, job_language, working_hours
    `)
    .eq('id', jobId)
    .eq('is_active', true)
    .single()

  if (jobError || !job) return null

  const { data: evaluation } = await supabase
    .from('job_evaluations')
    .select('id, score, reasoning, dimensions, detailed_reasoning')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  const { data: action } = await supabase
    .from('user_job_actions')
    .select('status, applied_at')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (action?.status === 'dismissed') return null

  return {
    job: job as JobDetailData['job'],
    evaluation: evaluation
      ? {
          id: evaluation.id,
          score: evaluation.score,
          reasoning: evaluation.reasoning,
          dimensions: evaluation.dimensions as NonNullable<JobDetailData['evaluation']>['dimensions'],
          detailed_reasoning: evaluation.detailed_reasoning as NonNullable<JobDetailData['evaluation']>['detailed_reasoning'],
        }
      : null,
    action: action ? { status: action.status as 'saved' | 'dismissed' | 'applied', applied_at: action.applied_at } : null,
  }
}
