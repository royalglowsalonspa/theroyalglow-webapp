/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Staff Manager
 * Scope        : Admin Portal — Staff management
 *
 * Description  : Interactive staff roster with an edit dialog that updates a
 *                staff member's profile fields AND replaces their service
 *                capabilities (the staff_service mapping that drives booking
 *                availability). Manager+.
 *
 * Responsibilities :
 * - List staff (name, email, designation, # services, active status) from
 *   GET /api/staff/all
 * - Edit profile fields (PATCH /api/staff/[id]) + services
 *   (PUT /api/staff/[id]/services) in one save
 * - Multi-select services grouped by category, loaded from GET /api/services/all
 *
 * Tech Stack   : Next.js 16, React (Client Component), Radix Dialog, Tailwind
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : @radix-ui/react-dialog, @rgss/types (STAFF_DESIGNATIONS),
 *                React hooks
 *
 * Notes        : Staff are deactivated (isActive=false), never hard-deleted.
 *                Loading / error / empty states mirror the billing table.
 ************************************************************/

'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { STAFF_DESIGNATIONS, type StaffDesignation } from '@rgss/types'
import { useCallback, useEffect, useState } from 'react'

interface StaffRow {
  id: string
  userId: string
  name: string
  email: string
  role: string | null
  phone: string | null
  designation: StaffDesignation
  bio: string | null
  specialization: string | null
  isActive: boolean
  hireDate: string | null
  createdAt: string
  serviceCount: number
}

interface CatalogueService {
  id: string
  categoryId: string
  categoryName: string
  serviceType: 'salon' | 'spa'
  name: string
  isActive: boolean
}

const DESIGNATION_BADGE: Record<string, string> = {
  manager: 'bg-indigo-100 text-indigo-800',
  therapist: 'bg-teal-100 text-teal-800',
  stylist: 'bg-amber-100 text-amber-800',
  receptionist: 'bg-cloud-gray text-warm-gray',
}

const DESIGNATION_LABEL: Record<StaffDesignation, string> = {
  receptionist: 'Receptionist',
  stylist: 'Stylist',
  therapist: 'Therapist',
  manager: 'Manager',
}

export function StaffManager() {
  const [staff, setStaff] = useState<StaffRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<StaffRow | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/staff/all')
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load staff.')
      }
      setStaff(json.data.staff as StaffRow[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load staff.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Staff</h1>
          <p className="font-sans text-sm text-dusty-gray mt-0.5">
            Manage staff designations and the services each member can perform. Service capabilities
            drive booking availability.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="h-9 px-4 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
        >
          + Add staff
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !staff || staff.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cloud-gray/60">
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Designation</Th>
                  <Th className="text-right">Services</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud-gray">
                {staff.map((row) => (
                  <tr key={row.id} className="hover:bg-cloud-gray/30 transition-colors">
                    <td className="px-4 py-3 font-sans text-cocoa-dark whitespace-nowrap">
                      {row.name}
                    </td>
                    <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                      {row.email}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-ui uppercase tracking-[0.5px] ${
                          DESIGNATION_BADGE[row.designation] ?? 'bg-cloud-gray text-warm-gray'
                        }`}
                      >
                        {DESIGNATION_LABEL[row.designation] ?? row.designation}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-ui text-cocoa-dark text-right whitespace-nowrap">
                      {row.serviceCount}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.isActive ? (
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
                        onClick={() => setEditing(row)}
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
      )}

      <StaffDialog
        staff={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
        }}
      />
      <CreateStaffDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false)
          load()
        }}
      />
    </div>
  )
}

/* ── Create-staff dialog (link an existing account by email) ────────────── */

function CreateStaffDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [email, setEmail] = useState('')
  const [designation, setDesignation] = useState<StaffDesignation>('stylist')
  const [phone, setPhone] = useState('')
  const [specialization, setSpecialization] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) {
      return
    }
    setEmail('')
    setDesignation('stylist')
    setPhone('')
    setSpecialization('')
    setFormError(null)
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (email.trim() === '') {
      setFormError('Enter the email the staff member signs in with.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        email: email.trim(),
        designation,
        phone: phone.trim() === '' ? null : phone.trim(),
        specialization: specialization.trim() === '' ? null : specialization.trim(),
      }
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not add the staff member.')
      }
      onSaved()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not add the staff member.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} onClose={onClose} title="Add staff member">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Account email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="name@example.com"
            required
          />
        </Field>
        <p className="font-sans text-xs text-dusty-gray -mt-1">
          The person must have signed in at least once. We link their existing account.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Designation">
            <select
              value={designation}
              onChange={(e) => setDesignation(e.target.value as StaffDesignation)}
              className={inputClass}
            >
              {STAFF_DESIGNATIONS.map((d) => (
                <option key={d} value={d}>
                  {DESIGNATION_LABEL[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="e.g. +91 98xxxxxxx"
            />
          </Field>
        </div>
        <Field label="Specialization">
          <input
            type="text"
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            className={inputClass}
            placeholder="e.g. Bridal makeup, Deep-tissue massage"
          />
        </Field>

        {formError && (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        )}

        <DialogActions busy={busy} onClose={onClose} submitLabel="Add staff" />
      </form>
    </FormDialog>
  )
}

/* ── Staff edit dialog (profile + service capabilities) ─────────────────── */

function StaffDialog({
  staff,
  onClose,
  onSaved,
}: {
  staff: StaffRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [designation, setDesignation] = useState<StaffDesignation>('stylist')
  const [phone, setPhone] = useState('')
  const [specialization, setSpecialization] = useState('')
  const [bio, setBio] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [catalogue, setCatalogue] = useState<CatalogueService[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [loadingDetail, setLoadingDetail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Seed the form + load the catalogue and this member's assigned services
  // whenever the dialog opens for a staff row.
  useEffect(() => {
    if (!staff) {
      return
    }
    setDesignation(staff.designation)
    setPhone(staff.phone ?? '')
    setSpecialization(staff.specialization ?? '')
    setBio(staff.bio ?? '')
    setIsActive(staff.isActive)
    setFormError(null)

    let cancelled = false
    const loadDetail = async () => {
      setLoadingDetail(true)
      try {
        const [catRes, detailRes] = await Promise.all([
          fetch('/api/services/all'),
          fetch(`/api/staff/${staff.id}`),
        ])
        const catJson = await catRes.json()
        const detailJson = await detailRes.json()
        if (!catRes.ok || !catJson.success) {
          throw new Error(catJson?.error?.message ?? 'Could not load services.')
        }
        if (!detailRes.ok || !detailJson.success) {
          throw new Error(detailJson?.error?.message ?? 'Could not load staff details.')
        }
        if (cancelled) {
          return
        }
        setCatalogue(catJson.data.services as CatalogueService[])
        setSelected(new Set((detailJson.data.staff.serviceIds as string[]) ?? []))
      } catch (err: unknown) {
        if (!cancelled) {
          setFormError(err instanceof Error ? err.message : 'Could not load details.')
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false)
        }
      }
    }
    loadDetail()
    return () => {
      cancelled = true
    }
  }, [staff])

  const toggleService = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Group active services by category for the checkbox list.
  const grouped = catalogue
    .filter((s) => s.isActive)
    .reduce<{ categoryId: string; categoryName: string; items: CatalogueService[] }[]>(
      (acc, svc) => {
        const existing = acc.find((g) => g.categoryId === svc.categoryId)
        if (existing) {
          existing.items.push(svc)
        } else {
          acc.push({ categoryId: svc.categoryId, categoryName: svc.categoryName, items: [svc] })
        }
        return acc
      },
      [],
    )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staff) {
      return
    }
    setFormError(null)
    setBusy(true)
    try {
      const profilePayload = {
        designation,
        phone: phone.trim() === '' ? null : phone.trim(),
        specialization: specialization.trim() === '' ? null : specialization.trim(),
        bio: bio.trim() === '' ? null : bio.trim(),
        isActive,
      }
      const profileRes = await fetch(`/api/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profilePayload),
      })
      const profileJson = await profileRes.json()
      if (!profileRes.ok || !profileJson.success) {
        throw new Error(profileJson?.error?.message ?? 'Could not save the profile.')
      }

      const servicesRes = await fetch(`/api/staff/${staff.id}/services`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceIds: [...selected] }),
      })
      const servicesJson = await servicesRes.json()
      if (!servicesRes.ok || !servicesJson.success) {
        throw new Error(servicesJson?.error?.message ?? 'Could not save services.')
      }

      onSaved()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={Boolean(staff)}
      onClose={onClose}
      title={staff ? `Edit ${staff.name}` : 'Edit staff'}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Designation">
            <select
              value={designation}
              onChange={(e) => setDesignation(e.target.value as StaffDesignation)}
              className={inputClass}
            >
              {STAFF_DESIGNATIONS.map((d) => (
                <option key={d} value={d}>
                  {DESIGNATION_LABEL[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="e.g. +91 98xxxxxxx"
            />
          </Field>
        </div>
        <Field label="Specialization">
          <input
            type="text"
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            className={inputClass}
            placeholder="e.g. Bridal makeup, Deep-tissue massage"
          />
        </Field>
        <Field label="Bio">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${inputClass} min-h-[72px] resize-y`}
            placeholder="Short internal bio (optional)"
          />
        </Field>
        <label className="flex items-center gap-2 font-sans text-sm text-cocoa-dark">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-outline-gray text-deep-gold focus:ring-deep-gold"
          />
          Active (available for bookings)
        </label>

        <div className="pt-1">
          <span className="block font-ui text-[11px] uppercase tracking-wider text-dusty-gray mb-1.5">
            Services this member can perform
          </span>
          {loadingDetail ? (
            <div className="border border-cloud-gray rounded-[6px] bg-cloud-gray/30 px-4 py-6 text-center">
              <span className="font-sans text-sm text-dusty-gray">Loading services…</span>
            </div>
          ) : grouped.length === 0 ? (
            <div className="border border-cloud-gray rounded-[6px] bg-cloud-gray/30 px-4 py-6 text-center">
              <span className="font-sans text-sm text-dusty-gray">
                No active services available.
              </span>
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-[6px] border border-cloud-gray divide-y divide-cloud-gray">
              {grouped.map((group) => (
                <fieldset key={group.categoryId} className="px-3 py-2">
                  <legend className="font-ui text-[10px] uppercase tracking-[1px] text-dusty-gray mb-1.5">
                    {group.categoryName}
                  </legend>
                  <div className="space-y-1.5">
                    {group.items.map((svc) => (
                      <label
                        key={svc.id}
                        className="flex items-center gap-2 font-sans text-sm text-cocoa-dark"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(svc.id)}
                          onChange={() => toggleService(svc.id)}
                          className="h-4 w-4 rounded border-outline-gray text-deep-gold focus:ring-deep-gold"
                        />
                        {svc.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
          <p className="font-sans text-xs text-dusty-gray mt-1.5">
            {selected.size} service{selected.size === 1 ? '' : 's'} selected
          </p>
        </div>

        {formError && (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        )}

        <DialogActions busy={busy} onClose={onClose} submitLabel="Save" />
      </form>
    </FormDialog>
  )
}

/* ── Shared primitives (mirrors services-manager.tsx) ───────────────────── */

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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-cloud-gray bg-canvas-white p-5 shadow-elevated focus:outline-none max-h-[90vh] overflow-y-auto">
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
    // biome-ignore lint/a11y/noLabelWithoutControl: control provided via children
    <label className="block">
      <span className="block font-ui text-[11px] uppercase tracking-wider text-dusty-gray mb-1">
        {label}
      </span>
      {children}
    </label>
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

function LoadingState() {
  return (
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading staff…</span>
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
      <p className="font-sans text-sm text-cocoa-dark mb-1">No staff found</p>
      <p className="font-sans text-xs text-dusty-gray">
        Staff appear here once their profiles are created.
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
