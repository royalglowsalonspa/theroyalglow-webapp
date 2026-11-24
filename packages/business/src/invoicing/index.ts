/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/index
 * Scope        : Business Logic — Invoicing
 *
 * Description  : Barrel export for invoicing domain logic.
 *
 * Responsibilities :
 * - Re-export the tax arithmetic and invoice number format
 *
 * Features / Functionality :
 * - computeInvoiceTax, splitInclusive, resolveTaxVersions, assertInvoiceIssuable
 * - financialYearIST, formatInvoiceNumber, invoiceFileStem
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : ./tax, ./invoice-number
 *
 * Notes        : Rates come from the branch's tax versions (multi-branch R6.4);
 *                there is no built-in rate.
 ************************************************************/

export * from './amount-in-words'
export * from './email'
export * from './invoice-number'
export * from './tax'
