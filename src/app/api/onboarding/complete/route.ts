import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tasks } from '@trigger.dev/sdk'

// Allow up to 5 minutes for the initial scrape to complete
export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await tasks.triggerAndWait(
      'scrape-jobs-initial',
      { userId: user.id }
    )

    if (!result.ok) {
      return NextResponse.json({ error: 'Scrape failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Scrape failed' }, { status: 500 })
  }
}
