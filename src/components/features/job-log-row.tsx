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
  onPass: () => void
  onSave: () => void
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
      className="hover:shadow-[0_2px_4px_rgba(0,0,0,0.06)] hover:border-[#d4d4d8] transition-shadow"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto 1fr auto',
        columnGap: 16,
        padding: '18px 22px',
        background: isUnread ? 'white' : '#fafafa',
        border: '1px solid #e4e4e7',
        borderRadius: 12,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-start pt-[7px]">
        {isUnread ? (
          <span className="w-2 h-2 rounded-full bg-[#2563eb] inline-block" />
        ) : (
          <span className="w-2 h-2 inline-block" />
        )}
      </div>

      <div className="flex items-start">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-[13px] font-semibold text-muted-foreground overflow-hidden">
          {company.slice(0, 2).toUpperCase()}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={cn('text-[16px] tracking-[-0.2px]', isUnread ? 'font-bold' : 'font-semibold')}>
            {title}
          </span>
          <LifecyclePill status={status} appliedAt={appliedAt} />
        </div>
        <span className="text-[13.5px] text-muted-foreground">
          {company}
          {location ? ` · ${location}` : ''}
          {remoteType ? ` · ${remoteType}` : ''}
        </span>
        {notifiedAt && (
          <span className="text-[12.5px] text-muted-foreground/70">
            {formatRelativeTime(notifiedAt)}
          </span>
        )}
        <div className="flex items-center mt-2">
          <Button variant="outline" size="sm" onClick={onPass} className="h-8">
            <X className="w-3.5 h-3.5 mr-1" />
            Pass
          </Button>
          <Button variant="outline" size="sm" onClick={onSave} className="h-8 ml-2">
            <Bookmark className="w-3.5 h-3.5 mr-1" />
            Save
          </Button>
          <div className="flex-1" />
          {onDetails ? (
            <Button size="sm" className="h-8" onClick={onDetails}>Details</Button>
          ) : (
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="h-8">Details</Button>
            </a>
          )}
        </div>
      </div>

      <div className="flex items-start">
        <VerdictBlock score={score} chips={chips} />
      </div>
    </div>
  )
}
