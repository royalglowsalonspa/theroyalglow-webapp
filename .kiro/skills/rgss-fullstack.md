# RGSS Full-Stack Development Skill

## Description
Guides Kiro to generate code following Royal Glow Salon & Spa's exact conventions, architecture, and business rules. Activates automatically when working in this monorepo.

## Activation
- Always active in this workspace
- Applies to: all TypeScript, React, API route, schema, and config files

---

## Monorepo Layer Rules

When generating code, ALWAYS place it in the correct package:

| What you're writing | Where it goes | Can import from |
|--------------------|--------------|-----------------| 
| React pages/layouts | `apps/web/app/` | business, db, types, errors, UI components |
| React components | `apps/web/components/` | types, errors (NO db, NO business logic inline) |
| API route handlers | `apps/web/app/api/` | business, db, types, errors (NO UI imports) |
| Business logic (pure functions) | `packages/business/` | types, errors ONLY (NO db, NO framework) |
| Database schemas | `packages/db/schema/` | types ONLY |
| Database queries | `packages/db/queries/` | schema, types |
| Zod validation schemas | `packages/types/` | NOTHING (leaf package) |
| Error codes + AppError class | `packages/errors/` | NOTHING (leaf package) |

**CRITICAL:** Business logic in `packages/business/` must be PURE — no database calls, no fetch, no framework imports. It receives data as parameters and returns results.

---

## API Route Template (MANDATORY)

Every API route MUST follow this exact pattern:

```typescript
// apps/web/app/api/{resource}/route.ts
import { withErrorHandler } from '@/lib/api/error-handler'
import { withRateLimit } from '@/lib/api/rate-limit'
import { getSession } from '@/lib/auth'
import { AppError } from '@repo/errors'
import { someSchema } from '@repo/types/{domain}'
import { someQuery } from '@repo/db/queries/{domain}'
import { someBusinessFn } from '@repo/business/{domain}'

export const POST = withErrorHandler(async (req: Request) => {
  // 1. Auth check
  const session = await getSession(req)
  if (!session) throw new AppError({ code: 'UNAUTHORIZED', message: 'Sign in required', statusCode: 401 })

  // 2. Parse + validate
  const body = await req.json()
  const parsed = someSchema.safeParse(body)
  if (!parsed.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      statusCode: 400,
      details: parsed.error.flatten().fieldErrors,
    })
  }

  // 3. Business logic (may call DB queries internally or receive data)
  const result = await someBusinessFn(parsed.data, session.user)

  // 4. Return standardized response
  return Response.json({ success: true, data: result }, { status: 201 })
})
```

**NEVER:**
- Write DB queries directly in API routes
- Use `.parse()` (throws unstructured) — always `.safeParse()`
- Return non-standard response shapes
- Skip auth checks on protected routes

---

## Response Shape (ALL endpoints)

```typescript
// Success
{ success: true, data: T }
{ success: true, data: T, meta: { page: number, totalPages: number, totalCount: number } }

// Error
{
  success: false,
  error: {
    code: string,          // Machine-readable: "BOOKING_SLOT_UNAVAILABLE"
    message: string,       // Human-readable: "The selected time slot is no longer available."
    statusCode: number,    // HTTP status code
    requestId: string,     // "req_abc123xyz" for debugging
    retryable?: boolean,   // Whether client should retry
    details?: Record<string, string[]>  // Field-level validation errors
  }
}
```

---

## Database Conventions

When writing Drizzle schemas or queries:

```typescript
// Primary keys — ALWAYS text with nanoid
id: text('id').primaryKey().$defaultFn(() => nanoid())

// Money — ALWAYS integer in paise (₹1,000.00 = 100000)
pricePaise: integer('price_paise').notNull()

// Timestamps — ALWAYS timestamptz
createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

// Table naming: snake_case, singular
export const booking = pgTable('booking', { ... })
export const invoiceItem = pgTable('invoice_item', { ... })

// Enums: PostgreSQL native
export const bookingStatusEnum = pgEnum('booking_status', [
  'pending', 'confirmed', 'rejected', 'in_progress', 
  'completed', 'cancelled', 'no_show', 'rescheduled'
])
```

**Money math rules:**
- All prices are GST-inclusive (18%)
- Back-calculate: `basePaise = Math.round(inclusivePaise / 1.18)`
- Gems: `floor(totalPaise / 10000)` — 1 gem per ₹100
- NEVER use floating point for money

---

## Component Patterns

```typescript
// Server Component (default — NO 'use client' unless needed)
export default async function BookingsPage({ params }: PageProps) {
  const { id } = await params  // Next.js 16: params is a Promise
  const bookings = await getBookings(id)
  return <BookingList bookings={bookings} />
}

// Client Component (only when needed: state, effects, event handlers)
'use client'
import { useState } from 'react'

export function BookingDialog({ services }: Props) {
  const [step, setStep] = useState(1)
  // ...
}
```

