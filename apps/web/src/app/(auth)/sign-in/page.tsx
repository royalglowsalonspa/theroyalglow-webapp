/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : SignInPage
 * Scope        : Authentication UI
 *
 * Description  : Sign-in page rendering the Google OAuth card with
 *                noindex metadata to prevent search engine indexing.
 *
 * Responsibilities :
 * - Define page metadata (title, robots noindex)
 * - Render the SignInCard component
 *
 * Features / Functionality :
 * - SEO: noindex, nofollow
 * - Delegates to SignInCard for interactive OAuth flow
 *
 * Tech Stack   : Next.js 16 (App Router)
 * Layer        : Presentation (Page)
 *
 * Dependencies : next, ./sign-in-card
 *
 * Notes        :
 * - Google OAuth only (no email/password)
 ************************************************************/
import type { Metadata } from 'next'
import { SignInCard } from './sign-in-card'

export const metadata: Metadata = {
  title: 'Sign In | Royal Glow Salon & Spa',
  robots: { index: false, follow: false },
}

export default function SignInPage() {
  return <SignInCard />
}
