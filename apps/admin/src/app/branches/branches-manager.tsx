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
 * - List branches from GET /api/branches via useAsyncData
 * - Create/edit branches (POST /api/branches, PATCH /api/branches/[id])
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
 *                Branches are never hard-deleted — status drives lifecycle.
 *                Presentation-layer only — no API / RBAC / data-model changes.
 *                Uses ONLY semantic Brand-Token utilities (Req 1.2).
 *                Requirements 17.1–17.7.
 ************************************************************/

'use client'

import { DataTable } from '@/components/ui/data-table'
import { type ColumnToggle, FilterBar } from '@/components/ui/filter-bar'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import * as Dialog from '@radix-ui/react-dialog'
import { BRANCH_STATUSES, type BranchStatusValue } from '@rgss/types'
import type { ColumnDef, VisibilityState } from '@tanstack/react-table'
import { Building2, Pencil } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

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

async function fetchBranches(): Promise<AdminBranch[]> {
  const res = await fetch('/api/branches')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load branches.')
  }
  return json.data.branches as AdminBranch[]
}

export function BranchesManager() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [dialog, setDialog] = useState<{ open: boolean; editing: AdminBranch | null }>({
    open: false,
    editing: null,
  })

  const fetcher = useCallback(() => fetchBranches(), [])
  const { state, retry } = useAsyncData(fetcher)

  const branches = state.status === 'success' ? state.data : []

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

  const columns = useMemo<ColumnDef<AdminBranch, unknown>[]>(
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
            Physical salon &amp; spa locations. Create new branches and manage address, contact and
            operational status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ open: true, editing: null })}
          className="h-9 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray"
        >
          + Branch
        </button>
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
              ? 'Click “+ Branch” to add your first location.'
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
          rowActions={(row) => [
            {
              label: 'Edit',
              icon: Pencil,
              onSelect: () => setDialog({ open: true, editing: row.original }),
            },
          ]}
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
    </div>
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
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Seed the form whenever the dialog opens (edit → row values; create → defaults).
  useEffect(() => {
    if (!state.open) {
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
    }
    setFormError(null)
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

      const res = await fetch(editing ? `/api/branches/${editing.id}` : '/api/branches', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
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
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Rayasandra"
            required
          />
        </Field>
        <Field label="Address line 1">
          <input
            type="text"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            className={inputClass}
            placeholder="Street, building"
            required
          />
        </Field>
        <Field label="Address line 2">
          <input
            type="text"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            className={inputClass}
            placeholder="Area, landmark (optional)"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pincode">
            <input
              type="text"
              inputMode="numeric"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              className={inputClass}
              placeholder="560100"
              required
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="+91 80 1234 5678"
              required
            />
          </Field>
        </div>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="branch@theroyalglow.in (optional)"
          />
        </Field>
        <Field label="Google Maps URL">
          <input
            type="url"
            value={googleMapsUrl}
            onChange={(e) => setGoogleMapsUrl(e.target.value)}
            className={inputClass}
            placeholder="https://maps.app.goo.gl/… (optional)"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input
              type="text"
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className={inputClass}
              placeholder="12.8901234"
            />
          </Field>
          <Field label="Longitude">
            <input
              type="text"
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className={inputClass}
              placeholder="77.6789012"
            />
          </Field>
        </div>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as BranchStatusValue)}
            className={inputClass}
          >
            {BRANCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        {status === 'temporarily_closed' && (
          <Field label="Temporary close reason">
            <input
              type="text"
              value={temporaryCloseReason}
              onChange={(e) => setTemporaryCloseReason(e.target.value)}
              className={inputClass}
              placeholder="e.g. Renovation"
            />
          </Field>
        )}
        <label className="flex items-center gap-2 font-sans text-sm text-cocoa-dark">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="h-4 w-4 rounded-cards border-outline-gray text-deep-gold focus:ring-deep-gold"
          />
          Primary branch (default selection)
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

/* ── Shared primitives ──────────────────────────────────────────────────── */

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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-cocoa-dark/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-cloud-gray bg-canvas-white p-5 shadow-elevated focus:outline-none">
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
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is provided via children (implicit label association)
    <label className="block">
      <span className="mb-1 block font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
        {label}
      </span>
      {children}
    </label>
  )
}
