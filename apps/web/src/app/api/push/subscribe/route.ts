/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST|DELETE /api/push/subscribe
 * Scope        : API — Customer Notifications
 *
 * Description  : Manages Web Push subscriptions for the authenticated user.
 *                POST upserts a subscription; DELETE deactivates it.
 *
 * Responsibilities :
 * - Store new Web Push subscriptions (upsert by endpoint)
 * - Deactivate existing subscriptions on unsubscribe
 * - Scope all operations to the authenticated user
 *
 * Features / Functionality :
 * - Web Push PushSubscription storage (endpoint, keys, auth)
 * - Upsert semantics (re-subscribe updates existing)
 * - User-scoped deletion (cannot remove other users' subscriptions)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Subscription is bound to user + endpoint (composite uniqueness).
 * - Used for booking status push notifications and admin alerts.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { removePushSubscription, savePushSubscription } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { pushSubscribeSchema } from '@rgss/types'

// POST /api/push/subscribe — store a Web Push subscription for the caller.
// Scoped to the authenticated user (session.user.id); the subscription is
// upserted by endpoint and bound to this user.
export const POST = withErrorHandler(async (req: Request) => {
  const session = await requireSession()

  const body = await req.json().catch(() => null)
  const parsed = pushSubscribeSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  await savePushSubscription(session.user.id, parsed.data)

  return apiSuccess({ ok: true }, undefined, 201)
})

// DELETE /api/push/subscribe — deactivate the caller's push subscription for a
// given endpoint. The endpoint is read from the JSON body. Scoped to the
// authenticated user so one user can never deactivate another's subscription.
export const DELETE = withErrorHandler(async (req: Request) => {
  const session = await requireSession()

  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null
  const endpoint = body?.endpoint
  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
    throw badRequest('A non-empty endpoint is required.')
  }

  await removePushSubscription(session.user.id, endpoint)

  return apiSuccess({ ok: true })
})
