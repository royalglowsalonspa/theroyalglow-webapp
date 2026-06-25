/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Waitlist Queue
 * Scope        : Admin Portal — Waitlist Management
 *
 * Description  : Interactive waitlist queue with notify / mark-booked / cancel
 *                actions. Lists customers waiting for a preferred slot, filtered
 *                by status tab, with pagination.
 *
 * Responsibilities :
 * - Fetch and display waitlist entries filtered by status tab
 * - Provide notify / mark-booked / cancel actions per entry
 * - Surface loading / error / empty states accessibly
 *
 * Features / Functionality :
 * - Status tabs (waiting, notified, all)
 * - List cards: customer, requested service/date/time window, status badge
 * - Inline status-transition actions calling PATCH /api/waitlist/[id]
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Queue Management Component)
 *
 * Dependencies : admin bookings lib (formatDateDDMMYYYY, formatTime12h), React hooks
 *
 * Notes        :
 * - Entries are status-transitioned, never hard-deleted.
 ************************************************************/

'use client'

import { formatDateDDMMYYYY, formatTime12h } from '@/lib/admin/bookings'
import { useCallback, useEffect, useState } from 'react'

// ─── API shapes (mirror GET /api/waitlist + PATCH /api/waitlist/[id]) ───

type WaitlistStatus = 'waiting' | 'notified' | 'booked' | 'expired' | 'cancelled'

interface WaitlistEntry {
  id: string
  customerId: string
  customerName: string
  customerEmail: string
  serviceId: string
  serviceName: string
  serviceType: 'salon' | 'spa'
  categoryName: string
  preferredStaffId: string | null
  preferredDate: string
  preferredTimeStart: string | null
  preferredTimeEnd: string | null
  status: WaitlistStatus
  notifiedAt: string | null
  createdAt: string
}

const TABS = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'notified', label: 'Notified' },
  { value: 'all', label: 'All' },
] as const

type TabValue = (typeof TABS)[number]['value']

const STATUS_STYLES: Record<WaitlistStatus, string> = {
  waiting: 'bg-amber-100 text-amber-800',
  notified: 'bg-blue-100 text-blue-700',
  booked: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-cloud-gray text-warm-gray',
  cancelled: 'bg-red-100 text-red-700',
}

const SERVICE_TYPE_LABEL: Record<string, string> = {
  salon: 'Salon',
  spa: 'SPA',
}

export function WaitlistQueue() {
  const [tab, setTab] = useState<TabValue>('waiting')
  const [entries, setEntries] = useState<WaitlistEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = tab === 'all' ? '' : `?status=${tab}`
      const res = await fetch(`/api/waitlist${qs}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load the waitlist.')
      }
      setEntries(json.data.entries as WaitlistEntry[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load the waitlist.')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-cocoa-dark tracking-tight">Waitlist</h1>
        <p className="font-sans text-sm text-dusty-gray mt-0.5">
          Customers waiting for a preferred slot. Notify them when one opens up, then mark booked
          once they confirm.
        </p>
      </div>

      {/* Status tabs */}
      <div
        className="flex flex-wrap gap-1 border-b border-cloud-gray"
        role="tablist"
        aria-label="Waitlist status"
      >
        {TABS.map((t) => {
          const active = tab === t.value
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.value)}
              className={`-mb-px px-4 py-2 text-sm font-ui transition-colors border-b-2 ${
                active
                  ? 'border-deep-gold text-cocoa-dark'
                  : 'border-transparent text-warm-gray hover:text-cocoa-dark'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !entries || entries.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <WaitlistCard entry={entry} onChanged={load} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function WaitlistCard({
  entry,
  onChanged,
}: {
  entry: WaitlistEntry
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const transition = async (status: WaitlistStatus) => {
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/waitlist/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not update the entry.')
      }
      onChanged()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not update the entry.')
    } finally {
      setBusy(false)
    }
  }

  const canNotify = entry.status === 'waiting'
  const canBook = entry.status === 'notified'
  const canCancel = entry.status === 'waiting' || entry.status === 'notified'
  const hasActions = canNotify || canBook || canCancel

  const timeWindow = formatTimeWindow(entry.preferredTimeStart, entry.preferredTimeEnd)

  return (
    <article className="rounded-[6px] border border-cloud-gray bg-canvas-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-sans text-[15px] text-cocoa-dark">
            {entry.customerName}
            <span className="text-dusty-gray">
              {' · '}
              {entry.serviceName}
            </span>
          </h2>
          <p className="font-sans text-sm text-warm-gray mt-0.5">
            {SERVICE_TYPE_LABEL[entry.serviceType] ?? entry.serviceType}
            {' · '}
            {entry.categoryName}
          </p>
          <p className="font-sans text-sm text-warm-gray mt-0.5">
            <time dateTime={entry.preferredDate}>{formatDateDDMMYYYY(entry.preferredDate)}</time>
            {timeWindow && (
              <>
                {' · '}
                {timeWindow}
              </>
            )}
          </p>
          <p className="font-sans text-xs text-dusty-gray mt-1.5">
            Added <time dateTime={entry.createdAt}>{formatDateDDMMYYYY(entry.createdAt)}</time>
          </p>
        </div>

        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-ui uppercase tracking-[0.5px] whitespace-nowrap ${
            STATUS_STYLES[entry.status] ?? 'bg-cloud-gray text-warm-gray'
          }`}
        >
          {entry.status}
        </span>
      </div>

      {actionError && (
        <p className="font-sans text-sm text-error mt-3" role="alert">
          {actionError}
        </p>
      )}

      {hasActions && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-cloud-gray pt-3">
          {canNotify && (
            <button
              type="button"
              onClick={() => transition('notified')}
              disabled={busy}
              className="h-9 px-4 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? 'Working…' : 'Notify'}
            </button>
          )}
          {canBook && (
            <button
              type="button"
              onClick={() => transition('booked')}
              disabled={busy}
              className="h-9 px-4 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? 'Working…' : 'Mark booked'}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => transition('cancelled')}
              disabled={busy}
              className="h-9 px-4 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-warm-gray hover:bg-cloud-gray transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </article>
  )
}

// "10:00" + "12:00" → "10:00 AM – 12:00 PM"; a lone bound renders alone; none → ''.
function formatTimeWindow(start: string | null, end: string | null): string {
  if (start && end) {
    return `${formatTime12h(start)} – ${formatTime12h(end)}`
  }
  if (start) {
    return `from ${formatTime12h(start)}`
  }
  if (end) {
    return `until ${formatTime12h(end)}`
  }
  return ''
}

function LoadingState() {
  return (
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading the waitlist…</span>
    </output>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="border border-error/40 bg-error/5 rounded-[6px] px-5 py-10 text-center">
      <p className="font-sans text-sm text-error mb-3" role="alert">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
      >
        Try Again
      </button>
    </div>
  )
}

function EmptyState({ tab }: { tab: TabValue }) {
  const label = tab === 'all' ? '' : tab
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 text-center">
      <p className="font-sans text-sm text-cocoa-dark mb-1">No {label} waitlist entries</p>
      <p className="font-sans text-xs text-dusty-gray">
        Customers waiting for a preferred slot will appear here.
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-deep-gold"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
