/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : TestimonialsSection
 * Scope        : Customer Pages
 *
 * Description  : Server component that resolves homepage testimonials from the
 *                Payload CMS (active, ordered) and renders the interactive
 *                carousel. Falls back to a curated set of hardcoded reviews
 *                when the CMS is unconfigured, unreachable, or empty — so the
 *                section never renders blank.
 *
 * Responsibilities :
 * - Fetch active testimonials via the CMS read seam (getTestimonials)
 * - Provide a graceful hardcoded fallback when CMS returns nothing
 * - Delegate all interactivity to the client TestimonialsCarousel
 *
 * Features / Functionality :
 * - CMS-first content with curated fallback (5 reviews)
 * - ISR-cached reads (1h default) via the CMS fetch seam
 *
 * Tech Stack   : React (server), Next.js 16 (App Router)
 * Layer        : Presentation (Component)
 *
 * Dependencies : ./TestimonialsCarousel, @/lib/cms/client, @/lib/cms/types
 *
 * Notes        :
 * - Interactive carousel logic lives in TestimonialsCarousel (client).
 * - Owner adds reviews in Payload → appear here within the ISR window.
 ************************************************************/

import { getTestimonials } from '@/lib/cms/client'
import type { Testimonial } from '@/lib/cms/types'
import { TestimonialsCarousel } from './TestimonialsCarousel'

// Curated fallback shown when the CMS is unconfigured / unreachable / empty.
const FALLBACK_TESTIMONIALS: Testimonial[] = [
  {
    reviewerName: 'Priya Sharma',
    rating: 5,
    reviewText:
      'Royal Glow is truly a premium experience. The stylists listened to exactly what I wanted and delivered perfectly. Booking was effortless and the ambience is calming.',
    timeLabel: '1 week ago',
  },
  {
    reviewerName: 'Ananya Reddy',
    rating: 5,
    reviewText:
      'I had my bridal makeup done here and it was beyond beautiful. The team is incredibly skilled and made sure I felt like royalty on my wedding day.',
    timeLabel: '2 weeks ago',
  },
  {
    reviewerName: 'Sneha Iyer',
    rating: 5,
    reviewText:
      'The spa ritual was so relaxing I almost fell asleep. The products they use are top quality and the therapists are very professional. Will definitely be back.',
    timeLabel: '3 weeks ago',
  },
  {
    reviewerName: 'Deepika Nair',
    rating: 5,
    reviewText:
      'Best salon in Bengaluru. I have been coming here for over a year now and the consistency of quality is exceptional. Hair colour and treatment were flawless.',
    timeLabel: '1 month ago',
  },
  {
    reviewerName: 'Kavya Menon',
    rating: 5,
    reviewText:
      'I visited for a facial and left feeling completely refreshed. The staff are warm and attentive throughout. A genuinely luxurious experience at a fair price.',
    timeLabel: '1 month ago',
  },
]

export async function TestimonialsSection() {
  const cmsTestimonials = await getTestimonials()
  const reviews = cmsTestimonials.length > 0 ? cmsTestimonials : FALLBACK_TESTIMONIALS

  return <TestimonialsCarousel reviews={reviews} />
}
