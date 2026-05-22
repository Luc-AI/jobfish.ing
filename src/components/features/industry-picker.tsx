'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { INDUSTRY_CATEGORIES } from '@/lib/constants/industries'

interface IndustryPickerProps {
  value: string[]
  onChange: (v: string[]) => void
  label?: string
}

export function IndustryPicker({ value, onChange, label = 'Industries' }: IndustryPickerProps) {
  const [open, setOpen] = useState(false)

  function toggle(industry: string) {
    if (value.includes(industry)) {
      onChange(value.filter((v) => v !== industry))
    } else {
      onChange([...value, industry])
    }
  }

  const triggerLabel = value.length === 0
    ? `Select ${label.toLowerCase()}…`
    : `${value.length} selected`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className="w-full justify-between font-normal"
        >
          <span className={cn(value.length === 0 && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No industries found.</CommandEmpty>
            <CommandGroup>
              {INDUSTRY_CATEGORIES.map((industry) => {
                const selected = value.includes(industry)
                return (
                  <CommandItem
                    key={industry}
                    value={industry}
                    onSelect={() => toggle(industry)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {industry}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
