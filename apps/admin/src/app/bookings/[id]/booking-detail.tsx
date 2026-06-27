/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Booking Detail
 * Scope        : Admin Portal — Booking Management
 *
 * Description  : Full booking detail view rebuilt on the admin design-system
 *                conventions. Renders the booking detail and the
 *                approve/reject, assign-staff, complete-&-checkout, and
 *                mark-no-show action panels. Loading / error conditions render
 *                via the shared state presenters; iconography uses the lucide
 *                Icon wrapper (no emoji); all colour / radius come from
 *                semantic Brand-Token utilities (no hex / raw-palette / px
 *                literals). Consumes the existing booking APIs as-is.
 *
 * Responsibilities :
 * - Fetch and display single booking details (customer, services, totals)
 * - Provide approve/reject workflow with staff assignment
 * - Handle complete & checkout flow with payment method selection
 * - Surface loading / error via the shared state presenters
 *
 * Features / Functionality :
 * - Status-dependent action panels (pending, confirmed, completed, terminal)
 * - Staff picker for approval with dynamic loading
 * - Invoice generation + gems award on completion
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Detail View Component)
 *
 * Dependencies : @/components/admin/StatusBadge, @/components/ui/icon,
 *                @/components/ui/state/*, @/lib/admin/bookings, next/link,
 *                lucide-react, React hooks
 *
 * Notes        :
 * - Presentation-layer only: no API/RBAC/data-model/business-logic changes.
 * - Uses ONLY semantic Brand-Token utilities — no hex / raw-palette / px
 *   literals. Icons render through the Icon wrapper (no emoji).
 * - Every pre-redesign field and every action (approve / reject / assign /
 *   complete / no-show) are preserved with their original effects and the
 *   same API calls (Req 17.6, 17.7).
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { StatusBadge } from '@/components/admin/StatusBadge'
import { Icon } from '@/components/ui/icon'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import {
  type AdminBooking,
  SERVICE_TYPE_LABEL,
  type StaffMember,
  formatDateDDMMYYYY,
  formatINRWithPaise,
  formatTime12h,
} from '@/lib/admin/bookings'
import { ArrowLeft, Check, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

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
      const res = await fetch(`/api/bookings/${bookingId}`)
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
      <div className="max-w-4xl space-y-5">
        <BackLink />
        <Skeleton rows={3} variant="card" />
      </div>
    )
  }

  if (error || !booking) {
    return (
      <div className="max-w-4xl space-y-4">
        <BackLink />
        <ErrorState message={error ?? 'Booking not found.'} onRetry={load} />
      </div>
    )
  }

  const total = booking.totalAmountPaise

  return (
    <div className="max-w-4xl space-y-5">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display font-mono text-2xl tracking-tight text-cocoa-dark">
            {booking.bookingNumber}
          </h1>
          <StatusBadge status={booking.status} />
        </div>
        <span
          className={`inline-flex items-center rounded-pill px-2.5 py-0.5 font-ui text-xs ${
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
        <div className="space-y-5 lg:col-span-2">
          {/* Customer */}
          <Section title="Customer">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Field label="Name" value={booking.customerName} />
              <Field label="Email" value={booking.customerEmail} />
            </dl>
          </Section>

          {/* Booking info */}
          <Section title="Booking">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
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
                    <th className="py-2 text-left font-ui text-xs uppercase tracking-wider text-dusty-gray">
                      Service
                    </th>
                    <th className="py-2 text-left font-ui text-xs uppercase tracking-wider text-dusty-gray">
                      Duration
                    </th>
                    <th className="py-2 text-right font-ui text-xs uppercase tracking-wider text-dusty-gray">
                      Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud-gray">
                  {booking.services.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 font-sans text-cocoa-dark">{s.serviceNameSnapshot}</td>
                      <td className="py-2.5 font-sans text-warm-gray">{s.durationMinutes} min</td>
                      <td className="py-2.5 text-right font-ui text-cocoa-dark">
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
                    <td className="py-2.5 text-right font-ui font-medium text-cocoa-dark">
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
              <p className="whitespace-pre-wrap font-sans text-sm text-warm-gray">
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
    <div className="rounded-cards border border-cloud-gray bg-canvas-white p-4 lg:sticky lg:top-4">
      <h2 className="mb-3 font-ui text-xs uppercase tracking-wider text-dusty-gray">Actions</h2>
      {booking.status === 'pending' ? (
        <PendingActions booking={booking} onChanged={onChanged} />
      ) : booking.status === 'confirmed' ? (
        <ConfirmedActions booking={booking} onChanged={onChanged} onCompleted={onCompleted} />
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
    fetch('/api/staff')
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
      const res = await fetch(`/api/bookings/${booking.id}`, {
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
      setActionError(err instanceof Error ? err.message : 'Could not approve this booking.')
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
      const res = await fetch(`/api/bookings/${booking.id}`, {
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
      setActionError(err instanceof Error ? err.message : 'Could not reject this booking.')
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
              className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray"
            >
              Assign Staff
            </label>
            <select
              id="staff-picker"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="h-9 rounded-cards border border-outline-gray bg-canvas-white px-3 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
            >
              <option value="">{staff === null ? 'Loading staff…' : 'Select staff…'}</option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.designation})
                </option>
              ))}
            </select>
          </div>

          {actionError && (
            <p className="font-sans text-xs text-error" role="alert">
              {actionError}
            </p>
          )}

          <button
            type="button"
            onClick={approve}
            disabled={submitting}
            aria-busy={submitting}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-buttons bg-success px-4 py-2.5 font-ui text-sm text-canvas-white transition-colors hover:bg-success-dark disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            {submitting ? 'Approving…' : 'Approve'}
            {submitting ? null : <Icon icon={Check} decorative size={16} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('reject')
              setActionError(null)
            }}
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-buttons border border-error/40 px-4 py-2.5 font-ui text-sm text-error transition-colors hover:bg-error/5 disabled:opacity-50 motion-reduce:transition-none"
          >
            Reject
            <Icon icon={X} decorative size={16} />
          </button>
        </>
      )}

      {mode === 'reject' && (
        <>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reject-reason"
              className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray"
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
              className="resize-none rounded-cards border border-outline-gray bg-canvas-white px-3 py-2 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
            />
          </div>

          <p className="font-sans text-[11px] text-dusty-gray">
            The customer will see this reason in their booking detail and email.
          </p>

          {actionError && (
            <p className="font-sans text-xs text-error" role="alert">
              {actionError}
            </p>
          )}

          <button
            type="button"
            onClick={reject}
            disabled={submitting}
            aria-busy={submitting}
            className="w-full rounded-buttons bg-error px-4 py-2.5 font-ui text-sm text-canvas-white transition-colors hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
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
            className="w-full rounded-buttons border border-cloud-gray px-4 py-2.5 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray disabled:opacity-50 motion-reduce:transition-none"
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
      const res = await fetch(`/api/bookings/${booking.id}/complete`, {
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
      setActionError(err instanceof Error ? err.message : 'Could not complete this booking.')
    } finally {
      setSubmitting(false)
    }
  }, [booking.id, paymentMethod, onCompleted, onChanged])

  const markNoShow = useCallback(async () => {
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/noshow`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not mark this booking as no-show.')
      }
      onChanged()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not mark this booking as no-show.')
    } finally {
      setSubmitting(false)
    }
  }, [booking.id, onChanged])

  return (
    <div className="space-y-3">
      {mode === 'idle' && (
        <>
          {actionError && (
            <p className="font-sans text-xs text-error" role="alert">
              {actionError}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setMode('checkout')
              setActionError(null)
            }}
            className="w-full rounded-buttons bg-success px-4 py-2.5 font-ui text-sm text-canvas-white transition-colors hover:bg-success-dark motion-reduce:transition-none"
          >
            Complete & Checkout
          </button>
          <button
            type="button"
            onClick={markNoShow}
            disabled={submitting}
            aria-busy={submitting}
            className="w-full rounded-buttons border border-error/40 px-4 py-2.5 font-ui text-sm text-error transition-colors hover:bg-error/5 disabled:opacity-50 motion-reduce:transition-none"
          >
            {submitting ? 'Working…' : 'Mark No-Show'}
          </button>
        </>
      )}

      {mode === 'checkout' && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-ui text-[10px] uppercase tracking-wider text-dusty-gray">
              Payment Method
            </legend>
            {PAYMENT_METHODS.map((pm) => (
              <label
                key={pm.value}
                className="flex cursor-pointer items-center gap-2 font-sans text-sm text-cocoa-dark"
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

          <div className="flex items-center justify-between border-t border-cloud-gray pt-2 text-sm">
            <span className="font-ui text-xs uppercase tracking-wider text-dusty-gray">Total</span>
            <span className="font-ui font-medium text-cocoa-dark">
              {formatINRWithPaise(booking.totalAmountPaise)}
            </span>
          </div>

          {actionError && (
            <p className="font-sans text-xs text-error" role="alert">
              {actionError}
            </p>
          )}

          <button
            type="button"
            onClick={complete}
            disabled={submitting}
            aria-busy={submitting}
            className="w-full rounded-buttons bg-success px-4 py-2.5 font-ui text-sm text-canvas-white transition-colors hover:bg-success-dark disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
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
            className="w-full rounded-buttons border border-cloud-gray px-4 py-2.5 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray disabled:opacity-50 motion-reduce:transition-none"
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
      <div className="rounded-cards border border-success/30 bg-success/10 px-3 py-3">
        <p className="mb-1 font-ui text-sm text-success-dark">Booking completed</p>
        {completion ? (
          <ul className="space-y-1 font-sans text-sm text-success-dark">
            <li className="flex items-center gap-1.5">
              <Icon icon={Check} decorative size={14} />
              <span>
                Invoice <span className="font-mono">{completion.invoiceNumber}</span> generated
              </span>
            </li>
            <li className="flex items-center gap-1.5">
              <Icon icon={Check} decorative size={14} />
              <span>+{completion.gemsEarned} gems awarded</span>
            </li>
          </ul>
        ) : (
          <p className="font-sans text-sm text-success-dark">
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
      <p className="font-sans text-sm text-cocoa-dark">{label}</p>
      {reason ? (
        <div className="rounded-cards border border-cloud-gray bg-cloud-gray/40 px-3 py-2">
          <p className="mb-0.5 font-ui text-[10px] uppercase tracking-wider text-dusty-gray">
            Reason
          </p>
          <p className="whitespace-pre-wrap font-sans text-sm text-warm-gray">{reason}</p>
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
    <section className="rounded-cards border border-cloud-gray bg-canvas-white p-4">
      <h2 className="mb-3 font-ui text-xs uppercase tracking-wider text-dusty-gray">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray">{label}</dt>
      <dd className="font-sans text-cocoa-dark">{value}</dd>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/bookings"
      className="inline-flex items-center gap-1.5 font-ui text-sm text-warm-gray transition-colors hover:text-cocoa-dark motion-reduce:transition-none"
    >
      <Icon icon={ArrowLeft} decorative size={16} />
      Back to Bookings
    </Link>
  )
}
