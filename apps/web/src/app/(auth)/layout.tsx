/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : AuthLayout
 * Scope        : Authentication UI
 *
 * Description  : Minimal centred-card layout for authentication pages
 *                (sign-in, onboarding) with no navigation chrome.
 *
 * Responsibilities :
 * - Provide a centred card container on gradient background
 * - Wrap auth route group children
 *
 * Features / Functionality :
 * - Full-height centred flex layout
 * - Amber-to-white gradient background
 * - Max-width constraint for card
 *
 * Tech Stack   : Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation (Layout)
 *
 * Dependencies : React
 *
 * Notes        :
 * - Used by (auth) route group: /onboarding
 ************************************************************/
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50/50 to-white">
      <div className="w-full max-w-md px-4">{children}</div>
    </div>
  )
}
