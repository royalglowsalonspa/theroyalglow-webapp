/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Leave Queue
 * Scope        : Admin Portal — Leave Management
 *
 * Description  : Leave request queue rebuilt on the admin design-system
 *                primitives. Status filtering uses the FilterBar tabbed
 *                control, request statuses render via StatusBadge, and loading
 *                / empty / error conditions use the shared state presenters.
 *                Fetch orchestration + timeout is delegated to useAsyncData.
 *                The approve/reject workflow (with rejection reason) and the
 *                booking-conflict surfacing are preserved unchanged. Consumes
 *                GET /api/leave + PATCH /api/leave/[id] as-is.
 *
 * Responsibilities :
 * - Fetch and display leave requests filtered by status tab
 * - Provide approve/reject actions with rejection reason input
 * - Surface conflicting bookings after approval for reassignment
 *
 * Features / Functionality :
 * - Status tabs (pending, approved, rejected, all) via the FilterBar
 * - Conflict detection warning on approval (shows affected bookings)
 * - Leave type labels and StatusBadge status pills
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                Tailwind CSS v4 (Brand Tokens), lucide-react
 * Layer        : Presentation (Queue Management Component)
 *
 * Dependencies : @/components/ui/filter-bar, @/components/ui/status-badge,
 *                @/components/ui/state/*, @/components/ui/use-async-data,
 *                @/components/ui/icon, @/lib/admin/bookings, React hooks
 *
 * Notes        : Presentation-layer only — no API/RBAC/data-model/business-logic
 *                changes. Uses ONLY semantic Brand-Token utilities and lucide
 *                icons via the Icon wrapper — no emoji / hex / raw-palette
 *                literals. Conflicts are returned by the PATCH API after
 *                approval. Every pre-redesign field and action is preserved
 *                (Req 17.6, 17.7).
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { FilterBar } from '@/components/ui/filter-bar'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateDDMMYYYY, formatTime12h } from '@/lib/admin/bookings'
import { CheckCircle2, Palmtree, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

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

async function fetchLeave(tab: TabValue): Promise<LeaveRequest[]> {
  const qs = tab === 'all' ? '' : `?status=${tab}`
  const res = await fetch(`/api/leave${qs}`)
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load leave requests.')
  }
  return json.data.leave as LeaveRequest[]
}

export function LeaveQueue() {
  const [tab, setTab] = useState<TabValue>('pending')
  // Conflicts surfaced after a successful approval, keyed by leave id.
  const [conflictsById, setConflictsById] = useState<Record<string, ConflictBooking[]>>({})

  const fetcher = useCallback(() => fetchLeave(tab), [tab])
  const { state, retry } = useAsyncData(fetcher)

  // Re-request when the tab changes; the initial mount fetch is owned by the
  // hook, so skip the very first effect run to avoid a duplicate request.
  const didMount = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tab` is an intentional re-run trigger (useAsyncData holds the latest fetcher closure in a ref and does not auto-re-run on its identity change)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    retry()
  }, [tab, retry])

  const handleApproved = (leaveId: string, conflicts: ConflictBooking[]) => {
    setConflictsById((prev) => ({ ...prev, [leaveId]: conflicts }))
    retry()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Leave Requests</h1>
        <p className="mt-0.5 font-sans text-sm text-dusty-gray">
          Approve or reject staff time off. Approving surfaces any confirmed bookings that need
          reassigning.
        </p>
      </div>

      {/* Status tabs */}
      <FilterBar
        config={{
          tabs: { ariaLabel: 'Leave status', options: [...TABS], value: tab },
        }}
        onTabChange={(value) => setTab(value as TabValue)}
      />

      {state.status === 'loading' ? (
        <Skeleton rows={5} variant="card" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={Palmtree}
          title={`No ${tab === 'all' ? '' : tab} leave requests`.replace('  ', ' ')}
          message="Staff leave requests will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {state.data.map((request) => (
            <li key={request.id}>
              <LeaveCard
                request={request}
                conflicts={conflictsById[request.id]}
                onApproved={(conflicts) => handleApproved(request.id, conflicts)}
                onRejected={retry}
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
    <article className="rounded-cards border border-cloud-gray bg-canvas-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-sans text-[15px] text-cocoa-dark">
            {request.staffName}
            <span className="text-dusty-gray">
              {' · '}
              {LEAVE_TYPE_LABEL[request.leaveType] ?? request.leaveType}
            </span>
          </h2>
          <p className="mt-0.5 font-sans text-sm text-warm-gray">
            <time dateTime={request.date}>{formatDateDDMMYYYY(request.date)}</time>
          </p>
          {request.reason && (
            <p className="mt-1.5 font-sans text-sm text-dusty-gray">“{request.reason}”</p>
          )}
        </div>

        <StatusBadge status={request.approvalStatus} className="whitespace-nowrap" />
      </div>

      {request.approvalStatus === 'rejected' && request.rejectionReason && (
        <p className="mt-3 border-t border-cloud-gray pt-3 font-sans text-sm text-error">
          <span className="mr-1.5 font-ui text-[11px] uppercase tracking-[0.5px] text-error">
            Reason
          </span>
          {request.rejectionReason}
        </p>
      )}

      {conflicts !== undefined && <ConflictWarning conflicts={conflicts} date={request.date} />}

      {actionError && (
        <p className="mt-3 font-sans text-sm text-error" role="alert">
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
                className="w-full rounded-buttons border border-outline-gray bg-canvas-white px-3 py-2 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
                placeholder="Let the staff member know why."
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirmReject}
                  disabled={busy}
                  className="h-9 rounded-buttons bg-error px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-4 font-ui text-sm text-warm-gray transition-colors hover:bg-cloud-gray disabled:opacity-60"
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
                className="h-9 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-60"
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
                className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-4 font-ui text-sm text-warm-gray transition-colors hover:bg-cloud-gray disabled:opacity-60"
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
      <p className="mt-3 flex items-center gap-1.5 border-t border-cloud-gray pt-3 font-sans text-sm text-success-dark">
        <Icon icon={CheckCircle2} decorative size={16} />
        Leave approved — no confirmed bookings on {formatDateDDMMYYYY(date)}.
      </p>
    )
  }

  return (
    <div
      className="mt-3 rounded-cards border border-warning/40 bg-warning/10 px-4 py-3"
      role="alert"
    >
      <p className="mb-1.5 flex items-center gap-1.5 font-ui text-xs uppercase tracking-[0.5px] text-warm-gray">
        <Icon icon={TriangleAlert} decorative size={14} />
        {conflicts.length} confirmed booking
        {conflicts.length === 1 ? '' : 's'} on {formatDateDDMMYYYY(date)}
      </p>
      <p className="mb-2 font-sans text-[13px] text-warm-gray">
        Reassign these to another staff member from the booking detail.
      </p>
      <ul className="space-y-1">
        {conflicts.map((c) => (
          <li key={c.bookingId} className="font-sans text-[13px] text-cocoa-dark">
            <span className="font-ui">{formatTime12h(c.startTime)}</span>
            {' — '}
            {c.customerName}
            {' · '}
            {c.serviceNames.join(', ')}
            <span className="text-dusty-gray"> (#{c.bookingNumber})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
