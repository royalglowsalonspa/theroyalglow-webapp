/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServicesCatalogue
 * Scope        : Customer Pages
 *
 * Description  : Client component that sources the service catalogue from
 *                GET /api/services and renders it with a Salon/SPA toggle,
 *                category accordions, and service cards with booking links.
 *                Presents a loading state while the request is pending and an
 *                error state with a retry control on failure.
 *
 * Responsibilities :
 * - Fetch the active catalogue from GET /api/services (standard envelope)
 * - Show loading / error (with retry) / empty states
 * - Render the Salon/SPA type toggle and category-grouped service cards
 *
 * Features / Functionality :
 * - Salon/SPA toggle filtered by category serviceType
 * - Categories and services preserve the server-provided display order
 * - Deep-link booking via /?book=1&service={slug}
 *
 * Tech Stack   : React (client), Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : next/link, React (useCallback, useEffect, useMemo, useState)
 *
 * Notes        :
 * - Presentation only; consumes the { success, data } envelope from the API.
 ************************************************************/

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

// --- Types (mirror GET /api/services response) ---
type ServiceType = 'salon' | 'spa'

interface CatalogueService {
  id: string
  categoryId: string
  categoryName: string
  name: string
  slug: string
  durationMinutes: number
  pricePaise: number
  gemsRedeemable: boolean
  gemsRequired: number | null
}

interface CatalogueCategory {
  id: string
  name: string
  serviceType: ServiceType
  displayOrder: number
  services: CatalogueService[]
}

// --- Formatting helpers ---
function formatINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

// --- Sub-components ---
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <line x1="7" y1="1" x2="7" y2="13" />
      <line x1="1" y1="7" x2="13" y2="7" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-deep-gold"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function ServiceCard({ service }: { service: CatalogueService }) {
  return (
    <article className="border border-cloud-gray rounded-[6px] p-4 motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:-translate-y-[2px] hover:shadow-card-hover">
      <h4 className="font-sans text-[15px] text-cocoa-dark font-medium">{service.name}</h4>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3">
          <span className="font-sans text-sm text-dusty-gray">{service.durationMinutes} min</span>
          <span className="text-deep-gold font-ui text-sm">{formatINR(service.pricePaise)}</span>
        </div>
        <Link
          href={`/?book=1&service=${encodeURIComponent(service.slug)}`}
          className="font-ui text-xs uppercase tracking-[0.5px] text-deep-gold hover:text-cocoa-dark motion-safe:transition-colors motion-safe:duration-200"
        >
          Book This <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}

// --- Main component ---
export function ServicesCatalogue() {
  const [categories, setCategories] = useState<CatalogueCategory[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serviceType, setServiceType] = useState<ServiceType>('salon')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/services')
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load our services.')
      }
      setCategories(json.data.categories as CatalogueCategory[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load our services.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visibleCategories = useMemo(
    () => (categories ?? []).filter((category) => category.serviceType === serviceType),
    [categories, serviceType],
  )

  return (
    <div className="px-5 py-10 lg:py-16">
      <div className="mx-auto max-w-[1278px]">
        {/* Page Header */}
        <header className="text-center mb-10">
          <h1 className="font-display text-cocoa-dark text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]">
            Our Services
          </h1>
          <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-3 max-w-[520px] mx-auto">
            From expert haircuts to rejuvenating spa therapies — explore our full menu of premium
            beauty services.
          </p>
        </header>

        {loading ? (
          <output className="flex items-center justify-center gap-3 py-16" aria-live="polite">
            <Spinner />
            <span className="font-sans text-[15px] text-dusty-gray">Loading our services…</span>
          </output>
        ) : error ? (
          <div className="mx-auto max-w-[520px] rounded-[6px] border border-error/40 bg-error/5 px-5 py-6 text-center">
            <p className="font-sans text-[15px] text-error mb-3" role="alert">
              {error}
            </p>
            <button
              type="button"
              onClick={load}
              className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-6 py-2.5 bg-royal-gold text-cocoa-dark hover:bg-deep-gold motion-safe:transition-colors duration-200"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            {/* Salon / SPA Toggle */}
            <div
              className="flex items-center justify-center gap-2 mb-10"
              role="tablist"
              aria-label="Service type"
            >
              {(['salon', 'spa'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={serviceType === type}
                  onClick={() => setServiceType(type)}
                  className={`font-ui text-xs uppercase tracking-[0.5px] px-6 py-2.5 rounded-full motion-safe:transition-all motion-safe:duration-200 ${
                    serviceType === type
                      ? 'bg-royal-gold text-cocoa-dark'
                      : 'bg-cloud-gray text-warm-gray hover:bg-golden-mist'
                  }`}
                >
                  {type === 'salon' ? 'Salon' : 'SPA'}
                </button>
              ))}
            </div>

            {visibleCategories.length === 0 ? (
              <p className="text-center font-sans text-warm-gray py-12">
                No {serviceType === 'salon' ? 'salon' : 'spa'} services listed yet. Check back soon!
              </p>
            ) : (
              <div
                className="space-y-4"
                role="tabpanel"
                aria-label={`${serviceType === 'salon' ? 'Salon' : 'SPA'} services`}
              >
                {visibleCategories.map((category) => (
                  <details key={category.id} className="group" open>
                    <summary className="flex items-center justify-between cursor-pointer list-none py-4 border-b border-outline-gray">
                      <h2 className="font-display text-lg text-cocoa-dark">{category.name}</h2>
                      <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-outline-gray text-cocoa-dark group-open:rotate-45 motion-safe:transition-transform motion-safe:duration-200">
                        <PlusIcon />
                      </span>
                    </summary>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-6">
                      {category.services.map((service) => (
                        <ServiceCard key={service.id} service={service} />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
