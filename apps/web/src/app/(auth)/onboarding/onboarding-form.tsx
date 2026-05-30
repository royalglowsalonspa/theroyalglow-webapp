'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const AUTH_CONTEXT_KEY = 'rgss_auth_context'
const COOKIE_CONSENT_KEY = 'rgss_cookie_consent'

interface OnboardingFormProps {
  userName: string
  userEmail: string
}

interface FormErrors {
  name?: string
  phone?: string
  dateOfBirth?: string
  gender?: string
  privacyConsent?: string
}

export function OnboardingForm({ userName, userEmail }: OnboardingFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})

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
      // Get saved auth context from sessionStorage
      let context: Record<string, string> = {}
      if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem(AUTH_CONTEXT_KEY)
        if (stored) {
          context = JSON.parse(stored)
        }
      }

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

      router.push('/')
    } catch {
      setServerError('Connection failed. Check your internet and try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-xl font-semibold text-stone-900">
          Complete Your Profile
        </h1>
        <p className="text-sm text-stone-500">
          Tell us a bit about yourself to get started.
        </p>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium text-stone-700">
          Full Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          aria-required="true"
        />
        {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
      </div>

      {/* Email (disabled) */}
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-stone-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={userEmail}
          disabled
          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-500"
        />
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <label htmlFor="phone" className="block text-sm font-medium text-stone-700">
          Phone Number
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="9876543210"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          aria-required="true"
        />
        {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
      </div>

      {/* Date of Birth */}
      <div className="space-y-1.5">
        <label htmlFor="dateOfBirth" className="block text-sm font-medium text-stone-700">
          Date of Birth
        </label>
        <input
          id="dateOfBirth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          aria-required="true"
        />
        {errors.dateOfBirth && <p className="text-xs text-red-600">{errors.dateOfBirth}</p>}
      </div>

      {/* Gender */}
      <div className="space-y-1.5">
        <label htmlFor="gender" className="block text-sm font-medium text-stone-700">
          Gender
        </label>
        <select
          id="gender"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
          aria-required="true"
        >
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
        {errors.gender && <p className="text-xs text-red-600">{errors.gender}</p>}
      </div>

      {/* Consent Checkboxes */}
      <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
        <p className="text-sm font-medium text-stone-700">Consent & Preferences</p>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={privacyConsent}
            onChange={(e) => setPrivacyConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-stone-300"
            aria-required="true"
          />
          <span className="text-sm text-stone-600">
            I agree to the{' '}
            <a href="/privacy" className="underline underline-offset-2 hover:text-stone-900">
              Privacy Policy
            </a>{' '}
            <span className="text-red-500">*</span>
          </span>
        </label>
        {errors.privacyConsent && <p className="text-xs text-red-600">{errors.privacyConsent}</p>}

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={analyticsConsent}
            onChange={(e) => setAnalyticsConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-stone-300"
          />
          <span className="text-sm text-stone-600">
            Allow analytics to improve your experience
          </span>
        </label>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={(e) => setMarketingConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-stone-300"
          />
          <span className="text-sm text-stone-600">
            Receive offers and promotions via email/SMS
          </span>
        </label>
      </div>

      {/* Server Error */}
      {serverError && (
        <p className="text-sm text-red-600">{serverError}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Saving…' : 'Complete Profile'}
      </button>
    </form>
  )
}
