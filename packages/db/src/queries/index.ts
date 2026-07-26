/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : index
 * Scope        : Data Access — Queries
 *
 * Description  : Barrel export file that re-exports all query modules from
 *                a single entry point for consumer convenience.
 *
 * Responsibilities :
 * - Re-export all domain query modules
 * - Provide single import path for data access queries
 *
 * Features / Functionality :
 * - Centralized query exports for API routes and business logic
 * - Covers all domains: services, bookings, customers, leads, etc.
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : All query sub-modules
 *
 * Notes        : None
 ************************************************************/

export * from './admin-bookings'
export * from './audit'
export * from './audit'
export * from './bookings'
export * from './branches'
// `getBranchById` is also star-exported by ./bookings (identical behaviour).
// Explicitly re-export the branches version to resolve the barrel ambiguity.
export { getBranchById } from './branches'
export * from './customers'
export * from './invoices'
export * from './jobs'
export * from './leads'
export * from './loyalty'
export * from './memberships'
export * from './notifications'
export * from './offers'
export * from './redemptions'
export * from './reports'
export * from './schedule'
export * from './services'
export * from './settings'
export * from './staff'
export * from './users'
export * from './waitlist'
