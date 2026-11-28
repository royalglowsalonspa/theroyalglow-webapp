'use client'

import { monthKeyIST } from '@rgss/business'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { type AdminColumnDef, DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateTimeIST, formatINRWithPaise } from '@/lib/admin/format'

const endpoint = '/api/invoice-reconciliation'
const branchList = z.object({ branches: z.array(z.object({ id: z.string(), name: z.string() })) })
const publicationSchema = z.enum(['published', 'pending', 'failed', 'uncaptured'])
const inventorySchema = z.object({
  branchId: z.string(),
  month: z.string(),
  invoiceCount: z.int().nonnegative(),
  invoices: z.array(
    z.object({
      invoiceId: z.string(),
      invoiceNumber: z.string(),
      totalPaise: z.int().nonnegative(),
      publication: publicationSchema,
      periodBasis: z.enum(['saved_issue_time', 'creation_time_fallback']),
      pinnedEvent: z.boolean(),
      legacyPdfReference: z.boolean(),
      nextAction: z.enum([
        'verify_published_event',
        'review_outbox',
        'verify_original_pdf',
        'locate_original_evidence',
      ]),
    }),
  ),
})
const comparisonSchema = z.object({
  branchId: z.string(),
  month: z.string(),
  checkedAt: z.iso.datetime(),
  status: z.enum(['matched', 'different', 'incomplete', 'empty']),
  neonCount: z.int().nonnegative(),
  portalCount: z.int().nonnegative(),
  exceptions: z.array(
    z.object({
      invoiceId: z.string(),
      reason: z.enum([
        'missing_from_neon',
        'missing_from_portal',
        'amount_differs',
        'publication_incomplete',
      ]),
      neonPaise: z.int().nonnegative().nullable(),
      portalPaise: z.int().nonnegative().nullable(),
      publication: publicationSchema.nullable(),
    }),
  ),
})
const actionResult = z.object({
  invoiceId: z.string(),
  branchId: z.string(),
  status: z.enum(['archived', 'restored', 'verified']),
})
type Inventory = z.infer<typeof inventorySchema>
type InvoiceRow = Inventory['invoices'][number]
type Comparison = z.infer<typeof comparisonSchema>
type Exception = Comparison['exceptions'][number]
const actions = {
  recover_invoice: { review: 'Review restore', submit: 'Restore invoice' },
  archive_original: { review: 'Review original', submit: 'Archive original PDF' },
}
type Action = keyof typeof actions
const publicationLabel: Record<InvoiceRow['publication'], string> = {
  published: 'Published',
  pending: 'Pending publication',
  failed: 'Publication failed',
  uncaptured: 'No captured event',
}
const comparisonLabel: Record<Comparison['status'], string> = {
  matched: 'Invoices match',
  different: 'Invoice differences found',
  incomplete: 'Publication incomplete',
  empty: 'Both systems are empty for this month',
}
const exceptionLabel: Record<Exception['reason'], string> = {
  missing_from_neon: 'Missing from billing',
  missing_from_portal: 'Missing from portal',
  amount_differs: 'Amount differs',
  publication_incomplete: 'Publication incomplete',
}
const exceptionColumns: AdminColumnDef<Exception & { invoiceNumber?: string }>[] = [
  {
    accessorKey: 'invoiceId',
    header: 'Invoice',
    cell: ({ row: { original } }) => (
      <span className="break-all">
        {original.invoiceNumber && (
          <span className="block font-medium text-cocoa-dark">{original.invoiceNumber}</span>
        )}
        {original.invoiceId}
      </span>
    ),
  },
  {
    accessorKey: 'reason',
    header: 'Difference',
    cell: ({ row: { original } }) => (
      <span>
        {exceptionLabel[original.reason]}
        {original.publication && (
          <span className="block text-xs text-warm-gray">
            {publicationLabel[original.publication]}
          </span>
        )}
      </span>
    ),
  },
  {
    accessorKey: 'neonPaise',
    header: 'Billing amount',
    cell: ({ row: { original } }) =>
      original.neonPaise === null ? 'Unavailable' : formatINRWithPaise(original.neonPaise),
  },
  {
    accessorKey: 'portalPaise',
    header: 'Portal amount',
    cell: ({ row: { original } }) =>
      original.portalPaise === null ? 'Unavailable' : formatINRWithPaise(original.portalPaise),
  },
]

