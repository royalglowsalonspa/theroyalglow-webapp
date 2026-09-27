/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 27-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : OnboardingForm
 * Scope        : Authentication UI
 *
 * Description  : Client form for collecting phone, DOB, gender, and consent
 *                preferences during first-time user onboarding. Rebuilt on the
 *                shadcn/ui Input, Label, Switch, and Button primitives with the
 *                Royal Glow brand tokens and font system.
 *
 * Responsibilities :
 * - Collect and validate profile fields (phone, DOB, gender)
 * - Collect privacy/analytics/marketing consent
 * - Submit to /api/onboarding/complete
 * - Persist consent to localStorage, clear sessionStorage context
 *
 * Tech Stack   : React, Next.js (client), Tailwind CSS v4, shadcn/ui
 * Layer        : Presentation (Component)
 *
 * Dependencies : react, next/navigation, @/components/ui/{input,label,switch,button}
 *
 * Notes        :
 * - Writes consent to localStorage key: rgss_cookie_consent
 * - Clears auth context from sessionStorage after successful submit
 * - Context comes from sessionStorage (saved before Google sign-in, or by the
 *   booking dialog) and from `bookingContext`, the onboarding URL's query
 *   string when Book Now sent a signed-in customer here. With booking intent,
 *   the form says the booking comes next and reopens it afterwards.
 ************************************************************/
'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  buildPostOnboardingDestination,
  mergeOnboardingContext,
} from '@/lib/post-onboarding-destination'

const AUTH_CONTEXT_KEY = 'rgss_auth_context'
const COOKIE_CONSENT_KEY = 'rgss_cookie_consent'

const NO_CONTEXT: Record<string, string> = {}

/** The context saved in sessionStorage, or none when it is missing or unreadable. */
function readStoredContext(): Record<string, string> {
  if (typeof window === 'undefined') {
    return NO_CONTEXT
  }
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(AUTH_CONTEXT_KEY) ?? 'null')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : NO_CONTEXT
  } catch {
    return NO_CONTEXT
  }
}

interface OnboardingFormProps {
  userName: string
  userEmail: string
  /** Booking and acquisition context from the onboarding URL (readBookingContext). */
  bookingContext?: Record<string, string>
}

interface FormErrors {
  name?: string
  phone?: string
  dateOfBirth?: string
  gender?: string
  privacyConsent?: string
}

const LABEL_CLASS = 'mb-1.5 font-ui text-sm font-medium text-warm-gray'
const SELECT_CLASS =
  'h-10 w-full rounded-md border border-input bg-canvas-white px-3 font-ui text-sm text-cocoa-dark outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60'

