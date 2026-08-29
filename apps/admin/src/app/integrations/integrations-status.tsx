/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : Integrations Status
 * Scope        : Admin Portal — Integrations (Developer)
 *
 * Description  : Developer-only integration health list rebuilt on the admin
 *                design-system primitives. Renders each external integration
 *                (Ably, Resend, QStash, R2, CMS) via the reusable DataTable,
 *                its connection state via StatusBadge, and loading / empty /
 *                error conditions via the shared state presenters. Fetch
 *                orchestration + timeout is delegated to useAsyncData; the
 *                Refresh action re-requests via the hook's retry. Consumes
 *                GET /api/integrations as-is.
 *
 * Responsibilities :
 * - Fetch integration statuses (GET /api/integrations) via useAsyncData
 * - Present them in the DataTable (Integration, Status, Configured, Detail)
 * - Render the connection state via StatusBadge (ok / degraded /
 *   unconfigured / error)
 * - Preserve the Refresh action and loading / empty / error states
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation (Data Table Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/status-badge,
 *                @/components/ui/state/*, @/components/ui/use-async-data,
 *                @/components/ui/icon
 *
 * Notes        :
 * - Presentation-layer only: no API / RBAC / data-model / business-logic
 *   changes. Consumes the existing GET /api/integrations contract unchanged.
 * - Uses ONLY semantic Brand-Token utilities — no hex / raw palette literals.
 * - Every pre-redesign field (name, status, detail) and the Refresh action are
 *   preserved; `configured` is surfaced explicitly as its own column.
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5
 ************************************************************/

'use client'

import { Plug, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { type AdminColumnDef, DataTable } from '@/components/ui/data-table'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'

type Integration = {
  name: string
  configured: boolean
  status: 'ok' | 'degraded' | 'unconfigured' | 'error'
  detail?: string
}

async function fetchIntegrations(): Promise<Integration[]> {
  const res = await fetch('/api/integrations')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load integrations.')
  }
  return json.data.integrations as Integration[]
}

export function IntegrationsStatus() {
  const { state, retry } = useAsyncData(fetchIntegrations)

  const columns = useMemo<AdminColumnDef<Integration, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Integration',
        cell: ({ row }) => (
          <span className="font-ui font-medium text-cocoa-dark">{row.original.name}</span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'configured',
        accessorFn: (item) => (item.configured ? 'Yes' : 'No'),
        header: 'Configured',
        cell: ({ row }) => (
          <span className={row.original.configured ? 'text-cocoa-dark' : 'text-dusty-gray'}>
            {row.original.configured ? 'Yes' : 'No'}
          </span>
        ),
      },
      {
        id: 'detail',
        accessorFn: (item) => item.detail ?? item.status,
        header: 'Detail',
        cell: ({ row }) => (
          <span className="text-warm-gray">{row.original.detail ?? row.original.status}</span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-5">
      {/* Header + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Integrations</h1>
        <button
          type="button"
          onClick={retry}
          disabled={state.status === 'loading'}
          className="inline-flex items-center gap-1.5 rounded-buttons border border-outline-gray bg-canvas-white px-4 py-2 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon icon={RefreshCw} decorative size={16} />
          Refresh
        </button>
      </div>

      {/* Table / states */}
      {state.status === 'loading' ? (
        <Skeleton rows={5} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No integrations"
          message="No external integrations are configured for this environment."
        />
      ) : (
        <DataTable
          columns={columns}
          data={state.data}
          tableId="integrations"
          caption="External integration health"
        />
      )}
    </div>
  )
}
