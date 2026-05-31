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
