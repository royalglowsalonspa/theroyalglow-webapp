// @vitest-environment node

import type { BranchDirectoryEntry } from '@rgss/db/queries'
import { DEFAULT_BUSINESS_HOURS } from '@rgss/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { readDirectory } = vi.hoisted(() => ({ readDirectory: vi.fn() }))
vi.mock('@rgss/db/queries', () => ({ getBranchDirectory: readDirectory }))

let loadPublicLocations: typeof import('./branch-directory').loadPublicLocations

const branch: BranchDirectoryEntry = {
  id: 'branch_indiranagar',
  code: 'IND',
  name: 'Indiranagar',
  status: 'temporarily_closed',
  isPrimary: false,
  temporaryCloseReason: 'Power maintenance',
  addressLine1: '100 Feet Road',
  addressLine2: null,
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560038',
  phone: '98765 43210',
  email: 'indiranagar@example.com',
  googleMapsUrl: 'https://maps.example.com/indiranagar',
  businessHours: DEFAULT_BUSINESS_HOURS,
  closures: [{ date: '2026-12-01', name: 'Maintenance' }],
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers({ now: new Date('2026-11-22T18:29:00Z'), toFake: ['Date'] })
  readDirectory.mockReset()
  readDirectory.mockResolvedValue([branch])
  const directory = await import('./branch-directory')
  loadPublicLocations = directory.loadPublicLocations
})

afterEach(() => {
  vi.useRealTimers()
})

describe('public branch directory', () => {
  it('shares the branch schedule within the five-minute cache and refreshes at IST midnight', async () => {
    const [first, second] = await Promise.all([loadPublicLocations(), loadPublicLocations()])

    expect(readDirectory).toHaveBeenCalledExactlyOnceWith('2026-11-22', '2026-12-21')
    expect(first).toBe(second)
    expect(first).toEqual([
      {
        id: branch.id,
        name: branch.name,
        addressLines: ['100 Feet Road', 'Bengaluru, Karnataka 560038'],
        phone: { label: '98765 43210', href: 'tel:+919876543210' },
        email: branch.email,
        directions: branch.googleMapsUrl,
        status: 'Temporarily closed · Power maintenance',
        hours: [
          { days: 'Mon – Fri', hours: '10:00 AM – 9:00 PM' },
          { days: 'Sat – Sun', hours: '10:00 AM – 10:00 PM' },
        ],
        closures: branch.closures,
      },
    ])

    vi.setSystemTime(new Date('2026-11-22T18:31:00Z'))
    await loadPublicLocations()

    expect(readDirectory).toHaveBeenLastCalledWith('2026-11-23', '2026-12-22')
    expect(readDirectory).toHaveBeenCalledTimes(2)
  })

  it('uses the primary branch fallback for a failed read and retries on the next request', async () => {
    readDirectory.mockRejectedValueOnce(new Error('Database unavailable'))

    const fallback = await loadPublicLocations()
    const recovered = await loadPublicLocations()

    expect(fallback).toMatchObject([{ id: null, name: 'Rayasandra' }])
    expect(recovered).toMatchObject([{ id: branch.id, name: branch.name }])
    expect(readDirectory).toHaveBeenCalledTimes(2)
  })

  it('preserves a successful empty directory without reviving an unavailable branch', async () => {
    readDirectory.mockResolvedValue([])

    expect(await loadPublicLocations()).toEqual([])
  })
})
