/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Membership Detail
 * Scope        : Admin Portal — Membership Management
 *
 * Description  : Full membership detail view with hours balance bar,
 *                session recording modal, cancellation modal, and
 *                session history table.
 *
 * Responsibilities :
 * - Display membership info, hours balance, and expiry status
 * - Provide record-session flow (service picker, duration, staff)
 * - Handle membership cancellation with reason and confirmation
 *
 * Features / Functionality :
 * - Visual progress bar for hours used vs total
 * - Record Session modal with SPA service multi-select
 * - Cancel Membership modal with reason and role guard
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Detail View Component)
 *
 * Dependencies : StatusBadge, admin memberships lib, next/link, React hooks
 *
 * Notes        :
 * - Session recording creates a ₹0 membership_session invoice (no gems)
 ************************************************************/

'use client'

import { StatusBadge } from '@/components/admin/StatusBadge'
import {
  type MembershipDetailData,
  type MembershipSessionRow,
  type ServiceOption,
  type StaffOption,
  daysUntil,
  formatDateDDMMYYYY,
  minutesToHM,
} from '@/lib/admin/memberships'
import Link from 'next/link'
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

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
      const res = await fetch(`/api/admin/memberships/${membershipId}`)
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
    return <LoadingState />
  }
  if (error || !data) {
    return <ErrorState message={error ?? 'Membership not found.'} onRetry={load} />
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
          <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">
            Membership{' '}
            <span className="font-mono text-lg text-warm-gray">#{data.membershipNumber}</span>
          </h1>
          <p className="mt-1 text-sm font-sans text-warm-gray">
            <Link
              href={`/admin/customers/${data.customerId}`}
              className="text-deep-gold hover:text-cocoa-dark transition-colors"
            >
              {data.customerName}
            </Link>{' '}
            · {data.tierNameSnapshot} · Created {formatDateDDMMYYYY(data.createdAt)}
          </p>
        </div>
        <StatusBadge status={data.status} />
      </header>

      {/* Hours balance */}
      <section
        className="rounded-[6px] border border-cloud-gray bg-canvas-white p-5"
        aria-labelledby="hours-balance-heading"
      >
        <h2
          id="hours-balance-heading"
          className="text-xs font-ui uppercase tracking-wider text-dusty-gray mb-3"
        >
          Hours Balance
        </h2>

        {/* The bar is decorative; the dl below conveys the numbers to AT. */}
        <div className="h-3 w-full overflow-hidden rounded-full bg-cloud-gray" aria-hidden="true">
          <div
            className="h-full rounded-full bg-royal-gold motion-safe:transition-[width] duration-500"
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

        <p className="mt-4 text-sm font-sans text-warm-gray">
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
          className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Record Session
        </button>
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          disabled={!isActive}
          className="px-4 py-2 rounded-[6px] border border-error/50 text-error text-sm font-ui hover:bg-error/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel Membership
        </button>
      </div>
      {!canRecord && isActive ? (
        <output className="block text-sm font-sans text-error">
          This membership has expired — sessions can no longer be recorded.
        </output>
      ) : null}

      {/* Session history */}
      <SessionHistory sessions={data.sessions} used={used} />

      {recordOpen ? (
        <RecordSessionModal
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
      ) : null}

      {cancelOpen ? (
        <CancelMembershipModal
          membershipId={membershipId}
          membershipNumber={data.membershipNumber}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => {
            setCancelOpen(false)
            load()
          }}
        />
      ) : null}
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
    <div className="rounded-[6px] bg-warm-cream px-4 py-3">
      <dt className="font-ui text-[11px] uppercase tracking-wider text-warm-stone mb-1">{label}</dt>
      <dd className="font-display text-xl text-cocoa-dark">{value}</dd>
    </div>
  )
}

// --- Session history table ------------------------------------------------

