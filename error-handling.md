# API Error Handling Strategy

## Design Principles

1. **Never leak internals** — No stack traces, DB column names, or internal IDs in client responses
2. **Structured, predictable responses** — Every error follows the same JSON shape
3. **Machine-readable codes** — Clients can programmatically handle specific errors
4. **Human-readable messages** — Users see meaningful text, not "Something went wrong"
5. **Correlation everywhere** — Every error carries a `requestId` for Sentry cross-referencing
6. **Fail gracefully** — Operational errors return proper HTTP codes; programmer errors trigger alerts

---

## Error Response Format

### Standard Error Shape

Every non-2xx response from any API route or Server Action returns this exact shape:

```ts
// packages/types/api.ts

interface ApiErrorResponse {
  success: false
  error: {
    code: string              // Machine-readable: "BOOKING_SLOT_UNAVAILABLE"
    message: string           // Human-readable: "This time slot is no longer available"
    statusCode: number        // HTTP status: 409
    requestId: string         // Correlation ID: "req_abc123xyz"
    details?: ValidationError[] | Record<string, unknown>  // Optional structured details
    retryable?: boolean       // Hint to client: should you retry?
  }
}

interface ValidationError {
  field: string               // "phone" or "services[0].id"
  message: string             // "Must be a valid Indian phone number"
  code: string                // "invalid_format"
}
```

### Standard Success Shape

```ts
interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta?: {
    page?: number
    totalPages?: number
    totalCount?: number
  }
}
```

### Example Responses

**Validation error (400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "statusCode": 400,
    "requestId": "req_k7x9m2p4q",
    "details": [
      { "field": "phone", "message": "Must be a valid Indian phone number (+91XXXXXXXXXX)", "code": "invalid_format" },
      { "field": "date", "message": "Cannot book in the past", "code": "invalid_date" }
    ]
  }
}
```

**Business logic error (409):**
```json
{
  "success": false,
  "error": {
    "code": "BOOKING_SLOT_UNAVAILABLE",
    "message": "This time slot is no longer available. Please choose another.",
    "statusCode": 409,
    "requestId": "req_m8n3k5p2w",
    "retryable": false
  }
}
```

**Rate limited (429):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later.",
    "statusCode": 429,
    "requestId": "req_j2x8v4m1n",
    "retryable": true,
    "details": {
      "retryAfter": 60
    }
  }
}
```

**Internal server error (500):**
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred. Please try again.",
    "statusCode": 500,
    "requestId": "req_p3q7r9s1t",
    "retryable": true
  }
}
```

---

## HTTP Status Code Map

### Success Codes

| Code | When Used |
|------|-----------|
| `200 OK` | GET success, PUT/PATCH update success |
| `201 Created` | POST that creates a resource (booking, invoice, membership) |
| `204 No Content` | DELETE success, no response body |

### Client Error Codes (4xx)

| Code | Error Code | When Used |
|------|-----------|-----------|
| `400 Bad Request` | `VALIDATION_ERROR` | Zod validation fails, malformed JSON, missing fields |
| `401 Unauthorized` | `UNAUTHENTICATED` | No session, expired session, invalid token |
| `403 Forbidden` | `FORBIDDEN` | Authenticated but lacks permission (role-based) |
| `404 Not Found` | `NOT_FOUND` | Resource doesn't exist or not visible to user |
| `405 Method Not Allowed` | `METHOD_NOT_ALLOWED` | Wrong HTTP verb (POST to GET-only endpoint) |
| `409 Conflict` | `CONFLICT` / domain-specific | Slot taken, duplicate booking, stale data |
| `422 Unprocessable Entity` | `BUSINESS_RULE_VIOLATION` | Valid data but violates business rule |
| `429 Too Many Requests` | `RATE_LIMITED` | Upstash Ratelimit threshold exceeded |

### Server Error Codes (5xx)

| Code | Error Code | When Used |
|------|-----------|-----------|
| `500 Internal Server Error` | `INTERNAL_ERROR` | Unhandled exception, DB connection failure |
| `502 Bad Gateway` | `UPSTREAM_ERROR` | Render PDF API unreachable, Resend API down |
| `503 Service Unavailable` | `SERVICE_UNAVAILABLE` | Neon DB in maintenance, Cloudflare R2 outage |
| `504 Gateway Timeout` | `TIMEOUT` | Upstream service exceeded response time |

---

## Error Classification

### Operational Errors (Expected, Handled)

Errors that happen during normal operation. Logged at `warn` level. No Sentry alert.

| Category | Examples |
|----------|----------|
| Validation | Invalid phone, missing required field, bad date format |
| Auth | Expired session, insufficient role |
| Business rules | Slot already booked, membership expired, max reschedules reached |
| Rate limits | Too many API calls |
| Not found | Booking ID doesn't exist |

### Programmer Errors (Unexpected, Alerted)

Errors that indicate bugs. Logged at `error` level. Sentry captures with full context.

| Category | Examples |
|----------|----------|
| Unhandled exceptions | TypeError, null reference, missing env var |
| DB errors | Connection pool exhausted, migration mismatch, constraint violation |
| External service failures | Resend 5xx, Ably connection lost, Neon timeout |
| Logic bugs | Invalid state transition, impossible enum value |

---

## Error Code Registry

All error codes are centralized — no magic strings scattered across the codebase:

```ts
// packages/errors/codes.ts

