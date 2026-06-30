'use client'

import { useMemo } from 'react'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatTime12h } from '@/lib/admin/bookings'
import { cn } from '@/lib/utils'

// 15-minute time options across the full day, with 12-hour labels. Values are
// stored as "HH:MM" 24h strings so API contracts are unchanged.
const ALL_TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      out.push({ value, label: formatTime12h(value) })
    }
  }
  return out
})()

// Options within [min, max] inclusive; a non-aligned `current` (e.g. "10:05")
// is merged in so editing never silently drops a stored value.
function timeOptions(min: string, max: string, current: string) {
  const base = ALL_TIME_OPTIONS.filter((o) => o.value >= min && o.value <= max)
  if (current && !base.some((o) => o.value === current)) {
    return [...base, { value: current, label: formatTime12h(current) }].sort((a, b) =>
      a.value.localeCompare(b.value),
    )
  }
  return base
}

/**
 * shadcn `Select`-based time picker (15-min slots, 12-hour labels, stores
 * "HH:MM"). Replaces native `<input type="time">` so the control is fully
 * brand-styled with no native browser popup. Bound to [min, max] when supplied.
 */
export function TimeSelect({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  id,
  min = '00:00',
  max = '23:45',
  className,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
  id?: string
  min?: string
  max?: string
  className?: string
}) {
  const options = useMemo(() => timeOptions(min, max, value), [min, max, value])

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} size="sm" aria-label={ariaLabel} className={cn('w-32', className)}>
        <SelectValue placeholder="--:--" />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-64">
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
