/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Services Manager
 * Scope        : Admin Portal — Service & Category management
 *
 * Description  : Full CRUD for the operational catalogue: services grouped by
 *                category (incl. inactive), plus category management. Create/edit
 *                via Radix dialogs; activate/deactivate inline. Single source of
 *                truth for bookings and the customer /services page.
 *
 * Responsibilities :
 * - List categories + services (active and inactive) from GET /api/services/all
 * - Create/edit services (POST /api/services, PATCH /api/services/[id])
 * - Create/edit categories (POST/PATCH /api/service-categories)
 * - Enforce the slot-length rule in the form (SPA 30/60, Salon 5-min steps)
 *
 * Tech Stack   : Next.js 16, React (Client Component), Radix Dialog, Tailwind
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : @radix-ui/react-dialog, admin bookings lib (formatINR),
 *                @rgss/types (SERVICE_TYPES, SPA_DURATIONS), React hooks
 *
 * Notes        : Price is entered in rupees and stored as paise. Services and
 *                categories are deactivated, never hard-deleted.
 ************************************************************/

'use client'

import { formatINR } from '@/lib/admin/bookings'
import * as Dialog from '@radix-ui/react-dialog'
import { SPA_DURATIONS, type ServiceTypeValue } from '@rgss/types'
import { useCallback, useEffect, useState } from 'react'

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

const TYPE_BADGE: Record<string, string> = {
  salon: 'bg-indigo-100 text-indigo-800',
  spa: 'bg-teal-100 text-teal-800',
}