export const ErrorCode = {
  // Generic
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  TIMEOUT: 'TIMEOUT',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Booking domain
  BOOKING_SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  BOOKING_ALREADY_CANCELLED: 'BOOKING_ALREADY_CANCELLED',
  BOOKING_MAX_RESCHEDULES: 'BOOKING_MAX_RESCHEDULES',
  BOOKING_CANCEL_WINDOW_PASSED: 'BOOKING_CANCEL_WINDOW_PASSED',
  BOOKING_INVALID_STATUS_TRANSITION: 'BOOKING_INVALID_STATUS_TRANSITION',

  // Membership domain
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',
  MEMBERSHIP_INSUFFICIENT_HOURS: 'MEMBERSHIP_INSUFFICIENT_HOURS',
  MEMBERSHIP_ALREADY_ACTIVE: 'MEMBERSHIP_ALREADY_ACTIVE',

  // Invoice domain
  INVOICE_ALREADY_PAID: 'INVOICE_ALREADY_PAID',
  INVOICE_GENERATION_FAILED: 'INVOICE_GENERATION_FAILED',

  // Gems domain
  GEMS_INSUFFICIENT_BALANCE: 'GEMS_INSUFFICIENT_BALANCE',
  GEMS_SERVICE_NOT_REDEEMABLE: 'GEMS_SERVICE_NOT_REDEEMABLE',

  // Offer domain
  OFFER_EXPIRED: 'OFFER_EXPIRED',
  OFFER_MAX_USAGE_REACHED: 'OFFER_MAX_USAGE_REACHED',
  OFFER_NOT_APPLICABLE: 'OFFER_NOT_APPLICABLE',

  // Branch domain
  BRANCH_INACTIVE: 'BRANCH_INACTIVE',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]
```

---

## AppError Class

Custom error class used throughout the business layer:

```ts
// packages/errors/app-error.ts

import { ErrorCode } from './codes'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly isOperational: boolean
  readonly retryable: boolean
  readonly details?: unknown

  constructor(params: {
    code: ErrorCode
    message: string
    statusCode: number
    isOperational?: boolean    // default: true
    retryable?: boolean        // default: false
    details?: unknown
    cause?: Error              // original error for chain
  }) {
    super(params.message, { cause: params.cause })
    this.name = 'AppError'
    this.code = params.code
    this.statusCode = params.statusCode
    this.isOperational = params.isOperational ?? true
    this.retryable = params.retryable ?? false
    this.details = params.details
  }
}

// Convenience factory functions
export function notFound(message = 'Resource not found') {
  return new AppError({
    code: 'NOT_FOUND',
    message,
    statusCode: 404,
  })
}

export function forbidden(message = 'You do not have permission to perform this action') {
  return new AppError({
    code: 'FORBIDDEN',
    message,
    statusCode: 403,
  })
}

export function conflict(code: ErrorCode, message: string) {
  return new AppError({
    code,
    message,
    statusCode: 409,
  })
}

export function badRequest(message: string, details?: unknown) {
  return new AppError({
    code: 'VALIDATION_ERROR',
    message,
    statusCode: 400,
    details,
  })
}

export function serviceUnavailable(service: string, cause?: Error) {
  return new AppError({
    code: 'UPSTREAM_ERROR',
    message: `Service temporarily unavailable. Please try again.`,
    statusCode: 502,
    retryable: true,
    cause,
  })
}
```

---

## Request ID Generation

Every request gets a unique correlation ID attached in middleware:

```ts
// apps/web/src/middleware.ts (relevant excerpt)

import { nanoid } from 'nanoid'

export function middleware(request: NextRequest) {
  const requestId = `req_${nanoid(12)}`

  // Attach to request headers for downstream access
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  // Expose in response headers for client-side correlation
  response.headers.set('x-request-id', requestId)

  return response
}
```

---

## Error Handling Patterns

### Pattern 1: Route Handler (API Routes)

```ts
// apps/web/src/app/api/leads/route.ts — campaign lead capture

import { withErrorHandler } from '@/lib/api/error-handler'
import { createLeadSchema } from '@repo/types/lead'

export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json()
  const parsed = createLeadSchema.safeParse(body)

  if (!parsed.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid lead data',
      statusCode: 400,
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const lead = await createLead(parsed.data)
  return Response.json({ success: true, data: lead }, { status: 201 })
})
```

### Pattern 2: `withErrorHandler` Wrapper

```ts
// apps/web/src/lib/api/error-handler.ts

