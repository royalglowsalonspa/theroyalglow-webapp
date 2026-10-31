/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Branches Manager
 * Scope        : Admin Portal — Branch management
 *
 * Description  : Full CRUD for physical salon/spa branches, rebuilt on the
 *                admin design-system primitives. Branches are listed in the
 *                reusable DataTable (name + primary chip, code, colour-coded
 *                Status_Badge, location, contact), filtered via the FilterBar
 *                (search + status), with loading / empty / error routed through
 *                the shared state presenters. Create / edit happen in a Radix
 *                dialog covering every editable field plus the operational
 *                status. Multi-branch-ready — any number of branches, each by id.
 *
 * Responsibilities :
 * - List the person's branches from GET /api/branches via useAsyncData
 * - Developer only (multi-branch R1.1): create a branch with its Owner
 *   (POST /api/branches, Owner chosen with the person search) and edit it
 *   (PATCH /api/branches/[id]); everyone else sees the list read-only
 * - Developer only (R1.10): before a shutdown, list what is still open at
 *   the branch (GET /api/branches/[id]/shutdown-check) and hold the save
 *   until it is clear; delete an empty shut-down branch
 *   (DELETE /api/branches/[id])
 * - Render operational status via the StatusBadge primitive
 * - Filter the list (search + status) client-side over the single fetch
 * - Surface loading / empty / error states via the state presenters
 *
 * Tech Stack   : Next.js 16, React (Client Component), @tanstack/react-table,
 *                @radix-ui/react-dialog, Tailwind
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/filter-bar,
 *                @/components/ui/status-badge, @/components/ui/state/*,
 *                @/components/ui/use-async-data, @radix-ui/react-dialog,
 *                @rgss/types (BRANCH_STATUSES), React
 *
 * Notes        : `code` + `number` are generated server-side and not editable.
 *                Status drives the lifecycle. Delete is offered only on a
 *                shut-down branch; the server keeps any branch with records.
 *                The database refuses a shutdown while anything is open, so
 *                the check here is advice that saves a failed save.
 *                Uses ONLY semantic Brand-Token utilities (Req 1.2).
 *                Requirements 17.1–17.7.
 ************************************************************/

'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { BRANCH_STATUSES, type BranchStatusValue } from '@rgss/types'
import type { ColumnVisibilityState } from '@tanstack/react-table'
import { Building2, Pencil, Trash2, TriangleAlert } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { type AdminColumnDef, DataTable } from '@/components/ui/data-table'
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
import { useAsyncData } from '@/components/ui/use-async-data'
import { sampleInvoiceNumber } from '@/lib/admin/format'
import { toast } from '@/lib/admin/toast'
import { liveUpdatesNotice } from '@/lib/realtime/token-lifetime'

interface AdminBranch {
  id: string
  number: number
  code: string
  name: string
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  pincode: string
  phone: string
  email: string | null
  googleMapsUrl: string | null
  googleMapsPlaceId: string | null
  latitude: string | null
  longitude: string | null
  status: BranchStatusValue
  openingDate: string | null
  closingDate: string | null
  temporaryCloseReason: string | null
  isPrimary: boolean
  displayOrder: number
  /** The issuer on its invoices (multi-branch R6.1). */
  legalName: string | null
  gstin: string | null
  invoicePrefix: string
}

const STATUS_LABEL: Record<BranchStatusValue, string> = {
  operational: 'Operational',
  temporarily_closed: 'Temporarily closed',
  opens_soon: 'Opens soon',
  shutdown: 'Shutdown',
}

/** Status filter options for the FilterBar dropdown. */
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...BRANCH_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
]

/** Toggleable data columns surfaced to the FilterBar column-visibility control. */
const COLUMN_META: { id: string; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'code', label: 'Code' },
  { id: 'status', label: 'Status' },
  { id: 'location', label: 'Location' },
  { id: 'phone', label: 'Phone' },
  { id: 'email', label: 'Email' },
]

/** GET /api/branches: the branches this person can access. */
interface BranchList {
  branches: AdminBranch[]
  /** Only the Developer creates and edits branches (R1.1). */
  canEdit: boolean
}

