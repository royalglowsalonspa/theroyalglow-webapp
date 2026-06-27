/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Leads Table
 * Scope        : Admin Portal — Lead Management
 *
 * Description  : Lead pipeline list rebuilt on the admin design-system
 *                primitives. Renders the leads via the reusable DataTable, its
 *                controls (search, status filter, columns) via the FilterBar,
 *                statuses via StatusBadge, and loading / empty / error
 *                conditions via the shared state presenters. Fetch
 *                orchestration + timeout is delegated to useAsyncData. A row
 *                opens the lead detail in a SlideOverPanel so a receptionist can
 *                triage and action a lead without leaving the pipeline. Consumes
 *                GET/POST /api/leads as-is.
 *
 * Responsibilities :
 * - Fetch all leads (GET /api/leads) and present them in the DataTable
 * - Render search + status filter via the FilterBar (client-side)
 * - Open the LeadDetail in a SlideOverPanel for inline pipeline actions
 * - Preserve the manual-lead creation action (dialog) and call / WhatsApp links
 * - Surface loading / empty / error states via the state presenters
 *
 * Features / Functionality :
 * - Status column via StatusBadge; stale indicator preserved on Captured
 * - Per-row kebab actions: Open, Call, WhatsApp (all pre-redesign actions)
 * - Manual Lead dialog (name, phone, optional service) — unchanged effect
 * - List refreshes when the detail panel closes, reflecting status changes
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation (Data Table Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/filter-bar,
 *                @/components/ui/status-badge, @/components/ui/slide-over-panel,
 *                @/components/ui/state/*, @/components/ui/use-async-data,
 *                @/components/ui/icon, @/components/lead/LeadDetail,
 *                @/lib/admin/leads
 *
 * Notes        :
 * - Presentation-layer only: no API/RBAC/data-model/business-logic changes.
 * - Uses ONLY semantic Brand-Token utilities — no hex / raw radius literals.
 * - Every pre-redesign field (Name, Phone, Service, Campaign, Status, Captured)
 *   and action (open detail, call, WhatsApp, manual lead) is preserved; the
 *   lead pipeline actions (status transitions, notes) live in LeadDetail
 *   rendered inside the SlideOverPanel (Req 17.6, 17.7).
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { LeadDetail } from '@/components/lead/LeadDetail'
import { DataTable, type RowAction } from '@/components/ui/data-table'
import { FilterBar } from '@/components/ui/filter-bar'
import { Icon } from '@/components/ui/icon'
import { SlideOverPanel } from '@/components/ui/slide-over-panel'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import {
  type LeadPipelineRow,
  formatDaysSince,
  leadCampaignLabel,
} from '@/lib/admin/leads'
import type { ColumnDef, ColumnFiltersState, VisibilityState } from '@tanstack/react-table'
import { MessageCircle, Phone, Plus, Users } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

type ServiceOption = {
  id: string
  name: string
  serviceType: 'salon' | 'spa'
}

const SERVICE_GROUP_LABELS: Record<ServiceOption['serviceType'], string> = {
  salon: 'Salon Services',
  spa: 'SPA Services',
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'booked', label: 'Booked' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

// Build a wa.me link: strip non-digits, drop a leading 91 if present, then
// prefix 91 so stored +91XXXXXXXXXX numbers resolve to wa.me/91XXXXXXXXXX.
function toWhatsAppLink(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.slice(2)
  }
  return `https://wa.me/91${digits}`
}

async function fetchLeads(): Promise<LeadPipelineRow[]> {
  const res = await fetch('/api/leads')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load leads.')
  }
  return json.data.leads as LeadPipelineRow[]
}

export function LeadsTable() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)

  const { state, retry } = useAsyncData(fetchLeads)

  const columns = useMemo<ColumnDef<LeadPipelineRow, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-ui font-medium text-cocoa-dark">{row.original.name}</span>
        ),
      },
      {
        id: 'phone',
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => {
          const lead = row.original
          const phoneDigits = lead.phone.replace(/\s/g, '')
          return (
            <span className="flex items-center gap-2">
              <span className="text-warm-gray">{lead.phone}</span>
              <a
                href={`tel:${phoneDigits}`}
                onClick={(event) => event.stopPropagation()}
                className="text-warm-gray transition-colors hover:text-deep-gold"
              >
                <Icon icon={Phone} label={`Call ${lead.name}`} size={15} />
              </a>
              <a
                href={toWhatsAppLink(lead.phone)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="text-warm-gray transition-colors hover:text-deep-gold"
              >
                <Icon icon={MessageCircle} label={`WhatsApp ${lead.name}`} size={15} />
              </a>
            </span>
          )
        },
      },
      {
        id: 'service',
        accessorFn: (lead) => lead.serviceName ?? '',
        header: 'Service',
        cell: ({ row }) => (
          <span className="text-warm-gray">{row.original.serviceName ?? '—'}</span>
        ),
      },
      {
        id: 'campaign',
        accessorFn: (lead) => leadCampaignLabel(lead),
        header: 'Campaign',
        cell: ({ row }) => (
          <span className="block max-w-[200px] truncate text-warm-gray">
            {leadCampaignLabel(row.original)}
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        filterFn: 'equalsString',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'captured',
        accessorFn: (lead) => lead.daysSinceCapture,
        header: 'Captured',
        cell: ({ row }) => {
          const lead = row.original
          return (
            <span className="flex items-center gap-1.5 text-warm-gray">
              {lead.isStale ? (
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-pill bg-error"
                  role="img"
                  aria-label="Stale lead — no contact in 48 hours or more"
                />
              ) : null}
              {formatDaysSince(lead.daysSinceCapture)}
            </span>
          )
        },
      },
    ],
    [],
  )

  const rowActions = useCallback(
    (row: { original: LeadPipelineRow }): RowAction[] => {
      const lead = row.original
      const phoneDigits = lead.phone.replace(/\s/g, '')
      return [
        { label: 'Open', icon: Users, onSelect: () => setActiveLeadId(lead.id) },
        {
          label: 'Call',
          icon: Phone,
          onSelect: () => {
            window.location.href = `tel:${phoneDigits}`
          },
        },
        {
          label: 'WhatsApp',
          icon: MessageCircle,
          onSelect: () => window.open(toWhatsAppLink(lead.phone), '_blank', 'noopener'),
        },
      ]
    },
    [],
  )

  const columnFilters: ColumnFiltersState =
    status === 'all' ? [] : [{ id: 'status', value: status }]

  const activeLead =
    state.status === 'success' && activeLeadId
      ? state.data.find((lead) => lead.id === activeLeadId)
      : undefined

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Leads</h1>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-buttons bg-royal-gold px-4 py-2 font-ui text-sm font-semibold text-cocoa-dark transition-colors hover:bg-deep-gold motion-reduce:transition-none"
        >
          <Icon icon={Plus} decorative size={16} />
          Manual Lead
        </button>
      </div>

      {/* Controls: FilterBar (search, status, columns) */}
      <FilterBar
        config={{
          search: { placeholder: 'Search leads…', ariaLabel: 'Search leads' },
          dropdowns: [{ id: 'status', label: 'Status', options: STATUS_OPTIONS, value: status }],
          columnVisibility: true,
        }}
        search={search}
        onSearchChange={setSearch}
        onFilterChange={(id, value) => {
          if (id === 'status') {
            setStatus(value)
          }
        }}
        columns={[
          { id: 'name', label: 'Name', visible: columnVisibility.name !== false },
          { id: 'phone', label: 'Phone', visible: columnVisibility.phone !== false },
          { id: 'service', label: 'Service', visible: columnVisibility.service !== false },
          { id: 'campaign', label: 'Campaign', visible: columnVisibility.campaign !== false },
          { id: 'status', label: 'Status', visible: columnVisibility.status !== false },
          { id: 'captured', label: 'Captured', visible: columnVisibility.captured !== false },
        ]}
        onColumnToggle={(id, visible) =>
          setColumnVisibility((current) => ({ ...current, [id]: visible }))
        }
      />

      {/* Table / states */}
      {state.status === 'loading' ? (
        <Skeleton rows={8} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads yet"
          message="New leads from the /book page and manual entries will appear here."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={state.data}
            tableId="leads"
            caption="Lead pipeline"
            globalFilter={search}
            columnFilters={columnFilters}
            rowActions={rowActions}
            onRowClick={(lead) => setActiveLeadId(lead.id)}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />
          <p className="flex items-center gap-2 font-sans text-xs text-dusty-gray">
            <span className="inline-block h-2 w-2 rounded-pill bg-error" aria-hidden="true" />
            Stale — no contact in 48h+. The Captured column shows days since capture.
          </p>
        </>
      )}

      {/* Lead detail in a slide-over so the pipeline stays in view. */}
      <SlideOverPanel
        open={activeLeadId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveLeadId(null)
            // Reflect any status / note changes made in the panel.
            retry()
          }
        }}
        title={activeLead?.name ?? 'Lead detail'}
      >
        {activeLeadId ? <LeadDetail leadId={activeLeadId} embedded /> : null}
      </SlideOverPanel>

      {dialogOpen ? (
        <ManualLeadDialog
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false)
            retry()
          }}
        />
      ) : null}
    </div>
  )
}

function ManualLeadDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [serviceInterestedId, setServiceInterestedId] = useState('')
  const [services, setServices] = useState<ServiceOption[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState<{ name?: string; phone?: string }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Escape to close.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Body scroll lock + initial focus.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const firstField = dialogRef.current?.querySelector<HTMLElement>('input, select')
    firstField?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Fetch service options (best-effort; the field stays optional if it fails).
  useEffect(() => {
    let cancelled = false
    fetch('/api/services')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json?.success) {
          return
        }
        const categories = json.data.categories as {
          serviceType: 'salon' | 'spa'
          services: { id: string; name: string }[]
        }[]
        const options: ServiceOption[] = categories.flatMap((cat) =>
          cat.services.map((svc) => ({
            id: svc.id,
            name: svc.name,
            serviceType: cat.serviceType,
          })),
        )
        setServices(options)
      })
      .catch(() => {
        setServices([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const groupedServices = useMemo(() => {
    const list = services ?? []
    return (['salon', 'spa'] as const)
      .map((type) => ({
        type,
        options: list.filter((s) => s.serviceType === type),
      }))
      .filter((group) => group.options.length > 0)
  }, [services])

  const validate = useCallback((): boolean => {
    const next: { name?: string; phone?: string } = {}
    if (!name.trim()) {
      next.name = 'Name is required'
    }
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      next.phone = 'Enter a valid 10-digit mobile number'
    }
    setFieldError(next)
    return Object.keys(next).length === 0
  }, [name, phone])

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError(null)
      if (!validate()) {
        return
      }
      setSubmitting(true)
      try {
        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            serviceInterestedId: serviceInterestedId || undefined,
            source: 'manual',
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not create the lead.')
        }
        onCreated()
      } catch (err: unknown) {
        setSubmitError(err instanceof Error ? err.message : 'Could not create the lead.')
      } finally {
        setSubmitting(false)
      }
    },
    [name, phone, serviceInterestedId, onCreated, validate],
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      // biome-ignore lint/a11y/useSemanticElements: custom modal with focus trap, aria-modal and Escape handling; native <dialog> would require showModal()/close() and break the backdrop + animation.
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        className="absolute inset-0 bg-cocoa-dark/60"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-md rounded-cards bg-canvas-white shadow-elevated"
      >
        <div className="flex items-center justify-between border-b border-cloud-gray px-5 py-4">
          <h2 id={titleId} className="font-display text-lg tracking-tight text-cocoa-dark">
            New Manual Lead
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-pill text-warm-gray transition-colors hover:bg-cloud-gray motion-reduce:transition-none"
            aria-label="Close dialog"
          >
            <Icon icon={Plus} decorative size={16} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5" noValidate>
          {/* Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="manual-lead-name"
              className="block font-ui text-sm font-medium text-warm-gray"
            >
              Name
            </label>
            <input
              id="manual-lead-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              aria-required="true"
              aria-invalid={Boolean(fieldError.name)}
              aria-describedby={fieldError.name ? 'manual-lead-name-error' : undefined}
              className="min-h-[44px] w-full rounded-buttons border border-outline-gray px-3 py-2.5 font-sans text-base text-cocoa-dark placeholder:text-dusty-gray focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold disabled:opacity-60 aria-[invalid=true]:border-error"
            />
            {fieldError.name && (
              <p id="manual-lead-name-error" className="font-sans text-xs text-error" role="alert">
                {fieldError.name}
              </p>
            )}
          </div>

          {/* Phone with +91 prefix */}
          <div className="space-y-1.5">
            <label
              htmlFor="manual-lead-phone"
              className="block font-ui text-sm font-medium text-warm-gray"
            >
              Phone
            </label>
            <div className="flex items-stretch">
              <span
                className="inline-flex min-h-[44px] items-center rounded-l-buttons border border-r-0 border-outline-gray bg-cloud-gray px-3 font-sans text-base text-warm-gray"
                aria-hidden="true"
              >
                +91
              </span>
              <input
                id="manual-lead-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                disabled={submitting}
                placeholder="9876543210"
                aria-required="true"
                aria-invalid={Boolean(fieldError.phone)}
                aria-describedby={fieldError.phone ? 'manual-lead-phone-error' : undefined}
                className="min-h-[44px] w-full rounded-r-buttons border border-outline-gray px-3 py-2.5 font-sans text-base text-cocoa-dark placeholder:text-dusty-gray focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold disabled:opacity-60 aria-[invalid=true]:border-error"
              />
            </div>
            {fieldError.phone && (
              <p id="manual-lead-phone-error" className="font-sans text-xs text-error" role="alert">
                {fieldError.phone}
              </p>
            )}
          </div>

          {/* Service interest (optional) */}
          <div className="space-y-1.5">
            <label
              htmlFor="manual-lead-service"
              className="block font-ui text-sm font-medium text-warm-gray"
            >
              Service interest <span className="text-dusty-gray">(optional)</span>
            </label>
            <select
              id="manual-lead-service"
              value={serviceInterestedId}
              onChange={(e) => setServiceInterestedId(e.target.value)}
              disabled={submitting}
              className="min-h-[44px] w-full rounded-buttons border border-outline-gray bg-canvas-white px-3 py-2.5 font-sans text-base text-cocoa-dark focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold disabled:opacity-60"
            >
              <option value="">
                {services === null ? 'Loading services…' : 'Select service…'}
              </option>
              {groupedServices.map((group) => (
                <optgroup key={group.type} label={SERVICE_GROUP_LABELS[group.type]}>
                  {group.options.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {submitError && (
            <p className="font-sans text-sm text-error" role="alert">
              {submitError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-buttons border border-cloud-gray px-4 py-2.5 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray motion-reduce:transition-none disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="rounded-buttons bg-royal-gold px-4 py-2.5 font-ui text-sm font-semibold text-cocoa-dark transition-colors hover:bg-deep-gold motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Creating…' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
