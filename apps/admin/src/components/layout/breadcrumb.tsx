/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : Breadcrumb
 * Scope        : Admin UI — App Shell / Top_Bar
 *
 * Description  : Renders the hierarchical breadcrumb trail for the admin
 *                Top_Bar. The trail itself is derived by the pure, I/O-free
 *                `deriveBreadcrumbs` helper (`@/lib/admin/breadcrumbs`) from the
 *                current pathname and the shared ADMIN_NAV config so it agrees
 *                with the sidebar and edge middleware.
 *
 * Responsibilities :
 * - Read the current route via `usePathname()` and derive the ordered trail.
 * - Wrap the trail in a `<nav aria-label="Breadcrumb">` landmark (Req 5.7).
 * - Render every ancestor crumb as a link to its route (Req 5.1, 5.2, 5.3, 5.5).
 * - Render the current (last) crumb as non-interactive text marked
 *   `aria-current="page"` (Req 5.4, 5.6).
 * - Place a decorative `ChevronRight` separator between crumbs (aria-hidden).
 *
 * Tech Stack   : React (Client Component), TypeScript, Tailwind CSS, Next.js
 * Layer        : Presentation (App Shell)
 *
 * Dependencies : next/link, next/navigation, lucide-react,
 *                @/lib/admin/breadcrumbs, @/lib/rbac
 *
 * Notes        : Marked `'use client'` because `usePathname()` is a client hook
 *                in the App Router; the derivation logic remains a pure,
 *                separately tested helper. Presentation-layer only — no data,
 *                API, RBAC, or business-logic changes. Brand-Token Tailwind
 *                utilities only (no colour/size literals).
 *
 * Requirements : 5.1, 5.2, 5.3, 5.4, 5.5, 5.7
 ************************************************************/

'use client'

import { deriveBreadcrumbs } from '@/lib/admin/breadcrumbs'
import { ADMIN_NAV } from '@/lib/rbac'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Breadcrumb() {
  const pathname = usePathname()
  const crumbs = deriveBreadcrumbs(pathname, ADMIN_NAV)

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm font-sans">
        {crumbs.map((crumb, index) => {
          const isFirst = index === 0
          return (
            <li key={crumb.href} className="flex items-center gap-1.5">
              {!isFirst && (
                <ChevronRight
                  className="size-3.5 text-dusty-gray shrink-0"
                  aria-hidden="true"
                />
              )}
              {crumb.current ? (
                <span className="text-cocoa-dark font-medium" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-warm-gray rounded-[4px] transition-colors duration-150 hover:text-cocoa-dark"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
