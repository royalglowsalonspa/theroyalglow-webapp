'use client'

import { useState } from 'react'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────
type ServiceType = 'salon' | 'spa'

interface SalonService {
  id: string
  name: string
  slug: string
  durationMinutes: number
  pricePaise: number
}

interface SpaService {
  id: string
  name: string
  slug: string
  durationMinutes: number
  pricePaise: number
}

interface SpaTherapy {
  name: string
  slug60: string
  slug90: string
  id60: string
  id90: string
  price60Paise: number
  price90Paise: number
}

interface SalonCategory {
  id: string
  name: string
  slug: string
  services: SalonService[]
}

interface SpaCategory {
  id: string
  name: string
  slug: string
  therapies?: SpaTherapy[]
  services?: SpaService[]
}

// ─── Currency Formatter ──────────────────────────────────────────────
function formatINR(paise: number): string {
  const rupees = paise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees)
}

// ─── Salon Data ──────────────────────────────────────────────────────
const salonCategories: SalonCategory[] = [
  {
    id: 'cat_haircut',
    name: 'Haircut & Styling',
    slug: 'haircut-styling',
    services: [
      { id: 'svc_haircut_basic', name: 'Haircut (Basic)', slug: 'haircut-basic', durationMinutes: 30, pricePaise: 50000 },
      { id: 'svc_haircut_advanced', name: 'Haircut (Advanced / Layered)', slug: 'haircut-advanced', durationMinutes: 45, pricePaise: 80000 },
      { id: 'svc_wash_blowdry', name: 'Hair Wash & Blow Dry', slug: 'wash-blowdry', durationMinutes: 30, pricePaise: 40000 },
      { id: 'svc_straightening_temp', name: 'Hair Straightening (Temporary)', slug: 'straightening-temp', durationMinutes: 60, pricePaise: 150000 },
      { id: 'svc_hair_ironing', name: 'Hair Ironing', slug: 'hair-ironing', durationMinutes: 30, pricePaise: 60000 },
      { id: 'svc_bridal_hair', name: 'Bridal Hair Styling', slug: 'bridal-hair', durationMinutes: 90, pricePaise: 500000 },
    ],
  },
  {
    id: 'cat_colour',
    name: 'Hair Colouring / Treatment',
    slug: 'hair-colouring-treatment',
    services: [
      { id: 'svc_colour_global_short', name: 'Global Colour (Short Hair)', slug: 'colour-global-short', durationMinutes: 90, pricePaise: 250000 },
      { id: 'svc_colour_global_long', name: 'Global Colour (Long Hair)', slug: 'colour-global-long', durationMinutes: 120, pricePaise: 400000 },
      { id: 'svc_highlights', name: 'Highlights / Balayage', slug: 'highlights', durationMinutes: 120, pricePaise: 350000 },
      { id: 'svc_root_touchup', name: 'Root Touch-Up', slug: 'root-touchup', durationMinutes: 45, pricePaise: 150000 },
      { id: 'svc_keratin', name: 'Keratin Treatment', slug: 'keratin', durationMinutes: 180, pricePaise: 600000 },
    ],
  },
  {
    id: 'cat_facial',
    name: 'Facial & Skincare',
    slug: 'facial-skincare',
    services: [
      { id: 'svc_facial_classic', name: 'Classic Facial', slug: 'facial-classic', durationMinutes: 45, pricePaise: 80000 },
      { id: 'svc_facial_gold', name: 'Gold Facial', slug: 'facial-gold', durationMinutes: 60, pricePaise: 150000 },
      { id: 'svc_facial_diamond', name: 'Diamond Facial', slug: 'facial-diamond', durationMinutes: 60, pricePaise: 200000 },
      { id: 'svc_detan', name: 'De-Tan Pack', slug: 'detan', durationMinutes: 30, pricePaise: 60000 },
      { id: 'svc_cleanup_basic', name: 'Cleanup (Basic)', slug: 'cleanup-basic', durationMinutes: 30, pricePaise: 50000 },
    ],
  },
  {
    id: 'cat_waxing',
    name: 'Waxing',
    slug: 'waxing',
    services: [
      { id: 'svc_wax_full_arms', name: 'Full Arms Waxing', slug: 'wax-full-arms', durationMinutes: 30, pricePaise: 40000 },
      { id: 'svc_wax_full_legs', name: 'Full Legs Waxing', slug: 'wax-full-legs', durationMinutes: 45, pricePaise: 60000 },
      { id: 'svc_wax_underarms', name: 'Underarms Waxing', slug: 'wax-underarms', durationMinutes: 15, pricePaise: 15000 },
      { id: 'svc_wax_full_body', name: 'Full Body Waxing', slug: 'wax-full-body', durationMinutes: 90, pricePaise: 200000 },
      { id: 'svc_wax_face', name: 'Upper Lip / Eyebrows', slug: 'wax-face', durationMinutes: 15, pricePaise: 10000 },
    ],
  },
  {
    id: 'cat_mani_pedi',
    name: 'Manicure & Pedicure',
    slug: 'manicure-pedicure',
    services: [
      { id: 'svc_manicure_classic', name: 'Classic Manicure', slug: 'manicure-classic', durationMinutes: 30, pricePaise: 50000 },
      { id: 'svc_manicure_spa', name: 'Spa Manicure', slug: 'manicure-spa', durationMinutes: 45, pricePaise: 80000 },
      { id: 'svc_pedicure_classic', name: 'Classic Pedicure', slug: 'pedicure-classic', durationMinutes: 30, pricePaise: 50000 },
      { id: 'svc_pedicure_spa', name: 'Spa Pedicure', slug: 'pedicure-spa', durationMinutes: 45, pricePaise: 80000 },
      { id: 'svc_gel_nails', name: 'Gel Nails', slug: 'gel-nails', durationMinutes: 60, pricePaise: 150000 },
    ],
  },
  {
    id: 'cat_makeup',
    name: 'Makeup Services',
    slug: 'makeup-services',
    services: [
      { id: 'svc_makeup_party', name: 'Party Makeup', slug: 'makeup-party', durationMinutes: 60, pricePaise: 250000 },
      { id: 'svc_makeup_bridal', name: 'Bridal Makeup', slug: 'makeup-bridal', durationMinutes: 120, pricePaise: 1500000 },
      { id: 'svc_makeup_engagement', name: 'Engagement / Reception Makeup', slug: 'makeup-engagement', durationMinutes: 90, pricePaise: 800000 },
      { id: 'svc_saree_draping', name: 'Saree Draping', slug: 'saree-draping', durationMinutes: 30, pricePaise: 100000 },
    ],
  },
  {
    id: 'cat_hair_spa',
    name: 'Hair SPA & Head Therapies',
    slug: 'hair-spa-head-therapies',
    services: [
      { id: 'svc_hair_spa_basic', name: 'Hair Spa (Basic)', slug: 'hair-spa-basic', durationMinutes: 45, pricePaise: 80000 },
      { id: 'svc_hair_spa_premium', name: "Hair Spa (Premium / L'Oréal)", slug: 'hair-spa-premium', durationMinutes: 60, pricePaise: 150000 },
      { id: 'svc_head_massage_oil', name: 'Head Massage (Oil)', slug: 'head-massage-oil', durationMinutes: 30, pricePaise: 50000 },
      { id: 'svc_scalp_treatment', name: 'Scalp Treatment', slug: 'scalp-treatment', durationMinutes: 45, pricePaise: 120000 },
    ],
  },
]

