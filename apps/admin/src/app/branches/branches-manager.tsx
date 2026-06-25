/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Branches Manager
 * Scope        : Admin Portal — Branch management
 *
 * Description  : Full CRUD for physical salon/spa branches. Lists branches as
 *                cards with name, code, colour-coded status badge, address
 *                summary and contact. Create/edit via a Radix dialog covering
 *                every editable field plus the operational status select.
 *                Multi-branch-ready — any number of branches, each by id.
 *
 * Responsibilities :
 * - List branches from GET /api/branches
 * - Create/edit branches (POST /api/branches, PATCH /api/branches/[id])
 * - Surface loading / error / empty states; keep the UI accessible
 *
 * Tech Stack   : Next.js 16, React (Client Component), Radix Dialog, Tailwind
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : @radix-ui/react-dialog, @rgss/types (BRANCH_STATUSES), React
 *
 * Notes        : `code` + `number` are generated server-side and not editable.
 *                Branches are never hard-deleted — status drives lifecycle.
 ************************************************************/

'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { BRANCH_STATUSES, type BranchStatusValue } from '@rgss/types'
import { useCallback, useEffect, useState } from 'react'

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

const STATUS_BADGE: Record<BranchStatusValue, string> = {
  operational: 'bg-emerald-100 text-emerald-700',
  temporarily_closed: 'bg-amber-100 text-amber-800',
  opens_soon: 'bg-indigo-100 text-indigo-800',
  shutdown: 'bg-rose-100 text-rose-700',
}

const STATUS_LABEL: Record<BranchStatusValue, string> = {
  operational: 'Operational',
  temporarily_closed: 'Temporarily closed',
  opens_soon: 'Opens soon',
  shutdown: 'Shutdown',
}

export function BranchesManager() {
  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; editing: AdminBranch | null }>({
    open: false,
    editing: null,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/branches')
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load branches.')
      }
      setBranches(json.data.branches as AdminBranch[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load branches.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Branches</h1>
          <p className="font-sans text-sm text-dusty-gray mt-0.5">
            Physical salon &amp; spa locations. Create new branches and manage address, contact and
            operational status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ open: true, editing: null })}
          className="h-9 px-4 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
        >
          + Branch
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : branches.length === 0 ? (
        <EmptyHint>No branches yet. Click “+ Branch” to add your first location.</EmptyHint>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {branches.map((b) => (
            <li
              key={b.id}
              className="rounded-[10px] border border-cloud-gray bg-canvas-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg text-cocoa-dark tracking-tight truncate">
                    {b.name}
                    {b.isPrimary && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-deep-gold/15 px-2 py-0.5 text-[10px] font-ui uppercase tracking-[0.5px] text-deep-gold align-middle">
                        Primary
                      </span>
                    )}
                  </p>
                  <p className="font-ui text-[11px] uppercase tracking-[1px] text-dusty-gray mt-0.5">
                    {b.code} · #{b.number}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-ui ${STATUS_BADGE[b.status]}`}
                >
                  {STATUS_LABEL[b.status]}
                </span>
              </div>

              <address className="mt-3 not-italic font-sans text-sm text-warm-gray">
                {b.addressLine1}
                {b.addressLine2 ? `, ${b.addressLine2}` : ''}
                <br />
                {b.city}, {b.state} {b.pincode}
              </address>

              <dl className="mt-3 space-y-1 font-sans text-sm text-cocoa-dark">
                <div className="flex gap-2">
                  <dt className="text-dusty-gray">Phone</dt>
                  <dd>{b.phone}</dd>
                </div>
                {b.email && (
                  <div className="flex gap-2 min-w-0">
                    <dt className="text-dusty-gray">Email</dt>
                    <dd className="truncate">{b.email}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDialog({ open: true, editing: b })}
                  className="text-sm font-ui text-deep-gold hover:text-cocoa-dark transition-colors"
                >
                  Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BranchDialog
        state={dialog}
        onClose={() => setDialog({ open: false, editing: null })}
        onSaved={() => {
          setDialog({ open: false, editing: null })
          load()
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
            className="h-4 w-4 rounded border-outline-gray text-deep-gold focus:ring-deep-gold"
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-cloud-gray bg-canvas-white p-5 shadow-elevated focus:outline-none">
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
      <span className="font-sans text-sm text-dusty-gray">Loading branches…</span>
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