export function ServicesManager() {
  const [services, setServices] = useState<AdminService[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state: which form is open and the row being edited (null = create).
  const [serviceDialog, setServiceDialog] = useState<{
    open: boolean
    editing: AdminService | null
  }>({ open: false, editing: null })
  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean
    editing: AdminCategory | null
  }>({ open: false, editing: null })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/services/all')
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load services.')
      }
      setServices(json.data.services as AdminService[])
      setCategories(json.data.categories as AdminCategory[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load services.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleService = async (svc: AdminService) => {
    await fetch(`/api/services/${svc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: !svc.isActive }),
    })
    load()
  }

  const toggleCategory = async (cat: AdminCategory) => {
    await fetch(`/api/service-categories/${cat.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: !cat.isActive }),
    })
    load()
  }

  // Group services under their category for display (categories first).
  const grouped = categories.map((cat) => ({
    category: cat,
    items: services.filter((s) => s.categoryId === cat.id),
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Services</h1>
          <p className="font-sans text-sm text-dusty-gray mt-0.5">
            The catalogue that powers bookings and the customer website. SPA services are 30 or 60
            minutes; Salon durations are free.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryDialog({ open: true, editing: null })}
            className="h-9 px-4 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-cocoa-dark hover:bg-cloud-gray transition-colors"
          >
            + Category
          </button>
          <button
            type="button"
            onClick={() => setServiceDialog({ open: true, editing: null })}
            disabled={categories.length === 0}
            className="h-9 px-4 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Service
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="space-y-8">
          {/* Categories panel */}
          <section className="space-y-3">
            <h2 className="font-display text-lg text-cocoa-dark tracking-tight">Categories</h2>
            {categories.length === 0 ? (
              <EmptyHint>Create a category (Salon or SPA) before adding services.</EmptyHint>
            ) : (
              <ul className="divide-y divide-cloud-gray rounded-[6px] border border-cloud-gray bg-canvas-white">
                {categories.map((cat) => (
                  <li key={cat.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-sans text-[15px] text-cocoa-dark truncate">
                        {cat.name}{' '}
                        <span
                          className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-ui uppercase tracking-[0.5px] ${TYPE_BADGE[cat.serviceType]}`}
                        >
                          {cat.serviceType}
                        </span>
                        {!cat.isActive && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-cloud-gray px-2 py-0.5 text-[10px] font-ui uppercase tracking-[0.5px] text-warm-gray">
                            inactive
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className="text-sm font-ui text-warm-gray hover:text-cocoa-dark transition-colors"
                      >
                        {cat.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoryDialog({ open: true, editing: cat })}
                        className="text-sm font-ui text-deep-gold hover:text-cocoa-dark transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Services grouped by category */}
          <section className="space-y-4">
            <h2 className="font-display text-lg text-cocoa-dark tracking-tight">Services</h2>
            {grouped.every((g) => g.items.length === 0) ? (
              <EmptyHint>No services yet. Click “+ Service” to add one.</EmptyHint>
            ) : (
              grouped.map(
                ({ category, items }) =>
                  items.length > 0 && (
                    <div key={category.id} className="space-y-2">
                      <h3 className="font-ui text-[11px] uppercase tracking-[1px] text-dusty-gray">
                        {category.name}
                      </h3>
                      <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-cloud-gray/60">
                                <Th>Service</Th>
                                <Th className="text-right">Duration</Th>
                                <Th className="text-right">Price</Th>
                                <Th>Status</Th>
                                <Th className="text-right">Actions</Th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-cloud-gray">
                              {items.map((svc) => (
                                <tr
                                  key={svc.id}
                                  className="hover:bg-cloud-gray/30 transition-colors"
                                >
                                  <td className="px-4 py-3 font-sans text-cocoa-dark">
                                    {svc.name}
                                    {svc.gemsRedeemable && (
                                      <span className="ml-2 text-[11px] text-deep-gold">
                                        ◆ gems
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-sans text-warm-gray text-right whitespace-nowrap">
                                    {svc.durationMinutes} min
                                    {svc.bufferMinutes > 0 ? ` (+${svc.bufferMinutes})` : ''}
                                  </td>
                                  <td className="px-4 py-3 font-ui text-cocoa-dark text-right whitespace-nowrap">
                                    {formatINR(svc.pricePaise)}
                                  </td>
                                  <td className="px-4 py-3">
                                    {svc.isActive ? (
                                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-ui text-emerald-700">
                                        Active
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-full bg-cloud-gray px-2 py-0.5 text-[11px] font-ui text-warm-gray">
                                        Inactive
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => toggleService(svc)}
                                      className="text-sm font-ui text-warm-gray hover:text-cocoa-dark transition-colors mr-3"
                                    >
                                      {svc.isActive ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setServiceDialog({ open: true, editing: svc })}
                                      className="text-sm font-ui text-deep-gold hover:text-cocoa-dark transition-colors"
                                    >
                                      Edit
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ),
              )
            )}
          </section>
        </div>
      )}

      <ServiceDialog
        state={serviceDialog}
        categories={categories}
        onClose={() => setServiceDialog({ open: false, editing: null })}
        onSaved={() => {
          setServiceDialog({ open: false, editing: null })
          load()
        }}
      />
      <CategoryDialog
        state={categoryDialog}
        onClose={() => setCategoryDialog({ open: false, editing: null })}
        onSaved={() => {
          setCategoryDialog({ open: false, editing: null })
          load()
        }}
      />
    </div>
  )
}

/* ── Service create/edit dialog ─────────────────────────────────────────── */

function ServiceDialog({
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

  // Seed the form whenever the dialog opens (edit → row values; create → defaults).
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
    <FormDialog
      open={state.open}
      onClose={onClose}
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
            className="h-4 w-4 rounded border-outline-gray text-deep-gold focus:ring-deep-gold"
          />
          Redeemable with gems
        </label>

        {formError && (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        )}

        <DialogActions busy={busy} onClose={onClose} submitLabel={editing ? 'Save' : 'Create'} />
      </form>
    </FormDialog>
  )
}

/* ── Category create/edit dialog ────────────────────────────────────────── */

function CategoryDialog({
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
    <FormDialog
      open={state.open}
      onClose={onClose}
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
        {editing && (
          <p className="font-sans text-xs text-dusty-gray">
            Type can’t change after creation — it governs the slot-length rule of its services.
          </p>
        )}

        {formError && (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        )}

        <DialogActions busy={busy} onClose={onClose} submitLabel={editing ? 'Save' : 'Create'} />
      </form>
    </FormDialog>
  )
}

/* ── Shared primitives ──────────────────────────────────────────────────── */

const inputClass =
  'w-full px-3 py-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold'

function FormDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-cocoa-dark/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-cloud-gray bg-canvas-white p-5 shadow-elevated focus:outline-none">
          <Dialog.Title className="font-display text-lg text-cocoa-dark tracking-tight mb-3">
            {title}
          </Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

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
        className="h-9 px-4 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-warm-gray hover:bg-cloud-gray transition-colors disabled:opacity-60"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy}
        className="h-9 px-4 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
      <span className="block font-ui text-[11px] uppercase tracking-wider text-dusty-gray mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-10 text-center">
      <p className="font-sans text-sm text-dusty-gray">{children}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading services…</span>
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

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray ${className || 'text-left'}`}
    >
      {children}
    </th>
  )
}
