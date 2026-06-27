/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ContactForm
 * Scope        : Customer Pages
 *
 * Description  : Interactive contact enquiry form for the /contact page.
 *                Validates name/email/optional-phone/message client-side, then
 *                submits to POST /api/contact and surfaces accessible success
 *                and error states.
 *
 * Responsibilities :
 * - Render an accessible, controlled enquiry form (every input has a <label>)
 * - Validate required fields before submit; show inline field errors
 * - POST the enquiry and reflect submitting / success / error state
 * - Announce status changes via aria-live so screen readers are informed
 *
 * Features / Functionality :
 * - Disabled button + spinner while submitting (prevents double submit)
 * - +91 prefix UI for the optional phone (digits-only, max 10)
 * - Server is the source of truth — client validation is a UX nicety only
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS v4, Next.js 16
 * Layer        : Presentation (Client Component)
 *
 * Dependencies : react
 *
 * Notes        :
 * - Mirrors the established fetch pattern in components/lead/LeadCaptureForm.
 * - Phone is OPTIONAL (only validated when a value is entered).
 ************************************************************/

'use client'

import { useState } from 'react'

// Lifecycle of the form. `idle` accepts input; `submitting` locks the button;
// `success` swaps the form for a confirmation; `error` keeps the form and shows
// a retryable banner so the customer doesn't lose what they typed.
type FormState = 'idle' | 'submitting' | 'success' | 'error'

type FieldErrors = {
  name?: string
  email?: string
  phone?: string
  message?: string
}

// Basic email shape check — purely for fast UX feedback. The server (Zod) is
// the authoritative validator.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// 10-digit Indian mobile, leading 6-9 (matches the server schema's accept set).
const PHONE_RE = /^[6-9]\d{9}$/

