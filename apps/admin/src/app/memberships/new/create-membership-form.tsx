/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Create Membership Form
 * Scope        : Admin Portal — Membership Management
 *
 * Description  : The counter sale of a SPA membership (multi-branch R9.3):
 *                choose the customer, choose a tier that prefills the usual
 *                hours, price and expiry, adjust the hours with − and +, type
 *                the agreed price, pick the dates and record the payment.
 *
 * Responsibilities :
 * - Debounced customer search against admin customers API
 * - Active tier cards; choosing one prefills hours, price and expiry
 * - Hours counter in whole hours from 1; the price never follows the hours
 * - Start date (today in IST by default) and expiry date pickers
 * - Check the sale against the server's limits, then submit it
 *
 * Features / Functionality :
 * - Summary line: "8 hours for ₹10,000.00 · 25/10/2026 to 23/01/2027 (90 days)"
 * - While the expiry is the tier's usual one, moving the start moves it too
 * - Field errors from the API shown beside their fields
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Form Component)
 *
 * Dependencies : admin memberships lib, form-field, next/link,
 *                next/navigation, React hooks, lucide-react
 *
 * Notes        :
 * - Sends whole hours and integer paise; the server stores minutes and
 *   re-checks every rule (MS-14 to MS-16).
 * - Customers never see the tier: the invoice line names the hours and expiry.
 ************************************************************/

'use client'

