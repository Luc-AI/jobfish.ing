'use client'

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, X, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { posthog } from '@/lib/posthog'

const DEBOUNCE_MS = 250

interface SearchBarProps {
  /**
   * If true (search is "open"), the input is rendered instead of the Search button.
   * The parent decides this based on `?q=` presence in the URL.
   */
  initiallyOpen: boolean
  /** Current value of `?q=` from the URL, used to seed the input on first render. */
  initialQuery: string
}

export function SearchBar({ initiallyOpen, initialQuery }: SearchBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isOpen, setIsOpen] = useState(initiallyOpen)
  const [value, setValue] = useState(initialQuery)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedRef = useRef<string>(initialQuery)

  // Autofocus when the input first appears.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  // Sync URL → state when navigating back/forward. Skip when the URL change came from us
  // (lastSyncedRef matches) so a fast keystroke doesn't get overwritten mid-flight.
  useEffect(() => {
    const q = params.get('q') ?? ''
    if (q !== lastSyncedRef.current) {
      setValue(q)
      lastSyncedRef.current = q
    }
    setIsOpen((prev) => q.length > 0 || prev)
  }, [params])

  // Clear any pending debounce on unmount.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  function pushQueryToUrl(next: string, mode: 'push' | 'replace') {
    if (next === lastSyncedRef.current) return
    lastSyncedRef.current = next

    const sp = new URLSearchParams(params.toString())
    if (next.length >= 2) {
      sp.set('q', next)
      sp.delete('tab')
      sp.delete('page')
    } else {
      sp.delete('q')
    }

    const url = sp.toString() ? `${pathname}?${sp.toString()}` : pathname
    startTransition(() => {
      if (mode === 'push') router.push(url)
      else router.replace(url)
    })

    // Telemetry — metadata only, never the query string itself.
    if (next.length >= 2) {
      const tokenCount = next.trim().split(/\s+/).filter((t) => t.length >= 2).length
      posthog.capture('search_performed', {
        query_length: next.length,
        token_count: tokenCount,
      })
    }
  }

  function scheduleDebounced(next: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      pushQueryToUrl(next, 'replace')
    }, DEBOUNCE_MS)
  }

  function onOpen() {
    setIsOpen(true)
  }

  function onClose() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setValue('')
    setIsOpen(false)
    if (params.get('q')) {
      const sp = new URLSearchParams(params.toString())
      sp.delete('q')
      const url = sp.toString() ? `${pathname}?${sp.toString()}` : pathname
      router.push(url)
    }
  }

  function onChange(next: string) {
    setValue(next)
    if (next.length === 0) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      pushQueryToUrl('', 'replace')
      return
    }
    if (next.length < 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      return
    }
    // If URL doesn't yet have `q=`, the FIRST change is a push (creates a history entry);
    // subsequent changes are replaces.
    if (!params.get('q')) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        pushQueryToUrl(next, 'push')
      }, DEBOUNCE_MS)
    } else {
      scheduleDebounced(next)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length >= 2) pushQueryToUrl(value, params.get('q') ? 'replace' : 'push')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!isOpen) {
    return (
      <Button variant="outline" size="sm" onClick={onOpen}>
        <Search className="w-4 h-4 mr-1" />
        Search
      </Button>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'flex items-center gap-2',
        'w-full sm:w-[360px]',
      )}
    >
      {/* Mobile back chevron */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="sm:hidden h-11 w-11 p-0 shrink-0"
        aria-label="Close search"
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>

      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search your jobs by title, company, location, or category"
          className={cn(
            'w-full h-11 sm:h-9 rounded-md border border-input bg-background',
            'pl-9 pr-10 text-base sm:text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setValue('')
              if (debounceRef.current) clearTimeout(debounceRef.current)
              pushQueryToUrl('', 'replace')
              inputRef.current?.focus()
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 sm:h-6 sm:w-6 inline-flex items-center justify-center rounded-md hover:bg-accent"
            aria-label="Clear search"
          >
            <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        )}
      </div>

      {/* Desktop close button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="hidden sm:inline-flex"
      >
        Cancel
      </Button>
    </form>
  )
}
