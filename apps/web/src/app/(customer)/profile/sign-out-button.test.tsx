import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { signOut } from '@/lib/auth-client'
import { SignOutButton } from './sign-out-button'

vi.mock('@/lib/auth-client', () => ({ signOut: vi.fn() }))

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
