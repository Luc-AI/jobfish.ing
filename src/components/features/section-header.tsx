interface SectionHeaderProps {
  title: string
  count: number
  dotColor: string
  marginTop?: number
}

export function SectionHeader({ title, count, dotColor, marginTop }: SectionHeaderProps) {
  return (
    <div
      className="flex justify-between items-baseline pb-2.5 border-b border-border"
      style={{ marginTop: marginTop ?? 32 }}
    >
      <div className="flex items-center gap-2">
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotColor,
            display: 'inline-block',
          }}
        />
        <span className="text-[18px] font-bold" style={{ letterSpacing: '-0.3px' }}>
          {title}
        </span>
      </div>
      <span className="text-muted-foreground text-sm">
        {count} {count === 1 ? 'job' : 'jobs'}
      </span>
    </div>
  )
}
