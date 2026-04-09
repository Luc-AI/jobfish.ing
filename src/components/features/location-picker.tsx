'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface LocationPickerProps {
  value: string[]
  onChange: (locations: string[]) => void
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geoapify/autocomplete?text=${encodeURIComponent(query)}`)
        const data = await res.json()
        setSuggestions(data.suggestions ?? [])
        setOpen((data.suggestions ?? []).length > 0)
      } catch {
        setSuggestions([])
        setOpen(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  function addLocation(loc: string) {
    if (value.includes(loc)) return
    onChange([...value, loc])
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  function removeLocation(loc: string) {
    onChange(value.filter(l => l !== loc))
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type a city..."
        />
        {open && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
            {suggestions.map(s => (
              <li
                key={s}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
                onMouseDown={() => addLocation(s)}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(loc => (
            <Badge key={loc} variant="secondary" className="gap-1">
              {loc}
              <button
                type="button"
                onClick={() => removeLocation(loc)}
                aria-label={`Remove ${loc}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
