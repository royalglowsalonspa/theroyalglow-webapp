'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import { MobileNav } from './MobileNav'

const navLinks = [
  { href: '/services', label: 'Services' },
  { href: '/offers', label: 'Offers' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/blog', label: 'Blog' },
  { href: '/faq', label: 'FAQ' },
]

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user ?? null

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-shadow duration-200 bg-canvas-white ${
        isScrolled ? 'shadow-md' : ''
      }`}
    >
      <div className="mx-auto max-w-[1278px] px-5 flex items-center justify-between h-16 lg:h-[72px]">
        {/* Logo */}
        <Link
          href="/"
          className="font-display text-cocoa-dark text-xl lg:text-2xl tracking-tight"
          aria-label="Royal Glow — Go to homepage"
        >
          Royal Glow
        </Link>

        {/* Desktop Navigation */}
        <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark hover:text-deep-gold transition-colors duration-200 relative py-1 ${
                pathname === link.href
                  ? 'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-deep-gold'
                  : ''
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Auth section */}
        {user ? (
          <div className="hidden lg:flex items-center gap-6">
            <Link
              href="/bookings"
              className={`font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark hover:text-deep-gold transition-colors duration-200 relative py-1 ${
                pathname === '/bookings'
                  ? 'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-deep-gold'
                  : ''
              }`}
            >
              My Bookings
            </Link>
            <Link
              href="/profile"
              className="flex items-center gap-2 group"
              aria-label="Go to your profile"
            >
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover border border-cloud-gray"
                />
              ) : (
                <span
                  className="w-8 h-8 rounded-full bg-royal-gold flex items-center justify-center font-ui text-xs text-cocoa-dark"
                  aria-hidden="true"
                >
                  {user.name?.trim().charAt(0).toUpperCase() || 'G'}
                </span>
              )}
              <span className="font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark group-hover:text-deep-gold transition-colors duration-200 max-w-[120px] truncate">
                {user.name?.split(' ')[0] ?? 'Profile'}
              </span>
            </Link>
          </div>
        ) : (
          <Link
            href="/sign-in"
            className="hidden lg:inline-flex font-ui text-xs uppercase tracking-[0.5px] text-cocoa-dark hover:text-deep-gold transition-colors duration-200"
          >
            Sign In
          </Link>
        )}

        {/* Mobile Hamburger */}
        <button
          type="button"
          className="lg:hidden flex items-center justify-center w-10 h-10 text-cocoa-dark"
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
      </div>

      {/* Mobile Navigation */}
      <MobileNav
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        pathname={pathname}
        user={user ? { name: user.name ?? null, image: user.image ?? null } : null}
      />
    </header>
  )
}
