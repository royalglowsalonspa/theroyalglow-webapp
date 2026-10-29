/************************************************************
 * Module Name  : ClosuresPanel
 * Scope        : Admin Portal — Schedule (multi-branch R1.8)
 *
 * Description  : The active branch's holidays and one-off closures, with a
 *                form to close a day or a range of days. Customers can't book
 *                a closed day; bookings already on a newly closed day are
 *                listed so reception can move them.
 *
 * Responsibilities :
 * - List upcoming closures, and remove those the viewer may remove
 * - Close a date or a range (up to 31 days); the Developer may close every branch
 * - Show the bookings a new closure leaves to move
 *
 * Tech Stack   : React (Client Component), TypeScript
 * Layer        : Presentation
 *
 * Notes        : Every write names the branch the panel was loaded for, so a
 *                tab left open across a branch switch is refused (409).
 *                Brand-token utilities only.
 ************************************************************/

'use client'

import type { ClosureAffectedBooking, ClosureView } from '@rgss/types'
import { CalendarOff, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useCallback, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/form-field'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateDDMMYYYY, formatTime12h } from '@/lib/admin/bookings'
import { toast } from '@/lib/admin/toast'

const NAME_MAX_LENGTH = 80

type ClosuresData = {
  branchId: string
  canCloseAllBranches: boolean
  closures: ClosureView[]
}

type CreateResult = {
  closures: ClosureView[]
  alreadyClosed: string[]
  affectedBookings: ClosureAffectedBooking[]
}

const WEEKDAY = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' })

/** Today as an IST calendar date, 'YYYY-MM-DD'. */
function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

function dayLabel(iso: string): string {
  return `${WEEKDAY.format(new Date(`${iso}T00:00:00.000Z`))} ${formatDateDDMMYYYY(iso)}`
}

async function readJson(res: Response) {
  return res.json().catch(() => null)
}

async function fetchClosures(): Promise<ClosuresData> {
  const res = await fetch('/api/closures')
  const json = await readJson(res)
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? 'Could not load closures.')
  }
  // Normalised, so an unexpected payload can't take the schedule page down.
  const data = (json.data ?? {}) as Partial<ClosuresData>
  if (typeof data.branchId !== 'string') {
    throw new Error('Could not load closures.')
  }
  return {
    branchId: data.branchId,
    canCloseAllBranches: data.canCloseAllBranches === true,
    closures: Array.isArray(data.closures) ? data.closures : [],
  }
}

