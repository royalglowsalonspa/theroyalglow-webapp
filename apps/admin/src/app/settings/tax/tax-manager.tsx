/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Tax Manager
 * Scope        : Admin Portal — Branch tax rates (multi-branch R6.4, TX-01, TX-10)
 *
 * Description  : The active branch's GST rates per SAC code, effective-dated,
 *                with the issuer details its invoices carry. The Developer
 *                adds a rate (a change starts on a future date) and records a
 *                rate's launch review. Rates are never edited or deleted.
 *
 * Responsibilities :
 * - Load GET /api/tax-versions
 * - Show the issuer (legal name, GSTIN, invoice prefix) and whether the
 *   branch can invoice in the current mode
 * - Add a rate (POST) in a side panel; mark a rate reviewed (PATCH) after a
 *   confirmation, since the review can't be undone
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : DataTable, SlideOverPanel, AlertDialog, form-field, Select,
 *                state presenters, useAsyncData, @/lib/admin/format,
 *                @rgss/types
 *
 * Notes        : Rates are typed as percentages with up to two decimals and
 *                sent as basis points (5% → 500).
 ************************************************************/

'use client'

import {
  MAX_TAX_RATE_BPS,
  REVIEWED_SAC_CODES,
  SAC_CODE_LABELS,
  type SacCode,
  type TaxVersionView,
} from '@rgss/types'
import { BadgeCheck, Percent } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { type AdminColumnDef, DataTable, type RowAction } from '@/components/ui/data-table'
import { Field, FormActions } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SlideOverPanel } from '@/components/ui/slide-over-panel'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { Textarea } from '@/components/ui/textarea'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateIST, sampleInvoiceNumber } from '@/lib/admin/format'
import { addDaysISO, todayISTDateString } from '@/lib/admin/memberships'
import { toast } from '@/lib/admin/toast'

/** GET /api/tax-versions. */
export interface TaxScreenData {
  branchId: string
  branchName: string
  issuer: {
    legalName: string | null
    gstin: string | null
    invoicePrefix: string
    prefixFixed: boolean
  }
  invoicingLive: boolean
  versions: TaxVersionView[]
}

type FieldErrors = Record<string, string[] | undefined>

/** 500 → "5%", 1250 → "12.5%". */
export function ratePercentText(bps: number): string {
  return `${bps / 100}%`
}

/** "5" or "12.5" typed as a percentage → basis points, or null. */
export function percentToBps(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(trimmed)) {
    return null
  }
  const bps = Math.round(Number(trimmed) * 100)
  return bps <= MAX_TAX_RATE_BPS ? bps : null
}

function sacLabel(code: string): string {
  const label = SAC_CODE_LABELS[code as SacCode]
  return label ? `${code} · ${label}` : code
}

/**
 * Why the branch can't invoice in the current mode, or null. Live invoicing
 * needs the legal name, GSTIN and every rate in force reviewed (TX-08).
 */
export function invoicingBlockers(data: TaxScreenData): string[] {
  const blockers: string[] = []
  const inForce = data.versions.filter((v) => v.state === 'in_force')
  const missingCodes = REVIEWED_SAC_CODES.filter((code) => !inForce.some((v) => v.sacCode === code))
  if (missingCodes.length > 0) {
    blockers.push(`no rate in force for SAC ${missingCodes.join(', ')}`)
  }
  if (data.invoicingLive) {
    if (!data.issuer.legalName) {
      blockers.push('its legal name')
    }
    if (!data.issuer.gstin) {
      blockers.push('its GSTIN')
    }
    if (inForce.some((v) => v.reviewStatus !== 'reviewed')) {
      blockers.push('reviewed rates')
    }
  }
  return blockers
}

async function fetchTaxScreen(): Promise<TaxScreenData> {
  const res = await fetch('/api/tax-versions')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load the tax rates.')
  }
  return json.data as TaxScreenData
}