import { AppError } from '@repo/errors/app-error'
import * as Sentry from '@sentry/nextjs'
import { headers } from 'next/headers'

type RouteHandler = (req: Request, ctx?: { params: Record<string, string> }) => Promise<Response>

export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const requestId = (await headers()).get('x-request-id') ?? 'unknown'

    try {
      return await handler(req, ctx)
    } catch (error) {
      return handleError(error, requestId)
    }
  }
}

function handleError(error: unknown, requestId: string): Response {
  // Known operational error
  if (error instanceof AppError) {
    if (!error.isOperational) {
      // Programmer error disguised as AppError — alert
      Sentry.captureException(error, {
        tags: { requestId, errorCode: error.code },
        level: 'error',
      })
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
          ...(error.details && { details: error.details }),
        },
      },
      { status: error.statusCode }
    )
  }

  // Unknown error — programmer bug, capture in Sentry
  Sentry.captureException(error, {
    tags: { requestId },
    level: 'error',
    extra: { context: 'unhandled_route_handler' },
  })

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
```

### Pattern 3: Server Actions

Server Actions cannot return arbitrary HTTP status codes. They return data or throw. We use a result pattern:

```ts
// packages/errors/action-result.ts

type ActionSuccess<T> = { success: true; data: T }
type ActionError = {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}
type ActionResult<T> = ActionSuccess<T> | ActionError

// Usage in Server Action
// apps/web/src/app/(customer)/bookings/actions.ts
'use server'

import { actionClient } from '@/lib/safe-action'
import { createBookingSchema } from '@repo/types/booking'

export const createBookingAction = actionClient
  .schema(createBookingSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const booking = await createBooking(parsedInput)
      return { success: true as const, data: booking }
    } catch (error) {
      if (error instanceof AppError && error.isOperational) {
        return {
          success: false as const,
          error: { code: error.code, message: error.message },
        }
      }
      // Unexpected — log and rethrow generic
      Sentry.captureException(error, {
        tags: { action: 'createBooking' },
      })
      return {
        success: false as const,
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
      }
    }
  })
```

### Pattern 4: Business Layer (Services)

Business logic **throws AppError** — never catches it. The handler layer above decides what to do:

```ts
// packages/business/booking/create.ts

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  // Check slot availability
  const isAvailable = await checkSlotAvailable(input.branchId, input.date, input.time)
  if (!isAvailable) {
    throw conflict('BOOKING_SLOT_UNAVAILABLE', 'This time slot is no longer available. Please choose another.')
  }

  // Check membership hours (if SPA member booking)
  if (input.useMembership) {
    const membership = await getActiveMembership(input.customerId)
    if (!membership) {
      throw new AppError({
        code: 'MEMBERSHIP_EXPIRED',
        message: 'Your SPA membership has expired. Please renew to book with membership hours.',
        statusCode: 422,
      })
    }
    if (membership.remainingMinutes < input.estimatedDurationMinutes) {
      throw new AppError({
        code: 'MEMBERSHIP_INSUFFICIENT_HOURS',
        message: `Insufficient membership hours. You have ${formatDuration(membership.remainingMinutes)} remaining.`,
        statusCode: 422,
      })
    }
  }

  // Proceed with booking creation...
  return await db.insert(booking).values(/* ... */).returning()
}
```

### Pattern 5: External Service Errors

Wrap external service calls with proper error translation:

```ts
// packages/integrations/resend/send.ts

import * as Sentry from '@sentry/nextjs'
import { serviceUnavailable } from '@repo/errors/app-error'

export async function sendEmail(params: SendEmailParams) {
  try {
    const result = await resend.emails.send(params)
    if (result.error) {
      throw new Error(result.error.message)
    }
    return result.data
  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: 'resend', action: 'send_email' },
      extra: { to: params.to, template: params.subject },
    })
    // Don't fail the booking if email fails — log and continue
    // The invoice is still generated, email can be retried
    console.error('[Resend] Email send failed:', error)
    return null
  }
}
```

```ts
// packages/integrations/render/pdf.ts

