import { z } from 'zod'

// Indian 10-digit mobile, optionally +91 / 0 prefixed. Normalised in the
// business layer to canonical +91XXXXXXXXXX before storage.
const indianPhone = z
  .string()
  .trim()
  .regex(
    /^(?:\+?91|0)?[6-9]\d{9}$/,
    'Enter a valid 10-digit Indian mobile number',
  )

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

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'follow_up',
  'booked',
  'won',
  'lost',
] as const
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
