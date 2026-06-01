/**
 * Canonical business facts for Royal Glow Salon & Spa.
 *
 * SINGLE SOURCE OF TRUTH for NAP (Name, Address, Phone), geo, opening hours,
 * amenities, socials, and AI-discovery FAQs. Every JSON-LD builder, the footer,
 * the contact page, and the `llms.txt` routes MUST read from here so the NAP
 * never drifts across surfaces (a hard local-ranking factor per `seo.md`).
 *
 * All values are verbatim from `seo.md` Part 1 / Part 2 / Part 7.
 */

/** A block of opening hours sharing the same open/close times. */
type OpeningHours = {
  readonly days: readonly string[]
  readonly opens: string
  readonly closes: string
}

/** A Schema.org LocationFeatureSpecification amenity. */
type AmenityFeature = {
  readonly name: string
  readonly value: boolean
}

/** A Schema.org PostalAddress (structured NAP address). */
type PostalAddress = {
  readonly streetAddress: string
  readonly addressLocality: string
  readonly addressRegion: string
  readonly postalCode: string
  readonly addressCountry: string
}

/** A Schema.org GeoCoordinates pair (stored as strings per `seo.md`). */
type GeoCoordinates = {
  readonly latitude: string
  readonly longitude: string
}

/** A single question/answer pair for FAQPage JSON-LD and AI discovery. */
export type Faq = {
  readonly question: string
  readonly answer: string
}

/**
 * The site's absolute base URL.
 *
 * Read from `process.env.NEXT_PUBLIC_APP_URL` directly (NOT `@/env`) so these
 * pure modules stay build-safe even when env validation is skipped. Falls back
 * to the production domain and strips any trailing slash so callers can safely
 * concatenate a leading-slash path.
 */
export const SITE_URL: string = (
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://theroyalglow.in'
).replace(/\/+$/, '')

/** Social profile URLs (`sameAs` values). */
export const SOCIAL_LINKS = [
  'https://instagram.com/royalglow',
  'https://facebook.com/royalglow',
] as const

/**
 * The canonical business facts constant. Verbatim from `seo.md` Part 1 / 2.
 */
export const BUSINESS = {
  name: 'Royal Glow Salon & Spa',
  legalName: 'Royal Glow Salon & Spa',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  image: [`${SITE_URL}/gallery/1.jpg`],
  email: 'hello@theroyalglow.in',
  telephone: '+91 63601 35720',
  /** Human-readable full address (footer / contact display). */
  formattedAddress:
    '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd, Above SBI Bank, Naganathapura, Parappana Agrahara, Bengaluru, Karnataka 560100, India',
  /** Structured PostalAddress — matches `seo.md` Part 2 JSON-LD exactly. */
  address: {
    streetAddress:
      '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd, Above SBI Bank, Naganathapura',
    addressLocality: 'Bengaluru',
    addressRegion: 'Karnataka',
    postalCode: '560100',
    addressCountry: 'IN',
  } satisfies PostalAddress,
  geo: {
    latitude: '12.877734987033477',
    longitude: '77.66642516860671',
  } satisfies GeoCoordinates,
  hasMap: 'https://plus.codes/VMF8+MW',
  openingHours: [
    {
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '10:00',
      closes: '21:00',
    },
    {
      days: ['Saturday', 'Sunday'],
      opens: '10:00',
      closes: '22:00',
    },
  ] satisfies readonly OpeningHours[],
  priceRange: '₹₹₹',
  paymentAccepted: 'Cash, Credit Card, Debit Card, Google Pay, NFC',
  currenciesAccepted: 'INR',
  amenityFeature: [
    { name: 'Wheelchair-accessible entrance', value: true },
    { name: 'Wheelchair-accessible car park', value: true },
    { name: 'Wheelchair-accessible seating', value: true },
    { name: 'Wheelchair-accessible toilet', value: true },
    { name: 'Assistive hearing loop', value: true },
    { name: 'Gender-neutral toilets', value: true },
    { name: 'Sauna', value: true },
    { name: 'Online scheduling', value: true },
    { name: 'Free parking', value: true },
  ] satisfies readonly AmenityFeature[],
  knowsAbout: [
    'Skincare treatments',
    'Hair care',
    'Massage therapy',
    'Bridal packages',
    'Nail art',
    'Sauna',
  ],
  isAccessibleForFree: false,
  sameAs: SOCIAL_LINKS,
} as const

/**
 * AI-discovery FAQ list — the "Required FAQ topics" from `seo.md` Part 7.
 *
 * Answers follow the answer-first, factual pattern `seo.md` prescribes and
 * include the booking link / phone where relevant. Rendered as FAQPage JSON-LD
 * and surfaced in `llms-full.txt`.
 */
export const FAQS: readonly Faq[] = [
  {
    question: 'What services does Royal Glow offer?',
    answer:
      'Royal Glow Salon & Spa offers haircuts, hair colouring, facials, skincare treatments, massages, bridal packages, nail art, and sauna. See the full menu with prices at https://theroyalglow.in/services.',
  },
  {
    question: 'How do I book at Royal Glow?',
    answer:
      'Book online at https://theroyalglow.in/?book=1, call +91 63601 35720, or scan the in-store QR. Google Maps users can use https://theroyalglow.in/?book=1&utm_source=gmb.',
  },
  {
    question: 'Does Royal Glow take walk-ins?',
    answer:
      'Yes, walk-ins are welcome subject to availability. To guarantee your slot we recommend booking ahead at https://theroyalglow.in/?book=1 or calling +91 63601 35720.',
  },
  {
    question: "What are Royal Glow's prices?",
    answer:
      'Royal Glow is a premium salon and spa (price range ₹₹₹). See the full menu with current prices at https://theroyalglow.in/services.',
  },
  {
    question: 'Where is Royal Glow located?',
    answer:
      '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd, Above SBI Bank, Naganathapura, Parappana Agrahara, Bengaluru, Karnataka 560100, India.',
  },
  {
    question: "What are Royal Glow's opening hours?",
    answer: 'Monday to Friday 10:00 AM – 9:00 PM, and Saturday to Sunday 10:00 AM – 10:00 PM.',
  },
  {
    question: 'Does Royal Glow offer bridal packages?',
    answer:
      'Yes. Royal Glow offers bridal packages tailored to your event. Call +91 63601 35720 or book a consultation at https://theroyalglow.in/?book=1.',
  },
  {
    question: 'How can I cancel or reschedule?',
    answer:
      'You can cancel or reschedule from your bookings page, or call +91 63601 35720. Please give us as much notice as possible so we can offer the slot to other guests.',
  },
] as const