export async function generatePdf(invoiceId: string): Promise<Buffer> {
  const res = await fetch(`${process.env.PDF_API_URL}/invoices/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId }),
    signal: AbortSignal.timeout(30_000), // 30s hard timeout
  })

  if (!res.ok) {
    const cause = new Error(`PDF API returned ${res.status}`)
    Sentry.captureException(cause, {
      tags: { service: 'render_pdf', invoiceId },
    })
    throw serviceUnavailable('PDF generation', cause)
  }

  return Buffer.from(await res.arrayBuffer())
}
```

---

## Sentry Integration

### Setup

```ts
// apps/web/instrumentation.ts

import * as Sentry from '@sentry/nextjs'

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.APP_ENV, // prod | pprd | test | dev
      release: process.env.COMMIT_SHA,

      // Performance — sample 10% of transactions in prod
      tracesSampleRate: process.env.APP_ENV === 'prod' ? 0.1 : 1.0,

      // Only send errors from operational code, not third-party noise
      beforeSend(event) {
        // Filter out known non-actionable errors
        if (event.exception?.values?.[0]?.type === 'AbortError') return null
        if (event.exception?.values?.[0]?.value?.includes('NEXT_NOT_FOUND')) return null
        return event
      },

      // Attach user context for every error
      integrations: [
        Sentry.extraErrorDataIntegration({ depth: 3 }),
      ],
    })
  }
}
```

### Context Enrichment

Every error sent to Sentry carries:

```ts
// apps/web/src/lib/sentry-context.ts

import * as Sentry from '@sentry/nextjs'
import { auth } from '@/lib/auth'

export async function enrichSentryContext() {
  const session = await auth()

  if (session?.user) {
    Sentry.setUser({
      id: session.user.id,
      email: session.user.email,
      // Never send PII beyond what's needed for debugging
    })
  }

  Sentry.setTag('branch', process.env.APP_ENV)
  Sentry.setTag('deployment', process.env.CF_PAGES_BRANCH ?? 'unknown')
}
```

### What Gets Captured

| Error Type | Sentry Level | Alert | Tags |
|-----------|-------------|-------|------|
| Unhandled exception (500) | `error` | Slack + Email immediately | `requestId`, `route`, `userId` |
| External service failure (502/503) | `warning` | Slack if >3 in 5 min | `service`, `statusCode` |
| Business rule violation (4xx) | Not sent | — | — |
| Validation error (400) | Not sent | — | — |
| Rate limit exceeded (429) | Not sent | — | — |
| Auth failure (401/403) | Not sent | — | Captured only if suspicious pattern |

### Sentry Alert Rules

| Rule | Condition | Action |
|------|-----------|--------|
| Critical | Any new `error` level issue | Slack `#alerts-critical` + Email to developer |
| High frequency | >10 same error in 5 min | Slack `#alerts-critical` |
| External service down | >3 upstream errors in 5 min | Slack `#alerts-infra` |
| Slow transaction | P95 response time >3s | Slack `#alerts-perf` (weekly digest) |

### Source Maps

```yaml
# Uploaded during Cloudflare Pages build
# wrangler.toml or build script
sentry-cli sourcemaps upload \
  --org royal-glow \
  --project rgss-web \
  --release $COMMIT_SHA \
  .next/static
```

---

## Database Error Handling

### Drizzle ORM Errors

```ts
// packages/business/utils/db-errors.ts

import { NeonDbError } from '@neondatabase/serverless'
import * as Sentry from '@sentry/nextjs'

export function handleDbError(error: unknown, context: string): never {
  // Neon-specific connection errors
  if (error instanceof NeonDbError) {
    Sentry.captureException(error, {
      tags: { layer: 'database', context },
    })

    if (error.code === '57P03') {
      // Cannot connect to database
      throw new AppError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable. Please try again.',
        statusCode: 503,
        isOperational: false,
        retryable: true,
        cause: error,
      })
    }

    if (error.code === '23505') {
      // Unique constraint violation — likely a race condition
      throw new AppError({
        code: 'CONFLICT',
        message: 'This operation conflicts with an existing record.',
        statusCode: 409,
        isOperational: true,
      })
    }

    if (error.code === '23503') {
      // Foreign key violation — referencing non-existent record
      throw notFound('Referenced resource does not exist')
    }
  }

  // Unknown DB error — always capture
  Sentry.captureException(error, {
    tags: { layer: 'database', context },
    level: 'error',
  })

  throw new AppError({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again.',
    statusCode: 500,
    isOperational: false,
    retryable: true,
    cause: error instanceof Error ? error : undefined,
  })
}
```

### Usage in repositories

```ts
// packages/business/booking/repository.ts

export async function getBookingById(id: string, userId: string) {
  try {
    const result = await db
      .select()
      .from(booking)
      .where(and(eq(booking.id, id), eq(booking.customerId, userId)))
      .limit(1)

    if (!result[0]) throw notFound('Booking not found')
    return result[0]
  } catch (error) {
    if (error instanceof AppError) throw error // Re-throw known errors
    handleDbError(error, 'getBookingById')
  }
}
```

---

## Client-Side Error Handling

### React Error Boundaries

```
app/
  ├── global-error.tsx          ← Catches root layout crashes (full-page fallback)
  ├── (customer)/
  │   ├── error.tsx             ← Customer route errors (header/footer persist)
  │   └── bookings/
  │       └── error.tsx         ← Booking-specific error (shows retry + support CTA)
  └── (admin)/
      └── admin/
          └── error.tsx         ← Admin error (sidebar persists, error in content area)
```

### Error Boundary Component

```tsx
// apps/web/src/app/(customer)/error.tsx
'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground text-sm">
        We've been notified and are looking into it.
      </p>
      <button onClick={reset} className="btn-primary">
        Try again
      </button>
      <p className="text-muted-foreground text-xs">
        Reference: {error.digest}
      </p>
    </div>
  )
}
```

### Client-Side API Error Handling

```ts
// apps/web/src/lib/api/client.ts

import { toast } from 'sonner'

export async function apiClient<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const json = await res.json()

  if (!json.success) {
    const { error } = json

    // Handle specific codes client-side
    switch (error.code) {
      case 'UNAUTHENTICATED':
        // Session expired — redirect to sign-in
        window.location.href = '/sign-in'
        break
      case 'RATE_LIMITED':
        toast.error('Too many requests. Please wait a moment.')
        break
      case 'VALIDATION_ERROR':
        // Let the form handle field-level errors
        break
      default:
        toast.error(error.message)
    }

    throw error
  }

  return json.data as T
}
```

---

## Server Action Error Handling on Client

```tsx
// apps/web/src/components/booking/booking-form.tsx
'use client'

import { createBookingAction } from '@/app/actions/bookings'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'

export function BookingForm() {
  const { execute, isExecuting } = useAction(createBookingAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success('Request submitted! Our team will confirm the slot shortly.')
      } else if (data && !data.success) {
        // Operational error — show to user
        toast.error(data.error.message)
      }
    },
    onError() {
      // Network/unexpected error
      toast.error('Something went wrong. Please try again.')
    },
  })

  // ...
}
```

---

## Error Logging Levels

| Level | When | Destination | Sentry? |
|-------|------|------------|---------|
| `debug` | Detailed flow info (dev only) | Console | No |
| `info` | Successful operations worth noting | BetterStack Logs | No |
| `warn` | Operational errors (4xx), degraded state | BetterStack Logs | No (unless threshold) |
| `error` | Programmer errors (5xx), external failures | BetterStack Logs + Sentry | Yes |
| `fatal` | App cannot continue (missing env, DB unreachable on boot) | Sentry (immediately) | Yes |

### Structured Logging

```ts
// packages/logger/index.ts

import { createLogger } from '@repo/logger/create'

export const logger = createLogger({
  service: 'rgss-web',
  environment: process.env.APP_ENV,
})

// Usage
logger.info('Booking created', {
  bookingId: booking.id,
  customerId: booking.customerId,
  branch: booking.branchId,
})

logger.error('PDF generation failed', {
  invoiceId,
  error: error.message,
  statusCode: pdfResponse.status,
})
```

**Log output format (JSON — for BetterStack ingestion):**
```json
{
  "level": "error",
  "message": "PDF generation failed",
  "service": "rgss-web",
  "environment": "prod",
  "timestamp": "2026-05-23T14:30:00.000Z",
  "data": {
    "invoiceId": "inv_abc123",
    "error": "Connection refused",
    "statusCode": 502
  }
}
```

---

## Rate Limiting & Security Headers

### Rate Limit Thresholds — Per Endpoint

All rate limiting runs in Next.js middleware via **`@upstash/ratelimit`** backed by Upstash Redis. Key = `${ip}:${pathname}`. Applied **before** auth checks or any business logic.

#### Public Endpoints (No Auth Required)

| Endpoint | Method | Window | Limit | Rationale |
|----------|--------|--------|-------|-----------|
| `/api/services` | GET | 10s | 20 | Public catalog — generous for page loads |
| `/api/services/[slug]` | GET | 10s | 20 | Single service detail |
| `/api/availability` | GET | 10s | 10 | Prevent slot scraping |
| `/api/leads` | POST | 1 min | 3 | Lead form spam prevention |
| `/api/auth/sign-in/*` | POST | 1 min | 10 | Google OAuth — brute force protection |
| `/api/auth/callback/*` | GET | 1 min | 10 | OAuth callback |
| `/api/health` | GET | 10s | 30 | Uptime monitors hit this frequently |

#### Authenticated Endpoints (Customer)

| Endpoint | Method | Window | Limit | Rationale |
|----------|--------|--------|-------|-----------|
| `/api/bookings` | GET | 10s | 15 | Listing — generous for browsing |
| `/api/bookings` | POST | 1 min | 5 | Normal customer booking creation |
| `/api/bookings/[id]` | GET | 10s | 20 | Single booking detail |
| `/api/bookings/[id]/cancel` | POST | 1 min | 3 | Cancel action |
| `/api/bookings/[id]/reschedule` | POST | 1 min | 3 | Reschedule action |
| `/api/membership` | GET | 10s | 10 | Membership status checks |
| `/api/gems` | GET | 10s | 10 | Gems balance |
| `/api/profile` | PUT | 1 min | 5 | Profile updates |

#### Authenticated Endpoints (Admin/Staff)

| Endpoint | Method | Window | Limit | Rationale |
|----------|--------|--------|-------|-----------|
| `/api/admin/bookings` | GET | 10s | 30 | Admin lists — higher for dashboard |
| `/api/admin/bookings` | POST | 1 min | 10 | Receptionist-created bookings from approved leads/walk-ins |
| `/api/admin/bookings/[id]/complete` | POST | 1 min | 10 | Completing bookings (batch workflows) |
| `/api/admin/bookings/[id]/approve` | POST | 1 min | 10 | Approving bookings |
| `/api/admin/invoices/generate` | POST | 1 min | 10 | Invoice generation |
| `/api/admin/members` | POST | 1 min | 5 | Membership creation |
| `/api/admin/offers` | POST | 1 min | 5 | Offer creation |
| `/api/admin/staff` | POST | 1 min | 5 | Staff management |
| `/api/admin/branches` | POST | 1 min | 3 | Branch management (rare) |
| `/api/admin/reports/*` | GET | 10s | 10 | Report generation |

#### Webhook Endpoints (Server-to-Server)

| Endpoint | Method | Window | Limit | Rationale |
|----------|--------|--------|-------|-----------|
| `/api/webhooks/brevo` | POST | 1s | 50 | Brevo unsubscribe/bounce events |
| `/api/webhooks/ably` | POST | 1s | 100 | Ably presence/connection events |
| `/api/webhooks/qstash` | POST | 1s | 30 | QStash scheduled job callbacks |

#### Default Fallbacks

| Pattern | Method | Window | Limit |
|---------|--------|--------|-------|
| All other `POST /api/*` | POST | 1 min | 10 |
| All other `GET /api/*` | GET | 10s | 30 |
| All other `PUT/PATCH /api/*` | PUT/PATCH | 1 min | 10 |
| All other `DELETE /api/*` | DELETE | 1 min | 5 |

### Rate Limit Implementation — Multi-Tier

```ts
// apps/web/src/middleware.ts

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

// Tier 1a: Lead capture (cold campaign traffic)
const leadLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '60 s'),
  prefix: 'rgss:rl:lead',
})

// Tier 1b: Booking mutations
const bookingLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: 'rgss:rl:booking',
})

// Tier 2: Standard (authenticated writes)
const standardLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60 s'),
  prefix: 'rgss:rl:standard',
})

// Tier 3: Relaxed (reads, public endpoints)
const relaxedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '10 s'),
  prefix: 'rgss:rl:relaxed',
})

// Tier 4: Webhooks (high throughput, short window)
const webhookLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, '1 s'),
  prefix: 'rgss:rl:webhook',
})

function getLimiter(pathname: string, method: string): Ratelimit {
  if (pathname.startsWith('/api/webhooks/')) return webhookLimiter
  if (method === 'GET') return relaxedLimiter
  if (pathname === '/api/leads' && method === 'POST') return leadLimiter
  if (pathname === '/api/bookings' && method === 'POST') return bookingLimiter
  if (pathname.startsWith('/api/bookings/') && method !== 'GET') return bookingLimiter
  return standardLimiter
}
```

### Rate Limit Key Strategy

```ts
// Key composition — prevents abuse vectors
function getRateLimitKey(req: NextRequest, pathname: string): string {
  const ip = req.headers.get('cf-connecting-ip')      // Cloudflare real IP
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]
    ?? '127.0.0.1'

  // Authenticated users: key by userId (more accurate, survives IP changes)
  // Unauthenticated: key by IP
  const userId = req.headers.get('x-user-id')  // Set after auth check in middleware chain
  const identifier = userId ?? ip

  return `${identifier}:${pathname}`
}
```

**Why userId over IP for authenticated users:**
- Shared office IPs don't unfairly rate-limit multiple users
- VPN/mobile users changing IPs can't bypass limits
- More accurate per-user enforcement

### Rate Limit Bypass — Trusted Sources

```ts
// Skip rate limiting for:
const BYPASS_PREFIXES = [
  '/api/webhooks/qstash',   // QStash uses signature verification instead
]

// QStash requests are verified via signature — rate limiting is secondary
function shouldBypass(pathname: string, req: NextRequest): boolean {
  if (BYPASS_PREFIXES.some(p => pathname.startsWith(p))) {
    return verifyQStashSignature(req)  // Only bypass if signature is valid
  }
  return false
}
```

---

### Security Headers

All security headers are set in middleware and apply to **every response** (pages + API). Defined in a single place for consistency.

```ts
// apps/web/src/middleware.ts — security headers applied to every response

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  const headers = response.headers

  // Content Security Policy — nonce-based for scripts
  headers.set('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://*.posthog.com https://clarity.ms https://connect.facebook.net`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.cloudflare.com https://*.r2.dev",
    "font-src 'self'",
    "connect-src 'self' https://*.neon.tech https://*.ably.io https://*.upstash.io https://*.posthog.com https://clarity.ms https://graph.facebook.com https://*.sentry.io",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; '))

  // Anti-clickjacking
  headers.set('X-Frame-Options', 'DENY')

  // Prevent MIME sniffing
  headers.set('X-Content-Type-Options', 'nosniff')

  // DNS prefetch control
  headers.set('X-DNS-Prefetch-Control', 'off')

  // Referrer — don't leak full URLs cross-origin
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Disable unnecessary browser features
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()')

  // HSTS — force HTTPS, 1 year, preload-ready
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')

  return response
}
```

#### Header Breakdown

| Header | Value | Threat Mitigated |
|--------|-------|-----------------|
| `Content-Security-Policy` | Nonce-based script whitelist | XSS, code injection, data exfiltration |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME confusion attacks |
| `X-DNS-Prefetch-Control` | `off` | DNS-based tracking/exfiltration |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | URL leakage (booking IDs in referrer) |
| `Permissions-Policy` | Disable camera, mic, payment | Feature abuse by injected scripts |
| `Strict-Transport-Security` | 1 year, includeSubDomains, preload | SSL stripping, downgrade attacks |

#### CSP Nonce Generation

```ts
// Per-request nonce — prevents inline script injection even if attacker finds a CSP bypass
import { nanoid } from 'nanoid'

export function middleware(request: NextRequest) {
  const nonce = nanoid(16)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-csp-nonce', nonce)  // Pass to React for script tags

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  applySecurityHeaders(response, nonce)
  return response
}
```

### CORS Configuration

```ts
// apps/web/src/middleware.ts — CORS handling

const ALLOWED_ORIGINS: Record<string, string[]> = {
  prod: ['https://theroyalglow.in', 'https://www.theroyalglow.in'],
  pprd: ['https://pprd.theroyalglow.in'],
  test: ['https://test.theroyalglow.in'],
  dev:  ['http://localhost:3000', 'http://localhost:3001'],
}

function handleCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin')
  const env = process.env.APP_ENV ?? 'dev'
  const allowed = ALLOWED_ORIGINS[env] ?? []

  if (origin && allowed.includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id')
    res.headers.set('Access-Control-Allow-Credentials', 'true')
    res.headers.set('Access-Control-Max-Age', '86400')  // Cache preflight 24h
  }

  // Preflight requests — respond immediately
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: res.headers })
  }

  return res
}
```

#### CORS Error Behavior

| Scenario | Browser Behavior | Our Response |
|----------|-----------------|--------------|
| Origin not in allowed list | Browser blocks response | No CORS headers set → browser enforces |
| Missing `Origin` header (server-to-server) | N/A — CORS is browser-only | Request proceeds normally |
| Preflight `OPTIONS` request | Browser sends before actual request | 204 No Content + CORS headers |
| Credentials included (`cookies`) | Requires exact origin match | `Allow-Credentials: true` + exact origin |

---

### Webhook Security (Server-to-Server)

Webhooks bypass CORS (not browser-initiated) but require their own security:

```ts
// apps/web/src/app/api/webhooks/qstash/route.ts

