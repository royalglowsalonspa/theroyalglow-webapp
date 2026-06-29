import { NotFoundContent } from '@/components/not-found-content'

/**
 * App-level Not_Found_Page for the Docs_Site (Req 15).
 *
 * Next.js renders this component for the `notFound()` boundary and unmatched
 * routes, and **automatically responds with an HTTP 404 status** (Req 15.5) — no
 * manual status handling is required here. It is a server component that renders
 * within the root `layout.tsx` (`RootProvider`), so the Theme_System
 * Design_Tokens and the fumadocs search context are both in scope.
 *
 * The path the Reader missed is not available to this boundary as a prop, so the
 * themed, version-aware body is delegated to the small {@link NotFoundContent}
 * client island, which reads `usePathname()` to classify the version context
 * (Req 15.4) and exposes the latest-docs link and search control (Req 15.2,
 * 15.3).
 */
export default function NotFound() {
  return <NotFoundContent />
}
