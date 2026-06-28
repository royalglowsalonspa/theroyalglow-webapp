/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : RootLayout
 * Scope        : Application Shell
 *
 * Description  : Root layout providing global metadata, analytics,
 *                cookie consent, and PWA service worker registration.
 *
 * Responsibilities :
 * - Set global HTML metadata (title, OG, Twitter)
 * - Mount consent-gated Analytics component
 * - Mount CookieConsent banner
 * - Register service worker for PWA
 *
 * Features / Functionality :
 * - Brand title template (%s | Royal Glow Salon & Spa)
 * - Open Graph + Twitter Card meta tags
 * - en_IN locale targeting
 *
 * Tech Stack   : Next.js 16 (App Router), React
 * Layer        : Presentation (Layout)
 *
 * Dependencies : @/components/analytics, @/components/consent,
 *                @/components/pwa, @/lib/seo/business
 *
 * Notes        :
 * - suppressHydrationWarning for dark-mode/extension compatibility
 ************************************************************/
import { Analytics } from '@/components/analytics/Analytics'
import { CookieConsent } from '@/components/consent/CookieConsent'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar'
import { SITE_URL } from '@/lib/seo/business'
import type { Metadata } from 'next'
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
    // Default social-share image (1200x630). metadataBase resolves this to an
    // absolute URL. Pages built via buildMetadata() override it per-page.
    images: [
      {
        url: '/og-default.jpg',
        width: 1200,
        height: 630,
        alt: 'Royal Glow Salon & Spa',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Royal Glow Salon & Spa — Premium Salon & Spa in Bengaluru',
    description: DESCRIPTION,
    images: ['/og-default.jpg'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <Analytics />
        <CookieConsent />
        <ServiceWorkerRegistrar />
        <InstallPrompt />
      </body>
    </html>
  )
}
