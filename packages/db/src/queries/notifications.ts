/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : notifications
 * Scope        : Data Access — Notifications
 *
 * Description  : Query functions for notification management including creation,
 *                delivery tracking, push subscriptions, and user feed.
 *
 * Responsibilities :
 * - Create notification records for push/email delivery
 * - Fetch user notification feed (paginated, newest first)
 * - Track unread counts and mark notifications as read
 * - Manage Web Push subscriptions (save, remove, list active)
 * - Update notification delivery status (sent/failed)
 *
 * Features / Functionality :
 * - User-scoped notification feed (own rows only)
 * - Bulk or selective mark-as-read with user scoping
 * - Push subscription upsert by endpoint (reactivation on re-subscribe)
 * - Delivery status tracking with sent_at timestamp
 * - User contact resolution for email dispatch
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/auth, ../schema/notification
 *
 * Notes        : Notifications are created with status 'pending'. The dispatch
 *                layer handles actual delivery and updates status to sent/failed.
 ************************************************************/

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { notification, pushSubscription } from '../schema/notification'

type NotificationType = (typeof notification.$inferSelect)['type']
type NotificationStatus = (typeof notification.$inferSelect)['status']
type NewNotification = typeof notification.$inferInsert

type CreateNotificationParams = {
  userId: string
  type: NotificationType
  title: string
  body: string
  channel?: 'push' | 'email'
  bookingId?: string | null
}

// Persist a notification row. Channel defaults to 'push'; status defaults to
// 'pending' (delivery is handled by the dispatch seam in a later phase).
export async function createNotification(params: CreateNotificationParams) {
  const values: NewNotification = {
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    channel: params.channel ?? 'push',
    bookingId: params.bookingId ?? null,
  }

  const [created] = await db.insert(notification).values(values).returning()
  return created as typeof notification.$inferSelect
}

// A user's notification feed, newest first, paginated. Scoped to the user so a
// caller can only ever read their own rows (Property 10).
export async function getNotificationsForUser(userId: string, limit: number, offset: number) {
  return db
    .select()
    .from(notification)
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt))
    .limit(limit)
    .offset(offset)
}

// Count of the user's unread notifications (read_at IS NULL). Returns a number.
export async function getUnreadCount(userId: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)))

  return rows[0]?.count ?? 0
}

// Mark the user's unread notifications read. When `ids` is supplied, only those
// ids are marked (still scoped to the user so one user can't mark another's);
// otherwise all of the user's unread notifications are marked.
export async function markNotificationsRead(userId: string, ids?: string[]) {
  const conditions = [eq(notification.userId, userId), isNull(notification.readAt)]
  if (ids && ids.length > 0) {
    conditions.push(inArray(notification.id, ids))
  }

  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(...conditions))
}

type PushSubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

// Upsert a Web Push subscription by endpoint. `endpoint` has no unique
// constraint, so we look up an existing row and update it (re-binding it to the
// caller and reactivating it) or insert a fresh one. Returns the stored row.
export async function savePushSubscription(userId: string, sub: PushSubscriptionInput) {
  const existing = await db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.endpoint, sub.endpoint))
    .limit(1)

  const found = existing[0]
  if (found) {
    const [updated] = await db
      .update(pushSubscription)
      .set({
        userId,
        p256dhKey: sub.keys.p256dh,
        authKey: sub.keys.auth,
        isActive: true,
      })
      .where(eq(pushSubscription.id, found.id))
      .returning()
    return updated as typeof pushSubscription.$inferSelect
  }

  const [created] = await db
    .insert(pushSubscription)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dhKey: sub.keys.p256dh,
      authKey: sub.keys.auth,
      isActive: true,
    })
    .returning()
  return created as typeof pushSubscription.$inferSelect
}

// Soft-unsubscribe: deactivate the caller's subscription for an endpoint.
export async function removePushSubscription(userId: string, endpoint: string) {
  await db
    .update(pushSubscription)
    .set({ isActive: false })
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)))
}

// All of the caller's active push subscriptions, used by the dispatch seam.
export async function getActivePushSubscriptions(userId: string) {
  return db
    .select()
    .from(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.isActive, true)))
}

// Update a notification's delivery outcome. Called by the dispatch layer after
// attempting Web Push / email delivery: sets `status` ('sent' | 'failed') and,
// when delivery succeeded, stamps `sent_at`. Scoped to the notification id.
export async function markNotificationDelivery(
  id: string,
  status: NotificationStatus,
  sentAt?: Date,
) {
  await db
    .update(notification)
    .set({
      status,
      sentAt: status === 'sent' ? (sentAt ?? new Date()) : null,
    })
    .where(eq(notification.id, id))
}

// Resolve the contact details (email + display name) for a user. Returns null
// when the user no longer exists, so the dispatch layer can skip email delivery
// gracefully without throwing.
export async function getUserContact(userId: string) {
  const rows = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  return rows[0] ?? null
}
