'use client'

import { istToday, monthKeyIST } from '@rgss/business'
import { invoiceEventIdSchema, invoiceReconciliationMonthSchema } from '@rgss/types'
import { type FormEvent, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAsyncData } from '@/components/ui/use-async-data'

const branchResponse = z.object({
  success: z.literal(true),
  data: z.object({ branches: z.array(z.object({ id: invoiceEventIdSchema, name: z.string() })) }),
})
const publishResponse = z.object({
  success: z.literal(true),
  data: z.object({
    branchId: invoiceEventIdSchema,
    month: invoiceReconciliationMonthSchema,
    status: z.enum(['published', 'unchanged']),
  }),
})
const publishError = z.object({ error: z.object({ message: z.string() }) })
const reports = z.enum(['branch_settlement', 'checkout_collections', 'coverage'])
const names: Record<z.infer<typeof reports>, string> = {
  branch_settlement: 'Branch settlement activity',
  checkout_collections: 'Recorded service collections',
  coverage: 'Billing source coverage',
}
const labelClass = 'grid gap-1.5 text-sm font-medium text-cocoa-dark'
const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-2 font-normal focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'
const fallback = 'Could not confirm that the invoice portal received the report. Try again.'

async function loadBranches() {
  const response = await fetch('/api/branches', { cache: 'no-store' })
  const result = branchResponse.safeParse(await response.json().catch(() => null))
  if (!response.ok || !result.success) throw new Error('Could not load branches.')
  return result.data.data.branches
}

export function InvoiceReportsPanel() {
  const { state: branches, retry } = useAsyncData(loadBranches)
  const [branchId, setBranchId] = useState('')
  const [month, setMonth] = useState(() => istToday().slice(0, 7))
  const [report, setReport] = useState<z.infer<typeof reports>>('branch_settlement')
  const [result, setResult] = useState<
    { kind: 'pending' } | { kind: 'success' | 'error'; message: string } | null
  >(null)
  const publishing = useRef(false)
  const pending = result?.kind === 'pending'
  const coverage = report === 'coverage'
  const now = new Date()
  const lastClosedMonth = monthKeyIST(now)
  const latestMonth = coverage ? lastClosedMonth : istToday(now).slice(0, 7)
  const branch =
    branches.status === 'success' ? branches.data.find(({ id }) => id === branchId) : undefined
  const validScope =
    !!branch && invoiceReconciliationMonthSchema.safeParse(month).success && month <= latestMonth

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validScope || !branch || publishing.current) return
    publishing.current = true
    setResult({ kind: 'pending' })
    try {
      const response = await fetch('/api/invoice-reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId, month, ...(coverage ? {} : { report }) }),
        signal: AbortSignal.timeout(30_000),
      })
      const json: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const failure = publishError.safeParse(json)
        setResult({
          kind: 'error',
          message: failure.success ? failure.data.error.message : fallback,
        })
        return
      }
      const parsed = publishResponse.safeParse(json)
      if (
        !parsed.success ||
        parsed.data.data.branchId !== branchId ||
        parsed.data.data.month !== month
      ) {
        setResult({ kind: 'error', message: fallback })
        return
      }
      const scope = `${names[report]} for ${branch.name} (${month})`
      setResult({
        kind: 'success',
        message:
          parsed.data.data.status === 'published'
            ? `${scope} published to the invoice portal.`
            : `${scope} is unchanged. The portal kept its existing snapshot.`,
      })
    } catch {
      setResult({ kind: 'error', message: fallback })
    } finally {
      publishing.current = false
    }
  }

  return (
    <section aria-labelledby="invoice-reports-heading" className="space-y-4">
      <div>
        <h2 id="invoice-reports-heading" className="font-display text-xl text-cocoa-dark">
          Publish invoice reports
        </h2>
        <p className="max-w-prose text-sm text-warm-gray">
          Refresh one branch report in the invoice portal from the latest Admin records.
        </p>
      </div>
      <form onSubmit={publish} className="flex flex-wrap items-end gap-3" aria-busy={pending}>
        <label className={labelClass}>
          Report
          <select
            className={selectClass}
            value={report}
            disabled={pending}
            onChange={(event) => {
              const next = reports.safeParse(event.target.value)
              if (!next.success) return
              setReport(next.data)
              if (next.data === 'coverage' && month > lastClosedMonth) setMonth(lastClosedMonth)
              setResult(null)
            }}
          >
            {reports.options.map((type) => (
              <option key={type} value={type}>
                {names[type]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Branch
          <select
            className={selectClass}
            value={branchId}
            disabled={pending || branches.status !== 'success' || branches.data.length === 0}
            required
            onChange={(event) => {
              setBranchId(event.target.value)
              setResult(null)
            }}
          >
            <option value="">
              {branches.status === 'loading' ? 'Loading branches…' : 'Choose a branch'}
            </option>
            {branches.status === 'success' &&
              branches.data.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <label htmlFor="invoice-report-month" className={labelClass}>
          Report month (IST)
          <Input
            id="invoice-report-month"
            type="month"
            min="1000-01"
            max={latestMonth}
            value={month}
            disabled={pending}
            required
            onChange={(event) => {
              setMonth(event.target.value)
              setResult(null)
            }}
          />
        </label>
        <Button type="submit" disabled={pending || !validScope}>
          {pending ? 'Publishing…' : 'Publish report'}
        </Button>
      </form>
      {coverage && (
        <p className="text-sm text-warm-gray">Billing source coverage uses closed months.</p>
      )}
      {branches.status === 'success' && branches.data.length === 0 && (
        <p className="text-sm text-warm-gray">Add a branch in Admin to publish its reports.</p>
      )}
      {branches.status === 'error' && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-destructive">
            {branches.message}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Retry branches
          </Button>
        </div>
      )}
      {result?.kind === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {result.message}
        </p>
      )}
      <output className="block text-sm text-cocoa-dark">
        {result?.kind === 'success' ? result.message : null}
      </output>
    </section>
  )
}
