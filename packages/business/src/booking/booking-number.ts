/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : booking-number
 * Scope        : Business Logic — Booking
 *
 * Description  : Generates unique booking numbers in the format
 *                BK-{branch_code}-{YYMM}-{H|S}-{5_random}.
 *
 * Responsibilities :
 * - Generate human-readable, unique booking identifiers
 *
 * Features / Functionality :
 * - generateBookingNumber(branchCode, serviceType, date) → "BK-RS-2605-H-38291"
 * - H = salon (hair/beauty), S = spa
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : nanoid
 *
 * Notes        : None
 ************************************************************/
import { customAlphabet } from 'nanoid'

const digits = customAlphabet('0123456789', 5)

export function generateBookingNumber(
  branchCode: string,
  serviceType: 'salon' | 'spa',
  date: Date,
): string {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const typeInitial = serviceType === 'salon' ? 'H' : 'S'
  return `BK-${branchCode}-${yy}${mm}-${typeInitial}-${digits()}`
}
