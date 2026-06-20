/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : AdminSidebar
 * Scope        : Admin UI — Navigation
 *
 * Description  : Responsive admin sidebar navigation. Nav structure and
 *                role-based visibility are driven by the SHARED pure helpers in
 *                `@/lib/rbac` (ADMIN_NAV + filterNavByLevel) so the sidebar and
 *                the edge middleware agree on what each role may see. All links
 *                use the Root-Path Convention (no `/admin` prefix) because the
 *                subdomain provides the namespace.
 *
 * Responsibilities :
 * - Render sectioned navigation filtered by the signed-in user's role level
 * - Highlight the active route (exact match for the dashboard root `/`)
 * - Provide responsive behaviour (slide-in overlay on mobile, static ≥1024px)
 * - Close the mobile overlay on backdrop click / link navigation
 *
 * Features / Functionality :
 * - Role-driven visibility via filterNavByLevel(ADMIN_NAV, roleLevel)
 * - Per-item emoji icon looked up by href (icons are presentation-only)
 * - Mobile slide-in panel with backdrop overlay
 * - Accessible navigation landmarks and aria-current
 *
 * Tech Stack   : React (Client Component), TypeScript, Tailwind CSS, Next.js
 * Layer        : Presentation (Navigation)
 *
 * Dependencies : next/link, next/navigation, @/lib/rbac
 *
 * Notes        : Visibility now reflects the REAL signed-in role (no
 *                CURRENT_ROLE placeholder) — the role level is passed in by the
 *                server layout via AdminShell.
 ************************************************************/

'use client'

import { ADMIN_NAV, filterNavByLevel } from '@/lib/rbac'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Presentation-only icon map keyed by the Root-Path href. Icons are not part of
 * the access-control model (ADMIN_NAV), so they live here and are looked up by
 * href when rendering.
 */
const NAV_ICONS: Record<string, string> = {
  '/': '📊',
  '/bookings': '📅',
  '/waitlist': '⏳',
  '/customers': '👥',
  '/leads': '🎯',
  '/staff': '💇',
  '/schedule': '🗓️',
  '/leave': '🏖️',
  '/services': '✨',
  '/offers': '🏷️',
  '/memberships': '💎',
  '/billing': '🧾',
  '/reports': '📈',
  '/settings': '⚙️',
  '/branches': '🏢',
  '/users': '🔑',
  '/integrations': '🔌',
  '/logs': '📋',
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/'
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminSidebar({
  roleLevel,
  open,
  onClose,
}: {
  roleLevel: number
  open: boolean
  onClose: () => void
}) {
  const pathname = usePathname()
  const sections = filterNavByLevel(ADMIN_NAV, roleLevel)

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
          aria-label="Close navigation menu"
          tabIndex={-1}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-cloud-gray border-r border-outline-gray overflow-y-auto transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-outline-gray">
          <span className="font-display text-lg text-cocoa-dark tracking-tight">Royal Glow</span>
          <span className="inline-flex items-center rounded-full bg-cocoa-dark text-canvas-white text-[10px] font-ui uppercase tracking-wider px-2 py-0.5">
            Admin
          </span>
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4" aria-label="Admin navigation">
          {sections.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-3 mb-1 text-[11px] font-ui uppercase tracking-widest text-dusty-gray">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-sm transition-colors duration-150 ${
                          active
                            ? 'bg-canvas-white text-cocoa-dark font-medium shadow-sm'
                            : 'text-warm-gray hover:bg-canvas-white/60 hover:text-cocoa-dark'
                        }`}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="text-base" aria-hidden="true">
                          {NAV_ICONS[item.href] ?? '•'}
                        </span>
                        <span className="font-sans">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