import { Minus, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { formatINRWithPaise } from '@/lib/admin/format'
import {
  addDaysISO,
  type CustomerSearchRow,
  daysBetweenISO,
  formatDateDDMMYYYY,
  hoursLabel,
  MEMBERSHIP_PAYMENT_METHODS,
  MEMBERSHIP_SALE_LIMITS,
  type MembershipPaymentMethod,
  type MembershipTier,
  type MembershipTierList,
  paiseToRupeesText,
  rupeesToPaise,
  saleFormProblem,
  stepSaleHours,
  tierSalePrefill,
  todayISTDateString,
} from '@/lib/admin/memberships'
import { toast } from '@/lib/admin/toast'

/** The branch selling the membership: the one the page was rendered for. */
export interface SellingBranch {
  id: string
  name: string
}

type FieldErrors = Record<string, string[] | undefined>

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** "8 hours", or "Agreed at the counter" for a tier without usual hours. */
function usualHoursText(tier: MembershipTier): string {
  const hours = Math.floor(tier.defaultHoursMinutes / 60)
  return hours > 0 ? hoursLabel(hours) : 'Hours agreed at the counter'
}

function usualPriceText(tier: MembershipTier): string {
  return tier.defaultPricePaise > 0
    ? formatINRWithPaise(tier.defaultPricePaise)
    : 'Price agreed at the counter'
}

export function CreateMembershipForm({ branch }: { branch: SellingBranch }) {
  const router = useRouter()
  const fieldId = useId()
  // The IST business date the form opened on; the server re-checks it.
  const [today] = useState(() => todayISTDateString())

  const [tiers, setTiers] = useState<MembershipTier[] | null>(null)
  const [tiersError, setTiersError] = useState<string | null>(null)

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchRow | null>(null)
  const [selectedTier, setSelectedTier] = useState<MembershipTier | null>(null)

  // Hours and price are typed in human units (whole hours, rupees) and sent
  // as hours and paise. They are independent: hours never change the price.
  const [hoursText, setHoursText] = useState(String(MEMBERSHIP_SALE_LIMITS.minHours))
  const [price, setPrice] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [expiresOn, setExpiresOn] = useState('')
  // True while the expiry is the chosen tier's usual validity from the start.
  const [expiryFollowsTier, setExpiryFollowsTier] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<MembershipPaymentMethod>('cash')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  // Load the tier cards once. Retired (inactive) tiers aren't offered.
  useEffect(() => {
    let active = true
    fetch('/api/membership-tiers')
      .then((res) => res.json())
      .then((json) => {
        if (!active) {
          return
        }
        if (json?.success) {
          const list = json.data as MembershipTierList
          setTiers(list.tiers.filter((tier) => tier.isActive))
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

  // Choosing a tier fills in its usual hours, price and expiry; all stay editable.
  const selectTier = useCallback(
    (tier: MembershipTier) => {
      const start = ISO_DATE.test(startDate) ? startDate : today
      const prefill = tierSalePrefill(tier, start)
      setSelectedTier(tier)
      setHoursText(String(prefill.hours))
      setPrice(paiseToRupeesText(prefill.pricePaise))
      setExpiresOn(prefill.expiresOn)
      setExpiryFollowsTier(true)
      setFieldErrors({})
    },
    [startDate, today],
  )

  const changeStartDate = useCallback(
    (value: string) => {
      setStartDate(value)
      if (selectedTier && expiryFollowsTier && ISO_DATE.test(value)) {
        setExpiresOn(addDaysISO(value, selectedTier.defaultValidityDays))
      }
    },
    [selectedTier, expiryFollowsTier],
  )

  const stepHours = useCallback((delta: number) => {
    setHoursText((text) => String(stepSaleHours(Number(text), delta)))
  }, [])

  const hours = Number(hoursText)
  const pricePaise = rupeesToPaise(price)
  // What's wrong with the deal itself, then with the sale as a whole.
  const dealProblem =
    selectedTier === null
      ? 'Choose a tier.'
      : saleFormProblem({ hours, pricePaise, startDate, expiresOn, today })
  const problem = selectedCustomer === null ? 'Choose the customer.' : dealProblem
  const validityDays = daysBetweenISO(startDate, expiresOn)
  const startValid = ISO_DATE.test(startDate)

  const submit = useCallback(async () => {
    if (problem !== null || !(selectedCustomer && selectedTier) || pricePaise === null) {
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setFieldErrors({})
    try {
      const res = await fetch('/api/memberships', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchId: branch.id,
          customerId: selectedCustomer.id,
          tierId: selectedTier.id,
          hours,
          pricePaise,
          startDate,
          expiresOn,
          paymentMethod,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        if (json?.error?.details) {
          setFieldErrors(json.error.details as FieldErrors)
        }
        throw new Error(json?.error?.message ?? 'Could not create this membership.')
      }
      toast.success('Membership sold')
      router.push(`/memberships/${json.data.membership.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not create this membership.'
      setSubmitError(message)
      toast.error('Could not create membership', message)
      setSubmitting(false)
    }
  }, [
    problem,
    branch.id,
    selectedCustomer,
    selectedTier,
    hours,
    pricePaise,
    startDate,
    expiresOn,
    paymentMethod,
    notes,
    router,
  ])

  const customDeal =
    selectedTier !== null &&
    dealProblem === null &&
    (hours * 60 !== selectedTier.defaultHoursMinutes ||
      pricePaise !== selectedTier.defaultPricePaise)

  return (
    <div className="max-w-2xl space-y-5">
      <BackLink />

      <div className="space-y-1">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">
          Sell a SPA Membership
        </h1>
        <p className="font-sans text-sm text-warm-gray">
          Sold at {branch.name}, which issues the invoice. The hours can be used at any branch.
        </p>
      </div>

      <form
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Section title="Customer">
          <CustomerSearch selected={selectedCustomer} onSelect={setSelectedCustomer} />
        </Section>

        <Section title="Tier">
          {tiersError ? (
            <p className="font-sans text-sm text-error" role="alert">
              {tiersError}
            </p>
          ) : tiers === null ? (
            <p className="font-sans text-sm text-dusty-gray">Loading tiers…</p>
          ) : tiers.length === 0 ? (
            <p className="font-sans text-sm text-dusty-gray">
              No active tiers. Add one on the{' '}
              <Link href="/memberships/tiers" className="text-deep-gold hover:text-cocoa-dark">
                Membership tiers
              </Link>{' '}
              screen.
            </p>
          ) : (
            <div
              className="grid gap-3 sm:grid-cols-3"
              role="radiogroup"
              aria-label="Membership tier"
            >
              {tiers.map((tier) => {
                const active = selectedTier?.id === tier.id
                return (
                  <button
                    key={tier.id}
                    type="button"
                    // biome-ignore lint/a11y/useSemanticElements: intentional ARIA radiogroup of styled card buttons; native <input type="radio"> cannot carry this card layout.
                    role="radio"
                    aria-checked={active}
                    onClick={() => selectTier(tier)}
                    className={`rounded-cards border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-deep-gold ${
                      active
                        ? 'border-deep-gold bg-warm-cream'
                        : 'border-cloud-gray bg-canvas-white hover:bg-cloud-gray/40'
                    }`}
                  >
                    <p className="font-ui text-sm text-cocoa-dark">{tier.name}</p>
                    <p className="mt-1 font-sans text-xs text-warm-gray">
                      {usualHoursText(tier)} · {usualPriceText(tier)}
                    </p>
                    <p className="font-sans text-[11px] text-dusty-gray">
                      Usually valid {tier.defaultValidityDays} days
                    </p>
                  </button>
                )
              })}
            </div>
          )}
          <p className="mt-2 font-sans text-[11px] text-dusty-gray">
            A tier only fills in its usual values. Customers never see it.
          </p>
        </Section>

        <Section title="Deal">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Hours"
              htmlFor={`${fieldId}-hours`}
              hint="Whole hours. Changing hours never changes the price."
              error={fieldErrors.hours?.join(' ') ?? null}
            >
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="One hour less"
                  onClick={() => stepHours(-1)}
                  disabled={!(hours > MEMBERSHIP_SALE_LIMITS.minHours)}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <Input
                  id={`${fieldId}-hours`}
                  type="number"
                  inputMode="numeric"
                  min={MEMBERSHIP_SALE_LIMITS.minHours}
                  max={MEMBERSHIP_SALE_LIMITS.maxHours}
                  step={1}
                  value={hoursText}
                  onChange={(e) => setHoursText(e.target.value)}
                  onBlur={() => stepHours(0)}
                  className="w-24 text-center"
                  aria-invalid={Boolean(fieldErrors.hours?.length)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="One hour more"
                  onClick={() => stepHours(1)}
                  disabled={!(hours < MEMBERSHIP_SALE_LIMITS.maxHours)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </Field>

            <Field
              label="Agreed price (₹, GST-inclusive)"
              htmlFor={`${fieldId}-price`}
              error={fieldErrors.pricePaise?.join(' ') ?? null}
            >
              <Input
                id={`${fieldId}-price`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="10000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={Boolean(fieldErrors.pricePaise?.length)}
              />
            </Field>

            <Field
              label="Start date"
              htmlFor={`${fieldId}-start`}
              hint="Today unless the customer starts later."
              error={fieldErrors.startDate?.join(' ') ?? null}
            >
              <Input
                id={`${fieldId}-start`}
                type="date"
                min={today}
                max={addDaysISO(today, MEMBERSHIP_SALE_LIMITS.maxStartDaysAhead)}
                value={startDate}
                onChange={(e) => changeStartDate(e.target.value)}
                aria-invalid={Boolean(fieldErrors.startDate?.length)}
              />
            </Field>

            <Field
              label="Expiry date"
              htmlFor={`${fieldId}-expiry`}
              hint="Valid until 23:59 IST on this date."
              error={fieldErrors.expiresOn?.join(' ') ?? null}
            >
              <Input
                id={`${fieldId}-expiry`}
                type="date"
                min={startValid ? addDaysISO(startDate, 1) : undefined}
                max={
                  startValid
                    ? addDaysISO(startDate, MEMBERSHIP_SALE_LIMITS.maxValidityDays)
                    : undefined
                }
                value={expiresOn}
                onChange={(e) => {
                  setExpiresOn(e.target.value)
                  setExpiryFollowsTier(false)
                }}
                aria-invalid={Boolean(fieldErrors.expiresOn?.length)}
              />
            </Field>
          </div>

          <div className="mt-4 space-y-1" aria-live="polite">
            {dealProblem === null && pricePaise !== null && validityDays !== null ? (
              <p className="font-sans text-sm text-cocoa-dark">
                {hoursLabel(hours)} for {formatINRWithPaise(pricePaise)} ·{' '}
                {formatDateDDMMYYYY(startDate)} to {formatDateDDMMYYYY(expiresOn)} ({validityDays}{' '}
                {validityDays === 1 ? 'day' : 'days'})
              </p>
            ) : (
              <p className="font-sans text-sm text-warm-gray">{dealProblem}</p>
            )}
            {customDeal && selectedTier ? (
              <p className="font-sans text-xs text-dusty-gray">
                Custom deal. {selectedTier.name} is usually {usualHoursText(selectedTier)} for{' '}
                {usualPriceText(selectedTier)}; no approval is needed.
              </p>
            ) : null}
          </div>
        </Section>

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

        <Section title="Notes (optional)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            aria-label="Membership notes"
            placeholder="Any internal notes about this membership…"
            className="w-full resize-none rounded-cards border border-outline-gray bg-canvas-white px-3 py-2 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          />
        </Section>

        <div className="rounded-cards border border-cloud-gray bg-cloud-gray/40 px-3 py-3">
          <p className="mb-1 font-ui text-[10px] uppercase tracking-wider text-dusty-gray">
            This will
          </p>
          <ul className="space-y-0.5 font-sans text-sm text-warm-gray">
            <li>• Issue the purchase invoice from {branch.name}, naming the hours and expiry</li>
            <li>• Earn no gems on the purchase</li>
          </ul>
        </div>

        {submitError ? (
          <p className="font-sans text-sm text-error" role="alert">
            {submitError}
          </p>
        ) : null}

        {/* The deal's own problem shows under the deal; this covers the rest. */}
        {problem !== null && problem !== dealProblem ? (
          <p className="font-sans text-sm text-warm-gray">{problem}</p>
        ) : null}

        <button
          type="submit"
          disabled={problem !== null || submitting}
          aria-busy={submitting}
          className="w-full rounded-cards bg-cocoa-dark px-4 py-2.5 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Selling…' : 'Sell Membership'}
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
          <p className="truncate font-sans text-sm text-cocoa-dark">{selected.name}</p>
          <p className="truncate font-sans text-xs text-dusty-gray">
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
          className="shrink-0 rounded-cards px-2.5 py-1 font-ui text-xs text-dusty-gray transition-colors hover:bg-cloud-gray hover:text-cocoa-dark"
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
        className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray"
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

      {searchError ? (
        <p className="font-sans text-xs text-error" role="alert">
          {searchError}
        </p>
      ) : null}

      {query.trim().length >= 2 ? (
        <div aria-live="polite">
          {searching ? (
            <p className="font-sans text-xs text-dusty-gray">Searching…</p>
          ) : results.length === 0 ? (
            <p className="font-sans text-xs text-dusty-gray">
              No customers match “{query.trim()}”.
            </p>
          ) : (
            <ul className="divide-y divide-cloud-gray overflow-hidden rounded-cards border border-cloud-gray">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c)
                      setResults([])
                    }}
                    className="w-full px-3 py-2 text-left transition-colors hover:bg-cloud-gray/40 focus:bg-cloud-gray/40 focus:outline-none"
                  >
                    <span className="block font-sans text-sm text-cocoa-dark">{c.name}</span>
                    <span className="block font-sans text-xs text-dusty-gray">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-cards border border-cloud-gray bg-canvas-white p-4">
      <h2 className="mb-3 font-ui text-xs uppercase tracking-wider text-dusty-gray">{title}</h2>
      {children}
    </section>
  )
}

function BackLink() {
  return (
    <Link
      href="/memberships"
      className="inline-flex items-center gap-1.5 font-ui text-sm text-warm-gray transition-colors hover:text-cocoa-dark"
    >
      ← Back to Memberships
    </Link>
  )
}
