'use client'

import { useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/offers', label: 'Offers' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

interface MobileNavProps {
  isOpen: boolean
  onClose: () => void
  pathname: string
  user?: { name: string | null; image: string | null } | null
}

export function MobileNav({ isOpen, onClose, pathname, user }: MobileNavProps) {
  const navRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key !== 'Tab' || !navRef.current) return

      const focusableElements = navRef.current.querySelectorAll<HTMLElement>(
        'a[href], button, [tabindex]:not([tabindex="-1"])'
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
    [onClose]
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
      <div
        className={`fixed inset-0 bg-cocoa-dark/50 z-40 motion-safe:transition-opacity motion-safe:duration-250 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
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
          <span className="font-display text-cocoa-dark text-lg">Royal Glow</span>
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
              <Link
                href="/bookings"
                onClick={onClose}
                className={`font-ui text-sm uppercase tracking-[0.5px] py-3 px-3 rounded-[6px] transition-colors duration-200 ${
                  pathname === '/bookings'
                    ? 'text-deep-gold bg-golden-mist'
                    : 'text-cocoa-dark hover:bg-cloud-gray'
                }`}
              >
                My Bookings
              </Link>
              <Link
                href="/profile"
                onClick={onClose}
                className={`font-ui text-sm uppercase tracking-[0.5px] py-3 px-3 rounded-[6px] transition-colors duration-200 ${
                  pathname === '/profile'
                    ? 'text-deep-gold bg-golden-mist'
                    : 'text-cocoa-dark hover:bg-cloud-gray'
                }`}
              >
                Profile
              </Link>
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
            <Link
              href="/profile"
              onClick={onClose}
              className="bg-cloud-gray text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full h-10 flex items-center justify-center gap-2 hover:bg-golden-mist motion-safe:transition-all motion-safe:duration-200"
            >
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <span
                  className="w-6 h-6 rounded-full bg-royal-gold flex items-center justify-center text-[11px]"
                  aria-hidden="true"
                >
                  {user.name?.trim().charAt(0).toUpperCase() || 'G'}
                </span>
              )}
              <span className="max-w-[140px] truncate">{user.name?.split(' ')[0] ?? 'Profile'}</span>
            </Link>
          ) : (
            <Link
              href="/sign-in"
              onClick={onClose}
              className="bg-cloud-gray text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full h-10 flex items-center justify-center hover:bg-golden-mist motion-safe:transition-all motion-safe:duration-200"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
