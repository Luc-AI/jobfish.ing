import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Tab {
  value: string
  label: string
  count?: number
}

interface LogTabProps {
  tabs: Tab[]
  activeTab: string
}

export function LogTab({ tabs, activeTab }: LogTabProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {tabs.map(tab => {
        const isActive = tab.value === activeTab
        return (
          <Link
            key={tab.value}
            href={`?tab=${tab.value}`}
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
              'rounded-full px-[14px] py-[7px]',
              isActive
                ? 'bg-foreground text-background'
                : 'bg-transparent text-foreground border border-border hover:bg-muted'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'tabular-nums',
                  isActive ? 'text-background/70' : 'text-muted-foreground'
                )}
                style={{ fontSize: '11.5px' }}
              >
                {tab.count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
