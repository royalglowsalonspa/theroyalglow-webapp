/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : pricing
 * Scope        : Business Logic — Booking
 *
 * Description  : Booking pricing utilities — total calculation
 *                and time arithmetic for end-time derivation.
 *
 * Responsibilities :
 * - Sum service prices and durations for a booking
 * - Add minutes to a HH:MM time string
 *
 * Features / Functionality :
 * - calculateBookingTotal(services) → { totalAmountPaise, totalDurationMinutes }
 * - addMinutesToTime("10:00", 90) → "11:30"
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None
 *
 * Notes        :
 * - All amounts in integer paise
 * - Time wraps at 24h boundary
 ************************************************************/
export function calculateBookingTotal(
  services: { pricePaise: number; durationMinutes: number }[],
): {
  totalAmountPaise: number
  totalDurationMinutes: number
} {
  return {
    totalAmountPaise: services.reduce((sum, s) => sum + s.pricePaise, 0),
    totalDurationMinutes: services.reduce((sum, s) => sum + s.durationMinutes, 0),
  }
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}
