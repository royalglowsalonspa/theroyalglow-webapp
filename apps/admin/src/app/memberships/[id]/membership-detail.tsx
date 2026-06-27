/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Membership Detail
 * Scope        : Admin Portal — Membership Management
 *
 * Description  : Full membership detail view rebuilt on the admin design-system
 *                primitives. Shows the hours balance bar, a session-history
 *                DataTable, and uses right-side SlideOverPanels for the record-
 *                session and cancellation flows. Loading / error use the shared
 *                State_Presenter components; status uses the StatusBadge
 *                primitive.
 *
 * Responsibilities :
 * - Display membership info, hours balance, and expiry status
 * - Provide record-session flow (service picker, duration, staff)
 * - Handle membership cancellation with reason and confirmation
 *
 * Features / Functionality :
 * - Visual progress bar for hours used vs total
 * - Record Session slide-over with SPA service multi-select
 * - Cancel Membership slide-over with reason and role guard
 * - Session history rendered via the DataTable primitive
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table, Radix Dialog (SlideOverPanel)
 * Layer        : Presentation (Detail View Component)
 *
 * Dependencies : DataTable, SlideOverPanel, StatusBadge, state presenters,
 *                @/lib/admin/memberships, @/lib/admin/format, next/link
 *
 * Notes        : Presentation-layer only; consumes GET /api/memberships/[id],
 *                /api/services, /api/staff, POST .../sessions, .../cancel as-is.
 *                Session recording creates a ₹0 membership_session invoice (no
 *                gems). All pre-redesign fields and actions are preserved.
 ************************************************************/

'use client'

import { DataTable } from '@/components/ui/data-table'
import { SlideOverPanel } from '@/components/ui/slide-over-panel'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDateTimeIST } from '@/lib/admin/format'
import {
  type MembershipDetailData,
  type MembershipSessionRow,
  type ServiceOption,
  type StaffOption,
  daysUntil,
  formatDateDDMMYYYY,
  minutesToHM,
} from '@/lib/admin/memberships'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'

