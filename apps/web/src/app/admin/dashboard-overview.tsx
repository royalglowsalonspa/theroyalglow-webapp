'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { StatusBadge } from '@/components/admin/StatusBadge'
import {
  type AdminBooking,
  formatINR,
  formatTime12h,
} from '@/lib/admin/bookings'

// Today's date in IST as YYYY-MM-DD, to compare against booking dates.
function todayIST(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
  return parts // en-CA → YYYY-MM-DD
}

export function DashboardOverview() {
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/bookings')
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load dashboard data.')
      }
      setBookings(json.data.bookings as AdminBooking[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const { kpis, recent } = useMemo(() => {
    const all = bookings ?? []
    const today = todayIST()
    const todaysBookings = all.filter((b) => b.bookingDate.slice(0, 10) === today)
    const pending = all.filter((b) => b.status === 'pending')
    const todaysRevenue = all
      .filter((b) => b.bookingDate.slice(0, 10) === today && b.status === 'completed')
      .reduce((sum, b) => sum + b.totalAmountPaise, 0)

    return {
      kpis: [
        { label: "Today's Bookings", value: String(todaysBookings.length), icon: '📅' },
        { label: 'Pending Approval', value: String(pending.length), icon: '⏳' },
        { label: "Today's Revenue", value: formatINR(todaysRevenue), icon: '💰' },
        { label: 'Total Bookings', value: String(all.length), icon: '📊' },
      ],
      recent: all.slice(0, 5),
    }
  }, [bookings])

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((card) => (
          <div
            key={card.label}
            className="border border-cloud-gray rounded-[6px] p-4 bg-canvas-white"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-dusty-gray font-sans">{card.label}</span>
              <span className="text-lg" aria-hidden="true">
                {card.icon}
              </span>
            </div>
            <p className="text-2xl font-display text-cocoa-dark tracking-tight">
              {loading ? '—' : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Bookings */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display text-cocoa-dark">Recent Bookings</h2>
          <Link
            href="/admin/bookings"
            className="text-sm font-ui text-deep-gold hover:text-cocoa-dark transition-colors"
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <div
            className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-12 justify-center"
            role="status"
            aria-live="polite"
          >
            <Spinner />
            <span className="font-sans text-sm text-dusty-gray">Loading…</span>
          </div>
        ) : error ? (
          <div className="border border-error/40 bg-error/5 rounded-[6px] px-5 py-8 text-center">
            <p className="font-sans text-sm text-error mb-3" role="alert">
              {error}
            </p>
            <button
              type="button"
              onClick={load}
              className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : recent.length === 0 ? (
          <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-12 text-center">
            <p className="font-sans text-sm text-dusty-gray">No bookings yet.</p>
          </div>
        ) : (
          <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cloud-gray/60">
                    <Th>Booking #</Th>
                    <Th>Customer</Th>
                    <Th>Services</Th>
                    <Th>Time</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud-gray">
                  {recent.map((booking) => (
                    <tr
                      key={booking.id}
                      className="hover:bg-cloud-gray/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-cocoa-dark whitespace-nowrap">
                        {booking.bookingNumber}
                      </td>
                      <td className="px-4 py-3 font-sans text-cocoa-dark whitespace-nowrap">
                        {booking.customerName}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray max-w-[200px] truncate">
                        {booking.services
                          .map((s) => s.serviceNameSnapshot)
                          .join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {formatTime12h(booking.startTime)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={booking.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/bookings/${booking.id}`}
                          className="text-deep-gold hover:text-cocoa-dark text-sm font-ui transition-colors"
                          aria-label={`View details for booking ${booking.bookingNumber}`}
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray">
      {children}
    </th>
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
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
