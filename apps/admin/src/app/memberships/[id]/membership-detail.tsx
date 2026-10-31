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
 *                Recording a session starts it and holds its minutes; it is
 *                completed from its booking, which uses them and issues the ₹0
 *                membership_session invoice (no gems). Free minutes are total
 *                less used less held (membership-scheduling.md).
 ************************************************************/

'use client'

import { AVAILABILITY_MAX_MINUTES } from '@rgss/types'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { type AdminColumnDef, DataTable } from '@/components/ui/data-table'
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
import { SlideOverPanel } from '@/components/ui/slide-over-panel'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { Textarea } from '@/components/ui/textarea'
import { TimeSelect } from '@/components/ui/time-select'
import {
  formatTime12h,
  staffBusyBlocks,
  staffBusyNote,
  staffOptionLabel,
} from '@/lib/admin/bookings'
import { formatDateTimeIST } from '@/lib/admin/format'
import {
  daysUntil,
  formatDateDDMMYYYY,
  formatINR,
  freeMinutesOf,
  type MembershipDetailData,
  type MembershipSessionRow,
  minutesToHM,
  type ServiceOption,
  type StaffOption,
  todayISTDateString,
} from '@/lib/admin/memberships'
import { toast } from '@/lib/admin/toast'

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
  // Held by sessions booked or in progress: not used yet, not free either.
  const held = data.reservedMinutes ?? 0
  const remaining = freeMinutesOf(data)
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const heldPct = total > 0 ? Math.min(100 - usedPct, Math.round((held / total) * 100)) : 0
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
          <p className="mt-1 font-sans text-xs text-dusty-gray">
            Sold at {data.sellingBranch?.name ?? 'an unknown branch'}
            {data.sale ? (
              <>
                {' '}
                · Price paid {formatINR(data.sale.pricePaidPaise)}
                {data.sale.tierUsualPricePaise !== null
                  ? ` (usual ${formatINR(data.sale.tierUsualPricePaise)})`
                  : ''}
              </>
            ) : null}{' '}
            · Hours can be used at any branch
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
        <div
          className="flex h-3 w-full overflow-hidden rounded-pill bg-cloud-gray"
          aria-hidden="true"
        >
          <div
            className="h-full bg-royal-gold duration-500 motion-safe:transition-[width]"
            style={{ width: `${usedPct}%` }}
          />
          {heldPct > 0 ? (
            <div
              className="h-full bg-royal-gold/40 duration-500 motion-safe:transition-[width]"
              style={{ width: `${heldPct}%` }}
            />
          ) : null}
        </div>
        <p className="sr-only">
          {minutesToHM(used)} used, {minutesToHM(held)} held for sessions booked or in progress,{' '}
          {minutesToHM(remaining)} remaining of {minutesToHM(total)} total.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Used" value={minutesToHM(used)} />
          <Stat label="Held" value={minutesToHM(held)} />
          <Stat label="Remaining" value={minutesToHM(remaining)} />
          <Stat label="Total" value={minutesToHM(total)} />
        </dl>
        {held > 0 ? (
          <p className="mt-2 font-sans text-xs text-dusty-gray">
            Held minutes belong to sessions booked or in progress. Completing a session uses them;
            cancelling it gives them back.
          </p>
        ) : null}

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
          disabled={!isActive || !data.canCancel}
          title={isActive && data.cancelRefusal ? data.cancelRefusal : undefined}
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
      {isActive && data.cancelRefusal ? (
        <p className="font-sans text-xs text-dusty-gray">{data.cancelRefusal}</p>
      ) : null}

      {/* Sessions: booked, in progress and completed */}
      <SessionHistory sessions={data.sessions} used={used} held={held} />

      <RecordSessionPanel
        open={recordOpen}
        branchId={data.branchId}
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
        branchId={data.branchId}
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
  held,
}: {
  sessions: MembershipSessionRow[]
  used: number
  held: number
}) {
  const columns = useMemo<AdminColumnDef<MembershipSessionRow, unknown>[]>(
    () => [
      {
        accessorKey: 'bookingDate',
        header: 'Date',
        cell: ({ row }) => {
          const session = row.original
          const date = formatDateDDMMYYYY(session.bookingDate)
          // This branch's session opens its booking, where it is completed.
          return session.scope === 'this_branch' ? (
            <Link
              href={`/bookings/${session.id}`}
              className="whitespace-nowrap font-sans text-deep-gold transition-colors hover:text-cocoa-dark"
            >
              {date}
              <span className="sr-only"> · booking {session.bookingNumber}</span>
            </Link>
          ) : (
            <span className="whitespace-nowrap font-sans text-cocoa-dark">{date}</span>
          )
        },
      },
      {
        id: 'branch',
        header: 'Branch',
        accessorFn: (s) => s.branchName,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-sans text-warm-gray">
            {row.original.branchName}
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
          // Another branch's session doesn't name its staff.
          const session = row.original
          const staffNames =
            session.scope === 'this_branch'
              ? [
                  ...new Set(
                    session.services
                      .map((svc) => svc.staffName)
                      .filter((n): n is string => Boolean(n)),
                  ),
                ]
              : []
          return (
            <span className="whitespace-nowrap font-sans text-warm-gray">
              {staffNames.length > 0 ? staffNames.join(', ') : '—'}
            </span>
          )
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (s) => s.status,
        // Booked or in progress: its minutes are held. Completed: used.
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
          Sessions
        </h2>
        <span className="font-sans text-xs text-dusty-gray">
          {sessions.length} session{sessions.length === 1 ? '' : 's'} · {minutesToHM(used)} used
          {held > 0 ? ` · ${minutesToHM(held)} held` : ''}
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
          caption="Membership sessions with date, services, duration, staff and status"
        />
      )}
    </section>
  )
}

