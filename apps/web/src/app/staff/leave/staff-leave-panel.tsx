'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { formatDateDDMMYYYY } from '@/lib/admin/bookings'

// ─── API shapes (mirror GET/POST /api/staff/leave + DELETE /api/staff/leave/[id]) ───

interface LeaveRow {
  id: string
  leaveType: string
  date: string
  reason: string | null
  approvalStatus: 'pending' | 'approved' | 'rejected'
  rejectionReason: string | null
  createdAt: string
}

const LEAVE_TYPE_OPTIONS = [
  { value: 'sick', label: 'Sick Leave' },
  { value: 'casual', label: 'Casual Leave' },
  { value: 'personal', label: 'Personal Leave' },
  { value: 'other', label: 'Other' },
] as const

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

export function StaffLeavePanel() {
  const [leave, setLeave] = useState<LeaveRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/staff/leave')
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load your leave.')
      }
      setLeave(json.data.leave as LeaveRow[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load your leave.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <RequestLeaveForm onSubmitted={load} />

      <section aria-labelledby="leave-history-heading">
        <h2
          id="leave-history-heading"
          className="font-display text-[20px] text-cocoa-dark tracking-tight mb-4"
        >
          Leave history
        </h2>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !leave || leave.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {leave.map((row) => (
              <li key={row.id}>
                <LeaveItem row={row} onWithdrawn={load} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function RequestLeaveForm({ onSubmitted }: { onSubmitted: () => void }) {
  const typeId = useId()
  const dateId = useId()
  const reasonId = useId()

  const [leaveType, setLeaveType] = useState<string>('personal')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setFormError(null)
      setSuccess(false)
      if (!date) {
        setFormError('Please choose a date.')
        return
      }
      setSubmitting(true)
      try {
        const body: { leaveType: string; date: string; reason?: string } = {
          leaveType,
          date,
        }
        if (reason.trim()) {
          body.reason = reason.trim()
        }
        const res = await fetch('/api/staff/leave', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not submit your request.')
        }
        setDate('')
        setReason('')
        setLeaveType('personal')
        setSuccess(true)
        onSubmitted()
      } catch (err: unknown) {
        setFormError(
          err instanceof Error ? err.message : 'Could not submit your request.',
        )
      } finally {
        setSubmitting(false)
      }
    },
    [leaveType, date, reason, onSubmitted],
  )

  return (
    <section className="rounded-[6px] border border-cloud-gray bg-canvas-white p-5">
      <h2 className="font-display text-[20px] text-cocoa-dark tracking-tight mb-4">
        Request leave
      </h2>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={typeId}
              className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray"
            >
              Leave type
            </label>
            <select
              id={typeId}
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
            >
              {LEAVE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={dateId}
              className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray"
            >
              Date
            </label>
            <input
              id={dateId}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              aria-required="true"
              className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={reasonId}
            className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray"
          >
            Reason (optional)
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full px-3 py-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold resize-none"
            placeholder="Add any context for your manager."
          />
        </div>

        {formError && (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        )}
        {success && (
          <p className="font-sans text-sm text-emerald-700" role="status">
            Leave request submitted.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </form>
    </section>
  )
}

function LeaveItem({
  row,
  onWithdrawn,
}: {
  row: LeaveRow
  onWithdrawn: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const isPending = row.approvalStatus === 'pending'

  const withdraw = useCallback(async () => {
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/staff/leave/${row.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not withdraw the request.')
      }
      onWithdrawn()
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Could not withdraw the request.',
      )
      setBusy(false)
    }
  }, [row.id, onWithdrawn])

  return (
    <article className="rounded-[6px] border border-cloud-gray bg-canvas-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-[15px] text-cocoa-dark">
            {LEAVE_TYPE_LABEL[row.leaveType] ?? row.leaveType}
            <span className="text-dusty-gray">
              {' · '}
              <time dateTime={row.date}>{formatDateDDMMYYYY(row.date)}</time>
            </span>
          </p>
          {row.reason && (
            <p className="font-sans text-sm text-dusty-gray mt-1">“{row.reason}”</p>
          )}
          {row.approvalStatus === 'rejected' && row.rejectionReason && (
            <p className="font-sans text-sm text-red-700 mt-1.5">
              <span className="font-ui text-[11px] uppercase tracking-[0.5px] text-red-600 mr-1.5">
                Reason
              </span>
              {row.rejectionReason}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-ui uppercase tracking-[0.5px] ${
              STATUS_STYLES[row.approvalStatus] ?? 'bg-cloud-gray text-warm-gray'
            }`}
          >
            {row.approvalStatus}
          </span>
          {isPending && (
            <button
              type="button"
              onClick={withdraw}
              disabled={busy}
              className="font-ui text-xs text-warm-gray hover:text-error transition-colors disabled:opacity-50"
            >
              {busy ? 'Withdrawing…' : 'Withdraw'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <p className="font-sans text-sm text-error mt-2" role="alert">
          {actionError}
        </p>
      )}
    </article>
  )
}

function LoadingState() {
  return (
    <div
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-12 justify-center"
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading your leave…</span>
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
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-12 text-center">
      <p className="font-sans text-sm text-cocoa-dark mb-1">No leave requests yet</p>
      <p className="font-sans text-xs text-dusty-gray">
        Use the form above to request time off.
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
