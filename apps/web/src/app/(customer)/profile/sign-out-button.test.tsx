import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw/http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileNav } from '@/components/layout/MobileNav'
import { UserMenu } from '@/components/layout/UserMenu'
import { signOut } from '@/lib/auth-client'
import { server } from '@/test/msw-server'
import { SignOutButton } from './sign-out-button'

vi.mock('@/lib/auth-client', () => ({ signOut: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SignOutButton', () => {
  it('allows another attempt after a resolved HTTP error or a rejected request', async () => {
    vi.mocked(signOut)
      .mockResolvedValueOnce({ data: null, error: { status: 500, statusText: 'Server Error' } })
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
    render(<SignOutButton />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out')
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out')
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeEnabled()
    expect(signOut).toHaveBeenCalledTimes(2)
  })
})

it.each(['desktop', 'mobile'] as const)(
  'keeps sign-out retry available in the %s account menu',
  async (menu) => {
    server.use(
      http.get('*/api/gems', () => HttpResponse.json({ success: true, data: { balance: 0 } })),
      http.get('*/api/notifications', () =>
        HttpResponse.json({ success: true, data: { unreadCount: 0 } }),
      ),
    )
    vi.mocked(signOut).mockResolvedValueOnce({
      data: null,
      error: { status: 500, statusText: 'Server Error' },
    })
    const user = { name: 'Asha', email: null, image: null, role: 'customer' }
    if (menu === 'desktop') {
      render(<UserMenu user={user} />)
      fireEvent.keyDown(screen.getByRole('button', { name: 'Open account menu' }), {
        key: 'ArrowDown',
      })
    } else {
      render(<MobileNav isOpen pathname="/" onClose={vi.fn()} user={user} />)
    }
    const role = menu === 'desktop' ? 'menuitem' : 'button'
    fireEvent.click(await screen.findByRole(role, { name: /logout/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out')
    expect(screen.getByRole(role, { name: /logout/i })).toBeEnabled()
  },
)
