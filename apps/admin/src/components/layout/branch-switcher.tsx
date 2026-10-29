/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : BranchSwitcher
 * Scope        : Admin Portal — App Shell / Sidebar footer (multi-branch R2.1, R2.4)
 *
 * Description  : The shadcn `sidebar-07` TeamSwitcher pattern, used as the
 *                Royal Glow branch switcher in the sidebar footer. It lists the
 *                branches the signed-in person can work in (GET /api/me/branch)
 *                with their role and each branch's status, and switches the
 *                active branch (PUT /api/me/branch). Collapses with the icon
 *                rail to the branch glyph only.
 *
 * Features / Functionality :
 * - Only branches the server says the person can access are listed
 * - Switching reloads the page, so every page, cache and live feed starts
 *   again for the new branch; forms rendered for the old branch are refused
 *   by the server anyway (409 BRANCH_CONTEXT_CHANGED)
 * - People with one branch see it, with nothing to switch
 *
 * Tech Stack   : React (Client Component), TypeScript, shadcn Sidebar +
 *                DropdownMenu, lucide-react
 * Layer        : Presentation (App Shell / Sidebar footer)
 *
 * Notes        : Semantic Brand-Token utilities only (no hex / raw colour /
 *                radius).
 ************************************************************/

'use client'

import type { BranchStatusValue } from '@rgss/types'
import { Check, ChevronsUpDown, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
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

/** A branch the person can work in, as GET /api/me/branch returns it. */
type SwitcherBranch = {
  id: string
  name: string
  code: string
  status: BranchStatusValue
  isPrimary: boolean
  role: 'staff' | 'receptionist' | 'manager' | 'owner' | 'developer'
}

type SwitcherState = { active: SwitcherBranch | null; branches: SwitcherBranch[] }

const STATUS_LABEL: Record<BranchStatusValue, string> = {
  operational: 'Operational',
  temporarily_closed: 'Temporarily closed',
  opens_soon: 'Opens soon',
  shutdown: 'Shut down',
}

const ROLE_LABEL: Record<SwitcherBranch['role'], string> = {
  staff: 'Staff',
  receptionist: 'Receptionist',
  manager: 'Manager',
  owner: 'Owner',
  developer: 'Developer',
}

/** Reload the page so nothing from the previous branch survives the switch. */
function reloadForBranch(): void {
  window.location.reload()
}

/**
 * Branch switcher rendered in the sidebar footer.
 */
export function BranchSwitcher() {
  const { isMobile } = useSidebar()
  const [state, setState] = useState<SwitcherState | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/branch')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json?.success) {
          setState(json.data as SwitcherState)
        }
      })
      .catch(() => {
        // Without the list the switcher shows no branch; pages still work.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const active = state?.active ?? null
  const branches = state?.branches ?? []

  const switchTo = async (branch: SwitcherBranch) => {
    if (branch.id === active?.id || switching) {
      return
    }
    setSwitching(branch.id)
    setError(null)
    try {
      const res = await fetch('/api/me/branch', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branchId: branch.id }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? 'Could not switch branch.')
      }
      reloadForBranch()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not switch branch.')
      setSwitching(null)
    }
  }

  const name = active?.name ?? (state ? 'No branch' : 'Loading…')
  const detail = active
    ? `${ROLE_LABEL[active.role]} · ${STATUS_LABEL[active.status]}`
    : state
      ? 'Ask your branch Owner'
      : ''

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={active ? `Active branch: ${active.name}. Switch branch.` : 'Branch: none'}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Store className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-sans text-sm font-medium text-cocoa-dark">
                  {name}
                </span>
                <span className="truncate font-ui text-xs text-dusty-gray">{detail}</span>
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
              {branches.length > 1 ? 'Switch branch' : 'Your branch'}
            </DropdownMenuLabel>
            {branches.map((branch) => (
              <DropdownMenuItem
                key={branch.id}
                disabled={switching !== null}
                onSelect={() => switchTo(branch)}
                className="gap-2 p-2"
              >
                <div className="flex size-6 items-center justify-center rounded-md border border-outline-gray">
                  <Store className="size-3.5 shrink-0" />
                </div>
                <span className="grid flex-1 leading-tight">
                  <span className="truncate text-cocoa-dark">{branch.name}</span>
                  <span className="truncate font-ui text-[11px] text-dusty-gray">
                    {ROLE_LABEL[branch.role]} · {STATUS_LABEL[branch.status]}
                  </span>
                </span>
                {branch.id === active?.id ? (
                  <Check className="size-4 shrink-0 text-cocoa-dark" aria-label="Active" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Outside the menu, which closes on select, so the reason stays visible. */}
        {error ? (
          <p
            className="px-2 pt-1 font-sans text-xs text-error group-data-[collapsible=icon]:hidden"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
