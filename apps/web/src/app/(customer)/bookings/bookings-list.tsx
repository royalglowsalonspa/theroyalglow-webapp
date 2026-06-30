/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingsList
 * Scope        : Booking Management
 *
 * Description  : Client component that fetches, displays, and manages the
 *                customer's bookings with upcoming/past tabs and cancel
 *                functionality. Rebuilt on the shadcn/ui Button + Card
 *                primitives with lucide icons.
 *
 * Responsibilities :
 * - Fetch bookings from GET /api/bookings and display them
 * - Provide upcoming/past tab filtering with counts
 * - Handle booking cancellation via POST /api/bookings/[id]/cancel
 *
 * Features / Functionality :
 * - Tab-based filtering (upcoming vs past bookings)
 * - Cancel action with loading/error states per booking card
 * - Empty state with "Book Now" CTA using the booking dialog
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui,
 *                lucide-react
 * Layer        : Presentation
 *
 * Dependencies : useBookingDialog, React, @/components/ui/{button,card},
 *                @/lib/utils, lucide-react
 *
 * Notes        :
 * - Status colours follow the design spec: pending=amber, confirmed=green, etc.
 ************************************************************/

'use client'

import { useBookingDialog } from '@/components/booking/BookingDialogProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CalendarDays, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

// --- Types (mirror GET /api/bookings response) ---
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
  notes: string | null
  services: BookingServiceRow[]
}

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'in_progress'])
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

// --- Formatting helpers ---
function formatINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

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

function isUpcoming(booking: Booking): boolean {
  if (!ACTIVE_STATUSES.has(booking.status)) return false
  const datePart = booking.bookingDate.slice(0, 10)
  const today = new Date()
  const todayPart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return datePart >= todayPart
}

type Tab = 'upcoming' | 'past'

export function BookingsList() {
  const { open } = useBookingDialog()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('upcoming')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bookings')
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load your bookings.')
      }
      setBookings(json.data.bookings as Booking[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load your bookings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCancel = useCallback(
    async (id: string) => {
      setCancellingId(id)
      setCancelError(null)
      try {
        const res = await fetch(`/api/bookings/${id}/cancel`, { method: 'POST' })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not cancel this booking.')
        }
        await load()
      } catch (err: unknown) {
        setCancelError(err instanceof Error ? err.message : 'Could not cancel this booking.')
      } finally {
        setCancellingId(null)
      }
    },
    [load],
  )

  const { upcoming, past } = useMemo(() => {
    const up: Booking[] = []
    const pst: Booking[] = []
    for (const b of bookings ?? []) {
      if (isUpcoming(b)) up.push(b)
      else pst.push(b)
    }
    return { upcoming: up, past: pst }
  }, [bookings])

  if (loading) {
    return (
      <output className="flex items-center gap-3 py-16" aria-live="polite">
        <Loader2 className="size-5 animate-spin text-deep-gold" aria-hidden="true" />
        <span className="font-sans text-[15px] text-dusty-gray">Loading your bookings…</span>
      </output>
    )
  }

  if (error) {
    return (
      <div className="rounded-[6px] border border-error/40 bg-error/5 px-5 py-6 text-center">
        <p className="mb-3 font-sans text-[15px] text-error" role="alert">
          {error}
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

  if (!bookings || bookings.length === 0) {
    return <EmptyState onBookNow={open} />
  }

  const visible = tab === 'upcoming' ? upcoming : past

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div
        className="inline-flex gap-1 rounded-full bg-cloud-gray p-1"
        role="tablist"
        aria-label="Booking filter"
      >
        {(['upcoming', 'past'] as const).map((t) => (
          <Button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            variant={tab === t ? 'gold' : 'ghost'}
            size="sm"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-full font-ui text-[12px] uppercase tracking-[0.5px]',
              tab !== t && 'text-cocoa-dark hover:bg-golden-mist',
            )}
          >
            {t === 'upcoming' ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
          </Button>
        ))}
      </div>

      {cancelError && (
        <p className="font-sans text-[14px] text-error" role="alert">
          {cancelError}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="py-8 font-sans text-[15px] text-dusty-gray">
          {tab === 'upcoming'
            ? 'No upcoming bookings. Ready for your next Royal Glow moment?'
            : 'No past bookings yet.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((booking) => (
            <li key={booking.id}>
              <BookingCard
                booking={booking}
                cancelling={cancellingId === booking.id}
                onCancel={() => handleCancel(booking.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {tab === 'upcoming' && upcoming.length === 0 && (
        <Button
          type="button"
          variant="gold"
          onClick={open}
          className="w-fit rounded-full font-ui text-[12px] uppercase tracking-[0.5px]"
        >
          Book Now
        </Button>
      )}
    </div>
  )
}

function BookingCard({
  booking,
  cancelling,
  onCancel,
}: {
  booking: Booking
  cancelling: boolean
  onCancel: () => void
}) {
  const style = STATUS_STYLES[booking.status] ?? DEFAULT_STATUS_STYLE
  const canCancel = CANCELLABLE_STATUSES.has(booking.status)

  return (
    <Card className="gap-3 p-5 transition-all duration-200 hover:border-golden-mist hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-ui text-[13px] tracking-[0.5px] text-cocoa-dark">
            {booking.bookingNumber}
          </span>
          <span
            className={cn(
              'ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-ui text-[11px]',
              booking.serviceType === 'spa'
                ? 'bg-warm-cream text-deep-gold'
                : 'bg-golden-mist text-warm-gray',
            )}
          >
            {booking.serviceType === 'spa' ? 'SPA' : 'Salon'}
          </span>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-ui text-[11px]',
            style.bg,
            style.text,
          )}
        >
          <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" />
          {STATUS_LABELS[booking.status] ?? booking.status}
        </span>
      </div>

      <p className="font-ui text-[15px] text-cocoa-dark">
        <time dateTime={booking.bookingDate.slice(0, 10)}>
          {formatDateDDMMYYYY(booking.bookingDate)}
        </time>
        {' · '}
        {formatTime12h(booking.startTime)}
      </p>

      <p className="font-sans text-[14px] text-warm-gray">
        {booking.services.map((s) => s.serviceNameSnapshot).join(', ')}
      </p>

      <div className="flex items-center justify-between gap-3 border-t border-cloud-gray pt-3">
        <span className="font-ui text-[15px] text-cocoa-dark">
          {formatINR(booking.totalAmountPaise)}
        </span>

        {canCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
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
              'Cancel'
            )}
          </Button>
        )}
      </div>
    </Card>
  )
}

function EmptyState({ onBookNow }: { onBookNow: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-warm-cream text-deep-gold">
        <CalendarDays className="size-7" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <p className="mb-6 font-sans text-[16px] text-cocoa-dark">
        No bookings yet. Book your first appointment!
      </p>
      <Button
        type="button"
        variant="gold"
        onClick={onBookNow}
        className="rounded-full font-ui text-[12px] uppercase tracking-[0.5px]"
      >
        Book Now
      </Button>
    </div>
  )
}
