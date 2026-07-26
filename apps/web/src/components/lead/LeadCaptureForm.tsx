/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : LeadCaptureForm
 * Scope        : Lead Capture UI
 *
 * Description  : Meta ad lead capture form (3 fields: name, phone, service).
 *                Submits to POST /api/leads and redirects to booking dialog.
 *                Rebuilt on the shadcn/ui Input, Label, and Button primitives
 *                with lucide icons.
 *
 * Responsibilities :
 * - Render accessible 3-field lead capture form
 * - Validate name and phone (10-digit Indian mobile)
 * - Submit lead with UTM parameters
 * - Show success/error states with retry option
 * - Fire lead_form_submitted analytics event
 * - Redirect to /?book=1&leadId={id} after success
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS, Next.js, shadcn/ui,
 *                lucide-react
 * Layer        : Frontend
 *
 * Dependencies : @/lib/analytics/events, next/navigation,
 *                @/components/ui/{input,label,button}, lucide-react
 *
 * Notes        : Designed for Meta ad landing page (/book)
 ************************************************************/

'use client'

import { Check, Loader2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { track } from '@/lib/analytics/events'

// Mirrors getServiceInterestOptions() rows.
type ServiceOption = {
  id: string
  name: string
  serviceType: 'salon' | 'spa'
}

type Utm = {
  utmSource?: string | undefined
  utmMedium?: string | undefined
  utmCampaign?: string | undefined
  utmContent?: string | undefined
  utmTerm?: string | undefined
}

type FormState = 'idle' | 'submitting' | 'success' | 'error'

type FieldErrors = {
  name?: string
  phone?: string
}

const SALON_PHONE = '+916360135720'
const SUCCESS_REDIRECT_DELAY_MS = 1500

const SERVICE_GROUP_LABELS: Record<ServiceOption['serviceType'], string> = {
  salon: 'Salon Services',
  spa: 'SPA Services',
}

const LABEL_CLASS = 'mb-1.5 font-ui text-sm font-medium text-warm-gray'

export function LeadCaptureForm({ services, utm }: { services: ServiceOption[]; utm: Utm }) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [serviceInterestedId, setServiceInterestedId] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState('')

  // Group services under their type so the dropdown reads naturally.
  const groupedServices = useMemo(() => {
    const salon = services.filter((s) => s.serviceType === 'salon')
    const spa = services.filter((s) => s.serviceType === 'spa')
    return [
      { type: 'salon' as const, options: salon },
      { type: 'spa' as const, options: spa },
    ].filter((group) => group.options.length > 0)
  }, [services])

  function validate(): boolean {
    const next: FieldErrors = {}
    if (!name.trim()) {
      next.name = 'Name is required'
    }
    // 10-digit Indian mobile, leading 6-9. Server re-validates + normalises.
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      next.phone = 'Enter a valid 10-digit mobile number'
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    if (!validate()) {
      return
    }

    setState('submitting')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          serviceInterestedId: serviceInterestedId || undefined,
          utmSource: utm.utmSource,
          utmMedium: utm.utmMedium,
          utmCampaign: utm.utmCampaign,
          utmContent: utm.utmContent,
          utmTerm: utm.utmTerm,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not submit your request.')
      }

      const leadId = json.data.leadId as string
      setState('success')
      track('lead_form_submitted')
      // Brief thank-you, then hand off to the homepage booking dialog.
      setTimeout(() => {
        router.push(`/?book=1&leadId=${encodeURIComponent(leadId)}`)
      }, SUCCESS_REDIRECT_DELAY_MS)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'We could not process your request.')
      setState('error')
    }
  }

  if (state === 'success') {
    return <SuccessCard />
  }

  if (state === 'error') {
    return (
      <ErrorCard
        message={submitError}
        onRetry={() => {
          setState('idle')
          setSubmitError('')
        }}
      />
    )
  }

  const isSubmitting = state === 'submitting'

  return (
    <section
      className="rounded-cards bg-canvas-white p-6 shadow-elevated sm:p-8"
      aria-labelledby="lead-form-heading"
    >
      {/* Brand + trust signals above the form */}
      <header className="mb-6 text-center">
        <p className="font-display text-2xl text-cocoa-dark">
          👑 Royal Glow <span className="text-gold-ink">Salon &amp; Spa</span>
        </p>
        <p className="mt-2 font-ui text-sm text-dusty-gray">⭐ 4.9 · 86 reviews · Bengaluru</p>
      </header>

      <h1 id="lead-form-heading" className="mb-5 text-center font-display text-xl text-cocoa-dark">
        Tell us what you&apos;re looking for
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {/* Name */}
        <div>
          <Label htmlFor="lead-name" className={LABEL_CLASS}>
            Name
          </Label>
          <Input
            id="lead-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'lead-name-error' : undefined}
            className="min-h-[44px] text-base"
          />
          {fieldErrors.name && (
            <p id="lead-name-error" className="mt-1.5 font-ui text-xs text-error" role="alert">
              {fieldErrors.name}
            </p>
          )}
        </div>

        {/* Phone with +91 prefix */}
        <div>
          <Label htmlFor="lead-phone" className={LABEL_CLASS}>
            Phone
          </Label>
          <div className="flex items-stretch">
            <span
              className="inline-flex min-h-[44px] items-center rounded-l-md border border-r-0 border-input bg-cloud-gray px-3 font-ui text-base text-warm-gray"
              aria-hidden="true"
            >
              +91
            </span>
            <Input
              id="lead-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              disabled={isSubmitting}
              placeholder="9876543210"
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? 'lead-phone-error' : undefined}
              className="min-h-[44px] rounded-l-none text-base"
            />
          </div>
          {fieldErrors.phone && (
            <p id="lead-phone-error" className="mt-1.5 font-ui text-xs text-error" role="alert">
              {fieldErrors.phone}
            </p>
          )}
        </div>

        {/* Service interest */}
        <div>
          <Label htmlFor="lead-service" className={LABEL_CLASS}>
            What are you interested in?
          </Label>
          <select
            id="lead-service"
            value={serviceInterestedId}
            onChange={(e) => setServiceInterestedId(e.target.value)}
            disabled={isSubmitting}
            className="min-h-[44px] w-full rounded-md border border-input bg-canvas-white px-3 py-2.5 font-ui text-base text-cocoa-dark outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
          >
            <option value="">Select service…</option>
            {groupedServices.map((group) => (
              <optgroup key={group.type} label={SERVICE_GROUP_LABELS[group.type]}>
                {group.options.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Primary CTA */}
        <Button
          type="submit"
          variant="gold"
          size="lg"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="min-h-[44px] w-full rounded-pill font-ui text-sm font-semibold uppercase tracking-[0.5px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Processing…
            </>
          ) : (
            'Continue to Booking'
          )}
        </Button>
      </form>

      {/* Legitimacy footer — address + phone only, no nav */}
      <footer className="mt-6 border-t border-cloud-gray pt-4 text-center font-ui text-xs text-dusty-gray">
        <address className="not-italic">
          📍 1st Floor, Narmada Complex, Rayasandra, Bengaluru
          <br />
          <a
            href={`tel:${SALON_PHONE}`}
            className="mt-1 inline-block underline underline-offset-2 hover:text-gold-ink"
          >
            📞 +91 63601 35720
          </a>
        </address>
      </footer>
    </section>
  )
}

