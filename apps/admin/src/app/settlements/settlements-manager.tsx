/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Settlements Manager
 * Scope        : Admin Portal — statements between branches (multi-branch R10)
 *
 * Description  : What branches owe each other when a member uses SPA hours,
 *                or a customer spends gems, at a branch other than the one
 *                that sold the membership or issued the gems. Each IST month
 *                closes into one statement per pair of branches; only the net
 *                is paid, outside the system. The month still open shows its
 *                running totals.
 *
 * Responsibilities :
 * - Load GET /api/settlements: closed statements and open months
 * - Open a statement with its entries (GET /api/settlements/[id]) and
 *   download it as CSV for the accountant
 * - Mark a statement paid with its date and reference (paying branch's
 *   Owner or the Developer), or as an internal transfer between two
 *   branches of one Owner
 * - Let the Developer correct an entry with a reversing entry and a reason
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : DataTable, DetailSheet, form-field, Checkbox, Textarea,
 *                StatusBadge, state presenters, useAsyncData,
 *                @/lib/admin/format, @rgss/types
 *
 * Notes        : Amounts are integer paise from the API, shown with paise. A
 *                closed statement never changes: corrections land in the
 *                month open now.
 ************************************************************/

'use client'

import type {
  SettlementAmounts,
  SettlementDetailView,
  SettlementEntryView,
  SettlementListView,
  SettlementNetView,
  SettlementOpenMonthView,
  SettlementStatementView,
} from '@rgss/types'
import { ArrowLeftRight, Download, Eye, HandCoins, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { type AdminColumnDef, DataTable, type RowAction } from '@/components/ui/data-table'
import { DetailSheet } from '@/components/ui/detail-sheet'
import { Field, FormActions } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { Textarea } from '@/components/ui/textarea'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateDDMMYYYY, formatDateIST, formatINRWithPaise } from '@/lib/admin/format'
import { todayISTDateString } from '@/lib/admin/memberships'
import { toast } from '@/lib/admin/toast'

type FieldErrors = Record<string, string[] | undefined>

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** "2026-11" → "November 2026". */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-')
  const name = MONTHS[Number(m) - 1]
  return name ? `${name} ${year}` : month
}

/** "Rayasandra pays Mahadevapura ₹976.19", or "Nothing to pay". */
export function netText(net: SettlementNetView): string {
  if (!net.payingBranch || !net.receivingBranch || net.amountPaise === 0) {
    return 'Nothing to pay'
  }
  return `${net.payingBranch.name} pays ${net.receivingBranch.name} ${formatINRWithPaise(net.amountPaise)}`
}

/** "Membership session", or what a reversal corrects. */
export function entryKindText(entry: SettlementEntryView): string {
  if (entry.kind === 'reversal') {
    return entry.reversedKind === 'gems_redemption'
      ? 'Correction (gems)'
      : 'Correction (membership session)'
  }
  return entry.kind === 'gems_redemption' ? 'Gems' : 'Membership session'
}

/** The Developer may reverse an entry between two branches that isn't a reversal or reversed. */
export function canReverse(entry: SettlementEntryView): boolean {
  return (
    entry.kind !== 'reversal' &&
    entry.reversedByEntryId === null &&
    entry.owingBranch.id !== entry.owedBranch.id
  )
}

async function fetchSettlements(): Promise<SettlementListView> {
  const res = await fetch('/api/settlements')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load the settlements.')
  }
  return json.data as SettlementListView
}

async function fetchStatement(id: string): Promise<SettlementDetailView> {
  const res = await fetch(`/api/settlements/${encodeURIComponent(id)}`)
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load the statement.')
  }
  return json.data as SettlementDetailView
}

function csvUrl(statement: SettlementStatementView): string {
  return `/api/settlements/${encodeURIComponent(statement.id)}?format=csv`
}

