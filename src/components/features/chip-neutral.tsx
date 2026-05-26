type Chip = { tone: 'pos' | 'warn' | 'neg'; label: string }

export type { Chip }

const SYMBOL: Record<Chip['tone'], string> = {
  pos: '✓',
  warn: '~',
  neg: '✗',
}

interface ChipNeutralProps {
  chip: Chip
}

export function ChipNeutral({ chip }: ChipNeutralProps) {
  return (
    <span className="flex items-center min-w-0">
      <span
        className="shrink-0 inline-block text-center text-muted-foreground"
        style={{ width: 12, fontSize: 12 }}
      >
        {SYMBOL[chip.tone]}
      </span>
      <span className="text-[13px] font-medium text-foreground ml-1 truncate">{chip.label}</span>
    </span>
  )
}
