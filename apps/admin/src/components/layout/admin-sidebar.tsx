/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : AdminSidebar
 * Scope        : Admin UI — Navigation
 *
 * Description  : Role-filtered admin navigation built on the canonical shadcn
 *                Sidebar composition (the `sidebar-07` structure): a
 *                `SidebarHeader` brand lockup (logo + "Royal Glow" / "Admin
 *                Portal", linking to the dashboard), a scrollable
 *                `SidebarContent` whose nav SECTIONS are COLLAPSIBLE parents
 *                (section icon + rotating chevron) with their items as
 *                `SidebarMenuSub` links, and a `SidebarFooter` BRANCH switcher.
 *                Nav structure + role visibility come from the SHARED pure
 *                helpers in `@/lib/rbac` (ADMIN_NAV + filterNavByLevel) so the
 *                sidebar and the edge middleware agree on what each role sees.
 *                All links use the Root-Path Convention (no `/admin` prefix).
 *
 *                Collapses to an icon rail (`collapsible="icon"` on the parent
 *                `Sidebar`): the brand reduces to its logo, the collapsible
 *                section buttons become icon-only with hover tooltips, the
 *                sub-menus hide, and the footer branch switcher reduces to its
 *                glyph — all handled by the shadcn primitive's
 *                `group-data-[collapsible=icon]` styles.
 *
 * Responsibilities :
 * - Render the brand lockup once, in the sidebar header
 * - Render sectioned, collapsible navigation filtered by the role level
 * - Highlight the single active route by longest-prefix match (active-nav)
 * - Open by default the section that contains the active route
 * - Render the branch switcher in the sidebar footer
 * - Close the mobile drawer when a navigation item is activated
 *
 * Tech Stack   : React (Client Component), TypeScript, shadcn Sidebar +
 *                Collapsible, Next.js, lucide-react
 * Layer        : Presentation (Navigation)
 *
 * Notes        : Presentation-only. An unresolved/invalid role level is treated
 *                as the minimum level 0 when filtering. Uses semantic
 *                Brand-Token utilities only (no hex / raw colour / radius).
 *
 * Requirements : 5.3, 5.4, 6.1, 6.3, 7.1-7.9, 19.2, 19.4, 19.5
 ************************************************************/

'use client'

import { BranchSwitcher } from '@/components/layout/branch-switcher'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Icon } from '@/components/ui/icon'
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { navHrefs, resolveActiveHref } from '@/lib/admin/active-nav'
import { sectionIconFor } from '@/lib/admin/nav-icons'
import { ADMIN_NAV, filterNavByLevel } from '@/lib/rbac'
import { ChevronRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function AdminSidebar({
  roleLevel,
}: {
  /** Numeric Role_Level resolved from the signed-in user (drives visibility). */
  roleLevel: number
}) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()

  // Unresolved / invalid role level → treat as the minimum level 0.
  const level = Number.isFinite(roleLevel) ? Math.max(0, Math.trunc(roleLevel)) : 0
  const sections = filterNavByLevel(ADMIN_NAV, level)

  // Resolve the single active href once from the full visible candidate set so
  // exactly one item is marked active by longest-prefix match.
  const activeHref = resolveActiveHref(pathname, navHrefs(sections))

  // Activating a nav item closes the mobile overlay drawer (Req 7 mobile).
  function handleNavigate() {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <>
      {/* ── Brand lockup (the ONE place the brand lives) ─────────────────── */}
      <SidebarHeader className="border-b border-outline-gray/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-sidebar-accent">
              <Link href="/" aria-label="Royal Glow Admin Portal — dashboard">
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg border border-outline-gray bg-canvas-white">
                  <Image
                    src="/logo.png"
                    alt="Royal Glow"
                    width={32}
                    height={32}
                    className="size-8 object-contain"
                    priority
                  />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-display text-sm font-semibold text-cocoa-dark">
                    Royal Glow
                  </span>
                  <span className="truncate font-ui text-[11px] uppercase tracking-[0.16em] text-dusty-gray">
                    Admin Portal
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ── Collapsible navigation ───────────────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {sections.map((section) => {
              const sectionHasActive = section.items.some((item) => item.href === activeHref)
              return (
                <Collapsible
                  key={section.title}
                  asChild
                  defaultOpen={sectionHasActive}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton {...(isMobile ? {} : { tooltip: section.title })}>
                        <Icon icon={sectionIconFor(section.title)} decorative />
                        <span>{section.title}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {section.items.map((item) => {
                          const active = item.href === activeHref
                          return (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton asChild isActive={active}>
                                <Link
                                  href={item.href}
                                  aria-current={active ? 'page' : undefined}
                                  onClick={handleNavigate}
                                >
                                  <span>{item.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Branch switcher (bottom-left) ────────────────────────────────── */}
      <SidebarFooter className="border-t border-outline-gray/60">
        <BranchSwitcher />
      </SidebarFooter>
    </>
  )
}
