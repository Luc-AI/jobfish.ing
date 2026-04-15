'use client'

import { useState } from 'react'
import { LayoutGrid, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROLE_TAXONOMY } from '@/lib/roles'
import type { RoleSelection } from '@/lib/supabase/types'

interface RolePickerProps {
  value: RoleSelection[]
  onChange: (value: RoleSelection[]) => void
}

/**
 * Normalizes whatever the DB returns into a clean RoleSelection[].
 * Handles three formats gracefully:
 *   - Legacy string[]         e.g. "Product Manager"
 *   - Old object {role, minYoe, maxYoe}
 *   - Current object {role, yoe}
 */
function normalize(raw: unknown[]): RoleSelection[] {
  return raw.flatMap((item) => {
    if (typeof item === 'string') {
      const role = item.trim()
      return role ? [{ role, yoe: 0 }] : []
    }
    if (item && typeof item === 'object') {
      const r = item as Record<string, unknown>
      const role = typeof r.role === 'string' ? r.role.trim() : ''
      if (!role) return []
      const yoe =
        typeof r.yoe === 'number' ? r.yoe
        : typeof r.minYoe === 'number' ? r.minYoe
        : 0
      return [{ role, yoe }]
    }
    return []
  })
}

export function RolePicker({ value, onChange }: RolePickerProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const normalized = normalize(value)
  const selectedRoles = new Set(normalized.map((r) => r.role))
  const activeCategoryData = ROLE_TAXONOMY.find((c) => c.id === activeCategory)

  function emit(next: RoleSelection[]) {
    onChange(next)
  }

  function toggleRole(role: string) {
    if (selectedRoles.has(role)) {
      emit(normalized.filter((r) => r.role !== role))
    } else {
      emit([...normalized, { role, yoe: 0 }])
    }
  }

  function updateYoe(role: string, delta: number) {
    emit(
      normalized.map((r) =>
        r.role !== role ? r : { ...r, yoe: Math.max(0, r.yoe + delta) }
      )
    )
  }

  function getCategoryCount(categoryId: string): number {
    const cat = ROLE_TAXONOMY.find((c) => c.id === categoryId)
    if (!cat) return 0
    return cat.groups.flatMap((g) => g.roles).filter((r) => selectedRoles.has(r)).length
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <LayoutGrid className="h-3.5 w-3.5" />
          ROLES
        </span>
        {normalized.length > 0 && (
          <span className="text-xs font-semibold text-primary">
            {normalized.length} SELECTED
          </span>
        )}
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {ROLE_TAXONOMY.map((cat) => {
          const count = getCategoryCount(cat.id)
          const isActive = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(isActive ? null : cat.id)}
              className={cn(
                'relative rounded border px-2 py-1.5 text-left text-sm transition-colors',
                isActive
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-foreground hover:border-muted-foreground'
              )}
            >
              {cat.label}
              {count > 0 && (
                <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Role chips panel */}
      {activeCategoryData && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {activeCategoryData.label}
          </p>
          {activeCategoryData.groups.map((group, i) => (
            <div key={group.label ?? `_flat_${i}`} className="space-y-1.5">
              {group.label && (
                <p className="text-xs font-semibold tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {group.roles.map((role) => {
                  const isSelected = selectedRoles.has(role)
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={cn(
                        'rounded border px-2 py-1 text-sm transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-foreground hover:border-muted-foreground'
                      )}
                    >
                      {role}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* YoE section */}
      {normalized.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            YEARS OF EXPERIENCE
          </p>
          {normalized.map((r) => (
            <div key={r.role} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate">{r.role}</span>
              <Counter value={r.yoe} onChange={(delta) => updateYoe(r.role, delta)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Counter({
  value,
  onChange,
}: {
  value: number
  onChange: (delta: number) => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(-1)}
        aria-label="decrease"
        className="flex h-6 w-6 items-center justify-center rounded border border-border text-sm hover:border-primary"
      >
        −
      </button>
      <span className="w-6 text-center tabular-nums text-sm">{value}</span>
      <button
        type="button"
        onClick={() => onChange(1)}
        aria-label="increase"
        className="flex h-6 w-6 items-center justify-center rounded border border-border text-sm hover:border-primary"
      >
        +
      </button>
    </div>
  )
}
