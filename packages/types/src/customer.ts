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
 * - addCustomerNoteSchema — free-text notes linked to bookings
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Tag slug is derived server-side from the name
 ************************************************************/
import { z } from 'zod'

// Sort keys for the admin customer directory. Mapped to columns in the query layer.
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

// Add a free-text note to a customer, optionally linked to a booking.
export const addCustomerNoteSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  bookingId: z.string().optional(),
})
export type AddCustomerNoteInput = z.infer<typeof addCustomerNoteSchema>

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
