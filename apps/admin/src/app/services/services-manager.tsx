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

import { Checkbox } from '@/components/ui/checkbox'
import { DataTable, type RowAction } from '@/components/ui/data-table'
import { FilterBar } from '@/components/ui/filter-bar'
import { Field, FormActions } from '@/components/ui/form-field'
import { Icon } from '@/components/ui/icon'
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
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatINRWithPaise } from '@/lib/admin/format'
import { toast } from '@/lib/admin/toast'
import { SPA_DURATIONS, type ServiceTypeValue } from '@rgss/types'
import type { ColumnDef } from '@tanstack/react-table'
import { Gem, Pencil, Power, Sparkles, Tag } from 'lucide-react'
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
        toast.success(svc.isActive ? `${svc.name} deactivated` : `${svc.name} activated`)
        retry()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not update this service.'
        setActionError(message)
        toast.error('Could not update service', message)
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
        toast.success(cat.isActive ? `${cat.name} deactivated` : `${cat.name} activated`)
        retry()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not update this category.'
        setActionError(message)
        toast.error('Could not update category', message)
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
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
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
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
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
        <p
          className="rounded-cards border border-error/40 bg-error/5 px-4 py-2.5 font-sans text-sm text-error"
          role="alert"
        >
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
            <h2
              id="categories-heading"
              className="font-display text-lg tracking-tight text-cocoa-dark"
            >
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
            <h2
              id="services-heading"
              className="font-display text-lg tracking-tight text-cocoa-dark"
            >
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
      toast.success(editing ? `${name.trim()} updated` : `${name.trim()} created`)
      onSaved()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not save the service.'
      setFormError(message)
      toast.error('Could not save service', message)
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
        <Field label="Category" htmlFor="service-category">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="service-category" className="w-full">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.serviceType})
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Name" htmlFor="service-name">
          <Input
            id="service-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Classic Haircut"
            required
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label={isSpa ? 'Duration (SPA: 30/60)' : 'Duration (min)'}
            htmlFor="service-duration"
          >
            {isSpa ? (
              <Select
                value={String(durationMinutes)}
                onValueChange={(v) => setDurationMinutes(Number(v))}
              >
                <SelectTrigger id="service-duration" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {SPA_DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} min
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="service-duration"
                type="number"
                min={5}
                max={600}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            )}
          </Field>
          <Field label="Buffer (min)" htmlFor="service-buffer">
            <Input
              id="service-buffer"
              type="number"
              min={0}
              max={120}
              step={5}
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Price (₹, GST inclusive)" htmlFor="service-price">
          <Input
            id="service-price"
            type="number"
            min={0}
            step="0.01"
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            placeholder="e.g. 499"
            required
          />
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox
            id="service-gems"
            checked={gemsRedeemable}
            onCheckedChange={(checked) => setGemsRedeemable(checked === true)}
          />
          <label htmlFor="service-gems" className="font-sans text-sm text-cocoa-dark">
            Redeemable with gems
          </label>
        </div>

        {formError ? (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        ) : null}

        <FormActions busy={busy} onCancel={onClose} submitLabel={editing ? 'Save' : 'Create'} />
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
      toast.success(editing ? `${name.trim()} updated` : `${name.trim()} created`)
      onSaved()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not save the category.'
      setFormError(message)
      toast.error('Could not save category', message)
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
        <Field label="Name" htmlFor="category-name">
          <Input
            id="category-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hair, Massage"
            required
          />
        </Field>
        <Field label="Type" htmlFor="category-type">
          <Select
            value={serviceType}
            onValueChange={(v) => setServiceType(v as ServiceTypeValue)}
            disabled={Boolean(editing)}
          >
            <SelectTrigger id="category-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                <SelectItem value="salon">Salon</SelectItem>
                <SelectItem value="spa">SPA</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
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

        <FormActions busy={busy} onCancel={onClose} submitLabel={editing ? 'Save' : 'Create'} />
      </form>
    </SlideOverPanel>
  )
}

/* ── Shared form primitives ─────────────────────────────────────────────── */
