// src/app/api/onboarding/complete/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tasks, runs } from '@trigger.dev/sdk'
import type { evaluateJobsTask } from '@/trigger/evaluate-jobs'

export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const oneDayAgo    = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Phase 1: jobs from the last 24h — wait for completion so the user lands on a
    // populated dashboard. Expected runtime: ~15–45s.
    const handle1 = await tasks.trigger<typeof evaluateJobsTask>('evaluate-jobs', {
      userIds: [user.id],
      since: oneDayAgo,
      phase: 'onboarding-1',
    })

    // Phase 2: jobs from 2–7 days ago — trigger immediately so it's ready to await
    // if we need the fallback.
    const handle2 = await tasks.trigger<typeof evaluateJobsTask>('evaluate-jobs', {
      userIds: [user.id],
      since: sevenDaysAgo,
      until: oneDayAgo,
      phase: 'onboarding-2',
    })

    const run1 = await runs.poll(handle1, { pollIntervalMs: 1000 })

    // If phase-1 crashed/failed or found nothing, wait for phase-2 as fallback.
    const phase1Empty =
      !run1.isSuccess ||
      run1.output?.evaluatedCount === 0

    if (phase1Empty) {
      await runs.poll(handle2, { pollIntervalMs: 1000 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 })
  }
}