export function MembershipDetail({ membershipId }: { membershipId: string }) {
  const [data, setData] = useState<MembershipDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/memberships/${membershipId}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load this membership.')
      }
      setData(json.data as MembershipDetailData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load this membership.')
    } finally {
      setLoading(false)
    }
  }, [membershipId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton variant="card" rows={3} />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={error ?? 'Membership not found.'} onRetry={load} />
      </div>
    )
  }

  const total = data.totalHoursMinutes
  const used = data.usedHoursMinutes
  const remaining = Math.max(0, total - used)
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const days = daysUntil(data.expiresAt)
  const isActive = data.status === 'active'
  const expired = days < 0 || data.status === 'expired'
  const canRecord = isActive && !expired

  return (
    <div className="space-y-5">
      <BackLink />

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">
            Membership{' '}
            <span className="font-mono text-lg text-warm-gray">#{data.membershipNumber}</span>
          </h1>
          <p className="mt-1 font-sans text-sm text-warm-gray">
            <Link
              href={`/customers/${data.customerId}`}
              className="text-deep-gold transition-colors hover:text-cocoa-dark"
            >
              {data.customerName}
            </Link>{' '}
            · {data.tierNameSnapshot} · Created {formatDateTimeIST(data.createdAt)}
          </p>
        </div>
        <StatusBadge status={data.status} />
      </header>

      {/* Hours balance */}
      <section
        className="rounded-cards border border-cloud-gray bg-canvas-white p-5"
        aria-labelledby="hours-balance-heading"
      >
        <h2
          id="hours-balance-heading"
          className="mb-3 font-ui text-xs uppercase tracking-wider text-dusty-gray"
        >
          Hours Balance
        </h2>

        {/* The bar is decorative; the dl below conveys the numbers to AT. */}
        <div className="h-3 w-full overflow-hidden rounded-pill bg-cloud-gray" aria-hidden="true">
          <div
            className="h-full rounded-pill bg-royal-gold duration-500 motion-safe:transition-[width]"
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className="sr-only">
          {minutesToHM(used)} used, {minutesToHM(remaining)} remaining of {minutesToHM(total)}{' '}
          total.
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Used" value={minutesToHM(used)} />
          <Stat label="Remaining" value={minutesToHM(remaining)} />
          <Stat label="Total" value={minutesToHM(total)} />
        </dl>

        <p className="mt-4 font-sans text-sm text-warm-gray">
          Expires {formatDateDDMMYYYY(data.expiresAt)}
          {isActive ? (
            <span className={`ml-1 ${days <= 7 && days >= 0 ? 'text-error' : 'text-dusty-gray'}`}>
              ({expiryHint(data.expiresAt)})
            </span>
          ) : null}
        </p>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setRecordOpen(true)}
          disabled={!canRecord}
          className="rounded-buttons bg-cocoa-dark px-4 py-2 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-50"
        >
          Record Session
        </button>
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          disabled={!isActive}
          className="rounded-buttons border border-error/50 px-4 py-2 font-ui text-sm text-error transition-colors hover:bg-error/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel Membership
        </button>
      </div>
      {!canRecord && isActive ? (
        <output className="block font-sans text-sm text-error">
          This membership has expired — sessions can no longer be recorded.
        </output>
      ) : null}

      {/* Session history */}
      <SessionHistory sessions={data.sessions} used={used} />

      <RecordSessionPanel
        open={recordOpen}
        membershipId={membershipId}
        memberName={data.customerName}
        membershipNumber={data.membershipNumber}
        tierName={data.tierNameSnapshot}
        remainingMinutes={remaining}
        onClose={() => setRecordOpen(false)}
        onRecorded={() => {
          setRecordOpen(false)
          load()
        }}
      />

      <CancelMembershipPanel
        open={cancelOpen}
        membershipId={membershipId}
        membershipNumber={data.membershipNumber}
        onClose={() => setCancelOpen(false)}
        onCancelled={() => {
          setCancelOpen(false)
          load()
        }}
      />
    </div>
  )
}

function expiryHint(expiresAt: string): string {
  const days = daysUntil(expiresAt)
  if (days < 0) {
    return 'Expired'
  }
  if (days === 0) {
    return 'Expires today'
  }
  return `${days} day${days === 1 ? '' : 's'} left`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-cards bg-warm-cream px-4 py-3">
      <dt className="mb-1 font-ui text-[11px] uppercase tracking-wider text-warm-stone">{label}</dt>
      <dd className="font-display text-xl text-cocoa-dark">{value}</dd>
    </div>
  )
}

// --- Session history table (DataTable) ------------------------------------

function SessionHistory({
  sessions,
  used,
}: {
  sessions: MembershipSessionRow[]
  used: number
}) {
  const columns = useMemo<ColumnDef<MembershipSessionRow, unknown>[]>(
    () => [
      {
        accessorKey: 'bookingDate',
        header: 'Date',
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-sans text-cocoa-dark">
            {formatDateDDMMYYYY(row.original.bookingDate)}
          </span>
        ),
      },
      {
        id: 'services',
        header: 'Service(s)',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-sans text-cocoa-dark">
            {row.original.services.map((svc) => svc.serviceNameSnapshot).join(', ')}
          </span>
        ),
      },
      {
        accessorKey: 'totalDurationMinutes',
        header: 'Duration',
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-sans text-warm-gray">
            {minutesToHM(row.original.totalDurationMinutes)}
          </span>
        ),
      },
      {
        id: 'staff',
        header: 'Staff',
        enableSorting: false,
        cell: ({ row }) => {
          const staffNames = [
            ...new Set(
              row.original.services
                .map((svc) => svc.staffName)
                .filter((n): n is string => Boolean(n)),
            ),
          ]
          return (
            <span className="whitespace-nowrap font-sans text-warm-gray">
              {staffNames.length > 0 ? staffNames.join(', ') : '—'}
            </span>
          )
        },
      },
    ],
    [],
  )

  return (
    <section className="space-y-2" aria-labelledby="session-history-heading">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="session-history-heading"
          className="font-ui text-xs uppercase tracking-wider text-dusty-gray"
        >
          Session History
        </h2>
        <span className="font-sans text-xs text-dusty-gray">
          {sessions.length} session{sessions.length === 1 ? '' : 's'} · {minutesToHM(used)} used
        </span>
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-cards border border-cloud-gray bg-canvas-white px-4 py-10 text-center font-sans text-sm text-dusty-gray">
          No sessions recorded yet.
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={sessions}
          tableId="membership-sessions"
          caption="Recorded membership sessions with date, services, duration, and staff"
        />
      )}
    </section>
  )
}

