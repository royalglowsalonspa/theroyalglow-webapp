/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Staff Manager
 * Scope        : Admin Portal — Staff management
 *
 * Description  : Interactive staff roster rebuilt on the admin design-system
 *                primitives. Renders the list via the reusable DataTable, its
 *                controls via the FilterBar, the active/inactive state via
 *                StatusBadge, and loading / empty / error conditions via the
 *                shared state presenters. Fetch orchestration + timeout is
 *                delegated to the useAsyncData hook. The edit dialog updates a
 *                staff member's profile fields AND replaces their service
 *                capabilities (the staff_service mapping that drives booking
 *                availability). Consumes the existing staff APIs as-is. Manager+.
 *
 * Responsibilities :
 * - List staff (name, email, designation, # services, active status) from
 *   GET /api/staff/all via useAsyncData
 * - Edit profile fields (PATCH /api/staff/[id]) + services
 *   (PUT /api/staff/[id]/services) in one save
 * - Add a staff member by linking an existing account (POST /api/staff)
 * - Multi-select services grouped by category, loaded from GET /api/services/all
 *
 * Tech Stack   : Next.js 16, React (Client Component), @tanstack/react-table,
 *                Radix Dialog, Tailwind CSS v4 (Brand Tokens)
 * Layer        : Presentation (Data Table Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/filter-bar,
 *                @/components/ui/status-badge, @/components/ui/state/*,
 *                @/components/ui/use-async-data, @/components/ui/icon,
 *                @radix-ui/react-dialog, @rgss/types, lucide-react, React hooks
 *
 * Notes        : Presentation-layer only — no API/RBAC/data-model/business-logic
 *                changes. Uses ONLY semantic Brand-Token utilities and lucide
 *                icons via the Icon wrapper — no emoji / hex / raw-palette
 *                literals. Staff are deactivated (isActive=false), never
 *                hard-deleted. Every pre-redesign field (Name, Email,
 *                Designation, Services, Status) and action (Add, Edit + service
 *                capabilities) is preserved (Req 17.6, 17.7).
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { DataTable, type RowAction } from '@/components/ui/data-table'
import { type ColumnToggle, FilterBar } from '@/components/ui/filter-bar'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import * as Dialog from '@radix-ui/react-dialog'
import { STAFF_DESIGNATIONS, type StaffDesignation } from '@rgss/types'
import { cn } from '@rgss/ui/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import { Pencil, Scissors, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

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

const DESIGNATION_LABEL: Record<StaffDesignation, string> = {
  receptionist: 'Receptionist',
  stylist: 'Stylist',
  therapist: 'Therapist',
  manager: 'Manager',
}

/** Toggleable data columns surfaced to the FilterBar column-visibility control. */
const COLUMN_META: { id: string; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
  { id: 'designation', label: 'Designation' },
  { id: 'serviceCount', label: 'Services' },
  { id: 'isActive', label: 'Status' },
]

async function fetchStaff(): Promise<StaffRow[]> {
  const res = await fetch('/api/staff/all')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load staff.')
  }
  return json.data.staff as StaffRow[]
}

export function StaffManager() {
  const [search, setSearch] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<StaffRow | null>(null)
  const [creating, setCreating] = useState(false)

  const { state, retry } = useAsyncData(fetchStaff)

  const columns = useMemo<ColumnDef<StaffRow, unknown>[]>(
    () => [
      { id: 'name', accessorKey: 'name', header: 'Name' },
      {
        id: 'email',
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => <span className="text-warm-gray">{row.original.email}</span>,
      },
      {
        id: 'designation',
        accessorKey: 'designation',
        header: 'Designation',
        cell: ({ row }) => <DesignationPill designation={row.original.designation} />,
      },
      {
        id: 'serviceCount',
        accessorKey: 'serviceCount',
        header: 'Services',
        cell: ({ row }) => <span className="font-ui">{row.original.serviceCount}</span>,
      },
      {
        id: 'isActive',
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
      },
    ],
    [],
  )

  const rowActions = useCallback(
    (row: { original: StaffRow }): RowAction[] => [
      {
        label: 'Edit',
        icon: Pencil,
        onSelect: () => setEditing(row.original),
      },
    ],
    [],
  )

  const columnToggles: ColumnToggle[] = COLUMN_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    visible: columnVisibility[meta.id] !== false,
  }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Staff</h1>
          <p className="mt-0.5 font-sans text-sm text-dusty-gray">
            Manage staff designations and the services each member can perform. Service capabilities
            drive booking availability.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-9 items-center gap-2 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray motion-reduce:transition-none"
        >
          <Icon icon={UserPlus} decorative size={16} />
          Add staff
        </button>
      </div>

      {/* Controls */}
      <FilterBar
        config={{
          search: { placeholder: 'Search staff…', ariaLabel: 'Search staff' },
          columnVisibility: true,
        }}
        search={search}
        onSearchChange={setSearch}
        columns={columnToggles}
        onColumnToggle={(id, visible) =>
          setColumnVisibility((current) => ({ ...current, [id]: visible }))
        }
      />

      {/* Table / states */}
      {state.status === 'loading' ? (
        <Skeleton rows={6} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="No staff found"
          message="Staff appear here once their profiles are created."
        />
      ) : (
        <DataTable
          columns={columns}
          data={state.data}
          tableId="staff"
          caption="Staff"
          globalFilter={search}
          rowActions={rowActions}
          onRowClick={(staff) => setEditing(staff)}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
        />
      )}

      <StaffDialog
        staff={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          retry()
        }}
      />
      <CreateStaffDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false)
          retry()
        }}
      />
    </div>
  )
}

