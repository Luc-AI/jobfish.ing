'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateProfile } from '@/lib/supabase/queries'

export async function saveName(values: { firstName: string; lastName: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await updateProfile(user.id, {
    first_name: values.firstName.trim() || null,
    last_name: values.lastName.trim() || null,
  })
  if (error) throw new Error(error.message)
}
