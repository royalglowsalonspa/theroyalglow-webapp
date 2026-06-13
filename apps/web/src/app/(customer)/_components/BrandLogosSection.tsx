/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BrandLogosSection
 * Scope        : Customer Pages
 *
 * Description  : Homepage "Products We Trust" logo wall rendering partner
 *                brand wordmarks in greyscale, revealing colour on hover.
 *
 * Responsibilities :
 * - Display the trusted-product brand wall
 * - Mimic each brand's typographic identity via Google Fonts
 * - Provide a subtle greyscale → colour hover affordance
 *
 * Features / Functionality :
 * - Per-brand font families (Montserrat, Jost, Abel)
 * - Greyscale default with hover colourisation
 * - Responsive wrapping grid
 *
 * Tech Stack   : React, Next.js 16 (next/font/google), Tailwind CSS v4
 * Layer        : Presentation (Component)
 *
 * Dependencies : next/font/google
 *
 * Notes        : None
 ************************************************************/

import { Abel, Jost, Montserrat } from 'next/font/google'

const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '700'] })
const jost = Jost({ subsets: ['latin'], weight: ['400', '700'] })
const abel = Abel({ subsets: ['latin'], weight: ['400'] })

const brandLogos = [
  {
    name: "L'ORÉAL",
    fontClass: montserrat.className,
    style: { fontWeight: 500, letterSpacing: '0.15em', fontSize: '1.25rem' },
  },
  {
    name: 'SCHWARZKOPF',
    fontClass: jost.className,
    style: { fontWeight: 700, letterSpacing: '0.05em', fontSize: '1.25rem' },
  },
  {
    name: 'LAKMÉ',
    fontClass: montserrat.className,
    style: { fontWeight: 400, letterSpacing: '0.25em', fontSize: '1.2rem' },
  },
  {
    name: 'OLAPLEX',
    fontClass: montserrat.className,
    style: { fontWeight: 700, letterSpacing: '0.1em', fontSize: '1.25rem' },
  },
  {
    name: 'WELLA',
    fontClass: jost.className,
    style: { fontWeight: 400, letterSpacing: '0.15em', fontSize: '1.3rem' },
  },
  {
    name: 'MOROCCANOIL',
    fontClass: abel.className,
    style: { fontWeight: 400, letterSpacing: '0.2em', fontSize: '1.4rem' },
  },
]

export function BrandLogosSection() {
  return (
    <section
      aria-label="Trusted product brands"
      className="px-4 md:px-8 py-12 mx-auto w-full max-w-[1280px] text-center"
    >
      <p className="font-ui text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 mb-8 text-deep-gold">
        Products We Trust
      </p>
      <div className="flex flex-wrap justify-center items-center gap-x-14 gap-y-10 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
        {brandLogos.map((brand) => (
          <span
            key={brand.name}
            className={`${brand.fontClass} text-cocoa-dark leading-none`}
            style={brand.style}
          >
            {brand.name}
          </span>
        ))}
      </div>
    </section>
  )
}
