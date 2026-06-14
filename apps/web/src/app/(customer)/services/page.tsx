/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServicesPage
 * Scope        : Customer Pages
 *
 * Description  : Services index page that fetches the catalogue from Payload
 *                CMS and renders JSON-LD structured data. Falls back to the
 *                hardcoded catalogue in ServicesContent when CMS is empty.
 *
 * Responsibilities :
 * - Emit LocalBusiness and Breadcrumb JSON-LD for SEO
 * - Fetch active services via getServices()
 * - Mount ServicesContent with CMS data or hardcoded fallback
 *
 * Features / Functionality :
 * - ISR-cached CMS reads (1h default)
 * - Salon/SPA toggle delegated to ServicesContent / CmsServicesCatalogue
 *
 * Tech Stack   : React (server), Next.js 16 (App Router), Tailwind CSS v4, JSON-LD
 * Layer        : Presentation
 *
 * Dependencies : JsonLd, getServices, SITE_URL, breadcrumbJsonLd, localBusinessJsonLd,
 *                buildMetadata, ServicesContent
 *
 * Notes        :
 * - Per-service JSON-LD can be added when per-slug service pages land.
 ************************************************************/

import { JsonLd } from '@/components/seo/JsonLd'
import { getServices } from '@/lib/cms/client'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, localBusinessJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { CmsServicesCatalogue } from './CmsServicesCatalogue'
import { ServicesContent } from './services-content'

export const metadata: Metadata = buildMetadata({
  title: 'Our Services',
  description:
    'Explore our full range of premium salon and spa services — haircuts, facials, waxing, manicure, pedicure, makeup, and luxury body therapies in Bengaluru.',
  path: '/services',
})

export const revalidate = 3600

export default async function ServicesPage() {
  const cmsServices = await getServices()

  return (
    <>
      <JsonLd
        data={[
          localBusinessJsonLd(),
          breadcrumbJsonLd([{ name: 'Home', url: SITE_URL }, { name: 'Services' }]),
        ]}
      />
      {cmsServices.length > 0 ? (
        <CmsServicesCatalogue services={cmsServices} />
      ) : (
        <ServicesContent />
      )}
    </>
  )
}
