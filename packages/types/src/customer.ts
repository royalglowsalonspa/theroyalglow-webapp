/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : customer (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for CRM customer operations — listing,
 *                tagging, and note-taking.
 *
 * Responsibilities :
 * - Validate customer list queries (search, sort, pagination)
 * - Validate tag creation and assignment
 * - Validate customer note creation
 *
 * Features / Functionality :
 * - customerListQuerySchema — sortable by LTV, visits, gems, no-shows
 * - assignTagSchema / createTagSchema — CRM tagging
 * - addCustomerNoteSchema — notes with shared or branch-private visibility
 * - updateCustomerGatesSchema — manager no-show overrides
 * - CustomerHistoryEntry / CustomerNoteView — what one branch sees (R3)
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Tag slug is derived server-side from the name
 ************************************************************/
import { z } from 'zod'
import type { BookingStatusFilter } from './booking'
import { renderedBranchIdSchema } from './branch'

// Sort keys for the admin customer directory. Mapped to columns in the query layer.
// `ltv` ranks by what the ACTIVE branch was paid (multi-branch R3.2).
export const CUSTOMER_SORT = ['ltv', 'visits', 'last_visit', 'name', 'gems', 'noshows'] as const
export type CustomerSort = (typeof CUSTOMER_SORT)[number]

// Directory listing: free-text search, sort key, pagination, optional tag slug filter.
export const customerListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  sort: z.enum(CUSTOMER_SORT).default('ltv'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  tag: z.string().optional(),
})
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>

// Assign an existing tag to a customer.
export const assignTagSchema = z.object({
  tagId: z.string().min(1),
})
export type AssignTagInput = z.infer<typeof assignTagSchema>

// Create a new customer tag. The slug is derived from the name in the query layer.
export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
})
export type CreateTagInput = z.infer<typeof createTagSchema>

// Who may read a customer note (multi-branch R3.1): every Royal Glow branch, or
// only the branch whose staff wrote it. Mirrors noteVisibilityEnum in @rgss/db.
export const NOTE_VISIBILITIES = ['shared', 'branch'] as const
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number]

// Add a free-text note to a customer, optionally linked to one of the active
// branch's bookings. The writer always chooses who may read it; there is no
// default, so nothing is published by accident (R3.1).
export const addCustomerNoteSchema = z.object({
  branchId: renderedBranchIdSchema,
  content: z.string().trim().min(1).max(1000),
  visibility: z.enum(NOTE_VISIBILITIES),
  bookingId: z.string().min(1).optional(),
})
export type AddCustomerNoteInput = z.infer<typeof addCustomerNoteSchema>

// Manager overrides on a customer's booking gates. The no-show policy follows
// the customer to every branch, so these apply everywhere; the audit entry
// records the branch that made the change. Both fields optional; an empty
// change is a no-op.
export const updateCustomerGatesSchema = z.object({
  branchId: renderedBranchIdSchema,
  noshowCount: z.number().int().min(0).optional(),
  bookingRequiresApproval: z.boolean().optional(),
})
export type UpdateCustomerGatesInput = z.infer<typeof updateCustomerGatesSchema>

// ── What one branch sees of a shared customer (multi-branch R3.2) ───────────
// Identity, consents, tags, gems and memberships are shared by every Royal Glow
// branch. Money is not: a branch sees only what it was paid, and other
// branches' visits only as their date, branch and services.

/** One line of a customer's history as the active branch sees it. */
export type CustomerHistoryEntry =
  | {
      /** A booking at the active branch, in any status, with its amount. */
      scope: 'this_branch'
      bookingId: string
      bookingNumber: string
      /** YYYY-MM-DD */
      bookingDate: string
      /** HH:MM:SS */
      startTime: string
      serviceType: 'salon' | 'spa'
      status: BookingStatusFilter
      isMembershipSession: boolean
      totalAmountPaise: number
      services: string[]
    }
  | {
      /** A completed visit at another branch: date, branch and services only. */
      scope: 'other_branch'
      branchName: string
      /** YYYY-MM-DD */
      bookingDate: string
      /** HH:MM:SS */
      startTime: string
      serviceType: 'salon' | 'spa'
      services: string[]
    }

/** A customer note the active branch may read. */
export type CustomerNoteView = {
  id: string
  content: string
  authorName: string
  /** The branch whose staff wrote it; null only for a note older than branches. */
  branchName: string | null
  visibility: NoteVisibility
  /** ISO timestamp */
  createdAt: string
}

// Customer-facing notification preference toggles, mapped to boolean columns on
// customer_profile. Every flag is optional so the client can PATCH a partial
// update (only the toggles that changed). `marketingConsent` additionally drives
// the marketing_consent_at timestamp in the query layer.
export const updateNotificationPreferencesSchema = z
  .object({
    appointmentRemindersEnabled: z.boolean().optional(),
    membershipAlertsEnabled: z.boolean().optional(),
    marketingConsent: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one preference must be supplied.',
  })
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>

// What a customer agreed to on /onboarding, stored as the `new_values` of an
// audit_log row (entity_type 'customer_profile', actor = the customer) written
// atomically with the profile. It is the immutable consent receipt the DPDP Act
// asks a business to be able to produce; the row's created_at is the consent
// time. The Privacy Policy is required to finish onboarding, so it is always
// true. marketing_consent on customer_profile stays the live marketing switch,
// and the browser's cookie-consent setting stays the live analytics switch.
export type OnboardingConsentReceipt = {
  event: 'onboarding_consent'
  privacyPolicy: true
  analytics: boolean
  marketing: boolean
}
