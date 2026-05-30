'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSession } from '@/lib/auth-client'

// --- Types (mirror GET /api/services response) ---
type ServiceType = 'salon' | 'spa'

interface ApiService {
  id: string
  categoryId: string
  name: string
  slug: string
  durationMinutes: number
  pricePaise: number
  description?: string | null
}

interface ApiCategory {
  id: string
  name: string
  slug: string
  serviceType: ServiceType
  displayOrder: number
  services: ApiService[]
}

interface AvailabilitySlot {
  startTime: string
  endTime: string
  available: boolean
}

const DEFAULT_BRANCH_ID = 'branch_rayasandra'
const BOOKING_INTENT_KEY = 'rgss_booking_intent'

interface BookingIntent {
  date: string | null
  time: string | null
  serviceType: ServiceType
  categoryIds: string[]
  serviceIds: string[]
  notes: string
}

// --- Formatting helpers ---
function formatINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

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

// "15:30" or "15:30:00" → "03:30 PM"
function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const m = mStr ?? '00'
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${String(h12).padStart(2, '0')}:${m} ${period}`
}

// --- Component ---
interface BookingDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function BookingDialog({ isOpen, onClose }: BookingDialogProps) {
  const { data: session } = useSession()

  const [step, setStep] = useState(1)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [serviceType, setServiceType] = useState<ServiceType>('salon')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  // Data + async state
  const [categories, setCategories] = useState<ApiCategory[] | null>(null)
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState<string | null>(null)

  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [bookingNumber, setBookingNumber] = useState<string | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  const restoredRef = useRef(false)

  // Body scroll lock
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

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Focus trap
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
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
  }, [isOpen, step, isSubmitted, servicesLoading, slotsLoading])

  // Fetch services when the dialog opens (once).
  useEffect(() => {
    if (!isOpen || categories || servicesLoading) return
    let cancelled = false
    setServicesLoading(true)
    setServicesError(null)
    fetch('/api/services')
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not load services.')
        }
        return json.data.categories as ApiCategory[]
      })
      .then((cats) => {
        if (!cancelled) setCategories(cats)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setServicesError(
            err instanceof Error ? err.message : 'Could not load services.'
          )
        }
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, categories, servicesLoading])

  // Restore a saved booking intent (e.g. after returning from sign-in) once
  // services are available so the summary can render service names.
  useEffect(() => {
    if (!isOpen || !categories || restoredRef.current) return
    restoredRef.current = true
    if (typeof window === 'undefined') return
    const raw = sessionStorage.getItem(BOOKING_INTENT_KEY)
    if (!raw) return
    sessionStorage.removeItem(BOOKING_INTENT_KEY)
    try {
      const intent = JSON.parse(raw) as BookingIntent
      if (intent.date) setSelectedDate(new Date(`${intent.date}T00:00:00`))
      setSelectedTime(intent.time)
      setServiceType(intent.serviceType)
      setSelectedCategoryIds(intent.categoryIds ?? [])
      setSelectedServiceIds(intent.serviceIds ?? [])
      setNotes(intent.notes ?? '')
      setStep(4)
    } catch {
      // Corrupt intent — ignore and start fresh.
    }
  }, [isOpen, categories])

  // Fetch availability whenever a date is picked.
  useEffect(() => {
    if (!isOpen || !selectedDate) return
    let cancelled = false
    setSlotsLoading(true)
    setSlotsError(null)
    setSlots([])
    fetch(`/api/availability?date=${toISODate(selectedDate)}`)
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
          setSlotsError(
            err instanceof Error ? err.message : 'Could not load slots.'
          )
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, selectedDate])

  const reset = useCallback(() => {
    setStep(1)
    setSelectedDate(null)
    setSelectedTime(null)
    setServiceType('salon')
    setSelectedCategoryIds([])
    setSelectedServiceIds([])
    setNotes('')
    setSlots([])
    setSlotsError(null)
    setSubmitError(null)
    setSubmitting(false)
    setIsSubmitted(false)
    setBookingNumber(null)
    restoredRef.current = false
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  // Derived data
  const visibleCategories = useMemo(
    () => (categories ?? []).filter((c) => c.serviceType === serviceType),
    [categories, serviceType]
  )

  const allServices = useMemo(
    () => (categories ?? []).flatMap((c) => c.services),
    [categories]
  )

  const servicesById = useMemo(() => {
    const map = new Map<string, ApiService>()
    for (const s of allServices) map.set(s.id, s)
    return map
  }, [allServices])

  // Services grouped under their (selected) category, for step 3.
  const groupedSelectedCategories = useMemo(
    () => visibleCategories.filter((c) => selectedCategoryIds.includes(c.id)),
    [visibleCategories, selectedCategoryIds]
  )

  const totalPaise = useMemo(
    () =>
      selectedServiceIds.reduce(
        (sum, id) => sum + (servicesById.get(id)?.pricePaise ?? 0),
        0
      ),
    [selectedServiceIds, servicesById]
  )

  const totalDuration = useMemo(
    () =>
      selectedServiceIds.reduce(
        (sum, id) => sum + (servicesById.get(id)?.durationMinutes ?? 0),
        0
      ),
    [selectedServiceIds, servicesById]
  )

  const setServiceTypeAndReset = (t: ServiceType) => {
    setServiceType(t)
    setSelectedCategoryIds([])
    setSelectedServiceIds([])
  }

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((c) => c !== id)
        : [...prev, id]
      // Drop any selected services whose category is no longer selected.
      if (!next.includes(id)) {
        const cat = visibleCategories.find((c) => c.id === id)
        if (cat) {
          const removed = new Set(cat.services.map((s) => s.id))
          setSelectedServiceIds((svc) => svc.filter((s) => !removed.has(s)))
        }
      }
      return next
    })
  }

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const persistIntent = useCallback(() => {
    if (typeof window === 'undefined') return
    const intent: BookingIntent = {
      date: selectedDate ? toISODate(selectedDate) : null,
      time: selectedTime,
      serviceType,
      categoryIds: selectedCategoryIds,
      serviceIds: selectedServiceIds,
      notes,
    }
    sessionStorage.setItem(BOOKING_INTENT_KEY, JSON.stringify(intent))
  }, [
    selectedDate,
    selectedTime,
    serviceType,
    selectedCategoryIds,
    selectedServiceIds,
    notes,
  ])

  const handleSubmit = async () => {
    if (!selectedDate || !selectedTime || selectedServiceIds.length === 0) return

    // Not signed in → preserve intent and route through sign-in. Pass book=1
    // so the sign-in flow captures it and the dialog can auto-reopen on return.
    if (!session?.user) {
      persistIntent()
      window.location.href = '/sign-in?book=1'
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: DEFAULT_BRANCH_ID,
          serviceType,
          bookingDate: toISODate(selectedDate),
          startTime: selectedTime,
          serviceIds: selectedServiceIds,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(
          json?.error?.message ?? "Your booking couldn't be submitted."
        )
      }
      setBookingNumber(json.data.bookingNumber as string)
      setIsSubmitted(true)
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Your booking couldn't be submitted. Please try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const canNext1 = Boolean(selectedDate && selectedTime)
  const canNext2 = selectedCategoryIds.length > 0
  const canNext3 = selectedServiceIds.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-dialog-title"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-cocoa-dark/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        className="relative z-10 flex flex-col w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-[6px] bg-canvas-white sm:shadow-elevated overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cloud-gray">
          <h2
            id="booking-dialog-title"
            className="font-display text-[20px] text-cocoa-dark tracking-tight"
          >
            {isSubmitted ? 'Booking Submitted' : 'Book Appointment'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cloud-gray motion-safe:transition-colors"
            aria-label="Close booking dialog"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        {!isSubmitted && (
          <div
            className="flex items-center justify-center gap-2 py-3"
            aria-label={`Step ${step} of 4`}
          >
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full motion-safe:transition-colors duration-200 ${
                  s === step ? 'bg-deep-gold' : s < step ? 'bg-royal-gold' : 'bg-outline-gray'
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isSubmitted ? (
            <SuccessView bookingNumber={bookingNumber} onDone={handleClose} />
          ) : step === 1 ? (
            <Step1
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              slots={slots}
              slotsLoading={slotsLoading}
              slotsError={slotsError}
              onSelectDate={(d) => {
                setSelectedDate(d)
                setSelectedTime(null)
              }}
              onSelectTime={setSelectedTime}
            />
          ) : step === 2 ? (
            <Step2
              serviceType={serviceType}
              onServiceTypeChange={setServiceTypeAndReset}
              categories={visibleCategories}
              loading={servicesLoading}
              error={servicesError}
              selectedCategoryIds={selectedCategoryIds}
              onToggleCategory={toggleCategory}
            />
          ) : step === 3 ? (
            <Step3
              groupedCategories={groupedSelectedCategories}
              selectedServiceIds={selectedServiceIds}
              onToggleService={toggleService}
              totalPaise={totalPaise}
            />
          ) : (
            <Step4
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              serviceType={serviceType}
              selectedServices={selectedServiceIds
                .map((id) => servicesById.get(id))
                .filter((s): s is ApiService => Boolean(s))}
              totalPaise={totalPaise}
              totalDuration={totalDuration}
              notes={notes}
              onNotesChange={setNotes}
              submitError={submitError}
              isSignedIn={Boolean(session?.user)}
            />
          )}
        </div>

        {/* Footer */}
        {!isSubmitted && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-cloud-gray">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={submitting}
                className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-5 py-2.5 bg-cloud-gray text-cocoa-dark hover:bg-golden-mist motion-safe:transition-colors duration-200 disabled:opacity-40"
              >
                Back
              </button>
            ) : (
              <span />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={
                  (step === 1 && !canNext1) ||
                  (step === 2 && !canNext2) ||
                  (step === 3 && !canNext3)
                }
                className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-6 py-2.5 bg-royal-gold text-cocoa-dark hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || selectedServiceIds.length === 0}
                aria-busy={submitting}
                className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-6 py-2.5 bg-royal-gold text-cocoa-dark hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {submitting
                  ? 'Submitting…'
                  : session?.user
                    ? 'Submit Booking'
                    : 'Sign in to Book'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Step Components ---

function Step1({
  selectedDate,
  selectedTime,
  slots,
  slotsLoading,
  slotsError,
  onSelectDate,
  onSelectTime,
}: {
  selectedDate: Date | null
  selectedTime: string | null
  slots: AvailabilitySlot[]
  slotsLoading: boolean
  slotsError: string | null
  onSelectDate: (d: Date) => void
  onSelectTime: (t: string) => void
}) {
  const days = getNext14Days()

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-3">
          Select Date
        </h3>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {days.map((d) => {
            const isSelected = selectedDate?.toDateString() === d.toDateString()
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => onSelectDate(d)}
                className={`flex-shrink-0 flex flex-col items-center gap-0.5 w-14 py-2.5 rounded-[6px] border motion-safe:transition-all duration-200 ${
                  isSelected
                    ? 'bg-royal-gold border-deep-gold text-cocoa-dark'
                    : 'bg-canvas-white border-cloud-gray text-cocoa-dark hover:border-golden-mist'
                }`}
                aria-pressed={isSelected}
              >
                <span className="font-ui text-[10px] uppercase tracking-[1px]">{formatDay(d)}</span>
                <span className="font-sans text-[14px] font-medium">{formatDate(d)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-3">
          Select Time
        </h3>

        {!selectedDate ? (
          <p className="font-sans text-[14px] text-dusty-gray">
            Pick a date to see available times.
          </p>
        ) : slotsLoading ? (
          <div className="flex items-center gap-2 py-4" role="status" aria-live="polite">
            <Spinner />
            <span className="font-sans text-[14px] text-dusty-gray">Loading available times…</span>
          </div>
        ) : slotsError ? (
          <p className="font-sans text-[14px] text-error" role="alert">
            {slotsError}
          </p>
        ) : slots.length === 0 ? (
          <p className="font-sans text-[14px] text-dusty-gray">
            No slots available for this date. Try another day.
          </p>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {slots.map((slot) => {
              const isSelected = selectedTime === slot.startTime
              return (
                <button
                  key={slot.startTime}
                  type="button"
                  onClick={() => slot.available && onSelectTime(slot.startTime)}
                  disabled={!slot.available}
                  aria-pressed={isSelected}
                  aria-disabled={!slot.available}
                  className={`font-sans text-[13px] py-2 rounded-full border motion-safe:transition-all duration-200 ${
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
    </div>
  )
}

