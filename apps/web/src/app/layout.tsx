import type { Metadata } from 'next'
import { Analytics } from '@/components/analytics/Analytics'
import { CookieConsent } from '@/components/consent/CookieConsent'
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar'
import { SITE_URL } from '@/lib/seo/business'
import '@/styles/globals.css'

const DESCRIPTION =
  'A premium salon and spa experience in Bengaluru. Book appointments, explore services, and indulge in luxury beauty treatments.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Royal Glow Salon & Spa — Premium Salon & Spa in Bengaluru',
    template: '%s | Royal Glow Salon & Spa',
  },
  description: DESCRIPTION,
  openGraph: {
    title: 'Royal Glow Salon & Spa — Premium Salon & Spa in Bengaluru',
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'Royal Glow Salon & Spa',
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Royal Glow Salon & Spa — Premium Salon & Spa in Bengaluru',
    description: DESCRIPTION,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <CookieConsent />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
