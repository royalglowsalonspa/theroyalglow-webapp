/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : notification (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for Web Push subscriptions and
 *                notification read-marking.
 *
 * Responsibilities :
 * - Validate push subscription registration (endpoint + keys)
 * - Validate mark-as-read requests (specific IDs or all)
 *
 * Features / Functionality :
 * - pushSubscribeSchema — browser PushManager subscription data
 * - markReadSchema — batch or full mark-read
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : None
 ************************************************************/
import { z } from 'zod'

/** Web Push destinations for Chromium, Firefox, Safari, and Edge on Windows. */
export function normalizeWebPushEndpoint(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) {
    return null
  }
  const supported =
    url.hostname === 'fcm.googleapis.com' ||
    url.hostname === 'updates.push.services.mozilla.com' ||
    url.hostname === 'push.services.mozilla.com' ||
    url.hostname.endsWith('.push.apple.com') ||
    url.hostname.endsWith('.notify.windows.com')
  // URL serialization yields the ASCII form used by the provider and index.
  const canonical = url.href
  return supported && canonical.length <= 2048 ? canonical : null
}

export const pushSubscribeSchema = z.object({
  endpoint: z.string().transform((value, ctx) => {
    const endpoint = normalizeWebPushEndpoint(value)
    if (endpoint) return endpoint
    ctx.addIssue({ code: 'custom', message: 'Use an HTTPS endpoint from a supported browser.' })
    return z.NEVER
  }),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>

// Mark notifications read. Omit `ids` to mark all of the caller's notifications read.
export const markReadSchema = z.object({
  ids: z.array(z.string().min(1)).optional(),
})
export type MarkReadInput = z.infer<typeof markReadSchema>
