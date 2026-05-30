'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { StatusBadge } from '@/components/admin/StatusBadge'
import {
  type AdminBooking,
  formatDateDDMMYYYY,
  formatINR,
  formatTime12h,
} from '@/lib/admin/bookings'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'no_show', label: 'No Show' },
]

const SERVICE_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'salon', label: 'Salon' },
  { value: 'spa', label: 'SPA' },
]

export function BookingsTable() {
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('all')
  const [serviceType, setServiceType] = useState('all')
  const [date, setDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (status !== 'all') {
        params.set('status', status)
      }
      if (serviceType !== 'all') {
        params.set('serviceType', serviceType)
      }
      if (date) {
        params.set('date', date)
      }
      const qs = params.toString()
      const res = await fetch(`/api/admin/bookings${qs ? `?${qs}` : ''}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load bookings.')
      }
      setBookings(json.data.bookings as AdminBooking[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load bookings.')
    } finally {
      setLoading(false)
    }
  }, [status, serviceType, date])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">
          Bookings
        </h1>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 p-3 border border-cloud-gray rounded-[6px] bg-cloud-gray/30">
        {/* Status dropdown */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="status-filter"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Status
          </label>
          <select
            id="status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date picker */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="date-filter"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Date
          </label>
          <div className="flex items-center gap-1">
            <input
              id="date-filter"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
            />
            {date && (
              <button
                type="button"
                onClick={() => setDate('')}
                className="h-9 px-2 rounded-[6px] text-xs font-ui text-dusty-gray hover:text-cocoa-dark hover:bg-cloud-gray transition-colors"
                aria-label="Clear date filter"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Service type toggle */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray">
            Type
          </span>
          <div
            className="flex rounded-[6px] border border-outline-gray overflow-hidden"
            role="group"
            aria-label="Service type filter"
          >
            {SERVICE_TYPE_OPTIONS.map((opt, i) => {
              const active = serviceType === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setServiceType(opt.value)}
                  aria-pressed={active}
                  className={`h-9 px-3 text-sm font-ui transition-colors ${
                    active
                      ? 'bg-cocoa-dark text-canvas-white'
                      : 'bg-canvas-white text-warm-gray hover:bg-cloud-gray'
                  } ${i > 0 ? 'border-l border-outline-gray' : ''}`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Table / states */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !bookings || bookings.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cloud-gray/60">
                    <Th>Booking #</Th>
                    <Th>Customer</Th>
                    <Th>Date</Th>
                    <Th>Time</Th>
                    <Th>Services</Th>
                    <Th>Status</Th>
                    <Th>Total</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud-gray">
                  {bookings.map((booking) => (
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
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {formatDateDDMMYYYY(booking.bookingDate)}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {formatTime12h(booking.startTime)}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray max-w-[200px] truncate">
                        {booking.services
                          .map((s) => s.serviceNameSnapshot)
                          .join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={booking.status} />
                      </td>
                      <td className="px-4 py-3 font-ui text-cocoa-dark whitespace-nowrap">
                        {formatINR(booking.totalAmountPaise)}
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

          <p className="text-sm text-dusty-gray font-sans">
            Showing {bookings.length} booking{bookings.length === 1 ? '' : 's'}
          </p>
        </>
      )}
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

function LoadingState() {
  return (
    <div
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading bookings…</span>
    </div>
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

function EmptyState() {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 text-center">
      <p className="font-sans text-sm text-cocoa-dark mb-1">No bookings found</p>
      <p className="font-sans text-xs text-dusty-gray">
        Try adjusting the filters above.
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
