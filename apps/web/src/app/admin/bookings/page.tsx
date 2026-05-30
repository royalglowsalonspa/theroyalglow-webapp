import type { Metadata } from 'next'
import { BookingsTable } from './bookings-table'

export const metadata: Metadata = {
  title: 'Bookings',
}

export default function BookingsPage() {
  return <BookingsTable />
}
