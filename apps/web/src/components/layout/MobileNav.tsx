/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : MobileNav
 * Scope        : Layout
 *
 * Description  : Slide-in mobile navigation panel with focus trap, escape key
 *                handling, authenticated account links, and direct Google
 *                sign-in / sign-out actions.
 *
 * Responsibilities :
 * - Render full-screen slide-in navigation with backdrop
 * - Trap focus within the panel when open
 * - Close on Escape key or backdrop click
 * - Show navigation links with active route highlighting
 * - Display account links + Logout for authenticated users
 * - Launch Google OAuth directly for signed-out users
 *
 * Features / Functionality :
 * - Accessible modal dialog with aria-modal
 * - Focus trap with Tab/Shift+Tab cycling
 * - Slide transition (translate-x-full → translate-x-0)
 * - Body scroll lock when open
 * - Auth-aware: account links + Logout, or "Sign in with Google" CTA
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS, Next.js
 * Layer        : Presentation (Layout)
 *
 * Dependencies : next/link, @/lib/auth-client, @/lib/google-signin
 *
 * Notes        : None
 ************************************************************/

'use client'

import { signOut } from '@/lib/auth-client'
import { startGoogleSignIn } from '@/lib/google-signin'
import Link from 'next/link'
import { useCallback, useEffect, useRef } from 'react'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/offers', label: 'Offers' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

const accountLinks = [
  { href: '/bookings', label: 'Bookings' },
  { href: '/membership', label: 'Membership' },
  { href: '/gems', label: 'Gems' },
  { href: '/favorites', label: 'Favorites' },
  { href: '/profile', label: 'Profile' },
]

interface MobileNavProps {
  isOpen: boolean
  onClose: () => void
  pathname: string
  user?: { name: string | null; email?: string | null; image: string | null } | null
}

export function MobileNav({ isOpen, onClose, pathname, user }: MobileNavProps) {
  const navRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  async function handleSignIn() {
    try {
      await startGoogleSignIn()
    } catch {
      /* swallow — Better Auth surfaces its own error UI on redirect failure */
    }
  }

  async function handleSignOut() {
    try {
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = '/'
          },
        },
      })
    } catch {
      window.location.href = '/'
    }
  }

  // Focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key !== 'Tab' || !navRef.current) return

      const focusableElements = navRef.current.querySelectorAll<HTMLElement>(
        'a[href], button, [tabindex]:not([tabindex="-1"])',
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', handleKeyDown)
      // Focus the close button when menu opens
      setTimeout(() => closeButtonRef.current?.focus(), 100)
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  return (
    <>
      {/* Backdrop overlay */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close navigation menu"
        className={`fixed inset-0 bg-cocoa-dark/50 z-40 motion-safe:transition-opacity motion-safe:duration-250 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        ref={navRef}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation menu"
        className={`fixed top-0 right-0 bottom-0 w-[280px] max-w-[80vw] bg-canvas-white z-50 shadow-xl motion-safe:transition-transform motion-safe:duration-250 motion-safe:ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Close button */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-cloud-gray">
          <span className="flex flex-col leading-none">
            <span className="font-display font-black text-lg text-cocoa-dark tracking-tight">
              Royal Glow
            </span>
            <span className="font-ui font-semibold text-[9px] uppercase tracking-[0.22em] text-warm-gray mt-0.5">
              Salon &amp; Spa
            </span>
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 text-cocoa-dark"
            aria-label="Close navigation menu"
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav aria-label="Mobile navigation" className="flex flex-col px-5 py-6 gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={`font-ui text-sm uppercase tracking-[0.5px] py-3 px-3 rounded-[6px] transition-colors duration-200 ${
                pathname === link.href
                  ? 'text-deep-gold bg-golden-mist'
                  : 'text-cocoa-dark hover:bg-cloud-gray'
              }`}
            >
              {link.label}
            </Link>
          ))}

          {user && (
            <>
              <span className="mt-3 mb-1 px-3 font-ui text-[10px] uppercase tracking-[1px] text-warm-stone">
                Account
              </span>
              {accountLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  className={`font-ui text-sm uppercase tracking-[0.5px] py-3 px-3 rounded-[6px] transition-colors duration-200 ${
                    pathname === link.href
                      ? 'text-deep-gold bg-golden-mist'
                      : 'text-cocoa-dark hover:bg-cloud-gray'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* Bottom actions */}
        <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-cloud-gray space-y-3">
          <Link
            href="/?book=1"
            onClick={onClose}
            className="bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full h-10 flex items-center justify-center hover:bg-deep-gold motion-safe:transition-all motion-safe:duration-200"
          >
            Book Now
          </Link>
          {user ? (
            <>
              <Link
                href="/profile"
                onClick={onClose}
                className="bg-cloud-gray text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full h-10 flex items-center justify-center gap-2 hover:bg-golden-mist motion-safe:transition-all motion-safe:duration-200"
              >
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <span
                    className="w-6 h-6 rounded-full bg-royal-gold flex items-center justify-center text-[11px]"
                    aria-hidden="true"
                  >
                    {user.name?.trim().charAt(0).toUpperCase() || 'G'}
                  </span>
                )}
                <span className="max-w-[140px] truncate">
                  {user.name?.split(' ')[0] ?? 'Profile'}
                </span>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full text-error font-ui text-xs uppercase tracking-[0.5px] rounded-full h-10 flex items-center justify-center gap-2 hover:bg-error/8 motion-safe:transition-all motion-safe:duration-200"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="m16 17 5-5-5-5M21 12H9" />
                </svg>
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose()
                void handleSignIn()
              }}
              className="w-full bg-warm-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full h-10 flex items-center justify-center gap-2 hover:bg-deep-gold active:scale-[0.98] motion-safe:transition-all motion-safe:duration-200"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>
          )}
        </div>
      </div>
    </>
  )
}