/** A New branch Owner candidate from GET /api/branches/owner-candidates. */
interface OwnerCandidate extends PersonMatch {
  available: boolean
  reason: string | null
}

async function fetchBranches(): Promise<BranchList> {
  const res = await fetch('/api/branches')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load branches.')
  }
  return json.data as BranchList
}

const searchOwners = async (term: string, signal: AbortSignal): Promise<OwnerCandidate[]> => {
  const res = await fetch(`/api/branches/owner-candidates?search=${encodeURIComponent(term)}`, {
    signal,
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not search accounts.')
  }
  return json.data.people as OwnerCandidate[]
}

const ownerStatus = (match: OwnerCandidate) => ({
  pickable: match.available,
  text: match.available ? null : match.reason,
})

/** GET /api/branches/[id]/shutdown-check: what is still open at the branch. */
interface ShutdownCheck {
  clear: boolean
  /** One line per open item, saying what to do about it. */
  lines: string[]
}

async function fetchShutdownCheck(branchId: string): Promise<ShutdownCheck> {
  const res = await fetch(`/api/branches/${branchId}/shutdown-check`)
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not check the branch.')
  }
  return json.data as ShutdownCheck
}

/** DELETE /api/branches/[id]: what happened to the branch's Owner. */
interface BranchDeleted {
  ownerReturnedToCustomer: string | null
  liveUpdates?: string
}

async function deleteBranch(branchId: string): Promise<BranchDeleted> {
  const res = await fetch(`/api/branches/${branchId}`, { method: 'DELETE' })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? 'Could not delete the branch.')
  }
  return json.data as BranchDeleted
}

export function BranchesManager() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [dialog, setDialog] = useState<{ open: boolean; editing: AdminBranch | null }>({
    open: false,
    editing: null,
  })
  const [deleting, setDeleting] = useState<AdminBranch | null>(null)

  const fetcher = useCallback(() => fetchBranches(), [])
  const { state, retry } = useAsyncData(fetcher)

  const branches = state.status === 'success' ? state.data.branches : []
  const canEdit = state.status === 'success' && state.data.canEdit

  // Client-side filter over the single fetch (search across name / code / city,
  // exact status match). Presentation-only shaping — no business logic.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return branches.filter((b) => {
      if (statusFilter && b.status !== statusFilter) {
        return false
      }
      if (!term) {
        return true
      }
      return (
        b.name.toLowerCase().includes(term) ||
        b.code.toLowerCase().includes(term) ||
        b.city.toLowerCase().includes(term)
      )
    })
  }, [branches, search, statusFilter])

  const columns = useMemo<AdminColumnDef<AdminBranch, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            <span className="font-ui font-medium text-cocoa-dark">{row.original.name}</span>
            {row.original.isPrimary && (
              <span className="inline-flex items-center rounded-pill bg-deep-gold/15 px-2 py-0.5 font-ui text-[10px] uppercase tracking-[0.5px] text-deep-gold">
                Primary
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'code',
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-ui text-[11px] uppercase tracking-[1px] text-dusty-gray">
            {row.original.code} · #{row.original.number}
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'location',
        header: 'Location',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-warm-gray">
            {row.original.city}, {row.original.state} {row.original.pincode}
          </span>
        ),
      },
      {
        id: 'phone',
        accessorKey: 'phone',
        header: 'Phone',
        enableSorting: false,
        cell: ({ row }) => <span className="text-warm-gray">{row.original.phone}</span>,
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: 'Email',
        enableSorting: false,
        cell: ({ row }) => <span className="text-warm-gray">{row.original.email ?? '—'}</span>,
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Branches</h1>
          <p className="mt-0.5 font-sans text-sm text-dusty-gray">
            {canEdit
              ? 'Physical salon & spa locations. Create new branches with their Owner, and manage address, contact and operational status.'
              : 'The branches you own. Only the Developer creates branches or changes their details.'}
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setDialog({ open: true, editing: null })}
            className="h-9 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray"
          >
            + Branch
          </button>
        ) : null}
      </div>

      <FilterBar
        config={{
          search: { placeholder: 'Search by name, code, or city…', ariaLabel: 'Search branches' },
          dropdowns: [
            { id: 'status', label: 'Status', options: STATUS_FILTER_OPTIONS, value: statusFilter },
          ],
          columnVisibility: true,
        }}
        search={search}
        onSearchChange={setSearch}
        onFilterChange={(id, value) => {
          if (id === 'status') {
            setStatusFilter(value)
          }
        }}
        columns={columnToggles}
        onColumnToggle={(id, visible) =>
          setColumnVisibility((current) => ({ ...current, [id]: visible }))
        }
      />

      {state.status === 'loading' ? (
        <Skeleton rows={6} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={branches.length === 0 ? 'No branches yet' : 'No branches match those filters'}
          message={
            branches.length === 0
              ? canEdit
                ? 'Click “+ Branch” to add your first location.'
                : 'No branch is linked to your account yet.'
              : 'Try adjusting your search or status filter.'
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          tableId="branches"
          caption="Branches"
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          {...(canEdit
            ? {
                rowActions: (row: { original: AdminBranch }) => [
                  {
                    label: 'Edit',
                    icon: Pencil,
                    onSelect: () => setDialog({ open: true, editing: row.original }),
                  },
                  // Only a shut-down branch can be deleted (R1.10).
                  ...(row.original.status === 'shutdown'
                    ? [
                        {
                          label: 'Delete',
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => setDeleting(row.original),
                        },
                      ]
                    : []),
                ],
              }
            : {})}
        />
      )}

      <BranchDialog
        state={dialog}
        onClose={() => setDialog({ open: false, editing: null })}
        onSaved={() => {
          setDialog({ open: false, editing: null })
          retry()
        }}
      />

      <DeleteBranchDialog
        branch={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null)
          retry()
        }}
      />
    </div>
  )
}

