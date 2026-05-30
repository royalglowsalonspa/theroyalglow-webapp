# Coding Standards & Conventions

## Language & Runtime

- **TypeScript strict mode** everywhere — no `any`, no `@ts-ignore` unless explicitly justified
- **Bun** as runtime and package manager (`bun install`, `bun run`, `bunx`)
- All code is ESM (`"type": "module"` in package.json)

---

## File & Folder Naming

- **Files:** `kebab-case.ts` for utilities, `PascalCase.tsx` for React components
- **Folders:** `kebab-case/`
- **Schema files:** `packages/db/schema/{domain}.ts` (e.g., `booking.ts`, `invoice.ts`)
- **Query files:** `packages/db/queries/{domain}.ts`
- **Business logic:** `packages/business/{domain}/{action}.ts`

---

## Code Style (Biome + Ultracite)

- **No ESLint, no Prettier** — use Biome for linting + formatting
- Pre-commit hook: `biome check --write --staged` via Husky + lint-staged
- Single quotes, no semicolons (Biome default)
- Trailing commas in multi-line
- Import sorting handled by Biome

---

## Next.js 16 Patterns

### App Router Conventions

```typescript
// Page props — params and searchParams are Promises in Next.js 16
type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params
  const { book } = await searchParams
  // ...
}
```

### Route Groups

- `(customer)` — Public + authenticated customer pages (header, footer, nav)
- `(auth)` — Auth pages (minimal chrome, centered card)
- `(landing)` — Distraction-free pages (no nav, conversion-optimised)
- `(legal)` — Static legal pages (SSG)
- `admin/` — Admin portal (sidebar, RBAC-gated)

### Component Architecture

- **Server Components by default** — only add `'use client'` when needed
- **Zero business logic in components** — presentation only
- shadcn/ui primitives in `components/ui/`
- Feature components in `components/{domain}/`
- Layout components in `components/layout/`

---

## API Route Pattern

```typescript
// apps/web/app/api/{resource}/route.ts
import { withErrorHandler } from '@/lib/api/error-handler'
import { someSchema } from '@repo/types/{domain}'
import { someBusinessFn } from '@repo/business/{domain}'

export const POST = withErrorHandler(async (req: Request) => {
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

  const result = await someBusinessFn(parsed.data)
  return Response.json({ success: true, data: result }, { status: 201 })
})
```

### Response Shape (ALWAYS)

```typescript
// Success
{ success: true, data: T, meta?: { page, totalPages, totalCount } }

// Error
{ success: false, error: { code, message, statusCode, requestId, retryable?, details? } }
```

---

## Business Logic Layer (`packages/business/`)

- **Pure functions** — no I/O, no framework dependencies
- **Throws AppError** for business rule violations — never catches, let handler layer decide
- Can import from `packages/types/` and `packages/errors/` only
- Functions receive pre-validated data and DB query results as parameters

---

## Data Access Layer (`packages/db/`)

- **Drizzle ORM** — parameterized queries only, NEVER raw SQL concatenation
- Schema in `packages/db/schema/` mirroring `database-schema.md`
- Reusable query builders in `packages/db/queries/`
- Use `nanoid()` or `cuid2()` for all primary keys (text, not serial)
- Money as `integer` in paise (₹1 = 100 paise)
- Timestamps as `timestamptz` (stored UTC, displayed IST)

---

## Validation with Zod

- All schemas in `packages/types/` — shared between client and server
- Use `.safeParse()` in API routes (never `.parse()` which throws unstructured)
- Schemas define the contract — never trust raw client input past the API boundary
- Colocate input schemas with their domain: `packages/types/booking.ts`, `packages/types/lead.ts`

---

## Error Handling

- Use `AppError` class from `packages/errors/app-error.ts`
- All error codes registered in `packages/errors/codes.ts` — no magic strings
- Wrap API routes with `withErrorHandler()` — handles both AppError and unexpected errors
- External service failures → log + Sentry, return `502 UPSTREAM_ERROR`
- Request IDs: `req_${nanoid(12)}` attached in middleware

---

## Environment Variables

- Validated at build time with `@t3-oss/env-nextjs` + Zod in `apps/web/src/env.ts`
- **Never use `process.env` directly** — always import from `env.ts`
- Prefix `NEXT_PUBLIC_` for client-side variables only
- `.env.local` is gitignored — never commit secrets

---

## Styling

- **Tailwind CSS v4** with design tokens from `design/UIUX_Design/`
- Mobile-first (customer pages designed for 375px–428px FIRST)
- Semantic HTML: `<header>`, `<main>`, `<section>`, `<nav>`, `<address>`, `<time>`
- Never `<div onClick>` — use proper interactive elements
- Colour contrast: 4.5:1 normal text, 3:1 large text (WCAG 2.1 AA)
- All animations respect `prefers-reduced-motion`

---

## Accessibility (Non-Negotiable)

- WCAG 2.1 AA compliance on ALL pages
- Lighthouse Accessibility = 100 required to merge
- Skip links, ARIA labels, visible focus rings, focus trap in modals
- Every `<input>` has a `<label>`, `aria-required` where needed
- `aria-live` on dynamic content updates
- Keyboard navigation through entire booking flow

---

## Testing

- **Unit/Integration:** Vitest + @faker-js/faker + MSW
- **Component:** Vitest + React Testing Library
- **E2E:** Playwright (chromium + other browsers)
- **Performance:** Lighthouse CI (≥95 perf, 100 a11y/SEO/best-practices)
- No test files committed unless explicitly requested

---

## Security Checklist

- Zod validation on EVERY API route input
- `@upstash/ratelimit` per-endpoint sliding windows
- CSP headers with nonce-based script loading
- CORS: exact origin matching (`theroyalglow.in` only)
- File uploads: type whitelist (jpg/png/webp/pdf), 10 MB max
- Webhook verification: HMAC signature check on all inbound webhooks
- No `dangerouslySetInnerHTML` without sanitisation

---

## Currency & Date Display

```typescript
// Currency — Indian numbering (₹1,00,000.00 not ₹100,000.00)
import { formatINR } from '@repo/business/utils/currency'
formatINR(100000) // → "₹1,000.00"

// Date — DD/MM/YYYY Indian format
import { formatDateIN } from '@repo/business/utils/date'
formatDateIN(new Date()) // → "30/05/2026"
```

---

## Commit Messages

Use **Conventional Commits**:
```
feat: add booking confirmation email
fix: correct availability calculation for same-day slots
chore: update dependencies
docs: update testing plan
refactor: extract pricing logic to service layer
```
