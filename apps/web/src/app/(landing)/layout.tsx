/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : LandingLayout
 * Scope        : Landing Pages
 *
 * Description  : Distraction-free layout for conversion-optimised landing pages.
 *                No header, footer, or navigation — only the page's own CTA as the exit path.
 *
 * Responsibilities :
 * - Provide a minimal, centred layout shell for landing pages
 * - Remove all navigation distractions to maximise conversion
 * - Apply branded gradient background
 *
 * Features / Functionality :
 * - Centred content container (max 480px)
 * - Full-height gradient background (golden-mist → warm-cream → canvas-white)
 * - Zero navigation chrome for distraction-free experience
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : None (pure layout component)
 *
 * Notes        :
 * - Used by the /book Meta ad lead capture page
 ************************************************************/

// Distraction-free landing chrome for conversion-optimised pages (e.g. /book).
// No header, footer, or navigation — the only exit path is the page's own CTA.
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-golden-mist via-warm-cream to-canvas-white px-4 py-8">
      <div className="w-full max-w-[480px]">{children}</div>
    </div>
  )
}
