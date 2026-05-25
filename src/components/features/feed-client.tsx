'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { JobLogRow } from './job-log-row'
import { SectionHeader } from './section-header'
import type { FeedItem } from '@/lib/supabase/queries'

interface FeedClientProps {
  items: FeedItem[]
  onPass: (jobId: string) => Promise<void>
  onSave: (jobId: string) => Promise<void>
  onMarkRead: (jobId: string) => Promise<void>
  showSections?: boolean
}

export function FeedClient({
  items: initialItems,
  onPass,
  onSave,
  onMarkRead,
  showSections = false,
}: FeedClientProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const router = useRouter()

  const items = initialItems.filter((i: FeedItem) => !dismissedIds.has(i.job_id))

  const unread = showSections ? items.filter((i: FeedItem) => i.is_unread) : []
  const read = showSections ? items.filter((i: FeedItem) => !i.is_unread) : items

  if (items.length === 0) {
    return <p className="text-center text-muted-foreground py-12">No jobs to show</p>
  }

  function makeRow(item: FeedItem) {
    const status = (item.user_job_actions?.status ?? 'new') as 'new' | 'saved' | 'applied' | 'dismissed'
    return (
      <JobLogRow
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
        notifiedAt={item.notified_at}
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
      {showSections && unread.length > 0 && (
        <div>
          <SectionHeader title="New since last visit" count={unread.length} dotColor="#2563eb" marginTop={0} />
          <div className="flex flex-col gap-3 mt-4 mb-8">
            {unread.map((item: FeedItem) => (
              <div key={item.id}>{makeRow(item)}</div>
            ))}
          </div>
        </div>
      )}
      {read.length > 0 && (
        <div>
          {showSections && (
            <SectionHeader
              title="Past 7 days"
              count={read.length}
              dotColor="#a1a1aa"
              marginTop={unread.length > 0 ? 32 : 0}
            />
          )}
          <div className={`flex flex-col gap-3${showSections ? ' mt-4' : ''}`}>
            {read.map((item: FeedItem) => (
              <div key={item.id}>{makeRow(item)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
