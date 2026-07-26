/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : MobileNav
 * Scope        : Layout
 *
 * Description  : Full-height mobile navigation drawer rendered through a body
 *                portal so it sits above the header and announcement bar. Gives
 *                mobile full feature parity with the desktop navbar + account
 *                menu, plus direct Google sign-in / sign-out.
 *
 * Responsibilities :
 * - Portal an opaque, accessible slide-in drawer above all page chrome
 * - Render primary navigation + (when signed in) the full account menu
 * - Surface live Gems balance and unread notification count as badges
 * - Launch Google OAuth directly (signed out) or sign out (signed in)
 * - Trap focus, lock body scroll, and close on Escape / backdrop tap
 *
 * Features / Functionality :
 * - createPortal to document.body at z-[100] (escapes header stacking context)
 * - Account card (avatar, name, email) + iconised account links
 * - Prominent white "Continue with Google" button when signed out
 * - 48px+ touch targets, active-route highlighting, reduced-motion safe
 *
 * Tech Stack   : React, TypeScript, Next.js, Tailwind CSS v4
 * Layer        : Presentation (Layout)
 *
 * Dependencies : react-dom (createPortal), next/link, @/lib/auth-client,
 *                @/lib/google-signin, @/lib/utils
 *
 * Notes        : Badges fetch lazily when the drawer opens for a signed-in user.
 ************************************************************/

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { signOut } from '@/lib/auth-client'
import { startGoogleSignIn } from '@/lib/google-signin'
import { adminPortalUrl, isAdminRole } from '@/lib/roles'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/offers', label: 'Offers' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/blog', label: 'Blog' },
]

const ICON = 'h-[20px] w-[20px] shrink-0 text-warm-gray group-hover:text-gold-ink transition-colors'

type AccountLink = {
  href: string
  label: string
  icon: React.ReactNode
  badge?: 'gems' | 'notifications'
}

