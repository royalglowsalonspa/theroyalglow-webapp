/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : UserIdentity
 * Scope        : Admin Portal — App Shell / Top Bar (top-right)
 *
 * Description  : Signed-in user menu for the admin Top_Bar, top-right corner.
 *                The avatar (≤2 initials) is the dropdown trigger and a
 *                ≥44×44px touch target; at ≥1024px the display name + role label
 *                show beside it, hidden below 1024px (avatar retained). The
 *                dropdown summarises the identity and now carries real actions:
 *                Account (→ `/me`) and Log out (Better Auth `signOut`).
 *
 * Responsibilities :
 * - Render a ≥44×44px avatar trigger with ≤2 uppercase initials
 * - Show name + role at ≥1024px, hide the text below 1024px (avatar retained)
 * - Open a DropdownMenu with the identity summary + Account + Log out
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript, shadcn
 *                (Avatar, DropdownMenu), Better Auth
 * Layer        : Presentation (Shell / Layout Component)
 *
 * Notes        : Presentation-layer only. `signOut` clears the shared
 *                `.theroyalglow.in` session, then the browser is sent to the
 *                customer site origin. Semantic Brand-Token utilities only.
 *
 * Requirements : 6.3, 19.2, 19.4, 19.5
 ************************************************************/

'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toInitials } from '@/lib/admin/initials'
import { signOut } from '@/lib/auth-client'
import { BadgeCheck, LogOut } from 'lucide-react'
import Link from 'next/link'

type UserIdentityProps = {
  /** Signed-in user's display name. */
  userName: string
  /** Human-readable role label for the signed-in user. */
  role: string
  /** Optional signed-in email (Gmail) shown in the dropdown header. */
  email?: string | undefined
  /**
   * Up to two uppercase initials for the avatar. Derived from {@link userName}
   * via {@link toInitials} when not supplied.
   */
  initials?: string | undefined
}

/**
 * User identity menu for the admin Top_Bar (top-right).
 *
 * At ≥1024px the avatar shows beside the display name and role label; below
 * 1024px the text is hidden while the avatar remains an operable ≥44×44px
 * control (Req 19.2, 19.4, 19.5). The dropdown carries Account + Log out.
 */
export function UserIdentity({ userName, role, email, initials }: UserIdentityProps) {
  const avatarInitials = initials ?? toInitials(userName)

  async function handleSignOut() {
    await signOut()
    // Leave the admin host for the customer site after the session is cleared.
    window.location.href = 'https://theroyalglow.in'
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${userName}, ${role}`}
          className="flex min-h-11 min-w-11 items-center gap-2 rounded-full pr-1 transition-colors hover:bg-cloud-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa-dark"
        >
          <Avatar className="size-9">
            <AvatarFallback className="bg-cloud-gray font-ui text-xs text-warm-gray">
              {avatarInitials}
            </AvatarFallback>
          </Avatar>

          <span className="hidden text-left lg:block" data-testid="user-identity-text">
            <span className="block font-sans text-sm font-medium leading-tight text-cocoa-dark">
              {userName}
            </span>
            <span className="block font-ui text-[10px] uppercase tracking-wider text-dusty-gray">
              {role}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
        <DropdownMenuLabel className="font-ui">
          <span className="block text-sm text-cocoa-dark">{userName}</span>
          {email ? (
            <span className="block truncate text-xs font-normal text-dusty-gray">{email}</span>
          ) : (
            <span className="block text-xs font-normal uppercase tracking-wider text-dusty-gray">
              {role}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/me">
              <BadgeCheck />
              <span>Account</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
          <LogOut />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