import { Receiver } from '@upstash/qstash'

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
})

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('upstash-signature')

  const isValid = await receiver.verify({ body, signature: signature! })
  if (!isValid) {
    return Response.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Invalid signature', statusCode: 403 } },
      { status: 403 }
    )
  }

  // Process webhook...
}
```

```ts
// apps/web/src/app/api/webhooks/brevo/route.ts

export async function POST(req: Request) {
  // Brevo sends webhook secret in header
  const secret = req.headers.get('x-brevo-webhook-secret')
  if (secret !== process.env.BREVO_WEBHOOK_SECRET) {
    return Response.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Invalid webhook secret', statusCode: 403 } },
      { status: 403 }
    )
  }

  // Process webhook...
}
```

| Webhook Source | Verification Method |
|---------------|-------------------|
| QStash | HMAC signature (`upstash-signature` header) |
| Brevo | Shared secret (`x-brevo-webhook-secret` header) |
| Ably | Token verification via Ably SDK |

---

### Security Error Responses

Security violations get **minimal information** in responses — no hints for attackers:

| Violation | Status | Response Body | Sentry? |
|-----------|--------|---------------|---------|
| Invalid CORS origin | No CORS headers (browser blocks) | N/A | No |
| Rate limit exceeded | 429 | Standard `RATE_LIMITED` error | No (unless pattern detected) |
| Missing auth session | 401 | `UNAUTHENTICATED` — no detail on *why* | No |
| Insufficient role | 403 | `FORBIDDEN` — no role info leaked | No |
| Invalid webhook signature | 403 | `FORBIDDEN` — no detail | Yes (potential attack) |
| Suspicious auth pattern (>50 failures/hour) | 429 then 403 | IP temporarily blocked | Yes + alert |
| CSP violation | N/A (browser blocks) | — | CSP report-uri → Sentry |

### CSP Violation Reporting

```ts
// CSP header includes report-uri for violation monitoring
"report-uri https://o123.ingest.sentry.io/api/456/security/?sentry_key=abc"
"report-to default"
```

Sentry collects CSP violations as **security events** — helpful for:
- Detecting XSS attempts
- Identifying misconfigured third-party scripts
- Finding broken integrations after CSP changes

---

## Rate Limiting Error Flow

Already implemented via Upstash Ratelimit in middleware. When triggered:

```ts
// apps/web/src/middleware.ts (excerpt)

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '60 s'), // 20 requests per 60s
})

