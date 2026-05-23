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

export type FeedSort = 'fresh' | 'best' | 'balanced' | 'archived'

const SORT_LAMBDA: Record<'fresh' | 'best' | 'balanced', number> = {
  fresh: 0.15,
  best: 0.02,
  balanced: 0.05,
}

export type FeedItem = {
  id: string
  job_id: string
  score: number
  reasoning: string | null
  dimensions: unknown
  notified_at: string | null
  created_at: string
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

export async function getJobFeed(
  userId: string,
  page: number = 1,
  pageSize: number = 20,
  hideHidden: boolean = true,
  sort: FeedSort = 'fresh'
): Promise<{ data: FeedItem[]; error: unknown }> {
  const supabase = await createClient()
  const offset = (page - 1) * pageSize

  // Active sorts — delegate to Postgres RPC
  if (sort !== 'archived') {
    const { data, error } = await supabase.rpc(
      'get_job_feed_ranked' as never,
      {
        p_user_id: userId,
        p_lambda:  SORT_LAMBDA[sort],
        p_offset:  offset,
        p_limit:   pageSize,
      } as never
    )
    return { data: (data as unknown as FeedItem[]) ?? [], error }
  }

  // Archived — jobs posted more than 30 days ago, newest first
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0] // 'YYYY-MM-DD' — matches DATE column type

  let hiddenJobIds: string[] = []
  if (hideHidden) {
    const { data: hiddenActions } = await supabase
      .from('user_job_actions')
      .select('job_id')
      .eq('user_id', userId)
      .eq('status', 'hidden')
    hiddenJobIds = (hiddenActions ?? []).map(a => a.job_id)
  }

  let query = supabase
    .from('job_evaluations')
    .select(`
      id, job_id, score, reasoning, dimensions, notified_at, created_at,
      jobs!inner (id, title, company, location, url, source, remote_type, industry, synced_at)
    `)
    .eq('user_id', userId)
    .eq('jobs.is_active', true)
    .lt('jobs.date_posted', thirtyDaysAgo)
    .order('date_posted', { referencedTable: 'jobs', ascending: false })
    .range(offset, offset + pageSize - 1)

  if (hideHidden && hiddenJobIds.length > 0) {
    query = query.not('job_id', 'in', `(${hiddenJobIds.join(',')})`)
  }

  const { data: evaluations, error } = await query
  if (error || !evaluations?.length) return { data: (evaluations ?? []) as unknown as FeedItem[], error }

  const jobIds = evaluations.map(e => e.job_id).filter(Boolean) as string[]
  const { data: actions } = await supabase
    .from('user_job_actions')
    .select('job_id, status, applied_at')
    .eq('user_id', userId)
    .in('job_id', jobIds)

  const actionsMap = new Map((actions ?? []).map(a => [a.job_id, a]))
  const merged = evaluations.map(e => ({
    ...e,
    user_job_actions: actionsMap.get(e.job_id) ?? null,
  }))

  return { data: merged as unknown as FeedItem[], error: null }
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
    status: 'saved' | 'hidden' | 'applied'
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

  if (action?.status === 'hidden') return null

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
    action: action ? { status: action.status as 'saved' | 'hidden' | 'applied', applied_at: action.applied_at } : null,
  }
}
