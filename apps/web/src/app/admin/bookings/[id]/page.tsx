import type { Metadata } from 'next'
import { BookingDetail } from './booking-detail'

export const metadata: Metadata = {
  title: 'Booking Detail',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params
  return <BookingDetail bookingId={id} />
}