// ─── SPA Data ────────────────────────────────────────────────────────
const spaCategories: SpaCategory[] = [
  {
    id: 'cat_standard_spa',
    name: 'Standard SPA',
    slug: 'standard-spa',
    therapies: [
      { name: 'Swedish Therapy', slug60: 'swedish-60', slug90: 'swedish-90', id60: 'svc_swedish_60', id90: 'svc_swedish_90', price60Paise: 200000, price90Paise: 300000 },
      { name: 'Thai Therapy', slug60: 'thai-60', slug90: 'thai-90', id60: 'svc_thai_60', id90: 'svc_thai_90', price60Paise: 250000, price90Paise: 350000 },
      { name: 'Aroma Therapy', slug60: 'aroma-60', slug90: 'aroma-90', id60: 'svc_aroma_60', id90: 'svc_aroma_90', price60Paise: 250000, price90Paise: 350000 },
    ],
  },
  {
    id: 'cat_premium_spa',
    name: 'Premium SPA',
    slug: 'premium-spa',
    therapies: [
      { name: 'Lomi Lomi Spa', slug60: 'lomi-lomi-60', slug90: 'lomi-lomi-90', id60: 'svc_lomi_lomi_60', id90: 'svc_lomi_lomi_90', price60Paise: 350000, price90Paise: 450000 },
      { name: 'Balinese Therapy', slug60: 'balinese-60', slug90: 'balinese-90', id60: 'svc_balinese_60', id90: 'svc_balinese_90', price60Paise: 300000, price90Paise: 400000 },
      { name: 'Deep Tissue Therapy', slug60: 'deep-tissue-60', slug90: 'deep-tissue-90', id60: 'svc_deep_tissue_60', id90: 'svc_deep_tissue_90', price60Paise: 350000, price90Paise: 450000 },
    ],
  },
  {
    id: 'cat_vvip_spa',
    name: 'VVIP SPA',
    slug: 'vvip-spa',
    therapies: [
      { name: 'Hot Stone Massage', slug60: 'hot-stone-60', slug90: 'hot-stone-90', id60: 'svc_hot_stone_60', id90: 'svc_hot_stone_90', price60Paise: 350000, price90Paise: 450000 },
      { name: 'Kerala Potli Massage', slug60: 'kerala-potli-60', slug90: 'kerala-potli-90', id60: 'svc_kerala_potli_60', id90: 'svc_kerala_potli_90', price60Paise: 350000, price90Paise: 450000 },
      { name: 'Synchronic Massage', slug60: 'synchronic-60', slug90: 'synchronic-90', id60: 'svc_synchronic_60', id90: 'svc_synchronic_90', price60Paise: 450000, price90Paise: 550000 },
    ],
    services: [
      { id: 'svc_body_polish_60', name: 'Body Polish Massage', slug: 'body-polish-60', durationMinutes: 60, pricePaise: 300000 },
      { id: 'svc_body_scrub_normal', name: 'Body Scrub & Cleansing – Normal', slug: 'body-scrub-normal', durationMinutes: 60, pricePaise: 260000 },
      { id: 'svc_body_scrub_fruit', name: 'Body Scrub & Cleansing – Fruit', slug: 'body-scrub-fruit', durationMinutes: 60, pricePaise: 280000 },
      { id: 'svc_body_scrub_coffee', name: 'Body Scrub & Cleansing – Coffee', slug: 'body-scrub-coffee', durationMinutes: 60, pricePaise: 280000 },
      { id: 'svc_body_scrub_almond', name: 'Body Scrub & Cleansing – Almond / Coconut', slug: 'body-scrub-almond', durationMinutes: 60, pricePaise: 300000 },
    ],
  },
]

