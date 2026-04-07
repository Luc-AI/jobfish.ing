'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { upsertJobAction } from '@/lib/supabase/queries'

export async function upsertJobAction(
  jobId: string,
  status: 'saved' | 'hidden' | 'applied'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await upsertJobAction(user.id, jobId, status)
  revalidatePath('/dashboard')
}
