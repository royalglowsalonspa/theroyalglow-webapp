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
 *                Rebuilt on the shadcn/ui Button, Card, and Accordion (Radix)
 *                primitives with lucide icons.
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
 * Tech Stack   : React (client), Next.js 16 (App Router), Tailwind CSS v4,
 *                shadcn/ui, Radix, lucide-react
 * Layer        : Presentation
 *
 * Dependencies : next/link, React, @/components/ui/{button,card,accordion},
 *                lucide-react
 *
 * Notes        :
 * - Presentation only; consumes the { success, data } envelope from the API.
 ************************************************************/

'use client'

import { ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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

function ServiceCard({ service }: { service: CatalogueService }) {
  return (
    <Card className="gap-0 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-golden-mist hover:shadow-card-hover">
      <h4 className="font-sans text-[15px] font-medium text-cocoa-dark">{service.name}</h4>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-ui text-sm text-dusty-gray">{service.durationMinutes} min</span>
          <span className="font-ui text-sm text-gold-ink">{formatINR(service.pricePaise)}</span>
        </div>
        <Button
          asChild
          variant="link"
          size="sm"
          className="px-0 font-ui text-xs uppercase tracking-[0.5px] text-gold-ink hover:text-cocoa-dark"
        >
          <Link href={`/?book=1&service=${encodeURIComponent(service.slug)}`}>
            Book This
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Card>
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
        <header className="mb-10 text-center">
          <h1 className="font-display text-[clamp(32px,4.5vw,48px)] font-black leading-[1.1] tracking-[-0.96px] text-cocoa-dark">
            Our Services
          </h1>
          <p className="mx-auto mt-3 max-w-[520px] font-sans text-[17px] leading-[1.6] text-warm-gray">
            From expert haircuts to rejuvenating spa therapies — explore our full menu of premium
            beauty services.
          </p>
        </header>

        {loading ? (
          <output className="flex items-center justify-center gap-3 py-16" aria-live="polite">
            <Loader2 className="size-5 animate-spin text-gold-ink" aria-hidden="true" />
            <span className="font-sans text-[15px] text-dusty-gray">Loading our services…</span>
          </output>
        ) : error ? (
          <div className="mx-auto max-w-[520px] rounded-[6px] border border-error/40 bg-error/5 px-5 py-6 text-center">
            <p className="mb-3 font-sans text-[15px] text-error" role="alert">
              {error}
            </p>
            <Button
              type="button"
              variant="gold"
              onClick={load}
              className="rounded-full font-ui text-xs uppercase tracking-[0.5px]"
            >
              Try Again
            </Button>
          </div>
        ) : (
          <>
            {/* Salon / SPA Toggle */}
            <div
              className="mb-10 flex items-center justify-center gap-2"
              role="tablist"
              aria-label="Service type"
            >
              {(['salon', 'spa'] as const).map((type) => (
                <Button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={serviceType === type}
                  variant={serviceType === type ? 'gold' : 'secondary'}
                  onClick={() => setServiceType(type)}
                  className={cn(
                    'rounded-full font-ui text-xs uppercase tracking-[0.5px]',
                    serviceType !== type && 'text-warm-gray hover:bg-golden-mist',
                  )}
                >
                  {type === 'salon' ? 'Salon' : 'SPA'}
                </Button>
              ))}
            </div>

            {visibleCategories.length === 0 ? (
              <p className="py-12 text-center font-sans text-warm-gray">
                No {serviceType === 'salon' ? 'salon' : 'spa'} services listed yet. Check back soon!
              </p>
            ) : (
              <Accordion
                type="multiple"
                defaultValue={visibleCategories.map((c) => c.id)}
                className="w-full"
                aria-label={`${serviceType === 'salon' ? 'Salon' : 'SPA'} services`}
              >
                {visibleCategories.map((category) => (
                  <AccordionItem
                    key={category.id}
                    value={category.id}
                    className="border-outline-gray"
                  >
                    <AccordionTrigger className="py-4 font-display text-lg text-cocoa-dark hover:no-underline">
                      {category.name}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2 lg:grid-cols-3">
                        {category.services.map((service) => (
                          <ServiceCard key={service.id} service={service} />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </>
        )}
      </div>
    </div>
  )
}
