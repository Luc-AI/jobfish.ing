'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { ScoreFilter, TimeFilter } from '@/lib/feed/filters'

interface FeedFilterBarProps {
  activeScore: ScoreFilter
  activeTime: TimeFilter
  userThreshold: number
}

const SCORE_CHIPS: Array<{ value: ScoreFilter; label: string; emoji?: string }> = [
  { value: 'hot', label: 'Hot', emoji: '🔥' },
  { value: 'threshold', label: 'Threshold', emoji: '⭐' },
  { value: 'eight', label: '8+' },
  { value: 'seven', label: '7+' },
  { value: 'all', label: 'All scores' },
]

const TIME_CHIPS: Array<{ value: TimeFilter; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: 'all', label: 'All time' },
]

export function FeedFilterBar({ activeScore, activeTime, userThreshold }: FeedFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') ?? 'all'

  function navigate(score: ScoreFilter, time: TimeFilter) {
    const params = new URLSearchParams()
    params.set('tab', tab)
    params.set('score', score)
    params.set('time', time)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 mb-4">
      <div className="flex flex-wrap gap-2">
        {SCORE_CHIPS.map(chip => {
          const active = chip.value === activeScore
          const sublabel = chip.value === 'threshold' ? ` (${userThreshold}+)` : ''
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active}
              onClick={() => navigate(chip.value, activeTime)}
              className={cn(
                'inline-flex items-center gap-1 text-sm rounded-full px-3 py-1.5 transition-colors min-h-[36px]',
                active
                  ? 'bg-foreground text-background'
                  : 'bg-transparent text-foreground border border-border hover:bg-muted'
              )}
            >
              {chip.emoji && <span>{chip.emoji}</span>}
              <span>{chip.label}{sublabel}</span>
            </button>
          )
        })}
      </div>
      <div
        className="inline-flex rounded-full border border-border p-0.5"
        role="group"
        aria-label="Time window"
      >
        {TIME_CHIPS.map(chip => {
          const active = chip.value === activeTime
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active}
              onClick={() => navigate(activeScore, chip.value)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px]',
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