// --- Record session slide-over --------------------------------------------

type SelectedService = { durationMinutes: number; staffId: string }

function RecordSessionPanel({
  open,
  membershipId,
  memberName,
  membershipNumber,
  tierName,
  remainingMinutes,
  onClose,
  onRecorded,
}: {
  open: boolean
  membershipId: string
  memberName: string
  membershipNumber: string
  tierName: string
  remainingMinutes: number
  onClose: () => void
  onRecorded: () => void
}) {
  const [services, setServices] = useState<ServiceOption[] | null>(null)
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, SelectedService>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Load SPA services + staff each time the panel opens; reset selections.
  useEffect(() => {
    if (!open) {
      return
    }
    let active = true
    setServices(null)
    setStaff([])
    setLoadError(null)
    setSelected({})
    setSubmitError(null)
    Promise.all([
      fetch('/api/services').then((res) => res.json()),
      fetch('/api/staff').then((res) => res.json()),
    ])
      .then(([servicesJson, staffJson]) => {
        if (!active) {
          return
        }
        if (servicesJson?.success) {
          const categories = servicesJson.data.categories as Array<{
            serviceType: string
            services: Array<{ id: string; name: string; durationMinutes: number }>
          }>
          const spaServices: ServiceOption[] = categories
            .filter((c) => c.serviceType === 'spa')
            .flatMap((c) =>
              c.services.map((svc) => ({
                id: svc.id,
                name: svc.name,
                durationMinutes: svc.durationMinutes,
              })),
            )
          setServices(spaServices)
        } else {
          setLoadError('Could not load SPA services.')
        }
        if (staffJson?.success) {
          setStaff(staffJson.data.staff as StaffOption[])
        }
      })
      .catch(() => {
        if (active) {
          setLoadError('Could not load SPA services.')
        }
      })
    return () => {
      active = false
    }
  }, [open])

  const toggleService = useCallback((svc: ServiceOption) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[svc.id]) {
        delete next[svc.id]
      } else {
        next[svc.id] = { durationMinutes: svc.durationMinutes, staffId: '' }
      }
      return next
    })
  }, [])

  const updateSelected = useCallback((serviceId: string, patch: Partial<SelectedService>) => {
    setSelected((prev) => {
      const current = prev[serviceId]
      if (!current) {
        return prev
      }
      return { ...prev, [serviceId]: { ...current, ...patch } }
    })
  }, [])

  const totalMinutes = useMemo(
    () =>
      Object.values(selected).reduce(
        (sum, s) => sum + (Number.isFinite(s.durationMinutes) ? s.durationMinutes : 0),
        0,
      ),
    [selected],
  )

  const selectedCount = Object.keys(selected).length
  const afterRemaining = remainingMinutes - totalMinutes
  // Client-side mirror of the server's assertSessionRecordable guard.
  const insufficient = totalMinutes > remainingMinutes
  const canSubmit = selectedCount > 0 && totalMinutes > 0 && !insufficient && !submitting

  const submit = useCallback(async () => {
    if (!canSubmit) {
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload = {
        services: Object.entries(selected).map(([serviceId, v]) => ({
          serviceId,
          durationMinutes: Math.round(v.durationMinutes),
          ...(v.staffId ? { staffId: v.staffId } : {}),
        })),
      }
      const res = await fetch(`/api/memberships/${membershipId}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not record this session.')
      }
      onRecorded()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Could not record this session.')
      setSubmitting(false)
    }
  }, [canSubmit, selected, membershipId, onRecorded])

  return (
    <SlideOverPanel
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Record Membership Session"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-buttons border border-cloud-gray px-4 py-2 font-ui text-sm text-warm-gray transition-colors hover:bg-cloud-gray/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            aria-busy={submitting}
            className="rounded-buttons bg-cocoa-dark px-4 py-2 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Recording…' : 'Record Session'}
          </button>
        </div>
      }
    >
      <p className="font-sans text-sm text-warm-gray">
        {memberName} <span className="font-mono text-xs text-dusty-gray">#{membershipNumber}</span>{' '}
        · {tierName}
      </p>
      <p className="mt-1 font-sans text-sm text-cocoa-dark">
        Remaining: <strong>{minutesToHM(remainingMinutes)}</strong>
      </p>

      <div className="mt-4">
        <h3 className="mb-2 font-ui text-[10px] uppercase tracking-wider text-dusty-gray">
          Service(s) performed
        </h3>

        {loadError ? (
          <p className="font-sans text-sm text-error" role="alert">
            {loadError}
          </p>
        ) : services === null ? (
          <p className="font-sans text-sm text-dusty-gray">Loading services…</p>
        ) : services.length === 0 ? (
          <p className="font-sans text-sm text-dusty-gray">No SPA services are available.</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {services.map((svc) => {
              const chosen = selected[svc.id]
              return (
                <li key={svc.id} className="rounded-cards border border-cloud-gray p-2.5">
                  <label className="flex cursor-pointer items-center gap-2 font-sans text-sm text-cocoa-dark">
                    <input
                      type="checkbox"
                      checked={Boolean(chosen)}
                      onChange={() => toggleService(svc)}
                      className="accent-cocoa-dark"
                    />
                    {svc.name}
                  </label>

                  {chosen ? (
                    <div className="mt-2 flex flex-wrap items-end gap-3 pl-6">
                      <DurationField
                        serviceId={svc.id}
                        value={chosen.durationMinutes}
                        onChange={(durationMinutes) => updateSelected(svc.id, { durationMinutes })}
                      />
                      <StaffField
                        serviceId={svc.id}
                        value={chosen.staffId}
                        staff={staff}
                        onChange={(staffId) => updateSelected(svc.id, { staffId })}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Totals + after-session preview */}
      <div className="mt-4 rounded-cards bg-cloud-gray/40 px-3 py-2.5 font-sans text-sm">
        <p className="text-cocoa-dark">
          Total duration: <strong>{minutesToHM(totalMinutes)}</strong>
        </p>
        <p className={insufficient ? 'text-error' : 'text-warm-gray'}>
          After session: <strong>{minutesToHM(Math.max(0, afterRemaining))}</strong> remaining
        </p>
      </div>

      {insufficient ? (
        <div
          className="mt-3 rounded-cards border border-error/40 bg-error/5 px-3 py-2.5"
          role="alert"
        >
          <p className="font-ui text-sm text-error">Insufficient hours</p>
          <p className="mt-0.5 font-sans text-xs text-error/90">
            Requested {minutesToHM(totalMinutes)} exceeds the remaining{' '}
            {minutesToHM(remainingMinutes)}. Reduce the duration or record a shorter session.
          </p>
        </div>
      ) : null}

      <div className="mt-3 rounded-cards border border-cloud-gray bg-cloud-gray/40 px-3 py-2.5">
        <p className="mb-1 font-ui text-[10px] uppercase tracking-wider text-dusty-gray">
          This will
        </p>
        <ul className="space-y-0.5 font-sans text-xs text-warm-gray">
          <li>• Deduct {minutesToHM(totalMinutes)} from membership hours</li>
          <li>• Create a ₹0 membership_session invoice</li>
          <li>• Earn no gems</li>
        </ul>
      </div>

      {submitError ? (
        <p className="mt-3 font-sans text-sm text-error" role="alert">
          {submitError}
        </p>
      ) : null}
    </SlideOverPanel>
  )
}

function DurationField({
  serviceId,
  value,
  onChange,
}: {
  serviceId: string
  value: number
  onChange: (minutes: number) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={`${id}-${serviceId}-duration`}
        className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray"
      >
        Duration (min)
      </label>
      <input
        id={`${id}-${serviceId}-duration`}
        type="number"
        min="1"
        step="5"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-28 rounded-buttons border border-outline-gray bg-canvas-white px-3 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
      />
    </div>
  )
}

function StaffField({
  serviceId,
  value,
  staff,
  onChange,
}: {
  serviceId: string
  value: string
  staff: StaffOption[]
  onChange: (staffId: string) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={`${id}-${serviceId}-staff`}
        className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray"
      >
        Staff (optional)
      </label>
      <select
        id={`${id}-${serviceId}-staff`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-3 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
      >
        <option value="">Unassigned</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}

// --- Cancel membership slide-over -----------------------------------------

function CancelMembershipPanel({
  open,
  membershipId,
  membershipNumber,
  onClose,
  onCancelled,
}: {
  open: boolean
  membershipId: string
  membershipNumber: string
  onClose: () => void
  onCancelled: () => void
}) {
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Reset the form each time the panel opens.
  useEffect(() => {
    if (open) {
      setReason('')
      setSubmitError(null)
      setSubmitting(false)
    }
  }, [open])

  const submit = useCallback(async () => {
    const trimmed = reason.trim()
    if (!trimmed || submitting) {
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/memberships/${membershipId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        if (res.status === 403) {
          throw new Error('Only a manager or above can cancel a membership.')
        }
        throw new Error(json?.error?.message ?? 'Could not cancel this membership.')
      }
      onCancelled()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Could not cancel this membership.')
      setSubmitting(false)
    }
  }, [reason, submitting, membershipId, onCancelled])

  return (
    <SlideOverPanel
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Cancel Membership"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-buttons border border-cloud-gray px-4 py-2 font-ui text-sm text-warm-gray transition-colors hover:bg-cloud-gray/40"
          >
            Keep Membership
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!reason.trim() || submitting}
            aria-busy={submitting}
            className="rounded-buttons bg-error px-4 py-2 font-ui text-sm text-canvas-white transition-colors hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Cancelling…' : 'Cancel Membership'}
          </button>
        </div>
      }
    >
      <p className="font-sans text-sm text-warm-gray">
        You are about to cancel membership{' '}
        <span className="font-mono text-xs text-dusty-gray">#{membershipNumber}</span>. Unused hours
        are forfeited and this cannot be undone. Refunds are handled offline.
      </p>

      <div className="mt-4 flex flex-col gap-1">
        <label
          htmlFor={reasonId}
          className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray"
        >
          Reason (required)
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Why is this membership being cancelled?"
          className="w-full resize-none rounded-buttons border border-outline-gray bg-canvas-white px-3 py-2 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
        />
      </div>

      {submitError ? (
        <p className="mt-3 font-sans text-sm text-error" role="alert">
          {submitError}
        </p>
      ) : null}
    </SlideOverPanel>
  )
}

// --- Shared small pieces ---------------------------------------------------

function BackLink() {
  return (
    <Link
      href="/memberships"
      className="inline-flex items-center gap-1.5 font-ui text-sm text-warm-gray transition-colors hover:text-cocoa-dark"
    >
      <ArrowLeft size={16} aria-hidden="true" /> Back to Memberships
    </Link>
  )
}
