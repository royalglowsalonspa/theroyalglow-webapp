import type { Metadata } from 'next'
import { ServicesContent } from './services-content'

export const metadata: Metadata = {
  title: 'Our Services | Royal Glow Salon & Spa',
  description:
    'Explore our full range of premium salon and spa services — haircuts, facials, waxing, manicure, pedicure, makeup, and luxury body therapies in Bengaluru.',
  openGraph: {
    title: 'Our Services | Royal Glow Salon & Spa',
    description:
      'Explore our full range of premium salon and spa services — haircuts, facials, waxing, manicure, pedicure, makeup, and luxury body therapies.',
    url: 'https://theroyalglow.in/services',
    siteName: 'Royal Glow Salon & Spa',
    locale: 'en_IN',
    type: 'website',
  },
}

export default function ServicesPage() {
  return <ServicesContent />
}
