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
