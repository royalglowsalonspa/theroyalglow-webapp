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

import * as Dialog from '@radix-ui/react-dialog'
import { STAFF_DESIGNATIONS, type StaffDesignation } from '@rgss/types'
import { cn } from '@rgss/ui/lib/utils'
import { Pencil, Scissors, UserCheck, UserPlus, UserX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { type AdminColumnDef, DataTable, type RowAction } from '@/components/ui/data-table'
import { type ColumnToggle, FilterBar } from '@/components/ui/filter-bar'
import { FormActions } from '@/components/ui/form-field'
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
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useAsyncData } from '@/components/ui/use-async-data'
import { toast } from '@/lib/admin/toast'

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

/** Pragmatic email shape check (the server remains the source of truth). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Returns an error message for an invalid email, or null when acceptable. */
function validateStaffEmail(value: string): string | null {
  const v = value.trim()
  if (v === '') {
    return 'Enter the email the staff member signs in with.'
  }
  if (!EMAIL_RE.test(v)) {
    return 'Enter a valid email address (e.g. name@example.com).'
  }
  return null
}

/** Branded Radix Select for the staff designation — click-to-select dropdown. */
function DesignationSelect({
  value,
  onChange,
}: {
  value: StaffDesignation
  onChange: (value: StaffDesignation) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
        Designation
      </span>
      <Select value={value} onValueChange={(v) => onChange(v as StaffDesignation)}>
        <SelectTrigger aria-label="Designation" className="w-full">
          <SelectValue placeholder="Select designation" />
        </SelectTrigger>
        <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
          <SelectGroup>
            {STAFF_DESIGNATIONS.map((d) => (
              <SelectItem key={d} value={d}>
                {DESIGNATION_LABEL[d]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
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
  const [toggling, setToggling] = useState<StaffRow | null>(null)

  const { state, retry } = useAsyncData(fetchStaff)

  const columns = useMemo<AdminColumnDef<StaffRow, unknown>[]>(
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
      row.original.isActive
        ? {
            label: 'Deactivate',
            icon: UserX,
            destructive: true,
            onSelect: () => setToggling(row.original),
          }
        : {
            label: 'Activate',
            icon: UserCheck,
            onSelect: () => setToggling(row.original),
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
      <ToggleActiveDialog
        staff={toggling}
        onClose={() => setToggling(null)}
        onToggled={() => {
          setToggling(null)
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

/* ── Activate / Deactivate confirm (one-click status toggle) ────────────── */

function ToggleActiveDialog({
  staff,
  onClose,
  onToggled,
}: {
  staff: StaffRow | null
  onClose: () => void
  onToggled: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deactivating = staff?.isActive ?? false

  // Clear any prior error whenever a new staff row opens the dialog.
  useEffect(() => {
    if (staff) {
      setError(null)
    }
  }, [staff])

  const confirm = async () => {
    if (!staff) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !staff.isActive }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not update the status.')
      }
      toast.success(staff.isActive ? `${staff.name} deactivated` : `${staff.name} activated`)
      onToggled()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not update the status.'
      setError(message)
      toast.error('Could not update status', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={Boolean(staff)} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deactivating ? `Deactivate ${staff?.name}?` : `Activate ${staff?.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating
              ? 'They will stop appearing for new bookings and staff assignment. Existing bookings, invoices and history are kept intact. You can reactivate them at any time.'
              : 'They will become available for new bookings and staff assignment again.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p className="font-sans text-sm text-error" role="alert">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onClose}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              // Keep the dialog mounted while the request is in flight; close on success.
              e.preventDefault()
              confirm()
            }}
            className={cn(deactivating && 'bg-error text-canvas-white hover:bg-error/90')}
          >
            {busy ? 'Saving…' : deactivating ? 'Deactivate' : 'Activate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  const [emailError, setEmailError] = useState<string | null>(null)

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
    setEmailError(null)
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const emailErr = validateStaffEmail(email)
    if (emailErr) {
      setEmailError(emailErr)
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
      toast.success('Staff member added')
      onSaved()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not add the staff member.'
      setFormError(message)
      toast.error('Could not add staff member', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} onClose={onClose} title="Add staff member">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="staff-email"
            className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray"
          >
            Account email
          </label>
          <Input
            id="staff-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (emailError) {
                setEmailError(null)
              }
            }}
            onBlur={() => setEmailError(validateStaffEmail(email))}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? 'staff-email-error' : 'staff-email-hint'}
            placeholder="name@example.com"
            required
          />
          <p id="staff-email-hint" className="font-sans text-xs text-dusty-gray">
            The person must have signed in at least once. We link their existing account.
          </p>
          {emailError ? (
            <p id="staff-email-error" className="font-sans text-xs text-error" role="alert">
              {emailError}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DesignationSelect value={designation} onChange={setDesignation} />
          <Field label="Phone">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98xxxxxxx"
            />
          </Field>
        </div>
        <Field label="Specialization">
          <Input
            type="text"
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            placeholder="e.g. Bridal makeup, Deep-tissue massage"
          />
        </Field>

        {formError && (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        )}

        <FormActions busy={busy} onCancel={onClose} submitLabel="Add staff" />
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

      toast.success(`${staff.name} updated`)
      onSaved()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not save changes.'
      setFormError(message)
      toast.error('Could not save changes', message)
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DesignationSelect value={designation} onChange={setDesignation} />
          <Field label="Phone">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98xxxxxxx"
            />
          </Field>
        </div>
        <Field label="Specialization">
          <Input
            type="text"
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            placeholder="e.g. Bridal makeup, Deep-tissue massage"
          />
        </Field>
        <Field label="Bio">
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="min-h-[72px] resize-y"
            placeholder="Short internal bio (optional)"
          />
        </Field>
        <div className="flex items-center gap-2.5">
          <Switch id="staff-active" checked={isActive} onCheckedChange={setIsActive} />
          <label htmlFor="staff-active" className="font-sans text-sm text-cocoa-dark">
            Active (available for bookings)
          </label>
        </div>

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
                      <div key={svc.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`svc-${svc.id}`}
                          checked={selected.has(svc.id)}
                          onCheckedChange={() => toggleService(svc.id)}
                        />
                        <label
                          htmlFor={`svc-${svc.id}`}
                          className="font-sans text-sm text-cocoa-dark"
                        >
                          {svc.name}
                        </label>
                      </div>
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

        <FormActions busy={busy} onCancel={onClose} submitLabel="Save" />
      </form>
    </FormDialog>
  )
}

/* ── Shared dialog primitives ───────────────────────────────────────────── */

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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-cards border border-cloud-gray bg-canvas-white shadow-elevated focus:outline-none">
          <Dialog.Title className="shrink-0 px-5 pt-5 pb-3 font-display text-lg tracking-tight text-cocoa-dark">
            {title}
          </Dialog.Title>
          <div className="min-h-0 overflow-y-auto px-5 pb-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
