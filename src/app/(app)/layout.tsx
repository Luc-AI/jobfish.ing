import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profileError && profileError.code !== 'PGRST116') {
    throw profileError
  }

  if (!profile?.onboarding_completed) redirect('/onboarding')

  return <AppShell userEmail={user.email}>{children}</AppShell>
}
