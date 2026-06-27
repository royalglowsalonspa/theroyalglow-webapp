/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Memberships List
 * Scope        : Admin Portal — Membership Management
 *
 * Description  : Interactive SPA memberships list with tier and status
 *                filtering, rebuilt on the admin design-system primitives
 *                (DataTable, FilterBar, StatusBadge, state presenters,
 *                useAsyncData). Displays hours usage, expiry countdown, and a
 *                link to the detail page; preserves the create-membership
 *                action.
 *
 * Responsibilities :
 * - Fetch memberships + tiers once via useAsyncData
 * - Render tier/status filters through the FilterBar primitive (client-side)
 * - Render memberships through the DataTable primitive with StatusBadge
 * - Present loading / empty / error via the State_Presenter components
 *
 * Features / Functionality :
 * - Tier and status dropdown filters (client-side over the loaded set)
 * - Hours used/total display with human-friendly formatting
 * - Expiry countdown labels (days left, expires today, expired)
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation (Data Table Component)
 *
 * Dependencies : DataTable, FilterBar, StatusBadge, state presenters,
 *                useAsyncData, admin memberships lib, next/link
 *
 * Notes        :
 * - Presentation-layer only; consumes GET /api/memberships +
 *   /api/membership-tiers as-is. All pre-redesign fields and the create
 *   action are preserved.
 ************************************************************/

'use client'

import { DataTable } from '@/components/ui/data-table'
import { FilterBar } from '@/components/ui/filter-bar'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import {
  MEMBERSHIP_STATUS_OPTIONS,
  type MembershipListRow,
  type MembershipTier,
  daysUntil,
  formatDateDDMMYYYY,
  minutesToHM,
} from '@/lib/admin/memberships'
import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

// Both list datasets resolved together so the page renders in a single pass.
interface MembershipsData {
  memberships: MembershipListRow[]
  tiers: MembershipTier[]
}

// Fetch the memberships list and the tier catalogue in parallel. The list API
// returns every membership when no tier/status params are sent, so filtering is
// applied client-side over this set (same user-visible result).
async function fetchMemberships(): Promise<MembershipsData> {
  const [listRes, tiersRes] = await Promise.all([
    fetch('/api/memberships'),
    fetch('/api/membership-tiers'),
  ])
  const listJson = await listRes.json()
  if (!listRes.ok || !listJson.success) {
    throw new Error(listJson?.error?.message ?? 'Could not load memberships.')
  }
  // Tier options are non-fatal; the filter falls back to status-only on failure.
  let tiers: MembershipTier[] = []
  try {
    const tiersJson = await tiersRes.json()
    if (tiersRes.ok && tiersJson.success) {
      tiers = tiersJson.data as MembershipTier[]
    }
  } catch {
    /* status-only filtering still works */
  }
  return { memberships: listJson.data as MembershipListRow[], tiers }
}

export function MembershipsList() {
  const { state, retry } = useAsyncData(fetchMemberships)

  // Client-side filter selections, emitted by the FilterBar.
  const [tier, setTier] = useState('all')
  const [status, setStatus] = useState('all')

  const handleFilterChange = useCallback((id: string, value: string) => {
    if (id === 'tier') {
      setTier(value)
    } else if (id === 'status') {
      setStatus(value)
    }
  }, [])

  const memberships = state.status === 'success' ? state.data.memberships : []
  const tiers = state.status === 'success' ? state.data.tiers : []

  const filtered = useMemo(
    () =>
      memberships.filter(
        (m) => (tier === 'all' || m.tierId === tier) && (status === 'all' || m.status === status),
      ),
    [memberships, tier, status],
  )

  const columns = useMemo<ColumnDef<MembershipListRow, unknown>[]>(
    () => [
      {
        accessorKey: 'membershipNumber',
        header: 'Membership #',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-cocoa-dark">{row.original.membershipNumber}</span>
        ),
      },
      { accessorKey: 'customerName', header: 'Customer' },
      { accessorKey: 'tierName', header: 'Tier' },
      {
        id: 'hours',
        header: 'Hours',
        accessorFn: (m) => m.usedHoursMinutes,
        cell: ({ row }) =>
          `${minutesToHM(row.original.usedHoursMinutes)} / ${minutesToHM(row.original.totalHoursMinutes)}`,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'expiresAt',
        header: 'Expires',
        cell: ({ row }) => (
          <span>
            {formatDateDDMMYYYY(row.original.expiresAt)}
            {row.original.status === 'active' ? (
              <span className="block text-[11px] text-dusty-gray">
                {expiryHint(row.original.expiresAt)}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'view',
        header: 'View',
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/memberships/${row.original.id}`}
            className="font-ui text-sm text-deep-gold transition-colors hover:text-cocoa-dark"
            aria-label={`View details for membership ${row.original.membershipNumber}`}
          >
            View →
          </Link>
        ),
      },
    ],
    [],
  )

  const tierOptions = useMemo(
    () => [{ value: 'all', label: 'All' }, ...tiers.map((t) => ({ value: t.id, label: t.name }))],
    [tiers],
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Memberships</h1>
        <Link
          href="/memberships/new"
          className="inline-flex items-center gap-1.5 rounded-buttons bg-cocoa-dark px-4 py-2 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray"
        >
          + Create Membership
        </Link>
      </div>

      {state.status === 'loading' ? (
        <Skeleton variant="table" rows={6} />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : (
        <>
          <FilterBar
            config={{
              dropdowns: [
                { id: 'tier', label: 'Filter by tier', options: tierOptions, value: tier },
                {
                  id: 'status',
                  label: 'Filter by status',
                  options: MEMBERSHIP_STATUS_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  })),
                  value: status,
                },
              ],
            }}
            onFilterChange={handleFilterChange}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title="No memberships found"
              message="Try adjusting the filters, or create a new membership."
            />
          ) : (
            <DataTable
              columns={columns}
              data={filtered}
              tableId="memberships"
              caption="SPA memberships with tier, hours usage, status, and expiry"
            />
          )}
        </>
      )}
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