// In middleware, for /api/* routes:
const { success, limit, remaining, reset } = await ratelimit.limit(identifier)

if (!success) {
  return Response.json(
    {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        statusCode: 429,
        requestId,
        retryable: true,
        details: { retryAfter: Math.ceil((reset - Date.now()) / 1000) },
      },
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
        'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
      },
    }
  )
}
```

---

## Auth Error Handling

Better Auth handles session validation. Our middleware layer translates auth failures:

```ts
// apps/web/src/lib/api/auth-guard.ts

import { auth } from '@/lib/auth'
import { AppError } from '@repo/errors/app-error'

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    throw new AppError({
      code: 'UNAUTHENTICATED',
      message: 'Please sign in to continue.',
      statusCode: 401,
    })
  }
  return session
}

export async function requireRole(allowedRoles: Role[]) {
  const session = await requireAuth()
  if (!allowedRoles.includes(session.user.role)) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
      statusCode: 403,
    })
  }
  return session
}
```

---

## Non-Critical Failure Strategy

Some operations should **never** block the main flow, even if they fail:

| Operation | If It Fails... | Strategy |
|-----------|---------------|----------|
| Send email (Resend) | Booking still completes, email retried later | Log + Sentry warning, return null |
| Sync contact to Brevo | User still functions, sync retried on next event | Log + continue |
| Gem calculation | Invoice still generated without gems | Log + Sentry error, gems = 0 |
| Meta Pixel event | No analytics, no user impact | Swallow silently |
| PostHog event | No analytics, no user impact | Swallow silently |
| Ably notification push | User won't get real-time update, but can refresh | Log + continue |

```ts
// packages/utils/safe-exec.ts

