/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Offers Manager
 * Scope        : Admin Portal — Offers (read-only)
 *
 * Description  : The offers checkout can apply, read-only. Offers are edited
 *                in Payload CMS (multi-branch R4.6, offers.md): one offer
 *                holds the website card and its checkout rule, and the CMS
 *                syncs the rule into the app. This page lists them and links
 *                to the CMS.
 *
 * Responsibilities :
 * - List every offer in a DataTable with search + type/status filters
 * - Show each rule: type, discount, dates, linked services, whether the
 *   website shows it, active or retired
 * - Label the test offers made here before the move to the CMS
 * - Link to the CMS, where offers are created, edited and retired
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation
 *
 * Dependencies : DataTable, FilterBar, StatusBadge, state presenters,
 *                useAsyncData, @/lib/admin/format, @/lib/cms-links,
 *                @rgss/types
 *
 * Notes        : Consumes GET /api/offers. POST/PATCH answer 410 since the
 *                move to the CMS. Money is displayed via formatINRWithPaise.
 ************************************************************/

'use client'

import type { OfferType } from '@rgss/types'
import { ExternalLink, Tag } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { type AdminColumnDef, DataTable } from '@/components/ui/data-table'
import { FilterBar } from '@/components/ui/filter-bar'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateDDMMYYYY, formatINRWithPaise } from '@/lib/admin/format'
import { CMS_OFFERS_URL } from '@/lib/cms-links'

// ─── Types (mirror GET /api/offers) ──────────────────────────────────────────
interface OfferServiceRef {
  id: string
  name: string
}

export interface AdminOffer {
  id: string
  name: string
  description: string | null
  offerType: OfferType
  discountPercentage: number | null
  discountAmountPaise: number | null
  comboPricePaise: number | null
  startDate: string
  endDate: string
  isActive: boolean
  terms: string | null
  /** The Payload offer this mirrors; null for a test offer made in the portal. */
  cmsId: number | null
  showOnWebsite: boolean
  services: OfferServiceRef[]
}

const OFFER_TYPE_LABEL: Record<OfferType, string> = {
  percentage: 'Percentage',
  flat: 'Flat',
  combo_price: 'Combo',
}

// Human-readable discount summary for a row. Money via formatINRWithPaise.
function discountSummary(offer: AdminOffer): string {
  if (offer.offerType === 'percentage' && offer.discountPercentage != null) {
    return `${offer.discountPercentage}% off`
  }
  if (offer.offerType === 'flat' && offer.discountAmountPaise != null) {
    return `${formatINRWithPaise(offer.discountAmountPaise)} off`
  }
  if (offer.offerType === 'combo_price' && offer.comboPricePaise != null) {
    return `Combo ${formatINRWithPaise(offer.comboPricePaise)}`
  }
  return '—'
}

async function fetchOffers(): Promise<AdminOffer[]> {
  const res = await fetch('/api/offers')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load offers.')
  }
  return json.data.offers as AdminOffer[]
}

export function OffersManager() {
  const { state, retry } = useAsyncData(fetchOffers)

  // Filters emitted by the FilterBar (client-side over the loaded set).
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const offers = state.status === 'success' ? state.data : []

  const reload = useCallback(() => {
    retry()
  }, [retry])

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    return offers.filter(
      (o) =>
        (typeFilter === 'all' || o.offerType === typeFilter) &&
        (statusFilter === 'all' || (statusFilter === 'active' ? o.isActive : !o.isActive)) &&
        (term === '' || o.name.toLowerCase().includes(term)),
    )
  }, [offers, search, typeFilter, statusFilter])

  const columns = useMemo<AdminColumnDef<AdminOffer, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-sans text-cocoa-dark">{row.original.name}</span>
            {row.original.cmsId === null ? (
              <span className="font-ui text-[11px] text-dusty-gray">
                Test offer made here before the move to the CMS
              </span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: 'offerType',
        header: 'Type',
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-sans text-warm-gray">
            {OFFER_TYPE_LABEL[row.original.offerType]}
          </span>
        ),
      },
      {
        id: 'discount',
        header: 'Discount',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-ui text-cocoa-dark">
            {discountSummary(row.original)}
          </span>
        ),
      },
      {
        id: 'valid',
        header: 'Valid',
        accessorFn: (o) => o.startDate,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-sans text-warm-gray">
            {formatDateDDMMYYYY(row.original.startDate)} –{' '}
            {formatDateDDMMYYYY(row.original.endDate)}
          </span>
        ),
      },
      {
        id: 'services',
        header: 'Services',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block max-w-xs truncate font-sans text-warm-gray">
            {row.original.services.map((s) => s.name).join(', ') || 'Every service'}
          </span>
        ),
      },
      {
        id: 'website',
        header: 'Website',
        accessorFn: (o) => (o.showOnWebsite ? 'shown' : 'counter'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-sans text-warm-gray">
            {row.original.showOnWebsite ? 'Shown' : 'Counter only'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (o) => (o.isActive ? 'active' : 'inactive'),
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
      },
    ],
    [],
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Offers</h1>
        <a
          href={CMS_OFFERS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray"
        >
          Edit offers in the CMS
          <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
      <p className="max-w-2xl font-sans text-sm text-warm-gray">
        Offers are created, edited and retired in Payload CMS. Each one is a website card, a
        checkout rule, or both; a rule reaches checkout as soon as it is saved there.
      </p>

      {state.status === 'loading' ? (
        <Skeleton variant="table" rows={6} />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <>
          <FilterBar
            config={{
              search: { placeholder: 'Search offers…', ariaLabel: 'Search offers by name' },
              dropdowns: [
                {
                  id: 'type',
                  label: 'Filter by type',
                  options: [
                    { value: 'all', label: 'All types' },
                    ...(Object.keys(OFFER_TYPE_LABEL) as OfferType[]).map((value) => ({
                      value,
                      label: OFFER_TYPE_LABEL[value],
                    })),
                  ],
                  value: typeFilter,
                },
                {
                  id: 'status',
                  label: 'Filter by status',
                  options: [
                    { value: 'all', label: 'All statuses' },
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ],
                  value: statusFilter,
                },
              ],
            }}
            search={search}
            onSearchChange={setSearch}
            onFilterChange={(id, value) => {
              if (id === 'type') {
                setTypeFilter(value)
              } else if (id === 'status') {
                setStatusFilter(value)
              }
            }}
          />

          {filtered.length === 0 ? (
            <EmptyState
              title="No offers found"
              message="Adjust the filters above, or add an offer in the CMS."
              icon={Tag}
            />
          ) : (
            <DataTable
              columns={columns}
              data={filtered}
              tableId="offers"
              caption="Offers with type, discount, validity, services, website and status"
            />
          )}
        </>
      )}
    </div>
  )
}
