/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : BranchSwitcher
 * Scope        : Admin Portal — App Shell / Sidebar footer
 *
 * Description  : The shadcn `sidebar-07` TeamSwitcher pattern, repurposed as a
 *                Royal Glow BRANCH switcher and placed in the sidebar FOOTER
 *                (bottom-left). The active branch (Rayasandra) is operational
 *                and selectable; a second branch (Marathahalli) is shown as
 *                "Coming Soon" and is disabled — it is planned but not yet
 *                operational. Collapses with the icon rail to the branch glyph
 *                only (handled by the parent `Sidebar collapsible="icon"`).
 *
 * Tech Stack   : React (Client Component), TypeScript, shadcn Sidebar +
 *                DropdownMenu + Badge, lucide-react
 * Layer        : Presentation (App Shell / Sidebar footer)
 *
 * Notes        : Presentation-only, no I/O. Branch list is static for now;
 *                wiring to the real `branch` table is a follow-up. Semantic
 *                Brand-Token utilities only (no hex / raw colour / radius).
 ************************************************************/

'use client'

import { ChevronsUpDown, Store } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

/** A salon branch shown in the switcher. */
type Branch = {
  /** Display name (the locality). */
  name: string
  /** Short status line under the name. */
  status: string
  /** False = operational/selectable; true = planned, not yet operational. */
  comingSoon: boolean
}

/** The live, operational branch (the default active selection). */
const DEFAULT_BRANCH: Branch = { name: 'Rayasandra', status: 'Operational', comingSoon: false }

/** Static branches: Rayasandra (live) + Marathahalli (planned). */
const BRANCHES: readonly Branch[] = [
  DEFAULT_BRANCH,
  { name: 'Marathahalli', status: 'Coming Soon', comingSoon: true },
]

/**
 * Branch switcher rendered in the sidebar footer.
 *
 * Selecting an operational branch updates the active branch; the "Coming Soon"
 * branch is disabled and cannot be selected.
 */
export function BranchSwitcher() {
  const { isMobile } = useSidebar()
  const [activeBranch, setActiveBranch] = useState<Branch>(DEFAULT_BRANCH)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={`Active branch: ${activeBranch.name}. Switch branch.`}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Store className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-sans text-sm font-medium text-cocoa-dark">
                  {activeBranch.name}
                </span>
                <span className="truncate font-ui text-xs text-dusty-gray">
                  {activeBranch.status}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto text-dusty-gray" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-ui text-xs text-dusty-gray">
              Branches
            </DropdownMenuLabel>
            {BRANCHES.map((branch) => (
              <DropdownMenuItem
                key={branch.name}
                disabled={branch.comingSoon}
                onSelect={() => {
                  if (!branch.comingSoon) {
                    setActiveBranch(branch)
                  }
                }}
                className="gap-2 p-2"
              >
                <div className="flex size-6 items-center justify-center rounded-md border border-outline-gray">
                  <Store className="size-3.5 shrink-0" />
                </div>
                <span className="flex-1 truncate text-cocoa-dark">{branch.name}</span>
                {branch.comingSoon ? (
                  <Badge
                    variant="secondary"
                    className="font-ui text-[10px] uppercase tracking-wide"
                  >
                    Coming Soon
                  </Badge>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
