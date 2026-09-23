/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : revalidate (route)
 * Scope        : CMS Integration — On-demand Revalidation
 *
 * Description  : Authenticated endpoint the Payload CMS calls after content
 *                changes so the website refreshes the affected cache tags
 *                within seconds instead of waiting for the 1h ISR window.
 *
 * Responsibilities :
 * - Authenticate the caller via a shared REVALIDATE_SECRET
 * - Revalidate the cache tag(s) for the changed collection
 *
 * Features / Functionality :
 * - POST { secret, tag } or { secret, tags: string[] }
 * - revalidateTag(tag, { expire: 0 }) per tag — tags match the CMS collection
 *   slugs used by lib/cms/client.ts — plus revalidatePath('/', 'layout')
 *
 * Tech Stack   : Next.js 16 (Route Handler), TypeScript
 * Layer        : API (Thin)
 *
 * Dependencies : next/cache
 *
 * Notes        :
 * - Reads process.env.REVALIDATE_SECRET directly (must match the CMS value).
 *   It is provisioned as the `RevalidateSecret` SST secret for web only; when it
 *   is absent this route answers 503 and every CMS content edit stays invisible
 *   until the 1h fetch TTL lapses.
 * - Returns 401 on bad/missing secret, 400 on missing tag.
 * - Both purges are needed: revalidateTag drops the tagged cmsFetch Data Cache
 *   entries (the only stale state for dynamically rendered pages such as the
 *   nonce-bearing homepage), revalidatePath drops the Full Route Cache for the
 *   CMS-backed pages that are statically rendered.
 ************************************************************/

import { revalidatePath, revalidateTag } from 'next/cache'

// Tags allowed to be revalidated — these mirror the CMS collection slugs used
// as cache tags in lib/cms/client.ts. Anything else is rejected.
const ALLOWED_TAGS = new Set([
  'testimonial',
  'offer',
  'service-card',
  'service',
  'team',
  'banner',
  'faq',
  'blog',
  'gallery',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET
  if (typeof secret !== 'string' || secret.trim() === '') {
    return Response.json({ success: false, error: 'Revalidation not configured' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isRecord(body) || body.secret !== secret) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Accept a single `tag` or an array of `tags`.
  const requested: string[] = []
  if (typeof body.tag === 'string') {
    requested.push(body.tag)
  }
  if (Array.isArray(body.tags)) {
    for (const t of body.tags) {
      if (typeof t === 'string') {
        requested.push(t)
      }
    }
  }

  const revalidated = requested.filter((t) => ALLOWED_TAGS.has(t))
  if (revalidated.length === 0) {
    return Response.json({ success: false, error: 'No valid tag provided' }, { status: 400 })
  }

  // Purge the fetch Data Cache entries for the changed collection. This is the
  // one that matters for a DYNAMICALLY rendered page: the homepage carries a CSP
  // nonce, so it is `no-store` and has no Full Route Cache entry to drop — the
  // only stale thing is the tagged `cmsFetch` response (1h `revalidate`, tagged
  // with the collection slug in lib/cms/client.ts). `revalidatePath` alone does
  // not target those tags explicitly; it relies on Next's implicit path
  // soft-tags, which is why an owner's banner edit could not reach the hero.
  // `{ expire: 0 }`, NOT the `'max'` profile. Next 16 requires the second
  // argument, and `'max'` keeps serving stale content for a year while it
  // revalidates in the background — the owner would save a banner, reload, still
  // see the old artwork, and conclude it is broken again. `updateTag` would give
  // read-your-own-writes but is Server-Action-only and this is a webhook-driven
  // Route Handler, so `{ expire: 0 }` is the documented equivalent: the next
  // request is a blocking cache miss and returns the new content immediately.
  // Content edits are infrequent and owner-driven, so one slower render is cheap.
  for (const tag of revalidated) {
    revalidateTag(tag, { expire: 0 })
  }

  // Still refresh every route built on the root layout, for the CMS-backed pages
  // that ARE statically rendered (/blog, /gallery, /offers) and therefore need
  // their Full Route Cache entry dropped as well as the underlying fetch.
  revalidatePath('/', 'layout')

  return Response.json({ success: true, revalidated })
}
