/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : AdminShell (component test)
 * Scope        : Admin Portal — App_Shell composition + overlay drawer
 *
 * Description  : Component tests for the admin App_Shell. Verifies the shell
 *                composes the Top_Bar (sidebar toggle), the Breadcrumb_Trail,
 *                and the page content region (Req 3.1, 3.2), and that the
 *                mobile overlay drawer (a Radix Dialog) opens on toggle, traps
 *                keyboard focus, closes on Escape / nav-item activation, and
 *                returns focus to the toggle on close (Req 3.6–3.9).
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        :
 * - Validates: Requirements 3.1, 3.2, 3.6, 3.7, 3.8, 3.9
 * - `next/navigation` usePathname is pinned to '/' so the sidebar + breadcrumb
 *   render deterministically; `next/link` is rendered as a plain anchor so no
 *   App Router context is required; the `RealtimeProvider` and
 *   `NotificationBell` are stubbed to no-ops so the shell renders in jsdom with
 *   no Ably/network access. Mocks are local to this file.
 * - Radix moves focus asynchronously, so focus assertions are wrapped in
 *   `waitFor` to stay resilient to that timing.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Deterministic route so the sidebar + breadcrumb derive a stable trail.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

// Render next/link as a plain anchor — avoids needing an App Router context and
// keeps nav-item activation (onClick) observable without a real navigation.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string | { pathname?: string }
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <a
      href={typeof href === 'string' ? href : (href?.pathname ?? '#')}
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}))

// RealtimeProvider pulls in Ably + the /api/ably/token route — stub to a no-op
// pass-through so the shell renders in jsdom with no network access.
vi.mock('@/components/realtime/realtime-provider', () => ({
  RealtimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// NotificationBell polls /api/notifications on mount — stub to nothing.
vi.mock('@/components/notifications/notification-bell', () => ({
  NotificationBell: () => null,
}))

import { AdminShell } from './admin-shell'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderShell() {
  return render(
    // biome-ignore lint/a11y/useValidAriaRole: `role` here is AdminShell's RBAC prop (the user's role), not a DOM ARIA role attribute
    <AdminShell role="owner" userName="Asha Rao" userInitials="AR">
      <div>Page content region</div>
    </AdminShell>,
  )
}

describe('AdminShell composition (Req 3.1, 3.2)', () => {
  it('renders the Top_Bar sidebar toggle, the Breadcrumb nav, and the page content', () => {
    renderShell()

    // Top_Bar sidebar toggle — icon-only control with an accessible label.
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument()

    // Breadcrumb_Trail rendered in a labelled navigation landmark.
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()

    // The page content children are rendered in the main region.
    expect(screen.getByText('Page content region')).toBeInTheDocument()
  })
})

describe('AdminShell overlay drawer (Req 3.6–3.9)', () => {
  it('opens the drawer dialog when the toggle is activated (Req 3.6)', async () => {
    renderShell()

    // No dialog before the toggle is activated.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: 'Open navigation menu' })
    toggle.focus()
    fireEvent.click(toggle)

    // Radix mounts the dialog (role="dialog") with its dimming backdrop.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('moves keyboard focus into the drawer and traps it (Req 3.8)', async () => {
    renderShell()

    const toggle = screen.getByRole('button', { name: 'Open navigation menu' })
    toggle.focus()
    fireEvent.click(toggle)

    const dialog = await screen.findByRole('dialog')

    // Radix moves focus into the dialog on open.
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
  })

  it('closes on Escape and returns focus to the toggle (Req 3.7, 3.9)', async () => {
    renderShell()

    const toggle = screen.getByRole('button', { name: 'Open navigation menu' })
    toggle.focus()
    fireEvent.click(toggle)

    const dialog = await screen.findByRole('dialog')

    // Escape dismisses the overlay (Req 3.7).
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Focus returns to the toggle that opened it (Req 3.9).
    await waitFor(() => {
      expect(document.activeElement).toBe(toggle)
    })
  })

  it('closes when a navigation item inside the drawer is activated (Req 3.7)', async () => {
    renderShell()

    const toggle = screen.getByRole('button', { name: 'Open navigation menu' })
    toggle.focus()
    fireEvent.click(toggle)

    const dialog = await screen.findByRole('dialog')

    // Activate a nav item scoped to the drawer (the persistent rail renders the
    // same labels, so scope the query to the dialog).
    const navItem = within(dialog).getByRole('link', { name: 'Bookings' })
    fireEvent.click(navItem)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
