/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : error-handler
 * Scope        : API Infrastructure
 *
 * Description  : Centralised error-handling wrapper for API route handlers.
 *                Catches AppError and unexpected errors, returns standardised
 *                JSON error responses with request IDs.
 *
 * Responsibilities :
 * - Wrap route handlers with try/catch error handling
 * - Format AppError instances into structured JSON responses
 * - Log and report unexpected errors to Sentry
 * - Attach unique request IDs to every error response
 *
 * Features / Functionality :
 * - withErrorHandler() — HOF that wraps any route handler
 * - apiSuccess() — convenience helper for success responses with optional meta
 *
 * Tech Stack   : TypeScript, Sentry, nanoid
 * Layer        : API
 *
 * Dependencies : @rgss/errors, @sentry/nextjs, nanoid
 *
 * Notes        : None
 ************************************************************/

import { AppError } from '@rgss/errors'
import * as Sentry from '@sentry/nextjs'
import { nanoid } from 'nanoid'

type RouteHandler<Ctx = unknown> = (req: Request, ctx: Ctx) => Promise<Response>

export function withErrorHandler<Ctx = unknown>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return async (req, ctx) => {
    const requestId = req.headers.get('x-request-id') ?? `req_${nanoid(12)}`
    try {
      return await handler(req, ctx)
    } catch (error) {
      if (error instanceof AppError) {
        return Response.json(
          {
            success: false,
            error: {
              code: error.code,
              message: error.message,
              statusCode: error.statusCode,
              requestId,
              retryable: error.retryable,
              ...(error.details ? { details: error.details } : {}),
            },
          },
          { status: error.statusCode },
        )
      }
      // Unknown error → 500. Treated as retryable: assumed transient (DB/timeout).
      console.error(`[${requestId}] Unhandled error:`, error)
      // Report unexpected errors to Sentry. No-op when Sentry is uninitialised
      // (no NEXT_PUBLIC_SENTRY_DSN). Expected AppErrors are not reported here.
      Sentry.captureException(error)
      return Response.json(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred. Please try again.',
            statusCode: 500,
            requestId,
            retryable: true,
          },
        },
        { status: 500 },
      )
    }
  }
}

export function apiSuccess<T>(
  data: T,
  meta?: { page?: number; totalPages?: number; totalCount?: number },
  status = 200,
): Response {
  return Response.json({ success: true, data, ...(meta ? { meta } : {}) }, { status })
}
