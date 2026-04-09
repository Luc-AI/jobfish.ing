import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/queries'
import { NotificationsForm } from '@/components/features/notifications-form'
import { saveNotificationSettings } from './actions'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await getProfile(user.id)

  // Get most recent notification timestamp across all evaluations
  const { data: lastEval } = await supabase
    .from('job_evaluations')
    .select('notified_at')
    .eq('user_id', user.id)
    .not('notified_at', 'is', null)
    .order('notified_at', { ascending: false })
    .limit(1)
    .single()

  return (
    <div className="p-8 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Control when and how you get notified.
        </p>
      </div>

      <NotificationsForm
        defaultThreshold={profile?.threshold ?? 7.0}
        defaultEnabled={profile?.notifications_enabled ?? true}
        lastNotifiedAt={lastEval?.notified_at ?? null}
        onSave={saveNotificationSettings}
      />
    </div>
  )
}
