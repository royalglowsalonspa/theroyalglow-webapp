/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 12-06-2026
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
 * - Owner-managed hero image from the Payload `banner` collection, with a
 *   bundled on-brand SVG fallback when no banner is active
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui,
 *                Radix, motion, lucide-react
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/components/ui/button, @/components/ui/badge,
 *                @/lib/cms/types, motion/react, lucide-react, next/image,
 *                next/link
 *
 * Notes        :
 * - The hero image is the homepage LCP element, so it renders with `priority`
 *   (preload link, never lazy) plus an explicit `fetchPriority="high"`.
 * - The fallback is a local SVG; the Next.js image optimiser refuses SVG
 *   sources unless `dangerouslyAllowSVG` is on, so that path is `unoptimized`
 *   (an SVG is already resolution-independent and a few KB).
 ************************************************************/
'use client'

import { ArrowRight, Clock, MapPin } from 'lucide-react'
import { motion } from 'motion/react'
import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fadeInUp } from '@/components/ui/motion/motion-variants'
import type { ResolvedMedia } from '@/lib/cms/types'

const categories = ['HAIR', 'SPA', 'SKIN', 'BRIDAL', 'NAILS', 'GROOMING']

/**
 * Bundled brand artwork used when the CMS has no active banner image.
 *
 * Its alt is deliberately EMPTY: this is abstract decorative geometry, not a
 * photograph, and the adjacent `h1` plus body copy already carry the meaning.
 * Describing it as a salon interior would misinform screen-reader users, and
 * `alt=""` is the correct WCAG treatment for decorative imagery. A real photo
 * uploaded to the `banner` collection supplies its own descriptive alt.
 */
const FALLBACK_IMAGE_SRC = '/hero-fallback.svg'
const FALLBACK_IMAGE_ALT = ''

/**
 * Two columns under a 1280px cap: full viewport width below `lg`, half of the
 * container (minus padding and gap) at and above it.
 */
const HERO_IMAGE_SIZES = '(min-width: 1280px) 620px, (min-width: 1024px) 50vw, 100vw'

type HeroSectionProps = {
  /** Hero image from the first active Payload banner, when one is scheduled. */
  image?: ResolvedMedia | null
}

export function HeroSection({ image = null }: HeroSectionProps) {
  const usingFallback = image === null
  const imageSrc = image?.url ?? FALLBACK_IMAGE_SRC
  const imageAlt = image?.alt ?? FALLBACK_IMAGE_ALT

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
            {/* No opacity: at 60% the deep-gold computed to #826b3e on the dark hero
                = 3.69:1, below the 4.5:1 WCAG AA floor for this 10px bold text.
                Full deep-gold clears it comfortably. */}
            <p className="mb-6 font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold">
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
                // opacity-40 computed to #766f6c on the dark hero = 3.81:1, under the
                // 4.5:1 AA floor. 70% keeps the muted treatment while clearing it.
                className="px-0 font-ui text-[10px] font-bold uppercase tracking-widest text-canvas-white opacity-70"
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
            <Image
              src={imageSrc}
              alt={imageAlt}
              fill
              priority
              // Next 16 derives only the preload link from `priority`; the
              // fetchpriority hint on the element itself must be explicit.
              fetchPriority="high"
              sizes={HERO_IMAGE_SIZES}
              unoptimized={usingFallback}
              className="object-cover"
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
