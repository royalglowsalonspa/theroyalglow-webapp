/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : Catalogue Sync Panel
 * Scope        : Admin Portal — Integrations (Developer)
 *
 * Description  : The Developer's view of where the app's copy of the CMS
 *                catalogue differs from Payload, and the explicit repair:
 *                resync copies the CMS record as it is now into the app
 *                (multi-branch R4.7, catalogue-resync.md). Nothing is deleted.
 *
 * Responsibilities :
 * - Load the drift report (GET /api/catalogue-sync) and list each record:
 *   what it is, how it differs, and a Resync action when one can repair it
 * - Resync one record or every repairable one (POST /api/catalogue-sync),
 *   then announce each outcome and load the report again
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/state/*,
 *                @/components/ui/use-async-data, @/components/ui/icon
 *
 * Notes        :
 * - Presentation only: the API decides what can be repaired and checks each
 *   record's CMS revision as it writes.
 * - Uses ONLY semantic Brand-Token utilities.
 ************************************************************/

'use client'

import { CheckCircle2, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { type AdminColumnDef, DataTable } from '@/components/ui/data-table'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { useAsyncData } from '@/components/ui/use-async-data'

type Table = 'service_category' | 'service' | 'offer'

type Difference = { field: string; cmsValue: string | null; publicValue: string | null }

export type DriftRecord = {
  table: Table
  id: string
  name: string | null
  kind: 'missing' | 'extra' | 'different'
  differences: Difference[]
  cmsUpdatedAt: string | null
  repairable: boolean
}

type Outcome = 'created' | 'updated' | 'retired' | 'unchanged' | 'changed' | 'refused' | 'failed'

type ResyncResult = {
  table: Table
  id: string
  outcome: Outcome
  message: string | null
  remaining: { kind: string | null; differences: Difference[] }
}

const MAX_RECORDS = 25

const TABLE_LABELS: Record<Table, string> = {
  service_category: 'Category',
  service: 'Service',
  offer: 'Offer',
}

const OUTCOME_LABELS: Record<Outcome, string> = {
  created: 'copied into the app',
  updated: 'updated from the CMS',
  retired: 'retired: its checkout rule is gone',
  unchanged: 'nothing to change',
  changed: 'changed in the CMS since this report',
  refused: 'not resynced',
  failed: 'not resynced',
}

async function fetchReport(): Promise<DriftRecord[]> {
  const res = await fetch('/api/catalogue-sync')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not compare the catalogue.')
  }
  return json.data.records as DriftRecord[]
}

async function postResync(records: DriftRecord[]): Promise<ResyncResult[]> {
  const res = await fetch('/api/catalogue-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      records: records.map((r) => ({ table: r.table, id: r.id, cmsUpdatedAt: r.cmsUpdatedAt })),
    }),
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'The resync could not run.')
  }
  return json.data.results as ResyncResult[]
}

function describeDifference(record: DriftRecord): string {
  if (record.kind === 'missing') {
    return 'Missing from the app'
  }
  if (record.kind === 'extra') {
    return 'Not in the CMS: recreate or retire it there. Nothing is deleted here.'
  }
  return record.differences
    .map((d) => `${d.field}: CMS ${d.cmsValue ?? 'empty'}, app ${d.publicValue ?? 'empty'}`)
    .join('; ')
}

/** "Haircut (service svc_cut): updated from the CMS." */
function describeResult(result: ResyncResult, names: Map<string, string | null>): string {
  const name = names.get(`${result.table}:${result.id}`) ?? result.id
  const what = `${name} (${TABLE_LABELS[result.table].toLowerCase()} ${result.id})`
  const detail = result.message ? ` ${result.message}` : ''
  const still =
    result.remaining.kind && !result.message ? ' Some differences remain: check again.' : ''
  return `${what}: ${OUTCOME_LABELS[result.outcome]}.${detail}${still}`
}

export function CatalogueSyncPanel() {
  const { state, retry } = useAsyncData(fetchReport)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState<string[]>([])

  const records = state.status === 'success' ? state.data : []
  const repairable = useMemo(() => records.filter((r) => r.repairable), [records])

  const resync = useCallback(
    async (targets: DriftRecord[]) => {
      if (targets.length === 0) {
        return
      }
      setBusy(true)
      const names = new Map(targets.map((r) => [`${r.table}:${r.id}`, r.name]))
      try {
        const results = await postResync(targets.slice(0, MAX_RECORDS))
        setAnnouncement(results.map((result) => describeResult(result, names)))
      } catch (error) {
        setAnnouncement([error instanceof Error ? error.message : 'The resync could not run.'])
      } finally {
        setBusy(false)
        retry()
      }
    },
    [retry],
  )

  const columns = useMemo<AdminColumnDef<DriftRecord, unknown>[]>(
    () => [
      {
        id: 'record',
        accessorFn: (r) => r.name ?? r.id,
        header: 'Record',
        cell: ({ row }) => (
          <span className="font-ui text-cocoa-dark">
            <span className="font-medium">{row.original.name ?? row.original.id}</span>
            <span className="block text-xs text-warm-gray">
              {TABLE_LABELS[row.original.table]} · {row.original.id}
            </span>
          </span>
        ),
      },
      {
        id: 'difference',
        accessorFn: (r) => describeDifference(r),
        header: 'Difference',
        cell: ({ row }) => (
          <span className="text-warm-gray">{describeDifference(row.original)}</span>
        ),
      },
      {
        id: 'action',
        header: 'Action',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.repairable ? (
            <button
              type="button"
              onClick={() => resync([row.original])}
              disabled={busy}
              aria-label={`Resync ${row.original.name ?? row.original.id}`}
              className="rounded-buttons border border-outline-gray bg-canvas-white px-3 py-1.5 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              Resync
            </button>
          ) : (
            <span className="text-dusty-gray">Fix in the CMS</span>
          ),
      },
    ],
    [busy, resync],
  )

  return (
    <section aria-labelledby="catalogue-sync-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="catalogue-sync-heading" className="font-display text-xl text-cocoa-dark">
            Catalogue sync
          </h2>
          <p className="max-w-prose text-sm text-warm-gray">
            Where the app's copy of the CMS catalogue differs from it. Resync copies the CMS record
            as it is now; nothing is deleted.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={retry}
            disabled={busy || state.status === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-buttons border border-outline-gray bg-canvas-white px-4 py-2 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon icon={RefreshCw} decorative size={16} />
            Check again
          </button>
          {repairable.length > 0 ? (
            <button
              type="button"
              onClick={() => resync(repairable)}
              disabled={busy}
              className="rounded-buttons border border-outline-gray bg-canvas-white px-4 py-2 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {repairable.length > MAX_RECORDS
                ? `Resync the first ${MAX_RECORDS}`
                : `Resync all (${repairable.length})`}
            </button>
          ) : null}
        </div>
      </div>

      <div aria-live="polite" className="space-y-1 text-sm text-cocoa-dark">
        {announcement.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      {state.status === 'loading' ? (
        <Skeleton rows={3} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="In sync"
          message="The app's catalogue matches the CMS."
        />
      ) : (
        <DataTable
          columns={columns}
          data={records}
          tableId="catalogue-sync"
          caption="Catalogue records that differ from the CMS"
        />
      )}
    </section>
  )
}
