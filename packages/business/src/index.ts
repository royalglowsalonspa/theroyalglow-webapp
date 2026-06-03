/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : business/index
 * Scope        : Business Logic
 *
 * Description  : Barrel export for the business logic package.
 *                All pure functions with no I/O or framework deps.
 *
 * Responsibilities :
 * - Re-export all domain business logic modules
 * - Provide single import path for consumers
 *
 * Features / Functionality :
 * - Currency/date formatting, booking, invoicing, jobs,
 *   lead, loyalty, membership, notifications, offers, scheduling
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : All domain modules within this package
 *
 * Notes        : This package MUST NOT import from db or framework
 ************************************************************/
export { formatINR } from './utils/currency'
export { formatDateIN } from './utils/date'
export * from './booking/index'
export * from './invoicing/index'
export * from './jobs/index'
export * from './lead/index'
export * from './loyalty/index'
export * from './membership/index'
export * from './notifications/index'
export * from './offers/index'
export * from './scheduling/index'
