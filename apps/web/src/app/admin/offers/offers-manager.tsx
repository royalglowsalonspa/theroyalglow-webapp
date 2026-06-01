'use client'

import { formatDateDDMMYYYY } from '@/lib/admin/bookings'
import type { OfferType } from '@rgss/types'
import { useCallback, useEffect, useMemo, useState } from 'react'

// ─── Types (mirror GET /api/admin/offers + /api/services) ────────────────────
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

// Whole-rupee Indian formatting for clean discount labels (offers are whole ₹).
function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

// Human-readable discount summary for a row.
function discountSummary(offer: AdminOffer): string {
  if (offer.offerType === 'percentage' && offer.discountPercentage != null) {
    return `${offer.discountPercentage}% off`
  }
  if (offer.offerType === 'flat' && offer.discountAmountPaise != null) {
    return `${formatRupees(offer.discountAmountPaise)} off`
  }
  if (offer.offerType === 'combo_price' && offer.comboPricePaise != null) {
    return `Combo ${formatRupees(offer.comboPricePaise)}`
  }
  return '—'
}

export function OffersManager() {
  const [offers, setOffers] = useState<AdminOffer[] | null>(null)
  const [services, setServices] = useState<ServiceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const loadOffers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/offers')
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load offers.')
      }
      setOffers(json.data.offers as AdminOffer[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load offers.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadServices = useCallback(async () => {
    try {
      const res = await fetch('/api/services')
      const json = await res.json()
      if (!res.ok || !json.success) {
        return
      }
      const categories = json.data.categories as ServiceCategoryResponse[]
      const options: ServiceOption[] = categories.flatMap((cat) =>
        cat.services.map((s) => ({
          id: s.id,
          name: s.name,
          serviceType: cat.serviceType,
        })),
      )
      setServices(options)
    } catch {
      // Service options are non-fatal; the form simply shows none available.
    }
  }, [])

  useEffect(() => {
    loadOffers()
    loadServices()
  }, [loadOffers, loadServices])

  const toggleActive = useCallback(async (offer: AdminOffer) => {
    setTogglingId(offer.id)
    try {
      const res = await fetch(`/api/admin/offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !offer.isActive }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not update this offer.')
      }
      const updated = json.data.offer as AdminOffer
      setOffers((prev) =>
        prev
          ? prev.map((o) => (o.id === offer.id ? { ...o, isActive: updated.isActive } : o))
          : prev,
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update this offer.')
    } finally {
      setTogglingId(null)
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Offers</h1>
      </div>

      <CreateOfferForm services={services} onCreated={loadOffers} />

      <section className="space-y-3">
        <h2 className="text-lg font-display text-cocoa-dark tracking-tight">All offers</h2>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={loadOffers} />
        ) : !offers || offers.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cloud-gray/60">
                    <Th>Name</Th>
                    <Th>Type</Th>
                    <Th>Discount</Th>
                    <Th>Valid</Th>
                    <Th>Services</Th>
                    <Th>Status</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud-gray">
                  {offers.map((offer) => (
                    <tr key={offer.id} className="hover:bg-cloud-gray/30 transition-colors">
                      <td className="px-4 py-3 font-sans text-cocoa-dark">{offer.name}</td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {OFFER_TYPE_LABEL[offer.offerType]}
                      </td>
                      <td className="px-4 py-3 font-ui text-cocoa-dark whitespace-nowrap">
                        {discountSummary(offer)}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {formatDateDDMMYYYY(offer.startDate)} – {formatDateDDMMYYYY(offer.endDate)}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray max-w-[220px] truncate">
                        {offer.services.map((s) => s.name).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-ui uppercase tracking-wider ${
                            offer.isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-cloud-gray text-dusty-gray'
                          }`}
                        >
                          {offer.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleActive(offer)}
                          disabled={togglingId === offer.id}
                          aria-busy={togglingId === offer.id}
                          className="px-3 py-1.5 rounded-[6px] border border-outline-gray text-xs font-ui text-cocoa-dark hover:border-deep-gold hover:text-deep-gold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {togglingId === offer.id
                            ? 'Saving…'
                            : offer.isActive
                              ? 'Deactivate'
                              : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Create form ─────────────────────────────────────────────────────────────
function CreateOfferForm({
  services,
  onCreated,
}: {
  services: ServiceOption[]
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
  const [success, setSuccess] = useState(false)

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
  }, [])

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitting(true)
      setFormError(null)
      setFieldErrors({})
      setSuccess(false)

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
        const res = await fetch('/api/admin/offers', {
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
        resetForm()
        setSuccess(true)
        onCreated()
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : 'Could not create this offer.')
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
    <section className="border border-cloud-gray rounded-[6px] bg-canvas-white p-5">
      <h2 className="text-lg font-display text-cocoa-dark tracking-tight mb-4">Create offer</h2>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name */}
          <Field label="Name" htmlFor="offer-name" errors={fieldErrors.name} required>
            <input
              id="offer-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              className={inputClass(fieldErrors.name)}
            />
          </Field>

          {/* Offer type */}
          <Field label="Type" htmlFor="offer-type" errors={fieldErrors.offerType} required>
            <select
              id="offer-type"
              value={offerType}
              onChange={(e) => setOfferType(e.target.value as OfferType)}
              className={inputClass()}
            >
              {OFFER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          {/* Type-specific discount field */}
          {offerType === 'percentage' && (
            <Field
              label="Discount %"
              htmlFor="offer-pct"
              errors={fieldErrors.discountPercentage}
              required
            >
              <input
                id="offer-pct"
                type="number"
                min={1}
                max={100}
                step={1}
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                className={inputClass(fieldErrors.discountPercentage)}
              />
            </Field>
          )}
          {offerType === 'flat' && (
            <Field
              label="Discount (₹)"
              htmlFor="offer-flat"
              errors={fieldErrors.discountAmountPaise}
              required
            >
              <input
                id="offer-flat"
                type="number"
                min={1}
                step="0.01"
                value={flatRupees}
                onChange={(e) => setFlatRupees(e.target.value)}
                className={inputClass(fieldErrors.discountAmountPaise)}
              />
            </Field>
          )}
          {offerType === 'combo_price' && (
            <Field
              label="Combo price (₹)"
              htmlFor="offer-combo"
              errors={fieldErrors.comboPricePaise}
              required
            >
              <input
                id="offer-combo"
                type="number"
                min={1}
                step="0.01"
                value={comboRupees}
                onChange={(e) => setComboRupees(e.target.value)}
                className={inputClass(fieldErrors.comboPricePaise)}
              />
            </Field>
          )}

          {/* Dates */}
          <Field label="Start date" htmlFor="offer-start" errors={fieldErrors.startDate} required>
            <input
              id="offer-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className={inputClass(fieldErrors.startDate)}
            />
          </Field>
          <Field label="End date" htmlFor="offer-end" errors={fieldErrors.endDate} required>
            <input
              id="offer-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className={inputClass(fieldErrors.endDate)}
            />
          </Field>
        </div>

        {/* Description */}
        <Field label="Description" htmlFor="offer-desc" errors={fieldErrors.description}>
          <textarea
            id="offer-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={1000}
            className={`${inputClass(fieldErrors.description)} resize-none`}
          />
        </Field>

        {/* Service multi-select */}
        <fieldset>
          <legend className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray mb-2">
            Applicable services
          </legend>
          {services.length === 0 ? (
            <p className="text-sm text-dusty-gray font-sans">No services available.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          {fieldErrors.serviceIds && (
            <p className="text-xs text-error font-sans mt-1" role="alert">
              {fieldErrors.serviceIds.join(' ')}
            </p>
          )}
        </fieldset>

        {/* Terms */}
        <Field label="Terms (optional)" htmlFor="offer-terms" errors={fieldErrors.terms}>
          <textarea
            id="offer-terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={2}
            maxLength={1000}
            className={`${inputClass(fieldErrors.terms)} resize-none`}
          />
        </Field>

        {formError && (
          <p className="text-sm text-error font-sans" role="alert">
            {formError}
          </p>
        )}
        {success && (
          <output className="block text-sm text-emerald-700 font-sans">Offer created.</output>
        )}

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating…' : 'Create Offer'}
        </button>
      </form>
    </section>
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
    <div className="border border-cloud-gray rounded-[6px] p-3">
      <p className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray mb-2">{title}</p>
      <ul className="space-y-1.5 max-h-48 overflow-y-auto">
        {options.map((opt) => (
          <li key={opt.id}>
            <label className="flex items-center gap-2 text-sm font-sans text-cocoa-dark cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={() => onToggle(opt.id)}
                className="h-4 w-4 rounded border-outline-gray text-deep-gold focus:ring-deep-gold"
              />
              {opt.name}
            </label>
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
        className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
      >
        {label}
        {required && <span className="text-error"> *</span>}
      </label>
      {children}
      {errors && errors.length > 0 && (
        <p className="text-xs text-error font-sans" role="alert">
          {errors.join(' ')}
        </p>
      )}
    </div>
  )
}

function inputClass(errors?: string[]): string {
  return `h-9 px-3 rounded-[6px] border bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold ${
    errors && errors.length > 0 ? 'border-error' : 'border-outline-gray'
  }`
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray">
      {children}
    </th>
  )
}

function LoadingState() {
  return (
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading offers…</span>
    </output>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border border-error/40 bg-error/5 rounded-[6px] px-5 py-10 text-center">
      <p className="font-sans text-sm text-error mb-3" role="alert">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
      >
        Try Again
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 text-center">
      <p className="font-sans text-sm text-cocoa-dark mb-1">No offers yet</p>
      <p className="font-sans text-xs text-dusty-gray">
        Create your first offer using the form above.
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-deep-gold"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
