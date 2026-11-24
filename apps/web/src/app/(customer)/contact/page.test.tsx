import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw/http'
import { afterEach, expect, it, vi } from 'vitest'
import type { PublicLocation } from '@/lib/branch-directory'
import { server } from '@/test/msw-server'

const { loadPublicLocations } = vi.hoisted(() => ({ loadPublicLocations: vi.fn() }))
vi.mock('@/lib/branch-directory', () => ({ loadPublicLocations }))

import ContactPage from './page'

afterEach(cleanup)

it('renders distinct branch hours and closures and sends the enquiry to the chosen branch', async () => {
  const first: PublicLocation = {
    id: 'branch_rs',
    name: 'Rayasandra',
    addressLines: ['Narmada Complex', 'Bengaluru'],
    phone: null,
    email: null,
    directions: null,
    status: null,
    hours: [{ days: 'Mon – Sun', hours: '10:00 AM – 9:00 PM' }],
    closures: [],
  }
  const second: PublicLocation = {
    ...first,
    id: 'branch_ind',
    name: 'Indiranagar',
    addressLines: ['100 Feet Road', 'Bengaluru'],
    hours: [{ days: 'Mon – Sun', hours: '11:00 AM – 8:00 PM' }],
    closures: [{ date: '2026-12-01', name: 'Maintenance' }],
  }
  loadPublicLocations.mockResolvedValue([first, second])
  const submitted = vi.fn()
  server.use(
    http.post('*/api/contact', async ({ request }) => {
      submitted(await request.json())
      return HttpResponse.json({ success: true, data: { received: true } }, { status: 201 })
    }),
  )

  render(await ContactPage())

  const directory = screen.getByRole('navigation', { name: 'Choose a branch' })
  expect(within(directory).getByRole('link', { name: 'Indiranagar' })).toHaveAttribute(
    'href',
    '#location-branch_ind',
  )
  const rayasandra = within(screen.getByRole('article', { name: 'Rayasandra' }))
  const indiranagar = within(screen.getByRole('article', { name: 'Indiranagar' }))
  expect(rayasandra.getByText('10:00 AM – 9:00 PM')).toBeInTheDocument()
  expect(rayasandra.queryByText(/Maintenance/)).not.toBeInTheDocument()
  expect(indiranagar.getByText('11:00 AM – 8:00 PM')).toBeInTheDocument()
  expect(indiranagar.getByText('01/12/2026')).toBeInTheDocument()
  expect(indiranagar.getByText(/Maintenance/)).toBeInTheDocument()

  fireEvent.change(screen.getByRole('combobox', { name: 'Branch' }), {
    target: { value: 'branch_ind' },
  })
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Customer' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'customer@example.com' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Please call me back.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send Message' }))

  expect(await screen.findByText('Message sent', {}, { timeout: 3000 })).toBeInTheDocument()
  expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch_ind' }))
})
