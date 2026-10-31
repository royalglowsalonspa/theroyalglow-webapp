/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Tiers Manager
 * Scope        : Admin Portal — Membership Management (multi-branch R9.4)
 *
 * Description  : Lists the membership tiers and lets Receptionists and above
 *                add and edit them: name, usual hours, usual price, usual
 *                validity, active state and order. Only the Developer changes
 *                a tier's tax classification (SAC code).
 *
 * Responsibilities :
 * - Load GET /api/membership-tiers ({ tiers, canEditTax })
 * - Create (POST) and edit (PATCH /api/membership-tiers/[id]) in a side panel
 * - Retire a tier, or make it active again, from the row menu
 *
 * Features / Functionality :
 * - DataTable with usual values, SAC code and status
 * - Field errors from the API shown beside their fields
 * - Edits change later sales only; sold memberships keep their own values
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (CRUD Management Component)
 *
 * Dependencies : DataTable, SlideOverPanel, form-field, Select, Switch, state
 *                presenters, useAsyncData, @/lib/admin/memberships
 *
 * Notes        :
 * - Tiers are never deleted: memberships refer to them. Retire one instead.
 * - Usual hours or price of 0 means "agreed at the counter".
 ************************************************************/

'use client'

import { Layers, Pencil, Power } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { type AdminColumnDef, DataTable, type RowAction } from '@/components/ui/data-table'
import { Field, FormActions } from '@/components/ui/form-field'
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
import { Switch } from '@/components/ui/switch'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatINRWithPaise } from '@/lib/admin/format'
import {
  DEFAULT_MEMBERSHIP_SAC_CODE,
  hoursLabel,
  MEMBERSHIP_SALE_LIMITS,
  type MembershipTier,
  type MembershipTierList,
  paiseToRupeesText,
  REVIEWED_SAC_CODES,
  rupeesToPaise,
} from '@/lib/admin/memberships'
import { toast } from '@/lib/admin/toast'

type FieldErrors = Record<string, string[] | undefined>

// What each reviewed SAC code covers (tax-settings.md §1).
const SAC_LABELS: Record<(typeof REVIEWED_SAC_CODES)[number], string> = {
  '999721': 'Hair care and barber work',
  '999722': 'Facial, cosmetic care, manicure and pedicure',
  '999723': 'Spa, massage and physical wellbeing',
  '999729': 'Other beauty treatments',
}

function sacText(code: string): string {
  const label = SAC_LABELS[code as keyof typeof SAC_LABELS]
  return label ? `${code} · ${label}` : code
}

function usualHoursText(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? hoursLabel(hours) : 'Agreed at the counter'
}

function usualPriceText(paise: number): string {
  return paise > 0 ? formatINRWithPaise(paise) : 'Agreed at the counter'
}

async function fetchTiers(): Promise<MembershipTierList> {
  const res = await fetch('/api/membership-tiers')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load membership tiers.')
  }
  return json.data as MembershipTierList
}

// The panel opens to add a tier, or to edit one.
type PanelState = { mode: 'create' } | { mode: 'edit'; tier: MembershipTier } | null

