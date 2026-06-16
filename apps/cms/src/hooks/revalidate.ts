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
 * - Fire-and-forget; logs a warning on failure, never throws
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

import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

async function ping(tag: string): Promise<void> {
  const webAppUrl = process.env.WEB_APP_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!webAppUrl || !secret) {
    return
  }

  try {
    await fetch(`${webAppUrl.replace(/\/$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, tag }),
    })
  } catch (error) {
    // Never block the CMS write on a revalidation failure.
    console.warn(`[revalidate] failed to ping web app for tag "${tag}":`, error)
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
    void ping(tag)
    return doc
  }
  const afterDelete: CollectionAfterDeleteHook = ({ doc }) => {
    void ping(tag)
    return doc
  }
  return { afterChange: [afterChange], afterDelete: [afterDelete] }
}
