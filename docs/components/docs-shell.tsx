import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page'
import { Feedback } from '@/components/feedback'
import { LegacyBanner } from '@/components/legacy-banner'
import { PageAffordances } from '@/components/page-affordances'
import { type SwitcherVersion, VersionSwitcher } from '@/components/version-switcher'
import type { DocsSource, DocVersionRuntime } from '@/lib/source'
import { pageExistsIn, versions } from '@/lib/source'
import { equivalentPath, getSwitcherOrder, versionsMeta } from '@/lib/versions'
import { getMDXComponents } from '@/mdx-components'

/**
 * Version-aware documentation shell (task 8.1; Requirements 2.1, 2.2, 2.3, 8.4,
 * 12.1, 12.4, 13.1, 13.2, 13.3, 13.6).
 *
 * Because the docs route is an optional catch-all (`app/docs/[[...slug]]`), the
 * layout cannot see the slug params, so the version-aware `DocsLayout` is
 * rendered HERE — from the page — rather than in `app/docs/layout.tsx` (which
 * becomes a thin pass-through in task 8.3). `DocsShell` is a **server
 * component**: it composes the version-scoped sidebar tree, the
 * `VersionSwitcher` banner, the `LegacyBanner` (only for non-latest versions),
 * and the `DocsPage`/`DocsBody` MDX body with the `PageAffordances` + `Feedback`
 * footer. The interactive pieces (`VersionSwitcher`, `PageAffordances`,
 * `Feedback`) are client islands rendered within this server tree.
 *
 * The route (task 8.2) does the version dispatch (`resolveVersion`) and passes
 * the resolved `version`, the `page` it loaded from `version.source.getPage`,
 * and the relative slug `rest`; this shell is purely the presentation wiring.
 *
 * ## Assumptions (recorded)
 *
 * - **GitHub source base.** The page's source/edit URL is built from the
 *   project repo `https://github.com/royalglowsalonspa/theroyalglow-webapp` on
 *   the `prod` branch (the canonical branch referenced by the project steering),
 *   pointing at the MDX file under `docs/<contentDir>/<page.path>`. If the repo
 *   URL or default branch changes, update {@link GITHUB_REPO} /
 *   {@link GITHUB_BRANCH}.
 * - **Raw Markdown source.** The fumadocs page data does not expose the raw MDX
 *   string, so the Copy-Markdown affordance receives a best-effort document
 *   (title heading, description, and a link to the GitHub source) rather than
 *   the verbatim file. Task 8.2 / a later task can swap in a real raw-MDX route
 *   without changing this component's contract.
 */

/** A page resolved from a version's fumadocs loader (`getPage`), never `undefined`. */
type ResolvedDocsPage = NonNullable<ReturnType<DocsSource['getPage']>>

/** Project repository the page source/edit links point at. */
const GITHUB_REPO = 'https://github.com/royalglowsalonspa/theroyalglow-webapp'

/** Canonical branch the source links target (per project steering). */
const GITHUB_BRANCH = 'prod'

/**
 * Props for {@link DocsShell}. All three are produced by the route (task 8.2)
 * after `resolveVersion`: the matched runtime version, the page loaded from that
 * version's `source.getPage(rest)`, and the relative slug `rest` (the slug below
 * the version's `basePath`).
 */
export type DocsShellProps = {
  /** The resolved runtime version (metadata + bound fumadocs loader source). */
  version: DocVersionRuntime
  /** The page loaded from `version.source.getPage(rest)`. */
  page: ResolvedDocsPage
  /** The page's slug relative to `version.basePath` (the `rest` of `resolveVersion`). */
  rest: string[]
}

/** The content directory on disk for a version (`content/docs`, `content/docs-v{N}`). */
function contentDirFor(version: DocVersionRuntime): string {
  if (version.isLatest || version.versionNumber === null) {
    return 'content/docs'
  }
  return `content/docs-v${version.versionNumber}`
}

