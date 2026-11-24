/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 28-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Staff Manager
 * Scope        : Admin Portal — Staff at the active branch (R1.5, R1.6, R1.11)
 *
 * Description  : The people who work at the active branch, listed with the
 *                reusable DataTable. Add staff finds an existing account by
 *                phone, email or name and makes them a Stylist or Therapist
 *                here. Edit changes their title, phone, specialization, bio
 *                and the services they perform. Remove returns a Stylist or
 *                Therapist to Customer, keeping their history.
 *
 * Responsibilities :
 * - List the branch's staff from GET /api/staff/all via useAsyncData
 * - Add staff: GET /api/staff/candidates + POST /api/staff
 * - Edit: PATCH /api/staff/[id] + PUT /api/staff/[id]/services in one save
 * - Remove: GET /api/staff/[id] (upcoming bookings) + POST /api/staff/[id]/remove
 *
 * Features / Functionality :
 * - Every write sends the branch the page was rendered for (R2.4)
 * - Managers edit and remove Stylists and Therapists; the Owner and the
 *   Developer also edit the Manager and Receptionist, who are chosen and
 *   removed in Users & Roles
 * - There is no active toggle: Remove replaces it (R1.5)
 *
 * Tech Stack   : Next.js 16, React (Client Component), @tanstack/react-table,
 *                Radix Dialog, Tailwind CSS v4 (Brand Tokens)
 * Layer        : Presentation (Data Table Component)
 *
 * Notes        : The server decides every permission from current rows; the
 *                canEdit / canRemove flags only shape the UI. Uses ONLY
 *                semantic Brand-Token utilities and lucide icons via the Icon
 *                wrapper — no emoji / hex / raw-palette literals.
 ************************************************************/

'use client'

import * as Dialog from '@radix-ui/react-dialog'
import {
  SERVICE_DESIGNATIONS,
  type ServiceDesignation,
  SPECIALIZATION_MAX_LENGTH,
  type StaffDesignation,
} from '@rgss/types'
import { Pencil, Scissors, UserMinus, UserPlus, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type PersonMatch, PersonSearch, personLabel } from '@/components/people/person-search'
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
import { Textarea } from '@/components/ui/textarea'
import { useAsyncData } from '@/components/ui/use-async-data'
import { reassignmentsNotice } from '@/lib/admin/bookings'
import { toast } from '@/lib/admin/toast'
import { liveUpdatesNotice } from '@/lib/realtime/token-lifetime'

interface StaffRow {
  id: string
  userId: string
  name: string
  email: string
  phone: string | null
  designation: StaffDesignation
  roleWitness: 'staff' | 'receptionist' | 'manager' | null
  bio: string | null
  specialization: string | null
  hireDate: string | null
  createdAt: string
  serviceCount: number
  canEdit: boolean
  canRemove: boolean
}

interface StaffPage {
  branch: { id: string; name: string; code: string }
  staff: StaffRow[]
}

interface Candidate extends PersonMatch {
  available: boolean
  reason: string | null
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
  { id: 'designation', label: 'Title' },
  { id: 'serviceCount', label: 'Services' },
]

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? 'Something went wrong. Please try again.')
  }
  return json.data as T
}