**When to use 'use client':**
- useState, useEffect, useRef, useOptimistic
- onClick, onChange, onSubmit handlers
- Browser APIs (localStorage, navigator)
- Third-party client libs (motion, PostHog)

**NEVER 'use client' for:**
- Data fetching (use server components)
- Static content rendering
- Layout components without interactivity

---

## India-Specific Patterns

```typescript
// Currency display — Indian numbering (₹1,00,000.00)
export function formatINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(paise / 100)
}

// Date display — DD/MM/YYYY
export function formatDateIN(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

// Time display — 12-hour with AM/PM
export function formatTimeIN(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

// GST calculation (18% inclusive)
const GST_RATE = 0.18
export function splitGST(inclusivePaise: number) {
  const basePaise = Math.round(inclusivePaise / (1 + GST_RATE))
  const gstPaise = inclusivePaise - basePaise
  const cgstPaise = Math.round(gstPaise / 2)
  const sgstPaise = gstPaise - cgstPaise
  return { basePaise, cgstPaise, sgstPaise, totalPaise: inclusivePaise }
}
```

---

## RBAC Middleware Pattern

```typescript
// Minimum role check — roles are hierarchical
const ROLE_LEVELS = {
  customer: 0,
  staff: 1,
  receptionist: 2,
  manager: 3,
  owner: 4,
  developer: 5,
} as const

export function requireRole(minRole: keyof typeof ROLE_LEVELS) {
  return (session: Session) => {
    if (ROLE_LEVELS[session.user.role] < ROLE_LEVELS[minRole]) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        statusCode: 403,
      })
    }
  }
}

// Usage in API route:
requireRole('receptionist')(session) // throws if customer or staff
```

---

## Booking Number Format

```typescript
// Format: BK-{branch_code}-{YYMM}-{H|S}-{5_random}
export function generateBookingNumber(branchCode: string, serviceType: 'salon' | 'spa'): string {
  const now = new Date()
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`
  const type = serviceType === 'salon' ? 'H' : 'S'
  const random = nanoid(5)
  return `BK-${branchCode}-${yymm}-${type}-${random}`
}
```

---

## File Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| React component | `PascalCase.tsx` | `BookingDialog.tsx` |
| Page (App Router) | `page.tsx` | `app/(customer)/bookings/page.tsx` |
| Layout | `layout.tsx` | `app/admin/layout.tsx` |
| API route | `route.ts` | `app/api/bookings/route.ts` |
| Utility | `kebab-case.ts` | `packages/business/booking/calculate-end-time.ts` |
| Schema | `kebab-case.ts` | `packages/db/schema/booking.ts` |
| Query | `kebab-case.ts` | `packages/db/queries/booking.ts` |
| Types/Zod | `kebab-case.ts` | `packages/types/booking.ts` |
| Config | `kebab-case.config.ts` | `drizzle.config.ts` |

---

## Accessibility Checklist (Every Component)

Before generating ANY UI component, ensure:

- [ ] Semantic HTML (`<button>` not `<div onClick>`, `<nav>`, `<main>`, `<section>`)
- [ ] All inputs have associated `<label>` elements
- [ ] Interactive elements have visible focus rings (`:focus-visible`)
- [ ] Color is NOT the only indicator (use icons, text, or shapes too)
- [ ] Contrast ratio: 4.5:1 normal text, 3:1 large text
- [ ] `aria-label` on icon-only buttons
- [ ] `aria-live="polite"` on dynamically updating content
- [ ] Keyboard navigation works (Tab, Enter, Space, Escape)
- [ ] Modals trap focus and close on Escape
- [ ] Images have meaningful `alt` text (or `alt=""` if decorative)
- [ ] Animations respect `prefers-reduced-motion`

---

## Performance Rules

- **Server Components by default** — only add `'use client'` when interaction required
- **No barrel exports** (`index.ts` re-exports) — causes tree-shaking issues
- **Dynamic imports** for heavy components: `const Chart = dynamic(() => import('./Chart'))`
- **Image optimization**: Always use `next/image` with explicit width/height
- **Font optimization**: Use `next/font/google` with `display: 'swap'`
- **Bundle budget**: Total JS < 200KB gzipped for customer pages

---

## What NOT to Generate

- ❌ No `console.log` in production code (use structured logger)
- ❌ No `any` types (use `unknown` and narrow)
- ❌ No `@ts-ignore` or `@ts-expect-error` without explanation comment
- ❌ No inline styles (use Tailwind classes)
- ❌ No `var` (use `const` or `let`)
- ❌ No default exports for non-page files (named exports only)
- ❌ No `process.env.X` directly (import from `env.ts`)
- ❌ No raw SQL strings (use Drizzle query builder)
- ❌ No `fetch` in business logic layer (pure functions only)
- ❌ No test files unless explicitly requested
