/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServicesPage
 * Scope        : Customer Pages
 *
 * Description  : Services index page that renders JSON-LD structured data
 *                and mounts the client-side ServicesContent component for the service catalogue.
 *
 * Responsibilities :
 * - Emit LocalBusiness and Breadcrumb JSON-LD for SEO
 * - Mount the ServicesContent component which renders the full catalogue
 * - Provide page-level metadata for services
 *
 * Features / Functionality :
 * - Server component with static metadata
 * - JSON-LD LocalBusiness + Breadcrumb schema
 * - Delegates catalogue rendering to client component (Salon/SPA toggle)
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, JSON-LD
 * Layer        : Presentation
 *
 * Dependencies : JsonLd, SITE_URL, breadcrumbJsonLd, localBusinessJsonLd, buildMetadata, ServicesContent
 *
 * Notes        :
 * - Per-service JSON-LD will be added when per-slug service pages are created
 ************************************************************/

import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, localBusinessJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { ServicesContent } from './services-content'

export const metadata: Metadata = buildMetadata({
  title: 'Our Services',
  description:
    'Explore our full range of premium salon and spa services — haircuts, facials, waxing, manicure, pedicure, makeup, and luxury body therapies in Bengaluru.',
  path: '/services',
})

export default function ServicesPage() {
  // NOTE: the service catalogue is rendered client-side from `services-content`
  // (no server-side data layer here), so per-service `Service` JSON-LD is not
  // attached on this index. When per-slug service pages land (with a server
  // data read), add `serviceJsonLd(...)` per service there.
  return (
    <>
      <JsonLd
        data={[
          localBusinessJsonLd(),
          breadcrumbJsonLd([{ name: 'Home', url: SITE_URL }, { name: 'Services' }]),
        ]}
      />
      <ServicesContent />
    </>
  )
}