function send(url: string, method: 'POST' | 'PATCH' | 'PUT', body: unknown) {
  return api<unknown>(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const fetchStaffPage = () => api<StaffPage>('/api/staff/all')

const searchCandidates = (term: string, signal: AbortSignal) =>
  api<{ people: Candidate[] }>(`/api/staff/candidates?search=${encodeURIComponent(term)}`, {
    signal,
  }).then((data) => data.people)

const candidateStatus = (match: Candidate) => ({
  pickable: match.available,
  text: match.available ? null : match.reason,
})

function trimmedOrNull(value: string): string | null {
  const v = value.trim()
  return v === '' ? null : v
}

export function StaffManager() {
  const [search, setSearch] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<StaffRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<StaffRow | null>(null)

  const { state, retry } = useAsyncData(fetchStaffPage)
  const branch = state.status === 'success' ? state.data.branch : null

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
        header: 'Title',
        cell: ({ row }) => <DesignationPill designation={row.original.designation} />,
      },
      {
        id: 'serviceCount',
        accessorKey: 'serviceCount',
        header: 'Services',
        cell: ({ row }) => <span className="font-ui">{row.original.serviceCount}</span>,
      },
    ],
    [],
  )

  const rowActions = useCallback((row: { original: StaffRow }): RowAction[] => {
    const actions: RowAction[] = []
    if (row.original.canEdit) {
      actions.push({ label: 'Edit', icon: Pencil, onSelect: () => setEditing(row.original) })
    }
    if (row.original.canRemove) {
      actions.push({
        label: 'Remove',
        icon: UserMinus,
        destructive: true,
        onSelect: () => setRemoving(row.original),
      })
    }
    return actions
  }, [])

  const columnToggles: ColumnToggle[] = COLUMN_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    visible: columnVisibility[meta.id] !== false,
  }))

  const saved = () => {
    setEditing(null)
    setAdding(false)
    setRemoving(null)
    retry()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">
            Staff{branch ? ` · ${branch.name}` : ''}
          </h1>
          <p className="mt-0.5 font-sans text-sm text-dusty-gray">
            The people who work at this branch and the services each performs. Service capabilities
            drive booking availability. The Manager and Receptionist are chosen in Users &amp;
            Roles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={!branch}
          className="inline-flex h-9 items-center gap-2 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:opacity-60 motion-reduce:transition-none"
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
      ) : state.data.staff.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="No staff yet"
          message="Add a Stylist or Therapist, or choose the Manager and Receptionist in Users & Roles."
        />
      ) : (
        <DataTable
          columns={columns}
          data={state.data.staff}
          tableId="staff"
          caption={`Staff at ${state.data.branch.name}`}
          globalFilter={search}
          rowActions={rowActions}
          onRowClick={(staff) => (staff.canEdit ? setEditing(staff) : undefined)}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
        />
      )}

      {branch ? (
        <>
          <StaffDialog
            staff={editing}
            branchId={branch.id}
            onClose={() => setEditing(null)}
            onSaved={saved}
          />
          <AddStaffDialog
            open={adding}
            branch={branch}
            onClose={() => setAdding(false)}
            onSaved={saved}
          />
          <RemoveStaffDialog
            staff={removing}
            branch={branch}
            onClose={() => setRemoving(null)}
            onRemoved={saved}
          />
        </>
      ) : null}
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