function SessionHistory({
  sessions,
  used,
}: {
  sessions: MembershipSessionRow[]
  used: number
}) {
  return (
    <section
      className="rounded-[6px] border border-cloud-gray overflow-hidden"
      aria-labelledby="session-history-heading"
    >
      <div className="flex items-center justify-between gap-2 bg-cloud-gray/60 px-4 py-2.5">
        <h2
          id="session-history-heading"
          className="text-xs font-ui uppercase tracking-wider text-dusty-gray"
        >
          Session History
        </h2>
        <span className="text-xs font-sans text-dusty-gray">
          {sessions.length} session{sessions.length === 1 ? '' : 's'} · {minutesToHM(used)} used
        </span>
      </div>

      {sessions.length === 0 ? (
        <p className="bg-canvas-white px-4 py-10 text-center text-sm font-sans text-dusty-gray">
          No sessions recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto bg-canvas-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cloud-gray">
                <Th>Date</Th>
                <Th>Service(s)</Th>
                <Th>Duration</Th>
                <Th>Staff</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud-gray">
              {sessions.map((s) => {
                const staffNames = [
                  ...new Set(
                    s.services.map((svc) => svc.staffName).filter((n): n is string => Boolean(n)),
                  ),
                ]
                return (
                  <tr key={s.id} className="hover:bg-cloud-gray/30 transition-colors">
                    <td className="px-4 py-3 font-sans text-cocoa-dark whitespace-nowrap">
                      {formatDateDDMMYYYY(s.bookingDate)}
                    </td>
                    <td className="px-4 py-3 font-sans text-cocoa-dark">
                      {s.services.map((svc) => svc.serviceNameSnapshot).join(', ')}
                    </td>
                    <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                      {minutesToHM(s.totalDurationMinutes)}
                    </td>
                    <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                      {staffNames.length > 0 ? staffNames.join(', ') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// --- Record session modal -------------------------------------------------

type SelectedService = { durationMinutes: number; staffId: string }

function RecordSessionModal({
  membershipId,
  memberName,
  membershipNumber,
  tierName,
  remainingMinutes,
  onClose,
  onRecorded,
}: {
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

  // Load SPA services + staff once when the modal opens.
  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/services').then((res) => res.json()),
      fetch('/api/admin/staff').then((res) => res.json()),
    ])
      .then(([servicesJson, staffJson]) => {
        if (!active) {
          return
        }
        if (servicesJson?.success) {
          const categories = servicesJson.data.categories as Array<{
            serviceType: string
            services: Array<{
              id: string
              name: string
              durationMinutes: number
            }>
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
  }, [])

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
      const res = await fetch(`/api/admin/memberships/${membershipId}/sessions`, {
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
    <Modal title="Record Membership Session" onClose={onClose}>
      <p className="text-sm font-sans text-warm-gray">
        {memberName} <span className="font-mono text-xs text-dusty-gray">#{membershipNumber}</span>{' '}
        · {tierName}
      </p>
      <p className="mt-1 text-sm font-sans text-cocoa-dark">
        Remaining: <strong>{minutesToHM(remainingMinutes)}</strong>
      </p>

      <div className="mt-4">
        <h3 className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray mb-2">
          Service(s) performed
        </h3>

        {loadError ? (
          <p className="text-sm text-error font-sans" role="alert">
            {loadError}
          </p>
        ) : services === null ? (
          <p className="text-sm text-dusty-gray font-sans">Loading services…</p>
        ) : services.length === 0 ? (
          <p className="text-sm text-dusty-gray font-sans">No SPA services are available.</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {services.map((svc) => {
              const chosen = selected[svc.id]
              return (
                <li key={svc.id} className="rounded-[6px] border border-cloud-gray p-2.5">
                  <label className="flex items-center gap-2 text-sm font-sans text-cocoa-dark cursor-pointer">
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
      <div className="mt-4 rounded-[6px] bg-cloud-gray/40 px-3 py-2.5 text-sm font-sans">
        <p className="text-cocoa-dark">
          Total duration: <strong>{minutesToHM(totalMinutes)}</strong>
        </p>
        <p className={insufficient ? 'text-error' : 'text-warm-gray'}>
          After session: <strong>{minutesToHM(Math.max(0, afterRemaining))}</strong> remaining
        </p>
      </div>

      {insufficient ? (
        <div
          className="mt-3 rounded-[6px] border border-error/40 bg-error/5 px-3 py-2.5"
          role="alert"
        >
          <p className="text-sm font-ui text-error">Insufficient hours</p>
          <p className="text-xs font-sans text-error/90 mt-0.5">
            Requested {minutesToHM(totalMinutes)} exceeds the remaining{' '}
            {minutesToHM(remainingMinutes)}. Reduce the duration or record a shorter session.
          </p>
        </div>
      ) : null}

      <div className="mt-3 rounded-[6px] bg-cloud-gray/40 border border-cloud-gray px-3 py-2.5">
        <p className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray mb-1">
          This will
        </p>
        <ul className="space-y-0.5 text-xs font-sans text-warm-gray">
          <li>• Deduct {minutesToHM(totalMinutes)} from membership hours</li>
          <li>• Create a ₹0 membership_session invoice</li>
          <li>• Earn no gems</li>
        </ul>
      </div>

      {submitError ? (
        <p className="mt-3 text-sm text-error font-sans" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-[6px] border border-cloud-gray text-sm font-ui text-warm-gray hover:bg-cloud-gray/40 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          aria-busy={submitting}
          className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Recording…' : 'Record Session'}
        </button>
      </div>
    </Modal>
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
        className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
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
        className="h-9 w-28 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
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
        className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
      >
        Staff (optional)
      </label>
      <select
        id={`${id}-${serviceId}-staff`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
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

// --- Cancel membership modal ----------------------------------------------

function CancelMembershipModal({
  membershipId,
  membershipNumber,
  onClose,
  onCancelled,
}: {
  membershipId: string
  membershipNumber: string
  onClose: () => void
  onCancelled: () => void
}) {
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const submit = useCallback(async () => {
    const trimmed = reason.trim()
    if (!trimmed || submitting) {
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/admin/memberships/${membershipId}/cancel`, {
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
    <Modal title="Cancel Membership" onClose={onClose}>
      <p className="text-sm font-sans text-warm-gray">
        You are about to cancel membership{' '}
        <span className="font-mono text-xs text-dusty-gray">#{membershipNumber}</span>. Unused hours
        are forfeited and this cannot be undone. Refunds are handled offline.
      </p>

      <div className="mt-4 flex flex-col gap-1">
        <label
          htmlFor={reasonId}
          className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
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
          className="w-full px-3 py-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold resize-none"
        />
      </div>

      {submitError ? (
        <p className="mt-3 text-sm text-error font-sans" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-[6px] border border-cloud-gray text-sm font-ui text-warm-gray hover:bg-cloud-gray/40 transition-colors"
        >
          Keep Membership
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!reason.trim() || submitting}
          aria-busy={submitting}
          className="px-4 py-2 rounded-[6px] bg-error text-canvas-white text-sm font-ui hover:bg-error/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Cancelling…' : 'Cancel Membership'}
        </button>
      </div>
    </Modal>
  )
}

// --- Accessible modal shell (focus trap + escape, mirrors MobileNav) -------

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) {
        return
      }
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    },
    [onClose],
  )

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    const timer = setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )
      focusable?.focus()
    }, 50)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
      clearTimeout(timer)
    }
  }, [handleKeyDown])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-cocoa-dark/50 motion-safe:transition-opacity"
      />

      {/* Panel — custom modal: focus trap + aria-modal + Escape key. Rule useSemanticElements is off for this file via biome.json overrides. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-[12px] sm:rounded-[12px] bg-canvas-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-cloud-gray px-5 py-3.5">
          <h2 id={titleId} className="font-display text-lg text-cocoa-dark tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 items-center justify-center rounded-[6px] text-warm-gray hover:bg-cloud-gray transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// --- Shared small pieces ---------------------------------------------------

function BackLink() {
  return (
    <Link
      href="/admin/memberships"
      className="inline-flex items-center gap-1.5 text-sm font-ui text-warm-gray hover:text-cocoa-dark transition-colors"
    >
      ← Back to Memberships
    </Link>
  )
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray">
      {children}
    </th>
  )
}

function LoadingState() {
  return (
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading membership…</span>
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
    <div className="space-y-4">
      <BackLink />
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
