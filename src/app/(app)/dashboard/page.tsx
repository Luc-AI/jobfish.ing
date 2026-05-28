import { redirect } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  getJobFeed,
  getAppliedJobs,
  getPreferences,
  upsertLastVisit,
  type FeedTab,
  type FeedItem,
  type AppliedJob,
} from '@/lib/supabase/queries'
import { LogTab } from '@/components/features/log-tab'
import { LowConfidenceFold } from '@/components/features/low-confidence-fold'
import { FeedClient } from '@/components/features/feed-client'
import { AppliedTracker, type TrackerJob } from '@/components/features/applied-tracker'
import { DismissedList, type DismissedJob } from '@/components/features/dismissed-list'
import { Button } from '@/components/ui/button'
import {
  passJobAction,
  saveJobAction,
  markJobReadAction,
  deleteJobAction,
} from './actions'

interface DashboardPageProps {
  searchParams: Promise<{ tab?: string; page?: string }>
}

function isValidTab(s: string | undefined): s is FeedTab {
  return s === 'all' || s === 'saved' || s === 'applied' || s === 'dismissed'
}

function computeBucket(appliedAt: string | null): 'awaiting' | 'ghosted' {
  if (!appliedAt) return 'awaiting'
  const daysSince = (Date.now() - new Date(appliedAt).getTime()) / (1000 * 60 * 60 * 24)
  return daysSince > 14 ? 'ghosted' : 'awaiting'
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const tab: FeedTab = isValidTab(params.tab) ? params.tab : 'all'
  const page = Math.max(1, Number(params.page ?? 1))
  const pageSize = 20

  const [feedResult, prefsResult, appliedResult] = await Promise.all([
    tab !== 'applied' ? getJobFeed(user.id, tab, page, pageSize) : Promise.resolve({ data: [] as FeedItem[], totalCount: 0, error: null }),
    getPreferences(user.id),
    tab === 'applied' ? getAppliedJobs(user.id) : Promise.resolve({ data: [] as AppliedJob[], error: null }),
  ])

  const feed: FeedItem[] = feedResult.data ?? []
  const threshold = prefsResult.data?.score_threshold ?? 7.0

  const unreadCount = tab === 'all' ? feed.filter((f: FeedItem) => f.is_unread).length : 0
  const totalCount = feed.length

  const aboveThreshold: FeedItem[] = tab === 'all' ? feed.filter((f: FeedItem) => f.score >= threshold) : feed
  const belowThreshold: FeedItem[] = tab === 'all' ? feed.filter((f: FeedItem) => f.score < threshold) : []

  const [savedResult, appliedCountResult, dismissedResult] = await Promise.all([
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'saved'),
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'applied'),
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'dismissed'),
  ])

  const tabs = [
    { value: 'all', label: 'All', count: tab === 'all' ? totalCount : undefined },
    { value: 'saved', label: 'Saved', count: savedResult.count ?? 0 },
    { value: 'applied', label: 'Applied', count: appliedCountResult.count ?? 0 },
    { value: 'dismissed', label: 'Dismissed', count: dismissedResult.count ?? 0 },
  ]

  if (tab === 'all') {
    await upsertLastVisit(user.id)
  }

  const subtitleParts: string[] = []
  if (tab === 'all' && unreadCount > 0) subtitleParts.push(`${unreadCount} new since your last visit`)
  if (tab === 'all') subtitleParts.push(`${totalCount} total this week`)

  // Map feed items to DismissedJob shape for the Dismissed tab
  const dismissedJobs: DismissedJob[] = tab === 'dismissed'
    ? feed.map((f: FeedItem) => ({
        job_id: f.job_id,
        title: f.jobs.title,
        company: f.jobs.company,
        location: f.jobs.location,
        remoteType: f.jobs.remote_type,
        url: f.jobs.url,
      }))
    : []

  // Map AppliedJob to TrackerJob with bucket
  const trackerJobs: TrackerJob[] = (appliedResult.data ?? []).map((j: AppliedJob) => ({
    job_id: j.job_id,
    title: j.title,
    company: j.company,
    location: j.location,
    url: j.url,
    applied_at: j.applied_at,
    bucket: computeBucket(j.applied_at),
  }))

  return (
    <div style={{ maxWidth: 816, margin: '0 auto', padding: '32px 16px', overflowX: 'hidden' }}>
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

      {(tab === 'all' || tab === 'saved') && (
        <div
          className="flex items-center gap-1.5 mt-3 mb-6 text-muted-foreground"
          style={{ fontSize: 12 }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Sorted for you · freshness × match score</span>
        </div>
      )}

      {(tab === 'all' || tab === 'saved') && (
        <div className={tab === 'all' ? '' : 'mt-6'}>
          <FeedClient
            items={aboveThreshold}
            onPass={passJobAction}
            onSave={saveJobAction}
            onMarkRead={markJobReadAction}
            showSections={tab === 'all'}
          />

          {tab === 'all' && belowThreshold.length > 0 && (
            <LowConfidenceFold count={belowThreshold.length} threshold={threshold}>
              <FeedClient
                items={belowThreshold}
                onPass={passJobAction}
                onSave={saveJobAction}
                onMarkRead={markJobReadAction}
                showSections={false}
              />
            </LowConfidenceFold>
          )}
        </div>
      )}

      {tab === 'applied' && (
        <div className="mt-6">
          <AppliedTracker jobs={trackerJobs} />
        </div>
      )}

      {tab === 'dismissed' && (
        <div className="mt-6">
          <DismissedList
            jobs={dismissedJobs}
            onRestore={deleteJobAction}
          />
        </div>
      )}
    </div>
  )
}
