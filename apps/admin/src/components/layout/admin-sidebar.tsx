/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : AdminSidebar
 * Scope        : Admin UI — Navigation
 *
 * Description  : Role-filtered admin navigation CONTENT (logo + sectioned nav).
 *                Nav structure and role-based visibility are driven by the
 *                SHARED pure helpers in `@/lib/rbac` (ADMIN_NAV +
 *                filterNavByLevel) so the sidebar and the edge middleware agree
 *                on what each role may see. All links use the Root-Path
 *                Convention (no `/admin` prefix) because the subdomain provides
 *                the namespace.
 *
 *                Positioning / responsiveness is OWNED BY THE App_Shell, not by
 *                this component: AdminShell renders this content twice — inside
 *                a persistent static `<aside>` rail at >=1024px and inside a
 *                Radix `Dialog.Content` overlay drawer at <1024px (which
 *                supplies focus trap, focus return, Esc / backdrop close, and
 *                scroll lock). This component therefore renders ONLY the inner
 *                logo + nav and exposes an `onNavigate` callback the drawer uses
 *                to close itself when a navigation item is activated (Req 3.7).
 *
 * Responsibilities :
 * - Render sectioned navigation filtered by the signed-in user's role level
 * - Highlight the single active route by longest-prefix match (active-nav)
 * - Invoke `onNavigate` when a navigation item is activated (drawer close hook)
 *
 * Features / Functionality :
 * - Role-driven visibility via filterNavByLevel(ADMIN_NAV, roleLevel)
 * - Per-item lucide-react icon resolved by href via navIconFor() + Icon wrapper
 * - Accessible navigation landmark and aria-current="page"
 *
 * Tech Stack   : React (Client Component), TypeScript, Tailwind CSS, Next.js
 * Layer        : Presentation (Navigation)
 *
 * Dependencies : next/link, next/navigation, @/lib/rbac,
 *                @/lib/admin/active-nav, @/lib/admin/nav-icons,
 *                @/components/ui/icon
 *
 * Notes        : Presentation-only. Icons are not part of the access-control
 *                model (ADMIN_NAV) — they are resolved by href at render time.
 *                An unresolved/invalid role level is treated as the minimum
 *                level 0 when filtering (Req 4.7). Brand-token utilities only.
 ************************************************************/

'use client'

import { Icon } from '@/components/ui/icon'
import { navHrefs, resolveActiveHref } from '@/lib/admin/active-nav'
import { navIconFor } from '@/lib/admin/nav-icons'
import { ADMIN_NAV, filterNavByLevel } from '@/lib/rbac'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function AdminSidebar({
  roleLevel,
  onNavigate,
}: {
  /** Numeric Role_Level resolved from the signed-in user (drives visibility). */
  roleLevel: number
  /**
   * Invoked when a navigation item is activated. The mobile overlay drawer
   * passes a closer here so navigating closes the drawer (Req 3.7); the
   * persistent >=1024px rail omits it.
   */
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  // Unresolved / invalid role level → treat as the minimum level 0 (Req 4.7).
  const level = Number.isFinite(roleLevel) ? Math.max(0, Math.trunc(roleLevel)) : 0

  const sections = filterNavByLevel(ADMIN_NAV, level)

  // Resolve the single active href once from the full visible candidate set so
  // exactly one item is marked active by longest-prefix match (Req 4.5, 4.6).
  const activeHref = resolveActiveHref(pathname, navHrefs(sections))

  return (
    <div className="flex h-full flex-col">
      {/* Logo + Admin label (Req 4.8) */}
      <div className="flex items-center gap-2 border-b border-outline-gray px-5 py-5">
        <span className="font-display text-lg tracking-tight text-cocoa-dark">Royal Glow</span>
        <span className="inline-flex items-center rounded-pill bg-cocoa-dark px-2 py-0.5 font-ui text-[10px] uppercase tracking-wider text-canvas-white">
          Admin
        </span>
      </div>

      {/* Navigation (sectioned, role-filtered — Req 4.1–4.4) */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="mb-1 px-3 font-ui text-[11px] uppercase tracking-widest text-dusty-gray">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.href === activeHref
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      {...(onNavigate ? { onClick: onNavigate } : {})}
                      className={`flex items-center gap-2.5 rounded-cards px-3 py-2 text-sm transition-colors duration-150 ${
                        active
                          ? 'bg-canvas-white font-medium text-cocoa-dark shadow-card-hover'
                          : 'text-warm-gray hover:bg-canvas-white/60 hover:text-cocoa-dark'
                      }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon icon={navIconFor(item.href)} decorative size={18} />
                      <span className="font-sans">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}
