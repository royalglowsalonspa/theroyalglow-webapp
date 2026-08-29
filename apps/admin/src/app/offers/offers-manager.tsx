/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Offers Manager
 * Scope        : Admin Portal — Offer Management
 *
 * Description  : Full CRUD interface for promotional offers, rebuilt on the
 *                admin design-system primitives (DataTable, FilterBar,
 *                StatusBadge, state presenters, useAsyncData, SlideOverPanel).
 *                Offers are listed in a DataTable with type/status filters;
 *                creation happens in a right-side SlideOverPanel; activate /
 *                deactivate runs inline via the row-action menu.
 *
 * Responsibilities :
 * - Create new offers (percentage, flat, combo types) with service selection
 * - Display all offers in a DataTable with search + type/status filters
 * - Toggle offer active/inactive status via PATCH API
 *
 * Features / Functionality :
 * - Create form with dynamic type-specific discount fields (in a SlideOverPanel)
 * - Service multi-select grouped by salon/spa categories
 * - Inline field validation errors from API response
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table, Radix Dialog (SlideOverPanel)
 * Layer        : Presentation (CRUD Management Component)
 *
 * Dependencies : DataTable, FilterBar, StatusBadge, SlideOverPanel, state
 *                presenters, useAsyncData, @/lib/admin/format, @rgss/types
 *
 * Notes        : Presentation-layer only; consumes GET /api/offers,
 *                /api/services, POST/PATCH /api/offers as-is. Rupee inputs are
 *                converted to paise at the submit boundary; money is displayed
 *                via formatINRWithPaise. All pre-redesign fields and actions are
 *                preserved.
 ************************************************************/

'use client'

import type { OfferType } from '@rgss/types'
import { Power, Tag } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { type AdminColumnDef, DataTable, type RowAction } from '@/components/ui/data-table'
import { FilterBar } from '@/components/ui/filter-bar'
import { FormActions } from '@/components/ui/form-field'
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
import { formatDateDDMMYYYY, formatINRWithPaise } from '@/lib/admin/format'
import { toast } from '@/lib/admin/toast'

// ─── Types (mirror GET /api/offers + /api/services) ──────────────────────────
interface OfferServiceRef {
  id: string
  name: string
}

interface AdminOffer {
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
  services: OfferServiceRef[]
}

interface ServiceOption {
  id: string
  name: string
  serviceType: string
}

interface ServiceCategoryResponse {
  serviceType: string
  services: { id: string; name: string }[]
}

interface OffersData {
  offers: AdminOffer[]
  services: ServiceOption[]
}

type FieldErrors = Record<string, string[] | undefined>

const OFFER_TYPE_OPTIONS: { value: OfferType; label: string }[] = [
  { value: 'percentage', label: 'Percentage off' },
  { value: 'flat', label: 'Flat amount off' },
  { value: 'combo_price', label: 'Combo price' },
]

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

// Fetch the offers list and the service options together. Service options are
// non-fatal — the create form simply shows none available on failure.
async function fetchOffersData(): Promise<OffersData> {
  const [offersRes, servicesRes] = await Promise.all([fetch('/api/offers'), fetch('/api/services')])
  const offersJson = await offersRes.json()
  if (!offersRes.ok || !offersJson.success) {
    throw new Error(offersJson?.error?.message ?? 'Could not load offers.')
  }

  let services: ServiceOption[] = []
  try {
    const servicesJson = await servicesRes.json()
    if (servicesRes.ok && servicesJson.success) {
      const categories = servicesJson.data.categories as ServiceCategoryResponse[]
      services = categories.flatMap((cat) =>
        cat.services.map((s) => ({ id: s.id, name: s.name, serviceType: cat.serviceType })),
      )
    }
  } catch {
    /* form shows no services */
  }

  return { offers: offersJson.data.offers as AdminOffer[], services }
}

