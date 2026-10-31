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
  // Signed in, but no customer_profile row yet: phone, date of birth and gender
  // have not been collected. Distinct from FORBIDDEN because it is RECOVERABLE —
  // the client routes the customer to /onboarding rather than showing a dead end.
  ONBOARDING_REQUIRED: 'ONBOARDING_REQUIRED',
  // Multi-branch: the signed-in person may act on no branch at all (403), or a
  // form rendered for one branch was submitted after the person switched to
  // another (409; reload to continue).
  BRANCH_ACCESS_NONE: 'BRANCH_ACCESS_NONE',
  BRANCH_CONTEXT_CHANGED: 'BRANCH_CONTEXT_CHANGED',
  // Scheduling: a weekday another branch already holds for a shared Manager
  // (409), or a leave request already decided or withdrawn meanwhile (409).
  SCHEDULE_DAY_ELSEWHERE: 'SCHEDULE_DAY_ELSEWHERE',
  LEAVE_ALREADY_DECIDED: 'LEAVE_ALREADY_DECIDED',
  // Booking domain
  BOOKING_SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  BOOKING_ALREADY_CANCELLED: 'BOOKING_ALREADY_CANCELLED',
  BOOKING_MAX_RESCHEDULES: 'BOOKING_MAX_RESCHEDULES',
  BOOKING_CANCEL_WINDOW_PASSED: 'BOOKING_CANCEL_WINDOW_PASSED',
  BOOKING_INVALID_STATUS_TRANSITION: 'BOOKING_INVALID_STATUS_TRANSITION',
  // Branch booking rules (multi-branch R6.3): the customer already has the
  // most upcoming bookings the branch allows (409), or a reschedule comes
  // later than the branch's reschedule cut-off (409).
  BOOKING_LIMIT_REACHED: 'BOOKING_LIMIT_REACHED',
  BOOKING_RESCHEDULE_WINDOW_PASSED: 'BOOKING_RESCHEDULE_WINDOW_PASSED',
  // Membership domain
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',
  MEMBERSHIP_INSUFFICIENT_HOURS: 'MEMBERSHIP_INSUFFICIENT_HOURS',
  MEMBERSHIP_ALREADY_ACTIVE: 'MEMBERSHIP_ALREADY_ACTIVE',
  // A membership sold to start later gives no session before its start date
  // (409; membership-scheduling.md, MS-05).
  MEMBERSHIP_NOT_STARTED: 'MEMBERSHIP_NOT_STARTED',
  // Staff occupancy (membership-scheduling.md, MS-07, MS-08): the person is
  // still with another customer, or has another booking at that time (409).
  // Reception waits or assigns someone else.
  STAFF_BUSY: 'STAFF_BUSY',
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
  // Multi-branch R1.10: people, bookings, unpaid invoices or waitlist entries
  // are still open at the branch (409), or it still has records and can't be
  // deleted (409).
  BRANCH_SHUTDOWN_BLOCKED: 'BRANCH_SHUTDOWN_BLOCKED',
  BRANCH_NOT_EMPTY: 'BRANCH_NOT_EMPTY',
  // Tax (multi-branch R6.4, TX-08): no rate in force for a SAC code at the
  // branch, or live invoicing without the branch's legal name, GSTIN or
  // reviewed rates (409). There is never a fallback rate.
  TAX_CONFIGURATION_INCOMPLETE: 'TAX_CONFIGURATION_INCOMPLETE',
  // Branch settings (multi-branch R6.3): the branch has no valid booking
  // settings (409; never replaced with defaults), or someone saved the
  // settings since the form was opened (409; reload to continue).
  BRANCH_SETTINGS_INCOMPLETE: 'BRANCH_SETTINGS_INCOMPLETE',
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  // Cross-branch settlement (multi-branch R10): the share rate or value per
  // gem can't be read (409; fixed in Settings, never defaulted), or a
  // statement is already marked paid (409).
  SETTLEMENT_SETTINGS_INVALID: 'SETTLEMENT_SETTINGS_INVALID',
  SETTLEMENT_ALREADY_PAID: 'SETTLEMENT_ALREADY_PAID',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