export function SettlementsManager() {
  const { state, retry } = useAsyncData(fetchSettlements)
  const [viewing, setViewing] = useState<SettlementStatementView | null>(null)
  const [paying, setPaying] = useState<SettlementStatementView | null>(null)

  const data = state.status === 'success' ? state.data : null

  // The month opens the statement. Rows aren't clickable themselves: a row
  // that is a button around the row-actions button nests one control in
  // another (axe nested-interactive).
  const columns = useMemo<AdminColumnDef<SettlementStatementView, unknown>[]>(
    () => [
      {
        accessorKey: 'month',
        header: 'Month',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setViewing(row.original)}
            className="whitespace-nowrap text-left font-sans text-cocoa-dark underline-offset-4 hover:underline focus-visible:underline"
          >
            {monthLabel(row.original.month)}
            <span className="sr-only">
              , {row.original.branchA.name} and {row.original.branchB.name}
            </span>
          </button>
        ),
      },
      {
        id: 'pair',
        header: 'Branches',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-cocoa-dark">
            {row.original.branchA.name} · {row.original.branchB.name}
          </span>
        ),
      },
      {
        id: 'net',
        header: 'Net',
        enableSorting: false,
        cell: ({ row }) => <span className="text-warm-gray">{netText(row.original.net)}</span>,
      },
      {
        accessorKey: 'entryCount',
        header: 'Entries',
      },
      {
        id: 'payment',
        header: 'Payment',
        enableSorting: false,
        cell: ({ row }) => <PaymentStatus statement={row.original} />,
      },
    ],
    [],
  )

  const rowActions = useCallback((statement: SettlementStatementView): RowAction[] => {
    const actions: RowAction[] = [
      { label: 'View', icon: Eye, onSelect: () => setViewing(statement) },
      {
        label: 'Download CSV',
        icon: Download,
        onSelect: () => window.location.assign(csvUrl(statement)),
      },
    ]
    if (statement.canMarkPaid) {
      actions.push({ label: 'Mark paid', icon: HandCoins, onSelect: () => setPaying(statement) })
    }
    return actions
  }, [])

  const reload = useCallback(() => {
    setViewing(null)
    setPaying(null)
    retry()
  }, [retry])

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Settlements</h1>
        <p className="font-sans text-sm text-warm-gray">
          What branches owe each other when a member uses their hours, or a customer spends gems, at
          another branch. Each month closes on the 1st into one statement per pair of branches; only
          the net is paid, by bank transfer or UPI.
        </p>
      </div>

      {state.status === 'loading' ? (
        <Skeleton variant="table" rows={4} />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : data ? (
        <>
          <OpenMonths open={data.open} />
          <section className="space-y-3">
            <h2 className="font-display text-lg tracking-tight text-cocoa-dark">Statements</h2>
            {data.statements.length === 0 ? (
              <EmptyState
                title="No statements yet"
                message="A statement is made when a month closes with sessions or gems between two branches."
                icon={ArrowLeftRight}
              />
            ) : (
              <DataTable
                columns={columns}
                data={data.statements}
                tableId="settlements"
                rowActions={({ original }) => rowActions(original)}
                caption="Monthly statements between branches with their net and payment"
              />
            )}
          </section>
          <StatementPanel
            statement={viewing}
            onClose={() => setViewing(null)}
            onMarkPaid={(statement) => {
              setViewing(null)
              setPaying(statement)
            }}
            onChanged={reload}
          />
          <MarkPaidPanel statement={paying} onClose={() => setPaying(null)} onSaved={reload} />
        </>
      ) : null}
    </div>
  )
}

function PaymentStatus({ statement }: { statement: SettlementStatementView }) {
  if (statement.paid) {
    return (
      <span className="whitespace-nowrap">
        <StatusBadge status="paid" />
        <span className="block text-[11px] text-dusty-gray">
          {formatDateDDMMYYYY(statement.paid.paidOn)}
          {statement.paid.internalTransfer ? ' · internal transfer' : ''}
        </span>
      </span>
    )
  }
  if (statement.net.amountPaise === 0) {
    return <span className="text-dusty-gray">Nothing to pay</span>
  }
  return <StatusBadge status="unpaid" />
}

/* ── Open months ────────────────────────────────────────────────────────── */