export function OffersManager() {
  const { state, retry } = useAsyncData(fetchOffersData)

  const [actionError, setActionError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // Filters emitted by the FilterBar (client-side over the loaded set).
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const offers = state.status === 'success' ? state.data.offers : []
  const services = state.status === 'success' ? state.data.services : []

  const reload = useCallback(() => {
    setActionError(null)
    retry()
  }, [retry])

  const toggleActive = useCallback(
    async (offer: AdminOffer) => {
      setActionError(null)
      try {
        const res = await fetch(`/api/offers/${offer.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ isActive: !offer.isActive }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not update this offer.')
        }
        toast.success(offer.isActive ? `${offer.name} deactivated` : `${offer.name} activated`)
        retry()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not update this offer.'
        setActionError(message)
        toast.error('Could not update offer', message)
      }
    },
    [retry],
  )

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
      { accessorKey: 'name', header: 'Name' },
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
            {row.original.services.map((s) => s.name).join(', ') || '—'}
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

  const rowActions = useCallback(
    (offer: AdminOffer): RowAction[] => [
      {
        label: offer.isActive ? 'Deactivate' : 'Activate',
        icon: Power,
        onSelect: () => toggleActive(offer),
      },
    ],
    [toggleActive],
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Offers</h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray"
        >
          + Create Offer
        </button>
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
                    ...OFFER_TYPE_OPTIONS.map((o) => ({
                      value: o.value,
                      label: OFFER_TYPE_LABEL[o.value],
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
              message="Adjust the filters above, or create a new offer."
              icon={Tag}
            />
          ) : (
            <DataTable
              columns={columns}
              data={filtered}
              tableId="offers"
              rowActions={({ original }) => rowActions(original)}
              caption="Promotional offers with type, discount, validity, services, and status"
            />
          )}
        </>
      )}

      <CreateOfferPanel
        open={createOpen}
        services={services}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false)
          reload()
        }}
      />
    </div>
  )
}

// ─── Create form (SlideOverPanel) ────────────────────────────────────────────
function CreateOfferPanel({
  open,
  services,
  onClose,
  onCreated,
}: {
  open: boolean
  services: ServiceOption[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [offerType, setOfferType] = useState<OfferType>('percentage')
  const [percentage, setPercentage] = useState('')
  const [flatRupees, setFlatRupees] = useState('')
  const [comboRupees, setComboRupees] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [terms, setTerms] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const groupedServices = useMemo(() => {
    const salon = services.filter((s) => s.serviceType === 'salon')
    const spa = services.filter((s) => s.serviceType === 'spa')
    return { salon, spa }
  }, [services])

  const toggleService = useCallback((id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }, [])

  const resetForm = useCallback(() => {
    setName('')
    setDescription('')
    setOfferType('percentage')
    setPercentage('')
    setFlatRupees('')
    setComboRupees('')
    setStartDate('')
    setEndDate('')
    setServiceIds([])
    setTerms('')
    setFieldErrors({})
    setFormError(null)
  }, [])

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitting(true)
      setFormError(null)
      setFieldErrors({})

      // Build a body matching createOfferSchema. Rupee inputs convert to paise
      // once here at the client boundary; percentage stays an integer 1–100.
      const body: Record<string, unknown> = {
        name: name.trim(),
        offerType,
        startDate,
        endDate,
        serviceIds,
      }
      if (description.trim()) {
        body.description = description.trim()
      }
      if (terms.trim()) {
        body.terms = terms.trim()
      }
      if (offerType === 'percentage') {
        body.discountPercentage = percentage === '' ? undefined : Number(percentage)
      } else if (offerType === 'flat') {
        body.discountAmountPaise =
          flatRupees === '' ? undefined : Math.round(Number(flatRupees) * 100)
      } else {
        body.comboPricePaise =
          comboRupees === '' ? undefined : Math.round(Number(comboRupees) * 100)
      }

      try {
        const res = await fetch('/api/offers', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          if (json?.error?.details) {
            setFieldErrors(json.error.details as FieldErrors)
          }
          throw new Error(json?.error?.message ?? 'Could not create this offer.')
        }
        toast.success(`${name.trim()} created`)
        resetForm()
        onCreated()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not create this offer.'
        setFormError(message)
        toast.error('Could not create offer', message)
      } finally {
        setSubmitting(false)
      }
    },
    [
      name,
      description,
      offerType,
      percentage,
      flatRupees,
      comboRupees,
      startDate,
      endDate,
      serviceIds,
      terms,
      onCreated,
      resetForm,
    ],
  )

  return (
    <SlideOverPanel
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Create offer"
      description="Configure a promotional offer and the services it applies to."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {/* Name */}
        <Field label="Name" htmlFor="offer-name" errors={fieldErrors.name} required>
          <Input
            id="offer-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            aria-invalid={Boolean(fieldErrors.name?.length)}
          />
        </Field>

        {/* Offer type */}
        <Field label="Type" htmlFor="offer-type" errors={fieldErrors.offerType} required>
          <Select value={offerType} onValueChange={(v) => setOfferType(v as OfferType)}>
            <SelectTrigger id="offer-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {OFFER_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        {/* Type-specific discount field */}
        {offerType === 'percentage' ? (
          <Field
            label="Discount %"
            htmlFor="offer-pct"
            errors={fieldErrors.discountPercentage}
            required
          >
            <Input
              id="offer-pct"
              type="number"
              min={1}
              max={100}
              step={1}
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              aria-invalid={Boolean(fieldErrors.discountPercentage?.length)}
            />
          </Field>
        ) : null}
        {offerType === 'flat' ? (
          <Field
            label="Discount (₹)"
            htmlFor="offer-flat"
            errors={fieldErrors.discountAmountPaise}
            required
          >
            <Input
              id="offer-flat"
              type="number"
              min={1}
              step="0.01"
              value={flatRupees}
              onChange={(e) => setFlatRupees(e.target.value)}
              aria-invalid={Boolean(fieldErrors.discountAmountPaise?.length)}
            />
          </Field>
        ) : null}
        {offerType === 'combo_price' ? (
          <Field
            label="Combo price (₹)"
            htmlFor="offer-combo"
            errors={fieldErrors.comboPricePaise}
            required
          >
            <Input
              id="offer-combo"
              type="number"
              min={1}
              step="0.01"
              value={comboRupees}
              onChange={(e) => setComboRupees(e.target.value)}
              aria-invalid={Boolean(fieldErrors.comboPricePaise?.length)}
            />
          </Field>
        ) : null}

        {/* Dates */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="offer-start" errors={fieldErrors.startDate} required>
            <Input
              id="offer-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              aria-invalid={Boolean(fieldErrors.startDate?.length)}
            />
          </Field>
          <Field label="End date" htmlFor="offer-end" errors={fieldErrors.endDate} required>
            <Input
              id="offer-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              aria-invalid={Boolean(fieldErrors.endDate?.length)}
            />
          </Field>
        </div>

        {/* Description */}
        <Field label="Description" htmlFor="offer-desc" errors={fieldErrors.description}>
          <Textarea
            id="offer-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={1000}
            aria-invalid={Boolean(fieldErrors.description?.length)}
          />
        </Field>

        {/* Service multi-select */}
        <fieldset>
          <legend className="mb-2 font-ui text-[10px] uppercase tracking-wider text-dusty-gray">
            Applicable services
          </legend>
          {services.length === 0 ? (
            <p className="font-sans text-sm text-dusty-gray">No services available.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ServiceGroup
                title="Salon"
                options={groupedServices.salon}
                selected={serviceIds}
                onToggle={toggleService}
              />
              <ServiceGroup
                title="SPA"
                options={groupedServices.spa}
                selected={serviceIds}
                onToggle={toggleService}
              />
            </div>
          )}
          {fieldErrors.serviceIds ? (
            <p className="mt-1 font-sans text-xs text-error" role="alert">
              {fieldErrors.serviceIds.join(' ')}
            </p>
          ) : null}
        </fieldset>

        {/* Terms */}
        <Field label="Terms (optional)" htmlFor="offer-terms" errors={fieldErrors.terms}>
          <Textarea
            id="offer-terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={2}
            maxLength={1000}
            aria-invalid={Boolean(fieldErrors.terms?.length)}
          />
        </Field>

        {formError ? (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        ) : null}

        <FormActions
          busy={submitting}
          onCancel={onClose}
          submitLabel="Create Offer"
          busyLabel="Creating…"
        />
      </form>
    </SlideOverPanel>
  )
}

function ServiceGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: ServiceOption[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  if (options.length === 0) {
    return null
  }
  return (
    <div className="rounded-cards border border-cloud-gray p-3">
      <p className="mb-2 font-ui text-[10px] uppercase tracking-wider text-dusty-gray">{title}</p>
      <ul className="max-h-48 space-y-1.5 overflow-y-auto">
        {options.map((opt) => (
          <li key={opt.id}>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`offer-svc-${opt.id}`}
                checked={selected.includes(opt.id)}
                onCheckedChange={() => onToggle(opt.id)}
              />
              <label
                htmlFor={`offer-svc-${opt.id}`}
                className="cursor-pointer font-sans text-sm text-cocoa-dark"
              >
                {opt.name}
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  errors,
  required,
  children,
}: {
  label: string
  htmlFor: string
  errors?: string[] | undefined
  required?: boolean | undefined
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray"
      >
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </label>
      {children}
      {errors && errors.length > 0 ? (
        <p className="font-sans text-xs text-error" role="alert">
          {errors.join(' ')}
        </p>
      ) : null}
    </div>
  )
}
