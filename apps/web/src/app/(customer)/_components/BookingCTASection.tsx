/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingCTASection
 * Scope        : Customer Pages
 *
 * Description  : Homepage "Ready to Glow?" conversion banner explaining the
 *                3-step booking journey with primary + phone CTAs. Rebuilt on
 *                the shadcn/ui Button primitive with a motion Reveal and a
 *                lucide phone icon.
 *
 * Responsibilities :
 * - Communicate the simple 3-step booking process
 * - Drive bookings via the primary deep-link CTA
 * - Offer a phone fallback for assisted booking
 *
 * Features / Functionality :
 * - Numbered step cards
 * - Book Now (?book=1) primary CTA + tel: phone CTA
 * - Warm-gold themed banner background
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui,
 *                motion, lucide-react
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/components/ui/button, @/components/ui/motion/reveal,
 *                lucide-react, next/link
 *
 * Notes        : None
 ************************************************************/

import { Phone } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Reveal } from '@/components/ui/motion/reveal'

const steps = [
  {
    number: '1',
    title: 'Tell us your needs',
    description: "Hair, skin, spa, bridal — share what you're looking for.",
  },
  {
    number: '2',
    title: 'Pick your slot',
    description: 'Choose your stylist, date and a time that suits you.',
  },
  {
    number: '3',
    title: 'Step into royalty',
    description: 'Arrive, unwind and let our team take care of the rest.',
  },
]

export function BookingCTASection() {
  return (
    <section
      aria-labelledby="booking-cta-heading"
      className="mx-auto mb-20 w-full max-w-[1280px] px-4 py-16 md:px-8"
    >
      <Reveal
        className="rounded-xl border border-warm-gold/30 bg-golden-mist/30 p-8 sm:p-12 lg:p-20"
        as="div"
      >
        {/* Eyebrow */}
        <p className="mb-4 font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold">
          Ready to Glow?
        </p>

        {/* Heading */}
        <h2
          id="booking-cta-heading"
          className="mb-14 font-display text-[clamp(32px,4.5vw,52px)] font-black leading-[1.1] tracking-tight text-cocoa-dark"
        >
          Book your royal experience today
        </h2>

        {/* 3-Step Process */}
        <div className="mb-14 grid grid-cols-1 gap-10 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="flex flex-col items-start gap-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-warm-gold font-ui font-bold text-cocoa-dark">
                {step.number}
              </span>
              <h3 className="font-sans font-bold text-cocoa-dark">{step.title}</h3>
              <p className="font-sans text-sm leading-relaxed text-warm-gray">{step.description}</p>
            </div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center gap-5">
          <Button asChild variant="gold" size="lg" className="font-ui font-bold shadow-lg">
            <Link href="/?book=1" aria-label="Book your appointment now">
              Book Now
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-deep-gold font-ui font-bold text-cocoa-dark hover:bg-warm-gold/20"
          >
            <Link href="tel:+916360135720">
              <Phone data-icon="inline-start" aria-hidden="true" />
              Call us +91 63601 35720
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  )
}
