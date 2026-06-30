/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 26-06-2026 & Updated - 26-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : RedeemFlow
 * Scope        : Loyalty Programme (Gems Redemption UI)
 *
 * Description  : Client-side gems redemption flow for the /gems catalogue.
 *                Renders the redeemable catalogue grid and drives a date/slot
 *                redemption dialog that spends gems to create a ₹0 booking.
 *
 * Responsibilities :
 * - Render the catalogue grid with per-service affordability state
 * - Open a redemption dialog: pick date → fetch slots → pick slot → confirm
 * - POST /api/gems/redeem with a stable per-attempt idempotency key
 * - Surface the booking reference + updated balance on success
 *
 * Features / Functionality :
 * - Affordable services expose a Redeem action; others are disabled with a hint
 * - Availability fetched from GET /api/availability (date + branchId)
 * - Confirm disabled while in-flight (defence-in-depth over server idempotency)
 * - Distinct insufficient-balance vs generic error messaging
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : @rgss/business (formatINR)
 *
 * Notes        :
 * - WCAG 2.1 AA: dialog focus trap, aria-modal, Escape to close, labelled
 *   controls, aria-live result region.
 * - idempotencyKey is generated once per redemption attempt and stays stable
 *   across retries of that attempt.
 ************************************************************/

'use client'

