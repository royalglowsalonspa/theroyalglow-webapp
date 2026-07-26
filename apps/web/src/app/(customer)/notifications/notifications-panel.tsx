/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 07-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : NotificationsPanel
 * Scope        : Notifications UI
 *
 * Description  : Full-page notifications list. Fetches the customer's
 *                notifications, renders them with relative timestamps and
 *                unread highlighting, and supports mark-all-read.
 *
 * Responsibilities :
 * - Load GET /api/notifications on mount
 * - Render loading, empty, and populated states
 * - Mark all notifications read via PATCH
 *
 * Features / Functionality :
 * - Unread highlighting with golden-mist tint + dot marker
 * - Relative timestamps (just now, Xm, Xh, Xd, then DD/MM/YYYY)
 * - Resilient to network blips (keeps last known state)
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : react
 *
 * Notes        : Mirrors the data shape of the former header bell.
 ************************************************************/

'use client'

import { Bell } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface NotificationRow {
  id: string
  type: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

// Compact relative time, falling back to DD/MM/YYYY (en-IN) for older items.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) {
    return ''
  }
  const mins = Math.floor((Date.now() - then) / 60_000)
  if (mins < 1) {
    return 'just now'
  }
  if (mins < 60) {
    return `${mins}m ago`
  }
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  if (days < 7) {
    return `${days}d ago`
  }
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export function NotificationsPanel() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { headers: { accept: 'application/json' } })
      const json = await res.json()
      if (res.ok && json.success) {
        setNotifications(json.data.notifications as NotificationRow[])
        setUnreadCount(json.data.unreadCount as number)
      }
    } catch {
      // Network blip — keep the last known state.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const markAllRead = useCallback(async () => {
    // Optimistic: clear unread immediately, then reconcile with the server.
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    )
    setUnreadCount(0)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    } catch {
      // ignore — a refresh will reconcile
    }
  }, [])

  return (
    <div className="mx-auto max-w-[680px] px-5 py-10 lg:py-14">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
            Your activity
          </p>
          <h1 className="font-display font-black text-[clamp(32px,5vw,48px)] text-cocoa-dark tracking-tight leading-[1.05]">
            Notifications
          </h1>
        </div>
        {unreadCount > 0 && (
          <Button
            type="button"
            variant="link"
            onClick={markAllRead}
            className="h-auto shrink-0 p-0 font-ui text-sm font-bold text-deep-gold hover:text-cocoa-dark"
          >
            Mark all read
          </Button>
        )}
      </header>

      {loading ? (
        <ul className="flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Skeleton className="h-20 w-full" />
            </li>
          ))}
        </ul>
      ) : notifications.length === 0 ? (
        <Card className="items-center bg-warm-cream px-6 py-14 text-center">
          <span
            className="flex size-14 items-center justify-center rounded-full bg-canvas-white text-deep-gold shadow-card-hover"
            aria-hidden="true"
          >
            <Bell className="size-7" strokeWidth={1.75} />
          </span>
          <h2 className="mt-5 font-display text-[22px] tracking-tight text-cocoa-dark">
            You're all caught up
          </h2>
          <p className="mt-2 max-w-[42ch] font-sans text-[15px] leading-relaxed text-warm-gray">
            Booking updates, reminders, and offers will appear here.
          </p>
        </Card>
      ) : (
        <ul className="divide-y divide-cloud-gray rounded-[6px] border border-cloud-gray bg-canvas-white">
          {notifications.map((n) => {
            const unread = n.readAt === null
            return (
              <li key={n.id} className={`px-5 py-4 ${unread ? 'bg-golden-mist/30' : ''}`}>
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-deep-gold' : 'bg-transparent'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p
                        className={`font-ui text-sm text-cocoa-dark ${unread ? 'font-bold' : 'font-medium'}`}
                      >
                        {n.title}
                      </p>
                      <time
                        className="shrink-0 font-ui text-[11px] text-dusty-gray"
                        dateTime={n.createdAt}
                      >
                        {relativeTime(n.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1 font-sans text-sm leading-relaxed text-warm-gray">
                      {n.body}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
