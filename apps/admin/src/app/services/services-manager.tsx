/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Services Manager
 * Scope        : Admin Portal — Service & Category management
 *
 * Description  : Full CRUD for the operational catalogue, rebuilt on the admin
 *                design-system primitives (DataTable, FilterBar, StatusBadge,
 *                state presenters, useAsyncData, SlideOverPanel). Services and
 *                categories (active + inactive) are listed in DataTables;
 *                create/edit happen in right-side SlideOverPanels; activate /
 *                deactivate runs inline via the row-action menu. Single source
 *                of truth for bookings and the customer /services page.
 *
 * Responsibilities :
 * - List categories + services (active and inactive) from GET /api/services/all
 * - Create/edit services (POST /api/services, PATCH /api/services/[id])
 * - Create/edit categories (POST/PATCH /api/service-categories)
 * - Activate / deactivate services and categories inline
 * - Enforce the slot-length rule in the form (SPA 30/60, Salon 5-min steps)
 *
 * Features / Functionality :
 * - Service search + category filter + Salon/SPA type tabs via FilterBar
 * - Status pills via StatusBadge; money via formatINRWithPaise
 * - Loading / empty / error via the State_Presenter components + useAsyncData
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table, Radix Dialog (SlideOverPanel)
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : DataTable, FilterBar, StatusBadge, SlideOverPanel, state
 *                presenters, useAsyncData, @/lib/admin/format, @rgss/types
 *
 * Notes        : Presentation-layer only; consumes GET /api/services/all,
 *                /api/services, /api/service-categories as-is. Price is entered
 *                in rupees and stored as paise. Services and categories are
 *                deactivated, never hard-deleted. All pre-redesign fields and
 *                actions are preserved.
 ************************************************************/

'use client'

import { DataTable, type RowAction } from '@/components/ui/data-table'
import { FilterBar } from '@/components/ui/filter-bar'
import { SlideOverPanel } from '@/components/ui/slide-over-panel'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatINRWithPaise } from '@/lib/admin/format'
import { SPA_DURATIONS, type ServiceTypeValue } from '@rgss/types'
import type { ColumnDef } from '@tanstack/react-table'
import { Gem, Pencil, Power, Sparkles, Tag } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface AdminService {
  id: string
  categoryId: string
  categoryName: string
  serviceType: ServiceTypeValue
  name: string
  slug: string
  description: string | null
  durationMinutes: number
  bufferMinutes: number
  pricePaise: number
  isActive: boolean
  displayOrder: number
  gemsRedeemable: boolean
  gemsRequired: number | null
}

interface AdminCategory {
  id: string
  name: string
  slug: string
  serviceType: ServiceTypeValue
  description: string | null
  displayOrder: number
  isActive: boolean
}

interface ServicesData {
  services: AdminService[]
  categories: AdminCategory[]
}

// Load the full catalogue (active + inactive) in one request, mirroring the
// pre-redesign GET /api/services/all consumption.
async function fetchServicesData(): Promise<ServicesData> {
  const res = await fetch('/api/services/all')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load services.')
  }
  return {
    services: json.data.services as AdminService[],
    categories: json.data.categories as AdminCategory[],
  }
}