export function OnboardingForm({
  userName,
  userEmail,
  bookingContext = NO_CONTEXT,
}: OnboardingFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})

  // Whether the customer came here on the way to a booking. The URL context is
  // known on the server; the sessionStorage context only in the browser, so it
  // is read after mount to keep the first render identical on both.
  const [bookingNext, setBookingNext] = useState(bookingContext.book === '1')
  useEffect(() => {
    if (readStoredContext().book === '1') {
      setBookingNext(true)
    }
  }, [])

  const [name, setName] = useState(userName)
  const [phone, setPhone] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [gender, setGender] = useState('')
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [analyticsConsent, setAnalyticsConsent] = useState(false)
  const [marketingConsent, setMarketingConsent] = useState(false)

  function validate(): boolean {
    const newErrors: FormErrors = {}

    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      newErrors.phone = 'Enter a valid 10-digit Indian mobile number'
    }

    if (!dateOfBirth) {
      newErrors.dateOfBirth = 'Date of birth is required'
    }

    if (!gender) {
      newErrors.gender = 'Please select your gender'
    }

    if (!privacyConsent) {
      newErrors.privacyConsent = 'You must accept the privacy policy to continue'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError('')

    if (!validate()) return

    setIsSubmitting(true)

    try {
      // The saved auth context, plus the onboarding URL's context when Book Now
      // sent a signed-in customer here (see mergeOnboardingContext).
      const context = mergeOnboardingContext(readStoredContext(), bookingContext)

      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone,
          dateOfBirth,
          gender,
          privacyConsent,
          analyticsConsent,
          marketingConsent,
          utmSource: context.utm_source,
          utmCampaign: context.utm_campaign,
          utmMedium: context.utm_medium,
          leadId: context.leadId,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setServerError(data.error?.message ?? 'Something went wrong. Please try again.')
        setIsSubmitting(false)
        return
      }

      // Resolve the post-onboarding destination BEFORE the context is cleared.
      // A new customer who clicked "Book Now" was routed here by
      // newUserCallbackURL, which overrides BookingDialog's own `/?book=1`
      // callback, and a signed-in customer without a profile by the homepage's
      // booking gate — so the booking intent only survives if we replay it now.
      const destination = buildPostOnboardingDestination(context)

      // Write consent to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          COOKIE_CONSENT_KEY,
          JSON.stringify({
            v: 1,
            analytics: analyticsConsent,
            marketing: marketingConsent,
            ts: new Date().toISOString(),
          }),
        )
        // Clear auth context from sessionStorage
        sessionStorage.removeItem(AUTH_CONTEXT_KEY)
      }

      // Replace, not push: the completed form cannot be submitted again, so Back
      // from the booking should return to where the customer was before
      // onboarding, not to this form.
      router.replace(destination)
    } catch {
      setServerError('Connection failed. Check your internet and try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">
          Complete Your Profile
        </h1>
        <p className="font-sans text-sm text-warm-gray">
          {bookingNext
            ? 'We need a few details before you book. You’ll go straight back to your booking afterwards.'
            : 'Tell us a bit about yourself to get started.'}
        </p>
      </div>

      {/* Name */}
      <div>
        <Label htmlFor="name" className={LABEL_CLASS}>
          Full Name
        </Label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-10"
          aria-required="true"
        />
        {errors.name && <p className="mt-1.5 font-ui text-xs text-error">{errors.name}</p>}
      </div>

      {/* Email (disabled) */}
      <div>
        <Label htmlFor="email" className={LABEL_CLASS}>
          Email
        </Label>
        <Input id="email" type="email" value={userEmail} disabled className="h-10 bg-cloud-gray" />
      </div>

      {/* Phone */}
      <div>
        <Label htmlFor="phone" className={LABEL_CLASS}>
          Phone Number
        </Label>
        <Input
          id="phone"
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="9876543210"
          className="h-10"
          aria-required="true"
        />
        {errors.phone && <p className="mt-1.5 font-ui text-xs text-error">{errors.phone}</p>}
      </div>

      {/* Date of Birth */}
      <div>
        <Label htmlFor="dateOfBirth" className={LABEL_CLASS}>
          Date of Birth
        </Label>
        <Input
          id="dateOfBirth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className="h-10"
          aria-required="true"
        />
        {errors.dateOfBirth && (
          <p className="mt-1.5 font-ui text-xs text-error">{errors.dateOfBirth}</p>
        )}
      </div>

      {/* Gender */}
      <div>
        <Label htmlFor="gender" className={LABEL_CLASS}>
          Gender
        </Label>
        <select
          id="gender"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className={SELECT_CLASS}
          aria-required="true"
        >
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
        {errors.gender && <p className="mt-1.5 font-ui text-xs text-error">{errors.gender}</p>}
      </div>

      {/* Consent toggles */}
      <div className="flex flex-col gap-4 rounded-md border border-cloud-gray bg-warm-cream/40 p-4">
        <p className="font-ui text-sm font-medium text-warm-gray">Consent &amp; Preferences</p>

        <div className="flex items-start justify-between gap-3">
          <Label htmlFor="privacy-consent" className="flex-1 cursor-pointer font-normal">
            <span className="font-sans text-sm text-cocoa-dark">
              I agree to the{' '}
              <a href="/privacy" className="underline underline-offset-2 hover:text-gold-ink">
                Privacy Policy
              </a>{' '}
              <span className="text-error">*</span>
            </span>
          </Label>
          <Switch
            id="privacy-consent"
            checked={privacyConsent}
            onCheckedChange={setPrivacyConsent}
            aria-required="true"
            className="mt-0.5"
          />
        </div>
        {errors.privacyConsent && (
          <p className="font-ui text-xs text-error">{errors.privacyConsent}</p>
        )}

        <div className="flex items-start justify-between gap-3">
          <Label htmlFor="analytics-consent" className="flex-1 cursor-pointer font-normal">
            <span className="font-sans text-sm text-cocoa-dark">
              Allow analytics to improve your experience
            </span>
          </Label>
          <Switch
            id="analytics-consent"
            checked={analyticsConsent}
            onCheckedChange={setAnalyticsConsent}
            className="mt-0.5"
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <Label htmlFor="marketing-consent" className="flex-1 cursor-pointer font-normal">
            <span className="font-sans text-sm text-cocoa-dark">
              Receive offers and promotions via email/SMS
            </span>
          </Label>
          <Switch
            id="marketing-consent"
            checked={marketingConsent}
            onCheckedChange={setMarketingConsent}
            className="mt-0.5"
          />
        </div>
      </div>

      {/* Server Error */}
      {serverError && <p className="font-ui text-sm text-error">{serverError}</p>}

      {/* Submit */}
      <Button
        type="submit"
        variant="gold"
        size="lg"
        disabled={isSubmitting}
        className="font-ui font-bold"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : bookingNext ? (
          'Continue to Booking'
        ) : (
          'Complete Profile'
        )}
      </Button>
    </form>
  )
}