function SuccessCard() {
  return (
    <section
      className="rounded-cards bg-canvas-white p-10 text-center shadow-elevated"
      aria-live="polite"
    >
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
        <Check className="size-7" strokeWidth={2.5} aria-hidden="true" />
      </div>
      <h1 className="font-display text-2xl text-cocoa-dark">Thank you!</h1>
      <p className="mt-2 font-sans text-sm text-dusty-gray">Taking you to booking…</p>
    </section>
  )
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="rounded-cards bg-canvas-white p-8 text-center shadow-elevated" role="alert">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-error/10 text-error">
        <X className="size-7" strokeWidth={2.5} aria-hidden="true" />
      </div>
      <h1 className="font-display text-xl text-cocoa-dark">Something went wrong</h1>
      <p className="mt-2 font-sans text-sm text-dusty-gray">
        {message || 'We couldn’t process your request.'} Please try again or call us directly.
      </p>
      <Button
        type="button"
        variant="gold"
        size="lg"
        onClick={onRetry}
        className="mt-5 rounded-pill font-ui text-sm font-semibold uppercase tracking-[0.5px]"
      >
        Try Again
      </Button>
      <p className="mt-4 font-ui text-sm">
        <a
          href={`tel:${SALON_PHONE}`}
          className="text-gold-ink underline underline-offset-2 hover:text-cocoa-dark"
        >
          📞 +91 63601 35720 (tap to call)
        </a>
      </p>
    </section>
  )
}
