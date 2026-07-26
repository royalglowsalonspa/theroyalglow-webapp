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
 *                Rebuilt on the shadcn/ui + Radix primitive layer (Button) with
 *                motion entrance variants and lucide icons.
 *
 * Responsibilities :
 * - Render the brand headline, sub-copy, and primary/secondary CTAs (Button)
 * - Render the hero image with an overlaid location + opening-hours card
 * - Surface service category tags as a quick-scan strip (Badge)
 *
 * Features / Functionality :
 * - Motion fade/slide-in entrance (reduced-motion safe via variants)
 * - Book Now (deep-link ?book=1) + Explore Services CTAs
 * - Glassmorphism location card with Visit CTA
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui,
 *                Radix, motion, lucide-react
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/components/ui/button, @/components/ui/badge, motion/react,
 *                lucide-react, next/link
 *
 * Notes        : None
 ************************************************************/
'use client'

import { ArrowRight, Clock, MapPin } from 'lucide-react'
import { motion } from 'motion/react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fadeInUp } from '@/components/ui/motion/motion-variants'

const categories = ['HAIR', 'SPA', 'SKIN', 'BRIDAL', 'NAILS', 'GROOMING']

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto w-full max-w-[1280px] px-4 py-10 md:px-8"
    >
      <div className="grid min-h-[560px] grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* ── Left Column — Dark Hero Card ── */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col justify-between rounded-[6px] bg-cocoa-dark p-8 sm:p-12 lg:p-16"
        >
          <div>
            {/* Eyebrow */}
            <p className="mb-6 font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold opacity-60">
              Royal Glow Salon &amp; Spa
            </p>

            {/* Headline — each phrase is a non-wrapping block so it always
                renders as exactly two lines. */}
            <h1
              id="hero-heading"
              className="font-display text-[clamp(34px,4.5vw,58px)] font-black leading-[1.05] tracking-[-0.03em] text-canvas-white"
            >
              <span className="block whitespace-nowrap">Where beauty</span>
              <span className="block whitespace-nowrap">meets Royalty.</span>
            </h1>

            {/* Body */}
            <p className="mt-6 max-w-[480px] font-sans text-[17px] leading-[1.6] text-dusty-gray">
              A premium salon and spa experience in Bengaluru. Hair, skin, nails and signature
              rituals — crafted by master artists in a calm, golden sanctuary.
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-wrap gap-4">
              <Button asChild variant="gold" size="lg" className="font-ui font-bold">
                <Link href="/?book=1" aria-label="Book an appointment at Royal Glow">
                  Book Now
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="onDark" size="lg" className="font-ui font-bold">
                <Link href="/services">Explore Services</Link>
              </Button>
            </div>
          </div>

          {/* Category Tags */}
          <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2">
            {categories.map((cat) => (
              <Badge
                key={cat}
                variant="ghost"
                className="px-0 font-ui text-[10px] font-bold uppercase tracking-widest text-canvas-white opacity-40"
              >
                {cat}
              </Badge>
            ))}
          </div>
        </motion.div>

        {/* ── Right Column — Image + Location Bar ── */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.12 }}
          className="flex flex-col gap-4"
        >
          {/* Hero Image */}
          <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-[6px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://lh3.googleusercontent.com/aida/AP1WRLuIypHeztZ5YyYZEOFFKSHy0pL99IawVI2fGsXlSDpNMYzFOozcw5Y5VgXNowDHsEoZpkkghwmcHeea6UoV7mCUn7coMb45UfVZig5pko1Uh5CT4Ckt2zTfTir_UgE45-YDxef8iRrJrWz4UfGCblYOV1pYd_tBKSm28SmiTX6wUKR7AmL45IymtSAWfsqPryjD4KATSv0KmgyFN5bv0rWfckQ8uzRuV6hPJeF5qZAaMpDQWzP6ph8pLg"
              alt="Royal Glow salon interior — warm, premium atmosphere"
              className="absolute inset-0 size-full object-cover"
            />
            {/* Glassmorphism overlay card */}
            <div className="absolute inset-x-5 bottom-5 flex items-end justify-between rounded-2xl border border-white/20 bg-white/10 p-5 text-white backdrop-blur-md">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2 font-ui text-sm opacity-90">
                  <MapPin className="size-4 shrink-0" aria-hidden="true" />
                  RAYASANDRA · BENGALURU
                </span>
                <span className="flex items-center gap-2 font-ui text-sm opacity-80">
                  <Clock className="size-4 shrink-0" aria-hidden="true" />
                  Open today · 10:00 — 21:00
                </span>
              </div>
              <Button asChild variant="gold" size="sm" className="font-ui font-bold">
                <Link href="/contact">Visit</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
