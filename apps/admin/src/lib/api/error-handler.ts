/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : error-handler (admin)
 * Scope        : API Infrastructure
 *
 * Description  : Centralised error-handling wrapper for admin API route
 *                handlers. Catches AppError and unexpected errors, returns
 *                standardised JSON error responses with request IDs. Ported
 *                verbatim from apps/web so both apps share one envelope shape.
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

import { AppError, ERROR_CODES } from '@rgss/errors'
import * as Sentry from '@sentry/nextjs'
import { nanoid } from 'nanoid'
import { RATE_LIMIT_RETRY_AFTER_KEY } from './rate-limit'
// Side-effect import: bootstraps the server/edge Sentry SDK on first server
// use. This replaces the Sentry.init() that the deleted root instrumentation.ts
// used to run via register(). instrumentation.ts is intentionally absent
// because it breaks the OpenNext build — see sentry-server-init.ts for details.
import './sentry-server-init'

// Extract a positive integer Retry-After (seconds) carried in a RATE_LIMITED
// AppError's `details`. Returns null when absent or malformed.
function retryAfterFromDetails(details: unknown): number | null {
  if (typeof details !== 'object' || details === null) {
    return null
  }
  const value = (details as Record<string, unknown>)[RATE_LIMIT_RETRY_AFTER_KEY]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.ceil(value) : null
}

type RouteHandler<Ctx = unknown> = (req: Request, ctx: Ctx) => Promise<Response>

// The wrapped handler accepts an optional context: Next.js always passes the
// route context (e.g. `{ params }`) at runtime, but non-dynamic routes ignore
// it and unit tests may invoke the handler with only a Request. The inner
// handler still receives `ctx` typed as `Ctx`.
type WrappedRouteHandler<Ctx = unknown> = (req: Request, ctx?: Ctx) => Promise<Response>

export function withErrorHandler<Ctx = unknown>(
  handler: RouteHandler<Ctx>,
): WrappedRouteHandler<Ctx> {
  return async (req, ctx) => {
    const requestId = req.headers.get('x-request-id') ?? `req_${nanoid(12)}`
    try {
      // Next.js always supplies the route context at runtime; the cast keeps
      // the inner handler's `Ctx` contract while allowing optional callers.
      return await handler(req, ctx as Ctx)
    } catch (error) {
      if (error instanceof AppError) {
        // On a 429 rate-limit, surface a real `Retry-After` header (seconds)
        // alongside the JSON envelope so clients can back off correctly.
        const headers: Record<string, string> = {}
        if (error.code === ERROR_CODES.RATE_LIMITED) {
          const retryAfter = retryAfterFromDetails(error.details)
          if (retryAfter !== null) {
            headers['Retry-After'] = String(retryAfter)
          }
        }
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
          { status: error.statusCode, headers },
        )
      }
      // Unknown error → 500. Treated as retryable: assumed transient (DB/timeout).
      console.error(`[${requestId}] Unhandled error:`, error)
      // Report unexpected errors to Sentry. This is the server-side capture path
      // that replaces the lost instrumentation.ts onRequestError =
      // Sentry.captureRequestError hook (instrumentation.ts is intentionally
      // absent — it breaks the OpenNext build). Sentry is initialised via the
      // ./sentry-server-init side-effect import above; this is a no-op when
      // Sentry is uninitialised (no DSN / not production). Expected AppErrors
      // (4xx business errors) are deliberately NOT reported here.
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
