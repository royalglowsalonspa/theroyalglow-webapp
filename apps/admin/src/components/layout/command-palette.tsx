/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : layout/command-palette
 * Scope        : Admin — Command palette (⌘K / Ctrl+K)
 *
 * Description  : Global command palette composing the owned-source shadcn
 *                `Command` (cmdk) inside a dialog. Opens on ⌘K / Ctrl+K or the
 *                Top Bar trigger, moves focus to the search input, filters the
 *                role-visible destinations by case-insensitive label substring,
 *                and routes to the selected destination (closing on select /
 *                Esc, returning focus to the opener). The destination list is
 *                produced by the pure `commandItemsForLevel` selector, so it
 *                always matches the sidebar + middleware for the role.
 *
 * Responsibilities :
 * - Render a Top Bar trigger that opens the palette
 * - Open/close on ⌘K / Ctrl+K (global) and Esc
 * - List `commandItemsForLevel(ADMIN_NAV, roleLevel)` (unresolved → level 0)
 * - Route to a selected destination and close
 *
 * Tech Stack   : React (Client Component), shadcn Command (cmdk), Next.js
 * Layer        : Presentation (no I/O, no business logic)
 *
 * Dependencies : @/components/ui/command, @/lib/admin/command-items,
 *                @/lib/rbac (ADMIN_NAV), next/navigation
 *
 * Requirements : 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9
 ************************************************************/

'use client'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { commandItemsForLevel } from '@/lib/admin/command-items'
import { ADMIN_NAV } from '@/lib/rbac'
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

/**
 * Global command palette + its Top Bar trigger.
 *
 * @param roleLevel - The signed-in user's resolved role level (drives the
 *   visible destinations; unresolved / unknown → level 0).
 */
export function CommandPalette({ roleLevel }: { roleLevel: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const items = useMemo(() => commandItemsForLevel(ADMIN_NAV, roleLevel), [roleLevel])

  // Global ⌘K / Ctrl+K toggles the palette.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((previous) => !previous)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className="inline-flex h-9 items-center gap-2 rounded-buttons border border-outline-gray bg-canvas-white px-3 font-ui text-sm text-dusty-gray transition-colors hover:text-cocoa-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa-dark"
      >
        <Search size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="hidden rounded-cards border border-outline-gray bg-cloud-gray px-1.5 font-ui text-[10px] text-warm-gray sm:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command palette"
        description="Search admin destinations"
      >
        <CommandInput placeholder="Search admin destinations…" />
        <CommandList>
          <CommandEmpty>No matching destination.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {items.map((item) => (
              <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
