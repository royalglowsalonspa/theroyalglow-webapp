import { AppError } from '@rgss/errors'
import { nanoid } from 'nanoid'

type RouteHandler = (req: Request, ctx: any) => Promise<Response>

export function withErrorHandler(handler: RouteHandler): RouteHandler {
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
          { status: error.statusCode }
        )
      }
      // Unknown error → 500. Treated as retryable: assumed transient (DB/timeout).
      console.error(`[${requestId}] Unhandled error:`, error)
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
        { status: 500 }
      )
    }
  }
}

export function apiSuccess<T>(
  data: T,
  meta?: { page?: number; totalPages?: number; totalCount?: number },
  status = 200
): Response {
  return Response.json({ success: true, data, ...(meta ? { meta } : {}) }, { status })
}
