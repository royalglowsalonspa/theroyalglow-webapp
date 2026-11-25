/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : revalidate (hooks)
 * Scope        : CMS Integration — On-demand Revalidation
 *
 * Description  : Collection hooks that notify the website to revalidate the
 *                cache tag for a collection whenever a document is created,
 *                updated, or deleted — so site content refreshes in seconds.
 *
 * Responsibilities :
 * - POST the changed collection's tag to WEB_APP_URL/api/revalidate
 * - Authenticate via the shared REVALIDATE_SECRET
 * - Never block or fail the Payload write on a revalidation error
 *
 * Features / Functionality :
 * - revalidateHooks(tag) → { afterChange, afterDelete } for a collection
 * - Runs after the CMS HTTP response and logs unsuccessful invalidation
 *
 * Tech Stack   : Payload CMS v3, TypeScript
 * Layer        : CMS (Hooks)
 *
 * Dependencies : payload (types)
 *
 * Notes        :
 * - No-ops when WEB_APP_URL or REVALIDATE_SECRET is unset (e.g. local without
 *   the web app running) so admin saves never error.
 ************************************************************/

import { after } from 'next/server'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

async function ping(webAppUrl: string, secret: string, tag: string): Promise<void> {
  try {
    const response = await fetch(`${webAppUrl.replace(/\/$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, tag }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) {
      console.warn(`[revalidate] web app rejected the "${tag}" refresh (${response.status})`)
    }
  } catch {
    console.warn(`[revalidate] request failed for tag "${tag}"`)
  }
}

function schedulePing(tag: string): void {
  const webAppUrl = process.env.WEB_APP_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!webAppUrl || !secret) return

  try {
    // Payload commits after the collection hooks. Delay invalidation until the
    // request finishes so the next site fetch can see the committed content.
    after(() => ping(webAppUrl, secret, tag))
  } catch {
    // Local CLI operations have no Next.js request. The cache TTL still applies.
    console.warn(`[revalidate] could not schedule the "${tag}" refresh after this operation`)
  }
}

/**
 * Build afterChange/afterDelete hooks that revalidate the given cache tag
 * (which must match the tag used by the web app's lib/cms/client.ts).
 */
export function revalidateHooks(tag: string): {
  afterChange: CollectionAfterChangeHook[]
  afterDelete: CollectionAfterDeleteHook[]
} {
  const afterChange: CollectionAfterChangeHook = ({ doc }) => {
    schedulePing(tag)
    return doc
  }
  const afterDelete: CollectionAfterDeleteHook = ({ doc }) => {
    schedulePing(tag)
    return doc
  }
  return { afterChange: [afterChange], afterDelete: [afterDelete] }
}
