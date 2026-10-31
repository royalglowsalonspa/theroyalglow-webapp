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
 *                approve/reject, assign-staff, start, complete-&-checkout,
 *                complete-session and mark-no-show action panels, and the
 *                salon's move and cancel of a pending or confirmed booking
 *                (membership-scheduling.md slice 3). A SPA
 *                membership session starts before it completes and takes no
 *                payment (membership-scheduling.md). Loading / error conditions render
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
 * - Status-dependent action panels (pending, confirmed, in progress,
 *   completed, terminal)
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

import { ArrowLeft, Check, TriangleAlert, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { TimeSelect } from '@/components/ui/time-select'
import {
  type AdminBooking,
  type AdminBookingReassignment,
  assigneeLabel,
  formatDateDDMMYYYY,
  formatINRWithPaise,
  formatTime12h,
  reassignmentReasonText,
  SERVICE_TYPE_LABEL,
  type StaffMember,
  staffBusyBlocks,
  staffOptionLabel,
} from '@/lib/admin/bookings'
import { formatDateTimeIST } from '@/lib/admin/format'
import { minutesToHM, todayISTDateString } from '@/lib/admin/memberships'
import { toast } from '@/lib/admin/toast'

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
] as const

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

interface CompletionResult {
  invoiceNumber: string
  gemsEarned: number
  /** Minutes the membership has free after a session; null for a booking. */
  remainingMinutes: number | null
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

      {booking.reassignment ? <ReassignmentNotice work={booking.reassignment} /> : null}

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
              <Field label="Staff" value={assigneeLabel(booking.services) ?? 'Not assigned'} />
              {booking.isWalkin ? <Field label="Walk-in" value="Yes" /> : null}
              {booking.isMembershipSession ? (
                <Field label="Paid with" value="SPA membership hours" />
              ) : null}
              {booking.startedAt ? (
                <Field label="Started" value={formatDateTimeIST(booking.startedAt)} />
              ) : null}
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
      ) : booking.status === 'in_progress' ? (
        <InProgressActions booking={booking} onChanged={onChanged} onCompleted={onCompleted} />
      ) : booking.status === 'completed' ? (
        <CompletedState completion={completion} session={booking.isMembershipSession === true} />
      ) : (
        <TerminalState booking={booking} />
      )}
    </div>
  )
}

/**
 * The active branch's staff for the pickers, each saying why they can't take
 * this booking's slot, if they can't (slice 2b); null while loading.
 */
function useBranchStaff(bookingId: string): StaffMember[] | null {
  const [staff, setStaff] = useState<StaffMember[] | null>(null)
  useEffect(() => {
    let active = true
    fetch(`/api/staff?booking=${encodeURIComponent(bookingId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (active && json?.success) {
          setStaff(json.data.staff as StaffMember[])
        }
      })
      .catch(() => {
        /* picker stays empty; the action is guarded on the server */
      })
    return () => {
      active = false
    }
  }, [bookingId])
  return staff
}

/** The picker's options: everyone, those the database would refuse disabled. */
function StaffOptions({ staff, startsNow }: { staff: StaffMember[] | null; startsNow: boolean }) {
  return (
    <SelectGroup>
      {(staff ?? []).map((s) => (
        <SelectItem key={s.id} value={s.id} disabled={staffBusyBlocks(s.busy, { startsNow })}>
          {staffOptionLabel(s)}
        </SelectItem>
      ))}
    </SelectGroup>
  )
}

/** The one person every service names, or '' when none or mixed. */
function sharedAssigneeId(booking: AdminBooking): string {
  const ids = new Set(booking.services.map((s) => s.staffId))
  const [only] = [...ids]
  return ids.size === 1 && only ? only : ''
}

// --- Pending: approve (staff picker) + reject (reason) ---
function PendingActions({ booking, onChanged }: { booking: AdminBooking; onChanged: () => void }) {
  const staff = useBranchStaff(booking.id)
  const [staffId, setStaffId] = useState('')
  const [mode, setMode] = useState<'idle' | 'reject' | 'move'>('idle')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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
        body: JSON.stringify({ action: 'approve', branchId: booking.branchId, staffId }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not approve this booking.')
      }
      toast.success('Booking approved')
      onChanged()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not approve this booking.'
      setActionError(message)
      toast.error('Could not approve booking', message)
    } finally {
      setSubmitting(false)
    }
  }, [booking.id, booking.branchId, staffId, onChanged])

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
        body: JSON.stringify({
          action: 'reject',
          branchId: booking.branchId,
          rejectionReason: reason.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not reject this booking.')
      }
      toast.success('Booking rejected')
      onChanged()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not reject this booking.'
      setActionError(message)
      toast.error('Could not reject booking', message)
    } finally {
      setSubmitting(false)
    }
  }, [booking.id, booking.branchId, reason, onChanged])

  if (mode === 'move') {
    return <MoveBooking booking={booking} onBack={() => setMode('idle')} onChanged={onChanged} />
  }

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
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger id="staff-picker" className="w-full">
                <SelectValue placeholder={staff === null ? 'Loading staff…' : 'Select staff…'} />
              </SelectTrigger>
              <SelectContent position="popper">
                <StaffOptions staff={staff} startsNow={false} />
              </SelectContent>
            </Select>
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
          <ChangeBookingButtons
            disabled={submitting}
            onMove={() => {
              setMode('move')
              setActionError(null)
            }}
          />
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
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Reason shown to the customer…"
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

// The completion response the panels read.
interface CompletionResponse {
  invoice: { invoiceNumber: string }
  gemsEarned: number
  /** A membership session's free minutes after it; absent for a booking. */
  remainingMinutes?: number
}

/**
 * POST one of the booking's actions with the branch the page was rendered
 * for. Resolves the response data; throws with the server's message.
 */
async function postBookingAction<T>(
  booking: AdminBooking,
  action: 'start' | 'complete' | 'noshow' | 'reschedule' | 'cancel',
  body: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const res = await fetch(`/api/bookings/${booking.id}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ branchId: booking.branchId, ...body }),
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? fallback)
  }
  return json.data as T
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

