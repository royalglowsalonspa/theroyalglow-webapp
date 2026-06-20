/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Leave Queue
 * Scope        : Admin Portal — Leave Management
 *
 * Description  : Interactive leave request queue with approve/reject
 *                workflows. Surfaces booking conflicts when approving
 *                leave on dates with confirmed appointments.
 *
 * Responsibilities :
 * - Fetch and display leave requests filtered by status tab
 * - Provide approve/reject actions with rejection reason input
 * - Surface conflicting bookings after approval for reassignment
 *
 * Features / Functionality :
 * - Status tabs (pending, approved, rejected, all)
 * - Conflict detection warning on approval (shows affected bookings)
 * - Leave type labels and status badge styling
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Queue Management Component)
 *
 * Dependencies : admin bookings lib (formatDateDDMMYYYY, formatTime12h), React hooks
 *
 * Notes        :
 * - Conflicts are returned by the PATCH API after approval
 ************************************************************/

'use client'

import { formatDateDDMMYYYY, formatTime12h } from '@/lib/admin/bookings'
import { useCallback, useEffect, useState } from 'react'

// ─── API shapes (mirror GET /api/leave + PATCH /api/leave/[id]) ───

interface LeaveRequest {
  id: string
  staffId: string
  staffName: string
  leaveType: string
  date: string
  reason: string | null
  approvalStatus: 'pending' | 'approved' | 'rejected'
  rejectionReason: string | null
  createdAt: string
}

interface ConflictBooking {
  bookingId: string
  bookingNumber: string
  startTime: string
  customerName: string
  serviceNames: string[]
}

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
] as const

type TabValue = (typeof TABS)[number]['value']

