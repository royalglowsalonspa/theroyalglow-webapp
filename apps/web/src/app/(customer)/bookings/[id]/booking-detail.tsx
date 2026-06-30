/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingDetail
 * Scope        : Booking Management
 *
 * Description  : Client component that fetches and renders a single customer
 *                booking. Shows a status timeline, the service snapshot list,
 *                date/time and total, and offers cancel + reschedule actions
 *                gated by the booking's status and reschedule eligibility.
 *
 * Responsibilities :
 * - Fetch the booking from GET /api/bookings/[id] on mount
 * - Present loading, not-found, and error states (aria-live)
 * - Render booking number, status badge + timeline, date/time, services, total
 * - Cancel (POST /cancel) for pending/confirmed bookings
 * - Reschedule (POST /reschedule) gated by reschedule eligibility, then refresh
 *
 * Features / Functionality :
 * - Status timeline derived from lifecycle timestamps (booked/confirmed/…)
 * - Inline reschedule panel (date + 30-min slot grid mirroring availability)
 * - Surfaces error.message from the response envelope on action failure
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : @rgss/business (formatINR, checkReschedulable), React hooks
 *
 * Notes        :
 * - Presentation only — all business rules live in the API + business layer.
 * - Dates/times are sliced from the wire value to stay timezone-safe.
 ************************************************************/

'use client'

import { useBookingStatus } from '@/components/realtime/RealtimeProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkReschedulable, formatINR } from '@rgss/business'
import { Loader2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

// --- Types (mirror GET /api/bookings/[id] → data.booking) ---
interface BookingServiceRow {
  id: string
  serviceNameSnapshot: string
  priceAtBookingPaise: number
  durationMinutes: number
  displayOrder: number
}

interface Booking {
  id: string
  bookingNumber: string
  status: string
  serviceType: 'salon' | 'spa'
  bookingDate: string
  startTime: string
  endTime: string
  totalAmountPaise: number
  totalDurationMinutes: number
  rescheduleCount: number
  notes: string | null
  confirmedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  createdAt: string
  services: BookingServiceRow[]
}

const CANCELLABLE_STATUSES = new Set(['pending', 'confirmed'])

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  no_show: 'No Show',
}

const DEFAULT_STATUS_STYLE = { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }

// Status badge colours per spec:
// pending=amber, confirmed=green, in_progress=blue, completed=gray,
// cancelled=red, rejected=red, no_show=dark red.
const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  in_progress: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  no_show: { bg: 'bg-red-100', text: 'text-red-900', dot: 'bg-red-800' },
}

// Slot grid mirrors GET /api/availability and the reschedule business rule:
// 10:00 open, 30-min slots, last start 20:30. The server still validates that
// the full service duration finishes before close (21:00).
const SLOT_OPTIONS: string[] = (() => {
  const slots: string[] = []
  for (let mins = 10 * 60; mins <= 20 * 60 + 30; mins += 30) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return slots
})()

// --- Formatting helpers (timezone-safe: operate on the wire string) ---

// "2026-05-24T00:00:00.000Z" or "2026-05-24" → "24/05/2026"
function formatDateDDMMYYYY(value: string): string {
  const datePart = value.slice(0, 10)
  const [y, m, d] = datePart.split('-')
  if (y && m && d) return `${d}/${m}/${y}`
  return value
}