export function TiersManager() {
  const { state, retry } = useAsyncData(fetchTiers)
  const [panel, setPanel] = useState<PanelState>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const tiers = state.status === 'success' ? state.data.tiers : []
  const canEditTax = state.status === 'success' ? state.data.canEditTax : false

  const toggleActive = useCallback(
    async (tier: MembershipTier) => {
      setActionError(null)
      try {
        const res = await fetch(`/api/membership-tiers/${tier.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ isActive: !tier.isActive }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not update this tier.')
        }
        toast.success(tier.isActive ? `${tier.name} retired` : `${tier.name} is active again`)
        retry()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not update this tier.'
        setActionError(message)
        toast.error('Could not update tier', message)
      }
    },
    [retry],
  )

  const columns = useMemo<AdminColumnDef<MembershipTier, unknown>[]>(
    () => [
      { accessorKey: 'displayOrder', header: 'Order' },
      { accessorKey: 'name', header: 'Name' },
      {
        id: 'usualHours',
        header: 'Usual hours',
        accessorFn: (t) => t.defaultHoursMinutes,
        cell: ({ row }) => usualHoursText(row.original.defaultHoursMinutes),
      },
      {
        id: 'usualPrice',
        header: 'Usual price',
        accessorFn: (t) => t.defaultPricePaise,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {usualPriceText(row.original.defaultPricePaise)}
          </span>
        ),
      },
      {
        id: 'usualValidity',
        header: 'Usual validity',
        accessorFn: (t) => t.defaultValidityDays,
        cell: ({ row }) => `${row.original.defaultValidityDays} days`,
      },
      {
        accessorKey: 'sacCode',
        header: 'SAC',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.sacCode}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (t) => (t.isActive ? 'active' : 'inactive'),
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
      },
    ],
    [],
  )

  const rowActions = useCallback(
    (tier: MembershipTier): RowAction[] => [
      { label: 'Edit', icon: Pencil, onSelect: () => setPanel({ mode: 'edit', tier }) },
      {
        label: tier.isActive ? 'Retire' : 'Make active',
        icon: Power,
        onSelect: () => toggleActive(tier),
      },
    ],
    [toggleActive],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Membership Tiers</h1>
          <p className="font-sans text-sm text-warm-gray">
            Starting values for a sale, shared by every branch. Customers never see tiers, and
            editing one changes later sales only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPanel({ mode: 'create' })}
          className="inline-flex h-9 items-center gap-1.5 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray"
        >
          + Add Tier
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
        <Skeleton variant="table" rows={4} />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : tiers.length === 0 ? (
        <EmptyState
          title="No membership tiers yet"
          message="Add a tier so a sale can start from its usual hours and price."
          icon={Layers}
        />
      ) : (
        <DataTable
          columns={columns}
          data={tiers}
          tableId="membership-tiers"
          rowActions={({ original }) => rowActions(original)}
          caption="Membership tiers with their usual hours, price, validity, tax code and status"
        />
      )}

      <TierPanel
        panel={panel}
        canEditTax={canEditTax}
        nextOrder={Math.max(0, ...tiers.map((t) => t.displayOrder)) + 1}
        onClose={() => setPanel(null)}
        onSaved={() => {
          setPanel(null)
          retry()
        }}
      />
    </div>
  )
}

// The form's text values; numbers are parsed when saving.
interface TierDraft {
  name: string
  hours: string
  price: string
  validityDays: string
  displayOrder: string
  isActive: boolean
  sacCode: string
}

function draftFor(panel: PanelState, nextOrder: number): TierDraft {
  if (panel?.mode === 'edit') {
    const { tier } = panel
    return {
      name: tier.name,
      hours: String(Math.floor(tier.defaultHoursMinutes / 60)),
      price: paiseToRupeesText(tier.defaultPricePaise),
      validityDays: String(tier.defaultValidityDays),
      displayOrder: String(tier.displayOrder),
      isActive: tier.isActive,
      sacCode: tier.sacCode,
    }
  }
  return {
    name: '',
    hours: '',
    price: '',
    validityDays: '90',
    displayOrder: String(nextOrder),
    isActive: true,
    sacCode: DEFAULT_MEMBERSHIP_SAC_CODE,
  }
}

function wholeNumber(text: string, min: number, max: number): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) {
    return null
  }
  const value = Number(trimmed)
  return value >= min && value <= max ? value : null
}

// The tier fields as the API takes them, or the first problem with the draft.
function parseDraft(
  draft: TierDraft,
):
  | { ok: true; values: Record<string, string | number | boolean> }
  | { ok: false; field: string; message: string } {
  const name = draft.name.trim()
  if (name.length === 0 || name.length > 60) {
    return { ok: false, field: 'name', message: 'Name the tier (up to 60 characters).' }
  }
  const usualHours = draft.hours.trim() === '' ? 0 : wholeNumber(draft.hours, 0, 500)
  if (usualHours === null) {
    return { ok: false, field: 'usualHours', message: 'Usual hours are whole hours, 0 to 500.' }
  }
  const usualPricePaise = draft.price.trim() === '' ? 0 : rupeesToPaise(draft.price)
  if (usualPricePaise === null || usualPricePaise > MEMBERSHIP_SALE_LIMITS.maxPricePaise) {
    return { ok: false, field: 'usualPricePaise', message: 'Enter the usual price in rupees.' }
  }
  const usualValidityDays = wholeNumber(
    draft.validityDays,
    1,
    MEMBERSHIP_SALE_LIMITS.maxValidityDays,
  )
  if (usualValidityDays === null) {
    return {
      ok: false,
      field: 'usualValidityDays',
      message: `Usual validity is 1 to ${MEMBERSHIP_SALE_LIMITS.maxValidityDays} days.`,
    }
  }
  const displayOrder = wholeNumber(draft.displayOrder, 0, 999)
  if (displayOrder === null) {
    return { ok: false, field: 'displayOrder', message: 'Order is a whole number, 0 to 999.' }
  }
  return {
    ok: true,
    values: {
      name,
      usualHours,
      usualPricePaise,
      usualValidityDays,
      displayOrder,
      isActive: draft.isActive,
      sacCode: draft.sacCode,
    },
  }
}

// The fields that differ from the tier being edited, as the PATCH body.
function changedValues(
  tier: MembershipTier,
  values: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const current: Record<string, string | number | boolean> = {
    name: tier.name,
    usualHours: Math.floor(tier.defaultHoursMinutes / 60),
    usualPricePaise: tier.defaultPricePaise,
    usualValidityDays: tier.defaultValidityDays,
    displayOrder: tier.displayOrder,
    isActive: tier.isActive,
    sacCode: tier.sacCode,
  }
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => current[key] !== value))
}

function TierPanel({
  panel,
  canEditTax,
  nextOrder,
  onClose,
  onSaved,
}: {
  panel: PanelState
  canEditTax: boolean
  nextOrder: number
  onClose: () => void
  onSaved: () => void
}) {
  const fieldId = useId()
  const [draft, setDraft] = useState<TierDraft>(() => draftFor(panel, nextOrder))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  // A fresh draft each time the panel opens, for a new tier or the one chosen.
  useEffect(() => {
    if (panel) {
      setDraft(draftFor(panel, nextOrder))
      setFormError(null)
      setFieldErrors({})
    }
  }, [panel, nextOrder])

  const set = useCallback(<K extends keyof TierDraft>(key: K, value: TierDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }, [])

  const editing = panel?.mode === 'edit' ? panel.tier : null

  const save = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setFormError(null)
      setFieldErrors({})
      const parsed = parseDraft(draft)
      if (!parsed.ok) {
        setFieldErrors({ [parsed.field]: [parsed.message] })
        return
      }
      // Only the Developer sends a tax classification (MS-18).
      const values = canEditTax
        ? parsed.values
        : Object.fromEntries(Object.entries(parsed.values).filter(([key]) => key !== 'sacCode'))
      const body = editing ? changedValues(editing, values) : values
      if (editing && Object.keys(body).length === 0) {
        onClose()
        return
      }

      setSaving(true)
      try {
        const res = await fetch(
          editing ? `/api/membership-tiers/${editing.id}` : '/api/membership-tiers',
          {
            method: editing ? 'PATCH' : 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
        )
        const json = await res.json()
        if (!res.ok || !json.success) {
          if (json?.error?.details) {
            setFieldErrors(json.error.details as FieldErrors)
          }
          throw new Error(json?.error?.message ?? 'Could not save this tier.')
        }
        toast.success(editing ? `${values.name} saved` : `${values.name} added`)
        onSaved()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not save this tier.'
        setFormError(message)
        toast.error('Could not save tier', message)
      } finally {
        setSaving(false)
      }
    },
    [draft, canEditTax, editing, onClose, onSaved],
  )

  const fieldError = (key: string) => fieldErrors[key]?.join(' ') ?? null

  return (
    <SlideOverPanel
      open={panel !== null}
      onOpenChange={(open) => !open && onClose()}
      title={editing ? `Edit ${editing.name}` : 'Add tier'}
      description="Usual values prefill a sale; the hours and price are agreed at the counter."
    >
      <form onSubmit={save} className="space-y-4" noValidate>
        <Field label="Name" htmlFor={`${fieldId}-name`} error={fieldError('name')} required>
          <Input
            id={`${fieldId}-name`}
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={60}
            aria-invalid={Boolean(fieldErrors.name?.length)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Usual hours"
            htmlFor={`${fieldId}-hours`}
            hint="0 to agree the hours at the counter."
            error={fieldError('usualHours')}
          >
            <Input
              id={`${fieldId}-hours`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MEMBERSHIP_SALE_LIMITS.maxHours}
              step={1}
              value={draft.hours}
              onChange={(e) => set('hours', e.target.value)}
              aria-invalid={Boolean(fieldErrors.usualHours?.length)}
            />
          </Field>
          <Field
            label="Usual price (₹, GST-inclusive)"
            htmlFor={`${fieldId}-price`}
            hint="0 to agree the price at the counter."
            error={fieldError('usualPricePaise')}
          >
            <Input
              id={`${fieldId}-price`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.price}
              onChange={(e) => set('price', e.target.value)}
              aria-invalid={Boolean(fieldErrors.usualPricePaise?.length)}
            />
          </Field>
          <Field
            label="Usual validity (days)"
            htmlFor={`${fieldId}-validity`}
            error={fieldError('usualValidityDays')}
            required
          >
            <Input
              id={`${fieldId}-validity`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MEMBERSHIP_SALE_LIMITS.maxValidityDays}
              step={1}
              value={draft.validityDays}
              onChange={(e) => set('validityDays', e.target.value)}
              aria-invalid={Boolean(fieldErrors.usualValidityDays?.length)}
            />
          </Field>
          <Field
            label="Order"
            htmlFor={`${fieldId}-order`}
            hint="Lower numbers come first in the sale form."
            error={fieldError('displayOrder')}
          >
            <Input
              id={`${fieldId}-order`}
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              step={1}
              value={draft.displayOrder}
              onChange={(e) => set('displayOrder', e.target.value)}
              aria-invalid={Boolean(fieldErrors.displayOrder?.length)}
            />
          </Field>
        </div>

        <Field
          label="Tax classification (SAC)"
          htmlFor={`${fieldId}-sac`}
          hint={
            canEditTax
              ? 'Provisional until the tax review.'
              : "Only the Developer changes a tier's tax classification."
          }
          error={fieldError('sacCode')}
        >
          <Select
            value={draft.sacCode}
            onValueChange={(v) => set('sacCode', v)}
            disabled={!canEditTax}
          >
            <SelectTrigger id={`${fieldId}-sac`} className="w-full">
              <SelectValue>{sacText(draft.sacCode)}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {REVIEWED_SAC_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {sacText(code)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <div className="flex items-center gap-3">
          <Switch
            id={`${fieldId}-active`}
            checked={draft.isActive}
            onCheckedChange={(checked) => set('isActive', checked)}
          />
          <label
            htmlFor={`${fieldId}-active`}
            className="cursor-pointer font-sans text-sm text-cocoa-dark"
          >
            Offered in the sale form
          </label>
        </div>

        {formError ? (
          <p className="font-sans text-sm text-error" role="alert">
            {formError}
          </p>
        ) : null}

        <FormActions
          busy={saving}
          onCancel={onClose}
          submitLabel={editing ? 'Save Tier' : 'Add Tier'}
        />
      </form>
    </SlideOverPanel>
  )
}
