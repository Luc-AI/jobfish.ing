import { ChipNeutral } from './chip-neutral'
import type { Chip } from './chip-neutral'

interface VerdictBlockProps {
  score: number
  chips: Chip[]
}

function scoreTone(score: number): string {
  if (score >= 8) return 'text-green-600'
  if (score >= 6) return 'text-yellow-600'
  return 'text-red-600'
}

export function VerdictBlock({ score, chips }: VerdictBlockProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-baseline gap-1">
        <span
          className={`font-bold tabular-nums ${scoreTone(score)}`}
          style={{ fontSize: 34, letterSpacing: '-1.2px' }}
        >
          {score}
        </span>
        <span className="text-muted-foreground text-[13px]">/ 10</span>
      </div>
      <div className="flex flex-col" style={{ gap: 5 }}>
        {chips.map((chip, i) => (
          <ChipNeutral key={i} chip={chip} />
        ))}
      </div>
    </div>
  )
}
