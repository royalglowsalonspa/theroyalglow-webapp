/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : types/index
 * Scope        : Shared Types & Validation
 *
 * Description  : Barrel export for all Zod schemas and TypeScript
 *                types shared across the monorepo.
 *
 * Responsibilities :
 * - Re-export all domain-specific validation schemas
 * - Provide single import path for consumers
 *
 * Features / Functionality :
 * - API response schemas, booking, membership, customer, lead,
 *   schedule, notification, offer types
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : All domain type modules
 *
 * Notes        : None
 ************************************************************/
export * from './api'
export * from './booking'
export * from './admin-booking'
export * from './membership'
export * from './customer'
export * from './lead'
export * from './schedule'
export * from './notification'
export * from './offer'
