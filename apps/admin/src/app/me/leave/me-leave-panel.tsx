/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : MeLeavePanel (staff self-service)
 * Scope        : Admin Portal — Staff Self-Service
 *
 * Description  : Client component providing the leave request form and history,
 *                rebuilt on the admin design-system primitives. Request
 *                statuses render via StatusBadge, and the history loading /
 *                empty / error conditions use the shared state presenters with
 *                useAsyncData driving fetch orchestration + timeout. Staff
 *                submit new leave requests and withdraw pending ones. Consumes
 *                GET/POST /api/me/leave + DELETE /api/me/leave/[id] as-is.
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4 (Brand Tokens)
 * Layer        : Presentation
 *
 * Dependencies : @/components/ui/status-badge, @/components/ui/state/*,
 *                @/components/ui/use-async-data, @/lib/admin/bookings, React hooks
 *
 * Notes        : Presentation-layer only — no API/RBAC/data-model/business-logic
 *                changes. Uses ONLY semantic Brand-Token utilities — no emoji /
 *                hex / raw-palette literals. Approval/rejection is handled by
 *                managers at /leave. Every pre-redesign field and action is
 *                preserved (Req 17.6, 17.7).
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateDDMMYYYY } from '@/lib/admin/bookings'
import { Palmtree } from 'lucide-react'
import { useCallback, useId, useState } from 'react'

// ─── API shapes (mirror GET/POST /api/me/leave + DELETE /api/me/leave/[id]) ───

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

async function fetchMyLeave(): Promise<LeaveRow[]> {
  const res = await fetch('/api/me/leave')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load your leave.')
  }
  return json.data.leave as LeaveRow[]
}

export function MeLeavePanel() {
  const { state, retry } = useAsyncData(fetchMyLeave)

  return (
    <div className="space-y-6">
      <RequestLeaveForm onSubmitted={retry} />

      <section aria-labelledby="leave-history-heading">
        <h2
          id="leave-history-heading"
          className="mb-4 font-display text-[20px] tracking-tight text-cocoa-dark"
        >
          Leave history
        </h2>

        {state.status === 'loading' ? (
          <Skeleton rows={4} variant="card" />
        ) : state.status === 'error' ? (
          <ErrorState message={state.message} onRetry={retry} />
        ) : state.data.length === 0 ? (
          <EmptyState
            icon={Palmtree}
            title="No leave requests yet"
            message="Use the form above to request time off."
          />
        ) : (
          <ul className="space-y-3">
            {state.data.map((row) => (
              <li key={row.id}>
                <LeaveItem row={row} onWithdrawn={retry} />
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
        const res = await fetch('/api/me/leave', {
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
        setFormError(err instanceof Error ? err.message : 'Could not submit your request.')
      } finally {
        setSubmitting(false)
      }
    },
    [leaveType, date, reason, onSubmitted],
  )

  return (
    <section className="rounded-cards border border-cloud-gray bg-canvas-white p-5">
      <h2 className="mb-4 font-display text-[20px] tracking-tight text-cocoa-dark">Request leave</h2>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-3 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
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
              className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-3 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
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
            className="w-full resize-none rounded-buttons border border-outline-gray bg-canvas-white px-3 py-2 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
            placeholder="Add any context for your manager."
          />
        </div>

        {formError && (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        )}
        {success && (
          <output className="block font-sans text-sm text-success-dark">
            Leave request submitted.
          </output>
        )}

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="rounded-buttons bg-cocoa-dark px-4 py-2 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
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
      const res = await fetch(`/api/me/leave/${row.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not withdraw the request.')
      }
      onWithdrawn()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not withdraw the request.')
      setBusy(false)
    }
  }, [row.id, onWithdrawn])

  return (
    <article className="rounded-cards border border-cloud-gray bg-canvas-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-[15px] text-cocoa-dark">
            {LEAVE_TYPE_LABEL[row.leaveType] ?? row.leaveType}
            <span className="text-dusty-gray">
              {' · '}
              <time dateTime={row.date}>{formatDateDDMMYYYY(row.date)}</time>
            </span>
          </p>
          {row.reason && <p className="mt-1 font-sans text-sm text-dusty-gray">“{row.reason}”</p>}
          {row.approvalStatus === 'rejected' && row.rejectionReason && (
            <p className="mt-1.5 font-sans text-sm text-error">
              <span className="mr-1.5 font-ui text-[11px] uppercase tracking-[0.5px] text-error">
                Reason
              </span>
              {row.rejectionReason}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={row.approvalStatus} />
          {isPending && (
            <button
              type="button"
              onClick={withdraw}
              disabled={busy}
              className="font-ui text-xs text-warm-gray transition-colors hover:text-error disabled:opacity-50 motion-reduce:transition-none"
            >
              {busy ? 'Withdrawing…' : 'Withdraw'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <p className="mt-2 font-sans text-sm text-error" role="alert">
          {actionError}
        </p>
      )}
    </article>
  )
}
