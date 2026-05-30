'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBookingDialog } from '@/components/booking/BookingDialogProvider'

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
        setCancelError(
          err instanceof Error ? err.message : 'Could not cancel this booking.'
        )
      } finally {
        setCancellingId(null)
      }
    },
    [load]
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
      <div className="flex items-center gap-3 py-16" role="status" aria-live="polite">
        <Spinner />
        <span className="font-sans text-[15px] text-dusty-gray">Loading your bookings…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[6px] border border-error/40 bg-error/5 px-5 py-6 text-center">
        <p className="font-sans text-[15px] text-error mb-3" role="alert">
          {error}
        </p>
        <button
          type="button"
          onClick={load}
          className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-6 py-2.5 bg-royal-gold text-cocoa-dark hover:bg-deep-gold motion-safe:transition-colors duration-200"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!bookings || bookings.length === 0) {
    return <EmptyState onBookNow={open} />
  }

  const visible = tab === 'upcoming' ? upcoming : past

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="inline-flex gap-1 rounded-full bg-cloud-gray p-1" role="tablist" aria-label="Booking filter">
        {(['upcoming', 'past'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-5 py-2 motion-safe:transition-colors duration-200 ${
              tab === t ? 'bg-royal-gold text-cocoa-dark' : 'bg-cloud-gray text-cocoa-dark hover:bg-golden-mist'
            }`}
          >
            {t === 'upcoming' ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
          </button>
        ))}
      </div>

      {cancelError && (
        <p className="font-sans text-[14px] text-error" role="alert">
          {cancelError}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="font-sans text-[15px] text-dusty-gray py-8">
          {tab === 'upcoming'
            ? 'No upcoming bookings. Ready for your next Royal Glow moment?'
            : 'No past bookings yet.'}
        </p>
      ) : (
        <ul className="space-y-4">
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
        <button
          type="button"
          onClick={open}
          className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-8 py-3 bg-royal-gold text-cocoa-dark hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all duration-200"
        >
          Book Now
        </button>
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
    <article className="rounded-[6px] border border-cloud-gray bg-canvas-white p-5 motion-safe:transition-all duration-200 hover:border-golden-mist hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <span className="font-ui text-[13px] text-cocoa-dark tracking-[0.5px]">
            {booking.bookingNumber}
          </span>
          <span
            className={`ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-ui ${
              booking.serviceType === 'spa'
                ? 'bg-warm-cream text-deep-gold'
                : 'bg-golden-mist text-warm-gray'
            }`}
          >
            {booking.serviceType === 'spa' ? 'SPA' : 'Salon'}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-ui ${style.bg} ${style.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
          {STATUS_LABELS[booking.status] ?? booking.status}
        </span>
      </div>

      <p className="font-sans text-[15px] text-cocoa-dark mb-1">
        <time dateTime={booking.bookingDate.slice(0, 10)}>
          {formatDateDDMMYYYY(booking.bookingDate)}
        </time>
        {' · '}
        {formatTime12h(booking.startTime)}
      </p>

      <p className="font-sans text-[14px] text-warm-gray mb-3">
        {booking.services.map((s) => s.serviceNameSnapshot).join(', ')}
      </p>

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-cloud-gray">
        <span className="font-ui text-[15px] text-cocoa-dark">
          {formatINR(booking.totalAmountPaise)}
        </span>

        {canCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            aria-busy={cancelling}
            className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-5 py-2 border border-error/40 text-error hover:bg-error/5 motion-safe:transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>
    </article>
  )
}

function EmptyState({ onBookNow }: { onBookNow: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-warm-cream flex items-center justify-center mb-5">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2" stroke="#C8A961" strokeWidth="1.5" />
          <path d="M3 9h18M8 2v4M16 2v4" stroke="#C8A961" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="font-sans text-[16px] text-cocoa-dark mb-6">
        No bookings yet. Book your first appointment!
      </p>
      <button
        type="button"
        onClick={onBookNow}
        className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-8 py-3 bg-royal-gold text-cocoa-dark hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all duration-200"
      >
        Book Now
      </button>
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