const PRIMARY_ACTION =
  'w-full rounded-buttons bg-success px-4 py-2.5 font-ui text-sm text-canvas-white transition-colors hover:bg-success-dark disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none'
const SECONDARY_ACTION =
  'w-full rounded-buttons border border-cloud-gray px-4 py-2.5 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none'

// --- Confirmed: start, complete & checkout (payment picker), no-show ---
function ConfirmedActions({
  booking,
  onChanged,
  onCompleted,
}: {
  booking: AdminBooking
  onChanged: () => void
  onCompleted: (result: CompletionResult) => void
}) {
  // A membership session is paid for with its minutes, and starts before it
  // completes (membership-scheduling.md).
  const session = booking.isMembershipSession === true
  const [mode, setMode] = useState<'idle' | 'checkout' | 'move' | 'cancel'>('idle')
  const [busy, setBusy] = useState<'start' | 'noshow' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const start = useCallback(async () => {
    const fallback = session ? 'Could not start this session.' : 'Could not start this booking.'
    setBusy('start')
    setActionError(null)
    try {
      await postBookingAction(booking, 'start', {}, fallback)
      toast.success(session ? 'Session started' : 'Booking started')
      onChanged()
    } catch (err: unknown) {
      const message = messageOf(err, fallback)
      setActionError(message)
      toast.error(session ? 'Could not start session' : 'Could not start booking', message)
    } finally {
      setBusy(null)
    }
  }, [booking, session, onChanged])

  const markNoShow = useCallback(async () => {
    const fallback = 'Could not mark this booking as no-show.'
    setBusy('noshow')
    setActionError(null)
    try {
      await postBookingAction(booking, 'noshow', {}, fallback)
      toast.success('Marked as no-show')
      onChanged()
    } catch (err: unknown) {
      const message = messageOf(err, fallback)
      setActionError(message)
      toast.error('Could not mark no-show', message)
    } finally {
      setBusy(null)
    }
  }, [booking, onChanged])

  // A booking without its assignee waits for someone else (R1.7).
  const unassigned = assigneeLabel(booking.services) === null
  // A booking for a later day (IST) starts on that day; the server refuses
  // an earlier start too.
  const laterDay = booking.bookingDate.slice(0, 10) > todayISTDateString()

  if (mode === 'checkout') {
    return (
      <Checkout
        booking={booking}
        onBack={() => setMode('idle')}
        onChanged={onChanged}
        onCompleted={onCompleted}
      />
    )
  }
  if (mode === 'move') {
    return <MoveBooking booking={booking} onBack={() => setMode('idle')} onChanged={onChanged} />
  }
  if (mode === 'cancel') {
    return <CancelBooking booking={booking} onBack={() => setMode('idle')} onChanged={onChanged} />
  }

  return (
    <div className="space-y-3">
      <AssignStaffControl booking={booking} onChanged={onChanged} />
      {actionError && (
        <p className="font-sans text-xs text-error" role="alert">
          {actionError}
        </p>
      )}
      {unassigned ? (
        <p id="complete-hint" className="font-sans text-xs text-warm-gray">
          {session
            ? 'Assign who is doing this session before starting it.'
            : 'Assign who is doing this booking before completing it.'}
        </p>
      ) : null}
      {laterDay ? (
        <p id="later-hint" className="font-sans text-xs text-warm-gray">
          It starts on {formatDateDDMMYYYY(booking.bookingDate)}. To start it now, move it to today.
        </p>
      ) : null}
      {session ? (
        <>
          <button
            type="button"
            onClick={start}
            disabled={unassigned || laterDay || busy !== null}
            aria-busy={busy === 'start'}
            aria-describedby={
              unassigned ? 'complete-hint' : laterDay ? 'later-hint' : 'session-hint'
            }
            className={PRIMARY_ACTION}
          >
            {busy === 'start' ? 'Starting…' : 'Start Session'}
          </button>
          <p id="session-hint" className="font-sans text-xs text-warm-gray">
            Paid with the membership. Its minutes stay held until you complete the session.
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setMode('checkout')
              setActionError(null)
            }}
            disabled={unassigned || busy !== null}
            aria-describedby={unassigned ? 'complete-hint' : undefined}
            className={PRIMARY_ACTION}
          >
            Complete & Checkout
          </button>
          <button
            type="button"
            onClick={start}
            disabled={unassigned || laterDay || busy !== null}
            aria-busy={busy === 'start'}
            aria-describedby={unassigned ? 'complete-hint' : laterDay ? 'later-hint' : undefined}
            className={SECONDARY_ACTION}
          >
            {busy === 'start' ? 'Starting…' : 'Start Service'}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={markNoShow}
        disabled={busy !== null}
        aria-busy={busy === 'noshow'}
        className="w-full rounded-buttons border border-error/40 px-4 py-2.5 font-ui text-sm text-error transition-colors hover:bg-error/5 disabled:opacity-50 motion-reduce:transition-none"
      >
        {busy === 'noshow' ? 'Working…' : 'Mark No-Show'}
      </button>
      <ChangeBookingButtons
        disabled={busy !== null}
        onMove={() => {
          setMode('move')
          setActionError(null)
        }}
        onCancel={() => {
          setMode('cancel')
          setActionError(null)
        }}
      />
    </div>
  )
}