/**
 * Build the GitHub source/edit URL for a page from its virtualized file path
 * (`page.path`, relative to the version's content directory).
 */
function githubSourceUrl(version: DocVersionRuntime, page: ResolvedDocsPage): string {
  return `${GITHUB_REPO}/blob/${GITHUB_BRANCH}/docs/${contentDirFor(version)}/${page.path}`
}

/**
 * Best-effort Markdown document for the Copy-Markdown affordance. The fumadocs
 * page data does not carry the raw MDX, so this composes the title, description,
 * and a link back to the source file (see component-level assumption).
 */
function bestEffortMarkdown(page: ResolvedDocsPage, sourceUrl: string): string {
  const description = page.data.description ?? ''
  return `# ${page.data.title}\n\n${description}\n\nSource: ${sourceUrl}\n`
}

/**
 * Compute the navigation target for the CURRENT page in every registered
 * version: the equivalent page (same relative slug) when it exists in that
 * version, otherwise that version's landing page. Consumed by the
 * `VersionSwitcher` so selecting a version lands on the equivalent page
 * (Req 7.3, 7.4, 12.6).
 */
function buildTargetHrefByVersionId(rest: string[]): Record<string, string> {
  const targets: Record<string, string> = {}
  for (const target of versions) {
    targets[target.id] = equivalentPath(rest, target, (relSlug) => pageExistsIn(target, relSlug))
  }
  return targets
}

/** Map the switcher-ordered registry metadata to the switcher's serializable shape. */
function buildSwitcherVersions(): SwitcherVersion[] {
  return getSwitcherOrder(versionsMeta).map((meta) => ({
    id: meta.id,
    label: meta.label,
    versionNumber: meta.versionNumber,
    basePath: meta.basePath,
    isLatest: meta.isLatest,
  }))
}

/**
 * Render the version-aware documentation shell for a resolved page.
 *
 * - Sidebar tree is scoped to the active version (`version.source.pageTree`),
 *   excluding every other version's entries (Req 12.1).
 * - The `VersionSwitcher` is mounted in `sidebar.banner` and stays reachable at
 *   every viewport (Req 13.x); Fumadocs handles sidebar collapse/TOC relocation.
 * - The `LegacyBanner` renders only for non-latest versions and, being part of
 *   the shell, persists across legacy pages (Req 8.4).
 * - `DocsPage` renders the TOC (Req 2.2/2.3, handled by Fumadocs from
 *   `page.data.toc`) and marks the active sidebar entry (Req 12.4); the
 *   `PageAffordances` + `Feedback` footer closes the content.
 */
export function DocsShell({ version, page, rest }: DocsShellProps) {
  const MDXContent = page.data.body

  const latest = versions.find((candidate) => candidate.isLatest)
  const latestHref =
    latest === undefined
      ? version.basePath
      : equivalentPath(rest, latest, (relSlug) => pageExistsIn(latest, relSlug))

  const sourceUrl = githubSourceUrl(version, page)
  const markdownSource = bestEffortMarkdown(page, sourceUrl)
  const pagePath = page.url

  return (
    <DocsLayout
      githubUrl={GITHUB_REPO}
      nav={{ title: 'Royal Glow Docs' }}
      sidebar={{
        banner: (
          <VersionSwitcher
            activeVersionId={version.id}
            targetHrefByVersionId={buildTargetHrefByVersionId(rest)}
            versions={buildSwitcherVersions()}
          />
        ),
      }}
      tree={version.source.pageTree}
    >
      <DocsPage toc={page.data.toc} {...(page.data.full ? { full: true } : {})}>
        {version.isLatest ? null : (
          <LegacyBanner latestHref={latestHref} versionLabel={version.label} />
        )}
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <MDXContent components={getMDXComponents()} />
          <PageAffordances
            feedbackSlot={<Feedback pagePath={pagePath} />}
            lastModified={page.data.lastModified ?? null}
            markdownSource={markdownSource}
            sourceUrl={sourceUrl}
          />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  )
}

export default DocsShell
