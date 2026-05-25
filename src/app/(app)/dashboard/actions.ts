'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { upsertJobAction as upsertJobActionQuery, markJobRead } from '@/lib/supabase/queries'

export async function upsertJobAction(
  jobId: string,
  status: 'saved' | 'dismissed' | 'applied'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await upsertJobActionQuery(user.id, jobId, status)
  revalidatePath('/dashboard')
}

export async function markJobReadAction(jobId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await markJobRead(user.id, jobId)
}

export async function passJobAction(jobId: string) {
  return upsertJobAction(jobId, 'dismissed')
}

export async function saveJobAction(jobId: string) {
  return upsertJobAction(jobId, 'saved')
}

export async function deleteJobAction(jobId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('user_job_actions').delete().eq('user_id', user.id).eq('job_id', jobId)
  revalidatePath('/dashboard')
}
