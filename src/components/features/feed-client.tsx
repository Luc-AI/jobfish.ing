'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { JobLogRow } from './job-log-row'
import { groupByDateBucket, type DateBucket } from '@/lib/feed/group-by-date'
import { loadMoreFeed } from '@/app/(app)/dashboard/load-more-action'
import type { FeedItem, FeedTab } from '@/lib/supabase/queries'
import type { ScoreFilter, TimeFilter } from '@/lib/feed/filters'

const BUCKET_LABELS: Record<DateBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 days',
  older: 'Older',
}

interface FeedClientProps {
  initialItems: FeedItem[]
  totalCount: number
  pageSize: number
  tab: FeedTab
  scoreFilter: ScoreFilter
  timeFilter: TimeFilter
  onPass: (jobId: string) => Promise<void>
  onSave: (jobId: string) => Promise<void>
  onMarkRead: (jobId: string) => Promise<void>
}

export function FeedClient({
  initialItems,
  totalCount,
  pageSize,
  tab,
  scoreFilter,
  timeFilter,
  onPass,
  onSave,
  onMarkRead,
}: FeedClientProps) {
  const [items, setItems] = useState<FeedItem[]>(initialItems)
  const [nextPage, setNextPage] = useState(2)
  const [exhausted, setExhausted] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const visibleItems = items.filter((i: FeedItem) => !dismissedIds.has(i.job_id))
  const hasMore = !exhausted && items.length < totalCount

  if (visibleItems.length === 0) {
    return null
  }

  const grouped = groupByDateBucket(visibleItems)

  function handleLoadMore() {
    startTransition(async () => {
      const { items: more } = await loadMoreFeed({
        tab,
        score: scoreFilter,
        time: timeFilter,
        page: nextPage,
        pageSize,
      })
      setItems((prev: FeedItem[]) => {
        const seen = new Set(prev.map(p => p.id))
        const fresh = more.filter(m => !seen.has(m.id))
        if (fresh.length === 0) setExhausted(true)
        return [...prev, ...fresh]
      })
      setNextPage(p => p + 1)
    })
  }

  function renderRow(item: FeedItem) {
    const status = (item.user_job_actions?.status ?? 'new') as 'new' | 'saved' | 'applied' | 'dismissed'
    return (
      <JobLogRow
        key={item.id}
        id={item.id}
        jobId={item.job_id}
        title={item.jobs.title}
        company={item.jobs.company}
        location={item.jobs.location}
        url={item.jobs.url}
        remoteType={item.jobs.remote_type}
        score={item.score}
        chips={item.chips}
        isUnread={item.is_unread}
        syncedAt={item.jobs.synced_at}
        status={status}
        appliedAt={item.user_job_actions?.applied_at}
        onPass={() => {
          setDismissedIds((prev: Set<string>) => new Set([...prev, item.job_id]))
          void onPass(item.job_id)
        }}
        onSave={() => void onSave(item.job_id)}
        onDetails={() => {
          void onMarkRead(item.job_id)
          router.push(`/dashboard/jobs/${item.job_id}`)
        }}
      />
    )
  }

  return (
    <div>
      {grouped.map(group => (
        <div key={group.bucket} className="mb-6">
          <div className="text-sm font-semibold text-muted-foreground pb-2 mb-3 border-b border-border">
            {BUCKET_LABELS[group.bucket]}
          </div>
          <div className="flex flex-col gap-3">
            {group.items.map(renderRow)}
          </div>
        </div>
      ))}
      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isPending}
            className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50 min-h-[44px]"
          >
            {isPending ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
