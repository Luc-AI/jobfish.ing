// src/lib/supabase/queries.ts
import { createClient } from './server'
import type { Database } from './types'
import { deriveTargetCategories } from '@/trigger/lib/pre-filter'
import type { RoleSelection } from './types'
import type { TimeFilter } from '@/lib/feed/filters'
import { parseTokens, matchesAllTokens } from '@/lib/search/match'

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
    date_posted: string | null
    categories: string[] | null
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

// Defense in depth: Supabase queries with `.order(..., { foreignTable })` have
// been observed returning duplicate rows in production despite UNIQUE(job_id, user_id).
// Deduplicate by FeedItem.id before returning.
function dedupById(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>()
  const out: FeedItem[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  if (out.length !== items.length) {
    console.warn(
      `getJobFeed: dropped ${items.length - out.length} duplicate row(s) from feed`,
    )
  }
  return out
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
  scoreFloor: number = 0,
  timeFilter: TimeFilter = '7d',
): Promise<{ data: FeedItem[]; totalCount: number; error: unknown }> {
  const supabase = await createClient()
  const offset = (page - 1) * pageSize

  if (tab === 'all') {
    const { data: prefs } = await supabase
      .from('preferences')
      .select('last_dashboard_visit_at, target_roles')
      .eq('user_id', userId)
      .maybeSingle()

    const lastVisit = prefs?.last_dashboard_visit_at ?? null
    const targetCategories = deriveTargetCategories((prefs?.target_roles ?? []) as RoleSelection[])

    // Fetch dismissed job IDs separately to avoid PostgREST LEFT→INNER JOIN coercion
    // when filtering on an embedded resource (`.not('user_job_actions.status', ...)` breaks LEFT JOIN)
    const { data: dismissedActions } = await supabase
      .from('user_job_actions')
      .select('job_id')
      .eq('user_id', userId)
      .eq('status', 'dismissed')
    const dismissedJobIds = dismissedActions?.map(a => a.job_id) ?? []

    const sevenDaysAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    let query = supabase
      .from('job_evaluations')
      .select(`
        id, job_id, score, reasoning, dimensions, notified_at, created_at, read_at, chips,
        detailed_reasoning,
        jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at, categories, date_posted)
      `, { count: 'exact' })
      .eq('user_id', userId)
      .eq('jobs.is_active', true)
      .gte('score', scoreFloor)
      .order('date_posted', { foreignTable: 'jobs', ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (timeFilter === '7d') {
      query = query.gte('jobs.date_posted', sevenDaysAgoDate)
    }

    if (dismissedJobIds.length > 0) {
      query = query.not('job_id', 'in', `(${dismissedJobIds.join(',')})`)
    }

    const { data: evaluations, error, count } = await query

    if (error) return { data: [], totalCount: 0, error }

    // Fetch user_job_actions separately — no FK exists between job_evaluations and user_job_actions
    const evalJobIds = (evaluations ?? []).map(e => e.job_id)
    const actionsByJobId = new Map<string, { job_id: string; status: string; applied_at: string | null }>()
    if (evalJobIds.length > 0) {
      const { data: actions } = await supabase
        .from('user_job_actions')
        .select('job_id, status, applied_at')
        .eq('user_id', userId)
        .in('job_id', evalJobIds)
      for (const a of actions ?? []) actionsByJobId.set(a.job_id!, { job_id: a.job_id!, status: a.status, applied_at: a.applied_at })
    }

    type EvalRow = {
      id: string; job_id: string; score: number; reasoning: string | null
      dimensions: unknown; notified_at: string | null; created_at: string
      read_at: string | null; chips: unknown; detailed_reasoning: unknown
      jobs: { id: string; title: string; company: string; location: string | null; url: string; source: string; remote_type: string | null; industry: string | null; synced_at: string; categories: string[] | null; date_posted: string | null }
    }

    const rawEvals = (evaluations ?? []) as EvalRow[]
    const filteredEvals = targetCategories.length > 0
      ? rawEvals.filter(e => {
          const cats = e.jobs.categories
          if (!cats || cats.length === 0) return true
          return cats.some(c => targetCategories.includes(c))
        })
      : rawEvals

    const items: FeedItem[] = filteredEvals.map(e => {
      const rawAction = actionsByJobId.get(e.job_id) ?? null

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

    const unique = dedupById(items)
    return { data: unique, totalCount: count ?? unique.length, error: null }
  }

  if (tab === 'saved' || tab === 'dismissed') {
    // Fetch actions first (status filter), then join to evaluations — no FK between the two tables
    const { data: actions, error: actionsError } = await supabase
      .from('user_job_actions')
      .select('job_id, status, applied_at')
      .eq('user_id', userId)
      .eq('status', tab)
    if (actionsError) return { data: [], totalCount: 0, error: actionsError }

    const actionJobIds = (actions ?? []).map(a => a.job_id!)
    if (actionJobIds.length === 0) return { data: [], totalCount: 0, error: null }

    const actionsByJobId = new Map<string, { job_id: string; status: string; applied_at: string | null }>(
      (actions ?? []).map(a => [a.job_id!, { job_id: a.job_id!, status: a.status, applied_at: a.applied_at }])
    )

    const sevenDaysAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    let query = supabase
      .from('job_evaluations')
      .select(`
        id, job_id, score, reasoning, dimensions, notified_at, created_at, read_at, chips,
        detailed_reasoning,
        jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at, date_posted)
      `, { count: 'exact' })
      .eq('user_id', userId)
      .eq('jobs.is_active', true)
      .in('job_id', actionJobIds)
      .gte('score', scoreFloor)
      .order('date_posted', { foreignTable: 'jobs', ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (timeFilter === '7d') {
      query = query.gte('jobs.date_posted', sevenDaysAgoDate)
    }

    const { data: evaluations, error, count } = await query

    if (error) return { data: [], totalCount: 0, error }

    type EvalRow = {
      id: string; job_id: string; score: number; reasoning: string | null
      dimensions: unknown; notified_at: string | null; created_at: string
      read_at: string | null; chips: unknown; detailed_reasoning: unknown
      jobs: { id: string; title: string; company: string; location: string | null; url: string; source: string; remote_type: string | null; industry: string | null; synced_at: string; date_posted: string | null }
    }

    const items: FeedItem[] = ((evaluations ?? []) as EvalRow[]).map(e => {
      const rawAction = actionsByJobId.get(e.job_id) ?? null

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

    const unique = dedupById(items)
    return { data: unique, totalCount: count ?? unique.length, error: null }
  }

  // applied tab — fetch actions first, sort by applied_at DESC in-memory
  const { data: appliedActions, error: appliedActionsError } = await supabase
    .from('user_job_actions')
    .select('job_id, status, applied_at')
    .eq('user_id', userId)
    .eq('status', 'applied')
    .order('applied_at', { ascending: false })
  if (appliedActionsError) return { data: [], totalCount: 0, error: appliedActionsError }

  const appliedJobIds = (appliedActions ?? []).map(a => a.job_id!)
  if (appliedJobIds.length === 0) return { data: [], totalCount: 0, error: null }

  const appliedByJobId = new Map<string, { job_id: string; status: string; applied_at: string | null }>(
    (appliedActions ?? []).map(a => [a.job_id!, { job_id: a.job_id!, status: a.status, applied_at: a.applied_at }])
  )

  const { data: evaluations, error } = await supabase
    .from('job_evaluations')
    .select(`
      id, job_id, score, reasoning, dimensions, notified_at, created_at, read_at, chips,
      detailed_reasoning,
      jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at)
    `)
    .eq('user_id', userId)
    .eq('jobs.is_active', true)
    .in('job_id', appliedJobIds)
    .range(offset, offset + pageSize - 1)

  if (error) return { data: [], totalCount: 0, error }

  type EvalRow = {
    id: string; job_id: string; score: number; reasoning: string | null
    dimensions: unknown; notified_at: string | null; created_at: string
    read_at: string | null; chips: unknown; detailed_reasoning: unknown
    jobs: unknown
  }

  const items: FeedItem[] = ((evaluations ?? []) as EvalRow[]).map(e => {
    const rawAction = appliedByJobId.get(e.job_id) ?? null

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

  // Preserve applied_at sort order from the actions query
  items.sort((a, b) => {
    const aAt = appliedByJobId.get(a.job_id)?.applied_at ?? ''
    const bAt = appliedByJobId.get(b.job_id)?.applied_at ?? ''
    return bAt.localeCompare(aAt)
  })

  return { data: items, totalCount: items.length, error: null }
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

export interface SearchOutcome {
  results: FeedItem[]
  totalMatches: number
}

const SEARCH_RESULT_CAP = 50

// Per-user row counts are small (hundreds, not thousands) — we fetch all evaluations and
// actions for the user and filter in memory. Source rows = the user's evaluations enriched
// with their actions: every actioned job has an evaluation, so this is equivalent to the
// "evaluations ∪ actions" union the plan describes.
export async function searchUserJobs(
  userId: string,
  query: string,
): Promise<SearchOutcome> {
  const tokens = parseTokens(query)
  if (tokens.length === 0) return { results: [], totalMatches: 0 }

  const supabase = await createClient()

  // 1) All evaluations for this user joined to active jobs.
  const { data: evaluations, error: evalErr } = await supabase
    .from('job_evaluations')
    .select(`
      id, job_id, score, reasoning, dimensions, notified_at, created_at, read_at, chips,
      detailed_reasoning,
      jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at, categories)
    `)
    .eq('user_id', userId)
    .eq('jobs.is_active', true)

  if (evalErr) {
    console.error('searchUserJobs: failed to fetch evaluations', evalErr)
    return { results: [], totalMatches: 0 }
  }

  // 2) All actions for this user (status + applied_at).
  const { data: actions, error: actionsErr } = await supabase
    .from('user_job_actions')
    .select('job_id, status, applied_at')
    .eq('user_id', userId)

  if (actionsErr) {
    console.error('searchUserJobs: failed to fetch actions', actionsErr)
  }

  const actionsByJobId = new Map<
    string,
    { job_id: string; status: string; applied_at: string | null }
  >()
  for (const a of actions ?? []) {
    if (a.job_id) {
      actionsByJobId.set(a.job_id, {
        job_id: a.job_id,
        status: a.status,
        applied_at: a.applied_at,
      })
    }
  }

  type EvalRow = {
    id: string; job_id: string; score: number; reasoning: string | null
    dimensions: unknown; notified_at: string | null; created_at: string
    read_at: string | null; chips: unknown; detailed_reasoning: unknown
    jobs: {
      id: string; title: string; company: string; location: string | null
      url: string; source: string; remote_type: string | null
      industry: string | null; synced_at: string; categories: string[] | null
    }
  }

  // 3) Build FeedItem list (one eval row per (user_id, job_id) — implicit dedup).
  const allItems: FeedItem[] = ((evaluations ?? []) as EvalRow[]).map((e) => {
    const action = actionsByJobId.get(e.job_id) ?? null
    const chips: Chip[] =
      Array.isArray(e.chips) && e.chips.length > 0
        ? (e.chips as Chip[])
        : deriveChipsFromReasoning(
            e.detailed_reasoning as {
              strengths?: string[]
              concerns?: string[]
              red_flags?: string[]
            } | null,
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
      user_job_actions: action,
    }
  })

  // 4) Filter by AND-of-tokens match across title/company/location/categories.
  const matched = allItems.filter((item) =>
    matchesAllTokens(
      {
        title: item.jobs.title,
        company: item.jobs.company,
        location: item.jobs.location,
        categories: item.jobs.categories ?? null,
      },
      tokens,
    ),
  )

  // 5) Sort by synced_at DESC, then cap.
  matched.sort((a, b) => b.jobs.synced_at.localeCompare(a.jobs.synced_at))
  const results = matched.slice(0, SEARCH_RESULT_CAP)

  return { results, totalMatches: matched.length }
}
