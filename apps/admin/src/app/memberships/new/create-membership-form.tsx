/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Create Membership Form
 * Scope        : Admin Portal — Membership Management
 *
 * Description  : Multi-section form for creating new SPA memberships.
 *                Includes customer search, tier selection, editable
 *                details, payment method, and side-effects preview.
 *
 * Responsibilities :
 * - Debounced customer search against admin customers API
 * - Tier card selection with auto-prefill of hours/price/validity
 * - Validate and submit membership creation with payment method
 *
 * Features / Functionality :
 * - Customer search with live results and selection state
 * - Tier radio-card group with overridable prefilled values
 * - Expiry preview calculation and payment method selection
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Form Component)
 *
 * Dependencies : admin memberships lib, next/link, next/navigation, React hooks
 *
 * Notes        :
 * - Hours/price are collected in human units and converted to minutes/paise at submit
 ************************************************************/

'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import {
  type CustomerSearchRow,
  MEMBERSHIP_PAYMENT_METHODS,
  type MembershipPaymentMethod,
  type MembershipTier,
  formatINR,
  previewExpiryDDMMYYYY,
  todayISTDateString,
} from '@/lib/admin/memberships'
import { toast } from '@/lib/admin/toast'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

export function CreateMembershipForm() {
  const router = useRouter()
  const fieldId = useId()

  const [tiers, setTiers] = useState<MembershipTier[] | null>(null)
  const [tiersError, setTiersError] = useState<string | null>(null)

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchRow | null>(null)
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null)

  // Editable inputs. `hours` and `price` are collected in human units (hours,
  // rupees) and converted to minutes/paise once at submit time.
  const [hours, setHours] = useState('')
  const [price, setPrice] = useState('')
  const [validityDays, setValidityDays] = useState('')
  const [startDate, setStartDate] = useState(() => todayISTDateString())
  const [paymentMethod, setPaymentMethod] = useState<MembershipPaymentMethod>('cash')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Load tier cards once.
  useEffect(() => {
    let active = true
    fetch('/api/membership-tiers')
      .then((res) => res.json())
      .then((json) => {
        if (!active) {
          return
        }
        if (json?.success) {
          setTiers(json.data as MembershipTier[])
        } else {
          setTiersError(json?.error?.message ?? 'Could not load tiers.')
        }
      })
      .catch(() => {
        if (active) {
          setTiersError('Could not load tiers.')
        }
      })
    return () => {
      active = false
    }
  }, [])

  // Selecting a tier prefills hours/price/validity (all overridable afterwards).
  const selectTier = useCallback((tier: MembershipTier) => {
    setSelectedTierId(tier.id)
    setHours(String(tier.defaultHoursMinutes / 60))
    setPrice(String(Math.round(tier.defaultPricePaise / 100)))
    setValidityDays(String(tier.defaultValidityDays))
  }, [])

  const hoursNum = Number(hours)
  const priceNum = Number(price)
  const validityNum = Number(validityDays)

  const expiryPreview = previewExpiryDDMMYYYY(startDate, validityNum)

  const canSubmit =
    Boolean(selectedCustomer) &&
    Boolean(selectedTierId) &&
    Number.isFinite(hoursNum) &&
    hoursNum > 0 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    Number.isFinite(validityNum) &&
    validityNum > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(startDate)

  const submit = useCallback(async () => {
    if (!(selectedCustomer && selectedTierId) || !canSubmit) {
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/memberships', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          tierId: selectedTierId,
          hoursMinutes: Math.round(hoursNum * 60),
          pricePaise: Math.round(priceNum * 100),
          startDate,
          validityDays: Math.round(validityNum),
          paymentMethod,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not create this membership.')
      }
      toast.success('Membership created')
      router.push(`/memberships/${json.data.membership.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not create this membership.'
      setSubmitError(message)
      toast.error('Could not create membership', message)
      setSubmitting(false)
    }
  }, [
    selectedCustomer,
    selectedTierId,
    canSubmit,
    hoursNum,
    priceNum,
    validityNum,
    startDate,
    paymentMethod,
    notes,
    router,
  ])

  return (
    <div className="space-y-5 max-w-2xl">
      <BackLink />

      <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">
        Create SPA Membership
      </h1>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {/* Customer search */}
        <Section title="Customer">
          <CustomerSearch selected={selectedCustomer} onSelect={setSelectedCustomer} />
        </Section>

        {/* Tier cards */}
        <Section title="Select Tier">
          {tiersError ? (
            <p className="text-sm text-error font-sans" role="alert">
              {tiersError}
            </p>
          ) : tiers === null ? (
            <p className="text-sm text-dusty-gray font-sans">Loading tiers…</p>
          ) : (
            <div
              className="grid gap-3 sm:grid-cols-3"
              role="radiogroup"
              aria-label="Membership tier"
            >
              {tiers.map((tier) => {
                const active = selectedTierId === tier.id
                return (
                  <button
                    key={tier.id}
                    type="button"
                    // biome-ignore lint/a11y/useSemanticElements: intentional ARIA radiogroup of styled card buttons; native <input type="radio"> cannot carry this card layout.
                    role="radio"
                    aria-checked={active}
                    onClick={() => selectTier(tier)}
                    className={`text-left rounded-cards border p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-deep-gold ${
                      active
                        ? 'border-deep-gold bg-warm-cream'
                        : 'border-cloud-gray bg-canvas-white hover:bg-cloud-gray/40'
                    }`}
                  >
                    <p className="font-ui text-sm text-cocoa-dark">{tier.name}</p>
                    <p className="text-xs font-sans text-warm-gray mt-1">
                      {tier.defaultHoursMinutes / 60} hrs · {formatINR(tier.defaultPricePaise)}
                    </p>
                    <p className="text-[11px] font-sans text-dusty-gray">
                      {tier.defaultValidityDays} days
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </Section>

        {/* Editable details (prefilled from tier, overridable) */}
        <Section title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${fieldId}-hours`}
                className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
              >
                Hours
              </label>
              <Input
                id={`${fieldId}-hours`}
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
              <span className="text-[11px] font-sans text-dusty-gray">
                Prefilled from tier · overridable for negotiated deals
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${fieldId}-price`}
                className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
              >
                Price (₹, GST-inclusive)
              </label>
              <Input
                id={`${fieldId}-price`}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${fieldId}-validity`}
                className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
              >
                Validity (days)
              </label>
              <Input
                id={`${fieldId}-validity`}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${fieldId}-start`}
                className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
              >
                Start Date
              </label>
              <Input
                id={`${fieldId}-start`}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <p className="mt-3 text-sm font-sans text-warm-gray" aria-live="polite">
            {expiryPreview
              ? `Expires: ${expiryPreview} (${Math.round(validityNum)} days from start)`
              : 'Expiry will be calculated from the start date and validity.'}
          </p>
        </Section>

        {/* Payment method */}
        <Section title="Payment Method">
          <RadioGroup
            value={paymentMethod}
            onValueChange={(v) => setPaymentMethod(v as MembershipPaymentMethod)}
            className="flex flex-wrap gap-4"
            aria-label="Payment method"
          >
            {MEMBERSHIP_PAYMENT_METHODS.map((pm) => (
              <div key={pm.value} className="flex items-center gap-2">
                <RadioGroupItem id={`pay-${pm.value}`} value={pm.value} />
                <Label
                  htmlFor={`pay-${pm.value}`}
                  className="cursor-pointer font-sans text-sm text-cocoa-dark"
                >
                  {pm.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </Section>

        {/* Notes (optional) */}
        <Section title="Notes (optional)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            aria-label="Membership notes"
            placeholder="Any internal notes about this membership…"
            className="w-full px-3 py-2 rounded-cards border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold resize-none"
          />
        </Section>

        {/* Side-effects note */}
        <div className="rounded-cards bg-cloud-gray/40 border border-cloud-gray px-3 py-3">
          <p className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray mb-1">
            This will
          </p>
          <ul className="space-y-0.5 text-sm font-sans text-warm-gray">
            <li>• Generate a membership_purchase invoice</li>
            <li>• Earn no gems on the purchase</li>
          </ul>
        </div>

        {submitError && (
          <p className="text-sm text-error font-sans" role="alert">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          aria-busy={submitting}
          className="w-full px-4 py-2.5 rounded-cards bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating…' : 'Create Membership'}
        </button>
      </form>
    </div>
  )
}

// --- Customer search with debounced query against /api/customers?q= ---
function CustomerSearch({
  selected,
  onSelect,
}: {
  selected: CustomerSearchRow | null
  onSelect: (customer: CustomerSearchRow | null) => void
}) {
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerSearchRow[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setResults([])
      setSearchError(null)
      return
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    const controller = new AbortController()
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      setSearchError(null)
      fetch(`/api/customers?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((json) => {
          if (json?.success) {
            setResults((json.data?.customers ?? []) as CustomerSearchRow[])
          } else {
            setSearchError(json?.error?.message ?? 'Search failed.')
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return
          }
          setSearchError('Search failed.')
        })
        .finally(() => setSearching(false))
    }, 300)

    return () => {
      controller.abort()
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, selected])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-cards border border-cloud-gray bg-cloud-gray/30 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-sans text-cocoa-dark truncate">{selected.name}</p>
          <p className="text-xs font-sans text-dusty-gray truncate">
            {selected.email}
            {selected.phone ? ` · ${selected.phone}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect(null)
            setQuery('')
          }}
          className="shrink-0 px-2.5 py-1 rounded-cards text-xs font-ui text-dusty-gray hover:text-cocoa-dark hover:bg-cloud-gray transition-colors"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
      >
        Search customer
      </label>
      <Input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, email, or phone…"
        autoComplete="off"
      />

      {searchError && (
        <p className="text-xs text-error font-sans" role="alert">
          {searchError}
        </p>
      )}

      {query.trim().length >= 2 && (
        <div aria-live="polite">
          {searching ? (
            <p className="text-xs font-sans text-dusty-gray">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-xs font-sans text-dusty-gray">
              No customers match “{query.trim()}”.
            </p>
          ) : (
            <ul className="border border-cloud-gray rounded-cards divide-y divide-cloud-gray overflow-hidden">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c)
                      setResults([])
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-cloud-gray/40 transition-colors focus:outline-none focus:bg-cloud-gray/40"
                  >
                    <span className="block text-sm font-sans text-cocoa-dark">{c.name}</span>
                    <span className="block text-xs font-sans text-dusty-gray">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border border-cloud-gray rounded-cards bg-canvas-white p-4">
      <h2 className="text-xs font-ui uppercase tracking-wider text-dusty-gray mb-3">{title}</h2>
      {children}
    </section>
  )
}

function BackLink() {
  return (
    <Link
      href="/memberships"
      className="inline-flex items-center gap-1.5 text-sm font-ui text-warm-gray hover:text-cocoa-dark transition-colors"
    >
      ← Back to Memberships
    </Link>
  )
}