/** Neutral, token-styled designation pill (designation is a label, not a status). */
function DesignationPill({ designation }: { designation: StaffDesignation }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-cloud-gray px-2.5 py-0.5 font-ui text-xs font-medium uppercase tracking-wide text-warm-gray">
      {DESIGNATION_LABEL[designation] ?? designation}
    </span>
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
        <p className="-mt-1 font-sans text-xs text-dusty-gray">
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
            className={cn(inputClass, 'min-h-[72px] resize-y')}
            placeholder="Short internal bio (optional)"
          />
        </Field>
        <label className="flex items-center gap-2 font-sans text-sm text-cocoa-dark">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded-cards border-outline-gray accent-deep-gold focus:ring-deep-gold"
          />
          Active (available for bookings)
        </label>

        <div className="pt-1">
          <span className="mb-1.5 block font-ui text-xs uppercase tracking-wider text-dusty-gray">
            Services this member can perform
          </span>
          {loadingDetail ? (
            <div className="rounded-cards border border-cloud-gray bg-cloud-gray/30 px-4 py-6 text-center">
              <span className="font-sans text-sm text-dusty-gray">Loading services…</span>
            </div>
          ) : grouped.length === 0 ? (
            <div className="rounded-cards border border-cloud-gray bg-cloud-gray/30 px-4 py-6 text-center">
              <span className="font-sans text-sm text-dusty-gray">
                No active services available.
              </span>
            </div>
          ) : (
            <div className="max-h-56 divide-y divide-cloud-gray overflow-y-auto rounded-cards border border-cloud-gray">
              {grouped.map((group) => (
                <fieldset key={group.categoryId} className="px-3 py-2">
                  <legend className="mb-1.5 font-ui text-[10px] uppercase tracking-[1px] text-dusty-gray">
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
                          className="h-4 w-4 rounded-cards border-outline-gray accent-deep-gold focus:ring-deep-gold"
                        />
                        {svc.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
          <p className="mt-1.5 font-sans text-xs text-dusty-gray">
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

/* ── Shared dialog primitives ───────────────────────────────────────────── */

const inputClass =
  'w-full rounded-buttons border border-outline-gray bg-canvas-white px-3 py-2 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold'

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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-cards border border-cloud-gray bg-canvas-white p-5 shadow-elevated focus:outline-none">
          <Dialog.Title className="mb-3 font-display text-lg tracking-tight text-cocoa-dark">
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
    // biome-ignore lint/a11y/noLabelWithoutControl: control provided via children
    <label className="block">
      <span className="mb-1 block font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
        {label}
      </span>
      {children}
    </label>
  )
}
