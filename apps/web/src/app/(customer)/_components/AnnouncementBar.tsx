/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 01-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : AnnouncementBar
 * Scope        : Customer Pages
 *
 * Description  : Server component that renders the site-wide announcement
 *                strip from the first active Payload banner that carries a CTA
 *                link, within its scheduled window. Falls back to hardcoded
 *                copy when the CMS is unconfigured, unreachable, or empty.
 *
 * Responsibilities :
 * - Fetch active banners via getActiveBanners()
 * - Render headline + link from the announcement banner (selectAnnouncementBanner)
 * - Preserve the existing golden warm bar styling
 *
 * Features / Functionality :
 * - CMS-first content with curated fallback
 * - ISR-cached reads (1h default) via the CMS fetch seam
 *
 * Tech Stack   : React (server), Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : @/lib/cms/banners, @/lib/cms/client, next/link
 *
 * Notes        :
 * - Owner schedules banners in Payload → strip updates within ISR window.
 * - The strip and the homepage hero image are DECOUPLED: this strip only shows a
 *   banner that has a non-empty `ctaHref` (an announcement needs somewhere to
 *   click), while the hero image uses the first active banner regardless. So a
 *   banner with a blank CTA link changes the hero photo ONLY, and this strip
 *   keeps its hardcoded fallback copy. Selection lives in `lib/cms/banners.ts`.
 ************************************************************/

import Link from 'next/link'
import { selectAnnouncementBanner } from '@/lib/cms/banners'
import { getActiveBanners } from '@/lib/cms/client'

const FALLBACK_HEADLINE = '✨ NEW · Monsoon Glow offers — up to 30% off signature rituals →'
const FALLBACK_HREF = '/offers'

export async function AnnouncementBar() {
  const banners = await getActiveBanners()
  // Only a CTA-bearing banner drives the strip; a CTA-less one is hero artwork.
  const banner = selectAnnouncementBanner(banners)
  const headline = banner?.headline ?? FALLBACK_HEADLINE
  const href = banner?.ctaHref ?? FALLBACK_HREF

  return (
    <div
      className="relative z-50 text-center font-ui font-bold text-xs py-2 px-4"
      style={{ backgroundColor: '#FFF8E7', color: '#1A0F0A' }}
    >
      <Link href={href} className="hover:underline" style={{ color: '#1A0F0A' }}>
        {headline}
      </Link>
    </div>
  )
}
