/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Header
 * Scope        : Layout
 *
 * Description  : Site-wide header. White/90 glass background, logo (image +
 *                wordmark), desktop nav links, and an auth-aware right side:
 *                a direct "Sign in" button (launches Google OAuth instantly,
 *                no /sign-in page) when logged out, or the account menu when
 *                logged in. Also mounts the Google One Tap prompt for guests.
 *
 * Responsibilities :
 * - Render logo (40×40 image + Cabinet Grotesk wordmark)
 * - Render desktop nav: Services, Offers, About, Contact, Blog
 * - Logged out: "Sign in" button → Google OAuth directly + One Tap prompt
 * - Logged in: UserMenu dropdown (notifications, bookings, etc. live inside it)
 * - Add scroll-triggered border shadow
 * - Toggle mobile nav panel
 *
 * Tech Stack   : React, TypeScript, Next.js, Tailwind CSS v4
 * Layer        : Presentation (Layout)
 *
 * Dependencies : UserMenu, GoogleOneTap, useSession, startGoogleSignIn, MobileNav
 ************************************************************/

'use client'

import { GoogleOneTap } from '@/components/auth/GoogleOneTap'
import { useSession } from '@/lib/auth-client'
import { startGoogleSignIn } from '@/lib/google-signin'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MobileNav } from './MobileNav'
import { UserMenu } from './UserMenu'

const navLinks = [
  { href: '/services', label: 'Services' },
  { href: '/offers', label: 'Offers' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/blog', label: 'Blog' },
]

type HeaderUser = { name: string | null; email: string | null; image: string | null }

export function Header({ initialUser = null }: { initialUser?: HeaderUser | null }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const pathname = usePathname()
  const { data: session, isPending } = useSession()
  // First paint uses the server-resolved user (no signed-out → avatar flash on
  // refresh); once the client session resolves we trust it so live sign-in /
  // sign-out still update the header without a reload.
  const user: HeaderUser | null = isPending
    ? initialUser
    : session?.user
      ? {
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          image: session.user.image ?? null,
        }
      : null

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  async function handleSignIn() {
    try {
      setIsSigningIn(true)
      await startGoogleSignIn()
    } catch {
      setIsSigningIn(false)
    }
  }

  return (
    <header
      className={`fixed left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100 transition-all duration-200 ${
        isScrolled ? 'top-0 shadow-md' : 'top-9'
      }`}
    >
      <div className="container mx-auto px-4 md:px-8 flex items-center justify-between h-20 max-w-[1280px]">
        {/* ── Logo ── */}
        <Link href="/" className="flex items-center gap-3" aria-label="Royal Glow — Go to homepage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Royal Glow logo"
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
          />
          {/* Two-line brand lockup: wordmark + Salon & Spa descriptor */}
          <span className="flex flex-col leading-none">
            <span className="font-display font-black text-[19px] text-cocoa-dark tracking-tight">
              Royal Glow
            </span>
            <span className="font-ui font-semibold text-[10px] uppercase tracking-[0.22em] text-warm-gray mt-1">
              Salon &amp; Spa
            </span>
          </span>
        </Link>

        {/* ── Desktop Nav ── */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`font-ui font-bold text-sm text-cocoa-dark hover:text-deep-gold transition-colors duration-200 relative py-1 ${
                pathname === link.href
                  ? 'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-deep-gold'
                  : ''
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* ── Auth CTA ── */}
        {user ? (
          <div className="hidden md:flex items-center">
            <UserMenu user={user} />
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="hidden md:inline-flex items-center gap-2 bg-warm-gold text-cocoa-dark font-ui font-bold text-sm px-8 py-3 rounded-xl shadow-[0_1px_2px_rgba(26,15,10,0.08)] transition-all duration-200 hover:bg-deep-gold active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSigningIn ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span>Signing in…</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>
        )}

        {/* ── Mobile right side ── */}
        <div className="flex items-center gap-2 md:hidden">
          {user ? (
            // Logged in: avatar button opens the drawer (account + nav inside).
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open account menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav"
              className="flex items-center gap-1 rounded-full py-0.5 pr-1 pl-0.5 hover:bg-cloud-gray transition-colors active:scale-95"
            >
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover border border-outline-gray"
                />
              ) : (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-warm-gold font-ui font-bold text-sm text-cocoa-dark"
                  aria-hidden="true"
                >
                  {user.name?.trim().charAt(0).toUpperCase() ?? 'G'}
                </span>
              )}
              <svg
                className="h-4 w-4 text-warm-gray"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          ) : (
            // Logged out: explicit Sign in CTA (fallback when One Tap doesn't prompt).
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="inline-flex items-center rounded-lg bg-warm-gold px-4 py-2 font-ui font-bold text-sm text-cocoa-dark transition-colors hover:bg-deep-gold active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSigningIn ? 'Signing in…' : 'Sign in'}
            </button>
          )}

          {/* Hamburger — shown while signed out / loading; hidden once signed in
              (the avatar opens the same drawer). */}
          {!user && (
            <button
              type="button"
              className="flex items-center justify-center w-10 h-10 text-cocoa-dark"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Google One Tap — only for confirmed signed-out guests */}
      {!user && <GoogleOneTap />}

      {/* Mobile Navigation */}
      <MobileNav
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        pathname={pathname}
        user={user}
      />
    </header>
  )
}
