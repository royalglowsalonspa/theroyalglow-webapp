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
 *                Rebuilt on the shadcn/ui Button primitive with lucide icons.
 *
 * Responsibilities :
 * - Render logo (40×40 image + Cabinet Grotesk wordmark)
 * - Render desktop nav: Services, Offers, About, Contact, Blog
 * - Logged out: "Sign in" button → Google OAuth directly + One Tap prompt
 * - Logged in: UserMenu dropdown (notifications, bookings, etc. live inside it)
 * - Add scroll-triggered border shadow
 * - Toggle mobile nav panel
 *
 * Tech Stack   : React, TypeScript, Next.js, Tailwind CSS v4, shadcn/ui,
 *                lucide-react
 * Layer        : Presentation (Layout)
 *
 * Dependencies : @/components/ui/button, UserMenu, GoogleOneTap, useSession,
 *                startGoogleSignIn, MobileNav, lucide-react
 ************************************************************/

'use client'

import { ChevronDown, Loader2, Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { GoogleOneTap } from '@/components/auth/GoogleOneTap'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/auth-client'
import { startGoogleSignIn } from '@/lib/google-signin'
import { cn } from '@/lib/utils'
import { MobileNav } from './MobileNav'
import { UserMenu } from './UserMenu'

const navLinks = [
  { href: '/services', label: 'Services' },
  { href: '/offers', label: 'Offers' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/blog', label: 'Blog' },
]

type HeaderUser = {
  name: string | null
  email: string | null
  image: string | null
  role: string | null
}

export function Header({ initialUser = null }: { initialUser?: HeaderUser | null }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)
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
          // Preserve the server-resolved role across hydration in case the
          // client session payload omits the custom role field.
          role: (session.user as { role?: string | null }).role ?? initialUser?.role ?? null,
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
      setSignInError(null)
      await startGoogleSignIn()
    } catch (err) {
      // Surface the failure instead of silently resetting — a swallowed error
      // here is what makes the button look like it "does nothing".
      setIsSigningIn(false)
      setSignInError(err instanceof Error ? err.message : 'Sign in failed. Please try again.')
      console.error('[auth] Google sign-in failed:', err)
    }
  }

  return (
    <header
      className={cn(
        'fixed inset-x-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur-md transition-all duration-200',
        isScrolled ? 'top-0 shadow-md' : 'top-9',
      )}
    >
      <div className="container mx-auto flex h-20 max-w-[1280px] items-center justify-between px-4 md:px-8">
        {/* ── Logo ── */}
        <Link href="/" className="flex items-center gap-3" aria-label="Royal Glow — Go to homepage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Royal Glow logo"
            width={40}
            height={40}
            className="size-10 object-contain"
          />
          {/* Two-line brand lockup: wordmark + Salon & Spa descriptor */}
          <span className="flex flex-col leading-none">
            <span className="font-display text-[19px] font-black tracking-tight text-cocoa-dark">
              Royal Glow
            </span>
            <span className="mt-1 font-ui text-[10px] font-semibold uppercase tracking-[0.22em] text-warm-gray">
              Salon &amp; Spa
            </span>
          </span>
        </Link>

        {/* ── Desktop Nav ── */}
        <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'relative py-1 font-ui text-sm font-bold text-cocoa-dark transition-colors duration-200 hover:text-deep-gold',
                pathname === link.href &&
                  'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-deep-gold',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* ── Auth CTA ── */}
        {user ? (
          <div className="hidden items-center md:flex">
            <UserMenu user={user} />
          </div>
        ) : (
          <Button
            type="button"
            variant="gold"
            size="lg"
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="hidden px-8 font-ui font-bold md:inline-flex"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
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
              className="flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1 transition-colors hover:bg-cloud-gray active:scale-95"
            >
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="size-9 rounded-full border border-outline-gray object-cover"
                />
              ) : (
                <span
                  className="flex size-9 items-center justify-center rounded-full bg-warm-gold font-ui text-sm font-bold text-cocoa-dark"
                  aria-hidden="true"
                >
                  {user.name?.trim().charAt(0).toUpperCase() ?? 'G'}
                </span>
              )}
              <ChevronDown className="size-4 text-warm-gray" aria-hidden="true" />
            </button>
          ) : (
            // Logged out: explicit Sign in CTA (fallback when One Tap doesn't prompt).
            <Button
              type="button"
              variant="gold"
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="font-ui font-bold"
            >
              {isSigningIn ? 'Signing in…' : 'Sign in'}
            </Button>
          )}

          {/* Hamburger — shown while signed out / loading; hidden once signed in
              (the avatar opens the same drawer). */}
          {!user && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-cocoa-dark"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav"
            >
              <Menu aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {/* Google One Tap — only for confirmed signed-out guests */}
      {!user && <GoogleOneTap />}

      {/* Sign-in failure banner — keeps a failed OAuth launch visible instead
          of leaving the button looking inert. */}
      {signInError && (
        <div className="container mx-auto max-w-[1280px] px-4 md:px-8">
          <p
            role="alert"
            className="mb-2 mt-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-ui text-sm text-red-700"
          >
            {signInError}
          </p>
        </div>
      )}

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
