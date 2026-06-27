/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : format
 * Scope        : Admin — Design System (presentation formatters)
 *
 * Description  : India-first presentation formatters for the admin portal
 *                redesign. Converts stored UTC values to India Standard Time
 *                (UTC+05:30, no DST) for date-time and time-of-day display, and
 *                centralises the fixed placeholder shown for missing/invalid
 *                values. Re-exports the existing currency/date helpers so call
 *                sites import all formatting from one module.
 *
 * Responsibilities :
 * - Provide formatDateTimeIST() — UTC → IST, DD/MM/YYYY + 24h HH:MM
 * - Provide formatTime24hIST() — UTC → IST, 24-hour zero-padded HH:MM
 * - Expose the PLACEHOLDER ('—') constant for null/invalid input
 * - Re-export formatINRWithPaise / formatDateDDMMYYYY (unchanged)
 *
 * Features / Functionality :
 * - Pure presentation formatters (no business/domain logic, no I/O)
 * - Constant +05:30 offset via Intl timeZone 'Asia/Kolkata' (no DST in India)
 * - Every formatter returns PLACEHOLDER for null/undefined/NaN/invalid input
 *   and never a partial, raw, or unformatted value
 *
 * Tech Stack   : TypeScript, Intl.DateTimeFormat
 * Layer        : Presentation (Admin Design System)
 *
 * Dependencies : ./bookings (formatINRWithPaise, formatDateDDMMYYYY)
 *
 * Notes        : Requirements 15.3, 15.4, 15.5
 ************************************************************/

// Re-export the existing currency/date helpers unchanged (Req 15.1, 15.2).
// Call sites can import every formatter from this single module.
export { formatINR, formatINRWithPaise, formatDateDDMMYYYY } from './bookings'

// Fixed placeholder rendered for null/undefined/invalid formatter input
// (Req 15.4). Never render a partial, raw, or unformatted value.
export const PLACEHOLDER = '—'

// India Standard Time. India observes no daylight saving, so the IANA zone
// applies a constant +05:30 offset year-round (Req 15.3).
const IST_TIME_ZONE = 'Asia/Kolkata'

// Accepted input shapes for the date/time formatters. A stored UTC value may
// arrive as an ISO string, an epoch-millis number, or a Date instance.
type DateInput = string | number | Date | null | undefined

// Parse an arbitrary input into a valid Date, or return null when the value is
// null/undefined/NaN/otherwise invalid. Centralises the Req 15.4 guard so every
// formatter rejects bad input identically.
function toValidDate(value: DateInput): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  // Guard against NaN and empty/whitespace strings which would otherwise
  // produce an Invalid Date.
  if (typeof value === 'number' && Number.isNaN(value)) {
    return null
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

// Pull a named part out of an Intl.DateTimeFormat parts array.
function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? ''
}

// "2026-05-24T10:00:00.000Z" → "24/05/2026, 15:30" (IST).
// Converts the stored UTC value to IST (constant +05:30, no DST), then presents
// DD/MM/YYYY with a 24-hour HH:MM time. Returns PLACEHOLDER for invalid input.
export function formatDateTimeIST(value: DateInput): string {
  const date = toValidDate(value)
  if (date === null) {
    return PLACEHOLDER
  }
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const day = part(parts, 'day')
  const month = part(parts, 'month')
  const year = part(parts, 'year')
  // Intl emits "24" for midnight under hour12:false on some engines; normalise.
  const hour = part(parts, 'hour') === '24' ? '00' : part(parts, 'hour')
  const minute = part(parts, 'minute')

  return `${day}/${month}/${year}, ${hour}:${minute}`
}

// "2026-05-24T10:00:00.000Z" → "15:30" (IST).
// 24-hour, zero-padded HH:MM in India Standard Time (Req 15.5). Returns
// PLACEHOLDER for null/undefined/NaN/invalid input.
export function formatTime24hIST(value: DateInput): string {
  const date = toValidDate(value)
  if (date === null) {
    return PLACEHOLDER
  }
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const hour = part(parts, 'hour') === '24' ? '00' : part(parts, 'hour')
  const minute = part(parts, 'minute')

  return `${hour}:${minute}`
}
