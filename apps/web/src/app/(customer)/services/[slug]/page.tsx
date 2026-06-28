/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServiceDetailPage
 * Scope        : Customer Pages
 *
 * Description  : Dynamic per-service detail page. Resolves a single active
 *                service by its URL slug and renders an on-brand detail view
 *                with pricing, duration, category, service type, and a deep-
 *                linked "Book Now" CTA. Emits Service + Breadcrumb JSON-LD.
 *
 * Responsibilities :
 * - Resolve a service by slug with ISR and static param generation
 * - Render the service hero, meta facts, and booking CTA
 * - Emit Service + Breadcrumb JSON-LD for SEO
 * - Return 404 via notFound() when the slug is unknown/inactive
 *
 * Features / Functionality :
 * - generateStaticParams pre-renders known service slugs (sitemap parity)
 * - Dynamic metadata with canonical URL per service
 * - Deep-link booking via /?book=1&service={slug}
 *
 * Tech Stack   : React (server), Next.js 16 (App Router), Tailwind CSS v4, JSON-LD
 * Layer        : Presentation
 *
 * Dependencies : JsonLd, SITE_URL, breadcrumbJsonLd, serviceJsonLd, buildMetadata,
 *                getAllServicesGrouped, getServiceBySlug, formatINR, next/link,
 *                next/navigation
 *
 * Notes        :
 * - Slug source matches sitemap.ts (service.slug via getAllServicesGrouped),
 *   so every emitted /services/{slug} URL resolves here.
 ************************************************************/

import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, serviceJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'
import { formatINR } from '@rgss/business'
import { getAllServicesGrouped, getServiceBySlug } from '@rgss/db/queries'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

// ISR: revalidate each service roughly hourly (matches the catalogue pages).
export const revalidate = 3600

type ServiceDetailPageProps = {
  params: Promise<{ slug: string }>
}

// Friendly label for the service_type enum (salon | spa).
function serviceTypeLabel(type: 'salon' | 'spa'): string {
  return type === 'spa' ? 'SPA' : 'Salon'
}

// Fallback description when a service has none recorded — keeps JSON-LD and
// metadata populated without inventing marketing copy per service.
function describeService(name: string, categoryName: string): string {
  return `${name} — a premium ${categoryName.toLowerCase()} service at Royal Glow Salon & Spa, Bengaluru. Book your appointment today.`
}

// Pre-render the known active service slugs at build (same source the sitemap
// uses), so these are SSG/ISR like the rest of the catalogue. Unknown slugs
// still render on-demand and fall through to notFound().
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const categories = await getAllServicesGrouped()
    return categories.flatMap((category) =>
      category.services.map((service) => ({ slug: service.slug })),
    )
  } catch {
    // Catalogue read failed — render all paths on-demand rather than break build.
    return []
  }
}

export async function generateMetadata({ params }: ServiceDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const service = await getServiceBySlug(slug)

  if (service === null) {
    return buildMetadata({
      title: 'Service',
      description: 'Explore our premium salon and spa services in Bengaluru.',
      path: `/services/${slug}`,
      robotsIndex: false,
    })
  }

  return buildMetadata({
    title: service.name,
    description: service.description ?? describeService(service.name, service.categoryName),
    path: `/services/${service.slug}`,
  })
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { slug } = await params
  const service = await getServiceBySlug(slug)

  if (service === null) {
    notFound()
  }

  const description = service.description ?? describeService(service.name, service.categoryName)
  const bookHref = `/?book=1&service=${encodeURIComponent(service.slug)}`

  const facts: { label: string; value: string }[] = [
    { label: 'Price', value: formatINR(service.pricePaise) },
    { label: 'Duration', value: `${service.durationMinutes} min` },
    { label: 'Category', value: service.categoryName },
    { label: 'Type', value: serviceTypeLabel(service.serviceType) },
  ]

  return (
    <>
      <JsonLd
        data={[
          serviceJsonLd({
            name: service.name,
            description,
            pricePaise: service.pricePaise,
            slug: service.slug,
          }),
          breadcrumbJsonLd([
            { name: 'Home', url: SITE_URL },
            { name: 'Services', url: `${SITE_URL}/services` },
            { name: service.name },
          ]),
        ]}
      />

      <article className="flex flex-col gap-12">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* HEADER */}
        {/* ═══════════════════════════════════════════════════════ */}
        <header className="px-5">
          <div className="mx-auto max-w-[760px] mt-6 lg:mt-10">
            <Link
              href="/services"
              className="font-ui text-xs uppercase tracking-[1px] text-deep-gold motion-safe:transition-colors motion-safe:duration-200 hover:text-cocoa-dark"
            >
              ← Back to Services
            </Link>

            <p className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold mt-6">
              {serviceTypeLabel(service.serviceType)} · {service.categoryName}
            </p>

            <h1 className="font-display text-cocoa-dark tracking-[-1.2px] leading-[1.05] text-[clamp(34px,5vw,60px)] mt-3">
              {service.name}
            </h1>

            <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-5 max-w-[560px]">
              {description}
            </p>
          </div>
        </header>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* FACTS */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section className="px-5" aria-label="Service details">
          <div className="mx-auto max-w-[760px]">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-cloud-gray bg-cloud-gray sm:grid-cols-4">
              {facts.map((fact) => (
                <div key={fact.label} className="bg-white px-5 py-5">
                  <dt className="font-ui text-[11px] uppercase tracking-[1px] text-dusty-gray">
                    {fact.label}
                  </dt>
                  <dd className="font-ui text-[15px] text-cocoa-dark mt-1.5">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* CTA */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section className="px-5 pb-20">
          <div className="mx-auto max-w-[760px]">
            <div className="bg-warm-cream rounded-[6px] p-8 sm:p-12 text-center">
              <h2 className="font-display text-cocoa-dark text-[clamp(26px,4vw,40px)] tracking-[-0.8px] leading-[1.1]">
                Ready to book {service.name}?
              </h2>
              <p className="font-sans text-[16px] leading-[1.6] text-warm-gray mt-3 max-w-[420px] mx-auto">
                Reserve your appointment and experience Royal Glow for yourself.
              </p>
              <Link
                href={bookHref}
                className="mt-7 inline-flex bg-royal-gold text-cocoa-dark font-ui text-xs uppercase tracking-[0.5px] rounded-full px-8 h-10 items-center justify-center hover:bg-deep-gold hover:-translate-y-px motion-safe:transition-all motion-safe:duration-200"
                aria-label={`Book ${service.name} at Royal Glow`}
              >
                Book Now
              </Link>
            </div>
          </div>
        </section>
      </article>
    </>
  )
}
