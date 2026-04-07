import { cn } from '@/lib/utils'

interface ScoreBadgeProps {
  score: number
  className?: string
}

function scoreStyle(score: number) {
  if (score >= 8) return 'bg-green-50 text-green-700 border-green-200'
  if (score >= 6) return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-bold text-sm border rounded-md px-2.5 py-0.5 tabular-nums',
        scoreStyle(score),
        className
      )}
    >
      {score.toFixed(1)}
    </span>
  )
}
