import { redirect } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getJobFeed, getPreferences, upsertLastVisit, type FeedTab, type FeedItem } from '@/lib/supabase/queries'
import { LogTab } from '@/components/features/log-tab'
import { LowConfidenceFold } from '@/components/features/low-confidence-fold'
import { Button } from '@/components/ui/button'

interface DashboardPageProps {
  searchParams: Promise<{ tab?: string; page?: string }>
}

function isValidTab(s: string | undefined): s is FeedTab {
  return s === 'all' || s === 'saved' || s === 'applied' || s === 'dismissed'
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const tab: FeedTab = isValidTab(params.tab) ? params.tab : 'all'
  const page = Math.max(1, Number(params.page ?? 1))
  const pageSize = 20

  const [feedResult, prefsResult] = await Promise.all([
    getJobFeed(user.id, tab, page, pageSize),
    getPreferences(user.id),
  ])

  const feed: FeedItem[] = feedResult.data ?? []
  const threshold = prefsResult.data?.score_threshold ?? 7.0

  const unreadCount = tab === 'all' ? feed.filter(f => f.is_unread).length : 0
  const totalCount = feed.length

  const aboveThreshold = tab === 'all' ? feed.filter(f => f.score >= threshold) : feed
  const belowThreshold = tab === 'all' ? feed.filter(f => f.score < threshold) : []

  const [savedResult, appliedResult, dismissedResult] = await Promise.all([
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'saved'),
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'applied'),
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'dismissed'),
  ])

  const tabs = [
    { value: 'all', label: 'All', count: totalCount },
    { value: 'saved', label: 'Saved', count: savedResult.count ?? 0 },
    { value: 'applied', label: 'Applied', count: appliedResult.count ?? 0 },
    { value: 'dismissed', label: 'Dismissed', count: dismissedResult.count ?? 0 },
  ]

  // Update last visit timestamp after computing unread counts
  if (tab === 'all') {
    await upsertLastVisit(user.id)
  }

  const subtitleParts: string[] = []
  if (tab === 'all' && unreadCount > 0) {
    subtitleParts.push(`${unreadCount} new since your last visit`)
  }
  if (tab === 'all') {
    subtitleParts.push(`${totalCount} total this week`)
  }

  return (
    <div style={{ maxWidth: 816, margin: '0 auto', padding: '32px 16px' }}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1
            className="font-bold leading-tight"
            style={{ fontSize: 28, letterSpacing: '-0.6px' }}
          >
            Your job log
          </h1>
          {subtitleParts.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {subtitleParts.join(' · ')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>Search</Button>
          <Button variant="outline" size="sm" disabled>Filters</Button>
        </div>
      </div>

      <LogTab tabs={tabs} activeTab={tab} />

      <div
        className="flex items-center gap-1.5 mt-3 mb-6 text-muted-foreground"
        style={{ fontSize: 12 }}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Sorted for you · freshness × match score</span>
      </div>

      <div className="flex flex-col gap-3">
        {aboveThreshold.map(item => (
          <div
            key={item.id}
            className="p-4 border rounded-xl text-sm bg-card"
          >
            <span className="font-semibold">{item.jobs.title}</span>
            <span className="text-muted-foreground ml-2">{item.jobs.company}</span>
            <span className="text-muted-foreground ml-2 tabular-nums">{item.score.toFixed(1)}</span>
          </div>
        ))}
      </div>

      {tab === 'all' && belowThreshold.length > 0 && (
        <LowConfidenceFold count={belowThreshold.length} threshold={threshold}>
          <div className="flex flex-col gap-3">
            {belowThreshold.map(item => (
              <div
                key={item.id}
                className="p-4 border rounded-xl text-sm bg-card"
              >
                <span className="font-semibold">{item.jobs.title}</span>
                <span className="text-muted-foreground ml-2">{item.jobs.company}</span>
                <span className="text-muted-foreground ml-2 tabular-nums">{item.score.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </LowConfidenceFold>
      )}
    </div>
  )
}
