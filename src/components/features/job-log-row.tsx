'use client'

import { X, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { VerdictBlock } from './verdict-block'
import { LifecyclePill } from './lifecycle-pill'
import type { Chip } from './chip-neutral'

interface JobLogRowProps {
  id: string
  jobId: string
  title: string
  company: string
  location: string | null
  url: string
  remoteType: string | null
  score: number
  chips: Chip[]
  isUnread: boolean
  notifiedAt: string | null
  status: 'new' | 'saved' | 'applied' | 'dismissed'
  appliedAt?: string | null
  onPass?: () => void
  onSave?: () => void
  onDetails?: () => void
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 24) return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

export function JobLogRow({
  title,
  company,
  location,
  url,
  remoteType,
  score,
  chips,
  isUnread,
  notifiedAt,
  status,
  appliedAt,
  onPass,
  onSave,
  onDetails,
}: JobLogRowProps) {
  return (
    <div
      onClick={onDetails}
      className={cn(
        'flex flex-col sm:flex-row overflow-hidden rounded-xl border border-[#e4e4e7]',
        'shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow',
        'hover:shadow-[0_2px_4px_rgba(0,0,0,0.06)] hover:border-[#d4d4d8]',
        onDetails && 'cursor-pointer',
        isUnread ? 'bg-white' : 'bg-[#fafafa]',
      )}
    >
      {/* Main content */}
      <div className="flex gap-3 flex-1 min-w-0 px-5 py-[18px]">
        {/* Unread dot */}
        <div className="shrink-0 pt-[7px]">
          {isUnread
            ? <span className="w-2 h-2 rounded-full bg-[#2563eb] block" />
            : <span className="w-2 h-2 block" />}
        </div>

        {/* Logo */}
        <div className="shrink-0">
          <div className="w-12 h-12 rounded-xl bg-zinc-200 flex items-center justify-center text-[14px] font-bold text-zinc-600 overflow-hidden select-none ring-1 ring-zinc-300/60">
            {company.slice(0, 2).toUpperCase()}
          </div>
        </div>

        {/* Text + buttons */}
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'text-[16px] tracking-[-0.2px] truncate',
                isUnread ? 'font-bold' : 'font-semibold',
              )}
            >
              {title}
            </span>
            <LifecyclePill status={status} appliedAt={appliedAt} />
          </div>

          <span className="text-[13.5px] text-muted-foreground truncate">
            {company}
            {location ? ` · ${location}` : ''}
            {remoteType ? ` · ${remoteType}` : ''}
          </span>

          {notifiedAt && (
            <span className="mt-1 self-start inline-flex items-center rounded-full border border-[#e4e4e7] bg-white px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
              {formatRelativeTime(notifiedAt)}
            </span>
          )}

          {(onPass || onSave) && (
            <div
              className="flex items-center gap-2 mt-3"
              onClick={(e) => e.stopPropagation()}
            >
              {onPass && (
                <Button variant="outline" size="sm" onClick={onPass} className="h-8">
                  <X className="w-3.5 h-3.5 mr-1" />
                  Pass
                </Button>
              )}
              {onSave && (
                <Button variant="outline" size="sm" onClick={onSave} className="h-8">
                  <Bookmark className="w-3.5 h-3.5 mr-1" />
                  Save
                </Button>
              )}
              <div className="flex-1" />
              {onDetails ? (
                <Button size="sm" className="h-8" onClick={onDetails}>Details</Button>
              ) : (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" className="h-8">Details</Button>
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Verdict panel — right on desktop, below on mobile */}
      <div className="border-t sm:border-t-0 sm:border-l border-[#e4e4e7] px-5 py-[18px] sm:w-[196px] shrink-0">
        <VerdictBlock score={score} chips={chips} />
      </div>
    </div>
  )
}
