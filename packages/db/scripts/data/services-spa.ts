/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : services-spa
 * Scope        : Seed Data — SPA Services
 *
 * Description  : SPA service seed data covering standard, premium, and VVIP
 *                therapy services with 60/90 minute duration variants.
 *
 * Responsibilities :
 * - Define Standard SPA services (Swedish, Thai, Aroma — 6 services)
 * - Define Premium SPA services (Lomi Lomi, Balinese, Deep Tissue — 6 services)
 * - Define VVIP SPA services (Hot Stone, Kerala Potli, etc. — 9 services)
 *
 * Features / Functionality :
 * - Deterministic IDs (svc_*) for booking and membership references
 * - 60-minute and 90-minute variants for each therapy type
 * - Pricing in paise (GST inclusive)
 * - Body scrub variants (Normal, Fruit, Coffee, Almond/Coconut)
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : None
 *
 * Notes        : All SPA services are accessible to any membership tier.
 *                Hours are deducted from the membership balance per session.
 ************************************************************/

export const spaServices = [
  // Standard SPA
  {
    id: 'svc_swedish_60',
    name: 'Swedish Therapy',
    slug: 'swedish-60',
    categoryId: 'cat_standard_spa',
    durationMinutes: 60,
    pricePaise: 200000,
  },
  {
    id: 'svc_swedish_90',
    name: 'Swedish Therapy',
    slug: 'swedish-90',
    categoryId: 'cat_standard_spa',
    durationMinutes: 90,
    pricePaise: 300000,
  },
  {
    id: 'svc_thai_60',
    name: 'Thai Therapy',
    slug: 'thai-60',
    categoryId: 'cat_standard_spa',
    durationMinutes: 60,
    pricePaise: 250000,
  },
  {
    id: 'svc_thai_90',
    name: 'Thai Therapy',
    slug: 'thai-90',
    categoryId: 'cat_standard_spa',
    durationMinutes: 90,
    pricePaise: 350000,
  },
  {
    id: 'svc_aroma_60',
    name: 'Aroma Therapy',
    slug: 'aroma-60',
    categoryId: 'cat_standard_spa',
    durationMinutes: 60,
    pricePaise: 250000,
  },
  {
    id: 'svc_aroma_90',
    name: 'Aroma Therapy',
    slug: 'aroma-90',
    categoryId: 'cat_standard_spa',
    durationMinutes: 90,
    pricePaise: 350000,
  },

  // Premium SPA
  {
    id: 'svc_lomi_lomi_60',
    name: 'Lomi Lomi Spa',
    slug: 'lomi-lomi-60',
    categoryId: 'cat_premium_spa',
    durationMinutes: 60,
    pricePaise: 350000,
  },
  {
    id: 'svc_lomi_lomi_90',
    name: 'Lomi Lomi Spa',
    slug: 'lomi-lomi-90',
    categoryId: 'cat_premium_spa',
    durationMinutes: 90,
    pricePaise: 450000,
  },
  {
    id: 'svc_balinese_60',
    name: 'Balinese Therapy',
    slug: 'balinese-60',
    categoryId: 'cat_premium_spa',
    durationMinutes: 60,
    pricePaise: 300000,
  },
  {
    id: 'svc_balinese_90',
    name: 'Balinese Therapy',
    slug: 'balinese-90',
    categoryId: 'cat_premium_spa',
    durationMinutes: 90,
    pricePaise: 400000,
  },
  {
    id: 'svc_deep_tissue_60',
    name: 'Deep Tissue Therapy',
    slug: 'deep-tissue-60',
    categoryId: 'cat_premium_spa',
    durationMinutes: 60,
    pricePaise: 350000,
  },
  {
    id: 'svc_deep_tissue_90',
    name: 'Deep Tissue Therapy',
    slug: 'deep-tissue-90',
    categoryId: 'cat_premium_spa',
    durationMinutes: 90,
    pricePaise: 450000,
  },

  // VVIP SPA
  {
    id: 'svc_hot_stone_60',
    name: 'Hot Stone Massage',
    slug: 'hot-stone-60',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 60,
    pricePaise: 350000,
  },
  {
    id: 'svc_hot_stone_90',
    name: 'Hot Stone Massage',
    slug: 'hot-stone-90',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 90,
    pricePaise: 450000,
  },
  {
    id: 'svc_kerala_potli_60',
    name: 'Kerala Potli Massage',
    slug: 'kerala-potli-60',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 60,
    pricePaise: 350000,
  },
  {
    id: 'svc_kerala_potli_90',
    name: 'Kerala Potli Massage',
    slug: 'kerala-potli-90',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 90,
    pricePaise: 450000,
  },
  {
    id: 'svc_synchronic_60',
    name: 'Synchronic Massage',
    slug: 'synchronic-60',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 60,
    pricePaise: 450000,
  },
  {
    id: 'svc_synchronic_90',
    name: 'Synchronic Massage',
    slug: 'synchronic-90',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 90,
    pricePaise: 550000,
  },
  {
    id: 'svc_body_polish_60',
    name: 'Body Polish Massage',
    slug: 'body-polish-60',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 60,
    pricePaise: 300000,
  },
  {
    id: 'svc_body_scrub_normal',
    name: 'Body Scrub & Cleansing – Normal',
    slug: 'body-scrub-normal',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 60,
    pricePaise: 260000,
  },
  {
    id: 'svc_body_scrub_fruit',
    name: 'Body Scrub & Cleansing – Fruit',
    slug: 'body-scrub-fruit',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 60,
    pricePaise: 280000,
  },
  {
    id: 'svc_body_scrub_coffee',
    name: 'Body Scrub & Cleansing – Coffee',
    slug: 'body-scrub-coffee',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 60,
    pricePaise: 280000,
  },
  {
    id: 'svc_body_scrub_almond',
    name: 'Body Scrub & Cleansing – Almond / Coconut',
    slug: 'body-scrub-almond',
    categoryId: 'cat_vvip_spa',
    durationMinutes: 60,
    pricePaise: 300000,
  },
]