export function TaxManager() {
  const { state, retry } = useAsyncData(fetchTaxScreen)
  const [adding, setAdding] = useState(false)
  const [reviewing, setReviewing] = useState<TaxVersionView | null>(null)

  const data = state.status === 'success' ? state.data : null

  const columns = useMemo<AdminColumnDef<TaxVersionView, unknown>[]>(
    () => [
      {
        accessorKey: 'sacCode',
        header: 'SAC',
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            <span className="font-mono text-xs text-cocoa-dark">{row.original.sacCode}</span>
            <span className="block text-[11px] text-dusty-gray">
              {SAC_CODE_LABELS[row.original.sacCode as SacCode] ?? ''}
            </span>
          </span>
        ),
      },
      {
        accessorKey: 'rateBps',
        header: 'GST',
        cell: ({ row }) => (
          <span className="font-ui text-cocoa-dark">{ratePercentText(row.original.rateBps)}</span>
        ),
      },
      {
        accessorKey: 'effectiveFrom',
        header: 'From',
        cell: ({ row }) => formatDateIST(row.original.effectiveFrom),
      },
      {
        accessorKey: 'state',
        header: 'Status',
        // The badge title-cases the state: In Force, Scheduled, Replaced.
        cell: ({ row }) => <StatusBadge status={row.original.state} />,
      },
      {
        accessorKey: 'reviewStatus',
        header: 'Review',
        cell: ({ row }) =>
          row.original.reviewStatus === 'reviewed' ? (
            <span className="whitespace-nowrap text-cocoa-dark">
              Reviewed
              <span className="block text-[11px] text-dusty-gray">
                {row.original.reviewedByName ?? '—'} · {formatDateIST(row.original.reviewedAt)}
              </span>
            </span>
          ) : (
            <span className="text-dusty-gray">Provisional</span>
          ),
      },
      {
        accessorKey: 'reason',
        header: 'Reason',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block max-w-xs text-warm-gray">
            {row.original.reason}
            {row.original.usedByInvoices ? (
              <span className="block text-[11px] text-dusty-gray">Used by invoices</span>
            ) : null}
          </span>
        ),
      },
    ],
    [],
  )

  const rowActions = useCallback(
    (version: TaxVersionView): RowAction[] =>
      version.reviewStatus === 'provisional'
        ? [{ label: 'Mark reviewed', icon: BadgeCheck, onSelect: () => setReviewing(version) }]
        : [],
    [],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">
            Tax Rates{data ? ` · ${data.branchName}` : ''}
          </h1>
          <p className="font-sans text-sm text-warm-gray">
            GST per SAC code at the active branch. Prices include GST; a change of rate starts on a
            future date and applies to invoices from then on.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={!data}
          className="inline-flex h-9 items-center gap-1.5 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:opacity-50"
        >
          + Add Rate
        </button>
      </div>

      {state.status === 'loading' ? (
        <Skeleton variant="table" rows={4} />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : data ? (
        <>
          <IssuerCard data={data} />
          {data.versions.length === 0 ? (
            <EmptyState
              title="No tax rates yet"
              message="Add a rate for each SAC code this branch invoices."
              icon={Percent}
            />
          ) : (
            <DataTable
              columns={columns}
              data={data.versions}
              tableId="tax-versions"
              rowActions={({ original }) => rowActions(original)}
              caption="GST rates per SAC code with their start date, status and review"
            />
          )}
          <AddRatePanel
            open={adding}
            data={data}
            onClose={() => setAdding(false)}
            onSaved={() => {
              setAdding(false)
              retry()
            }}
          />
          <ReviewDialog
            version={reviewing}
            branchId={data.branchId}
            onClose={() => setReviewing(null)}
            onReviewed={() => {
              setReviewing(null)
              retry()
            }}
          />
        </>
      ) : null}
    </div>
  )
}