import { Button } from '@/components/ui/button'
import { formatINR } from '@rgss/business'
import { Check, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Mirrors the catalogue item shape the server passes down (getRedeemableServices
// + computeAffordability, with null gemsRequired rows already dropped).
export interface RedeemableItem {
  id: string
  name: string
  gemsRequired: number
  pricePaise: number
  affordable: boolean
}

interface RedeemFlowProps {
  balance: number
  catalogue: RedeemableItem[]
  branchId?: string
}

// Availability slot shape (mirrors GET /api/availability response).
interface AvailabilitySlot {
  startTime: string
  endTime: string
  available: boolean
}

// Same default the booking dialog uses — the single live branch.
const DEFAULT_BRANCH_ID = 'branch_rayasandra'

// Local (IST for our users) calendar date → YYYY-MM-DD, no UTC drift.
function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getNext14Days(): Date[] {
  const days: Date[] = []
  const today = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d)
  }
  return days
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-IN', { weekday: 'short' })
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

interface RedeemResult {
  reference: string
  newBalance: number | null
  duplicate: boolean
}

export function RedeemFlow({ balance, catalogue, branchId = DEFAULT_BRANCH_ID }: RedeemFlowProps) {
  // Local balance so affordability + the hero stay accurate after a redemption.
  const [currentBalance, setCurrentBalance] = useState(balance)

  // Dialog state.
  const [activeService, setActiveService] = useState<RedeemableItem | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)

  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<RedeemResult | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  // Stable per-attempt idempotency key. Set once when the dialog opens for a
  // service and kept across retries of that attempt; a new attempt (reopen)
  // gets a fresh key.
  const idempotencyKeyRef = useRef<string | null>(null)

  const isOpen = activeService !== null

  const days = useMemo(() => getNext14Days(), [])

  const closeDialog = useCallback(() => {
    setActiveService(null)
    setSelectedDate(null)
    setSelectedTime(null)
    setSlots([])
    setSlotsError(null)
    setSlotsLoading(false)
    setSubmitting(false)
    setSubmitError(null)
    setResult(null)
    idempotencyKeyRef.current = null
  }, [])

  const openRedeem = useCallback((svc: RedeemableItem) => {
    setActiveService(svc)
    setSelectedDate(null)
    setSelectedTime(null)
    setSlots([])
    setSlotsError(null)
    setSubmitError(null)
    setResult(null)
    // One key per redemption attempt (stable across retries of this attempt).
    idempotencyKeyRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `rg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }, [])

  // Body scroll lock while the dialog is open.
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Escape to close.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDialog()
    }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, closeDialog])

  // Focus trap — re-runs when dialog content changes so it re-queries the
  // focusable elements after a date pick / slot load / result render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: extra deps intentionally re-init the focus trap when dialog content changes.
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length) focusable[0]?.focus()

    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !focusable.length) return
      const first = focusable[0] as HTMLElement | undefined
      const last = focusable[focusable.length - 1] as HTMLElement | undefined
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [isOpen, selectedDate, slotsLoading, submitting, result])

  // Fetch availability whenever a date is picked.
  useEffect(() => {
    if (!isOpen || !selectedDate) return
    let cancelled = false
    setSlotsLoading(true)
    setSlotsError(null)
    setSlots([])
    fetch(
      `/api/availability?date=${toISODate(selectedDate)}&branchId=${encodeURIComponent(branchId)}`,
    )
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not load slots.')
        }
        return json.data.slots as AvailabilitySlot[]
      })
      .then((s) => {
        if (!cancelled) setSlots(s)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSlotsError(err instanceof Error ? err.message : 'Could not load slots.')
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, selectedDate, branchId])

  const handleConfirm = useCallback(async () => {
    if (!activeService || !selectedDate || !selectedTime || !idempotencyKeyRef.current) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/gems/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: activeService.id,
          branchId,
          bookingDate: toISODate(selectedDate),
          startTime: selectedTime,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Your redemption could not be completed.')
      }

      const newBalance: number | null =
        typeof json.data.newBalance === 'number' ? json.data.newBalance : null
      setResult({
        reference: (json.data.reference ?? json.data.bookingNumber) as string,
        newBalance,
        duplicate: json.data.duplicate === true,
      })
      if (newBalance != null) setCurrentBalance(newBalance)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Your redemption could not be completed.')
    } finally {
      setSubmitting(false)
    }
  }, [activeService, selectedDate, selectedTime, branchId])

  const canConfirm = Boolean(selectedDate && selectedTime) && !submitting

  return (
    <>
      {catalogue.length === 0 ? (
        <p className="font-sans text-[15px] text-dusty-gray py-4">
          No rewards are available right now. Check back soon.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {catalogue.map((item) => {
            // Recompute against the live local balance (all-or-nothing rule).
            const affordable = currentBalance >= item.gemsRequired
            const shortBy = item.gemsRequired - currentBalance
            return (
              <li key={item.id}>
                <article className="flex h-full flex-col rounded-[6px] border border-cloud-gray bg-canvas-white p-5 motion-safe:transition-all duration-200 hover:border-golden-mist hover:shadow-card-hover">
                  <h3 className="font-ui text-[16px] text-cocoa-dark mb-2">{item.name}</h3>
                  <p className="font-ui text-[14px] text-deep-gold mb-1">
                    {item.gemsRequired.toLocaleString('en-IN')} gems
                  </p>
                  <p className="font-ui text-[12px] text-dusty-gray mb-4">
                    Worth {formatINR(item.pricePaise)}
                  </p>
                  <div className="mt-auto">
                    {affordable ? (
                      <Button
                        type="button"
                        variant="gold"
                        onClick={() => openRedeem(item)}
                        className="w-full rounded-full font-ui text-[12px] uppercase tracking-[0.5px]"
                      >
                        Redeem
                      </Button>
                    ) : (
                      <div>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled
                          aria-disabled="true"
                          className="w-full rounded-full font-ui text-[12px] uppercase tracking-[0.5px] text-dusty-gray"
                        >
                          Not enough gems
                        </Button>
                        <p className="mt-2 text-center font-sans text-[12px] text-warm-stone">
                          Need {shortBy.toLocaleString('en-IN')} more
                        </p>
                      </div>
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}

      {isOpen && activeService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          // biome-ignore lint/a11y/useSemanticElements: custom modal with focus trap, aria-modal and Escape handling; native <dialog> would break the overlay + animation.
          role="dialog"
          aria-modal="true"
          aria-labelledby="redeem-dialog-title"
        >
          {/* Overlay */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close redemption dialog"
            className="absolute inset-0 bg-cocoa-dark/60 backdrop-blur-sm"
            onClick={closeDialog}
          />

          {/* Modal */}
          <div
            ref={dialogRef}
            className="relative z-10 flex flex-col w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-[6px] bg-canvas-white sm:shadow-elevated overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-cloud-gray">
              <h2
                id="redeem-dialog-title"
                className="font-display text-[20px] text-cocoa-dark tracking-tight"
              >
                {result ? 'Redemption Confirmed' : 'Redeem with Gems'}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={closeDialog}
                className="rounded-full"
                aria-label="Close redemption dialog"
              >
                <X aria-hidden="true" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {result ? (
                <SuccessView
                  serviceName={activeService.name}
                  reference={result.reference}
                  newBalance={result.newBalance}
                  duplicate={result.duplicate}
                  onDone={closeDialog}
                />
              ) : (
                <div className="space-y-5">
                  {/* Service summary */}
                  <div className="rounded-[6px] bg-warm-cream border border-golden-mist px-4 py-3">
                    <p className="font-sans text-[15px] text-cocoa-dark">{activeService.name}</p>
                    <p className="font-ui text-[13px] text-deep-gold mt-0.5">
                      {activeService.gemsRequired.toLocaleString('en-IN')} gems · worth{' '}
                      {formatINR(activeService.pricePaise)}
                    </p>
                  </div>

                  {/* Date */}
                  <div>
                    <h3
                      id="redeem-date-label"
                      className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-3"
                    >
                      Select Date
                    </h3>
                    <div
                      className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
                      aria-labelledby="redeem-date-label"
                    >
                      {days.map((d) => {
                        const isSelected = selectedDate?.toDateString() === d.toDateString()
                        return (
                          <button
                            key={d.toISOString()}
                            type="button"
                            onClick={() => {
                              setSelectedDate(d)
                              setSelectedTime(null)
                            }}
                            className={`flex-shrink-0 flex flex-col items-center gap-0.5 w-14 py-2.5 rounded-[6px] border motion-safe:transition-all duration-200 ${
                              isSelected
                                ? 'bg-royal-gold border-deep-gold text-cocoa-dark'
                                : 'bg-canvas-white border-cloud-gray text-cocoa-dark hover:border-golden-mist'
                            }`}
                            aria-pressed={isSelected}
                          >
                            <span className="font-ui text-[10px] uppercase tracking-[1px]">
                              {formatDay(d)}
                            </span>
                            <span className="font-ui text-[14px] font-medium">{formatDate(d)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Time */}
                  <div>
                    <h3
                      id="redeem-time-label"
                      className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-3"
                    >
                      Select Time
                    </h3>

                    {!selectedDate ? (
                      <p className="font-sans text-[14px] text-dusty-gray">
                        Pick a date to see available times.
                      </p>
                    ) : slotsLoading ? (
                      <output className="flex items-center gap-2 py-4" aria-live="polite">
                        <Loader2
                          className="size-4 animate-spin text-deep-gold"
                          aria-hidden="true"
                        />
                        <span className="font-sans text-[14px] text-dusty-gray">
                          Loading available times…
                        </span>
                      </output>
                    ) : slotsError ? (
                      <p className="font-sans text-[14px] text-error" role="alert">
                        {slotsError}
                      </p>
                    ) : slots.length === 0 ? (
                      <p className="font-sans text-[14px] text-dusty-gray">
                        No slots available for this date. Try another day.
                      </p>
                    ) : (
                      <div
                        className="grid grid-cols-4 sm:grid-cols-5 gap-2"
                        aria-labelledby="redeem-time-label"
                      >
                        {slots.map((slot) => {
                          const isSelected = selectedTime === slot.startTime
                          return (
                            <button
                              key={slot.startTime}
                              type="button"
                              onClick={() => slot.available && setSelectedTime(slot.startTime)}
                              disabled={!slot.available}
                              aria-pressed={isSelected}
                              aria-disabled={!slot.available}
                              className={`font-ui text-[13px] py-2 rounded-full border motion-safe:transition-all duration-200 ${
                                isSelected
                                  ? 'bg-royal-gold border-deep-gold text-cocoa-dark'
                                  : slot.available
                                    ? 'bg-canvas-white border-cloud-gray text-cocoa-dark hover:border-golden-mist'
                                    : 'bg-cloud-gray border-cloud-gray text-dusty-gray line-through cursor-not-allowed'
                              }`}
                            >
                              {slot.startTime}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Submit error (aria-live so it is announced) */}
                  <output className="block" aria-live="assertive">
                    {submitError && (
                      <p className="font-sans text-[14px] text-error" role="alert">
                        {submitError}
                      </p>
                    )}
                  </output>
                </div>
              )}
            </div>

            {/* Footer */}
            {!result && (
              <div className="flex items-center justify-between border-t border-cloud-gray px-5 py-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeDialog}
                  disabled={submitting}
                  className="rounded-full font-ui text-[12px] uppercase tracking-[0.5px]"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="gold"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  aria-busy={submitting}
                  className="rounded-full font-ui text-[12px] uppercase tracking-[0.5px]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      Redeeming…
                    </>
                  ) : (
                    'Confirm Redemption'
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function SuccessView({
  serviceName,
  reference,
  newBalance,
  duplicate,
  onDone,
}: {
  serviceName: string
  reference: string
  newBalance: number | null
  duplicate: boolean
  onDone: () => void
}) {
  return (
    <output
      className="flex flex-col items-center justify-center py-12 text-center"
      aria-live="polite"
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
        <Check className="size-8" strokeWidth={2.5} aria-hidden="true" />
      </div>
      <h3 className="font-display text-[24px] text-cocoa-dark mb-2">
        {duplicate ? 'Already Redeemed' : 'Gems Redeemed!'}
      </h3>
      <p className="font-sans text-[15px] text-warm-gray max-w-xs mb-4">
        {duplicate
          ? `Your redemption for ${serviceName} is already confirmed. Our team will confirm your appointment shortly.`
          : `${serviceName} is booked with your gems. Our team will confirm your appointment shortly.`}
      </p>

      <div className="mb-4 px-5 py-3 rounded-[6px] bg-warm-cream border border-golden-mist">
        <span className="block font-ui text-[10px] uppercase tracking-[1px] text-warm-stone mb-1">
          Booking Reference
        </span>
        <span className="font-ui text-[16px] text-cocoa-dark tracking-[0.5px]">{reference}</span>
      </div>

      {newBalance != null && (
        <p className="font-sans text-[14px] text-cocoa-dark mb-8">
          Updated balance:{' '}
          <span className="font-ui text-deep-gold">{newBalance.toLocaleString('en-IN')} gems</span>
        </p>
      )}

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button
          asChild
          variant="gold"
          className="rounded-full font-ui text-[12px] uppercase tracking-[0.5px]"
        >
          <a href="/bookings">View My Bookings</a>
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onDone}
          className="rounded-full font-ui text-[12px] uppercase tracking-[0.5px]"
        >
          Done
        </Button>
      </div>
    </output>
  )
}
