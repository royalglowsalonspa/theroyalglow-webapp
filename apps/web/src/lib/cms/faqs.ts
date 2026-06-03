/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : faqs
 * Scope        : CMS Integration — FAQ
 *
 * Description  : Resolves FAQ list from CMS with a static fallback. Ensures
 *                FAQPage JSON-LD always has content regardless of CMS state.
 *
 * Responsibilities :
 * - Fetch CMS-managed FAQs via getCmsFaqs()
 * - Fall back to static FAQS constant when CMS returns empty
 * - Guarantee non-empty result for SEO structured data
 *
 * Features / Functionality :
 * - resolveFaqs() — async FAQ resolution with CMS-first, static-fallback
 *
 * Tech Stack   : TypeScript
 * Layer        : Data Fetching
 *
 * Dependencies : @/lib/seo/business, ./client
 *
 * Notes        : Never throws; getCmsFaqs() is total
 ************************************************************/

import { FAQS, type Faq } from '@/lib/seo/business'
import { getCmsFaqs } from './client'

/**
 * Resolve the FAQ list used for FAQPage JSON-LD and the `/faq` UI.
 *
 * The CMS is the preferred source of truth: when it returns one or more
 * `CmsFaq` entries, those win. Otherwise we fall back to the static `FAQS`
 * constant from `lib/seo/business`. The result is ALWAYS non-empty (because
 * `FAQS` is non-empty), so the FAQPage structured data always has content —
 * satisfying the Phase 7 SEO contract even with no CMS configured.
 *
 * `getCmsFaqs()` is a total function (returns `[]` on unconfigured / network
 * error / non-2xx / malformed), so this never throws.
 */
export async function resolveFaqs(): Promise<Faq[]> {
  const cmsFaqs = await getCmsFaqs()
  if (cmsFaqs.length > 0) {
    return cmsFaqs.map((f) => ({ question: f.question, answer: f.answer }))
  }
  return [...FAQS]
}
