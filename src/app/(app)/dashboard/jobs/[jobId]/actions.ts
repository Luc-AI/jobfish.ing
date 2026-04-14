'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { upsertJobAction as upsertJobActionQuery } from '@/lib/supabase/queries'

export async function upsertJobActionFromDetail(
  jobId: string,
  status: 'saved' | 'hidden' | 'applied'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await upsertJobActionQuery(user.id, jobId, status)

  if (status === 'hidden') {
    redirect('/dashboard')
  }

  revalidatePath(`/dashboard/jobs/${jobId}`)
}
