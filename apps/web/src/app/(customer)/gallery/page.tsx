import type { Metadata } from 'next'
import { GalleryGrid } from '@/components/gallery/GalleryGrid'
import { JsonLd } from '@/components/seo/JsonLd'
import { getGalleryImages } from '@/lib/cms/client'
import { SITE_URL } from '@/lib/seo/business'
import { breadcrumbJsonLd, imageObjectJsonLd } from '@/lib/seo/jsonld'
import { buildMetadata } from '@/lib/seo/metadata'

// ISR: revalidate the gallery roughly hourly (architecture.md ~1h window).
export const revalidate = 3600

export const metadata: Metadata = buildMetadata({
  title: 'Gallery',
  description:
    'See the Royal Glow Salon & Spa — our interiors, treatments, and work in Bengaluru.',
  path: '/gallery',
})

export default async function GalleryPage() {
  const images = await getGalleryImages()

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: SITE_URL },
            { name: 'Gallery' },
          ]),
          ...images.map((img) =>
            imageObjectJsonLd({
              url: img.image.url,
              alt: img.image.alt,
              // Omit optionals entirely when absent (exactOptionalPropertyTypes).
              ...(img.caption ? { caption: img.caption } : {}),
              ...(img.image.width !== null ? { width: img.image.width } : {}),
              ...(img.image.height !== null
                ? { height: img.image.height }
                : {}),
            }),
          ),
        ]}
      />

      <div className="flex flex-col gap-20">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* HEADING */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-labelledby="gallery-page-heading" className="px-5">
          <div className="mx-auto max-w-[1278px] mt-6 lg:mt-10">
            <div className="flex items-center gap-2 mb-6">
              <span
                className="w-2 h-2 rounded-full bg-royal-gold"
                aria-hidden="true"
              />
              <span className="font-ui text-[11px] uppercase tracking-[2px] text-deep-gold">
                Gallery
              </span>
            </div>
            <h1
              id="gallery-page-heading"
              className="font-display text-cocoa-dark tracking-[-1.44px] leading-[1.03] text-[clamp(40px,6vw,72px)]"
            >
              Gallery
            </h1>
            <p className="font-sans text-[17px] leading-[1.6] text-warm-gray mt-4 max-w-[520px]">
              A look inside Royal Glow — our interiors, treatments, and the work
              our team is proud of.
            </p>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* GRID / EMPTY STATE */}
        {/* ═══════════════════════════════════════════════════════ */}
        <section aria-label="Gallery images" className="px-5 pb-20">
          <div className="mx-auto max-w-[1278px]">
            {images.length === 0 ? (
              <div className="bg-warm-cream rounded-[6px] p-8 sm:p-12 text-center">
                <p className="font-display text-cocoa-dark text-2xl">
                  Photos coming soon.
                </p>
                <p className="font-sans text-[15px] leading-[1.55] text-warm-gray mt-3 max-w-[420px] mx-auto">
                  We&apos;re putting together a gallery of our space and work.
                  Check back shortly.
                </p>
              </div>
            ) : (
              <GalleryGrid images={images} />
            )}
          </div>
        </section>
      </div>
    </>
  )
}
