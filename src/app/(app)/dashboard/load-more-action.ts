'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getJobFeed, getPreferences, type FeedItem, type FeedTab } from '@/lib/supabase/queries'
import { scoreFilterToFloor, type ScoreFilter, type TimeFilter } from '@/lib/feed/filters'

interface LoadMoreInput {
  tab: FeedTab
  score: ScoreFilter
  time: TimeFilter
  page: number
  pageSize: number
}

export async function loadMoreFeed(input: LoadMoreInput): Promise<{ items: FeedItem[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const prefs = await getPreferences(user.id)
  const userThreshold = prefs.data?.score_threshold ?? 7.0
  const scoreFloor = scoreFilterToFloor(input.score, userThreshold)

  const result = await getJobFeed(user.id, input.tab, input.page, input.pageSize, scoreFloor, input.time)

  return { items: result.data }
}
