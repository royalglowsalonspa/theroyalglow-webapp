/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : currency
 * Scope        : Business Logic — Utilities
 *
 * Description  : Indian Rupee formatting utility using Intl API
 *                with proper Indian numbering (lakhs/crores).
 *
 * Responsibilities :
 * - Convert paise (integer) to formatted INR string
 *
 * Features / Functionality :
 * - formatINR(paise) → "₹1,000.00" (en-IN locale, 2 decimals)
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None (uses built-in Intl.NumberFormat)
 *
 * Notes        :
 * - Input is ALWAYS integer paise (₹1 = 100 paise)
 * - Uses Indian grouping: ₹1,00,000.00
 ************************************************************/
export function formatINR(paise: number): string {
  const rupees = paise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees)
}
