/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Walk-in Booking Form
 * Scope        : Admin Portal — Booking Management
 *
 * Description  : Client form for creating a walk-in booking at the counter.
 *                Built on the admin design-system conventions: lucide icons via
 *                the Icon wrapper (no emoji), only semantic Brand-Token colour /
 *                radius utilities (no hex / raw-palette literals), root-path
 *                links (no /admin prefix), and a WCAG-AA accessible form
 *                (labelled controls, visible focus, aria-live status region).
 *                Posts to POST /api/bookings/new and, on success, routes to the
 *                created booking's detail page.
 *
 * Responsibilities :
 * - Pick the branch and the service type (salon / spa)
 * - Look up and link an EXISTING customer (the walk-in's account)
 * - Multi-select services of the chosen type with a running total + duration
 * - Capture the date, start time, and optional notes
 * - Submit the booking and surface accessible success / error feedback
 *
 * Features / Functionality :
 * - Service type tabs filter the service list; switching clears the selection
 *   so a booking is always a single service type (salon OR spa, never mixed)
 * - Debounced customer search against GET /api/customers (receptionist+)
 * - Running total (GST-inclusive paise) + total duration update live
 * - aria-live status region announces submit progress / errors to AT
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Form Component)
 *
 * Dependencies : @/components/ui/icon, @/lib/admin/bookings, next/link,
 *                next/navigation, lucide-react, React hooks
 *
 * Notes        :
 * - A walk-in must link an existing customer because booking.customer_id is a
 *   NOT NULL FK to user. Provisioning a brand-new walk-in account is out of
 *   scope (see the route's TODO).
 * - Presentation-only: no business logic; the API owns validation + persistence.
 ************************************************************/

'use client'

import { AlertCircle, ArrowLeft, Check, Search, UserCheck, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Textarea } from '@/components/ui/textarea'
import { TimeSelect } from '@/components/ui/time-select'
import { formatINRWithPaise } from '@/lib/admin/bookings'
import { toast } from '@/lib/admin/toast'

/** Operational branch option offered in the branch picker. */
export type WalkinBranch = {
  id: string
  name: string
  code: string
}

/** Active, bookable service projected from the catalogue. */
export type WalkinService = {
  id: string
  name: string
  serviceType: 'salon' | 'spa'
  categoryName: string
  pricePaise: number
  durationMinutes: number
}

/** A customer search result from GET /api/customers. */
type CustomerResult = {
  id: string
  name: string
  email: string
  phone: string | null
}

const SERVICE_TYPES = [
  { value: 'salon', label: 'Salon' },
  { value: 'spa', label: 'SPA' },
] as const

type ServiceType = (typeof SERVICE_TYPES)[number]['value']

// Shared control styling expressed with semantic Brand-Token utilities only
// (no hex / raw-palette literals). Mirrors the field styling used across the
// existing admin booking pages so this form is visually consistent.
const FIELD_LABEL = 'font-ui text-[10px] uppercase tracking-wider text-dusty-gray'

export function WalkinForm({
  branches,
  services,
}: {
  branches: WalkinBranch[]
  services: WalkinService[]
}) {
  const router = useRouter()

  // ── Form state ──────────────────────────────────────────────────────────
  // Default the branch to the only operational branch when there is exactly
  // one, sparing the receptionist a redundant choice.
  const [branchId, setBranchId] = useState(branches.length === 1 ? (branches[0]?.id ?? '') : '')
  const [serviceType, setServiceType] = useState<ServiceType>('salon')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bookingDate, setBookingDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [notes, setNotes] = useState('')

  // Linked customer + lookup state.
  const [customer, setCustomer] = useState<CustomerResult | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerResult[]>([])
  const [searching, setSearching] = useState(false)

  // Submission state.
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Services available for the chosen type. Switching type clears the
  // selection, so the rendered list always matches what is selectable.
  const visibleServices = useMemo(
    () => services.filter((s) => s.serviceType === serviceType),
    [services, serviceType],
  )

  // Running total + duration over the current selection (GST-inclusive paise).
  const { totalPaise, totalMinutes } = useMemo(() => {
    let paise = 0
    let minutes = 0
    for (const s of services) {
      if (selectedIds.has(s.id)) {
        paise += s.pricePaise
        minutes += s.durationMinutes
      }
    }
    return { totalPaise: paise, totalMinutes: minutes }
  }, [services, selectedIds])

  // Switch service type: salon and spa can never mix on one booking, so reset
  // the current selection when the type changes.
  const changeServiceType = useCallback((next: ServiceType) => {
    setServiceType(next)
    setSelectedIds(new Set())
  }, [])

  const toggleService = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // ── Debounced customer search ─────────────────────────────────────────────
  // Re-query 300ms after the receptionist stops typing. A blank query (or an
  // already-linked customer) clears results without hitting the API.
  useEffect(() => {
    const term = query.trim()
    if (customer || term.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    let active = true
    setSearching(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(term)}&pageSize=8`)
        const json = await res.json()
        if (active && res.ok && json.success) {
          setResults(json.data.customers as CustomerResult[])
        }
      } catch {
        // Lookup failures leave the results empty; the field stays usable.
        if (active) {
          setResults([])
        }
      } finally {
        if (active) {
          setSearching(false)
        }
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [query, customer])

  const linkCustomer = useCallback((picked: CustomerResult) => {
    setCustomer(picked)
    setQuery('')
    setResults([])
  }, [])

  const clearCustomer = useCallback(() => {
    setCustomer(null)
  }, [])

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    // Client-side guards mirror the server schema for fast, friendly feedback;
    // the API remains the source of truth.
    if (!branchId) {
      setError('Select a branch.')
      return
    }
    if (!customer) {
      setError('Link an existing customer.')
      return
    }
    if (selectedIds.size === 0) {
      setError('Select at least one service.')
      return
    }
    if (!bookingDate) {
      setError('Choose a date.')
      return
    }
    if (!startTime) {
      setError('Choose a start time.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/bookings/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchId,
          customerId: customer.id,
          serviceType,
          bookingDate,
          startTime,
          serviceIds: [...selectedIds],
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not create this walk-in booking.')
      }
      toast.success('Walk-in booking created')
      // Land on the new booking's detail page so the receptionist can proceed
      // to checkout immediately.
      router.push(`/bookings/${json.data.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not create this walk-in booking.'
      setError(message)
      toast.error('Could not create walk-in booking', message)
      setSubmitting(false)
    }
  }, [branchId, customer, selectedIds, bookingDate, startTime, serviceType, notes, router])

  const noBranches = branches.length === 0

  return (
    <div className="max-w-3xl space-y-5">
      <BackLink />

      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">
          New walk-in booking
        </h1>
      </div>
      <p className="font-sans text-sm text-warm-gray">
        Record a booking for a customer at the counter. Walk-ins are confirmed immediately and skip
        the pending approval queue.
      </p>

      {noBranches ? (
        <div className="flex items-start gap-2 rounded-cards border border-cloud-gray bg-cloud-gray/40 px-4 py-3">
          <Icon icon={AlertCircle} decorative size={18} className="mt-0.5 text-dusty-gray" />
          <p className="font-sans text-sm text-warm-gray">
            No operational branch is available, so a walk-in cannot be created right now.
          </p>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {/* Branch + service type */}
          <Section title="Branch & type">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="walkin-branch" className={FIELD_LABEL}>
                  Branch
                </label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger id="walkin-branch" className="w-full">
                    <SelectValue placeholder="Select branch…" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectGroup>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <fieldset>
                  <legend className={`mb-1 ${FIELD_LABEL}`}>Service type</legend>
                  <div className="inline-flex rounded-buttons border border-outline-gray p-0.5">
                    {SERVICE_TYPES.map((t) => {
                      const active = serviceType === t.value
                      return (
                        <button
                          key={t.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => changeServiceType(t.value)}
                          className={`h-8 rounded-buttons px-4 font-ui text-sm transition-colors motion-reduce:transition-none ${
                            active
                              ? 'bg-cocoa-dark text-canvas-white'
                              : 'text-warm-gray hover:text-cocoa-dark'
                          }`}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              </div>
            </div>
          </Section>

          {/* Customer lookup */}
          <Section title="Customer">
            {customer ? (
              <div className="flex items-center justify-between gap-3 rounded-cards border border-cloud-gray bg-canvas-white px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon icon={UserCheck} decorative size={18} className="text-success" />
                  <span className="min-w-0">
                    <span className="block truncate font-sans text-sm text-cocoa-dark">
                      {customer.name}
                    </span>
                    <span className="block truncate font-sans text-xs text-dusty-gray">
                      {customer.phone ?? customer.email}
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={clearCustomer}
                  className="inline-flex items-center gap-1 rounded-buttons px-2 py-1 font-ui text-xs text-warm-gray transition-colors hover:bg-cloud-gray hover:text-cocoa-dark motion-reduce:transition-none"
                >
                  Change
                  <Icon icon={X} decorative size={14} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label htmlFor="walkin-customer" className={FIELD_LABEL}>
                  Find an existing customer
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-dusty-gray">
                    <Icon icon={Search} decorative size={16} />
                  </span>
                  <Input
                    id="walkin-customer"
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by name, phone, or email…"
                    autoComplete="off"
                    aria-describedby="walkin-customer-hint"
                    className="pl-8"
                  />
                </div>
                <p id="walkin-customer-hint" className="font-sans text-xs text-dusty-gray">
                  A walk-in is linked to an existing customer account.
                </p>

                {/* Results / status (aria-live so AT hears matches arrive). */}
                <div aria-live="polite">
                  {searching ? (
                    <p className="px-1 py-2 font-sans text-xs text-dusty-gray">Searching…</p>
                  ) : results.length > 0 ? (
                    <ul className="mt-1 divide-y divide-cloud-gray overflow-hidden rounded-cards border border-cloud-gray">
                      {results.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => linkCustomer(r)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-cloud-gray motion-reduce:transition-none"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-sans text-sm text-cocoa-dark">
                                {r.name}
                              </span>
                              <span className="block truncate font-sans text-xs text-dusty-gray">
                                {r.phone ?? r.email}
                              </span>
                            </span>
                            <Icon icon={Check} decorative size={16} className="text-dusty-gray" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : query.trim().length >= 2 ? (
                    <p className="px-1 py-2 font-sans text-xs text-dusty-gray">
                      No matching customers.
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </Section>

          {/* Services */}
          <Section title="Services">
            {visibleServices.length === 0 ? (
              <p className="font-sans text-sm text-dusty-gray">
                No active {serviceType === 'spa' ? 'SPA' : 'salon'} services are available.
              </p>
            ) : (
              <fieldset className="space-y-1.5">
                <legend className="sr-only">Select services</legend>
                {visibleServices.map((s) => {
                  const checked = selectedIds.has(s.id)
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-3 rounded-cards border px-3 py-2.5 transition-colors motion-reduce:transition-none ${
                        checked
                          ? 'border-deep-gold bg-warm-cream'
                          : 'border-cloud-gray hover:bg-cloud-gray/50'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Checkbox
                          id={`walkin-svc-${s.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleService(s.id)}
                        />
                        <label htmlFor={`walkin-svc-${s.id}`} className="min-w-0 cursor-pointer">
                          <span className="block truncate font-sans text-sm text-cocoa-dark">
                            {s.name}
                          </span>
                          <span className="block truncate font-sans text-xs text-dusty-gray">
                            {s.categoryName} · {s.durationMinutes} min
                          </span>
                        </label>
                      </span>
                      <span className="shrink-0 font-ui text-sm text-cocoa-dark">
                        {formatINRWithPaise(s.pricePaise)}
                      </span>
                    </div>
                  )
                })}
              </fieldset>
            )}

            {/* Running total */}
            <div className="mt-3 flex items-center justify-between border-t border-cloud-gray pt-3">
              <span className="font-ui text-xs uppercase tracking-wider text-dusty-gray">
                {selectedIds.size} selected · {totalMinutes} min
              </span>
              <span className="font-ui font-medium text-cocoa-dark">
                {formatINRWithPaise(totalPaise)}
              </span>
            </div>
          </Section>

          {/* Schedule */}
          <Section title="Schedule">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="walkin-date" className={FIELD_LABEL}>
                  Date
                </label>
                <Input
                  id="walkin-date"
                  type="date"
                  value={bookingDate}
                  onChange={(event) => setBookingDate(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="walkin-time" className={FIELD_LABEL}>
                  Start time
                </label>
                <TimeSelect
                  id="walkin-time"
                  value={startTime}
                  onChange={setStartTime}
                  ariaLabel="Start time"
                  className="w-full"
                />
              </div>
            </div>
          </Section>

          {/* Notes */}
          <Section title="Notes (optional)">
            <div className="flex flex-col gap-1">
              <label htmlFor="walkin-notes" className="sr-only">
                Notes
              </label>
              <Textarea
                id="walkin-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Anything the team should know…"
              />
            </div>
          </Section>

          {/* Status + submit. The status region is aria-live so submit
              progress and errors are announced to assistive technology. */}
          <div aria-live="assertive">
            {error ? (
              <p className="flex items-center gap-1.5 font-sans text-sm text-error" role="alert">
                <Icon icon={AlertCircle} decorative size={16} />
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="inline-flex items-center justify-center gap-1.5 rounded-buttons bg-success px-5 py-2.5 font-ui text-sm text-canvas-white transition-colors hover:bg-success-dark disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
            >
              {submitting ? 'Creating…' : 'Create walk-in booking'}
              {submitting ? null : <Icon icon={Check} decorative size={16} />}
            </button>
            <Link
              href="/bookings"
              className="rounded-buttons border border-cloud-gray px-5 py-2.5 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray motion-reduce:transition-none"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Shared primitives ───────────────────────────────────────────────────────
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
      href="/bookings"
      className="inline-flex items-center gap-1.5 font-ui text-sm text-warm-gray transition-colors hover:text-cocoa-dark motion-reduce:transition-none"
    >
      <Icon icon={ArrowLeft} decorative size={16} />
      Back to Bookings
    </Link>
  )
}
