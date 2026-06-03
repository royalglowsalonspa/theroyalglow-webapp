/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : lead (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for lead capture pipeline — creation,
 *                status transitions, and note-taking.
 *
 * Responsibilities :
 * - Validate lead creation from Meta ad forms
 * - Validate manual lead entry
 * - Validate status transitions and notes
 *
 * Features / Functionality :
 * - createLeadSchema — name, phone, UTM attribution
 * - manualLeadSchema — admin-created leads
 * - updateLeadStatusSchema — pipeline status machine
 * - addLeadNoteSchema — CRM notes
 * - Indian phone validation (+91 / 0 prefix, 10 digits)
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        :
 * - Phone normalised to +91XXXXXXXXXX in business layer
 ************************************************************/
import { z } from 'zod'

const indianPhone = z
  .string()
  .trim()
  .regex(/^(?:\+?91|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: indianPhone,
  email: z.string().email().optional(),
  serviceInterestedId: z.string().min(1).optional(),
  // attribution
  source: z.string().max(40).optional(), // defaults to 'meta_ad' in handler
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  utmContent: z.string().max(120).optional(),
  utmTerm: z.string().max(120).optional(),
})
export type CreateLeadInput = z.infer<typeof createLeadSchema>

export const manualLeadSchema = createLeadSchema.extend({
  source: z.literal('manual').default('manual'),
})
export type ManualLeadInput = z.infer<typeof manualLeadSchema>

export const LEAD_STATUSES = ['new', 'contacted', 'follow_up', 'booked', 'won', 'lost'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const updateLeadStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  // required only when status === 'lost' (validated in the business layer)
  reason: z.string().max(500).optional(),
})
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>

export const addLeadNoteSchema = z.object({
  content: z.string().trim().min(1).max(1000),
})
export type AddLeadNoteInput = z.infer<typeof addLeadNoteSchema>
