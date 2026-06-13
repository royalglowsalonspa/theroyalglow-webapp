---
name: next-cache-components
description: Next.js 16 Cache Components - PPR, use cache directive, cacheLife, cacheTag, updateTag
---

# Cache Components (Next.js 16+)

Cache Components enable Partial Prerendering (PPR) - mix static, cached, and dynamic content in a single route.

## Enable Cache Components

```ts
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true,
}
```

This replaces the old `experimental.ppr` flag.

## Three Content Types

### 1. Static (Auto-Prerendered)
Synchronous code, imports, pure computations - prerendered at build time.

### 2. Cached (`use cache`)
Async data that doesn't need fresh fetches every request:
```tsx
async function BlogPosts() {
  'use cache'
  cacheLife('hours')
  const posts = await db.posts.findMany()
  return <PostList posts={posts} />
}
```

### 3. Dynamic (Suspense)
Runtime data that must be fresh - wrap in Suspense:
```tsx
<Suspense fallback={<p>Loading...</p>}>
  <UserPreferences />
</Suspense>
```

## `use cache` Directive

Works at file level, component level, or function level:
```tsx
// Function level
async function getData() {
  'use cache'
  return db.query('SELECT * FROM posts')
}
```

## Cache Profiles

Built-in: `'default'`, `'minutes'`, `'hours'`, `'days'`, `'weeks'`, `'max'`

```tsx
import { cacheLife } from 'next/cache'

async function getData() {
  'use cache'
  cacheLife('hours')
  return fetch('/api/data')
}
```

### Inline Configuration
```tsx
cacheLife({
  stale: 3600,      // 1 hour - serve stale while revalidating
  revalidate: 7200, // 2 hours - background revalidation interval
  expire: 86400,    // 1 day - hard expiration
})
```

## Cache Invalidation

### `cacheTag()` - Tag Cached Content
```tsx
import { cacheTag } from 'next/cache'

async function getProducts() {
  'use cache'
  cacheTag('products')
  return db.products.findMany()
}
```

### `updateTag()` - Immediate Invalidation (same request sees fresh data)
```tsx
import { updateTag } from 'next/cache'

export async function updateProduct(id: string, data: FormData) {
  await db.products.update({ where: { id }, data })
  updateTag(`product-${id}`)
}
```

### `revalidateTag()` - Background Revalidation (next request sees fresh data)
```tsx
import { revalidateTag } from 'next/cache'

export async function createPost(data: FormData) {
  await db.posts.create({ data })
  revalidateTag('posts')
}
```

## Runtime Data Constraint

Cannot access `cookies()`, `headers()`, or `searchParams` inside `use cache`.

**Solution: Pass as arguments:**
```tsx
async function ProfilePage() {
  const session = (await cookies()).get('session')?.value
  return <CachedProfile sessionId={session} />
}

async function CachedProfile({ sessionId }: { sessionId: string }) {
  'use cache'
  const data = await fetchUserData(sessionId)
  return <div>{data.name}</div>
}
```

**Exception:** `'use cache: private'` allows runtime APIs for compliance.

## Migration from Previous Versions

| Old Config | Replacement |
|-----------|-------------|
| `experimental.ppr` | `cacheComponents: true` |
| `dynamic = 'force-static'` | `'use cache'` + `cacheLife('max')` |
| `revalidate = N` | `cacheLife({ revalidate: N })` |
| `unstable_cache()` | `'use cache'` directive |

## Limitations

- Edge runtime not supported - requires Node.js
- Static export not supported - needs server
- Non-deterministic values (`Math.random()`, `Date.now()`) execute once at build time inside `use cache`
