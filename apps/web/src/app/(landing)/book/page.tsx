import { LeadCaptureForm } from '@/components/lead/LeadCaptureForm'
import { getServiceInterestOptions } from '@rgss/db/queries'
import type { Metadata } from 'next'

// Ad-traffic landing page — never indexed, never linked from site navigation.
export const metadata: Metadata = {
  title: 'Book Your Visit | Royal Glow Salon & Spa',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

// Pull the first value for a query key (Next can hand back string | string[]).
function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

export default async function BookLandingPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams
  const services = await getServiceInterestOptions()

  const utm = {
    utmSource: firstParam(sp.utm_source),
    utmMedium: firstParam(sp.utm_medium),
    utmCampaign: firstParam(sp.utm_campaign),
    utmContent: firstParam(sp.utm_content),
    utmTerm: firstParam(sp.utm_term),
  }

  return <LeadCaptureForm services={services} utm={utm} />
}