async function readResponse<T>(response: Response, schema: z.ZodType<T>, fallback: string) {
  const json: unknown = await response.json().catch(() => null)
  const result = z.object({ success: z.literal(true), data: schema }).safeParse(json)
  if (response.ok && result.success) return result.data.data
  const failure = z.object({ error: z.object({ message: z.string() }) }).safeParse(json)
  throw new Error(failure.success ? failure.data.error.message : fallback)
}

async function loadBranches() {
  return readResponse(await fetch('/api/branches'), branchList, 'Could not load the branches.')
}

function recoveryAction(invoice: InvoiceRow): Action | null {
  if (invoice.nextAction === 'verify_published_event' && invoice.pinnedEvent)
    return 'recover_invoice'
  if (invoice.publication === 'uncaptured') return 'archive_original'
  return null
}

export function InvoiceRecoveryPanel() {
  const { state: branchState, retry: retryBranches } = useAsyncData(loadBranches)
  const [month, setMonth] = useState(() => monthKeyIST())
  const [branch, setBranch] = useState('')
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [review, setReview] = useState<{ invoice: InvoiceRow; action: Action } | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<'load' | 'compare' | 'save' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const reasonField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (review) reasonField.current?.focus()
  }, [review])

  function clearInventory() {
    setInventory(null)
    setComparison(null)
    setReview(null)
    setError('')
    setNotice('')
  }

  async function comparePortal() {
    if (!inventory || pending) return
    const { branchId, month } = inventory
    setPending('compare')
    setComparison(null)
    setError('')
    try {
      const search = new URLSearchParams({ month, branchId })
      const result = await readResponse(
        await fetch(`${endpoint}?${search}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(12_000),
        }),
        comparisonSchema,
        'Could not compare the invoice portal with billing.',
      )
      if (result.branchId !== branchId || result.month !== month)
        throw new Error('The comparison does not match the selected branch and month.')
      setComparison(result)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not compare the invoice portal with billing.',
      )
    } finally {
      setPending(null)
    }
  }

  async function submitInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!branch || pending) return
    clearInventory()
    setPending('load')
    try {
      const search = new URLSearchParams({ report: 'backfill_inventory', month, branchId: branch })
      const result = await readResponse(
        await fetch(`${endpoint}?${search}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(12_000),
        }),
        inventorySchema,
        'Could not load the invoice inventory.',
      )
      if (result.branchId !== branch || result.month !== month)
        throw new Error('The inventory does not match the selected branch and month.')
      setInventory(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the invoice inventory.')
    } finally {
      setPending(null)
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inventory || !review || !reason.trim() || pending) return
    setPending('save')
    setError('')
    setNotice('')
    const invoiceId = review.invoice.invoiceId
    const branchId = inventory.branchId
    try {
      const result = await readResponse(
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report: review.action,
            invoiceId,
            branchId,
            reason: reason.trim(),
          }),
          signal: AbortSignal.timeout(30_000),
        }),
        actionResult,
        'Could not complete the invoice operation.',
      )
      if (result.branchId !== branchId || result.invoiceId !== invoiceId)
        throw new Error('The result does not match the selected invoice.')
      setComparison(null)
      setNotice(`${review.invoice.invoiceNumber} ${result.status}.`)
      setReview(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete the invoice operation.')
    } finally {
      setPending(null)
    }
  }

  const exceptions = useMemo(() => {
    const numbers = new Map(
      inventory?.invoices.map(({ invoiceId, invoiceNumber }) => [invoiceId, invoiceNumber]),
    )
    return (
      comparison?.exceptions.map((exception) => {
        const invoiceNumber = numbers.get(exception.invoiceId)
        return invoiceNumber ? { ...exception, invoiceNumber } : exception
      }) ?? []
    )
  }, [comparison, inventory])

  const columns = useMemo<AdminColumnDef<InvoiceRow>[]>(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: 'Invoice',
        cell: ({ row }) => (
          <span className="font-medium text-cocoa-dark">
            {row.original.invoiceNumber}
            {row.original.periodBasis === 'creation_time_fallback' && (
              <span className="block text-xs font-normal text-warm-gray">Billing record date</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'totalPaise',
        header: 'Total',
        cell: ({ row }) => formatINRWithPaise(row.original.totalPaise),
      },
      {
        accessorKey: 'publication',
        header: 'Source evidence',
        cell: ({ row }) => (
          <span>
            {publicationLabel[row.original.publication]}
            {row.original.legacyPdfReference && (
              <span className="block text-xs text-warm-gray">PDF reference recorded</span>
            )}
          </span>
        ),
      },
      {
        id: 'action',
        header: 'Action',
        enableSorting: false,
        cell: ({ row }) => {
          const invoice = row.original
          const action = recoveryAction(invoice)
          return action ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending !== null}
              aria-label={`${actions[action].review} for ${invoice.invoiceNumber}`}
              onClick={() => {
                setReview({ invoice, action })
                setReason('')
                setNotice('')
                setError('')
              }}
            >
              {actions[action].review}
            </Button>
          ) : (
            <span className="text-warm-gray">
              {invoice.nextAction === 'review_outbox' ? 'Review outbox' : 'Check original evidence'}
            </span>
          )
        },
      },
    ],
    [pending],
  )

  return (
    <section aria-labelledby="invoice-recovery-heading" className="space-y-4">
      <div>
        <h2 id="invoice-recovery-heading" className="font-display text-xl text-cocoa-dark">
          Invoice recovery
        </h2>
        <p className="max-w-prose text-sm text-warm-gray">
          Check a closed month for invoice differences, saved events and original PDFs.
        </p>
      </div>

      <form onSubmit={submitInventory} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm font-medium text-cocoa-dark">
          Branch
          <select
            className="h-9 min-w-44 max-w-full rounded-md border border-input bg-background px-2 font-normal focus-visible:outline-2 focus-visible:outline-ring"
            value={branch}
            required
            disabled={branchState.status !== 'success' || pending !== null}
            onChange={(event) => {
              setBranch(event.target.value)
              clearInventory()
            }}
          >
            <option value="">
              {branchState.status === 'loading' ? 'Loading branches…' : 'Choose a branch'}
            </option>
            {branchState.status === 'success' &&
              branchState.data.branches.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <label
          htmlFor="invoice-recovery-month"
          className="grid gap-1.5 text-sm font-medium text-cocoa-dark"
        >
          Invoice month (IST)
          <Input
            id="invoice-recovery-month"
            type="month"
            min="1000-01"
            max={monthKeyIST()}
            value={month}
            required
            disabled={pending !== null}
            onChange={(event) => {
              setMonth(event.target.value)
              clearInventory()
            }}
          />
        </label>
        <Button type="submit" disabled={!branch || !month || pending !== null}>
          {pending === 'load' ? 'Loading inventory…' : 'Load inventory'}
        </Button>
        {inventory && (
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={comparePortal}
          >
            {pending === 'compare' ? 'Comparing…' : 'Compare with portal'}
          </Button>
        )}
      </form>

      {branchState.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <p>{branchState.message}</p>
          <Button type="button" size="sm" variant="outline" onClick={retryBranches}>
            Retry branches
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-cocoa-dark">
          {notice}
        </p>
      )}
      {comparison && (
        <div className="space-y-2">
          <div role="status">
            <h3 className="font-medium text-cocoa-dark">{comparisonLabel[comparison.status]}</h3>
            <p className="text-sm text-warm-gray">
              Billing: {comparison.neonCount} · Portal: {comparison.portalCount} · Checked{' '}
              {formatDateTimeIST(comparison.checkedAt)} IST
            </p>
          </div>
          {exceptions.length > 0 && (
            <DataTable
              tableId="invoice-recovery-differences"
              caption={`Invoice differences for ${comparison.month}`}
              columns={exceptionColumns}
              data={exceptions}
            />
          )}
        </div>
      )}

      {review && (
        <form
          onSubmit={submitReview}
          aria-label="Confirm invoice operation"
          className="space-y-3 rounded-md border border-outline-gray p-4"
        >
          <div>
            <h3 className="font-medium text-cocoa-dark">
              {actions[review.action].submit} · {review.invoice.invoiceNumber}
            </h3>
            <p className="text-sm text-warm-gray">
              This action publishes the saved record to the invoice portal. Customer email is
              handled separately.
            </p>
          </div>
          <label
            htmlFor="invoice-recovery-reason"
            className="grid max-w-lg gap-1.5 text-sm font-medium text-cocoa-dark"
          >
            Reason
            <Input
              id="invoice-recovery-reason"
              ref={reasonField}
              value={reason}
              maxLength={200}
              required
              disabled={pending === 'save'}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!reason.trim() || pending !== null}>
              {pending === 'save' ? 'Saving…' : actions[review.action].submit}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending === 'save'}
              onClick={() => setReview(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {inventory &&
        (inventory.invoices.length ? (
          <DataTable
            tableId="invoice-recovery"
            caption={`Invoice recovery inventory for ${inventory.month}`}
            columns={columns}
            data={inventory.invoices}
          />
        ) : (
          <p className="text-sm text-warm-gray">No invoices for the selected branch and month.</p>
        ))}
    </section>
  )
}