const LEAVE_TYPE_LABEL: Record<string, string> = {
  sick: 'Sick Leave',
  casual: 'Casual Leave',
  personal: 'Personal Leave',
  other: 'Other',
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

export function LeaveQueue() {
  const [tab, setTab] = useState<TabValue>('pending')
  const [leave, setLeave] = useState<LeaveRequest[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Conflicts surfaced after a successful approval, keyed by leave id.
  const [conflictsById, setConflictsById] = useState<Record<string, ConflictBooking[]>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = tab === 'all' ? '' : `?status=${tab}`
      const res = await fetch(`/api/leave${qs}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load leave requests.')
      }
      setLeave(json.data.leave as LeaveRequest[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load leave requests.')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  const handleApproved = (leaveId: string, conflicts: ConflictBooking[]) => {
    setConflictsById((prev) => ({ ...prev, [leaveId]: conflicts }))
    load()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-cocoa-dark tracking-tight">Leave Requests</h1>
        <p className="font-sans text-sm text-dusty-gray mt-0.5">
          Approve or reject staff time off. Approving surfaces any confirmed bookings that need
          reassigning.
        </p>
      </div>

      {/* Status tabs */}
      <div
        className="flex flex-wrap gap-1 border-b border-cloud-gray"
        role="tablist"
        aria-label="Leave status"
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
      ) : !leave || leave.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="space-y-3">
          {leave.map((request) => (
            <li key={request.id}>
              <LeaveCard
                request={request}
                conflicts={conflictsById[request.id]}
                onApproved={(conflicts) => handleApproved(request.id, conflicts)}
                onRejected={load}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LeaveCard({
  request,
  conflicts,
  onApproved,
  onRejected,
}: {
  request: LeaveRequest
  conflicts: ConflictBooking[] | undefined
  onApproved: (conflicts: ConflictBooking[]) => void
  onRejected: () => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const isPending = request.approvalStatus === 'pending'

  const decide = async (
    body: { action: 'approve' } | { action: 'reject'; rejectionReason: string },
  ) => {
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/leave/${request.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not update the request.')
      }
      if (body.action === 'approve') {
        onApproved((json.data.conflicts ?? []) as ConflictBooking[])
      } else {
        onRejected()
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not update the request.')
    } finally {
      setBusy(false)
    }
  }

  const confirmReject = () => {
    if (!rejectionReason.trim()) {
      setActionError('A rejection reason is required.')
      return
    }
    decide({ action: 'reject', rejectionReason: rejectionReason.trim() })
  }

  return (
    <article className="rounded-[6px] border border-cloud-gray bg-canvas-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-sans text-[15px] text-cocoa-dark">
            {request.staffName}
            <span className="text-dusty-gray">
              {' · '}
              {LEAVE_TYPE_LABEL[request.leaveType] ?? request.leaveType}
            </span>
          </h2>
          <p className="font-sans text-sm text-warm-gray mt-0.5">
            <time dateTime={request.date}>{formatDateDDMMYYYY(request.date)}</time>
          </p>
          {request.reason && (
            <p className="font-sans text-sm text-dusty-gray mt-1.5">“{request.reason}”</p>
          )}
        </div>

        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-ui uppercase tracking-[0.5px] whitespace-nowrap ${
            STATUS_STYLES[request.approvalStatus] ?? 'bg-cloud-gray text-warm-gray'
          }`}
        >
          {request.approvalStatus}
        </span>
      </div>

      {request.approvalStatus === 'rejected' && request.rejectionReason && (
        <p className="font-sans text-sm text-red-700 mt-3 border-t border-cloud-gray pt-3">
          <span className="font-ui text-[11px] uppercase tracking-[0.5px] text-red-600 mr-1.5">
            Reason
          </span>
          {request.rejectionReason}
        </p>
      )}

      {conflicts !== undefined && <ConflictWarning conflicts={conflicts} date={request.date} />}

      {actionError && (
        <p className="font-sans text-sm text-error mt-3" role="alert">
          {actionError}
        </p>
      )}

      {isPending && (
        <div className="mt-4 border-t border-cloud-gray pt-3">
          {rejecting ? (
            <div className="space-y-2">
              <label
                htmlFor={`reject-reason-${request.id}`}
                className="block font-ui text-[11px] uppercase tracking-wider text-dusty-gray"
              >
                Rejection reason
              </label>
              <textarea
                id={`reject-reason-${request.id}`}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
                required
                aria-required="true"
                className="w-full px-3 py-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
                placeholder="Let the staff member know why."
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirmReject}
                  disabled={busy}
                  className="h-9 px-4 rounded-[6px] bg-red-600 text-white text-sm font-ui hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busy ? 'Rejecting…' : 'Confirm Reject'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejecting(false)
                    setActionError(null)
                  }}
                  disabled={busy}
                  className="h-9 px-4 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-warm-gray hover:bg-cloud-gray transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => decide({ action: 'approve' })}
                disabled={busy}
                className="h-9 px-4 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? 'Working…' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejecting(true)
                  setActionError(null)
                }}
                disabled={busy}
                className="h-9 px-4 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-warm-gray hover:bg-cloud-gray transition-colors disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function ConflictWarning({
  conflicts,
  date,
}: {
  conflicts: ConflictBooking[]
  date: string
}) {
  if (conflicts.length === 0) {
    return (
      <p className="font-sans text-sm text-emerald-700 mt-3 border-t border-cloud-gray pt-3">
        ✓ Leave approved — no confirmed bookings on {formatDateDDMMYYYY(date)}.
      </p>
    )
  }

  return (
    <div className="mt-3 rounded-[6px] border border-amber-300 bg-amber-50 px-4 py-3" role="alert">
      <p className="font-ui text-[12px] uppercase tracking-[0.5px] text-amber-800 mb-1.5">
        ⚠ {conflicts.length} confirmed booking
        {conflicts.length === 1 ? '' : 's'} on {formatDateDDMMYYYY(date)}
      </p>
      <p className="font-sans text-[13px] text-amber-800 mb-2">
        Reassign these to another staff member from the booking detail.
      </p>
      <ul className="space-y-1">
        {conflicts.map((c) => (
          <li key={c.bookingId} className="font-sans text-[13px] text-amber-900">
            <span className="font-ui">{formatTime12h(c.startTime)}</span>
            {' — '}
            {c.customerName}
            {' · '}
            {c.serviceNames.join(', ')}
            <span className="text-amber-700"> (#{c.bookingNumber})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LoadingState() {
  return (
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading leave requests…</span>
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
      <p className="font-sans text-sm text-cocoa-dark mb-1">No {label} leave requests</p>
      <p className="font-sans text-xs text-dusty-gray">Staff leave requests will appear here.</p>
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
