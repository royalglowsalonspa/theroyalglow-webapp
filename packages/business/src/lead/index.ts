/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : lead/index
 * Scope        : Business Logic — Lead Pipeline
 *
 * Description  : Barrel export for lead domain business logic.
 *
 * Responsibilities :
 * - Re-export phone normalisation, status machine, stale detection
 *
 * Features / Functionality :
 * - normaliseIndianPhone, assertLeadTransition, isLeadStale
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : ./phone, ./status, ./stale
 *
 * Notes        : None
 ************************************************************/
export * from './phone'
export * from './stale'
export * from './status'