export function ServicesManager() {
  const { state, retry } = useAsyncData(fetchServicesData)

  // Mutation-level error surfaced as a banner (distinct from the load error).
  const [actionError, setActionError] = useState<string | null>(null)

  // Filters emitted by the FilterBar (client-side over the loaded set).
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  // SlideOverPanel state: which form is open and the row being edited.
  const [serviceDialog, setServiceDialog] = useState<{
    open: boolean
    editing: AdminService | null
  }>({ open: false, editing: null })
  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean
    editing: AdminCategory | null
  }>({ open: false, editing: null })

  const services = state.status === 'success' ? state.data.services : []
  const categories = state.status === 'success' ? state.data.categories : []

  const reload = useCallback(() => {
    setActionError(null)
    retry()
  }, [retry])

  const toggleService = useCallback(
    async (svc: AdminService) => {
      setActionError(null)
      try {
        const res = await fetch(`/api/services/${svc.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ isActive: !svc.isActive }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not update this service.')
        }
        retry()
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'Could not update this service.')
      }
    },
    [retry],
  )

  const toggleCategory = useCallback(
    async (cat: AdminCategory) => {
      setActionError(null)
      try {
        const res = await fetch(`/api/service-categories/${cat.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ isActive: !cat.isActive }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not update this category.')
        }
        retry()
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'Could not update this category.')
      }
    },
    [retry],
  )

  const filteredServices = useMemo(() => {
    const term = search.toLowerCase()
    return services.filter(
      (s) =>
        (categoryFilter === 'all' || s.categoryId === categoryFilter) &&
        (typeFilter === 'all' || s.serviceType === typeFilter) &&
        (term === '' || s.name.toLowerCase().includes(term)),
    )
  }, [services, search, categoryFilter, typeFilter])

  const serviceColumns = useMemo<ColumnDef<AdminService, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Service',
        cell: ({ row }) => (
          <span className="font-sans text-cocoa-dark">
            {row.original.name}
            {row.original.gemsRedeemable ? (
              <span className="ml-2 inline-flex items-center gap-1 align-middle font-ui text-[11px] text-deep-gold">
                <Icon icon={Gem} decorative size={12} /> gems
              </span>
            ) : null}
          </span>
        ),
      },
      { accessorKey: 'categoryName', header: 'Category' },
      {
        accessorKey: 'serviceType',
        header: 'Type',
        cell: ({ row }) => (
          <span className="font-sans capitalize text-warm-gray">{row.original.serviceType}</span>
        ),
      },
      {
        id: 'duration',
        header: 'Duration',
        accessorFn: (s) => s.durationMinutes,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-sans text-warm-gray">
            {row.original.durationMinutes} min
            {row.original.bufferMinutes > 0 ? ` (+${row.original.bufferMinutes})` : ''}
          </span>
        ),
      },
      {
        accessorKey: 'pricePaise',
        header: 'Price',
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-ui text-cocoa-dark">
            {formatINRWithPaise(row.original.pricePaise)}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (s) => (s.isActive ? 'active' : 'inactive'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />
        ),
      },
    ],
    [],
  )

  const serviceRowActions = useCallback(
    (svc: AdminService): RowAction[] => [
      {
        label: 'Edit',
        icon: Pencil,
        onSelect: () => setServiceDialog({ open: true, editing: svc }),
      },
      {
        label: svc.isActive ? 'Deactivate' : 'Activate',
        icon: Power,
        onSelect: () => toggleService(svc),
      },
    ],
    [toggleService],
  )

  const categoryColumns = useMemo<ColumnDef<AdminCategory, unknown>[]>(
    () => [
      { accessorKey: 'name', header: 'Category' },
      {
        accessorKey: 'serviceType',
        header: 'Type',
        cell: ({ row }) => (
          <span className="font-sans capitalize text-warm-gray">{row.original.serviceType}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (c) => (c.isActive ? 'active' : 'inactive'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />
        ),
      },
    ],
    [],
  )

  const categoryRowActions = useCallback(
    (cat: AdminCategory): RowAction[] => [
      {
        label: 'Edit',
        icon: Pencil,
        onSelect: () => setCategoryDialog({ open: true, editing: cat }),
      },
      {
        label: cat.isActive ? 'Deactivate' : 'Activate',
        icon: Power,
        onSelect: () => toggleCategory(cat),
      },
    ],
    [toggleCategory],
  )

  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: 'All categories' },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Services</h1>
          <p className="mt-0.5 font-sans text-sm text-dusty-gray">
            The catalogue that powers bookings and the customer website. SPA services are 30 or 60
            minutes; Salon durations are free.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryDialog({ open: true, editing: null })}
            className="inline-flex h-9 items-center gap-1.5 rounded-buttons border border-outline-gray bg-canvas-white px-4 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray"
          >
            + Category
          </button>
          <button
            type="button"
            onClick={() => setServiceDialog({ open: true, editing: null })}
            disabled={categories.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Service
          </button>
        </div>
      </div>

      {actionError ? (
        <p className="rounded-cards border border-error/40 bg-error/5 px-4 py-2.5 font-sans text-sm text-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <Skeleton variant="table" rows={6} />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <div className="space-y-8">
          {/* Categories */}
          <section className="space-y-3" aria-labelledby="categories-heading">
            <h2 id="categories-heading" className="font-display text-lg tracking-tight text-cocoa-dark">
              Categories
            </h2>
            {categories.length === 0 ? (
              <EmptyState
                title="No categories yet"
                message="Create a category (Salon or SPA) before adding services."
                icon={Tag}
              />
            ) : (
              <DataTable
                columns={categoryColumns}
                data={categories}
                tableId="service-categories"
                rowActions={({ original }) => categoryRowActions(original)}
                caption="Service categories with type and status"
              />
            )}
          </section>

          {/* Services */}
          <section className="space-y-3" aria-labelledby="services-heading">
            <h2 id="services-heading" className="font-display text-lg tracking-tight text-cocoa-dark">
              Services
            </h2>
            <FilterBar
              config={{
                search: { placeholder: 'Search services…', ariaLabel: 'Search services by name' },
                tabs: {
                  ariaLabel: 'Filter by service type',
                  options: [
                    { value: 'all', label: 'All' },
                    { value: 'salon', label: 'Salon' },
                    { value: 'spa', label: 'SPA' },
                  ],
                },
                dropdowns: [
                  {
                    id: 'category',
                    label: 'Filter by category',
                    options: categoryOptions,
                    value: categoryFilter,
                  },
                ],
              }}
              search={search}
              onSearchChange={setSearch}
              onTabChange={setTypeFilter}
              onFilterChange={(id, value) => {
                if (id === 'category') {
                  setCategoryFilter(value)
                }
              }}
            />
            {filteredServices.length === 0 ? (
              <EmptyState
                title="No services found"
                message="Adjust the filters above, or click “+ Service” to add one."
                icon={Sparkles}
              />
            ) : (
              <DataTable
                columns={serviceColumns}
                data={filteredServices}
                tableId="services"
                rowActions={({ original }) => serviceRowActions(original)}
                caption="Service catalogue with category, type, duration, price, and status"
              />
            )}
          </section>
        </div>
      )}

      <ServiceForm
        state={serviceDialog}
        categories={categories}
        onClose={() => setServiceDialog({ open: false, editing: null })}
        onSaved={() => {
          setServiceDialog({ open: false, editing: null })
          reload()
        }}
      />
      <CategoryForm
        state={categoryDialog}
        onClose={() => setCategoryDialog({ open: false, editing: null })}
        onSaved={() => {
          setCategoryDialog({ open: false, editing: null })
          reload()
        }}
      />
    </div>
  )
}