// --- In progress: complete & checkout, or complete the membership session ---
function InProgressActions({
  booking,
  onChanged,
  onCompleted,
}: {
  booking: AdminBooking
  onChanged: () => void
  onCompleted: (result: CompletionResult) => void
}) {
  const session = booking.isMembershipSession === true
  const [mode, setMode] = useState<'idle' | 'checkout'>('idle')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const unassigned = assigneeLabel(booking.services) === null

  // A session takes no payment: completing it uses its held minutes and
  // issues the ₹0 session invoice.
  const completeSession = useCallback(async () => {
    const fallback = 'Could not complete this session.'
    setBusy(true)
    setActionError(null)
    try {
      const data = await postBookingAction<CompletionResponse>(booking, 'complete', {}, fallback)
      toast.success(`Session completed · invoice ${data.invoice.invoiceNumber}`)
      onCompleted({
        invoiceNumber: data.invoice.invoiceNumber,
        gemsEarned: 0,
        remainingMinutes: data.remainingMinutes ?? null,
      })
      onChanged()
    } catch (err: unknown) {
      const message = messageOf(err, fallback)
      setActionError(message)
      toast.error('Could not complete session', message)
    } finally {
      setBusy(false)
    }
  }, [booking, onCompleted, onChanged])

  if (mode === 'checkout') {
    return (
      <Checkout
        booking={booking}
        onBack={() => setMode('idle')}
        onChanged={onChanged}
        onCompleted={onCompleted}
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="font-sans text-sm text-cocoa-dark">
        {session ? 'Session in progress' : 'In progress'}
        {booking.startedAt ? (
          <span className="text-warm-gray"> · started {formatDateTimeIST(booking.startedAt)}</span>
        ) : null}
      </p>
      {/* Someone has to be named on the invoice (R1.7). */}
      {unassigned ? (
        <>
          <AssignStaffControl booking={booking} onChanged={onChanged} />
          <p id="complete-hint" className="font-sans text-xs text-warm-gray">
            {session
              ? 'Assign who is doing this session before completing it.'
              : 'Assign who is doing this booking before completing it.'}
          </p>
        </>
      ) : null}
      {actionError && (
        <p className="font-sans text-xs text-error" role="alert">
          {actionError}
        </p>
      )}
      {session ? (
        <>
          <button
            type="button"
            onClick={completeSession}
            disabled={unassigned || busy}
            aria-busy={busy}
            aria-describedby={unassigned ? 'complete-hint' : 'session-hint'}
            className={PRIMARY_ACTION}
          >
            {busy ? 'Completing…' : 'Complete Session'}
          </button>
          <p id="session-hint" className="font-sans text-xs text-warm-gray">
            Uses {minutesToHM(booking.totalDurationMinutes ?? 0)} of the membership and issues a ₹0
            session invoice. No payment and no gems.
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setMode('checkout')
            setActionError(null)
          }}
          disabled={unassigned}
          aria-describedby={unassigned ? 'complete-hint' : undefined}
          className={PRIMARY_ACTION}
        >
          Complete & Checkout
        </button>
      )}
    </div>
  )
}

