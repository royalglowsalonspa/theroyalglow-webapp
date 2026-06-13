/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 07-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : UserMenu
 * Scope        : Layout
 *
 * Description  : Authenticated account menu for the desktop navbar. Renders an
 *                avatar + name trigger and a Radix dropdown with account
 *                shortcuts (Bookings, Membership, Gems, Favorites, Profile) and
 *                a sign-out action. Matches the premium golden brand language.
 *
 * Responsibilities :
 * - Render avatar + name + chevron trigger
 * - Open an accessible, origin-aware dropdown (Radix)
 * - Show the live gems balance as a badge next to "Gems"
 * - Sign the user out and hard-redirect home
 *
 * Features / Functionality :
 * - Keyboard navigation + focus management (Radix primitives)
 * - Origin-aware scale-in animation (reduced-motion safe via globals.css)
 * - Resilient gems-balance fetch (silent on failure)
 *
 * Tech Stack   : React, TypeScript, Radix UI, Tailwind CSS v4
 * Layer        : Presentation (Layout)
 *
 * Dependencies : @radix-ui/react-dropdown-menu, next/link, @/lib/auth-client
 ************************************************************/

'use client'

import { signOut } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface UserMenuProps {
  user: {
    name: string | null
    email: string | null
    image: string | null
  }
}

interface MenuLink {
  href: string
  label: string
  icon: React.ReactNode
}

const ICON = 'h-[18px] w-[18px] shrink-0 text-warm-gray'

const menuLinks: MenuLink[] = [
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

function Avatar({
  image,
  name,
  className,
}: {
  image: string | null
  name: string | null
  className: string
}) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className={cn('object-cover', className)} />
  }
  return (
    <span
      className={cn(
        'flex items-center justify-center bg-warm-gold font-ui font-bold text-cocoa-dark',
        className,
      )}
      aria-hidden="true"
    >
      {name?.trim().charAt(0).toUpperCase() ?? 'G'}
    </span>
  )
}

export function UserMenu({ user }: UserMenuProps) {
  const [gems, setGems] = useState<number | null>(null)
  const [unread, setUnread] = useState(0)

  // Fetch the loyalty balance + unread notification count once so the badges
  // mirror the real totals. Both are best-effort and stay silent on failure.
  useEffect(() => {
    let cancelled = false

    fetch('/api/gems', { headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.success) {
          setGems(json.data.summary.balance as number)
        }
      })
      .catch(() => {
        /* silent — the badge simply stays hidden */
      })

    fetch('/api/notifications', { headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.success) {
          setUnread(json.data.unreadCount as number)
        }
      })
      .catch(() => {
        /* silent — the badge simply stays hidden */
      })

    return () => {
      cancelled = true
    }
  }, [])

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

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="group flex items-center gap-2.5 rounded-pill py-1.5 pl-1.5 pr-3 transition-colors duration-200 hover:bg-cloud-gray focus-visible:bg-cloud-gray active:scale-[0.98] data-[state=open]:bg-cloud-gray"
          aria-label="Open account menu"
        >
          <Avatar
            image={user.image}
            name={user.name}
            className="h-9 w-9 rounded-full border border-outline-gray text-sm"
          />
          <span className="hidden lg:flex flex-col items-start leading-tight">
            <span className="font-ui font-bold text-sm text-cocoa-dark max-w-[140px] truncate">
              {user.name ?? 'Account'}
            </span>
            {user.email && (
              <span className="font-sans text-[11px] text-dusty-gray max-w-[140px] truncate">
                {user.email}
              </span>
            )}
          </span>
          <svg
            className="h-4 w-4 text-warm-gray transition-transform duration-200 group-data-[state=open]:rotate-180"
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
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="rg-menu z-50 w-[280px] origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-2xl border border-cloud-gray bg-canvas-white p-1.5 shadow-elevated"
        >
          {/* Identity header */}
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar
              image={user.image}
              name={user.name}
              className="h-11 w-11 rounded-full border border-outline-gray text-base"
            />
            <div className="min-w-0">
              <p className="font-ui font-bold text-sm text-cocoa-dark truncate">
                {user.name ?? 'Account'}
              </p>
              {user.email && (
                <p className="font-sans text-xs text-dusty-gray truncate">{user.email}</p>
              )}
            </div>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-cloud-gray" />

          {/* Notifications — relocated from the navbar into the account menu */}
          <DropdownMenu.Item asChild>
            <Link
              href="/notifications"
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 font-ui text-sm text-cocoa-dark outline-none transition-colors duration-150 data-[highlighted]:bg-golden-mist focus-visible:bg-golden-mist"
            >
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
              <span className="flex-1">Notifications</span>
              {unread > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-pill bg-error px-1.5 py-0.5 font-ui text-[11px] font-bold text-canvas-white tabular-nums">
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : (
                <svg
                  className="h-4 w-4 text-outline-gray transition-transform duration-150 group-data-[highlighted]:translate-x-0.5"
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
              )}
            </Link>
          </DropdownMenu.Item>

          {menuLinks.map((link) => (
            <DropdownMenu.Item key={link.href} asChild>
              <Link
                href={link.href}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 font-ui text-sm text-cocoa-dark outline-none transition-colors duration-150 data-[highlighted]:bg-golden-mist focus-visible:bg-golden-mist"
              >
                {link.icon}
                <span className="flex-1">{link.label}</span>
                {link.href === '/gems' && gems !== null ? (
                  <span className="rounded-pill bg-golden-mist px-2 py-0.5 font-ui text-[11px] font-bold text-deep-gold tabular-nums">
                    {gems.toLocaleString('en-IN')} pts
                  </span>
                ) : (
                  <svg
                    className="h-4 w-4 text-outline-gray transition-transform duration-150 group-data-[highlighted]:translate-x-0.5"
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
                )}
              </Link>
            </DropdownMenu.Item>
          ))}

          <DropdownMenu.Separator className="my-1 h-px bg-cloud-gray" />

          <DropdownMenu.Item asChild>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-ui text-sm text-error outline-none transition-colors duration-150 data-[highlighted]:bg-error/8 focus-visible:bg-error/8"
            >
              <svg
                className="h-[18px] w-[18px] shrink-0"
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
              <span className="font-bold">Logout</span>
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
