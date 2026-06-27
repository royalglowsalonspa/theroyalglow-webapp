/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Settings Form
 * Scope        : Admin Portal — System settings editor
 *
 * Description  : Loads the full settings object from GET /api/settings and edits
 *                it section-by-section: a business-hours grid (per-day open/close
 *                + closed toggle), a GST card (rate + inclusive note), and a
 *                booking-rules card. Each section has its own Save button that
 *                PUTs { section, value } and shows a success confirmation.
 *
 * Responsibilities :
 * - Fetch settings (with defaults) and seed editable local state
 * - Validate-light + submit each section independently via PUT /api/settings
 * - Surface loading, error, and per-section saving/success states
 *
 * Tech Stack   : Next.js 16, React (Client Component), Tailwind
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : @rgss/types (schemas, defaults, day metadata), React hooks
 *
 * Notes        : Manager+ (edge middleware + API requireRole). Times are IST
 *                24h "HH:MM" strings; GST is price-inclusive.
 ************************************************************/

'use client'

import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import {
  type BookingRules,
  type BusinessHours,
  DAY_KEYS,
  DAY_LABELS,
  DEFAULT_BOOKING_RULES,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_GST,
  type DayKey,
  type GstSetting,
  type Settings,
} from '@rgss/types'
import { useCallback, useEffect, useId, useState } from 'react'

type Section = 'businessHours' | 'gst' | 'bookingRules'

export function SettingsForm() {
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS)
  const [gst, setGst] = useState<GstSetting>(DEFAULT_GST)
  const [bookingRules, setBookingRules] = useState<BookingRules>(DEFAULT_BOOKING_RULES)
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
      const settings = json.data.settings as Settings
      setBusinessHours(settings.businessHours)
      setGst(settings.gst)
      setBookingRules(settings.bookingRules)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Settings</h1>
        <p className="font-sans text-sm text-dusty-gray mt-0.5">
          Business hours, GST, and booking rules. Each section saves on its own.
        </p>
      </header>

      {loading ? (
        <Skeleton variant="card" rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="space-y-8">
          <BusinessHoursSection value={businessHours} onChange={setBusinessHours} />
          <GstSection value={gst} onChange={setGst} />
          <BookingRulesSection value={bookingRules} onChange={setBookingRules} />
        </div>
      )}
    </div>
  )
}

/* ── Shared save hook ───────────────────────────────────────────────────── */

// Encapsulates the PUT lifecycle for one section: busy + error + transient
// success message. Returns a `save(value)` that resolves true on success.
function useSectionSave(section: Section) {
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = useCallback(
    async (value: unknown): Promise<boolean> => {
      setBusy(true)
      setSaveError(null)
      setSaved(false)
      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ section, value }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not save changes.')
        }
        setSaved(true)
        return true
      } catch (err: unknown) {
        setSaveError(err instanceof Error ? err.message : 'Could not save changes.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [section],
  )

  return { busy, saveError, saved, save, clearSaved: () => setSaved(false) }
}

/* ── Business hours ─────────────────────────────────────────────────────── */

function BusinessHoursSection({
  value,
  onChange,
}: {
  value: BusinessHours
  onChange: (next: BusinessHours) => void
}) {
  const { busy, saveError, saved, save, clearSaved } = useSectionSave('businessHours')

  const updateDay = (day: DayKey, patch: Partial<BusinessHours[DayKey]>) => {
    clearSaved()
    onChange({ ...value, [day]: { ...value[day], ...patch } })
  }

  return (
    <SectionCard
      title="Business Hours"
      description="Opening and closing times per day (IST, 24-hour). Toggle a day closed to disable bookings."
    >
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
                      <input
                        type="time"
                        aria-label={`${DAY_LABELS[day]} opening time`}
                        value={d.open ?? ''}
                        disabled={d.closed}
                        onChange={(e) => updateDay(day, { open: e.target.value || null })}
                        className={timeInputClass}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        aria-label={`${DAY_LABELS[day]} closing time`}
                        value={d.close ?? ''}
                        disabled={d.closed}
                        onChange={(e) => updateDay(day, { close: e.target.value || null })}
                        className={timeInputClass}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <label className="inline-flex items-center gap-2 font-sans text-sm text-cocoa-dark">
                        <input
                          type="checkbox"
                          aria-label={`${DAY_LABELS[day]} closed`}
                          checked={d.closed}
                          onChange={(e) =>
                            updateDay(
                              day,
                              e.target.checked
                                ? { closed: true, open: null, close: null }
                                : {
                                    closed: false,
                                    open: d.open ?? '10:00',
                                    close: d.close ?? '21:00',
                                  },
                            )
                          }
                          className="h-4 w-4 rounded border-outline-gray text-deep-gold focus:ring-deep-gold"
                        />
                        Closed
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SectionFooter busy={busy} saved={saved} saveError={saveError} onSave={() => save(value)} />
    </SectionCard>
  )
}

