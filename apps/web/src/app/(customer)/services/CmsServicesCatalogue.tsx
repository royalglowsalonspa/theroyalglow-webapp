/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : CmsServicesCatalogue
 * Scope        : Customer Pages
 *
 * Description  : Client component rendering the /services catalogue from
 *                CMS-resolved Service view-models. Used when Payload returns
 *                active services; the hardcoded catalogue in services-content
 *                remains the fallback when CMS is empty.
 *
 * Responsibilities :
 * - Salon/SPA type toggle
 * - Group services by category
 * - Render service cards with duration, price, and Book This links
 *
 * Features / Functionality :
 * - Tier 1 booking deep-links (/?book=1, optional service + type params)
 * - Thumbnail image per service card
 *
 * Tech Stack   : React (client), Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/cms/types, next/link
 *
 * Notes        :
 * - bookingRef empty → generic /?book=1&type=salon|spa
 ************************************************************/
'use client'

import type { Service } from '@/lib/cms/types'
import Link from 'next/link'
import { useMemo, useState } from 'react'

type ServiceType = 'salon' | 'spa'

const CATEGORY_LABELS: Record<string, string> = {
  hair: 'Hair',
  skin: 'Skin',
  nails: 'Nails',
  bridal: 'Bridal',
  massage: 'Massage',
  facial: 'Facial',
  grooming: 'Grooming',
  waxing: 'Waxing',
  makeup: 'Makeup',
  other: 'Other',
}

function categoryLabel(value: string | null): string {
  if (value === null) {
    return 'Services'
  }
  return CATEGORY_LABELS[value] ?? value
}

function bookingHref(service: Service): string {
  if (service.bookingRef) {
    return `/?book=1&service=${encodeURIComponent(service.bookingRef)}&type=${service.type}`
  }
  return `/?book=1&type=${service.type}`
}

function groupByCategory(services: Service[]): [string, Service[]][] {
  const groups = new Map<string, Service[]>()
  for (const service of services) {
    const key = service.category ?? 'other'
    const list = groups.get(key) ?? []
    list.push(service)
    groups.set(key, list)
  }
  return Array.from(groups.entries())
}

function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="border border-cloud-gray rounded-[6px] overflow-hidden motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:-translate-y-[2px] hover:shadow-card-hover">
      <img src={service.image.url} alt={service.image.alt} className="w-full h-32 object-cover" />
      <div className="p-4">
        <h4 className="font-sans text-[15px] text-cocoa-dark font-medium">{service.name}</h4>
        {service.description && (
          <p className="font-sans text-sm text-warm-gray mt-1 line-clamp-2">
            {service.description}
          </p>
        )}
        <div className="flex items-center justify-between mt-3 gap-3">
          <div className="flex items-center gap-3">
            <span className="font-sans text-sm text-dusty-gray">{service.durationMinutes} min</span>
            <span className="text-deep-gold font-ui text-sm">{service.priceFormatted}</span>
          </div>
          <Link
            href={bookingHref(service)}
            className="font-ui text-xs uppercase tracking-[0.5px] text-deep-gold hover:text-cocoa-dark motion-safe:transition-colors motion-safe:duration-200 whitespace-nowrap"
          >
            Book This <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  )
}

export function CmsServicesCatalogue({ services }: { services: Service[] }) {
  const [serviceType, setServiceType] = useState<ServiceType>('salon')

  const filtered = useMemo(
    () => services.filter((service) => service.type === serviceType),
    [services, serviceType],
  )
  const grouped = useMemo(() => groupByCategory(filtered), [filtered])

  return (
    <div className="px-5 py-10 lg:py-16">
      <div className="mx-auto max-w-[1278px]">
        <header className="text-center mb-10">
          <h1 className="font-display text-cocoa-dark text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]">
            Our Services
          </h1>
          <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-3 max-w-[520px] mx-auto">
            From expert haircuts to rejuvenating spa therapies — explore our full menu of premium
            beauty services.
          </p>
        </header>

        <div
          className="flex items-center justify-center gap-2 mb-10"
          role="tablist"
          aria-label="Service type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={serviceType === 'salon'}
            onClick={() => setServiceType('salon')}
            className={`font-ui text-xs uppercase tracking-[0.5px] px-6 py-2.5 rounded-full motion-safe:transition-all motion-safe:duration-200 ${
              serviceType === 'salon'
                ? 'bg-royal-gold text-cocoa-dark'
                : 'bg-cloud-gray text-warm-gray hover:bg-golden-mist'
            }`}
          >
            Salon
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={serviceType === 'spa'}
            onClick={() => setServiceType('spa')}
            className={`font-ui text-xs uppercase tracking-[0.5px] px-6 py-2.5 rounded-full motion-safe:transition-all motion-safe:duration-200 ${
              serviceType === 'spa'
                ? 'bg-royal-gold text-cocoa-dark'
                : 'bg-cloud-gray text-warm-gray hover:bg-golden-mist'
            }`}
          >
            SPA
          </button>
        </div>

        <div className="space-y-10">
          {grouped.map(([category, items]) => (
            <section key={category} aria-labelledby={`cat-${category}`}>
              <h2
                id={`cat-${category}`}
                className="font-display text-cocoa-dark text-xl tracking-[-0.48px] mb-4"
              >
                {categoryLabel(category)}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((service) => (
                  <ServiceCard key={service.id} service={service} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center font-sans text-warm-gray py-12">
            No {serviceType === 'salon' ? 'salon' : 'spa'} services listed yet. Check back soon!
          </p>
        )}
      </div>
    </div>
  )
}
