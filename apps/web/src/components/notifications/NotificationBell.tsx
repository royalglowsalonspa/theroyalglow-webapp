/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : NotificationBell
 * Scope        : Notifications UI
 *
 * Description  : Header notification bell with unread badge, dropdown panel,
 *                polling, and mark-all-read functionality.
 *
 * Responsibilities :
 * - Poll GET /api/notifications every 30s for updates
 * - Display unread count badge on bell icon
 * - Render dropdown with notification list and timestamps
 * - Provide mark-all-read action via PATCH
 * - Close dropdown on outside click and Escape
 *
 * Features / Functionality :
 * - Unread badge with 9+ cap
 * - Relative timestamp formatting (just now, Xm, Xh, Xd, DD/MM/YYYY)
 * - Unread highlighting with golden-mist background
 * - Auto-hide until first successful authenticated fetch
 * - 30-second polling interval
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS
 * Layer        : Frontend
 *
 * Dependencies : None
 *
 * Notes        : None
 ************************************************************/

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Mirror GET /api/notifications → apiSuccess({ notifications, unreadCount }).
interface NotificationRow {
  id: string
  type: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

const POLL_INTERVAL_MS = 30_000

// Compact relative time, falling back to DD/MM/YYYY for older items.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) {
    return ''
  }
  const diffMs = Date.now() - then
  const mins = Math.floor(diffMs / 60_000)
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

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  // Hidden until the first successful fetch confirms an authenticated session.
  const [available, setAvailable] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', {
        headers: { accept: 'application/json' },
      })
      if (res.status === 401) {
        setAvailable(false)
        return
      }
      const json = await res.json()
      if (!res.ok || !json.success) {
        return
      }
      setAvailable(true)
      setNotifications(json.data.notifications as NotificationRow[])
      setUnreadCount(json.data.unreadCount as number)
    } catch {
      // Network blip — keep the last known state and retry on the next poll.
    }
  }, [])

  // Initial load + polling.
  useEffect(() => {
    load()
    const timer = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) {
      return
    }
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const markAllRead = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        )
        setUnreadCount(0)
      }
    } catch {
      // ignore — next poll will reconcile
    }
  }, [])

  if (!available) {
    return null
  }

  const badge = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-warm-gray hover:bg-cloud-gray transition-colors"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-ui text-canvas-white"
            aria-hidden="true"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        // biome-ignore lint/a11y/useSemanticElements: non-modal notification popover; native <dialog> implies modal showModal() semantics which are wrong for a dropdown.
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[6px] border border-cloud-gray bg-canvas-white shadow-xl z-50"
        >
          <div className="flex items-center justify-between gap-2 border-b border-cloud-gray px-4 py-3">
            <span className="font-ui text-sm text-cocoa-dark">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="font-ui text-xs text-deep-gold hover:text-cocoa-dark transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-10 text-center font-sans text-sm text-dusty-gray">
                No notifications yet.
              </p>
            ) : (
              <ul className="divide-y divide-cloud-gray">
                {notifications.map((n) => {
                  const unread = n.readAt === null
                  return (
                    <li key={n.id} className={`px-4 py-3 ${unread ? 'bg-golden-mist/30' : ''}`}>
                      <div className="flex items-start gap-2">
                        {unread && (
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-deep-gold"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0">
                          <p
                            className={`font-ui text-sm text-cocoa-dark ${unread ? 'font-medium' : ''}`}
                          >
                            {n.title}
                          </p>
                          <p className="font-sans text-xs text-warm-gray mt-0.5">{n.body}</p>
                          <p className="font-ui text-[11px] text-dusty-gray mt-1">
                            {relativeTime(n.createdAt)}
                          </p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
