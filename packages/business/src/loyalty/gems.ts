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
 * - calculateGemsEarned(totalPaise) → integer gems count
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None
 *
 * Notes        :
 * - Only for invoice_type = 'service' (not memberships)
 * - ₹100 = 10000 paise threshold
 ************************************************************/

// Gems are earned at 1 gem per ₹100 invoiced (floor). ₹100 = 10000 paise.
// Only applies to invoice_type = 'service' — never membership purchases/sessions
// (the caller enforces that; this is pure arithmetic).
export function calculateGemsEarned(totalPaise: number): number {
  return Math.floor(totalPaise / 10000)
}
