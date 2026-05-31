import Link from 'next/link'
import { BUSINESS } from '@/lib/seo/business'

/**
 * Minimal, distraction-free chrome for the static legal pages
 * (`/privacy`, `/terms`, `/refund-policy`).
 *
 * Server component only (SSG) — no client interactivity. A single wordmark
 * links back home, the content sits in a centred, readable prose column, and a
 * compact footer renders the canonical NAP from the `BUSINESS` constant so the
 * legal surfaces never drift from the rest of the site.
 */

const tel = `tel:${BUSINESS.telephone.replace(/[^\d+]/g, '')}`
const mailto = `mailto:${BUSINESS.email}`

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas-white">
      <a
        href="#legal-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-full focus:bg-royal-gold focus:px-4 focus:py-2 focus:font-ui focus:text-xs focus:uppercase focus:tracking-[0.5px] focus:text-cocoa-dark"
      >
        Skip to content
      </a>

      <header className="border-cloud-gray border-b">
        <div className="mx-auto flex h-16 max-w-[760px] items-center px-5">
          <Link
            href="/"
            className="font-display text-2xl text-cocoa-dark tracking-tight transition-colors duration-200 hover:text-deep-gold"
          >
            Royal Glow
          </Link>
        </div>
      </header>

      <main id="legal-content" className="flex-1">
        <div className="mx-auto max-w-[760px] px-5 py-12 lg:py-20">{children}</div>
      </main>

      <footer className="mt-auto bg-cocoa-dark text-canvas-white">
        <div className="mx-auto max-w-[760px] px-5 py-12">
          <Link
            href="/"
            className="font-display text-xl text-canvas-white tracking-tight"
          >
            Royal Glow
          </Link>

          <address className="mt-4 space-y-1 font-sans text-[15px] text-dusty-gray not-italic leading-[1.6]">
            <p>{BUSINESS.formattedAddress}</p>
            <p className="pt-2">
              <a
                href={tel}
                className="text-canvas-white transition-colors duration-200 hover:text-royal-gold"
              >
                {BUSINESS.telephone}
              </a>
            </p>
            <p>
              <a
                href={mailto}
                className="text-canvas-white transition-colors duration-200 hover:text-royal-gold"
              >
                {BUSINESS.email}
              </a>
            </p>
          </address>

          <nav
            aria-label="Legal links"
            className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-white/10 border-t pt-6"
          >
            <Link
              href="/privacy"
              className="font-sans text-[15px] text-dusty-gray transition-colors duration-200 hover:text-canvas-white"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="font-sans text-[15px] text-dusty-gray transition-colors duration-200 hover:text-canvas-white"
            >
              Terms of Service
            </Link>
            <Link
              href="/refund-policy"
              className="font-sans text-[15px] text-dusty-gray transition-colors duration-200 hover:text-canvas-white"
            >
              Refund Policy
            </Link>
            <Link
              href="/"
              className="font-sans text-[15px] text-dusty-gray transition-colors duration-200 hover:text-canvas-white"
            >
              Home
            </Link>
          </nav>

          <p className="mt-6 font-sans text-dusty-gray text-sm">
            © {new Date().getFullYear()} {BUSINESS.name}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