// --- Checkout: the payment method, then complete with the service invoice ---
function Checkout({
  booking,
  onBack,
  onChanged,
  onCompleted,
}: {
  booking: AdminBooking
  onBack: () => void
  onChanged: () => void
  onCompleted: (result: CompletionResult) => void
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const complete = useCallback(async () => {
    const fallback = 'Could not complete this booking.'
    setSubmitting(true)
    setActionError(null)
    try {
      const data = await postBookingAction<CompletionResponse>(
        booking,
        'complete',
        { paymentMethod },
        fallback,
      )
      toast.success(`Booking completed · invoice ${data.invoice.invoiceNumber}`)
      onCompleted({
        invoiceNumber: data.invoice.invoiceNumber,
        gemsEarned: data.gemsEarned,
        remainingMinutes: null,
      })
      onChanged()
    } catch (err: unknown) {
      const message = messageOf(err, fallback)
      setActionError(message)
      toast.error('Could not complete booking', message)
    } finally {
      setSubmitting(false)
    }
  }, [booking, paymentMethod, onCompleted, onChanged])

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-ui text-[10px] uppercase tracking-wider text-dusty-gray">
          Payment Method
        </legend>
        <RadioGroup
          value={paymentMethod}
          onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
          aria-label="Payment method"
        >
          {PAYMENT_METHODS.map((pm) => (
            <div key={pm.value} className="flex items-center gap-2">
              <RadioGroupItem id={`pay-${pm.value}`} value={pm.value} />
              <Label
                htmlFor={`pay-${pm.value}`}
                className="cursor-pointer font-sans text-sm text-cocoa-dark"
              >
                {pm.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
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
        className={PRIMARY_ACTION}
      >
        {submitting ? 'Generating invoice…' : 'Complete & Generate Invoice'}
      </button>
      <button type="button" onClick={onBack} disabled={submitting} className={SECONDARY_ACTION}>
        Cancel
      </button>
    </div>
  )
}

const DANGER_OUTLINE_ACTION =
  'w-full rounded-buttons border border-error/40 px-4 py-2.5 font-ui text-sm text-error transition-colors hover:bg-error/5 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none'
const DANGER_ACTION =
  'w-full rounded-buttons bg-error px-4 py-2.5 font-ui text-sm text-canvas-white transition-colors hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none'
const FIELD_LABEL = 'font-ui text-[10px] uppercase tracking-wider text-dusty-gray'

// --- Pending or confirmed: the salon moves or cancels it (MS-09) ---
function ChangeBookingButtons({
  disabled,
  onMove,
  onCancel,
}: {
  disabled: boolean
  onMove: () => void
  /** Absent for a pending booking: rejecting it declines the request. */
  onCancel?: () => void
}) {
  return (
    <div className="space-y-2 border-t border-cloud-gray pt-3">
      <button type="button" onClick={onMove} disabled={disabled} className={SECONDARY_ACTION}>
        Move booking
      </button>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className={DANGER_OUTLINE_ACTION}
        >
          Cancel booking
        </button>
      ) : null}
    </div>
  )
}

// The move response the panel reads.
interface MoveResponse {
  /** Its person can't take the new time, so it waits for someone else. */
  needsStaff: boolean
}

/**
 * The salon moves the booking to another date and start time, such as off a
 * day the branch closed. It keeps its services and length, and its person
 * when they can take the new time; otherwise it waits for someone else. The
 * move isn't counted against the customer's reschedule limit.
 */
function MoveBooking({
  booking,
  onBack,
  onChanged,
}: {
  booking: AdminBooking
  onBack: () => void
  onChanged: () => void
}) {
  const currentDate = booking.bookingDate.slice(0, 10)
  const currentTime = booking.startTime.slice(0, 5)
  const [bookingDate, setBookingDate] = useState(currentDate)
  const [startTime, setStartTime] = useState(currentTime)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const unchanged = bookingDate === currentDate && startTime === currentTime

  const move = useCallback(async () => {
    const fallback = 'Could not move this booking.'
    if (!(bookingDate && startTime)) {
      setActionError('Choose the new date and start time.')
      return
    }
    setSubmitting(true)
    setActionError(null)
    try {
      const data = await postBookingAction<MoveResponse>(
        booking,
        'reschedule',
        { bookingDate, startTime },
        fallback,
      )
      toast.success(
        `Booking moved to ${formatDateDDMMYYYY(bookingDate)} at ${formatTime12h(startTime)}`,
      )
      if (data.needsStaff) {
        toast.warning('Its staff member can’t take the new time. Assign someone else.')
      }
      onChanged()
    } catch (err: unknown) {
      const message = messageOf(err, fallback)
      setActionError(message)
      toast.error('Could not move booking', message)
    } finally {
      setSubmitting(false)
    }
  }, [booking, bookingDate, startTime, onChanged])

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="move-date" className={FIELD_LABEL}>
          New date
        </label>
        <Input
          id="move-date"
          type="date"
          min={todayISTDateString()}
          value={bookingDate}
          onChange={(event) => setBookingDate(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="move-time" className={FIELD_LABEL}>
          New start time
        </label>
        <TimeSelect
          id="move-time"
          value={startTime}
          onChange={setStartTime}
          ariaLabel="New start time"
          step={30}
          className="w-full"
        />
      </div>
      <p className="font-sans text-[11px] text-dusty-gray">
        It keeps its services and length. Let the customer know the new time.
      </p>

      {actionError && (
        <p className="font-sans text-xs text-error" role="alert">
          {actionError}
        </p>
      )}

      <button
        type="button"
        onClick={move}
        disabled={submitting || unchanged}
        aria-busy={submitting}
        className={PRIMARY_ACTION}
      >
        {submitting ? 'Moving…' : 'Move Booking'}
      </button>
      <button type="button" onClick={onBack} disabled={submitting} className={SECONDARY_ACTION}>
        Back
      </button>
    </div>
  )
}

/**
 * The salon cancels the booking, saying why. It is never counted as the
 * customer's late cancellation; gems it was booked with go back, and a
 * membership session's held minutes return to the membership.
 */
function CancelBooking({
  booking,
  onBack,
  onChanged,
}: {
  booking: AdminBooking
  onBack: () => void
  onChanged: () => void
}) {
  const session = booking.isMembershipSession === true
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const cancel = useCallback(async () => {
    const fallback = 'Could not cancel this booking.'
    if (!reason.trim()) {
      setActionError('A cancellation reason is required.')
      return
    }
    setSubmitting(true)
    setActionError(null)
    try {
      await postBookingAction(booking, 'cancel', { reason: reason.trim() }, fallback)
      toast.success('Booking cancelled')
      onChanged()
    } catch (err: unknown) {
      const message = messageOf(err, fallback)
      setActionError(message)
      toast.error('Could not cancel booking', message)
    } finally {
      setSubmitting(false)
    }
  }, [booking, reason, onChanged])

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="cancel-reason" className={FIELD_LABEL}>
          Cancellation Reason
        </label>
        <Textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="Reason shown to the customer…"
        />
      </div>

      <p className="font-sans text-[11px] text-dusty-gray">
        The customer sees this reason on their booking. It isn’t counted against them
        {session ? ', and the session’s minutes go back to the membership.' : '.'}
      </p>

      {actionError && (
        <p className="font-sans text-xs text-error" role="alert">
          {actionError}
        </p>
      )}

      <button
        type="button"
        onClick={cancel}
        disabled={submitting}
        aria-busy={submitting}
        className={DANGER_ACTION}
      >
        {submitting ? 'Cancelling…' : 'Confirm Cancellation'}
      </button>
      <button type="button" onClick={onBack} disabled={submitting} className={SECONDARY_ACTION}>
        Back
      </button>
    </div>
  )
}

// --- Confirmed: choose or change who does the booking (R1.7) ---
function AssignStaffControl({
  booking,
  onChanged,
}: {
  booking: AdminBooking
  onChanged: () => void
}) {
  const staff = useBranchStaff(booking.id)
  const current = sharedAssigneeId(booking)
  const [staffId, setStaffId] = useState(current)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Follow the booking after a reload.
  useEffect(() => {
    setStaffId(current)
  }, [current])

  const assign = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'assign', branchId: booking.branchId, staffId }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not assign this staff member.')
      }
      const name = staff?.find((s) => s.id === staffId)?.name
      toast.success(name ? `${name} assigned` : 'Staff assigned')
      onChanged()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not assign this staff member.'
      setError(message)
      toast.error('Could not assign staff', message)
    } finally {
      setSubmitting(false)
    }
  }, [booking.id, booking.branchId, staffId, staff, onChanged])

  return (
    <div className="flex flex-col gap-1.5 border-b border-cloud-gray pb-3">
      <label
        htmlFor="assign-staff"
        className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray"
      >
        {current ? 'Assigned staff' : 'Assign staff'}
      </label>
      <Select value={staffId} onValueChange={setStaffId}>
        <SelectTrigger id="assign-staff" className="w-full">
          <SelectValue placeholder={staff === null ? 'Loading staff…' : 'Select staff…'} />
        </SelectTrigger>
        <SelectContent position="popper">
          {/* A running booking moves its work to the new person now. */}
          <StaffOptions staff={staff} startsNow={booking.status === 'in_progress'} />
        </SelectContent>
      </Select>
      {error && (
        <p className="font-sans text-xs text-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={assign}
        disabled={submitting || !staffId || staffId === current}
        aria-busy={submitting}
        className="w-full rounded-buttons border border-cloud-gray px-4 py-2 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
      >
        {submitting ? 'Assigning…' : current ? 'Change staff' : 'Assign'}
      </button>
    </div>
  )
}

// --- A booking waiting for someone else (R1.7), or held up (slice 2b) ---
function ReassignmentNotice({ work }: { work: AdminBookingReassignment }) {
  return (
    <section
      aria-labelledby="reassignment-title"
      className="rounded-cards border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <h2
        id="reassignment-title"
        className="flex items-center gap-2 font-ui text-sm text-cocoa-dark"
      >
        <Icon icon={TriangleAlert} decorative size={16} className="text-deep-gold" />
        {work.heldUp ? 'This booking is held up' : 'This booking needs someone else'}
      </h2>
      <p className="mt-1 font-sans text-sm text-warm-gray">
        {reassignmentReasonText(work)}{' '}
        {work.heldUp
          ? 'Start it once they’re free, or assign someone else under Actions.'
          : 'Assign someone under Actions.'}{' '}
        The customer’s booking is unchanged.
      </p>
    </section>
  )
}

// --- Completed: invoice + gems, or the session's minutes (read-only) ---
function CompletedState({
  completion,
  session,
}: {
  completion: CompletionResult | null
  /** A membership session: paid with minutes, so it earns no gems. */
  session: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-cards border border-success/30 bg-success/10 px-3 py-3">
        <p className="mb-1 font-ui text-sm text-success-dark">
          {session ? 'Session completed' : 'Booking completed'}
        </p>
        {completion ? (
          <ul className="space-y-1 font-sans text-sm text-success-dark">
            <li className="flex items-center gap-1.5">
              <Icon icon={Check} decorative size={14} />
              <span>
                {session ? '₹0 session invoice ' : 'Invoice '}
                <span className="font-mono">{completion.invoiceNumber}</span>{' '}
                {session ? 'issued' : 'generated'}
              </span>
            </li>
            {session ? (
              completion.remainingMinutes === null ? null : (
                <li className="flex items-center gap-1.5">
                  <Icon icon={Check} decorative size={14} />
                  <span>{minutesToHM(completion.remainingMinutes)} left on the membership</span>
                </li>
              )
            ) : (
              <li className="flex items-center gap-1.5">
                <Icon icon={Check} decorative size={14} />
                <span>+{completion.gemsEarned} gems awarded</span>
              </li>
            )}
          </ul>
        ) : (
          <p className="font-sans text-sm text-success-dark">
            {session
              ? 'This session was completed and its ₹0 session invoice issued.'
              : 'This booking has been completed and an invoice was generated.'}
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
function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
