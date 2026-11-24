/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branch/contact
 * Scope        : Business Logic — a branch's public details (multi-branch
 *                R7.2, customer-flows.md)
 *
 * Description  : How a branch's address, phone, hours and closures read on
 *                the website and in booking emails, from the stored values.
 *
 * Responsibilities :
 * - branchAddressLines(branch) → the postal address, line by line
 * - telHref(phone) → a `tel:` link, or null for something that isn't a number
 * - formatTime12h('21:00') → '9:00 PM'
 * - weeklyHoursRows(hours) → the week grouped into rows of equal hours
 * - formatCalendarDateIN('2026-12-25') → '25/12/2026'
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic (pure)
 *
 * Dependencies : @rgss/types
 *
 * Notes        : Times are IST wall-clock "HH:MM" strings, as settings store
 *                them; no clock or timezone is read here.
 ************************************************************/

import { type BusinessHours, DAY_KEYS, type DayHours, type DayKey } from '@rgss/types'

/** The stored address fields of a branch. */
export type BranchAddressFields = {
  addressLine1: string
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
}

/** One row of a week's hours: "Mon – Fri", "10:00 AM – 9:00 PM". */
export type HoursRow = { days: string; hours: string }

const DAY_SHORT: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/**
 * The address as printed: the two street lines when present, then
 * "City, State Pincode" (whatever of it is known).
 */
export function branchAddressLines(branch: BranchAddressFields): string[] {
  const place = [clean(branch.city), clean(branch.state)].filter(Boolean).join(', ')
  const locality = [place, clean(branch.pincode)].filter(Boolean).join(' ')
  return [clean(branch.addressLine1), clean(branch.addressLine2), locality].filter(Boolean)
}

/**
 * A `tel:` link for a stored phone number: ten digits get +91, a number with
 * its country code keeps it. Null when it isn't a plausible number (placeholder
 * zeros included).
 */
export function telHref(phone: string | null | undefined): string | null {
  const raw = clean(phone)
  const digits = raw.replace(/\D/g, '')
  if (/^0+$/.test(digits)) {
    return null
  }
  if (digits.length === 10) {
    return `tel:+91${digits}`
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `tel:+${digits}`
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `tel:+91${digits.slice(1)}`
  }
  return null
}

/** '21:00' → '9:00 PM', '00:30' → '12:30 AM'. Anything else is returned as given. */
export function formatTime12h(time: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(time)
  if (!match) {
    return time
  }
  const hour = Number(match[1])
  const minutes = match[2]
  if (hour > 23) {
    return time
  }
  const suffix = hour < 12 ? 'AM' : 'PM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${minutes} ${suffix}`
}

function hoursText(day: DayHours): string {
  if (day.closed || day.open === null || day.close === null) {
    return 'Closed'
  }
  return `${formatTime12h(day.open)} – ${formatTime12h(day.close)}`
}

function daysLabel(first: DayKey, last: DayKey): string {
  return first === last ? DAY_SHORT[first] : `${DAY_SHORT[first]} – ${DAY_SHORT[last]}`
}

/**
 * The week, Monday first, with consecutive days of equal hours in one row:
 * Mon – Fri 10:00 AM – 9:00 PM, Sat – Sun 10:00 AM – 10:00 PM.
 */
export function weeklyHoursRows(hours: BusinessHours): HoursRow[] {
  const rows: { first: DayKey; last: DayKey; hours: string }[] = []
  for (const day of DAY_KEYS) {
    const text = hoursText(hours[day])
    const previous = rows.at(-1)
    if (previous && previous.hours === text) {
      previous.last = day
    } else {
      rows.push({ first: day, last: day, hours: text })
    }
  }
  return rows.map((row) => ({ days: daysLabel(row.first, row.last), hours: row.hours }))
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (Indian format); anything else as given. */
export function formatCalendarDateIN(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate
}