function Step2({
  serviceType,
  onServiceTypeChange,
  categories,
  loading,
  error,
  selectedCategoryIds,
  onToggleCategory,
}: {
  serviceType: ServiceType
  onServiceTypeChange: (t: ServiceType) => void
  categories: ApiCategory[]
  loading: boolean
  error: string | null
  selectedCategoryIds: string[]
  onToggleCategory: (id: string) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-3">
          Service Type
        </h3>
        <div
          className="inline-flex gap-1 rounded-full bg-cloud-gray p-1"
          role="radiogroup"
          aria-label="Service type"
        >
          {(['salon', 'spa'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={serviceType === t}
              onClick={() => onServiceTypeChange(t)}
              className={`font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-5 py-2 motion-safe:transition-colors duration-200 ${
                serviceType === t
                  ? 'bg-royal-gold text-cocoa-dark'
                  : 'bg-cloud-gray text-cocoa-dark hover:bg-golden-mist'
              }`}
            >
              {t === 'spa' ? 'SPA' : 'Salon'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-3">
          Categories
        </h3>

        {loading ? (
          <div className="flex items-center gap-2 py-4" role="status" aria-live="polite">
            <Spinner />
            <span className="font-sans text-[14px] text-dusty-gray">Loading categories…</span>
          </div>
        ) : error ? (
          <p className="font-sans text-[14px] text-error" role="alert">
            {error}
          </p>
        ) : categories.length === 0 ? (
          <p className="font-sans text-[14px] text-dusty-gray">
            No {serviceType === 'spa' ? 'SPA' : 'salon'} categories available right now.
          </p>
        ) : (
          <div className="space-y-2">
            {categories.map((cat) => {
              const isChecked = selectedCategoryIds.includes(cat.id)
              return (
                <label
                  key={cat.id}
                  className={`flex items-center gap-3 p-3 rounded-[6px] border cursor-pointer motion-safe:transition-all duration-200 ${
                    isChecked ? 'border-deep-gold bg-warm-cream' : 'border-cloud-gray hover:border-golden-mist'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleCategory(cat.id)}
                    className="w-4 h-4 accent-deep-gold"
                  />
                  <span className="font-sans text-[15px] text-cocoa-dark">{cat.name}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Step3({
  groupedCategories,
  selectedServiceIds,
  onToggleService,
  totalPaise,
}: {
  groupedCategories: ApiCategory[]
  selectedServiceIds: string[]
  onToggleService: (id: string) => void
  totalPaise: number
}) {
  const hasServices = groupedCategories.some((c) => c.services.length > 0)

  return (
    <div className="space-y-4">
      <h3 className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone">
        Select Services
      </h3>

      {!hasServices && (
        <p className="font-sans text-[14px] text-dusty-gray">
          No services found for the selected categories.
        </p>
      )}

      {groupedCategories.map((cat) => (
        <div key={cat.id} className="space-y-2">
          <h4 className="font-ui text-[11px] uppercase tracking-[1px] text-cocoa-dark">{cat.name}</h4>
          {cat.services.map((svc) => {
            const isChecked = selectedServiceIds.includes(svc.id)
            return (
              <label
                key={svc.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-[6px] border cursor-pointer motion-safe:transition-all duration-200 ${
                  isChecked ? 'border-deep-gold bg-warm-cream' : 'border-cloud-gray hover:border-golden-mist'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleService(svc.id)}
                    className="w-4 h-4 accent-deep-gold"
                  />
                  <div>
                    <span className="font-sans text-[15px] text-cocoa-dark">{svc.name}</span>
                    <span className="block font-sans text-[12px] text-dusty-gray">
                      {svc.durationMinutes} min
                    </span>
                  </div>
                </div>
                <span className="font-ui text-[13px] text-cocoa-dark">{formatINR(svc.pricePaise)}</span>
              </label>
            )
          })}
        </div>
      ))}

      {totalPaise > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between p-3 rounded-full bg-cocoa-dark text-canvas-white">
          <span className="font-ui text-[11px] uppercase tracking-[1px]">Total</span>
          <span className="font-ui text-[14px]">{formatINR(totalPaise)}</span>
        </div>
      )}
    </div>
  )
}

function Step4({
  selectedDate,
  selectedTime,
  serviceType,
  selectedServices,
  totalPaise,
  totalDuration,
  notes,
  onNotesChange,
  submitError,
  isSignedIn,
}: {
  selectedDate: Date | null
  selectedTime: string | null
  serviceType: ServiceType
  selectedServices: ApiService[]
  totalPaise: number
  totalDuration: number
  notes: string
  onNotesChange: (v: string) => void
  submitError: string | null
  isSignedIn: boolean
}) {
  return (
    <div className="space-y-5">
      <h3 className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone">
        Booking Summary
      </h3>

      <div className="space-y-3 p-4 rounded-[6px] bg-cloud-gray">
        <div className="flex justify-between font-sans text-[14px]">
          <span className="text-dusty-gray">Date</span>
          <span className="text-cocoa-dark">{selectedDate ? formatDate(selectedDate) : '—'}</span>
        </div>
        <div className="flex justify-between font-sans text-[14px]">
          <span className="text-dusty-gray">Time</span>
          <span className="text-cocoa-dark">{selectedTime ? formatTime12h(selectedTime) : '—'}</span>
        </div>
        <div className="flex justify-between font-sans text-[14px]">
          <span className="text-dusty-gray">Type</span>
          <span className="text-cocoa-dark capitalize">{serviceType}</span>
        </div>
        {totalDuration > 0 && (
          <div className="flex justify-between font-sans text-[14px]">
            <span className="text-dusty-gray">Duration</span>
            <span className="text-cocoa-dark">~{totalDuration} min</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone">Services</h4>
        {selectedServices.map((svc) => (
          <div
            key={svc.id}
            className="flex justify-between font-sans text-[14px] text-cocoa-dark"
          >
            <span>{svc.name}</span>
            <span>{formatINR(svc.pricePaise)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-outline-gray font-ui text-[14px] text-cocoa-dark">
          <span>Total</span>
          <span>{formatINR(totalPaise)}</span>
        </div>
      </div>

      <div>
        <label
          htmlFor="booking-notes"
          className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone block mb-2"
        >
          Notes (optional)
        </label>
        <textarea
          id="booking-notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Any special requests..."
          className="w-full rounded-[6px] border border-cloud-gray px-3 py-2 font-sans text-[14px] text-cocoa-dark placeholder:text-dusty-gray focus:outline-2 focus:outline-deep-gold focus:outline-offset-2 resize-none"
        />
      </div>

      {submitError && (
        <div
          className="rounded-[6px] border border-error/40 bg-error/5 px-4 py-3"
          role="alert"
          aria-live="polite"
        >
          <p className="font-sans text-[14px] text-error">{submitError}</p>
          <p className="font-sans text-[12px] text-dusty-gray mt-1">
            Or call us: +91 63601 35720
          </p>
        </div>
      )}

      <p className="font-sans text-[12px] text-dusty-gray">
        {isSignedIn
          ? 'Payment is collected at the salon. You will receive a confirmation once your booking is approved.'
          : 'You need to sign in to confirm this booking. We will keep your selections.'}
      </p>
    </div>
  )
}

function SuccessView({
  bookingNumber,
  onDone,
}: {
  bookingNumber: string | null
  onDone: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-5">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M9 16.5l5 5 9-10"
            stroke="#3F7D5C"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="font-display text-[24px] text-cocoa-dark mb-2">Booking Submitted!</h3>
      <p className="font-sans text-[15px] text-warm-gray max-w-xs mb-4">
        Our team will confirm your appointment shortly.
      </p>

      {bookingNumber && (
        <div className="mb-8 px-5 py-3 rounded-[6px] bg-warm-cream border border-golden-mist">
          <span className="block font-ui text-[10px] uppercase tracking-[1px] text-warm-stone mb-1">
            Booking Number
          </span>
          <span className="font-ui text-[16px] text-cocoa-dark tracking-[0.5px]">{bookingNumber}</span>
        </div>
      )}

      <div className="flex flex-col w-full max-w-xs gap-3">
        <a
          href="/bookings"
          className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-8 py-3 bg-royal-gold text-cocoa-dark hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all duration-200"
        >
          View My Bookings
        </a>
        <button
          type="button"
          onClick={onDone}
          className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-8 py-3 bg-cloud-gray text-cocoa-dark hover:bg-golden-mist motion-safe:transition-colors duration-200"
        >
          Done
        </button>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-deep-gold"
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
