import type { Metadata } from 'next'
import { OffersManager } from './offers-manager'

export const metadata: Metadata = {
  title: 'Offers',
}

export default function OffersPage() {
  return <OffersManager />
}
