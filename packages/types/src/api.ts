/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : api
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for the standard API response envelope
 *                used by all endpoints (success + error shapes).
 *
 * Responsibilities :
 * - Define paginated success response schema (generic over data)
 * - Define structured error response schema
 * - Export inferred TypeScript types
 *
 * Features / Functionality :
 * - apiSuccessSchema<T> — generic success wrapper with optional pagination meta
 * - apiErrorResponseSchema — code, message, statusCode, requestId, retryable
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        :
 * - All API routes MUST return one of these two shapes
 ************************************************************/
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
