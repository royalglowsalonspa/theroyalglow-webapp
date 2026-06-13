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
    <div className="bg-[#FFF8F5] border border-outline-gray/15 rounded-xl p-8 sm:p-12 lg:p-16 text-center max-w-[1278px] mx-auto w-full">
      <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold mb-3">
        Stay in the glow
      </p>
      <h2 className="font-display font-black text-cocoa-dark text-[clamp(28px,3.5vw,40px)] tracking-tight leading-[1.15] mb-4">
        Get beauty tips in your inbox
      </h2>
      <p className="font-sans text-[15px] sm:text-[16px] leading-[1.6] text-warm-gray max-w-lg mx-auto mb-8">
        Monthly rituals, expert advice, and exclusive salon stories — delivered with care.
      </p>

      {subscribed ? (
        <div className="bg-emerald-50 text-emerald-800 rounded-lg p-4 font-sans text-sm inline-block max-w-md">
          ✨ Thank you for subscribing! We&apos;ve added you to our journal list.
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto justify-center"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            className="flex-1 px-4 py-3 rounded-lg border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark placeholder-dusty-gray focus:outline-none focus:ring-2 focus:ring-deep-gold"
          />
          <button
            type="submit"
            className="bg-cocoa-dark text-canvas-white px-7 py-3 rounded-lg font-ui font-bold text-sm hover:bg-warm-gray transition-colors duration-200 cursor-pointer"
          >
            Subscribe
          </button>
        </form>
      )}
    </div>
  )
}