/* ── Delete a shut-down branch ──────────────────────────────────────────── */

function DeleteBranchDialog({
  branch,
  onClose,
  onDeleted,
}: {
  branch: AdminBranch | null
  onClose: () => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A fresh dialog for every branch.
  useEffect(() => {
    if (branch) {
      setError(null)
    }
  }, [branch])

  const confirm = async () => {
    if (!branch) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await deleteBranch(branch.id)
      toast.success(
        result.ownerReturnedToCustomer
          ? `${branch.name} deleted. Its Owner is now a Customer`
          : `${branch.name} deleted`,
      )
      const notice = liveUpdatesNotice(result.liveUpdates)
      if (notice) {
        toast.warning(notice)
      }
      onDeleted()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not delete the branch.'
      setError(message)
      toast.error('Could not delete branch', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={Boolean(branch)} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${branch?.name ?? ''}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 font-sans text-sm text-warm-gray">
              <p>
                This removes the branch for good. It works only when no bookings, invoices or other
                records name it; otherwise it stays as a shut-down branch with its history. The
                audit history is kept either way.
              </p>
              <p>
                If its Owner owns no other branch, they return to Customer and are signed out of the
                admin portal.
              </p>
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
            {busy ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/* ── Branch create/edit dialog ──────────────────────────────────────────── */

function BranchDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { open: boolean; editing: AdminBranch | null }
  onClose: () => void
  onSaved: () => void
}) {
  const editing = state.editing
  const [name, setName] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('Bengaluru')
  const [stateName, setStateName] = useState('Karnataka')
  const [pincode, setPincode] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [googleMapsUrl, setGoogleMapsUrl] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [status, setStatus] = useState<BranchStatusValue>('operational')
  const [temporaryCloseReason, setTemporaryCloseReason] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)
  // The issuer on invoices: legal name, GSTIN and the number prefix (R6.1, R6.2).
  const [legalName, setLegalName] = useState('')
  const [gstin, setGstin] = useState('')
  const [invoicePrefix, setInvoicePrefix] = useState('')
  // A new branch names its Owner; an existing branch's Owner changes only
  // through the Owner handover in Users & Roles.
  const [owner, setOwner] = useState<OwnerCandidate | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Shutting an open branch down: list what is still open there first and
  // hold the save until nothing is (R1.10).
  const shuttingDown = editing !== null && editing.status !== 'shutdown' && status === 'shutdown'
  // The prefix the number preview shows: the one typed, else the branch's.
  const previewPrefix = invoicePrefix.trim().toUpperCase() || editing?.invoicePrefix || ''
  const [shutdownClear, setShutdownClear] = useState(false)
  // Bumped to check again after the server refuses the shutdown.
  const [checkKey, setCheckKey] = useState(0)
  let submitLabel = 'Create'
  if (editing) {
    submitLabel = shuttingDown ? 'Shut down' : 'Save'
  }

  // Seed the form whenever the dialog opens (edit → row values; create → defaults).
  useEffect(() => {
    if (!state.open) {
      // A shutdown picked last time must not start a check on the next opening.
      setStatus('operational')
      return
    }
    if (editing) {
      setName(editing.name)
      setAddressLine1(editing.addressLine1)
      setAddressLine2(editing.addressLine2 ?? '')
      setCity(editing.city)
      setStateName(editing.state)
      setPincode(editing.pincode)
      setPhone(editing.phone)
      setEmail(editing.email ?? '')
      setGoogleMapsUrl(editing.googleMapsUrl ?? '')
      setLatitude(editing.latitude ?? '')
      setLongitude(editing.longitude ?? '')
      setStatus(editing.status)
      setTemporaryCloseReason(editing.temporaryCloseReason ?? '')
      setIsPrimary(editing.isPrimary)
      setLegalName(editing.legalName ?? '')
      setGstin(editing.gstin ?? '')
      setInvoicePrefix(editing.invoicePrefix)
    } else {
      setName('')
      setAddressLine1('')
      setAddressLine2('')
      setCity('Bengaluru')
      setStateName('Karnataka')
      setPincode('')
      setPhone('')
      setEmail('')
      setGoogleMapsUrl('')
      setLatitude('')
      setLongitude('')
      setStatus('operational')
      setTemporaryCloseReason('')
      setIsPrimary(false)
      setLegalName('')
      setGstin('')
      setInvoicePrefix('')
    }
    setOwner(null)
    setFormError(null)
    setShutdownClear(false)
  }, [state.open, editing])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!name.trim()) {
      setFormError('Enter a branch name.')
      return
    }
    if (!addressLine1.trim()) {
      setFormError('Enter the address.')
      return
    }
    if (!/^[1-9]\d{5}$/.test(pincode.trim())) {
      setFormError('Enter a valid 6-digit pincode.')
      return
    }
    if (!phone.trim()) {
      setFormError('Enter a phone number.')
      return
    }
    if (!editing && !owner) {
      setFormError('Choose the branch Owner.')
      return
    }
    if (
      gstin.trim() &&
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim().toUpperCase())
    ) {
      setFormError('Enter the 15-character GSTIN, or leave it empty.')
      return
    }
    if (invoicePrefix.trim() && !/^[A-Z][A-Z0-9]{0,3}$/.test(invoicePrefix.trim().toUpperCase())) {
      setFormError('The invoice prefix is 1 to 4 letters or digits, starting with a letter.')
      return
    }
    if (shuttingDown && !shutdownClear) {
      setFormError('Resolve everything listed above before shutting the branch down.')
      return
    }
    setBusy(true)
    try {
      // Build the payload with only the fields that carry a value so optional
      // columns stay omitted rather than sent as empty strings.
      const payload: Record<string, unknown> = {
        name: name.trim(),
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        state: stateName.trim(),
        pincode: pincode.trim(),
        phone: phone.trim(),
        status,
        isPrimary,
      }
      if (addressLine2.trim()) {
        payload.addressLine2 = addressLine2.trim()
      }
      if (email.trim()) {
        payload.email = email.trim()
      }
      if (googleMapsUrl.trim()) {
        payload.googleMapsUrl = googleMapsUrl.trim()
      }
      if (latitude.trim()) {
        payload.latitude = latitude.trim()
      }
      if (longitude.trim()) {
        payload.longitude = longitude.trim()
      }
      if (temporaryCloseReason.trim()) {
        payload.temporaryCloseReason = temporaryCloseReason.trim()
      }
      if (!editing && owner) {
        payload.ownerUserId = owner.id
      }
      // An edit always sends the issuer fields, so emptying one clears it. The
      // prefix is sent only when it changes: it is fixed once invoices exist.
      if (editing || legalName.trim()) {
        payload.legalName = legalName.trim()
      }
      if (editing || gstin.trim()) {
        payload.gstin = gstin.trim().toUpperCase()
      }
      const prefix = invoicePrefix.trim().toUpperCase()
      if (prefix && prefix !== editing?.invoicePrefix) {
        payload.invoicePrefix = prefix
      }

      const res = await fetch(editing ? `/api/branches/${editing.id}` : '/api/branches', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        if (json?.error?.code === 'BRANCH_SHUTDOWN_BLOCKED') {
          // Something opened since the check: show what is open now.
          setCheckKey((key) => key + 1)
          throw new Error(
            `${editing?.name ?? 'The branch'} can't shut down yet. Resolve what's listed above, then try again.`,
          )
        }
        throw new Error(json?.error?.message ?? 'Could not save the branch.')
      }
      onSaved()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not save the branch.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={state.open} onClose={onClose} title={editing ? 'Edit branch' : 'New branch'}>
      <form onSubmit={submit} className="space-y-3">
        {editing ? null : owner ? (
          <div className="flex items-center justify-between gap-3 rounded-cards border border-cloud-gray px-3 py-2.5">
            <span className="min-w-0">
              <span className="block font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
                Owner
              </span>
              <span className="block truncate font-sans text-sm text-cocoa-dark">
                {personLabel(owner)}
              </span>
              <span className="block truncate font-sans text-xs text-dusty-gray">
                {owner.email}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setOwner(null)}
              disabled={busy}
              className="shrink-0 rounded-buttons px-2 py-1 font-ui text-xs text-warm-gray transition-colors hover:bg-cloud-gray hover:text-cocoa-dark disabled:opacity-60"
            >
              Change
            </button>
          </div>
        ) : (
          <PersonSearch<OwnerCandidate>
            label="Owner"
            search={searchOwners}
            status={ownerStatus}
            onPick={setOwner}
            disabled={busy}
          />
        )}
        <Field label="Name">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rayasandra"
            required
          />
        </Field>
        <Field label="Address line 1">
          <Input
            type="text"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder="Street, building"
            required
          />
        </Field>
        <Field label="Address line 2">
          <Input
            type="text"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            placeholder="Area, landmark (optional)"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="City">
            <Input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="State">
            <Input type="text" value={stateName} onChange={(e) => setStateName(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Pincode">
            <Input
              type="text"
              inputMode="numeric"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              placeholder="560100"
              required
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 80 1234 5678"
              required
            />
          </Field>
        </div>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="branch@theroyalglow.in (optional)"
          />
        </Field>
        <Field label="Google Maps URL">
          <Input
            type="url"
            value={googleMapsUrl}
            onChange={(e) => setGoogleMapsUrl(e.target.value)}
            placeholder="https://maps.app.goo.gl/… (optional)"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Latitude">
            <Input
              type="text"
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="12.8901234"
            />
          </Field>
          <Field label="Longitude">
            <Input
              type="text"
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="77.6789012"
            />
          </Field>
        </div>
        <div className="flex flex-col gap-1">
          <span className="mb-1 block font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
            Status
          </span>
          <Select value={status} onValueChange={(v) => setStatus(v as BranchStatusValue)}>
            <SelectTrigger aria-label="Status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {BRANCH_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {shuttingDown && editing ? (
          <ShutdownCheckPanel
            key={`${editing.id}:${checkKey}`}
            branch={editing}
            onClearChange={setShutdownClear}
          />
        ) : null}
        {status === 'temporarily_closed' && (
          <Field label="Temporary close reason">
            <Input
              type="text"
              value={temporaryCloseReason}
              onChange={(e) => setTemporaryCloseReason(e.target.value)}
              placeholder="e.g. Renovation"
            />
          </Field>
        )}
        <div className="space-y-3 rounded-cards border border-cloud-gray p-3">
          <p className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
            On invoices
          </p>
          <Field label="Legal name">
            <Input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Registered name (needed for live invoicing)"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="GSTIN">
              <Input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="29ABCDE1234F1Z5"
                maxLength={15}
                autoCapitalize="characters"
              />
            </Field>
            <Field label="Invoice prefix">
              <Input
                type="text"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                placeholder={editing ? '' : 'From the branch code'}
                maxLength={4}
                autoCapitalize="characters"
              />
            </Field>
          </div>
          <p className="font-sans text-xs text-dusty-gray">
            {previewPrefix
              ? `Invoice numbers look like ${sampleInvoiceNumber(previewPrefix)}: the prefix, the financial year and the branch's own count.`
              : 'Left empty, the prefix is the branch code, or B and the branch number when the code is longer than 4 characters.'}{' '}
            The prefix can&apos;t change once the branch has issued an invoice.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="branch-primary"
            checked={isPrimary}
            onCheckedChange={(checked) => setIsPrimary(checked === true)}
          />
          <label htmlFor="branch-primary" className="font-sans text-sm text-cocoa-dark">
            Primary branch (default selection)
          </label>
        </div>

        {formError && (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        )}

        <FormActions
          busy={busy}
          onCancel={onClose}
          submitLabel={submitLabel}
          busyLabel={shuttingDown ? 'Shutting down…' : 'Saving…'}
          submitDisabled={shuttingDown && !shutdownClear}
        />
      </form>
    </FormDialog>
  )
}