export async function safeExec<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    Sentry.captureException(error, {
      tags: { context, severity: 'non-critical' },
      level: 'warning',
    })
    return null
  }
}

// Usage
await safeExec(
  () => sendBookingConfirmationEmail(booking, customer),
  'send_booking_confirmation_email'
)
```

---

## Error Response Headers

Every error response includes these headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Request-Id` | `req_k7x9m2p4q` | Correlation for Sentry lookup |
| `X-RateLimit-Limit` | `20` | (429 only) Total allowed requests |
| `X-RateLimit-Remaining` | `0` | (429 only) Remaining requests |
| `Retry-After` | `60` | (429/503 only) Seconds until retry |
| `Cache-Control` | `no-store` | Never cache error responses |

---

## Testing Error Scenarios

```ts
// apps/web/tests/api/error-handling.test.ts

describe('API Error Handling', () => {
  it('returns 400 with validation details for invalid input', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/leads', body: { phone: 'invalid' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
    expect(res.json().error.details).toBeDefined()
    expect(res.json().error.requestId).toMatch(/^req_/)
  })

  it('returns 409 when booking slot is taken', async () => {
    // ... setup conflicting slot
    const res = await createBooking(overlappingSlot)
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('BOOKING_SLOT_UNAVAILABLE')
  })

  it('never exposes stack traces in production', async () => {
    // Force an unhandled error
    const res = await triggerInternalError()
    expect(res.statusCode).toBe(500)
    expect(res.json().error.message).not.toContain('at Object')
    expect(res.json().error.message).toBe('An unexpected error occurred. Please try again.')
  })

  it('captures unhandled errors in Sentry', async () => {
    await triggerInternalError()
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { requestId: expect.any(String) } })
    )
  })
})
```