const accountLinks: AccountLink[] = [
  {
    href: '/notifications',
    label: 'Notifications',
    badge: 'notifications',
    icon: (
      <svg
        className={ICON}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    href: '/bookings',
    label: 'Bookings',
    icon: (
      <svg
        className={ICON}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: '/membership',
    label: 'Membership',
    icon: (
      <svg
        className={ICON}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 16 3 5l5.5 4L12 4l3.5 5L21 5l-2 11z" />
        <path d="M5 20h14" />
      </svg>
    ),
  },
  {
    href: '/gems',
    label: 'Gems',
    badge: 'gems',
    icon: (
      <svg
        className={ICON}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3h12l4 6-10 12L2 9z" />
        <path d="M2 9h20M12 21 8 9l2-6M12 21l4-12-2-6" />
      </svg>
    ),
  },
  {
    href: '/favorites',
    label: 'Favorites',
    icon: (
      <svg
        className={ICON}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (
      <svg
        className={ICON}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
]

interface MobileNavProps {
  isOpen: boolean
  onClose: () => void
  pathname: string
  user?: {
    name: string | null
    email?: string | null
    image: string | null
    role?: string | null
  } | null
}

export function MobileNav({ isOpen, onClose, pathname, user }: MobileNavProps) {
  const navRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [mounted, setMounted] = useState(false)
  const [gems, setGems] = useState<number | null>(null)
  const [unread, setUnread] = useState(0)

  // Portal target only exists on the client.
  useEffect(() => {
    setMounted(true)
  }, [])

  // Lazily load account badges the first time the drawer opens for a user.
  useEffect(() => {
    if (!isOpen || !user) {
      return
    }
    let cancelled = false
    fetch('/api/gems', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.success) setGems(j.data.balance as number)
      })
      .catch(() => {})
    fetch('/api/notifications', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.success) setUnread(j.data.unreadCount as number)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOpen, user])

  async function handleSignIn() {
    try {
      await startGoogleSignIn()
    } catch (err) {
      // The drawer has already closed here, so there's no inline slot to show
      // an error — but log it so a failed OAuth launch isn't fully invisible.
      console.error('[auth] Google sign-in failed:', err)
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !navRef.current) return
      const focusable = navRef.current.querySelectorAll<HTMLElement>(
        'a[href], button, [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', handleKeyDown)
      const t = setTimeout(() => closeButtonRef.current?.focus(), 120)
      return () => {
        clearTimeout(t)
        document.body.style.overflow = ''
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
    document.body.style.overflow = ''
    document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  if (!mounted) {
    return null
  }

  const firstName = user?.name?.split(' ')[0] ?? null

  function navItemClass(active: boolean) {
    return cn(
      'group flex items-center gap-3 rounded-xl px-3.5 min-h-[48px] font-ui text-[15px] transition-colors duration-150',
      active ? 'bg-golden-mist text-gold-ink font-bold' : 'text-cocoa-dark hover:bg-cloud-gray',
    )
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[100] md:hidden',
        isOpen ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close navigation menu"
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-cocoa-dark/60 backdrop-blur-[2px] motion-safe:transition-opacity motion-safe:duration-300',
          isOpen ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Drawer */}
      <div
        ref={navRef}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          'absolute inset-y-0 right-0 flex w-full max-w-[360px] flex-col bg-canvas-white shadow-elevated motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header row */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-cloud-gray">
          <span className="flex flex-col leading-none">
            <span className="font-display font-black text-lg text-cocoa-dark tracking-tight">
              Royal Glow
            </span>
            <span className="font-ui font-semibold text-[9px] uppercase tracking-[0.22em] text-warm-gray mt-1">
              Salon &amp; Spa
            </span>
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 -mr-2 rounded-full text-cocoa-dark hover:bg-cloud-gray transition-colors active:scale-95"
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
          {/* Account card (signed in) */}
          {user && (
            <Link
              href="/profile"
              onClick={onClose}
              className="mb-2 flex items-center gap-3 rounded-2xl bg-warm-cream px-4 py-3.5 transition-colors hover:bg-golden-mist"
            >
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="h-11 w-11 rounded-full object-cover border border-outline-gray"
                />
              ) : (
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-warm-gold font-ui font-bold text-cocoa-dark"
                  aria-hidden="true"
                >
                  {user.name?.trim().charAt(0).toUpperCase() ?? 'G'}
                </span>
              )}
              <span className="min-w-0">
                <span className="block font-ui font-bold text-sm text-cocoa-dark truncate">
                  {user.name ?? 'Account'}
                </span>
                {user.email && (
                  <span className="block font-sans text-xs text-dusty-gray truncate">
                    {user.email}
                  </span>
                )}
              </span>
            </Link>
          )}

          {/* Admin Portal — staff and above only (never customers). Cross-origin
              link to admin.theroyalglow.in. */}
          {user && isAdminRole(user.role) && (
            <a
              href={adminPortalUrl()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="mb-2 flex items-center gap-3 rounded-2xl bg-cocoa-dark px-4 py-3.5 text-canvas-white transition-colors hover:bg-warm-gray"
            >
              <svg
                className="h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2 4 5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V5l-8-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span className="flex-1 font-ui font-bold text-sm">Admin Portal</span>
              <span className="rounded-pill bg-canvas-white/15 px-2 py-0.5 font-ui text-[10px] font-bold uppercase tracking-[0.5px]">
                {user.role}
              </span>
            </a>
          )}

          {/* Account links (signed in) */}
          {user && (
            <>
              <p className="px-3.5 pt-3 pb-1 font-ui text-[11px] font-bold uppercase tracking-[1.5px] text-warm-stone">
                Account
              </p>
              <nav aria-label="Account" className="flex flex-col gap-0.5">
                {accountLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onClose}
                    className={navItemClass(pathname === link.href)}
                  >
                    {link.icon}
                    <span className="flex-1">{link.label}</span>
                    {link.badge === 'gems' && gems !== null && (
                      <span className="rounded-pill bg-golden-mist px-2 py-0.5 font-ui text-[11px] font-bold text-gold-ink tabular-nums">
                        {gems.toLocaleString('en-IN')} pts
                      </span>
                    )}
                    {link.badge === 'notifications' && unread > 0 && (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-pill bg-error px-1.5 py-0.5 font-ui text-[11px] font-bold text-canvas-white tabular-nums">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </Link>
                ))}
              </nav>
            </>
          )}

          {/* Primary navigation */}
          <p className="px-3.5 pt-4 pb-1 font-ui text-[11px] font-bold uppercase tracking-[1.5px] text-warm-stone">
            Explore
          </p>
          <nav aria-label="Primary" className="flex flex-col gap-0.5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={navItemClass(pathname === link.href)}
              >
                <span className="flex-1">{link.label}</span>
                <svg
                  className="h-4 w-4 text-outline-gray"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            ))}
          </nav>
        </div>

        {/* Sticky footer actions */}
        <div className="border-t border-cloud-gray p-4 space-y-3">
          <Link
            href="/?book=1"
            onClick={onClose}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-warm-gold font-ui font-bold text-sm text-cocoa-dark transition-all duration-200 hover:bg-deep-gold active:scale-[0.98]"
          >
            Book Now <span aria-hidden="true">→</span>
          </Link>

          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-error/30 font-ui font-bold text-sm text-error transition-colors duration-200 hover:bg-error/8 active:scale-[0.98]"
            >
              <svg
                className="h-[18px] w-[18px]"
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
              Logout{firstName ? ` (${firstName})` : ''}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose()
                void handleSignIn()
              }}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-outline-gray bg-canvas-white font-ui font-bold text-sm text-cocoa-dark shadow-[0_1px_2px_rgba(26,15,10,0.08)] transition-all duration-200 hover:bg-cloud-gray active:scale-[0.98]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
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
              Continue with Google
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