function OpenMonths({ open }: { open: SettlementOpenMonthView[] }) {
  if (open.length === 0) {
    return null
  }
  return (
    <section className="space-y-3" aria-labelledby="settlements-open-heading">
      <div>
        <h2
          id="settlements-open-heading"
          className="font-display text-lg tracking-tight text-cocoa-dark"
        >
          This month so far
        </h2>
        <p className="font-sans text-sm text-dusty-gray">
          Running totals. Nothing is owed until the month closes into a statement.
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {open.map((month) => (
          <li
            key={`${month.month}-${month.branchA.id}-${month.branchB.id}`}
            className="space-y-2 rounded-cards border border-cloud-gray bg-canvas-white p-4"
          >
            <p className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
              {monthLabel(month.month)} · {month.entryCount}{' '}
              {month.entryCount === 1 ? 'entry' : 'entries'}
            </p>
            <p className="font-sans text-sm text-cocoa-dark">
              {month.branchA.name} · {month.branchB.name}
            </p>
            <OwedLine from={month.branchA.name} to={month.branchB.name} amounts={month.aOwesB} />
            <OwedLine from={month.branchB.name} to={month.branchA.name} amounts={month.bOwesA} />
            <p className="font-sans text-sm text-warm-gray">{netText(month.net)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function OwedLine({ from, to, amounts }: { from: string; to: string; amounts: SettlementAmounts }) {
  return (
    <p className="font-sans text-xs text-dusty-gray">
      {from} owes {to} {formatINRWithPaise(amounts.totalPaise)}
      <span className="block">
        Memberships {formatINRWithPaise(amounts.membershipPaise)} · Gems{' '}
        {formatINRWithPaise(amounts.gemsPaise)}
      </span>
    </p>
  )
}

/* ── Statement detail ───────────────────────────────────────────────────── */

function StatementPanel({
  statement,
  onClose,
  onMarkPaid,
  onChanged,
}: {
  statement: SettlementStatementView | null
  onClose: () => void
  onMarkPaid: (statement: SettlementStatementView) => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<SettlementDetailView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [reversing, setReversing] = useState<SettlementEntryView | null>(null)

  // Load the open statement's entries. A reply for a statement no longer
  // open (the panel moved on to another, or closed) is dropped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on retry
  useEffect(() => {
    if (!statement) {
      return
    }
    let current = true
    setDetail(null)
    setError(null)
    fetchStatement(statement.id).then(
      (loaded) => current && setDetail(loaded),
      (err: unknown) =>
        current && setError(err instanceof Error ? err.message : 'Could not load the statement.'),
    )
    return () => {
      current = false
    }
  }, [statement, attempt])

  const shown = detail?.statement ?? statement

  return (
    <>
      <DetailSheet
        open={Boolean(statement)}
        onOpenChange={(o) => !o && onClose()}
        title={
          shown
            ? `${shown.branchA.name} and ${shown.branchB.name}, ${monthLabel(shown.month)}`
            : 'Statement'
        }
        description="Closed: it never changes. Corrections land in the month open now."
      >
        {shown ? (
          <div className="space-y-5">
            <dl className="space-y-3 font-sans text-sm">
              <AmountsBlock
                title={`${shown.branchA.name} owes ${shown.branchB.name}`}
                amounts={shown.aOwesB}
              />
              <AmountsBlock
                title={`${shown.branchB.name} owes ${shown.branchA.name}`}
                amounts={shown.bOwesA}
              />
              <div>
                <dt className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
                  Net
                </dt>
                <dd className="text-cocoa-dark" data-testid="statement-net">
                  {netText(shown.net)}
                </dd>
              </div>
              {shown.paid ? (
                <div>
                  <dt className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
                    Paid
                  </dt>
                  <dd className="text-cocoa-dark">
                    {formatDateDDMMYYYY(shown.paid.paidOn)} · {shown.paid.reference}
                    {shown.paid.internalTransfer ? ' · internal transfer' : ''}
                    <span className="block text-[11px] text-dusty-gray">
                      Recorded by {shown.paid.recordedByName ?? 'a former user'} on{' '}
                      {formatDateIST(shown.paid.recordedAt)}
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="flex flex-wrap gap-2">
              <a
                href={csvUrl(shown)}
                download
                className="inline-flex h-9 items-center gap-1.5 rounded-buttons border border-cloud-gray px-4 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray/40"
              >
                <Download className="size-4" aria-hidden="true" />
                Download CSV
              </a>
              {shown.canMarkPaid ? (
                <button
                  type="button"
                  onClick={() => onMarkPaid(shown)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray"
                >
                  <HandCoins className="size-4" aria-hidden="true" />
                  Mark paid
                </button>
              ) : null}
            </div>

            {error ? (
              <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
            ) : !detail ? (
              <Skeleton variant="table" rows={3} />
            ) : (
              <EntriesTable
                entries={detail.entries}
                canReverse={detail.canReverse}
                onReverse={setReversing}
              />
            )}
          </div>
        ) : null}
      </DetailSheet>
      <ReversePanel
        entry={reversing}
        onClose={() => setReversing(null)}
        onReversed={() => {
          setReversing(null)
          onChanged()
        }}
      />
    </>
  )
}

function AmountsBlock({ title, amounts }: { title: string; amounts: SettlementAmounts }) {
  return (
    <div>
      <dt className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">{title}</dt>
      <dd className="text-cocoa-dark">
        {formatINRWithPaise(amounts.totalPaise)}
        <span className="block text-[11px] text-dusty-gray">
          Memberships {formatINRWithPaise(amounts.membershipPaise)} (sessions worth{' '}
          {formatINRWithPaise(amounts.membershipValuePaise)}, of which GST{' '}
          {formatINRWithPaise(amounts.membershipGstSharePaise)}) · Gems{' '}
          {formatINRWithPaise(amounts.gemsPaise)}
        </span>
      </dd>
    </div>
  )
}

function EntriesTable({
  entries,
  canReverse: developer,
  onReverse,
}: {
  entries: SettlementEntryView[]
  canReverse: boolean
  onReverse: (entry: SettlementEntryView) => void
}) {
  if (entries.length === 0) {
    return <p className="font-sans text-sm text-dusty-gray">No entries.</p>
  }
  return (
    <div className="overflow-x-auto rounded-cards border border-cloud-gray">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">The statement&apos;s entries</caption>
        <thead className="bg-cloud-gray/30">
          <tr>
            <Th>Recorded</Th>
            <Th>What</Th>
            <Th>Owed by → to</Th>
            <Th className="text-right">Value</Th>
            <Th className="text-right">GST share</Th>
            <Th className="text-right">Owed</Th>
            {developer ? (
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-cloud-gray">
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="px-3 py-2 whitespace-nowrap text-warm-gray">
                {formatDateIST(entry.recordedAt)}
              </td>
              <td className="px-3 py-2 text-cocoa-dark">
                {entryKindText(entry)}
                <span className="block text-[11px] text-dusty-gray">
                  {[
                    entry.membershipNumber,
                    entry.bookingNumber,
                    entry.minutes !== null ? `${entry.minutes} min` : null,
                    entry.gems !== null ? `${entry.gems} gems` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {entry.note ? (
                  <span className="block text-[11px] text-dusty-gray">{entry.note}</span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-warm-gray">
                {entry.owingBranch.name} → {entry.owedBranch.name}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap text-warm-gray">
                {formatINRWithPaise(entry.valuePaise)}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap text-warm-gray">
                {formatINRWithPaise(entry.gstSharePaise)}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap text-cocoa-dark">
                {formatINRWithPaise(entry.amountOwedPaise)}
              </td>
              {developer ? (
                <td className="px-3 py-2 text-right">
                  {canReverse(entry) ? (
                    <button
                      type="button"
                      onClick={() => onReverse(entry)}
                      className="inline-flex items-center gap-1 font-ui text-xs text-deep-gold transition-colors hover:text-cocoa-dark"
                    >
                      <Undo2 className="size-3.5" aria-hidden="true" />
                      Reverse
                    </button>
                  ) : entry.reversedByEntryId ? (
                    <span className="text-[11px] text-dusty-gray">Reversed</span>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Mark paid ──────────────────────────────────────────────────────────── */

function MarkPaidPanel({
  statement,
  onClose,
  onSaved,
}: {
  statement: SettlementStatementView | null
  onClose: () => void
  onSaved: () => void
}) {
  const fieldId = useId()
  const [today] = useState(() => todayISTDateString())
  const [paidOn, setPaidOn] = useState(today)
  const [reference, setReference] = useState('')
  const [internalTransfer, setInternalTransfer] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    if (statement) {
      setPaidOn(today)
      setReference('')
      setInternalTransfer(false)
      setFormError(null)
      setFieldErrors({})
    }
  }, [statement, today])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!statement) {
      return
    }
    setFormError(null)
    setFieldErrors({})
    if (reference.trim().length === 0) {
      setFieldErrors({ reference: ['Enter the payment reference, such as the UTR.'] })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/settlements/${encodeURIComponent(statement.id)}/paid`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paidOn, reference: reference.trim(), internalTransfer }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        if (json?.error?.details) {
          setFieldErrors(json.error.details as FieldErrors)
        }
        throw new Error(json?.error?.message ?? 'Could not record the payment.')
      }
      toast.success(`${monthLabel(statement.month)} statement marked paid`)
      onSaved()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not record the payment.'
      setFormError(message)
      toast.error('Could not record the payment', message)
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (key: string) => fieldErrors[key]?.join(' ') ?? null

  return (
    <DetailSheet
      open={Boolean(statement)}
      onOpenChange={(o) => !o && onClose()}
      title={statement ? `Mark ${monthLabel(statement.month)} paid` : 'Mark paid'}
      description={statement ? netText(statement.net) : undefined}
    >
      <form onSubmit={save} className="space-y-4" noValidate>
        <Field label="Paid on" htmlFor={`${fieldId}-date`} error={fieldError('paidOn')} required>
          <Input
            id={`${fieldId}-date`}
            type="date"
            max={today}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            aria-invalid={Boolean(fieldErrors.paidOn?.length)}
          />
        </Field>
        <Field
          label="Payment reference"
          htmlFor={`${fieldId}-ref`}
          hint="The bank transfer's UTR or the UPI reference."
          error={fieldError('reference')}
          required
        >
          <Input
            id={`${fieldId}-ref`}
            value={reference}
            maxLength={120}
            onChange={(e) => setReference(e.target.value)}
            aria-invalid={Boolean(fieldErrors.reference?.length)}
          />
        </Field>
        {statement?.sameOwner ? (
          <div className="flex items-start gap-3">
            <Checkbox
              id={`${fieldId}-internal`}
              checked={internalTransfer}
              onCheckedChange={(checked) => setInternalTransfer(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-internal`} className="cursor-pointer text-sm">
                Internal transfer
              </Label>
              <p className="font-sans text-xs text-dusty-gray">
                One Owner owns both branches: the money moved between their accounts.
              </p>
            </div>
          </div>
        ) : null}

        {formError ? (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        ) : null}

        <FormActions busy={saving} onCancel={onClose} submitLabel="Mark Paid" />
      </form>
    </DetailSheet>
  )
}

/* ── Reverse an entry ───────────────────────────────────────────────────── */

function ReversePanel({
  entry,
  onClose,
  onReversed,
}: {
  entry: SettlementEntryView | null
  onClose: () => void
  onReversed: () => void
}) {
  const fieldId = useId()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (entry) {
      setNote('')
      setFormError(null)
    }
  }, [entry])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!entry) {
      return
    }
    if (note.trim().length < 3) {
      setFormError('Say why this entry is being reversed.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/settlements/entries/${encodeURIComponent(entry.id)}/reverse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not reverse the entry.')
      }
      toast.success(`Reversed in ${monthLabel(String(json.data.month))}`)
      onReversed()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not reverse the entry.'
      setFormError(message)
      toast.error('Could not reverse the entry', message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DetailSheet
      open={Boolean(entry)}
      onOpenChange={(o) => !o && onClose()}
      title="Reverse this entry"
      description="A reversing entry for the same amount, negated, is recorded in the month open now. This statement stays as it is."
    >
      <form onSubmit={save} className="space-y-4" noValidate>
        {entry ? (
          <p className="font-sans text-sm text-warm-gray">
            {entryKindText(entry)}: {entry.owingBranch.name} owes {entry.owedBranch.name}{' '}
            {formatINRWithPaise(entry.amountOwedPaise)}
          </p>
        ) : null}
        <Field label="Reason" htmlFor={`${fieldId}-note`} required>
          <Textarea
            id={`${fieldId}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. The session was complimentary"
          />
        </Field>
        {formError ? (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        ) : null}
        <FormActions busy={saving} onCancel={onClose} submitLabel="Reverse Entry" />
      </form>
    </DetailSheet>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 font-ui text-[11px] uppercase tracking-wider text-dusty-gray ${className || 'text-left'}`}
    >
      {children}
    </th>
  )
}