// Shared input classes — preserves the page's original visual language
// (gold focus ring, cloud-gray border, 6px radius) while meeting the 4.5:1
// contrast + visible-focus requirements (WCAG 2.1 AA).
const INPUT_CLASS =
  'w-full h-10 px-4 font-sans text-[15px] text-cocoa-dark bg-canvas-white border border-cloud-gray rounded-[6px] placeholder:text-dusty-gray focus:outline-2 focus:outline-deep-gold focus:outline-offset-2 transition-colors duration-200 disabled:opacity-60 aria-[invalid=true]:border-error'

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState('')

  const isSubmitting = state === 'submitting'

  // Client-side validation. Returns true when the form is good to send. Phone is
  // optional: only validated when the customer actually entered something.
  function validate(): boolean {
    const next: FieldErrors = {}
    if (!name.trim()) {
      next.name = 'Name is required'
    }
    if (!EMAIL_RE.test(email.trim())) {
      next.email = 'Enter a valid email address'
    }
    if (phone.trim() && !PHONE_RE.test(phone.trim())) {
      next.phone = 'Enter a valid 10-digit mobile number'
    }
    if (message.trim().length < 10) {
      next.message = 'Message must be at least 10 characters'
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
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          // Omit phone entirely when blank so the optional server field stays absent.
          phone: phone.trim() || undefined,
          message: message.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not send your message.')
      }
      setState('success')
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'We could not send your message.')
      setState('error')
    }
  }

  // Success replaces the form. aria-live announces it to assistive tech.
  if (state === 'success') {
    return (
      <div
        aria-live="polite"
        className="rounded-[6px] border border-success/30 bg-success/10 p-6 text-center"
      >
        <p className="font-display text-cocoa-dark text-[22px] leading-[1.2]">Message sent</p>
        <p className="font-sans text-[15px] leading-[1.55] text-warm-gray mt-2">
          Thanks for reaching out. We&apos;ll get back to you shortly.
        </p>
      </div>
    )
  }

  return (
    <form className="mt-8 space-y-6" aria-label="Contact form" onSubmit={handleSubmit} noValidate>
      {/* Submit-level error banner. role="alert" + aria-live announce failures. */}
      {state === 'error' && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-[6px] border border-error/30 bg-error/10 px-4 py-3 font-sans text-sm text-error"
        >
          {submitError || 'Something went wrong. Please try again or call us directly.'}
        </div>
      )}

      {/* Name */}
      <div>
        <label
          htmlFor="contact-name"
          className="block font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark mb-2"
        >
          Name
        </label>
        <input
          type="text"
          id="contact-name"
          name="name"
          autoComplete="name"
          required
          aria-required="true"
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? 'contact-name-error' : undefined}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSubmitting}
          placeholder="Your full name"
          className={INPUT_CLASS}
        />
        {fieldErrors.name && (
          <p id="contact-name-error" className="mt-1.5 font-sans text-xs text-error" role="alert">
            {fieldErrors.name}
          </p>
        )}
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="contact-email"
          className="block font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark mb-2"
        >
          Email
        </label>
        <input
          type="email"
          id="contact-email"
          name="email"
          autoComplete="email"
          required
          aria-required="true"
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'contact-email-error' : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          placeholder="you@example.com"
          className={INPUT_CLASS}
        />
        {fieldErrors.email && (
          <p id="contact-email-error" className="mt-1.5 font-sans text-xs text-error" role="alert">
            {fieldErrors.email}
          </p>
        )}
      </div>

      {/* Phone (optional) */}
      <div>
        <label
          htmlFor="contact-phone"
          className="block font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark mb-2"
        >
          Phone <span className="text-warm-gray normal-case tracking-normal">(optional)</span>
        </label>
        <div className="flex">
          <span
            className="inline-flex items-center px-3 h-10 font-sans text-[15px] text-warm-gray bg-cloud-gray border border-r-0 border-cloud-gray rounded-l-[6px]"
            aria-hidden="true"
          >
            +91
          </span>
          <input
            type="tel"
            id="contact-phone"
            name="phone"
            inputMode="numeric"
            autoComplete="tel-national"
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? 'contact-phone-error' : undefined}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            disabled={isSubmitting}
            placeholder="63601 35720"
            className="w-full h-10 px-4 font-sans text-[15px] text-cocoa-dark bg-canvas-white border border-cloud-gray rounded-r-[6px] placeholder:text-dusty-gray focus:outline-2 focus:outline-deep-gold focus:outline-offset-2 transition-colors duration-200 disabled:opacity-60 aria-[invalid=true]:border-error"
          />
        </div>
        {fieldErrors.phone && (
          <p id="contact-phone-error" className="mt-1.5 font-sans text-xs text-error" role="alert">
            {fieldErrors.phone}
          </p>
        )}
      </div>

      {/* Message */}
      <div>
        <label
          htmlFor="contact-message"
          className="block font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark mb-2"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          aria-required="true"
          aria-invalid={Boolean(fieldErrors.message)}
          aria-describedby={fieldErrors.message ? 'contact-message-error' : undefined}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isSubmitting}
          placeholder="How can we help you?"
          className="w-full px-4 py-3 font-sans text-[15px] text-cocoa-dark bg-canvas-white border border-cloud-gray rounded-[6px] placeholder:text-dusty-gray resize-y focus:outline-2 focus:outline-deep-gold focus:outline-offset-2 transition-colors duration-200 disabled:opacity-60 aria-[invalid=true]:border-error"
        />
        {fieldErrors.message && (
          <p
            id="contact-message-error"
            className="mt-1.5 font-sans text-xs text-error"
            role="alert"
          >
            {fieldErrors.message}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className="bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 inline-flex items-center justify-center gap-2 hover:bg-deep-gold hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 motion-safe:transition-all motion-safe:duration-200"
      >
        {isSubmitting ? (
          <>
            <Spinner />
            <span>Sending…</span>
          </>
        ) : (
          'Send Message'
        )}
      </button>
    </form>
  )
}

// Inline spinner shown while submitting. Decorative — hidden from assistive
// tech (the aria-busy button + "Sending…" label already convey state).
function Spinner() {
  return (
    <svg
      className="h-4 w-4 motion-safe:animate-spin"
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