/* ── What is still open before a shutdown (R1.10) ───────────────────────── */

function ShutdownCheckPanel({
  branch,
  onClearChange,
}: {
  branch: AdminBranch
  onClearChange: (clear: boolean) => void
}) {
  const fetcher = useCallback(() => fetchShutdownCheck(branch.id), [branch.id])
  const { state, retry } = useAsyncData(fetcher)
  const clear = state.status === 'success' && state.data.clear

  // The save waits for a clear check; closing the panel withdraws it.
  useEffect(() => {
    onClearChange(clear)
  }, [clear, onClearChange])
  useEffect(() => () => onClearChange(false), [onClearChange])

  if (state.status === 'loading') {
    return (
      <p className="font-sans text-[13px] text-warm-gray" role="status">
        Checking what is still open at {branch.name}…
      </p>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-cards border border-warning/40 bg-warning/10 px-4 py-3" role="alert">
        <p className="font-sans text-[13px] text-warm-gray">
          Couldn’t check {branch.name}. {state.message}
        </p>
        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={retry}>
          Check again
        </Button>
      </div>
    )
  }

  if (state.data.clear) {
    return (
      <p className="rounded-cards border border-cloud-gray px-4 py-3 font-sans text-[13px] text-warm-gray">
        Nothing is open at {branch.name}. Once shut down, it takes no new bookings, walk-ins or
        invoices and keeps its history. An empty shut-down branch can then be deleted.
      </p>
    )
  }

  return (
    <div className="rounded-cards border border-warning/40 bg-warning/10 px-4 py-3" role="alert">
      <p className="mb-1.5 flex items-center gap-1.5 font-ui text-xs uppercase tracking-[0.5px] text-warm-gray">
        <Icon icon={TriangleAlert} decorative size={14} />
        {`Resolve these before shutting ${branch.name} down`}
      </p>
      <ul className="list-disc space-y-1 pl-4">
        {state.data.lines.map((line) => (
          <li key={line} className="font-sans text-[13px] text-cocoa-dark">
            {line}
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={retry}>
        Check again
      </Button>
    </div>
  )
}

/* ── Shared primitives ──────────────────────────────────────────────────── */

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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-cocoa-dark/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-cloud-gray bg-canvas-white shadow-elevated focus:outline-none">
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
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is provided via children (implicit label association)
    <label className="block">
      <span className="mb-1 block font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
        {label}
      </span>
      {children}
    </label>
  )
}
