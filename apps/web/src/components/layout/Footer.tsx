/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 07-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Footer
 * Scope        : Layout
 *
 * Description  : Site-wide footer rebuilt to exactly match the Stitch MCP
 *                design. Light warm surface background (#fff8f5), 12-col grid,
 *                4 columns: Brand/NAP, Explore links, Account links, Social + Email.
 *                Bottom bar: copyright + legal links + cookie preferences.
 *
 * Responsibilities :
 * - Display brand name, address (Rayasandra), opening hours
 * - Render Explore column: Services, Offers, Gems Catalogue, Blog, About, Contact, FAQ
 * - Render Account column: Sign in, Book Now, Bookings, Membership, Favorites, Profile
 * - Render Follow Us: Instagram, Facebook, YouTube, LinkedIn social icons
 * - Display Email Us link (hello@theroyalglow.in)
 * - Bottom bar: copyright, Legal, Privacy Policy, Terms, Refund, Cookie Preferences
 *
 * Tech Stack   : React, TypeScript, Next.js, Tailwind CSS v4
 * Layer        : Presentation (Layout — Server Component)
 *
 * Dependencies : CookiePreferencesButton, next/link
 *
 * Notes        : Server component — no 'use client' needed
 ************************************************************/

import { CookiePreferencesButton } from '@/components/consent/CookiePreferencesButton'
import Link from 'next/link'

const exploreLinks = [
  { href: '/services', label: 'Services' },
  { href: '/offers', label: 'Offers' },
  { href: '/gems', label: 'Gems Catalogue' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/faq', label: 'FAQ' },
]

const accountLinks = [
  { href: '/sign-in', label: 'Sign in' },
  { href: '/?book=1', label: 'Book Now' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/membership', label: 'Membership' },
  { href: '/profile', label: 'Favorites' },
  { href: '/profile', label: 'Profile' },
]

const SOCIAL_PATHS: Record<string, string> = {
  instagram:
    'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
  facebook:
    'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  youtube:
    'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  linkedin:
    'M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z',
}

const socialLinks = [
  { href: 'https://instagram.com/theroyalglow', label: 'Follow us on Instagram', key: 'instagram' },
  { href: 'https://facebook.com/theroyalglow', label: 'Follow us on Facebook', key: 'facebook' },
  { href: 'https://youtube.com/@theroyalglow', label: 'Watch us on YouTube', key: 'youtube' },
  {
    href: 'https://linkedin.com/company/theroyalglow',
    label: 'Connect on LinkedIn',
    key: 'linkedin',
  },
]

export function Footer() {
  return (
    <footer
      className="border-t border-outline-gray font-sans"
      style={{ backgroundColor: '#fff8f5' }}
    >
      <div className="container mx-auto px-4 md:px-8 max-w-[1280px] pt-20 pb-10">
        {/* ── Main Grid: 12 columns ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-16">
          {/* Col 1: Brand — spans 4 */}
          <div className="md:col-span-4 space-y-8 max-w-xs">
            <div className="space-y-4">
              <h2 className="font-display font-black text-2xl tracking-tight text-cocoa-dark">
                Royal Glow Salon &amp; SPA
              </h2>
              <div className="space-y-1">
                <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold">
                  Visit Branch
                </p>
                <address className="not-italic font-sans text-sm text-warm-gray">
                  Rayasandra, 560100
                </address>
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold">
                Opening Hours
              </p>
              <div className="font-sans text-sm text-warm-gray">
                <div className="grid grid-cols-[auto_1fr] gap-y-2 gap-x-4">
                  <span>Mon — Fri</span>
                  <span className="text-cocoa-dark font-medium">10:00 — 21:00</span>
                  <span>Sat — Sun</span>
                  <span className="text-cocoa-dark font-medium">10:00 — 22:00</span>
                </div>
              </div>
            </div>
          </div>

          {/* Col 2: Explore — spans 2, offset 1 */}
          <nav aria-label="Explore links" className="md:col-span-2 md:col-start-6">
            <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold mb-7">
              Explore
            </p>
            <ul className="space-y-4">
              {exploreLinks.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="font-ui text-sm text-warm-gray hover:text-deep-gold transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Col 3: Account — spans 2 */}
          <nav aria-label="Account links" className="md:col-span-2">
            <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold mb-7">
              Account
            </p>
            <ul className="space-y-4">
              {accountLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="font-ui text-sm text-warm-gray hover:text-deep-gold transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Col 4: Follow Us + Email — spans 3 */}
          <div className="md:col-span-3 space-y-8">
            <div>
              <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold mb-6">
                Follow Us
              </p>
              <div className="flex items-center gap-4">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="text-cocoa-dark hover:text-deep-gold transition-colors duration-200"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d={SOCIAL_PATHS[social.key]} />
                    </svg>
                    <span className="sr-only">{social.label}</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-deep-gold">
                Email Us
              </p>
              <a
                href="mailto:hello@theroyalglow.in"
                className="font-ui text-sm text-warm-gray hover:text-deep-gold transition-colors duration-200 block"
              >
                hello@theroyalglow.in
              </a>
            </div>
          </div>
        </div>

        {/* ── Bottom Bar ── */}
        <div className="border-t border-outline-gray pt-8 flex flex-col md:flex-row justify-between items-center gap-5">
          <span className="font-ui text-[10px] font-bold uppercase tracking-widest text-warm-gray">
            © 2026 Royal Glow Salon &amp; Spa
          </span>
          <nav
            aria-label="Legal links"
            className="flex flex-wrap justify-center items-center gap-8 font-ui text-[10px] font-bold uppercase tracking-widest text-warm-gray"
          >
            <Link href="/privacy" className="hover:text-deep-gold transition-colors duration-200">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-deep-gold transition-colors duration-200">
              Terms of Service
            </Link>
            <Link
              href="/refund-policy"
              className="hover:text-deep-gold transition-colors duration-200"
            >
              Refund Policy
            </Link>
            <CookiePreferencesButton />
          </nav>
        </div>
      </div>
    </footer>
  )
}