/* ── Service create/edit form (SlideOverPanel) ──────────────────────────── */

function ServiceForm({
  state,
  categories,
  onClose,
  onSaved,
}: {
  state: { open: boolean; editing: AdminService | null }
  categories: AdminCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const editing = state.editing
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [bufferMinutes, setBufferMinutes] = useState(0)
  const [priceRupees, setPriceRupees] = useState('')
  const [gemsRedeemable, setGemsRedeemable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Seed the form whenever the panel opens (edit → row values; create → defaults).
  useEffect(() => {
    if (!state.open) {
      return
    }
    if (editing) {
      setCategoryId(editing.categoryId)
      setName(editing.name)
      setDurationMinutes(editing.durationMinutes)
      setBufferMinutes(editing.bufferMinutes)
      setPriceRupees(String(editing.pricePaise / 100))
      setGemsRedeemable(editing.gemsRedeemable)
    } else {
      setCategoryId(categories[0]?.id ?? '')
      setName('')
      setDurationMinutes(30)
      setBufferMinutes(0)
      setPriceRupees('')
      setGemsRedeemable(false)
    }
    setFormError(null)
  }, [state.open, editing, categories])

  const selectedType = categories.find((c) => c.id === categoryId)?.serviceType ?? 'salon'
  const isSpa = selectedType === 'spa'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const pricePaise = Math.round(Number(priceRupees) * 100)
    if (!categoryId) {
      setFormError('Choose a category.')
      return
    }
    if (!name.trim()) {
      setFormError('Enter a service name.')
      return
    }
    if (!Number.isFinite(pricePaise) || pricePaise < 0) {
      setFormError('Enter a valid price.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        categoryId,
        name: name.trim(),
        durationMinutes,
        bufferMinutes,
        pricePaise,
        gemsRedeemable,
      }
      const res = await fetch(editing ? `/api/services/${editing.id}` : '/api/services', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not save the service.')
      }
      onSaved()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not save the service.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SlideOverPanel
      open={state.open}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? 'Edit service' : 'New service'}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Category">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.serviceType})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Classic Haircut"
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={isSpa ? 'Duration (SPA: 30/60)' : 'Duration (min)'}>
            {isSpa ? (
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className={inputClass}
              >
                {SPA_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={5}
                max={600}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Buffer (min)">
            <input
              type="number"
              min={0}
              max={120}
              step={5}
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(Number(e.target.value))}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Price (₹, GST inclusive)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            className={inputClass}
            placeholder="e.g. 499"
            required
          />
        </Field>
        <label className="flex items-center gap-2 font-sans text-sm text-cocoa-dark">
          <input
            type="checkbox"
            checked={gemsRedeemable}
            onChange={(e) => setGemsRedeemable(e.target.checked)}
            className="h-4 w-4 rounded-cards border-outline-gray accent-deep-gold"
          />
          Redeemable with gems
        </label>

        {formError ? (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        ) : null}

        <DialogActions busy={busy} onClose={onClose} submitLabel={editing ? 'Save' : 'Create'} />
      </form>
    </SlideOverPanel>
  )
}

/* ── Category create/edit form (SlideOverPanel) ─────────────────────────── */

function CategoryForm({
  state,
  onClose,
  onSaved,
}: {
  state: { open: boolean; editing: AdminCategory | null }
  onClose: () => void
  onSaved: () => void
}) {
  const editing = state.editing
  const [name, setName] = useState('')
  const [serviceType, setServiceType] = useState<ServiceTypeValue>('salon')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!state.open) {
      return
    }
    if (editing) {
      setName(editing.name)
      setServiceType(editing.serviceType)
    } else {
      setName('')
      setServiceType('salon')
    }
    setFormError(null)
  }, [state.open, editing])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!name.trim()) {
      setFormError('Enter a category name.')
      return
    }
    setBusy(true)
    try {
      const payload = { name: name.trim(), serviceType }
      const res = await fetch(
        editing ? `/api/service-categories/${editing.id}` : '/api/service-categories',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not save the category.')
      }
      onSaved()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not save the category.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SlideOverPanel
      open={state.open}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? 'Edit category' : 'New category'}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Hair, Massage"
            required
          />
        </Field>
        <Field label="Type">
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as ServiceTypeValue)}
            className={inputClass}
            disabled={Boolean(editing)}
          >
            <option value="salon">Salon</option>
            <option value="spa">SPA</option>
          </select>
        </Field>
        {editing ? (
          <p className="font-sans text-xs text-dusty-gray">
            Type can’t change after creation — it governs the slot-length rule of its services.
          </p>
        ) : null}

        {formError ? (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        ) : null}

        <DialogActions busy={busy} onClose={onClose} submitLabel={editing ? 'Save' : 'Create'} />
      </form>
    </SlideOverPanel>
  )
}

/* ── Shared form primitives ─────────────────────────────────────────────── */

const inputClass =
  'w-full px-3 py-2 rounded-buttons border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold'

function DialogActions({
  busy,
  onClose,
  submitLabel,
}: {
  busy: boolean
  onClose: () => void
  submitLabel: string
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-4 font-ui text-sm text-warm-gray transition-colors hover:bg-cloud-gray disabled:opacity-60"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy}
        className="h-9 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Saving…' : submitLabel}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is provided via children (implicit label association)
    <label className="block">
      <span className="mb-1 block font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
        {label}
      </span>
      {children}
    </label>
  )
}
