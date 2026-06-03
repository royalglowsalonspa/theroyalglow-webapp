/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : date
 * Scope        : Business Logic — Utilities
 *
 * Description  : Indian date formatting utility (DD/MM/YYYY)
 *                using Intl.DateTimeFormat with en-IN locale.
 *
 * Responsibilities :
 * - Format Date objects to Indian date string
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
 ************************************************************/
export function formatDateIN(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}