export function ClosuresPanel({ onChanged }: { onChanged?: () => void }) {
  const { state, retry } = useAsyncData(fetchClosures)
  const [affected, setAffected] = useState<ClosureAffectedBooking[]>([])

  const changed = useCallback(() => {
    retry()
    onChanged?.()
  }, [retry, onChanged])

  return (
    <section aria-labelledby="closures-title" className="space-y-4">
      <div>
        <h2 id="closures-title" className="font-display text-lg text-cocoa-dark">
          Closures
        </h2>
        <p className="mt-0.5 font-sans text-sm text-dusty-gray">
          Holidays and one-off closures. Customers can’t book these days.
        </p>
      </div>

      {state.status === 'loading' ? (
        <Skeleton rows={3} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : (
        <>
          <ClosureList
            branchId={state.data.branchId}
            closures={state.data.closures}
            onRemoved={changed}
          />
          <AddClosureForm
            branchId={state.data.branchId}
            canCloseAllBranches={state.data.canCloseAllBranches}
            onAdded={(result) => {
              setAffected(result.affectedBookings)
              changed()
            }}
          />
          {affected.length > 0 ? (
            <AffectedBookings bookings={affected} onDismiss={() => setAffected([])} />
          ) : null}
        </>
      )}
    </section>
  )
}

function ClosureList({
  branchId,
  closures,
  onRemoved,
}: {
  branchId: string
  closures: ClosureView[]
  onRemoved: () => void
}) {
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function remove(closure: ClosureView) {
    setRemovingId(closure.id)
    try {
      const res = await fetch(
        `/api/closures/${encodeURIComponent(closure.id)}?branchId=${encodeURIComponent(branchId)}`,
        { method: 'DELETE' },
      )
      const json = await readJson(res)
      if (!res.ok || !json?.success) {
        toast.error('Could not reopen the day', json?.error?.message)
        return
      }
      toast.success(`Reopened ${formatDateDDMMYYYY(closure.date)}`)
      onRemoved()
    } finally {
      setRemovingId(null)
    }
  }

  if (closures.length === 0) {
    return (
      <p className="flex items-center gap-2 font-sans text-sm text-warm-gray">
        <Icon icon={CalendarOff} decorative size={16} />
        No upcoming closures.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-cloud-gray rounded-cards border border-cloud-gray">
      {closures.map((closure) => (
        <li
          key={closure.id}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-ui text-sm text-cocoa-dark">{dayLabel(closure.date)}</span>
            <span className="font-sans text-sm text-warm-gray">{closure.name}</span>
            {closure.allBranches ? <Badge variant="secondary">All branches</Badge> : null}
          </div>
          {closure.canRemove ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={removingId === closure.id}
              onClick={() => remove(closure)}
              aria-label={`Reopen ${dayLabel(closure.date)} (${closure.name})`}
            >
              {removingId === closure.id ? 'Reopening…' : 'Reopen'}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function AddClosureForm({
  branchId,
  canCloseAllBranches,
  onAdded,
}: {
  branchId: string
  canCloseAllBranches: boolean
  onAdded: (result: CreateResult) => void
}) {
  const today = todayIST()
  const [date, setDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [name, setName] = useState('')
  const [allBranches, setAllBranches] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!(date && name.trim())) {
      setError('Choose a day and give the closure a name.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/closures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          date,
          ...(endDate ? { endDate } : {}),
          name: name.trim(),
          ...(allBranches ? { allBranches: true } : {}),
        }),
      })
      const json = await readJson(res)
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? 'Could not add the closure.')
        return
      }
      const result = json.data as CreateResult
      const added = result.closures.length
      if (added > 0) {
        toast.success(added === 1 ? 'Closed 1 day' : `Closed ${added} days`)
      }
      if (result.alreadyClosed.length > 0) {
        toast.warning(
          `Already closed: ${result.alreadyClosed.map((d) => formatDateDDMMYYYY(d)).join(', ')}.`,
        )
      }
      setDate('')
      setEndDate('')
      setName('')
      setAllBranches(false)
      onAdded(result)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-cards border border-cloud-gray bg-warm-cream/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Close the branch"
    >
      <Field label="First day" htmlFor="closure-date" required>
        <Input
          id="closure-date"
          type="date"
          min={today}
          value={date}
          required
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <Field label="Last day" htmlFor="closure-end-date" hint="Leave empty for one day">
        <Input
          id="closure-end-date"
          type="date"
          min={date || today}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </Field>
      <Field label="Reason" htmlFor="closure-name" required>
        <Input
          id="closure-name"
          type="text"
          maxLength={NAME_MAX_LENGTH}
          placeholder="e.g. Diwali"
          value={name}
          required
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="flex flex-col justify-end gap-2">
        {canCloseAllBranches ? (
          <label
            htmlFor="closure-all-branches"
            className="flex items-center gap-2 font-sans text-sm text-cocoa-dark"
          >
            <Checkbox
              id="closure-all-branches"
              checked={allBranches}
              onCheckedChange={(checked) => setAllBranches(checked === true)}
            />
            Close every branch
          </label>
        ) : null}
        <Button type="submit" disabled={busy} className="font-ui">
          {busy ? 'Adding…' : 'Add closure'}
        </Button>
      </div>
      {error ? (
        <p className="font-sans text-sm text-error sm:col-span-2 lg:col-span-4" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}

function AffectedBookings({
  bookings,
  onDismiss,
}: {
  bookings: ClosureAffectedBooking[]
  onDismiss: () => void
}) {
  return (
    <div className="rounded-cards border border-warning/40 bg-warning/10 px-4 py-3" role="alert">
      <p className="mb-1.5 flex items-center gap-1.5 font-ui text-xs uppercase tracking-[0.5px] text-warm-gray">
        <Icon icon={TriangleAlert} decorative size={14} />
        {bookings.length === 1
          ? '1 booking is on a closed day'
          : `${bookings.length} bookings are on closed days`}
      </p>
      <p className="mb-2 font-sans text-[13px] text-warm-gray">
        Reschedule or reject them from the booking. They can’t be confirmed for a closed day.
      </p>
      <ul className="space-y-1">
        {bookings.map((b) => (
          <li key={b.id} className="font-sans text-[13px] text-cocoa-dark">
            <span className="font-ui">{formatDateDDMMYYYY(b.date)}</span>
            {' · '}
            {formatTime12h(b.startTime)}
            {' — '}
            {b.customerName}
            {' · '}
            <Link href={`/bookings/${b.id}`} className="underline underline-offset-2">
              #{b.bookingNumber}
            </Link>
            <span className="text-dusty-gray"> ({b.branchName})</span>
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  )
}
