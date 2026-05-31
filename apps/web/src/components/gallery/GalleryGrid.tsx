import type { GalleryImage } from '@/lib/cms/types'

// Presentation-only responsive grid of gallery images. Data is pre-resolved by
// `lib/cms` (each `image` already has an absolute URL + required non-empty alt).
//
// Image choice: plain <img> (not next/image) to stay config-free for remote
// R2/CMS hosts. Each image carries a non-empty `alt` and explicit width/height;
// when the resolved dimensions are null we fall back to a fixed aspect-ratio
// box (object-cover) so space is always reserved and there is no layout shift.

type GalleryGridProps = {
  images: GalleryImage[]
}

export function GalleryGrid({ images }: GalleryGridProps) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 list-none p-0 m-0">
      {images.map((item) => {
        const { url, alt, width, height } = item.image
        const hasDims = width !== null && height !== null

        return (
          <li key={item.id}>
            <figure className="m-0 overflow-hidden bg-canvas-white border border-cloud-gray rounded-[6px]">
              {hasDims ? (
                <img
                  src={url}
                  alt={alt}
                  width={width}
                  height={height}
                  loading="lazy"
                  className="block w-full h-auto object-cover"
                />
              ) : (
                <div className="relative w-full aspect-[4/3] bg-warm-cream overflow-hidden">
                  <img
                    src={url}
                    alt={alt}
                    width={800}
                    height={600}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
              )}

              {item.caption ? (
                <figcaption className="font-sans text-[14px] leading-[1.5] text-warm-gray px-4 py-3">
                  {item.caption}
                </figcaption>
              ) : null}
            </figure>
          </li>
        )
      })}
    </ul>
  )
}
