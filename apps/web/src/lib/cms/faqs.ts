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
