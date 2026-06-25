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
 * - checkReschedulable, isBookableSlotStart (reschedule policy)
 * - generateAvailability (slot grid + past-date rejection)
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : ./booking-number, ./pricing, ./reschedule, ./availability
 *
 * Notes        : None
 ************************************************************/
export * from './availability'
export * from './booking-number'
export * from './pricing'
export * from './reschedule'