// "15:30" or "15:30:00" → "03:30 PM"
function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const m = mStr ?? '00'
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${String(h12).padStart(2, '0')}:${m} ${period}`
}

// "2026-05-24T09:30:00.000Z" → "24/05/2026, 03:00 PM" (IST display)
function formatTimestampIST(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

// Today in IST (UTC+5:30) as YYYY-MM-DD — matches the reschedule API's past-date guard.
function todayInIST(): string {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return istNow.toISOString().slice(0, 10)
}

interface TimelineEntry {
  label: string
  at: string
  tone: 'done' | 'cancelled'
}

// Build an ordered list of lifecycle events from the timestamps present on the
// booking. Only events that have actually happened are shown.
function buildTimeline(booking: Booking): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { label: 'Booking placed', at: booking.createdAt, tone: 'done' },
  ]
  if (booking.confirmedAt) {
    entries.push({ label: 'Confirmed', at: booking.confirmedAt, tone: 'done' })
  }
  if (booking.completedAt) {
    entries.push({ label: 'Completed', at: booking.completedAt, tone: 'done' })
  }
  if (booking.cancelledAt) {
    entries.push({ label: 'Cancelled', at: booking.cancelledAt, tone: 'cancelled' })
  }
  if (booking.rejectedAt) {
    entries.push({ label: 'Rejected', at: booking.rejectedAt, tone: 'cancelled' })
  }
  return entries
}

export function BookingDetail({
  id,
  viewerUserId,
}: {
  id: string
  viewerUserId?: string | null
}) {
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const [cancelling, setCancelling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState(SLOT_OPTIONS[0] ?? '10:00')
  const [rescheduling, setRescheduling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotFound(false)
    try {
      const res = await fetch(`/api/bookings/${id}`)
      const json = await res.json()
      if (res.status === 404) {
        setNotFound(true)
        return
      }
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load this booking.')
      }
      setBooking(json.data.booking as Booking)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load this booking.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Live updates: the server publishes booking events to the viewer's own
  // `customer:{userId}:bookings` channel (the channel the customer token
  // authorises), each stamped with `data.bookingId`. The hook subscribes to
  // that channel, filters to THIS booking, and re-fetches the authoritative
  // detail so the status badge + timeline update in place. No-ops when realtime
  // is unavailable or the viewer id is absent — the page already loads via fetch
  // and the user can still refresh manually.
  useBookingStatus(viewerUserId, id, () => {
    load()
  })

  const handleCancel = useCallback(async () => {
    setCancelling(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not cancel this booking.')
      }
      await load()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not cancel this booking.')
    } finally {
      setCancelling(false)
    }
  }, [id, load])

  const handleReschedule = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setRescheduling(true)
      setActionError(null)
      try {
        const res = await fetch(`/api/bookings/${id}/reschedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingDate: rescheduleDate, startTime: rescheduleTime }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not reschedule this booking.')
        }
        setShowReschedule(false)
        await load()
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'Could not reschedule this booking.')
      } finally {
        setRescheduling(false)
      }
    },
    [id, load, rescheduleDate, rescheduleTime],
  )

  const rescheduleEligible = useMemo(() => {
    if (!booking) return false
    return checkReschedulable({
      status: booking.status,
      rescheduleCount: booking.rescheduleCount,
    }).ok
  }, [booking])

  if (loading) {
    return (
      <output className="flex items-center gap-3 py-16" aria-live="polite">
        <Loader2 className="size-5 animate-spin text-deep-gold" aria-hidden="true" />
        <span className="font-sans text-[15px] text-dusty-gray">Loading booking…</span>
      </output>
    )
  }

  if (notFound) {
    return (
      <Card className="mt-8 px-5 py-10 text-center">
        <p className="mb-2 font-display text-[22px] text-cocoa-dark">Booking not found</p>
        <p className="font-sans text-[15px] text-warm-gray" role="alert">
          We couldn&apos;t find this booking. It may have been removed, or the link is incorrect.
        </p>
      </Card>
    )
  }

  if (error || !booking) {
    return (
      <div className="mt-8 rounded-[6px] border border-error/40 bg-error/5 px-5 py-6 text-center">
        <p className="mb-3 font-sans text-[15px] text-error" role="alert">
          {error ?? 'Could not load this booking.'}
        </p>
        <Button
          type="button"
          variant="gold"
          onClick={load}
          className="rounded-full font-ui text-[12px] uppercase tracking-[0.5px]"
        >
          Try Again
        </Button>
      </div>
    )
  }

  const style = STATUS_STYLES[booking.status] ?? DEFAULT_STATUS_STYLE
  const timeline = buildTimeline(booking)
  const canCancel = CANCELLABLE_STATUSES.has(booking.status)

  return (
    <div className="mt-8 space-y-8">
      {/* Header: number + type + status badge */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display font-black text-[clamp(26px,4vw,38px)] text-cocoa-dark tracking-tight leading-[1.1]">
            {booking.bookingNumber}
          </h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-ui ${
              booking.serviceType === 'spa'
                ? 'bg-warm-cream text-deep-gold'
                : 'bg-golden-mist text-warm-gray'
            }`}
          >
            {booking.serviceType === 'spa' ? 'SPA' : 'Salon'}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-ui ${style.bg} ${style.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
          {STATUS_LABELS[booking.status] ?? booking.status}
        </span>
      </header>

      {/* Appointment summary */}
      <Card className="p-5" aria-label="Appointment details">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="mb-1 font-ui text-[11px] uppercase tracking-[0.5px] text-warm-stone">
              Date
            </dt>
            <dd className="font-ui text-[15px] text-cocoa-dark">
              <time dateTime={booking.bookingDate.slice(0, 10)}>
                {formatDateDDMMYYYY(booking.bookingDate)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="mb-1 font-ui text-[11px] uppercase tracking-[0.5px] text-warm-stone">
              Time
            </dt>
            <dd className="font-ui text-[15px] text-cocoa-dark">
              {formatTime12h(booking.startTime)} – {formatTime12h(booking.endTime)}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Services */}
      <section aria-label="Services">
        <h2 className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-3">
          Services
        </h2>
        <ul className="divide-y divide-cloud-gray rounded-[6px] border border-cloud-gray bg-canvas-white">
          {booking.services.map((service) => (
            <li key={service.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div>
                <p className="font-sans text-[15px] text-cocoa-dark">
                  {service.serviceNameSnapshot}
                </p>
                <p className="font-ui text-[13px] text-warm-gray">{service.durationMinutes} min</p>
              </div>
              <span className="font-ui text-[15px] text-cocoa-dark whitespace-nowrap">
                {formatINR(service.priceAtBookingPaise)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-cloud-gray pt-3">
          <span className="font-ui text-[12px] uppercase tracking-[0.5px] text-warm-gray">
            Total
          </span>
          <span className="font-ui text-[18px] text-cocoa-dark">
            {formatINR(booking.totalAmountPaise)}
          </span>
        </div>
      </section>

      {/* Status timeline */}
      <section aria-label="Status timeline">
        <h2 className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-4">
          Timeline
        </h2>
        <ol className="space-y-4">
          {timeline.map((entry) => (
            <li key={entry.label} className="flex items-start gap-3">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  entry.tone === 'cancelled' ? 'bg-error' : 'bg-deep-gold'
                }`}
                aria-hidden="true"
              />
              <div>
                <p className="font-ui text-[15px] text-cocoa-dark">{entry.label}</p>
                <p className="font-ui text-[13px] text-warm-gray">{formatTimestampIST(entry.at)}</p>
              </div>
            </li>
          ))}
        </ol>
        {booking.cancellationReason && (
          <p className="mt-4 font-sans text-[14px] text-warm-gray">
            Reason: {booking.cancellationReason}
          </p>
        )}
        {booking.rejectionReason && (
          <p className="mt-4 font-sans text-[14px] text-warm-gray">
            Reason: {booking.rejectionReason}
          </p>
        )}
      </section>

      {/* Actions */}
      {(canCancel || rescheduleEligible) && (
        <section aria-label="Manage booking" className="space-y-4 border-t border-cloud-gray pt-6">
          {actionError && (
            <p className="font-sans text-[14px] text-error" role="alert">
              {actionError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            {rescheduleEligible && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowReschedule((prev) => !prev)
                  setActionError(null)
                }}
                aria-expanded={showReschedule}
                className="rounded-full border-deep-gold font-ui text-[12px] uppercase tracking-[0.5px] text-cocoa-dark hover:bg-golden-mist hover:text-cocoa-dark"
              >
                {showReschedule ? 'Close' : 'Reschedule'}
              </Button>
            )}

            {canCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={cancelling}
                aria-busy={cancelling}
                className="rounded-full border-error/40 font-ui text-[12px] uppercase tracking-[0.5px] text-error hover:bg-error/5 hover:text-error"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Cancelling…
                  </>
                ) : (
                  'Cancel Booking'
                )}
              </Button>
            )}
          </div>

          {rescheduleEligible && showReschedule && (
            <form
              onSubmit={handleReschedule}
              className="flex flex-col gap-4 rounded-[6px] border border-cloud-gray bg-warm-cream/40 p-5"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label
                    htmlFor="reschedule-date"
                    className="mb-1.5 font-ui text-[11px] uppercase tracking-[0.5px] text-warm-stone"
                  >
                    New date
                  </Label>
                  <Input
                    id="reschedule-date"
                    type="date"
                    required
                    min={todayInIST()}
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="reschedule-time"
                    className="mb-1.5 font-ui text-[11px] uppercase tracking-[0.5px] text-warm-stone"
                  >
                    New time
                  </Label>
                  <select
                    id="reschedule-time"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-canvas-white px-3 font-ui text-[15px] text-cocoa-dark outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {SLOT_OPTIONS.map((slot) => (
                      <option key={slot} value={slot}>
                        {formatTime12h(slot)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Button
                type="submit"
                variant="gold"
                size="lg"
                disabled={rescheduling || !rescheduleDate}
                aria-busy={rescheduling}
                className="w-fit rounded-full font-ui text-[12px] uppercase tracking-[0.5px]"
              >
                {rescheduling ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Rescheduling…
                  </>
                ) : (
                  'Confirm New Slot'
                )}
              </Button>
            </form>
          )}
        </section>
      )}
    </div>
  )
}
