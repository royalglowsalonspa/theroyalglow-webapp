/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : gems
 * Scope        : Business Logic — Loyalty
 *
 * Description  : Gems (loyalty points) earning calculation.
 *                1 gem per ₹100 invoiced, floor rounding.
 *
 * Responsibilities :
 * - Calculate gems earned from an invoice total in paise
 *
 * Features / Functionality :
 * - calculateGemsEarned(totalPaise, isMembershipSession?) → integer gems count
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None
 *
 * Notes        :
 * - Only for invoice_type = 'service' (not memberships)
 * - Membership sessions earn exactly 0 gems
 * - ₹100 = 10000 paise threshold
 ************************************************************/

// Gems are earned at 1 gem per ₹100 invoiced (floor). ₹100 = 10000 paise.
// Only applies to invoice_type = 'service' — membership purchases/sessions
// earn nothing. Pass isMembershipSession=true to enforce the zero-gem rule.
export function calculateGemsEarned(totalPaise: number, isMembershipSession = false): number {
  if (isMembershipSession) {
    return 0
  }
  return Math.floor(totalPaise / 10000)
}
