---
name: next-best-practices
description: Next.js best practices - file conventions, RSC boundaries, data patterns, async APIs, metadata, error handling, route handlers, image/font optimization, bundling
---

# Next.js Best Practices

Apply these rules when writing or reviewing Next.js code.

## File Conventions

- Use `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` as special files
- Route segments: dynamic `[id]`, catch-all `[...slug]`, optional catch-all `[[...slug]]`
- Route groups `(group)` for logical organization without URL impact
- Parallel routes `@slot` for simultaneous rendering
- Intercepting routes `(.)`, `(..)`, `(...)` for modals
- Middleware renamed to `proxy` in v16

## RSC Boundaries

- Server Components are the default - only add `'use client'` when needed
- Async client components are INVALID - never use `async function` with `'use client'`
- Props passed to client components must be serializable (no functions, no classes, no Dates)
- Server Actions (`'use server'`) are the exception - can be passed as props

## Async Patterns (Next.js 15+)

```typescript
// params and searchParams are Promises in Next.js 15+
type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params
  const { page } = await searchParams
}

// cookies() and headers() are async
const cookieStore = await cookies()
const headersList = await headers()
```

## Runtime Selection

- Default to Node.js runtime (full API access, all npm packages)
- Edge runtime only for: middleware/proxy, latency-critical responses, simple logic
- Edge cannot use: Node.js APIs, most npm packages, large bundles

## Directives

- `'use client'` - marks the boundary where server -> client transition happens
- `'use server'` - marks functions as Server Actions (can be called from client)
- `'use cache'` - Next.js cache directive for Cache Components (Next.js 16+)

## Error Handling

- `error.tsx` catches errors within a route segment (must be client component)
- `global-error.tsx` catches root layout errors
- `not-found.tsx` renders for `notFound()` calls and unmatched routes
- Use `redirect()`, `permanentRedirect()`, `notFound()` for control flow
- `forbidden()`, `unauthorized()` for auth errors
- `unstable_rethrow()` in catch blocks to not swallow Next.js internal errors

## Data Patterns

- Fetch data in Server Components (no client-side fetching for initial data)
- Use Server Actions for mutations (forms, button clicks)
- Route Handlers for: webhooks, third-party API proxies, non-React consumers
- Avoid waterfalls: use `Promise.all`, parallel data fetching, Suspense boundaries
- Preload pattern: call fetch function early, consume later

## Route Handlers

- Define in `route.ts` (cannot coexist with `page.tsx` at same path)
- Export named functions: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- No React DOM available - pure request/response
- GET handlers are cached by default (opt out with `dynamic = 'force-dynamic'` or reading request)

## Metadata & OG Images

```typescript
// Static metadata
export const metadata: Metadata = { title: 'Page Title', description: '...' }

// Dynamic metadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const data = await getData(id)
  return { title: data.title }
}
```

- File-based: `opengraph-image.tsx`, `favicon.ico`, `sitemap.ts`, `robots.ts`
- OG images generated with `next/og` (ImageResponse)

## Image Optimization

- ALWAYS use `next/image` over `<img>` tag
- Configure `remotePatterns` in `next.config.ts` for external images
- Set responsive `sizes` attribute for correct image selection
- Use `placeholder="blur"` with `blurDataURL` for loading states
- Add `priority` to LCP images (hero, above-the-fold)

## Font Optimization

- Use `next/font` for automatic optimization and self-hosting
- Google Fonts: `import { Inter } from 'next/font/google'`
- Local fonts: `import localFont from 'next/font/local'`
- Apply via CSS variable for Tailwind integration
- Always specify `subsets: ['latin']` to reduce payload

## Suspense Boundaries

- `useSearchParams()` in client components causes CSR bailout - wrap in Suspense
- `usePathname()` may also need Suspense boundary
- Always provide meaningful fallback UI in Suspense

## Self-Hosting

- Use `output: 'standalone'` for Docker deployments
- Configure custom cache handler for multi-instance ISR
- Image optimization works with `sharp` (install separately)
