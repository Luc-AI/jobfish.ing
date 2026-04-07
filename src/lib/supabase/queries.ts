import { createClient } from './server'
import type { Database } from './types'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type PreferencesUpdate = Database['public']['Tables']['preferences']['Update']
type JobActionStatus = Database['public']['Enums']['job_action_status']

export async function getProfile(userId: string) {
  const supabase = await createClient()
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
}

export async function updateProfile(userId: string, data: Omit<ProfileUpdate, 'id' | 'created_at'>) {
  const supabase = await createClient()
  return supabase
    .from('profiles')
    .update(data)
    .eq('id', userId)
}

export async function getPreferences(userId: string) {
  const supabase = await createClient()
  return supabase
    .from('preferences')
    .select('*')
    .eq('user_id', userId)
    .single()
}

export async function updatePreferences(userId: string, data: Omit<PreferencesUpdate, 'id' | 'user_id'>) {
  const supabase = await createClient()
  return supabase
    .from('preferences')
    .update(data)
    .eq('user_id', userId)
}

export async function getJobFeed(
  userId: string,
  page: number = 1,
  pageSize: number = 20,
  hideHidden: boolean = true
) {
  const supabase = await createClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // Get IDs of jobs the user has hidden, to exclude them
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
      id,
      score,
      reasoning,
      dimensions,
      notified_at,
      created_at,
      jobs (
        id,
        title,
        company,
        location,
        url,
        source,
        scraped_at
      ),
      user_job_actions (
        status,
        applied_at
      )
    `)
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .range(from, to)

  if (hideHidden && hiddenJobIds.length > 0) {
    query = query.not('job_id', 'in', `(${hiddenJobIds.join(',')})`)
  }

  return query
}

export async function upsertJobAction(
  userId: string,
  jobId: string,
  status: JobActionStatus
) {
  const supabase = await createClient()
  return supabase
    .from('user_job_actions')
    .upsert(
      {
        user_id: userId,
        job_id: jobId,
        status,
        applied_at: status === 'applied' ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id,job_id' }
    )
}