/** Branded Radix Select for a Stylist / Therapist title. */
function TitleSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: ServiceDesignation
  onChange: (value: ServiceDesignation) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
        Title
      </label>
      <Select value={value} onValueChange={(v) => onChange(v as ServiceDesignation)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select title" />
        </SelectTrigger>
        <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
          <SelectGroup>
            {SERVICE_DESIGNATIONS.map((d) => (
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

/* ── Add staff (find a person, then a title) ────────────────────────────── */

function AddStaffDialog({
  open,
  branch,
  onClose,
  onSaved,
}: {
  open: boolean
  branch: StaffPage['branch']
  onClose: () => void
  onSaved: () => void
}) {
  const [person, setPerson] = useState<Candidate | null>(null)
  const [designation, setDesignation] = useState<ServiceDesignation>('stylist')
  const [specialization, setSpecialization] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) {
      return
    }
    setPerson(null)
    setDesignation('stylist')
    setSpecialization('')
    setFormError(null)
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!person) {
      setFormError('Find and choose the person first.')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      await send('/api/staff', 'POST', {
        branchId: branch.id,
        userId: person.id,
        designation,
        specialization: trimmedOrNull(specialization),
      })
      toast.success(
        `${personLabel(person)} is now a ${DESIGNATION_LABEL[designation]} at ${branch.name}`,
      )
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
    <FormDialog open={open} onClose={onClose} title={`Add staff at ${branch.name}`}>
      <form onSubmit={submit} className="space-y-3">
        {person ? (
          <div className="flex items-center justify-between gap-3 rounded-cards border border-cloud-gray px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2.5">
              <Icon icon={UserRound} decorative size={18} className="shrink-0 text-success" />
              <span className="min-w-0">
                <span className="block truncate font-sans text-sm text-cocoa-dark">
                  {personLabel(person)}
                </span>
                <span className="block truncate font-sans text-xs text-dusty-gray">
                  {person.phone ? `${person.email} · ${person.phone}` : person.email}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => setPerson(null)}
              disabled={busy}
              className="shrink-0 rounded-buttons px-2 py-1 font-ui text-xs text-warm-gray transition-colors hover:bg-cloud-gray hover:text-cocoa-dark disabled:opacity-60 motion-reduce:transition-none"
            >
              Change
            </button>
          </div>
        ) : (
          <PersonSearch<Candidate>
            search={searchCandidates}
            status={candidateStatus}
            onPick={setPerson}
            disabled={busy}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TitleSelect id="add-staff-title" value={designation} onChange={setDesignation} />
          <Field label="Specialization (optional)">
            <Input
              type="text"
              value={specialization}
              maxLength={SPECIALIZATION_MAX_LENGTH}
              onChange={(e) => setSpecialization(e.target.value)}
              placeholder="e.g. Bridal makeup"
            />
          </Field>
        </div>

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

/* ── Remove staff ───────────────────────────────────────────────────────── */

function RemoveStaffDialog({
  staff,
  branch,
  onClose,
  onRemoved,
}: {
  staff: StaffRow | null
  branch: StaffPage['branch']
  onClose: () => void
  onRemoved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upcoming, setUpcoming] = useState<number | null>(null)

  // Look up how many upcoming bookings name them, so the warning is concrete.
  useEffect(() => {
    if (!staff) {
      return
    }
    setError(null)
    setUpcoming(null)
    let cancelled = false
    api<{ staff: { upcomingAssignments: number } }>(`/api/staff/${staff.id}`)
      .then((data) => {
        if (!cancelled) {
          setUpcoming(data.staff.upcomingAssignments)
        }
      })
      .catch(() => {
        // The count is advice only; removal still works without it.
      })
    return () => {
      cancelled = true
    }
  }, [staff])

  const confirm = async () => {
    if (!staff) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = (await send(`/api/staff/${staff.id}/remove`, 'POST', {
        branchId: branch.id,
      })) as { liveUpdates?: string; reassignments?: number } | null
      toast.success(`${staff.name} removed from ${branch.name}`)
      const moved = reassignmentsNotice(result?.reassignments)
      if (moved) {
        toast.warning(moved)
      }
      const notice = liveUpdatesNotice(result?.liveUpdates)
      if (notice) {
        toast.warning(notice)
      }
      onRemoved()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not remove the staff member.'
      setError(message)
      toast.error('Could not remove staff member', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={Boolean(staff)} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Remove ${staff?.name ?? ''} from ${branch.name}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 font-sans text-sm text-warm-gray">
              <p>
                They return to Customer and are signed out of the admin portal. Their bookings,
                invoices and history are kept, and adding them again later restores their profile.
              </p>
              {upcoming !== null && upcoming > 0 ? (
                <p className="text-cocoa-dark">
                  {upcoming === 1
                    ? '1 upcoming booking names them. It moves to the dashboard for someone else to take; the customer’s booking stays as it is.'
                    : `${upcoming} upcoming bookings name them. They move to the dashboard for someone else to take; the customers’ bookings stay as they are.`}
                </p>
              ) : null}
            </div>
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
            className="bg-error text-canvas-white hover:bg-error/90"
          >
            {busy ? 'Removing…' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/* ── Staff edit dialog (profile + service capabilities) ─────────────────── */

function StaffDialog({
  staff,
  branchId,
  onClose,
  onSaved,
}: {
  staff: StaffRow | null
  branchId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [designation, setDesignation] = useState<ServiceDesignation>('stylist')
  const [phone, setPhone] = useState('')
  const [specialization, setSpecialization] = useState('')
  const [bio, setBio] = useState('')

  const [catalogue, setCatalogue] = useState<CatalogueService[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [loadingDetail, setLoadingDetail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Only a Stylist or Therapist changes title; the others follow their role.
  const performsServices = staff?.roleWitness === 'staff'

  // Seed the form + load the catalogue and this member's assigned services
  // whenever the dialog opens for a staff row.
  useEffect(() => {
    if (!staff) {
      return
    }
    setDesignation(staff.designation === 'therapist' ? 'therapist' : 'stylist')
    setPhone(staff.phone ?? '')
    setSpecialization(staff.specialization ?? '')
    setBio(staff.bio ?? '')
    setFormError(null)

    let cancelled = false
    const loadDetail = async () => {
      setLoadingDetail(true)
      try {
        const [services, detail] = await Promise.all([
          api<{ services: CatalogueService[] }>('/api/services/all'),
          api<{ staff: { serviceIds: string[] } }>(`/api/staff/${staff.id}`),
        ])
        if (cancelled) {
          return
        }
        setCatalogue(services.services)
        setSelected(new Set(detail.staff.serviceIds ?? []))
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
      await send(`/api/staff/${staff.id}`, 'PATCH', {
        branchId,
        ...(performsServices ? { designation } : {}),
        phone: trimmedOrNull(phone),
        specialization: trimmedOrNull(specialization),
        bio: trimmedOrNull(bio),
      })
      await send(`/api/staff/${staff.id}/services`, 'PUT', {
        branchId,
        serviceIds: [...selected],
      })
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
          {performsServices ? (
            <TitleSelect id="edit-staff-title" value={designation} onChange={setDesignation} />
          ) : (
            <div className="flex flex-col gap-1">
              <span className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
                Title
              </span>
              <span className="py-2 font-sans text-sm text-cocoa-dark">
                {staff ? DESIGNATION_LABEL[staff.designation] : ''}
              </span>
            </div>
          )}
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
            maxLength={SPECIALIZATION_MAX_LENGTH}
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
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
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
