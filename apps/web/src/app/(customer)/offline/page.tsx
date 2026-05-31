import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "You're Offline | Royal Glow Salon & Spa",
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <section aria-labelledby="offline-heading" className="px-5 py-20">
      <div className="mx-auto max-w-[1278px]">
        <div className="bg-cocoa-dark rounded-[6px] p-8 sm:p-12 lg:p-16 text-center">
          {/* Eyebrow */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="w-2 h-2 rounded-full bg-royal-gold" aria-hidden="true" />
            <span className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone">
              No Connection
            </span>
          </div>

          {/* Headline */}
          <h1
            id="offline-heading"
            className="font-display text-canvas-white tracking-[-1.44px] leading-[1.03] text-[clamp(40px,6vw,72px)]"
          >
            You're offline
          </h1>

          {/* Message */}
          <p className="font-sans text-[17px] leading-[1.6] text-dusty-gray mt-6 max-w-[480px] mx-auto">
            We can't reach Royal Glow right now. Check your connection and try
            again — your appointments and offers will be waiting for you.
          </p>

          {/* Retry + contact */}
          <div className="mt-8 flex flex-col items-center gap-4">
            <Link
              href="/"
              className="inline-flex bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 items-center justify-center hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all motion-safe:duration-200"
            >
              Try Again
            </Link>
            <p className="font-sans text-[15px] leading-[1.55] text-warm-stone">
              Need us now? Call{' '}
              <a
                href="tel:+916360135720"
                className="font-ui text-royal-gold underline underline-offset-2 hover:text-warm-gold transition-colors duration-200"
              >
                +91 63601 35720
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