// --- Record session slide-over --------------------------------------------

type SelectedService = { durationMinutes: number }

function RecordSessionPanel({
  open,
  branchId,
  membershipId,
  memberName,
  membershipNumber,
  tierName,
  remainingMinutes,
  onClose,
  onRecorded,
}: {
  open: boolean
  /** The branch the page was rendered for; the session is performed there. */
  branchId: string
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
  // One person does the whole session, so they're needed up front.
  const [staffId, setStaffId] = useState('')
  // Record it now, or book it ahead for a date and start time (IST).
  const [when, setWhen] = useState<'now' | 'ahead'>('now')
  const [aheadDate, setAheadDate] = useState('')
  const [aheadTime, setAheadTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // One idempotency key per session attempt. Retrying the same selection after
  // a timeout or lost response reuses it, so the server records the session
  // once; opening the panel or changing the selection starts a new attempt.
  const idempotencyKeyRef = useRef('')

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
    setStaffId('')
    setWhen('now')
    setAheadDate(todayISTDateString())
    setAheadTime('')
    setSubmitError(null)
    idempotencyKeyRef.current = crypto.randomUUID()
    fetch('/api/services')
      .then((res) => res.json())
      .then((servicesJson) => {
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
              availableBranchIds?: string[] | null
            }>
          }>
          // SPA services this branch offers (R4.3; the API refuses the rest).
          const spaServices: ServiceOption[] = categories
            .filter((c) => c.serviceType === 'spa')
            .flatMap((c) =>
              c.services
                .filter(
                  (svc) => !svc.availableBranchIds || svc.availableBranchIds.includes(branchId),
                )
                .map((svc) => ({
                  id: svc.id,
                  name: svc.name,
                  durationMinutes: svc.durationMinutes,
                })),
            )
          setServices(spaServices)
        } else {
          setLoadError('Could not load SPA services.')
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
  }, [open, branchId])

  const toggleService = useCallback((svc: ServiceOption) => {
    idempotencyKeyRef.current = crypto.randomUUID()
    setSelected((prev) => {
      const next = { ...prev }
      if (next[svc.id]) {
        delete next[svc.id]
      } else {
        next[svc.id] = { durationMinutes: svc.durationMinutes }
      }
      return next
    })
  }, [])

  const chooseStaff = useCallback((id: string) => {
    idempotencyKeyRef.current = crypto.randomUUID()
    setStaffId(id)
  }, [])

  // A new time is a new attempt: it can't replay one made for another slot.
  const chooseWhen = useCallback((value: string) => {
    idempotencyKeyRef.current = crypto.randomUUID()
    setWhen(value === 'ahead' ? 'ahead' : 'now')
  }, [])
  const chooseDate = useCallback((value: string) => {
    idempotencyKeyRef.current = crypto.randomUUID()
    setAheadDate(value)
  }, [])
  const chooseTime = useCallback((value: string) => {
    idempotencyKeyRef.current = crypto.randomUUID()
    setAheadTime(value)
  }, [])

  const updateSelected = useCallback((serviceId: string, patch: Partial<SelectedService>) => {
    idempotencyKeyRef.current = crypto.randomUUID()
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

  // Who can do it, for these minutes (slice 2b): now, or at the time it is
  // booked for. Asked again as the minutes or the time change; a reply for an
  // older selection is dropped. Booking ahead without a time yet lists
  // everyone, without reasons.
  const ahead = when === 'ahead'
  const slotMinutes = Math.min(Math.max(Math.round(totalMinutes), 1), AVAILABILITY_MAX_MINUTES)
  const staffQuery = ahead
    ? aheadDate && aheadTime
      ? `?minutes=${slotMinutes}&kind=spa&date=${aheadDate}&start=${aheadTime}`
      : ''
    : `?minutes=${slotMinutes}&kind=spa`
  useEffect(() => {
    if (!open) {
      return
    }
    let active = true
    fetch(`/api/staff${staffQuery}`)
      .then((res) => res.json())
      .then((json) => {
        if (active && json?.success) {
          setStaff(json.data.staff as StaffOption[])
        }
      })
      .catch(() => {
        /* the picker keeps its last list; the write is checked on the server */
      })
    return () => {
      active = false
    }
  }, [open, staffQuery])

  const selectedCount = Object.keys(selected).length
  const afterRemaining = remainingMinutes - totalMinutes
  // Client-side mirror of the server's assertSessionRecordable guard.
  const insufficient = totalMinutes > remainingMinutes
  // The database refuses someone booked then; a session starting now also
  // someone still with another customer, and one booked ahead someone not
  // scheduled then.
  const chosen = staff.find((s) => s.id === staffId)
  const chosenBusy = chosen && staffBusyBlocks(chosen.busy, { startsNow: !ahead }) ? chosen : null
  const canSubmit =
    selectedCount > 0 &&
    totalMinutes > 0 &&
    staffId !== '' &&
    chosenBusy === null &&
    !insufficient &&
    (!ahead || (aheadDate !== '' && aheadTime !== '')) &&
    !submitting

  const submit = useCallback(async () => {
    if (!canSubmit) {
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload = {
        branchId,
        staffId,
        services: Object.entries(selected).map(([serviceId, v]) => ({
          serviceId,
          durationMinutes: Math.round(v.durationMinutes),
        })),
        ...(ahead ? { bookingDate: aheadDate, startTime: aheadTime } : {}),
        idempotencyKey: idempotencyKeyRef.current,
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
      // In progress now, or booked for later; either is completed from its
      // booking.
      toast.success(
        ahead
          ? `Session booked for ${formatDateDDMMYYYY(aheadDate)} at ${formatTime12h(aheadTime)}`
          : 'Session started',
      )
      onRecorded()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not record this session.'
      setSubmitError(message)
      toast.error(ahead ? 'Could not book session' : 'Could not record session', message)
      setSubmitting(false)
    }
  }, [
    canSubmit,
    selected,
    staffId,
    branchId,
    membershipId,
    onRecorded,
    ahead,
    aheadDate,
    aheadTime,
  ])

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
            {ahead
              ? submitting
                ? 'Booking…'
                : 'Book Session'
              : submitting
                ? 'Recording…'
                : 'Record Session'}
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

      <WhenField
        when={when}
        date={aheadDate}
        time={aheadTime}
        onWhen={chooseWhen}
        onDate={chooseDate}
        onTime={chooseTime}
      />

      <div className="mt-4">
        <StaffField value={staffId} staff={staff} startsNow={!ahead} onChange={chooseStaff} />
        {chosenBusy ? (
          <p className="mt-1 font-sans text-xs text-error" role="status">
            {chosenBusy.name} can’t do it {ahead ? 'then' : 'now'} ({staffBusyNote(chosenBusy.busy)}
            ). Choose someone else.
          </p>
        ) : null}
      </div>

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
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`ms-svc-${svc.id}`}
                      checked={Boolean(chosen)}
                      onCheckedChange={() => toggleService(svc)}
                    />
                    <label
                      htmlFor={`ms-svc-${svc.id}`}
                      className="cursor-pointer font-sans text-sm text-cocoa-dark"
                    >
                      {svc.name}
                    </label>
                  </div>

                  {chosen ? (
                    <div className="mt-2 flex flex-wrap items-end gap-3 pl-6">
                      <DurationField
                        serviceId={svc.id}
                        value={chosen.durationMinutes}
                        onChange={(durationMinutes) => updateSelected(svc.id, { durationMinutes })}
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
          {ahead ? (
            <>
              <li>
                • Book the session
                {aheadDate && aheadTime
                  ? ` for ${formatDateDDMMYYYY(aheadDate)} at ${formatTime12h(aheadTime)}`
                  : ''}{' '}
                and hold {minutesToHM(totalMinutes)} of the membership until then
              </li>
              <li>
                • When the member arrives, start it from its booking; completing it uses the minutes
                and issues a ₹0 session invoice
              </li>
            </>
          ) : (
            <>
              <li>
                • Start the session now and hold {minutesToHM(totalMinutes)} of the membership
              </li>
              <li>
                • When it’s done, complete it from its booking: that uses the minutes and issues a
                ₹0 session invoice
              </li>
            </>
          )}
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
      <Input
        id={`${id}-${serviceId}-duration`}
        type="number"
        min="1"
        step="5"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28"
      />
    </div>
  )
}

// When the session happens: now ("Record now"), or booked ahead for a date
// and a start on the branch's half-hour grid.
function WhenField({
  when,
  date,
  time,
  onWhen,
  onDate,
  onTime,
}: {
  when: 'now' | 'ahead'
  date: string
  time: string
  onWhen: (value: string) => void
  onDate: (value: string) => void
  onTime: (value: string) => void
}) {
  const id = useId()
  const label = 'font-ui text-[10px] uppercase tracking-wider text-dusty-gray'
  return (
    <fieldset className="mt-4 flex flex-col gap-2">
      <legend className={`mb-1 ${label}`}>When</legend>
      <RadioGroup value={when} onValueChange={onWhen} aria-label="When" className="flex gap-4">
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${id}-now`} value="now" />
          <Label htmlFor={`${id}-now`} className="cursor-pointer font-sans text-sm text-cocoa-dark">
            Now
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${id}-ahead`} value="ahead" />
          <Label
            htmlFor={`${id}-ahead`}
            className="cursor-pointer font-sans text-sm text-cocoa-dark"
          >
            Book ahead
          </Label>
        </div>
      </RadioGroup>
      {when === 'ahead' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-date`} className={label}>
              Date
            </label>
            <Input
              id={`${id}-date`}
              type="date"
              min={todayISTDateString()}
              value={date}
              onChange={(e) => onDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-time`} className={label}>
              Start time
            </label>
            <TimeSelect
              id={`${id}-time`}
              value={time}
              onChange={onTime}
              ariaLabel="Start time"
              step={30}
              className="w-full"
            />
          </div>
        </div>
      ) : null}
    </fieldset>
  )
}

