/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : booking/index
 * Scope        : Business Logic — Booking
 *
 * Description  : Barrel export for booking domain business logic.
 *
 * Responsibilities :
 * - Re-export booking number generation and pricing utilities
 *
 * Features / Functionality :
 * - generateBookingNumber, calculateBookingTotal, addMinutesToTime
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : ./booking-number, ./pricing
 *
 * Notes        : None
 ************************************************************/
export * from './booking-number'
export * from './pricing'