---

## Summary — Error Flow Diagram

```
Client Request
  │
  ├─ Middleware ─────────────────────────────────────────────────┐
  │   • Generate requestId                                       │
  │   • Rate limit check → 429 if exceeded                      │
  │   • Auth check → 401 if no session                          │
  │                                                              │
  ├─ Route Handler / Server Action ──────────────────────────────┤
  │   • Zod validation → 400 if invalid                         │
  │   • withErrorHandler wraps entire handler                    │
  │                                                              │
  ├─ Business Layer ─────────────────────────────────────────────┤
  │   • Throws AppError for business rule violations             │
  │   • AppError carries code, statusCode, message               │
  │                                                              │
  ├─ Data Layer (Drizzle + Neon) ────────────────────────────────┤
  │   • DB errors translated to AppError via handleDbError()     │
  │   • Constraint violations → 409                              │
  │   • Connection errors → 503                                  │
  │                                                              │
  ├─ External Services (Resend, Ably, Render PDF) ───────────────┤
  │   • Wrapped with timeout + error translation                 │
  │   • Non-critical failures don't block main flow              │
  │                                                              │
  └─ Error Handler (catch-all) ──────────────────────────────────┘
      • AppError (operational) → formatted JSON response
      • Unknown error → 500 + Sentry capture
      • requestId in every response
      • Zero internal details leaked to client
```
