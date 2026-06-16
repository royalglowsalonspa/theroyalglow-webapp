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
 * - Maps to revalidateTag(); tags match the CMS collection slugs
 *
 * Tech Stack   : Next.js 16 (Route Handler), TypeScript
 * Layer        : API (Thin)
 *
 * Dependencies : next/cache
 *
 * Notes        :
 * - Reads process.env.REVALIDATE_SECRET directly (must match the CMS value).
 * - Returns 401 on bad/missing secret, 400 on missing tag.
 ************************************************************/

import { revalidatePath } from 'next/cache'

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

  // Revalidate every route that uses the root layout. Content edits are
  // infrequent (owner-driven), so refreshing the whole site is simpler and
  // more reliable than per-tag path mapping — and guarantees the changed
  // content appears everywhere it is used (homepage, /offers, /services, etc.).
  revalidatePath('/', 'layout')

  return Response.json({ success: true, revalidated })
}
