/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : NewsletterForm
 * Scope        : Customer Pages
 *
 * Description  : Blog newsletter signup form that captures an email and shows
 *                a confirmation message on submit (client-side state).
 *
 * Responsibilities :
 * - Capture a subscriber email address
 * - Show a success confirmation after submission
 *
 * Features / Functionality :
 * - Controlled input with local submit state
 * - Inline confirmation message
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : react
 *
 * Notes        : Submission is currently client-side only (no API wiring yet).
 ************************************************************/

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSubscribed(true)
    setEmail('')
  }

  return (
    <div className="mx-auto w-full max-w-[1278px] rounded-xl border border-outline-gray/15 bg-[#FFF8F5] p-8 text-center sm:p-12 lg:p-16">
      <p className="mb-3 font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-gold-ink">
        Stay in the glow
      </p>
      <h2 className="mb-4 font-display text-[clamp(28px,3.5vw,40px)] font-black leading-[1.15] tracking-tight text-cocoa-dark">
        Get beauty tips in your inbox
      </h2>
      <p className="mx-auto mb-8 max-w-lg font-sans text-[15px] leading-[1.6] text-warm-gray sm:text-[16px]">
        Monthly rituals, expert advice, and exclusive salon stories — delivered with care.
      </p>

      {subscribed ? (
        <div className="inline-block max-w-md rounded-lg bg-success/10 p-4 font-sans text-sm text-success">
          ✨ Thank you for subscribing! We&apos;ve added you to our journal list.
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-md flex-col justify-center gap-3 sm:flex-row"
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            className="h-11 flex-1"
            aria-label="Email address"
          />
          <Button type="submit" size="lg" className="h-11 font-ui font-bold">
            Subscribe
          </Button>
        </form>
      )}
    </div>
  )
}
