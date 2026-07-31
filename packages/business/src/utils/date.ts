/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : date
 * Scope        : Business Logic — Utilities
 *
 * Description  : Indian date formatting utility (DD/MM/YYYY)
 *                using Intl.DateTimeFormat with en-IN locale, pinned to the
 *                IST display zone.
 *
 * Responsibilities :
 * - Format Date objects to Indian date string
 * - Render the IST calendar day regardless of the host runtime's zone
 *
 * Features / Functionality :
 * - formatDateIN(date) → "04/06/2026"
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None (uses built-in Intl.DateTimeFormat)
 *
 * Notes        :
 * - All dates stored as UTC, displayed in IST
 * - The `timeZone` option is mandatory: without it Intl resolves the HOST zone,
 *   so on a UTC runtime (CI runners, containers) a stored instant between 18:30
 *   and 24:00 UTC rendered the PREVIOUS IST day — an off-by-one-day bug on
 *   invoices, bookings and reports
 ************************************************************/

/** IST (UTC+5:30, no DST) — the display zone for every user-facing date. */
export const IST_TIME_ZONE = 'Asia/Kolkata'

export function formatDateIN(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: IST_TIME_ZONE,
  }).format(date)
}
