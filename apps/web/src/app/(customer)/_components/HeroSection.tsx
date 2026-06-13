/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : HeroSection
 * Scope        : Customer Pages
 *
 * Description  : Homepage hero — two-column layout with a dark headline card
 *                and a salon image plus glassmorphism location/hours card.
 *
 * Responsibilities :
 * - Render the brand headline, sub-copy, and primary/secondary CTAs
 * - Render the hero image with an overlaid location + opening-hours card
 * - Surface service category tags as a quick-scan strip
 *
 * Features / Functionality :
 * - Motion fade/slide-in entrance (reduced-motion safe)
 * - Book Now (deep-link ?book=1) + Explore Services CTAs
 * - Glassmorphism location card with Visit CTA
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, motion
 * Layer        : Presentation (Component)
 *
 * Dependencies : next/link, motion/react
 *
 * Notes        : None
 ************************************************************/
'use client'

import { motion } from 'motion/react'
import Link from 'next/link'

const categories = ['HAIR', 'SPA', 'SKIN', 'BRIDAL', 'NAILS', 'GROOMING']

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="px-4 md:px-8 py-10 mx-auto w-full max-w-[1280px]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch min-h-[560px]">
        {/* ── Left Column — Dark Hero Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="bg-cocoa-dark rounded-[6px] p-8 sm:p-12 lg:p-16 flex flex-col justify-between"
        >
          <div>
            {/* Eyebrow */}
            <div className="flex items-center gap-2 mb-6">
              <span className="font-ui text-[10px] uppercase tracking-[0.2em] font-bold opacity-60 text-deep-gold">
                Royal Glow Salon &amp; Spa
              </span>
            </div>

            {/* Headline — intentional two-line split for desktop rhythm:
                "Where beauty" / "meets Royalty." */}
            <h1
              id="hero-heading"
              className="font-display font-black text-canvas-white text-[clamp(42px,6vw,72px)] leading-[1.05] tracking-[-0.03em]"
            >
              Where beauty
              <br />
              meets Royalty.
            </h1>

            {/* Body */}
            <p className="font-sans text-[17px] leading-[1.6] text-dusty-gray mt-6 max-w-[480px]">
              A premium salon and spa experience in Bengaluru. Hair, skin, nails and signature
              rituals — crafted by master artists in a calm, golden sanctuary.
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/?book=1"
                className="bg-warm-gold text-cocoa-dark font-ui font-bold text-sm px-8 py-4 rounded-xl inline-flex items-center gap-2 hover:bg-deep-gold transition-colors duration-200"
                aria-label="Book an appointment at Royal Glow"
              >
                Book Now <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/services"
                className="border border-white/25 text-canvas-white font-ui font-bold text-sm px-8 py-4 rounded-xl inline-flex items-center hover:bg-white/10 transition-colors duration-200"
              >
                Explore Services
              </Link>
            </div>
          </div>

          {/* Category Tags */}
          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2">
            {categories.map((cat) => (
              <span
                key={cat}
                className="font-ui text-[10px] font-bold uppercase tracking-widest opacity-40 text-canvas-white"
              >
                {cat}
              </span>
            ))}
          </div>
        </motion.div>

        {/* ── Right Column — Image + Location Bar ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: 'easeOut' }}
          className="flex flex-col gap-4"
        >
          {/* Hero Image */}
          <div className="relative rounded-[6px] overflow-hidden flex-1 min-h-[420px]">
            <img
              src="https://lh3.googleusercontent.com/aida/AP1WRLuIypHeztZ5YyYZEOFFKSHy0pL99IawVI2fGsXlSDpNMYzFOozcw5Y5VgXNowDHsEoZpkkghwmcHeea6UoV7mCUn7coMb45UfVZig5pko1Uh5CT4Ckt2zTfTir_UgE45-YDxef8iRrJrWz4UfGCblYOV1pYd_tBKSm28SmiTX6wUKR7AmL45IymtSAWfsqPryjD4KATSv0KmgyFN5bv0rWfckQ8uzRuV6hPJeF5qZAaMpDQWzP6ph8pLg"
              alt="Royal Glow salon interior — warm, premium atmosphere"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Glassmorphism overlay card */}
            <div className="absolute bottom-5 left-5 right-5 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-white flex justify-between items-end">
              <div>
                <div className="flex items-center gap-2 text-sm mb-1 opacity-90">
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 2.88-2.88 7.19-5 9.88C9.92 16.21 7 11.85 7 9z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                  RAYASANDRA · BENGALURU
                </div>
                <div className="flex items-center gap-2 text-sm opacity-80">
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                  </svg>
                  Open today · 10:00 — 21:00
                </div>
              </div>
              <Link
                href="/contact"
                className="bg-warm-gold text-cocoa-dark px-5 py-2 rounded-lg font-ui font-bold text-sm hover:bg-deep-gold transition-colors duration-200"
              >
                Visit
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
