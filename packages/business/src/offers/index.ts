/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : offers/index
 * Scope        : Business Logic — Offers
 *
 * Description  : Barrel export for offers domain business logic.
 *
 * Responsibilities :
 * - Re-export discount calculation and applicability guards
 *
 * Features / Functionality :
 * - computeOfferDiscount, assertOfferActive, assertOfferSalonOnly
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : ./discount, ./applicability
 *
 * Notes        : None
 ************************************************************/
export * from './discount'
export * from './applicability'
