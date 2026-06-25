/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : booking-number
 * Scope        : Business Logic — Booking
 *
 * Description  : Generates unique booking numbers in the format
 *                BK-{branch_code}-{YYMM}-{H|S}-{5_random}[-M].
 *
 * Responsibilities :
 * - Generate human-readable, unique booking identifiers
 *
 * Features / Functionality :
 * - generateBookingNumber(branchCode, serviceType, date) → "BK-RS-2605-H-38291"
 * - generateBookingNumber(branchCode, serviceType, date, true) → "BK-RS-2605-S-38291-M"
 * - H = salon (hair/beauty), S = spa
 * - "-M" suffix marks a membership session
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : nanoid, @rgss/errors
 *
 * Notes        : Pure function — no I/O. Throws AppError (400) on invalid input.
 ************************************************************/
import { badRequest } from '@rgss/errors'
import { customAlphabet } from 'nanoid'

const random = customAlphabet('0123456789', 5)

export function generateBookingNumber(
  branchCode: string,
  serviceType: 'salon' | 'spa',
  date: Date,
  isMembershipSession = false,
): string {
  if (typeof branchCode !== 'string' || branchCode.trim().length === 0) {
    throw badRequest('Branch code is required to generate a booking number')
  }
  if (serviceType !== 'salon' && serviceType !== 'spa') {
    throw badRequest('Service type must be either "salon" or "spa"')
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw badRequest('A valid creation date is required to generate a booking number')
  }

  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const typeInitial = serviceType === 'salon' ? 'H' : 'S'
  const suffix = isMembershipSession ? '-M' : ''
  return `BK-${branchCode}-${yy}${mm}-${typeInitial}-${random()}${suffix}`
}
