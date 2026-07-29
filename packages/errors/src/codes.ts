/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : codes
 * Scope        : Error Handling
 *
 * Description  : Central registry of all application error codes.
 *                No magic strings — every error code is defined here.
 *
 * Responsibilities :
 * - Define all error codes as a const object
 * - Export ErrorCode union type for type safety
 *
 * Features / Functionality :
 * - Generic HTTP errors (validation, auth, rate limit, timeout)
 * - Booking domain errors (slot, cancel, reschedule)
 * - Membership domain errors (expired, insufficient hours)
 * - Invoice domain errors
 * - Gems (loyalty) domain errors
 * - Offer domain errors
 * - Branch domain errors
 *
 * Tech Stack   : TypeScript
 * Layer        : Shared Package
 *
 * Dependencies : None
 *
 * Notes        : Add new codes here when introducing new domains
 ************************************************************/
export const ERROR_CODES = {
  // Generic
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  // Endpoint permanently retired (HTTP 410) — the capability moved elsewhere.
  ENDPOINT_GONE: 'ENDPOINT_GONE',
  TIMEOUT: 'TIMEOUT',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  CONFLICT: 'CONFLICT',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  // Booking domain
  BOOKING_SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  BOOKING_ALREADY_CANCELLED: 'BOOKING_ALREADY_CANCELLED',
  BOOKING_MAX_RESCHEDULES: 'BOOKING_MAX_RESCHEDULES',
  BOOKING_CANCEL_WINDOW_PASSED: 'BOOKING_CANCEL_WINDOW_PASSED',
  BOOKING_INVALID_STATUS_TRANSITION: 'BOOKING_INVALID_STATUS_TRANSITION',
  // Membership domain
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',
  MEMBERSHIP_INSUFFICIENT_HOURS: 'MEMBERSHIP_INSUFFICIENT_HOURS',
  MEMBERSHIP_ALREADY_ACTIVE: 'MEMBERSHIP_ALREADY_ACTIVE',
  // Invoice domain
  INVOICE_ALREADY_PAID: 'INVOICE_ALREADY_PAID',
  INVOICE_GENERATION_FAILED: 'INVOICE_GENERATION_FAILED',
  // Gems domain
  GEMS_INSUFFICIENT_BALANCE: 'GEMS_INSUFFICIENT_BALANCE',
  GEMS_SERVICE_NOT_REDEEMABLE: 'GEMS_SERVICE_NOT_REDEEMABLE',
  // Offer domain
  OFFER_EXPIRED: 'OFFER_EXPIRED',
  OFFER_MAX_USAGE_REACHED: 'OFFER_MAX_USAGE_REACHED',
  OFFER_NOT_APPLICABLE: 'OFFER_NOT_APPLICABLE',
  // Branch domain
  BRANCH_INACTIVE: 'BRANCH_INACTIVE',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
