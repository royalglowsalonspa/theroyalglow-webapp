/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : index
 * Scope        : Database Schema
 *
 * Description  : Barrel export file that re-exports all schema tables, enums,
 *                and relations from a single entry point.
 *
 * Responsibilities :
 * - Re-export all schema domain modules
 * - Re-export all relation definitions
 * - Provide single import path for consumers (@rgss/db/schema)
 *
 * Features / Functionality :
 * - Centralized schema exports for Drizzle client initialization
 * - Ordered exports respecting logical domain grouping
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : All schema sub-modules and relations
 *
 * Notes        : Import order matters for readability but not functionality.
 ************************************************************/

export * from './auth'
export * from './booking'
export * from './branch'
export * from './crm'
export * from './enums'
export * from './invoice'
export * from './lead'
export * from './loyalty'
export * from './membership'
export * from './notification'
export * from './offer'
export * from './profile'
export * from './relations'
export * from './schedule'
export * from './service'
export * from './system'
