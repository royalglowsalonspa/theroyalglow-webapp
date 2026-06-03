/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : index
 * Scope        : Database Relations
 *
 * Description  : Barrel export file that re-exports all Drizzle ORM relation
 *                definitions from a single entry point.
 *
 * Responsibilities :
 * - Re-export all relation definition modules
 * - Provide single import path for schema relations
 *
 * Features / Functionality :
 * - Centralized relation exports for Drizzle query builder
 * - Enables relational queries with nested includes
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : All relation sub-modules
 *
 * Notes        : None
 ************************************************************/

export * from './auth.relations'
export * from './profile.relations'
export * from './branch.relations'
export * from './service.relations'
export * from './schedule.relations'
export * from './booking.relations'
export * from './invoice.relations'
export * from './membership.relations'
export * from './offer.relations'
export * from './lead.relations'
export * from './crm.relations'
export * from './loyalty.relations'
export * from './notification.relations'
export * from './system.relations'
