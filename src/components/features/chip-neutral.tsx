type Chip = { tone: 'pos' | 'warn' | 'neg'; label: string }

export type { Chip }

const SYMBOL: Record<Chip['tone'], string> = {
  pos: '✓',
  warn: '△',
  neg: '✗',
}

interface ChipNeutralProps {
  chip: Chip
}

export function ChipNeutral({ chip }: ChipNeutralProps) {
  return (
    <span className="flex items-center">
      <span
        className="inline-block text-center text-muted-foreground"
        style={{ width: 12, fontSize: 12 }}
      >
        {SYMBOL[chip.tone]}
      </span>
      <span className="text-[13px] font-medium text-foreground ml-1">{chip.label}</span>
    </span>
  )
}
