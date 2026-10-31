/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Settings Form
 * Scope        : Admin Portal — Branch booking settings, invoicing, settlement
 *
 * Description  : Loads GET /api/settings and edits it section by section: the
 *                active branch's business hours and booking rules (each save
 *                becomes the branch's next settings revision, R6.3), and the
 *                settings every branch shares: the invoicing switch and the
 *                cross-branch settlement share and value per gem (R10). Shows
 *                the current revision, who saved it, and the recent history.
 *
 * Responsibilities :
 * - Fetch the active branch's settings and seed editable local state
 * - Save each section on its own via PUT /api/settings; a branch section
 *   names the branch and the revision it was edited from
 * - Say when someone saved since the page loaded, or the branch was switched,
 *   and offer a reload instead of overwriting
 * - Flag a section that is missing or unreadable: the branch takes no
 *   bookings until it is saved
 *
 * Tech Stack   : Next.js 16, React (Client Component), Tailwind
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : @rgss/types (schemas, defaults, day metadata), React hooks,
 *                @/lib/admin/format
 *
 * Notes        : Developer only (edge middleware + API). Times are IST 24h
 *                "HH:MM" strings. GST rates are per branch (Tax screen).
 ************************************************************/

'use client'

import {
  type BookingRules,
  type BranchSettingSection,
  type BranchSettingsRevisionView,
  type BranchSettingsView,
  type BusinessHours,
  DAY_KEYS,
  DAY_LABELS,
  type DayKey,
  DEFAULT_BOOKING_RULES,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_INVOICING,
  DEFAULT_SETTLEMENT,
  type InvoicingSetting,
  type SettlementSetting,
} from '@rgss/types'
import Link from 'next/link'
import { useCallback, useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { Switch } from '@/components/ui/switch'
import { TimeSelect } from '@/components/ui/time-select'
import { formatDateTimeIST } from '@/lib/admin/format'
import { toast } from '@/lib/admin/toast'

/** GET /api/settings. */
export interface SettingsScreenData {
  branch: BranchSettingsView
  history: BranchSettingsRevisionView[]
  invoicing: InvoicingSetting
  /** Null when the stored value can't be read: save it again. */
  settlement: SettlementSetting | null
}

/** What a branch section save returns: the branch's new revision. */
type BranchSaved = Pick<SettingsScreenData, 'branch' | 'history'>

export const SECTION_LABELS: Record<BranchSettingSection, string> = {
  businessHours: 'Business hours',
  bookingRules: 'Booking rules',
}

// Errors that mean the page is out of date: reload rather than retry.
const RELOAD_CODES = new Set(['SETTINGS_CHANGED', 'BRANCH_CONTEXT_CHANGED'])

/** "Revision 3, saved 30/10/2026, 02:05 PM by Asha", or how it was set up. */
export function revisionLine(view: {
  revision: number
  savedAt: string | null
  savedByName: string | null
}): string {
  if (view.revision === 0 || view.savedAt === null) {
    return 'No settings saved yet.'
  }
  const when = formatDateTimeIST(view.savedAt)
  return view.savedByName
    ? `Revision ${view.revision}, saved ${when} by ${view.savedByName}`
    : `Revision ${view.revision}, set up ${when}`
}

export function SettingsForm() {
  const [data, setData] = useState<SettingsScreenData | null>(null)
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS)
  const [bookingRules, setBookingRules] = useState<BookingRules>(DEFAULT_BOOKING_RULES)
  const [invoicing, setInvoicing] = useState<InvoicingSetting>(DEFAULT_INVOICING)
  const [settlement, setSettlement] = useState<SettlementSetting>(DEFAULT_SETTLEMENT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings')
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load settings.')
      }
      const next = json.data as SettingsScreenData
      setData(next)
      // A section that can't be read starts from the standard values, and
      // says so; nothing is saved until the Developer saves it.
      setBusinessHours(next.branch.businessHours ?? DEFAULT_BUSINESS_HOURS)
      setBookingRules(next.branch.bookingRules ?? DEFAULT_BOOKING_RULES)
      setInvoicing(next.invoicing)
      setSettlement(next.settlement ?? DEFAULT_SETTLEMENT)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // A branch save is the branch's new revision: later saves start from it.
  const onBranchSaved = useCallback((saved: BranchSaved) => {
    setData((prev) => (prev ? { ...prev, branch: saved.branch, history: saved.history } : prev))
  }, [])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Settings</h1>
        <p className="font-sans text-sm text-dusty-gray mt-0.5">
          {data
            ? `Booking settings for ${data.branch.branchName}, and invoicing and settlement for every branch. Each section saves on its own.`
            : 'Booking settings for the active branch, and invoicing and settlement for every branch.'}
        </p>
        {data && (
          <p className="font-sans text-xs text-dusty-gray mt-1" data-testid="settings-revision">
            {revisionLine(data.branch)}
          </p>
        )}
      </header>

      {loading ? (
        <Skeleton variant="card" rows={3} />
      ) : error || !data ? (
        <ErrorState message={error ?? 'Could not load settings.'} onRetry={load} />
      ) : (
        <div className="space-y-8">
          <BusinessHoursSection
            branch={data.branch}
            value={businessHours}
            onChange={setBusinessHours}
            onSaved={onBranchSaved}
            onReload={load}
          />
          <BookingRulesSection
            branch={data.branch}
            value={bookingRules}
            onChange={setBookingRules}
            onSaved={onBranchSaved}
            onReload={load}
          />
          <InvoicingSection value={invoicing} onChange={setInvoicing} />
          <SettlementSection
            value={settlement}
            unreadable={data.settlement === null}
            onChange={setSettlement}
          />
          <HistorySection branchName={data.branch.branchName} history={data.history} />
        </div>
      )}
    </div>
  )
}

