import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/queries'
import { AccountForm } from '@/components/features/account-form'
import { saveName } from './actions'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await getProfile(user.id)

  return (
    <div className="p-8 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your name and email address.
        </p>
      </div>

      <AccountForm
        firstName={profile?.first_name ?? ''}
        lastName={profile?.last_name ?? ''}
        email={user.email ?? ''}
        onSaveName={saveName}
      />
    </div>
  )
}
