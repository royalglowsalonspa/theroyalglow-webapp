/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServicesPage
 * Scope        : Customer Pages
 *
 * Description  : Services index page that renders JSON-LD structured data and
 *                mounts the client catalogue, which sources categories and
 *                services from GET /api/services with loading and error states.
 *
 * Responsibilities :
 * - Emit LocalBusiness and Breadcrumb JSON-LD for SEO
 * - Mount ServicesCatalogue (sources data from GET /api/services)
 *
 * Features / Functionality :
 * - Live catalogue from the Services API (loading + error/retry states)
 * - Salon/SPA toggle delegated to ServicesCatalogue
 *
 * Tech Stack   : React (server), Next.js 16 (App Router), Tailwind CSS v4, JSON-LD
 * Layer        : Presentation
 *
 * Dependencies : JsonLd, SITE_URL, breadcrumbJsonLd, localBusinessJsonLd,
 *                buildMetadata, ServicesCatalogue
 *
 * Notes        :
 * - Per-service JSON-LD can be added when per-slug service pages land.
 ************************************************************/

import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, localBusinessJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { ServicesCatalogue } from './services-catalogue'

export const metadata: Metadata = buildMetadata({
  title: 'Our Services',
  description:
    'Explore our full range of premium salon and spa services — haircuts, facials, waxing, manicure, pedicure, makeup, and luxury body therapies in Bengaluru.',
  path: '/services',
})

export default function ServicesPage() {
  return (
    <>
      <JsonLd
        data={[
          localBusinessJsonLd(),
          breadcrumbJsonLd([{ name: 'Home', url: SITE_URL }, { name: 'Services' }]),
        ]}
      />
      <ServicesCatalogue />
    </>
  )
}