function IssuerCard({ data }: { data: TaxScreenData }) {
  const blockers = invoicingBlockers(data)
  return (
    <section className="space-y-3 rounded-cards border border-cloud-gray bg-canvas-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="grid gap-x-8 gap-y-2 font-sans text-sm sm:grid-cols-3">
          <div>
            <dt className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
              Legal name
            </dt>
            <dd className="text-cocoa-dark">{data.issuer.legalName ?? 'Not set'}</dd>
          </div>
          <div>
            <dt className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">GSTIN</dt>
            <dd className="font-mono text-xs text-cocoa-dark">{data.issuer.gstin ?? 'Not set'}</dd>
          </div>
          <div>
            <dt className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
              Invoice numbers
            </dt>
            <dd className="text-cocoa-dark">
              {sampleInvoiceNumber(data.issuer.invoicePrefix)}
              {data.issuer.prefixFixed ? (
                <span className="block text-[11px] text-dusty-gray">
                  Prefix fixed: invoices issued
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
        <Link
          href="/branches"
          className="font-ui text-sm text-deep-gold transition-colors hover:text-cocoa-dark"
        >
          Edit on Branches →
        </Link>
      </div>
      <p
        className={`rounded-cards px-3 py-2 font-sans text-sm ${
          blockers.length > 0 ? 'bg-error/5 text-error' : 'bg-cloud-gray/40 text-warm-gray'
        }`}
        role={blockers.length > 0 ? 'alert' : undefined}
      >
        {data.invoicingLive
          ? 'Live invoicing. '
          : 'Test invoicing: invoices say their rates are provisional. '}
        {blockers.length > 0
          ? `${data.branchName} can't invoice yet: it needs ${blockers.join(', ')}.`
          : `${data.branchName} can invoice.`}
      </p>
    </section>
  )
}

function AddRatePanel({
  open,
  data,
  onClose,
  onSaved,
}: {
  open: boolean
  data: TaxScreenData
  onClose: () => void
  onSaved: () => void
}) {
  const fieldId = useId()
  const [today] = useState(() => todayISTDateString())
  const [sacCode, setSacCode] = useState<SacCode>(REVIEWED_SAC_CODES[0])
  const [rate, setRate] = useState('5')
  const [effectiveFrom, setEffectiveFrom] = useState(() => addDaysISO(todayISTDateString(), 1))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    if (open) {
      setRate('5')
      setEffectiveFrom(addDaysISO(today, 1))
      setReason('')
      setFormError(null)
      setFieldErrors({})
    }
  }, [open, today])

  // A first rate for the code may start any day; a change, tomorrow or later.
  const hasRates = data.versions.some((v) => v.sacCode === sacCode)
  const earliest = hasRates ? addDaysISO(today, 1) : undefined

  const save = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setFormError(null)
      setFieldErrors({})
      const rateBps = percentToBps(rate)
      if (rateBps === null) {
        setFieldErrors({ rateBps: [`Enter a rate from 0% to ${MAX_TAX_RATE_BPS / 100}%.`] })
        return
      }
      if (reason.trim().length < 3) {
        setFieldErrors({ reason: ['Say why the rate changes.'] })
        return
      }
      setSaving(true)
      try {
        const res = await fetch('/api/tax-versions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            branchId: data.branchId,
            sacCode,
            rateBps,
            effectiveFrom,
            reason: reason.trim(),
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          if (json?.error?.details) {
            setFieldErrors(json.error.details as FieldErrors)
          }
          throw new Error(json?.error?.message ?? 'Could not add this rate.')
        }
        toast.success(`${ratePercentText(rateBps)} added for SAC ${sacCode}`)
        onSaved()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not add this rate.'
        setFormError(message)
        toast.error('Could not add rate', message)
      } finally {
        setSaving(false)
      }
    },
    [rate, reason, sacCode, effectiveFrom, data.branchId, onSaved],
  )

  const fieldError = (key: string) => fieldErrors[key]?.join(' ') ?? null

  return (
    <SlideOverPanel
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Add a rate at ${data.branchName}`}
      description="It applies from 00:00 IST on its start date until a later rate starts."
    >
      <form onSubmit={save} className="space-y-4" noValidate>
        <Field label="SAC code" htmlFor={`${fieldId}-sac`} error={fieldError('sacCode')}>
          <Select value={sacCode} onValueChange={(v) => setSacCode(v as SacCode)}>
            <SelectTrigger id={`${fieldId}-sac`} className="w-full">
              <SelectValue>{sacLabel(sacCode)}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {REVIEWED_SAC_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {sacLabel(code)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="GST rate (%)"
            htmlFor={`${fieldId}-rate`}
            hint="Total GST; invoices split it into CGST and SGST."
            error={fieldError('rateBps')}
          >
            <Input
              id={`${fieldId}-rate`}
              type="text"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              aria-invalid={Boolean(fieldErrors.rateBps?.length)}
            />
          </Field>
          <Field
            label="Starts on"
            htmlFor={`${fieldId}-from`}
            hint={hasRates ? 'A change starts tomorrow or later.' : 'The first rate for this code.'}
            error={fieldError('effectiveFrom')}
          >
            <Input
              id={`${fieldId}-from`}
              type="date"
              min={earliest}
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              aria-invalid={Boolean(fieldErrors.effectiveFrom?.length)}
            />
          </Field>
        </div>
        <Field label="Reason" htmlFor={`${fieldId}-reason`} error={fieldError('reason')} required>
          <Textarea
            id={`${fieldId}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. GST notification 9/2025 rate change"
            aria-invalid={Boolean(fieldErrors.reason?.length)}
          />
        </Field>

        {formError ? (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        ) : null}

        <FormActions busy={saving} onCancel={onClose} submitLabel="Add Rate" />
      </form>
    </SlideOverPanel>
  )
}

function ReviewDialog({
  version,
  branchId,
  onClose,
  onReviewed,
}: {
  version: TaxVersionView | null
  branchId: string
  onClose: () => void
  onReviewed: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (version) {
      setError(null)
    }
  }, [version])

  const confirm = async () => {
    if (!version) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/tax-versions/${version.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branchId, reviewed: true }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not record the review.')
      }
      toast.success(`${ratePercentText(version.rateBps)} for SAC ${version.sacCode} reviewed`)
      onReviewed()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not record the review.'
      setError(message)
      toast.error('Could not record the review', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={Boolean(version)} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {version
              ? `Mark ${ratePercentText(version.rateBps)} for SAC ${version.sacCode} reviewed?`
              : ''}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This records that the launch tax review approved this rate. It can&apos;t be undone; a
            different rate is added as a new one.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="font-sans text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onClose}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              confirm()
            }}
          >
            {busy ? 'Saving…' : 'Mark Reviewed'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