/* ── Shared save hook ───────────────────────────────────────────────────── */

// The PUT lifecycle for one section: busy, error, whether the page is out of
// date, and a transient success message. `save(body)` resolves to the
// response data on success, else null.
function useSectionSave() {
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = useCallback(async (body: Record<string, unknown>): Promise<unknown> => {
    setBusy(true)
    setSaveError(null)
    setStale(false)
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        const code: unknown = json?.error?.code
        if (typeof code === 'string' && RELOAD_CODES.has(code)) {
          setStale(true)
        }
        throw new Error(json?.error?.message ?? 'Could not save changes.')
      }
      setSaved(true)
      toast.success('Settings saved')
      return json.data
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not save changes.'
      setSaveError(message)
      toast.error('Could not save settings', message)
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  return { busy, saveError, stale, saved, save, clearSaved: () => setSaved(false) }
}

type BranchSectionProps<T> = {
  branch: BranchSettingsView
  value: T
  onChange: (next: T) => void
  onSaved: (saved: BranchSaved) => void
  onReload: () => void
}

// Saves one branch section from the revision the page holds.
function useBranchSectionSave(
  section: BranchSettingSection,
  branch: BranchSettingsView,
  onSaved: (saved: BranchSaved) => void,
) {
  const state = useSectionSave()
  const { save } = state
  const saveValue = useCallback(
    async (value: BusinessHours | BookingRules) => {
      const data = await save({
        section,
        branchId: branch.branchId,
        expectedRevision: branch.revision,
        value,
      })
      if (data) {
        onSaved(data as BranchSaved)
      }
    },
    [save, section, branch.branchId, branch.revision, onSaved],
  )
  return { ...state, saveValue }
}

/** A branch section that is missing or can't be read. */
function UnreadableNotice({ branchName, what }: { branchName: string; what: string }) {
  return (
    <p className="font-sans text-sm text-error" role="alert">
      {branchName}&apos;s {what} are missing or can&apos;t be read, so it isn&apos;t taking
      bookings. The standard {what} are filled in below: check them and save.
    </p>
  )
}

/* ── Business hours ─────────────────────────────────────────────────────── */

function BusinessHoursSection({
  branch,
  value,
  onChange,
  onSaved,
  onReload,
}: BranchSectionProps<BusinessHours>) {
  const { busy, saveError, stale, saved, saveValue, clearSaved } = useBranchSectionSave(
    'businessHours',
    branch,
    onSaved,
  )

  const updateDay = (day: DayKey, patch: Partial<BusinessHours[DayKey]>) => {
    clearSaved()
    onChange({ ...value, [day]: { ...value[day], ...patch } })
  }

  return (
    <SectionCard
      title={`Business hours at ${branch.branchName}`}
      description="Opening and closing times per day (IST, 24-hour). Customers book within them; toggle a day closed to take no bookings that weekday."
    >
      {branch.businessHours === null && (
        <UnreadableNotice branchName={branch.branchName} what="business hours" />
      )}
      <div className="border border-cloud-gray rounded-cards overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cloud-gray/60">
                <Th>Day</Th>
                <Th>Opens</Th>
                <Th>Closes</Th>
                <Th>Closed</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud-gray">
              {DAY_KEYS.map((day) => {
                const d = value[day]
                return (
                  <tr key={day} className="hover:bg-cloud-gray/30 transition-colors">
                    <td className="px-4 py-3 font-sans text-cocoa-dark whitespace-nowrap">
                      {DAY_LABELS[day]}
                    </td>
                    <td className="px-4 py-2">
                      <TimeSelect
                        ariaLabel={`${DAY_LABELS[day]} opening time`}
                        value={d.open ?? ''}
                        disabled={d.closed}
                        onChange={(v) => updateDay(day, { open: v })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <TimeSelect
                        ariaLabel={`${DAY_LABELS[day]} closing time`}
                        value={d.close ?? ''}
                        disabled={d.closed}
                        onChange={(v) => updateDay(day, { close: v })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="inline-flex items-center gap-2">
                        <Checkbox
                          id={`closed-${day}`}
                          aria-label={`${DAY_LABELS[day]} closed`}
                          checked={d.closed}
                          onCheckedChange={(checked) =>
                            updateDay(
                              day,
                              checked === true
                                ? { closed: true, open: null, close: null }
                                : {
                                    closed: false,
                                    open: d.open ?? '10:00',
                                    close: d.close ?? '21:00',
                                  },
                            )
                          }
                        />
                        <Label
                          htmlFor={`closed-${day}`}
                          className="font-sans text-sm text-cocoa-dark"
                        >
                          Closed
                        </Label>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SectionFooter
        busy={busy}
        saved={saved}
        saveError={saveError}
        stale={stale}
        onSave={() => saveValue(value)}
        onReload={onReload}
      />
    </SectionCard>
  )
}

/* ── Booking rules ──────────────────────────────────────────────────────── */

function BookingRulesSection({
  branch,
  value,
  onChange,
  onSaved,
  onReload,
}: BranchSectionProps<BookingRules>) {
  const { busy, saveError, stale, saved, saveValue, clearSaved } = useBranchSectionSave(
    'bookingRules',
    branch,
    onSaved,
  )

  const updateField = (patch: Partial<BookingRules>) => {
    clearSaved()
    onChange({ ...value, ...patch })
  }

  return (
    <SectionCard
      title={`Booking rules at ${branch.branchName}`}
      description="Limits for customers booking online at this branch. Slot length is set per service, not here; walk-ins at the counter only follow the business hours."
    >
      {branch.bookingRules === null && (
        <UnreadableNotice branchName={branch.branchName} what="booking rules" />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Lead time (minutes)"
          hint="Customers book at least this long before the appointment."
          value={value.minAdvanceLeadTimeMinutes}
          min={0}
          max={10080}
          step={5}
          onChange={(n) => updateField({ minAdvanceLeadTimeMinutes: n })}
        />
        <NumberField
          label="Booking window (days)"
          hint="How far ahead customers can book."
          value={value.maxAdvanceBookingDays}
          min={1}
          max={365}
          step={1}
          onChange={(n) => updateField({ maxAdvanceBookingDays: n })}
        />
        <NumberField
          label="Late cancellation within (hours)"
          hint="Cancelling closer to the appointment is still allowed and never charged, but it is counted on the customer's record."
          value={value.cancellationCutoffHours}
          min={0}
          max={168}
          step={1}
          onChange={(n) => updateField({ cancellationCutoffHours: n })}
        />
        <NumberField
          label="Upcoming bookings per customer"
          hint="Pending and confirmed bookings one customer can hold at this branch."
          value={value.maxActiveBookingsPerCustomer}
          min={1}
          max={50}
          step={1}
          onChange={(n) => updateField({ maxActiveBookingsPerCustomer: n })}
        />
        <NumberField
          label="Reschedule cut-off (hours)"
          hint="Customers reschedule at least this long before the appointment."
          value={value.rescheduleCutoffHours}
          min={0}
          max={168}
          step={1}
          onChange={(n) => updateField({ rescheduleCutoffHours: n })}
        />
        <NumberField
          label="Reschedules per booking"
          hint="After this many, the customer cancels and books again."
          value={value.maxReschedulesPerBooking}
          min={0}
          max={10}
          step={1}
          onChange={(n) => updateField({ maxReschedulesPerBooking: n })}
        />
      </div>

      <SectionFooter
        busy={busy}
        saved={saved}
        saveError={saveError}
        stale={stale}
        onSave={() => saveValue(value)}
        onReload={onReload}
      />
    </SectionCard>
  )
}

/* ── Invoicing ──────────────────────────────────────────────────────────── */

// GST rates are not a setting: each branch has its own effective-dated rates
// per SAC code on the Tax screen (multi-branch R6.4). This section only
// switches invoices from test to live after the launch tax review (TX-08),
// for every branch at once.
function InvoicingSection({
  value,
  onChange,
}: {
  value: InvoicingSetting
  onChange: (next: InvoicingSetting) => void
}) {
  const { busy, saveError, saved, save, clearSaved } = useSectionSave()
  const switchId = useId()

  return (
    <SectionCard
      title="Invoicing (all branches)"
      description="GST rates are set per branch and SAC code on the Tax screen. Prices include GST."
    >
      <div className="flex items-start gap-3">
        <Switch
          id={switchId}
          checked={value.live}
          onCheckedChange={(checked) => {
            clearSaved()
            onChange({ live: checked })
          }}
        />
        <div className="space-y-1">
          <Label htmlFor={switchId} className="cursor-pointer font-sans text-sm text-cocoa-dark">
            Live invoicing
          </Label>
          <p className="font-sans text-xs text-dusty-gray">
            {value.live
              ? 'Invoices are real. A branch invoices only once it has its legal name, GSTIN and reviewed tax rates.'
              : 'Test invoicing: invoices may use provisional rates and say so. Switch on after the launch tax review.'}
          </p>
        </div>
      </div>
      <p className="font-sans text-xs text-dusty-gray">
        <Link href="/settings/tax" className="text-deep-gold hover:text-cocoa-dark">
          Tax rates for the active branch →
        </Link>
      </p>

      <SectionFooter
        busy={busy}
        saved={saved}
        saveError={saveError}
        stale={false}
        onSave={() => save({ section: 'invoicing', value })}
      />
    </SectionCard>
  )
}

/* ── Settlement ─────────────────────────────────────────────────────────── */

// What branches owe each other when a member uses hours, or a customer spends
// gems, at a branch other than the one that sold the membership or issued the
// gems (multi-branch R10). One setting for every pair of branches; each entry
// keeps the values it was recorded with, so a change affects later entries
// only (ST-05).
function SettlementSection({
  value,
  unreadable,
  onChange,
}: {
  value: SettlementSetting
  unreadable: boolean
  onChange: (next: SettlementSetting) => void
}) {
  const { busy, saveError, saved, save, clearSaved } = useSectionSave()

  const update = (patch: Partial<SettlementSetting>) => {
    clearSaved()
    onChange({ ...value, ...patch })
  }

  return (
    <SectionCard
      title="Settlement between branches (all branches)"
      description="When a member uses their hours, or a customer spends gems, at another branch, the branch that sold the membership or issued the gems owes the branch that delivered the service. Statements close monthly; changes apply to entries recorded from now on."
    >
      {unreadable && (
        <p className="font-sans text-sm text-error" role="alert">
          The saved settlement settings can&apos;t be read, so sessions and gems at other branches
          can&apos;t be recorded. These are the standard values; save them to fix it.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Share for the delivering branch (%)"
          hint="Of a membership session's value without GST, or of the gems' value. 100% passes on the whole amount."
          value={value.shareBps / 100}
          min={0}
          max={100}
          step={0.01}
          onChange={(n) => update({ shareBps: Math.round(n * 100) })}
        />
        <NumberField
          label="Value of one gem (₹)"
          hint="What one gem spent at another branch is worth. Customers earn 1 gem per ₹100, so ₹1.00 keeps it a 1% reward."
          value={value.gemValuePaise / 100}
          min={0.01}
          max={1000}
          step={0.01}
          onChange={(n) => update({ gemValuePaise: Math.round(n * 100) })}
        />
      </div>
      <p className="font-sans text-xs text-dusty-gray">
        <Link href="/settlements" className="text-deep-gold hover:text-cocoa-dark">
          Statements between branches →
        </Link>
      </p>

      <SectionFooter
        busy={busy}
        saved={saved}
        saveError={saveError}
        stale={false}
        onSave={() => save({ section: 'settlement', value })}
      />
    </SectionCard>
  )
}

/* ── History ────────────────────────────────────────────────────────────── */

function HistorySection({
  branchName,
  history,
}: {
  branchName: string
  history: BranchSettingsRevisionView[]
}) {
  return (
    <SectionCard
      title="History"
      description={`Every save is a new revision of ${branchName}'s settings. Bookings keep the revision that decided them.`}
    >
      {history.length === 0 ? (
        <p className="font-sans text-sm text-dusty-gray">No revisions yet.</p>
      ) : (
        <ol className="divide-y divide-cloud-gray border border-cloud-gray rounded-cards">
          {history.map((entry) => (
            <li
              key={entry.revision}
              className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5"
            >
              <span className="font-sans text-sm text-cocoa-dark">
                <span>Revision {entry.revision}</span>
                <span className="text-dusty-gray">
                  {' · '}
                  {entry.section ? SECTION_LABELS[entry.section] : 'All settings, set up'}
                </span>
              </span>
              <span className="font-sans text-xs text-dusty-gray">
                {formatDateTimeIST(entry.savedAt)}
                {entry.savedByName ? ` · ${entry.savedByName}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  )
}

/* ── Shared primitives ──────────────────────────────────────────────────── */

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  onChange: (n: number) => void
}) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  )
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4 border border-cloud-gray rounded-cards bg-canvas-white p-5">
      <div>
        <h2 className="font-display text-lg text-cocoa-dark tracking-tight">{title}</h2>
        <p className="font-sans text-sm text-dusty-gray mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  )
}

function SectionFooter({
  busy,
  saved,
  saveError,
  stale,
  onSave,
  onReload,
}: {
  busy: boolean
  saved: boolean
  saveError: string | null
  stale: boolean
  onSave: () => void
  onReload?: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-3 pt-1">
      {saveError && (
        <p className="mr-auto font-sans text-sm text-error" role="alert">
          {saveError}
        </p>
      )}
      {saved && !saveError && (
        <output className="mr-auto font-sans text-sm text-success" aria-live="polite">
          Saved.
        </output>
      )}
      {stale && onReload ? (
        <Button type="button" variant="outline" onClick={onReload}>
          Reload settings
        </Button>
      ) : (
        <Button type="button" onClick={onSave} disabled={busy} aria-busy={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      )}
    </div>
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