// Who does the session: one person for all of it, required up front: the
// session starts when it is recorded, or is planned for them when booked
// ahead (membership-scheduling.md).
function StaffField({
  value,
  staff,
  startsNow,
  onChange,
}: {
  value: string
  staff: StaffOption[]
  /** Recorded now: someone still with a customer can't take it either. */
  startsNow: boolean
  onChange: (staffId: string) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={`${id}-session-staff`}
        className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray"
      >
        Who is doing it
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={`${id}-session-staff`} size="sm" className="w-full">
          <SelectValue placeholder="Choose a staff member" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id} disabled={staffBusyBlocks(s.busy, { startsNow })}>
                {staffOptionLabel(s)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

// --- Cancel membership slide-over -----------------------------------------

function CancelMembershipPanel({
  open,
  branchId,
  membershipId,
  membershipNumber,
  onClose,
  onCancelled,
}: {
  open: boolean
  branchId: string
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
        body: JSON.stringify({ branchId, reason: trimmed }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        // The server says why: the selling branch's Manager or Owner cancels,
        // and a session in progress has to complete first (MS-13).
        throw new Error(json?.error?.message ?? 'Could not cancel this membership.')
      }
      const cancelledSessions = Number(json.data?.cancelledSessions ?? 0)
      toast.success(
        cancelledSessions > 0
          ? `Membership cancelled · ${cancelledSessions} booked session${cancelledSessions === 1 ? '' : 's'} cancelled`
          : 'Membership cancelled',
      )
      onCancelled()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not cancel this membership.'
      setSubmitError(message)
      toast.error('Could not cancel membership', message)
      setSubmitting(false)
    }
  }, [reason, submitting, branchId, membershipId, onCancelled])

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
      <p className="mt-2 font-sans text-sm text-warm-gray">
        Sessions booked but not started are cancelled with it. A session in progress has to be
        completed first.
      </p>

      <div className="mt-4 flex flex-col gap-1">
        <label
          htmlFor={reasonId}
          className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray"
        >
          Reason (required)
        </label>
        <Textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Why is this membership being cancelled?"
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
