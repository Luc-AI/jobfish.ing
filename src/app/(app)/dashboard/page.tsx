import { redirect } from 'next/navigation'
import Link from 'next/link'
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
import {
  parseScoreFilter,
  parseTimeFilter,
  scoreFilterToFloor,
  type ScoreFilter,
  type TimeFilter,
} from '@/lib/feed/filters'
import { LogTab } from '@/components/features/log-tab'
import { FeedClient } from '@/components/features/feed-client'
import { FeedFilterBar } from '@/components/features/feed-filter-bar'
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
  searchParams: Promise<{ tab?: string; score?: string; time?: string }>
}

function isValidTab(s: string | undefined): s is FeedTab {
  return s === 'all' || s === 'saved' || s === 'applied' || s === 'dismissed'
}

function computeBucket(appliedAt: string | null): 'awaiting' | 'ghosted' {
  if (!appliedAt) return 'awaiting'
  const daysSince = (Date.now() - new Date(appliedAt).getTime()) / (1000 * 60 * 60 * 24)
  return daysSince > 14 ? 'ghosted' : 'awaiting'
}

function buildTitle(score: ScoreFilter, time: TimeFilter, count: number): string {
  const noun = count === 1 ? 'job' : 'jobs'
  const scorePhrase: Record<ScoreFilter, string> = {
    hot: count === 1 ? 'hot job' : 'hot jobs',
    threshold: `${noun} above threshold`,
    eight: `${noun} scoring 8 or higher`,
    seven: `${noun} scoring 7 or higher`,
    all: noun,
  }
  const timePhrase = time === '7d' ? 'in the last 7 days' : 'all-time'
  return `${count} ${scorePhrase[score]} ${timePhrase}`
}

interface EmptyCTA { label: string; href: string }

function buildEmptyCTAs(
  tab: FeedTab,
  score: ScoreFilter,
  time: TimeFilter
): EmptyCTA[] {
  const ctas: EmptyCTA[] = []
  if (time === '7d') {
    const params = new URLSearchParams({ tab, score, time: 'all' })
    ctas.push({ label: 'All time', href: `?${params.toString()}` })
  }
  if (score !== 'all') {
    const broader: ScoreFilter = score === 'hot' ? 'eight' : score === 'eight' ? 'seven' : 'all'
    const params = new URLSearchParams({ tab, score: broader, time })
    const label = broader === 'eight' ? '8+' : broader === 'seven' ? '7+' : 'All scores'
    ctas.push({ label, href: `?${params.toString()}` })
  }
  return ctas
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const tab: FeedTab = isValidTab(params.tab) ? params.tab : 'all'
  const score: ScoreFilter = parseScoreFilter(params.score)
  const time: TimeFilter = parseTimeFilter(params.time)
  const pageSize = 20

  const prefsResult = await getPreferences(user.id)
  const userThreshold = prefsResult.data?.score_threshold ?? 7.0
  const scoreFloor = scoreFilterToFloor(score, userThreshold)

  const usesFilteredFeed = tab === 'all' || tab === 'saved'

  const [feedResult, appliedResult] = await Promise.all([
    usesFilteredFeed
      ? getJobFeed(user.id, tab, 1, pageSize, scoreFloor, time)
      : tab === 'dismissed'
        ? getJobFeed(user.id, tab, 1, pageSize, 0, 'all')
        : Promise.resolve({ data: [] as FeedItem[], totalCount: 0, error: null }),
    tab === 'applied' ? getAppliedJobs(user.id) : Promise.resolve({ data: [] as AppliedJob[], error: null }),
  ])

  const feed: FeedItem[] = feedResult.data ?? []
  const totalCount = feedResult.totalCount ?? 0

  const [savedCountResult, appliedCountResult, dismissedCountResult] = await Promise.all([
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'saved'),
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'applied'),
    supabase.from('user_job_actions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'dismissed'),
  ])

  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'saved', label: 'Saved', count: savedCountResult.count ?? 0 },
    { value: 'applied', label: 'Applied', count: appliedCountResult.count ?? 0 },
    { value: 'dismissed', label: 'Dismissed', count: dismissedCountResult.count ?? 0 },
  ]

  if (tab === 'all') await upsertLastVisit(user.id)

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
        <h1
          className="font-bold leading-tight"
          style={{ fontSize: 28, letterSpacing: '-0.6px' }}
        >
          Your job log
        </h1>
        <Button variant="outline" size="sm" disabled>Search</Button>
      </div>

      <LogTab tabs={tabs} activeTab={tab} />

      {usesFilteredFeed && (
        <>
          <FeedFilterBar activeScore={score} activeTime={time} userThreshold={userThreshold} />

          <div className="text-sm text-muted-foreground mb-4">
            {buildTitle(score, time, totalCount)}
            {totalCount === 0 && (() => {
              const ctas = buildEmptyCTAs(tab, score, time)
              if (ctas.length === 0) return null
              return (
                <>
                  {' '}Try{' '}
                  {ctas.map((cta, i) => (
                    <span key={cta.href}>
                      <Link href={cta.href} className="underline">{cta.label}</Link>
                      {i < ctas.length - 1 ? ' or ' : '.'}
                    </span>
                  ))}
                </>
              )
            })()}
          </div>

          {totalCount > 0 && (
            <FeedClient
              initialItems={feed}
              totalCount={totalCount}
              pageSize={pageSize}
              tab={tab}
              scoreFilter={score}
              timeFilter={time}
              onPass={passJobAction}
              onSave={saveJobAction}
              onMarkRead={markJobReadAction}
            />
          )}
        </>
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
