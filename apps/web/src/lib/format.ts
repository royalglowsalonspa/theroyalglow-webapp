/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : format
 * Scope        : Shared — Display Formatting
 *
 * Description  : Pure, framework-free display formatting helpers shared by the
 *                customer site and the staff (self-service) pages. Extracted
 *                from the now-removed admin module so the customer app keeps
 *                only the helpers it actually uses.
 *
 * Responsibilities :
 * - Format ISO/date strings to DD/MM/YYYY (Indian convention)
 * - Format 24h time strings to a 12-hour clock with AM/PM
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation (pure helpers)
 *
 * Dependencies : None
 *
 * Notes        : Admin-specific types/helpers moved with the admin app to
 *                apps/admin during the admin-subdomain migration.
 ************************************************************/

// "2026-05-24T00:00:00.000Z" or "2026-05-24" → "24/05/2026"
export function formatDateDDMMYYYY(value: string): string {
  const datePart = value.slice(0, 10)
  const [y, m, d] = datePart.split('-')
  if (y && m && d) {
    return `${d}/${m}/${y}`
  }
  return value
}

// "15:30" or "15:30:00" → "03:30 PM"
export function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const m = mStr ?? '00'
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${String(h12).padStart(2, '0')}:${m} ${period}`
}
