import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw/http'
import { expect, it, vi } from 'vitest'
import { server } from '@/test/msw-server'
import { BookingsList } from './bookings-list'

vi.mock('@/components/booking/BookingDialogProvider', () => ({
  useBookingDialog: () => ({ open: vi.fn() }),
}))

it('links to review the current cancellation terms from the booking list', async () => {
  server.use(
    http.get('*/api/bookings', () =>
      HttpResponse.json({
        success: true,
        data: {
          bookings: [
            {
              id: 'bk_1',
              bookingNumber: 'BK-RS-2611-H-12345',
              branchName: 'Rayasandra',
              status: 'confirmed',
              serviceType: 'salon',
              bookingDate: '2099-06-10T00:00:00.000Z',
              startTime: '13:00:00',
              totalAmountPaise: 80000,
              services: [{ serviceNameSnapshot: 'Signature Haircut' }],
            },
          ],
        },
      }),
    ),
  )

  render(<BookingsList />)

  expect(await screen.findByRole('link', { name: 'Review Cancellation' })).toHaveAttribute(
    'href',
    '/bookings/bk_1#manage-booking',
  )
})
