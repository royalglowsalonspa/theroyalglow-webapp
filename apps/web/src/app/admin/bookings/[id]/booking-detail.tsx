'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { StatusBadge } from '@/components/admin/StatusBadge'
import {
  type AdminBooking,
  formatDateDDMMYYYY,
  formatINRWithPaise,
  formatTime12h,
  SERVICE_TYPE_LABEL,
  type StaffMember,
} from '@/lib/admin/bookings'

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
] as const

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

interface CompletionResult {
  invoiceNumber: string
  gemsEarned: number
}

export function BookingDetail({ bookingId }: { bookingId: string }) {
  const [booking, setBooking] = useState<AdminBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completion, setCompletion] = useState<CompletionResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load this booking.')
      }
      setBooking(json.data.booking as AdminBooking)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load this booking.')
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div
        className="flex items-center gap-3 py-16 justify-center"
        role="status"
        aria-live="polite"
      >
        <Spinner />
        <span className="font-sans text-sm text-dusty-gray">Loading booking…</span>
      </div>
    )
  }

  if (error || !booking) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="border border-error/40 bg-error/5 rounded-[6px] px-5 py-10 text-center">
          <p className="font-sans text-sm text-error mb-3" role="alert">
            {error ?? 'Booking not found.'}
          </p>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const total = booking.totalAmountPaise

  return (
    <div className="space-y-5 max-w-4xl">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-display text-cocoa-dark tracking-tight font-mono">
            {booking.bookingNumber}
          </h1>
          <StatusBadge status={booking.status} />
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-ui ${
            booking.serviceType === 'spa'
              ? 'bg-warm-cream text-deep-gold'
              : 'bg-golden-mist text-warm-gray'
          }`}
        >
          {SERVICE_TYPE_LABEL[booking.serviceType] ?? booking.serviceType}
        </span>
      </div>

      {/* Two-column layout: details + action panel */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Customer */}
          <Section title="Customer">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Name" value={booking.customerName} />
              <Field label="Email" value={booking.customerEmail} />
            </dl>
          </Section>

          {/* Booking info */}
          <Section title="Booking">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Date" value={formatDateDDMMYYYY(booking.bookingDate)} />
              <Field
                label="Time"
                value={`${formatTime12h(booking.startTime)} – ${formatTime12h(booking.endTime)}`}
              />
              <Field
                label="Type"
                value={SERVICE_TYPE_LABEL[booking.serviceType] ?? booking.serviceType}
              />
              {booking.isWalkin ? <Field label="Walk-in" value="Yes" /> : null}
            </dl>
          </Section>

          {/* Services */}
          <Section title="Services">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cloud-gray">
                    <th className="text-left py-2 font-ui text-xs uppercase tracking-wider text-dusty-gray">
                      Service
                    </th>
                    <th className="text-left py-2 font-ui text-xs uppercase tracking-wider text-dusty-gray">
                      Duration
                    </th>
                    <th className="text-right py-2 font-ui text-xs uppercase tracking-wider text-dusty-gray">
                      Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud-gray">
                  {booking.services.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 font-sans text-cocoa-dark">
                        {s.serviceNameSnapshot}
                      </td>
                      <td className="py-2.5 font-sans text-warm-gray">
                        {s.durationMinutes} min
                      </td>
                      <td className="py-2.5 font-ui text-cocoa-dark text-right">
                        {formatINRWithPaise(s.priceAtBookingPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-cloud-gray">
                    <td
                      colSpan={2}
                      className="py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray"
                    >
                      Total (incl. GST)
                    </td>
                    <td className="py-2.5 font-ui text-cocoa-dark text-right font-medium">
                      {formatINRWithPaise(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>

          {/* Notes */}
          {booking.notes ? (
            <Section title="Notes">
              <p className="text-sm font-sans text-warm-gray whitespace-pre-wrap">
                {booking.notes}
              </p>
            </Section>
          ) : null}
        </div>

        {/* Action panel */}
        <div className="lg:col-span-1">
          <ActionPanel
            booking={booking}
            completion={completion}
            onChanged={load}
            onCompleted={(result) => setCompletion(result)}
          />
        </div>
      </div>
    </div>
  )
}

function ActionPanel({
  booking,
  completion,
  onChanged,
  onCompleted,
}: {
  booking: AdminBooking
  completion: CompletionResult | null
  onChanged: () => void
  onCompleted: (result: CompletionResult) => void
}) {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white p-4 lg:sticky lg:top-4">
      <h2 className="text-xs font-ui uppercase tracking-wider text-dusty-gray mb-3">
        Actions
      </h2>
      {booking.status === 'pending' ? (
        <PendingActions booking={booking} onChanged={onChanged} />
      ) : booking.status === 'confirmed' ? (
        <ConfirmedActions
          booking={booking}
          onChanged={onChanged}
          onCompleted={onCompleted}
        />
      ) : booking.status === 'completed' ? (
        <CompletedState completion={completion} />
      ) : (
        <TerminalState booking={booking} />
      )}
    </div>
  )
}

// --- Pending: approve (staff picker) + reject (reason) ---
function PendingActions({
  booking,
  onChanged,
}: {
  booking: AdminBooking
  onChanged: () => void
}) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null)
  const [staffId, setStaffId] = useState('')
  const [mode, setMode] = useState<'idle' | 'reject'>('idle')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/admin/staff')
      .then((res) => res.json())
      .then((json) => {
        if (active && json?.success) {
          setStaff(json.data.staff as StaffMember[])
        }
      })
      .catch(() => {
        /* picker stays empty; approve guarded below */
      })
    return () => {
      active = false
    }
  }, [])

  const approve = useCallback(async () => {
    if (!staffId) {
      setActionError('Select a staff member to assign.')
      return
    }
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve', staffId }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not approve this booking.')
      }
      onChanged()
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Could not approve this booking.'
      )
    } finally {
      setSubmitting(false)
    }
  }, [booking.id, staffId, onChanged])

  const reject = useCallback(async () => {
    if (!reason.trim()) {
      setActionError('A rejection reason is required.')
      return
    }
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reject', rejectionReason: reason.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not reject this booking.')
      }
      onChanged()
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Could not reject this booking.'
      )
    } finally {
      setSubmitting(false)
    }
  }, [booking.id, reason, onChanged])

  return (
    <div className="space-y-3">
      {mode === 'idle' && (
        <>
          {/* Staff picker */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="staff-picker"
              className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
            >
              Assign Staff
            </label>
            <select
              id="staff-picker"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
            >
              <option value="">
                {staff === null ? 'Loading staff…' : 'Select staff…'}
              </option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.designation})
                </option>
              ))}
            </select>
          </div>

          {actionError && (
            <p className="text-xs text-error font-sans" role="alert">
              {actionError}
            </p>
          )}

          <button
            type="button"
            onClick={approve}
            disabled={submitting}
            aria-busy={submitting}
            className="w-full px-4 py-2.5 rounded-[6px] bg-emerald-600 text-canvas-white text-sm font-ui hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Approving…' : 'Approve ✓'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('reject')
              setActionError(null)
            }}
            disabled={submitting}
            className="w-full px-4 py-2.5 rounded-[6px] border border-red-300 text-red-700 text-sm font-ui hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Reject ✕
          </button>
        </>
      )}

      {mode === 'reject' && (
        <>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reject-reason"
              className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
            >
              Rejection Reason
            </label>
            <textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Reason shown to the customer…"
              className="px-3 py-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold resize-none"
            />
          </div>

          <p className="text-[11px] text-dusty-gray font-sans">
            The customer will see this reason in their booking detail and email.
          </p>

          {actionError && (
            <p className="text-xs text-error font-sans" role="alert">
              {actionError}
            </p>
          )}

          <button
            type="button"
            onClick={reject}
            disabled={submitting}
            aria-busy={submitting}
            className="w-full px-4 py-2.5 rounded-[6px] bg-red-600 text-canvas-white text-sm font-ui hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Rejecting…' : 'Confirm Rejection'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('idle')
              setReason('')
              setActionError(null)
            }}
            disabled={submitting}
            className="w-full px-4 py-2.5 rounded-[6px] border border-cloud-gray text-cocoa-dark text-sm font-ui hover:bg-cloud-gray transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </>
      )}
    </div>
  )
}

// --- Confirmed: complete & checkout (payment picker) + no-show ---
function ConfirmedActions({
  booking,
  onChanged,
  onCompleted,
}: {
  booking: AdminBooking
  onChanged: () => void
  onCompleted: (result: CompletionResult) => void
}) {
  const [mode, setMode] = useState<'idle' | 'checkout'>('idle')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const complete = useCallback(async () => {
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentMethod }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not complete this booking.')
      }
      onCompleted({
        invoiceNumber: json.data.invoice.invoiceNumber,
        gemsEarned: json.data.gemsEarned,
      })
      onChanged()
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Could not complete this booking.'
      )
    } finally {
      setSubmitting(false)
    }
  }, [booking.id, paymentMethod, onCompleted, onChanged])

  const markNoShow = useCallback(async () => {
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/noshow`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not mark this booking as no-show.')
      }
      onChanged()
    } catch (err: unknown) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Could not mark this booking as no-show.'
      )
    } finally {
      setSubmitting(false)
    }
  }, [booking.id, onChanged])

  return (
    <div className="space-y-3">
      {mode === 'idle' && (
        <>
          {actionError && (
            <p className="text-xs text-error font-sans" role="alert">
              {actionError}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setMode('checkout')
              setActionError(null)
            }}
            className="w-full px-4 py-2.5 rounded-[6px] bg-emerald-600 text-canvas-white text-sm font-ui hover:bg-emerald-700 transition-colors"
          >
            Complete & Checkout
          </button>
          <button
            type="button"
            onClick={markNoShow}
            disabled={submitting}
            aria-busy={submitting}
            className="w-full px-4 py-2.5 rounded-[6px] border border-red-300 text-red-700 text-sm font-ui hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Working…' : 'Mark No-Show'}
          </button>
        </>
      )}

      {mode === 'checkout' && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray mb-1">
              Payment Method
            </legend>
            {PAYMENT_METHODS.map((pm) => (
              <label
                key={pm.value}
                className="flex items-center gap-2 text-sm font-sans text-cocoa-dark cursor-pointer"
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={pm.value}
                  checked={paymentMethod === pm.value}
                  onChange={() => setPaymentMethod(pm.value)}
                  className="accent-cocoa-dark"
                />
                {pm.label}
              </label>
            ))}
          </fieldset>

          <div className="flex items-center justify-between pt-2 border-t border-cloud-gray text-sm">
            <span className="font-ui text-xs uppercase tracking-wider text-dusty-gray">
              Total
            </span>
            <span className="font-ui text-cocoa-dark font-medium">
              {formatINRWithPaise(booking.totalAmountPaise)}
            </span>
          </div>

          {actionError && (
            <p className="text-xs text-error font-sans" role="alert">
              {actionError}
            </p>
          )}

          <button
            type="button"
            onClick={complete}
            disabled={submitting}
            aria-busy={submitting}
            className="w-full px-4 py-2.5 rounded-[6px] bg-emerald-600 text-canvas-white text-sm font-ui hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Generating invoice…' : 'Complete & Generate Invoice'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('idle')
              setActionError(null)
            }}
            disabled={submitting}
            className="w-full px-4 py-2.5 rounded-[6px] border border-cloud-gray text-cocoa-dark text-sm font-ui hover:bg-cloud-gray transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </>
      )}
    </div>
  )
}

