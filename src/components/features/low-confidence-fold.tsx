'use client'

import { useState, useEffect, type ReactNode } from 'react'

interface LowConfidenceFoldProps {
  count: number
  threshold: number
  filtersActive?: boolean
  children: ReactNode
}

export function LowConfidenceFold({
  count,
  threshold,
  filtersActive = false,
  children,
}: LowConfidenceFoldProps) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (filtersActive) setExpanded(true)
  }, [filtersActive])

  if (count === 0) return null

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded((e: boolean) => !e)}
        className="w-full text-left text-sm text-muted-foreground border border-dashed hover:bg-muted/50 transition-colors"
        style={{ borderRadius: 8, padding: '10px 14px' }}
      >
        ⌄ Show {count} lower-confidence {count === 1 ? 'match' : 'matches'} (below your {threshold.toFixed(1)} threshold)
      </button>
      {expanded && (
        <div className="mt-3" style={{ opacity: 0.85 }}>
          {children}
        </div>
      )}
    </div>
  )
}