// ─── Sub-Components ──────────────────────────────────────────────────

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

function SalonServiceCard({ service }: { service: SalonService }) {
  return (
    <article className="border border-cloud-gray rounded-[6px] p-4 motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:-translate-y-[2px] hover:shadow-card-hover">
      <h4 className="font-sans text-[15px] text-cocoa-dark font-medium">
        {service.name}
      </h4>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3">
          <span className="font-sans text-sm text-dusty-gray">
            {service.durationMinutes} min
          </span>
          <span className="text-deep-gold font-ui text-sm">
            {formatINR(service.pricePaise)}
          </span>
        </div>
        <Link
          href={`/?book=1&service=${service.slug}`}
          className="font-ui text-xs uppercase tracking-[0.5px] text-deep-gold hover:text-cocoa-dark motion-safe:transition-colors motion-safe:duration-200"
        >
          Book This <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}

function SpaTherapyCard({ therapy }: { therapy: SpaTherapy }) {
  const [duration, setDuration] = useState<60 | 90>(60)

  const price = duration === 60 ? therapy.price60Paise : therapy.price90Paise
  const slug = duration === 60 ? therapy.slug60 : therapy.slug90

  return (
    <article className="border border-cloud-gray rounded-[6px] p-4 motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:-translate-y-[2px] hover:shadow-card-hover">
      <h4 className="font-sans text-[15px] text-cocoa-dark font-medium">
        {therapy.name}
      </h4>
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={() => setDuration(60)}
          className={`font-ui text-xs px-3 py-1 rounded-full motion-safe:transition-all motion-safe:duration-200 ${
            duration === 60
              ? 'bg-royal-gold text-cocoa-dark'
              : 'bg-cloud-gray text-warm-gray hover:bg-golden-mist'
          }`}
          aria-pressed={duration === 60}
          aria-label="Select 60 minute duration"
        >
          60 min
        </button>
        <button
          type="button"
          onClick={() => setDuration(90)}
          className={`font-ui text-xs px-3 py-1 rounded-full motion-safe:transition-all motion-safe:duration-200 ${
            duration === 90
              ? 'bg-royal-gold text-cocoa-dark'
              : 'bg-cloud-gray text-warm-gray hover:bg-golden-mist'
          }`}
          aria-pressed={duration === 90}
          aria-label="Select 90 minute duration"
        >
          90 min
        </button>
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-deep-gold font-ui text-sm">
          {formatINR(price)}
        </span>
        <Link
          href={`/?book=1&service=${slug}`}
          className="font-ui text-xs uppercase tracking-[0.5px] text-deep-gold hover:text-cocoa-dark motion-safe:transition-colors motion-safe:duration-200"
        >
          Book This <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}

function SpaFixedServiceCard({ service }: { service: SpaService }) {
  return (
    <article className="border border-cloud-gray rounded-[6px] p-4 motion-safe:transition-all motion-safe:duration-250 hover:border-golden-mist hover:-translate-y-[2px] hover:shadow-card-hover">
      <h4 className="font-sans text-[15px] text-cocoa-dark font-medium">
        {service.name}
      </h4>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3">
          <span className="font-sans text-sm text-dusty-gray">
            {service.durationMinutes} min
          </span>
          <span className="text-deep-gold font-ui text-sm">
            {formatINR(service.pricePaise)}
          </span>
        </div>
        <Link
          href={`/?book=1&service=${service.slug}`}
          className="font-ui text-xs uppercase tracking-[0.5px] text-deep-gold hover:text-cocoa-dark motion-safe:transition-colors motion-safe:duration-200"
        >
          Book This <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}

// ─── Main Component ──────────────────────────────────────────────────
export function ServicesContent() {
  const [serviceType, setServiceType] = useState<ServiceType>('salon')

  return (
    <div className="px-5 py-10 lg:py-16">
      <div className="mx-auto max-w-[1278px]">
        {/* Page Header */}
        <header className="text-center mb-10">
          <h1 className="font-display text-cocoa-dark text-[clamp(32px,4.5vw,48px)] tracking-[-0.96px] leading-[1.1]">
            Our Services
          </h1>
          <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-3 max-w-[520px] mx-auto">
            From expert haircuts to rejuvenating spa therapies — explore our full menu of premium beauty services.
          </p>
        </header>

        {/* Salon / SPA Toggle */}
        <div className="flex items-center justify-center gap-2 mb-10" role="tablist" aria-label="Service type">
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

        {/* Salon Categories */}
        {serviceType === 'salon' && (
          <div className="space-y-4" role="tabpanel" aria-label="Salon services">
            {salonCategories.map((category) => (
              <details key={category.id} className="group" open>
                <summary className="flex items-center justify-between cursor-pointer list-none py-4 border-b border-outline-gray">
                  <h2 className="font-display text-lg text-cocoa-dark">
                    {category.name}
                  </h2>
                  <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-outline-gray text-cocoa-dark group-open:rotate-45 motion-safe:transition-transform motion-safe:duration-200">
                    <PlusIcon />
                  </span>
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-6">
                  {category.services.map((service) => (
                    <SalonServiceCard key={service.id} service={service} />
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}

        {/* SPA Categories */}
        {serviceType === 'spa' && (
          <div className="space-y-4" role="tabpanel" aria-label="SPA services">
            {spaCategories.map((category) => (
              <details key={category.id} className="group" open>
                <summary className="flex items-center justify-between cursor-pointer list-none py-4 border-b border-outline-gray">
                  <h2 className="font-display text-lg text-cocoa-dark">
                    {category.name}
                  </h2>
                  <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-outline-gray text-cocoa-dark group-open:rotate-45 motion-safe:transition-transform motion-safe:duration-200">
                    <PlusIcon />
                  </span>
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-6">
                  {/* Therapies with 60/90 min toggle */}
                  {category.therapies?.map((therapy) => (
                    <SpaTherapyCard key={therapy.id60} therapy={therapy} />
                  ))}
                  {/* Fixed-duration services (VVIP extras) */}
                  {category.services?.map((service) => (
                    <SpaFixedServiceCard key={service.id} service={service} />
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