/* ── GST ────────────────────────────────────────────────────────────────── */

function GstSection({
  value,
  onChange,
}: {
  value: GstSetting
  onChange: (next: GstSetting) => void
}) {
  const { busy, saveError, saved, save, clearSaved } = useSectionSave('gst')
  const rateId = useId()

  return (
    <SectionCard
      title="GST"
      description="Goods & Services Tax applied to invoices. Prices are GST-inclusive."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor={rateId} className="block">
          <span className="block font-ui text-[11px] uppercase tracking-wider text-dusty-gray mb-1">
            Rate (%)
          </span>
          <input
            id={rateId}
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={value.ratePercent}
            onChange={(e) => {
              clearSaved()
              onChange({ ...value, ratePercent: Number(e.target.value) })
            }}
            className={inputClass}
          />
        </label>
        <div className="flex items-end">
          <span className="inline-flex items-center rounded-pill bg-deep-gold/15 px-3 py-1 font-ui text-[11px] uppercase tracking-[0.5px] text-deep-gold">
            Price-inclusive
          </span>
        </div>
      </div>
      <p className="font-sans text-xs text-dusty-gray">
        All catalogue prices already include GST (back-calculated on invoices, SAC 999721).
      </p>

      <SectionFooter
        busy={busy}
        saved={saved}
        saveError={saveError}
        onSave={() => save({ ...value, inclusive: true })}
      />
    </SectionCard>
  )
}

/* ── Booking rules ──────────────────────────────────────────────────────── */

function BookingRulesSection({
  value,
  onChange,
}: {
  value: BookingRules
  onChange: (next: BookingRules) => void
}) {
  const { busy, saveError, saved, save, clearSaved } = useSectionSave('bookingRules')

  const updateField = (patch: Partial<BookingRules>) => {
    clearSaved()
    onChange({ ...value, ...patch })
  }

  return (
    <SectionCard
      title="Booking Rules"
      description="Policy limits for customer bookings. Slot length is set per service, not here."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Min advance lead time (minutes)"
          value={value.minAdvanceLeadTimeMinutes}
          min={0}
          max={10080}
          step={5}
          onChange={(n) => updateField({ minAdvanceLeadTimeMinutes: n })}
        />
        <NumberField
          label="Max advance window (days)"
          value={value.maxAdvanceBookingDays}
          min={1}
          max={365}
          step={1}
          onChange={(n) => updateField({ maxAdvanceBookingDays: n })}
        />
        <NumberField
          label="Cancellation cut-off (hours)"
          value={value.cancellationCutoffHours}
          min={0}
          max={168}
          step={1}
          onChange={(n) => updateField({ cancellationCutoffHours: n })}
        />
        <NumberField
          label="Max active bookings / customer"
          value={value.maxActiveBookingsPerCustomer}
          min={1}
          max={50}
          step={1}
          onChange={(n) => updateField({ maxActiveBookingsPerCustomer: n })}
        />
      </div>

      <SectionFooter busy={busy} saved={saved} saveError={saveError} onSave={() => save(value)} />
    </SectionCard>
  )
}

/* ── Shared primitives ──────────────────────────────────────────────────── */

const inputClass =
  'w-full px-3 py-2 rounded-buttons border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold disabled:opacity-50 disabled:cursor-not-allowed'

const timeInputClass =
  'px-3 py-2 rounded-buttons border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold disabled:opacity-50 disabled:cursor-not-allowed'

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (n: number) => void
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="block">
      <span className="block font-ui text-[11px] uppercase tracking-wider text-dusty-gray mb-1">
        {label}
      </span>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputClass}
      />
    </label>
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
  onSave,
}: {
  busy: boolean
  saved: boolean
  saveError: string | null
  onSave: () => void
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
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="h-9 px-4 rounded-buttons bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
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
