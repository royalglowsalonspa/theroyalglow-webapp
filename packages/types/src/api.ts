import { z } from 'zod'

// Pagination metadata
const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
})

// Success response — generic over data type
export function apiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: paginationMetaSchema.optional(),
  })
}

// Error response — fixed shape
export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    statusCode: z.number().int().min(400).max(599),
    requestId: z.string(),
    details: z.unknown().optional(),
    retryable: z.boolean().optional(),
  }),
})

// TypeScript types inferred from schemas
export type ApiSuccessResponse<T> = {
  success: true
  data: T
  meta?: z.infer<typeof paginationMetaSchema>
}

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>
