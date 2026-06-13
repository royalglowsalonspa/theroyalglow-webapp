/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingCTASection
 * Scope        : Customer Pages
 *
 * Description  : Homepage "Ready to Glow?" conversion banner explaining the
 *                3-step booking journey with primary + phone CTAs.
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
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : next/link
 *
 * Notes        : None
 ************************************************************/
import Link from 'next/link'

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
      className="px-4 md:px-8 py-16 mx-auto w-full max-w-[1280px] mb-20"
    >
      <div className="bg-golden-mist/30 border border-warm-gold/30 rounded-xl p-8 sm:p-12 lg:p-20">
        {/* Eyebrow */}
        <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold mb-4">
          Ready to Glow?
        </p>

        {/* Heading */}
        <h2
          id="booking-cta-heading"
          className="font-display font-black text-cocoa-dark text-[clamp(32px,4.5vw,52px)] tracking-tight leading-[1.1] mb-14"
        >
          Book your royal experience today
        </h2>

        {/* 3-Step Process */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-14">
          {steps.map((step) => (
            <div key={step.number} className="flex flex-col items-start gap-4">
              <span className="w-10 h-10 rounded-full bg-warm-gold flex items-center justify-center font-ui font-bold text-cocoa-dark">
                {step.number}
              </span>
              <h3 className="font-sans font-bold text-cocoa-dark">{step.title}</h3>
              <p className="font-sans text-sm text-warm-gray leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center gap-5">
          <Link
            href="/?book=1"
            className="bg-warm-gold text-cocoa-dark px-8 py-3 rounded-lg font-ui font-bold text-sm hover:bg-deep-gold transition-colors duration-200 shadow-lg shadow-warm-gold/10"
            aria-label="Book your appointment now"
          >
            Book Now
          </Link>
          <Link
            href="tel:+916360135720"
            className="border border-deep-gold text-cocoa-dark px-8 py-3 rounded-lg font-ui font-bold text-sm hover:bg-warm-gold/20 transition-colors duration-200 flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
            Call us +91 63601 35720
          </Link>
        </div>
      </div>
    </section>
  )
}