// --- Completed: invoice + gems (read-only) ---
function CompletedState({ completion }: { completion: CompletionResult | null }) {
  return (
    <div className="space-y-3">
      <div className="rounded-[6px] bg-emerald-50 border border-emerald-200 px-3 py-3">
        <p className="text-sm font-ui text-emerald-800 mb-1">Booking completed</p>
        {completion ? (
          <ul className="space-y-1 text-sm font-sans text-emerald-700">
            <li>
              ✓ Invoice{' '}
              <span className="font-mono">{completion.invoiceNumber}</span> generated
            </li>
            <li>✓ +{completion.gemsEarned} gems awarded</li>
          </ul>
        ) : (
          <p className="text-sm font-sans text-emerald-700">
            This booking has been completed and an invoice was generated.
          </p>
        )}
      </div>
    </div>
  )
}

// --- Terminal: cancelled / rejected / no_show ---
function TerminalState({ booking }: { booking: AdminBooking }) {
  const reason =
    booking.status === 'rejected'
      ? booking.rejectionReason
      : booking.status === 'cancelled'
        ? booking.cancellationReason
        : null

  const label =
    booking.status === 'rejected'
      ? 'This booking was rejected.'
      : booking.status === 'cancelled'
        ? 'This booking was cancelled.'
        : booking.status === 'no_show'
          ? 'The customer did not show up.'
          : 'No actions available for this booking.'

  return (
    <div className="space-y-2">
      <p className="text-sm font-sans text-cocoa-dark">{label}</p>
      {reason ? (
        <div className="rounded-[6px] bg-cloud-gray/40 border border-cloud-gray px-3 py-2">
          <p className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray mb-0.5">
            Reason
          </p>
          <p className="text-sm font-sans text-warm-gray whitespace-pre-wrap">
            {reason}
          </p>
        </div>
      ) : null}
    </div>
  )
}

// --- Shared primitives ---
function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border border-cloud-gray rounded-[6px] bg-canvas-white p-4">
      <h2 className="text-xs font-ui uppercase tracking-wider text-dusty-gray mb-3">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray">
        {label}
      </dt>
      <dd className="font-sans text-cocoa-dark">{value}</dd>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/admin/bookings"
      className="inline-flex items-center gap-1.5 text-sm font-ui text-warm-gray hover:text-cocoa-dark transition-colors"
    >
      ← Back to Bookings
    </Link>
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

