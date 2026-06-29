/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : Breadcrumb
 * Scope        : Admin UI — App Shell / Top_Bar
 *
 * Description  : Renders the hierarchical breadcrumb trail for the admin
 *                Top_Bar by composing the owned-source shadcn `Breadcrumb`
 *                components. The trail itself is derived by the pure, I/O-free
 *                `deriveBreadcrumbs` helper (`@/lib/admin/breadcrumbs`) from the
 *                current pathname and the shared ADMIN_NAV config so it agrees
 *                with the sidebar and edge middleware.
 *
 * Responsibilities :
 * - Read the current route via `usePathname()` and derive the ordered trail.
 * - Wrap the trail in the shadcn `Breadcrumb` `<nav aria-label="Breadcrumb">`.
 * - Render every ancestor crumb as a `BreadcrumbLink` to its route.
 * - Render the current (last) crumb as a non-interactive `BreadcrumbPage`
 *   marked `aria-current="page"`.
 * - Place a decorative `BreadcrumbSeparator` between crumbs.
 *
 * Tech Stack   : React (Client Component), TypeScript, shadcn Breadcrumb,
 *                Next.js
 * Layer        : Presentation (App Shell)
 *
 * Dependencies : next/link, next/navigation, @/components/ui/breadcrumb,
 *                @/lib/admin/breadcrumbs, @/lib/rbac
 *
 * Notes        : `'use client'` because `usePathname()` is a client hook; the
 *                derivation logic remains a pure, separately tested helper
 *                (`breadcrumbs.ts`) which is preserved unchanged.
 *
 * Requirements : 8.1, 8.2, 8.3, 8.4, 8.5, 8.7
 ************************************************************/

'use client'

import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { deriveBreadcrumbs } from '@/lib/admin/breadcrumbs'
import { ADMIN_NAV } from '@/lib/rbac'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'

export function Breadcrumb() {
  const pathname = usePathname()
  const crumbs = deriveBreadcrumbs(pathname, ADMIN_NAV)

  return (
    <BreadcrumbRoot aria-label="Breadcrumb">
      <BreadcrumbList className="font-sans text-sm">
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.href}>
            {index > 0 ? <BreadcrumbSeparator className="text-dusty-gray" /> : null}
            <BreadcrumbItem>
              {crumb.current ? (
                <BreadcrumbPage className="font-medium text-cocoa-dark">
                  {crumb.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild className="text-warm-gray hover:text-cocoa-dark">
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </BreadcrumbRoot>
  )
}
