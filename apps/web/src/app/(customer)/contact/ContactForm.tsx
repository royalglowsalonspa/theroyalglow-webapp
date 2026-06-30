/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ContactForm
 * Scope        : Customer Pages
 *
 * Description  : Interactive contact enquiry form for the /contact page.
 *                Validates name/email/optional-phone/message client-side, then
 *                submits to POST /api/contact and surfaces accessible success
 *                and error states. Rebuilt on the shadcn/ui Input, Textarea,
 *                Label, and Button primitives.
 *
 * Responsibilities :
 * - Render an accessible, controlled enquiry form (every input has a <Label>)
 * - Validate required fields before submit; show inline field errors
 * - POST the enquiry and reflect submitting / success / error state
 * - Announce status changes via aria-live so screen readers are informed
 *
 * Features / Functionality :
 * - Disabled button + spinner while submitting (prevents double submit)
 * - +91 prefix UI for the optional phone (digits-only, max 10)
 * - Server is the source of truth — client validation is a UX nicety only
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS v4, Next.js 16, shadcn/ui,
 *                lucide-react
 * Layer        : Presentation (Client Component)
 *
 * Dependencies : react, @/components/ui/{input,textarea,label,button},
 *                lucide-react
 *
 * Notes        :
 * - Mirrors the established fetch pattern in components/lead/LeadCaptureForm.
 * - Phone is OPTIONAL (only validated when a value is entered).
 ************************************************************/

'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
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

const LABEL_CLASS = 'mb-2 font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark'

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
        <p className="font-display text-[22px] leading-[1.2] text-cocoa-dark">Message sent</p>
        <p className="mt-2 font-sans text-[15px] leading-[1.55] text-warm-gray">
          Thanks for reaching out. We&apos;ll get back to you shortly.
        </p>
      </div>
    )
  }

  return (
    <form
      className="mt-8 flex flex-col gap-6"
      aria-label="Contact form"
      onSubmit={handleSubmit}
      noValidate
    >
      {/* Submit-level error banner. role="alert" + aria-live announce failures. */}
      {state === 'error' && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-[6px] border border-error/30 bg-error/10 px-4 py-3 font-ui text-sm text-error"
        >
          {submitError || 'Something went wrong. Please try again or call us directly.'}
        </div>
      )}

      {/* Name */}
      <div>
        <Label htmlFor="contact-name" className={LABEL_CLASS}>
          Name
        </Label>
        <Input
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
          className="h-10"
        />
        {fieldErrors.name && (
          <p id="contact-name-error" className="mt-1.5 font-ui text-xs text-error" role="alert">
            {fieldErrors.name}
          </p>
        )}
      </div>

      {/* Email */}
      <div>
        <Label htmlFor="contact-email" className={LABEL_CLASS}>
          Email
        </Label>
        <Input
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
          className="h-10"
        />
        {fieldErrors.email && (
          <p id="contact-email-error" className="mt-1.5 font-ui text-xs text-error" role="alert">
            {fieldErrors.email}
          </p>
        )}
      </div>

      {/* Phone (optional) */}
      <div>
        <Label htmlFor="contact-phone" className={LABEL_CLASS}>
          Phone <span className="normal-case tracking-normal text-warm-gray">(optional)</span>
        </Label>
        <div className="flex">
          <span
            className="inline-flex h-10 items-center rounded-l-md border border-r-0 border-input bg-cloud-gray px-3 font-ui text-[15px] text-warm-gray"
            aria-hidden="true"
          >
            +91
          </span>
          <Input
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
            className="h-10 rounded-l-none"
          />
        </div>
        {fieldErrors.phone && (
          <p id="contact-phone-error" className="mt-1.5 font-ui text-xs text-error" role="alert">
            {fieldErrors.phone}
          </p>
        )}
      </div>

      {/* Message */}
      <div>
        <Label htmlFor="contact-message" className={LABEL_CLASS}>
          Message
        </Label>
        <Textarea
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
          className="resize-y"
        />
        {fieldErrors.message && (
          <p id="contact-message-error" className="mt-1.5 font-ui text-xs text-error" role="alert">
            {fieldErrors.message}
          </p>
        )}
      </div>

      {/* Submit */}
      <div>
        <Button
          type="submit"
          variant="gold"
          size="lg"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="rounded-full font-ui text-xs uppercase tracking-[0.5px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : (
            'Send Message'
          )}
        </Button>
      </div>
    </form>
  )
}
