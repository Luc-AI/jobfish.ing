'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateProfile } from '@/lib/supabase/queries'

export async function saveNotificationSettings(values: {
  threshold: number
  notificationsEnabled: boolean
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await updateProfile(user.id, {
    threshold: values.threshold,
    notifications_enabled: values.notificationsEnabled,
  })

  revalidatePath('/notifications')
}
