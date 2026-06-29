# Implementation Plan: Docs Theming and Versioning

## Overview

Convert the approved design into incremental, code-only steps for the Fumadocs app
under `docs/`. The plan is ordered so the **pure logic layer** (`lib/versions.ts`,
`lib/contrast.ts`, `lib/sitemap.ts`, `lib/search.ts`, `lib/cut-version.ts`) and its
property-based tests land before any route/component wiring, catching resolution,
canonical, sitemap, search-scope, and cut errors early. The **theming track**
(tokens, fonts, layout) runs in parallel with the versioning logic track. Routing,
components, search endpoint, SEO routes, the cut-version script, and the
integration/a11y/perf gates wire everything together at the end.

Constraints applied throughout: TypeScript strict (no `any`); Biome style (single
quotes, no semicolons); Bun as runner/package manager; edge-compatible
(Cloudflare). All existing MDX documents and `/docs/*` URLs are preserved (latest
keeps `baseUrl: '/docs'`, legacy under `/docs/v{N}`). Pure functions take registry
and slug data as parameters and perform no I/O so they are directly unit/PBT
testable.

Property-based tests use `fast-check` + Vitest, run a minimum of 100 iterations,
and each carries the comment tag
`Feature: docs-theming-and-versioning, Property N: ...`.

## Tasks

- [x] 1. Set up docs testing tooling and MDX/code-block config
  - [x] 1.1 Add Vitest + fast-check tooling to the docs package
    - Add `vitest`, `fast-check`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` (or `happy-dom`), and `@vitejs/plugin-react` to `docs/package.json` devDependencies (pinned versions; install with Bun)
    - Create `docs/vitest.config.ts` (jsdom environment, React plugin, `fast-check` numRuns default ≥ 100)
    - Add `test` and `test:run` scripts to `docs/package.json` (use `vitest --run` for single execution)
    - _Requirements: 4.1_
  - [x] 1.2 Configure dual-theme code blocks and git last-modified in `docs/source.config.ts`
    - Add `rehypeCodeOptions.themes = { light: 'github-light', dark: 'github-dark' }` to `mdxOptions`
    - Enable `lastModifiedTime: 'git'` on the docs collection
    - Keep the existing latest `defineDocs({ dir: 'content/docs' })` collection intact
    - _Requirements: 2.4, 14.1_

- [x] 2. Build the Theme_System (color tokens, fonts, layout) — parallel with versioning logic
  - [x] 2.1 Create `docs/lib/fonts.ts` with self-hosted fonts
    - Define heading (`--font-heading`), body (`--font-body`), and mono (`--font-mono`) faces via `next/font` (local woff2 for Cabinet Grotesk; `next/font/google` self-hosted for Plus Jakarta Sans and JetBrains Mono)
    - Expose each as a CSS variable with `display: 'swap'` and a declared fallback stack
    - _Requirements: 1.2, 1.4, 1.7_
  - [x] 2.2 Replace neutral preset tokens with RGSS Design_Tokens in `docs/app/global.css`
    - Define light `--color-fd-*` tokens in `@theme {}` and dark tokens in `.dark {}` exactly per the Design_Tokens table
    - Add `--fd-layout-width: 90rem`, `--radius: 0.625rem`, `--fd-touch-min: 24px`, the typography scale, and the 2px focus-ring rule
    - Add the global `@media (prefers-reduced-motion: reduce)` rule (neutralize decorative animation; allow ≤100ms opacity transitions)
    - _Requirements: 1.1, 1.3, 1.6, 2.5, 3.5, 3.6, 13.5_
  - [x] 2.3 Wire fonts and enable search in `docs/app/layout.tsx`
    - Apply the font CSS variables to the root `<html>`/`<body>`
    - Keep `RootProvider` and enable its search dialog (`Ctrl/Cmd K`)
    - _Requirements: 1.4, 3.1, 11.1_
  - [x] 2.4 Implement `contrastRatio` in `docs/lib/contrast.ts`
    - Pure function: parse a color token and a background token, compute the WCAG relative-luminance contrast ratio
    - Export the Design_Token light/dark pairings as data for verification
    - _Requirements: 1.1, 3.6_
  - [x]* 2.5 Write property test for token contrast
    - **Property 1: Token contrast meets WCAG AA**
    - **Validates: Requirements 1.1, 3.6**
  - [ ]* 2.6 Write unit tests for theme toggle behavior
    - Light/dark/system selection, `localStorage` persistence, `prefers-color-scheme` default when unset
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Implement version registry and path/version resolution in `docs/lib/versions.ts`
  - [x] 3.1 Implement the registry, `parseVersionPrefix`, `resolveVersion`, and classifiers
    - Define `DocVersion` type and the ordered `versions` array (most-recent-first), single source of truth
    - `parseVersionPrefix(s)`: return integer N iff `s` matches `^v([1-9]\d*)$`, else null
    - `resolveVersion(slug)`: latest when no version prefix; matched legacy → `{ version, rest }`; `/v{N}` not registered → `{ unknownVersion }`
    - `isLatest` predicate and `classifyNotFoundContext(path)` (latest / page-not-found-in-vN / version-not-found)
    - Keep all functions pure (registry passed/imported as data; no loader I/O)
    - _Requirements: 5.1, 5.4, 5.5, 6.1, 6.2, 6.3, 7.2, 12.5, 15.4_
  - [x]* 3.2 Write property test for the version-prefix grammar
    - **Property 6: Version-prefix grammar**
    - **Validates: Requirements 6.1**
  - [x]* 3.3 Write property test for unversioned resolution
    - **Property 5: Unversioned paths always resolve to latest**
    - **Validates: Requirements 5.1, 5.4, 5.5, 12.5**
  - [x]* 3.4 Write property test for URL preservation
    - **Property 4: Pre-existing URLs are preserved**
    - **Validates: Requirements 4.2, 5.3**
  - [x]* 3.5 Write property test for registered legacy resolution
    - **Property 7: Registered legacy paths resolve to their version**
    - **Validates: Requirements 6.2**
  - [x]* 3.6 Write property test for unregistered version prefixes
    - **Property 8: Unregistered version prefixes are unknown**
    - **Validates: Requirements 6.3**
  - [x]* 3.7 Write property test for switcher ordering/completeness
    - **Property 10: Version switcher ordering and completeness**
    - **Validates: Requirements 7.2**
  - [x]* 3.8 Write property test for legacy banner visibility
    - **Property 12: Legacy banner visibility**
    - **Validates: Requirements 8.1, 8.5**
  - [x]* 3.9 Write property test for not-found version-context classification
    - **Property 21: Not-found version context classification**
    - **Validates: Requirements 15.4**

- [x] 4. Implement cross-version equivalence, canonical/robots, sitemap, search-scope, and cut logic (pure)
  - [x] 4.1 Implement `equivalentPath`, `getCanonicalUrl`, and the robots directive in `docs/lib/versions.ts`
    - `equivalentPath(relSlug, target)`: same-relative-slug page when it exists in target, else target landing page
    - `getCanonicalUrl(version, relSlug)`: latest self-canonical; legacy → equivalent latest URL when present, else legacy self; always one absolute `https` URL
    - `robotsFor(version, relSlug)`: always `{ index: true, follow: true }`
    - _Requirements: 7.3, 7.4, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 12.6_
  - [x]* 4.2 Write property test for the cross-version equivalent target
    - **Property 11: Cross-version equivalent target (incl. round-trip invariance)**
    - **Validates: Requirements 7.3, 7.4, 8.2, 8.3, 12.6**
  - [x]* 4.3 Write property test for canonical URL derivation
    - **Property 13: Canonical URL derivation**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
  - [x]* 4.4 Write property test for the robots directive
    - **Property 15: Robots directive is index+follow for every page**
    - **Validates: Requirements 9.6, 9.7**
  - [x] 4.5 Implement `buildSitemap` in `docs/lib/sitemap.ts`
    - Pure: enumerate every published page across all versions exactly once as absolute URLs, no duplicates
    - _Requirements: 9.5_
  - [x]* 4.6 Write property test for sitemap coverage
    - **Property 14: Sitemap coverage is exact and duplicate-free**
    - **Validates: Requirements 9.5**
  - [x] 4.7 Implement `scopeSearchResults` in `docs/lib/search.ts`
    - Pure: given an indexed corpus, active version, and ranked matches, return only the active version's results, capped at 20, relevance-ordered
    - _Requirements: 11.2, 11.3_
  - [x]* 4.8 Write property test for version-scoped, capped search
    - **Property 18: Search results are version-scoped and capped**
    - **Validates: Requirements 11.2, 11.3**
  - [x] 4.9 Implement the pure `cutVersion` registry transform in `docs/lib/cut-version.ts`
    - Pure core: given a registry and integer N, return the additive registry when N is absent; throw a conflict error identifying `/v{N}` (no mutation) when N is present
    - _Requirements: 10.3, 10.6_
  - [x]* 4.10 Write property test for additive version cut
    - **Property 16: Cutting a version is additive and preserves existing versions**
    - **Validates: Requirements 10.3**
  - [x]* 4.11 Write property test for rejecting a duplicate cut
    - **Property 17: Cutting an existing version is rejected without side effects**
    - **Validates: Requirements 10.6**

- [x] 5. Checkpoint - Ensure all tests pass
  - Run `bun run typecheck` and `bun run test:run` in `docs/`; ensure pure-logic and theming tests pass. Ask the user if questions arise.

- [x] 6. Wire content sources and per-version collections/loaders
  - [x] 6.1 Add per-version collections and loaders
    - In `docs/source.config.ts`: add a `defineDocs({ dir: 'content/docs-v2' })` collection alongside latest
    - In `docs/lib/source.ts`: export `latestSource` (`baseUrl: '/docs'`, unchanged) and `v2Source` (`baseUrl: '/docs/v2'`); bind real `source` instances into the `versions` registry
    - _Requirements: 5.3, 6.2, 6.5, 10.4_
  - [x] 6.2 Add a `content/docs-v2` fixture for multi-version testing
    - Copy a small isolated subset of `content/docs` into `docs/content/docs-v2` (independent directory, own `meta.json`)
    - _Requirements: 6.5, 10.4, 10.5_
  - [x]* 6.3 Write property test for the page tree mirroring the content directory
    - **Property 2: Sidebar tree mirrors the content directory**
    - **Validates: Requirements 2.1**
  - [x]* 6.4 Write property test that every existing document resolves
    - **Property 3: Every existing document resolves and renders**
    - **Validates: Requirements 4.1**
  - [x]* 6.5 Write property test for version isolation
    - **Property 9: Versions are isolated**
    - **Validates: Requirements 6.5, 10.4**
  - [x]* 6.6 Write property test that the sidebar is scoped to the active version
    - **Property 19: Sidebar is scoped to the active version**
    - **Validates: Requirements 12.1**
  - [x]* 6.7 Write property test that internal links stay within the active version
    - **Property 20: Internal links stay within the active version**
    - **Validates: Requirements 12.2**

- [x] 7. Implement version-aware components
  - [x] 7.1 Create `docs/components/version-switcher.tsx`
    - Client dropdown mounted in `DocsLayout` `sidebar.banner`; reads serializable registry props + active version + `usePathname()`
    - Lists every version most-recent-first (Latest labeled), marks the active entry selected, keyboard operable, `aria-label="Select documentation version"`
    - On select, navigate via `equivalentPath(relSlug, target)` (equivalent page or target landing)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 12.6, 13.4_
  - [x] 7.2 Create `docs/components/legacy-banner.tsx`
    - Renders only for non-latest versions; states the viewed version label and that it is not latest; links to the equivalent latest page (or latest landing)
    - _Requirements: 8.1, 8.2, 8.3, 8.5_
  - [x] 7.3 Create `docs/components/page-affordances.tsx`
    - Last-updated indicator from `page.data.lastModified` (frontmatter fallback), formatted `DD/MM/YYYY` (`en-IN`)
    - Copy-Markdown + Open control (copies raw MDX, visible confirmation, failure indication leaves content unchanged); report-an-issue link to the page's GitHub source
    - Keyboard operable, AA contrast/focus
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.7_
  - [x] 7.4 Create `docs/components/feedback.tsx`
    - "Was this page helpful? Good / Bad"; on submit shows an inline acknowledgement and does not navigate away; submission is fire-and-forget so failure never blocks the acknowledgement
    - _Requirements: 14.5, 14.6, 14.7_
  - [ ]* 7.5 Write unit tests for the version switcher
    - Selected-state marking and accessible label
    - _Requirements: 7.1, 7.5_
  - [ ]* 7.6 Write unit tests for the feedback control
    - Acknowledgement appears without navigation; failure still acknowledges
    - _Requirements: 14.6_
  - [ ]* 7.7 Write unit tests for Copy-Markdown affordance
    - Copy success confirmation and failure indication; code content unchanged on failure
    - _Requirements: 14.3, 2.6, 2.7_

- [x] 8. Implement the version-aware shell and routing
  - [x] 8.1 Create `docs/components/docs-shell.tsx`
    - Server component rendering `DocsLayout` with the active version's `pageTree`, `sidebar.banner = VersionSwitcher`, `LegacyBanner` when `!isLatest`, and `DocsPage`/`DocsBody` with `PageAffordances` + `Feedback` in the footer slot
    - _Requirements: 2.1, 2.2, 2.3, 8.4, 12.1, 12.4, 13.1, 13.2, 13.3, 13.6_
  - [x] 8.2 Implement `docs/app/docs/[[...slug]]/page.tsx` dispatch and metadata
    - `resolveVersion(slug)` → render `DocsShell` (found) or `notFound()` (unknown version / missing page)
    - `generateStaticParams` unions every version's params (latest slugs + `['v{N}', ...slug]`)
    - `generateMetadata` emits version-aware canonical (`getCanonicalUrl`) and robots (`robotsFor`)
    - _Requirements: 4.1, 5.2, 6.4, 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 10.5, 12.3_
  - [x] 8.3 Make `docs/app/docs/layout.tsx` a thin pass-through
    - `return children` (the version-aware layout is rendered by `DocsShell` from the page)
    - _Requirements: 5.3_

- [x] 9. Implement search endpoint and SEO/not-found routes
  - [x] 9.1 Create `docs/app/api/search/route.ts`
    - Orama `createFromSource` over all version sources, each page tagged with its version id; active version passed as `tag` filter; apply `scopeSearchResults` (≤20, relevance)
    - No-results message scoped to current version; transport error → "search temporarily unavailable" with query preserved; edge-compatible, read-only, rate-limit friendly
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6_
  - [x] 9.2 Create `docs/app/sitemap.ts`
    - Use `buildSitemap` to emit one absolute-URL entry per page per version
    - _Requirements: 9.5_
  - [x] 9.3 Create `docs/app/robots.ts`
    - Allow indexing/following; reference the sitemap
    - _Requirements: 9.6, 9.7_
  - [x] 9.4 Create `docs/app/not-found.tsx`
    - Themed (Design_Tokens), version-aware via `classifyNotFoundContext`; link to `/docs`; exposes the search control; distinguishes "version not found" vs "page not found in v{N}"; returns HTTP 404; AA conformant
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - [ ]* 9.5 Write unit tests for the not-found page
    - Renders themed content, latest-docs link, and search control
    - _Requirements: 15.1, 15.2, 15.3_
  - [x]* 9.6 Write a search scope/latency smoke test
    - Representative queries return version-scoped results under 2s
    - _Requirements: 11.2_

- [x] 10. Implement the version-cutting workflow script
  - [x] 10.1 Create `docs/scripts/cut-version.mjs`
    - Guard duplicate `/v{N}` (halt + print conflict, no writes) using the `cutVersion` core; copy `content/docs` → `content/docs-v{N}`; register the collection in `source.config.ts`, the loader in `lib/source.ts`, and the entry in `lib/versions.ts`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6_

- [x] 11. Checkpoint - Ensure all tests pass
  - Run `bun run typecheck`, `bun run lint`, `bun run build`, and `bun run test:run` in `docs/`. Ask the user if questions arise.

- [ ] 12. Verification gates (integration, accessibility, performance)
  - [ ]* 12.1 Write the build-with-multiple-versions integration test
    - Build with `content/docs` + `content/docs-v2` present; assert success and navigable output for both versions
    - _Requirements: 10.5_
  - [ ]* 12.2 Write the URL-preservation crawl test
    - Crawl the pre-restyle `/docs/*` path list; assert each returns HTTP 200 with no redirect
    - _Requirements: 4.2_
  - [ ]* 12.3 Write the self-hosted-fonts test
    - Assert no third-party font-origin requests on first load
    - _Requirements: 1.4_
  - [ ]* 12.4 Write axe automated accessibility tests
    - Zero violations on the landing page and one content page per top-level section, in light and dark
    - _Requirements: 4.6_
  - [ ]* 12.5 Wire Lighthouse CI for the docs site
    - Reuse `.github/lighthouse/lighthouserc.json`; assert Accessibility = 100, SEO = 100, Performance ≥ 95 on the landing page and one page per section
    - _Requirements: 4.4, 4.5_

- [ ] 13. Final checkpoint - Ensure all tests and gates pass
  - Ensure all unit, property, integration, and a11y/perf checks pass. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests/CI gates) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Pure logic (`lib/`) and its property tests land before route/component wiring so resolution, canonical, sitemap, search-scope, and cut errors surface early.
- The theming track (2.x) runs in parallel with the versioning-logic track (3.x, 4.x).
- Every property sub-task references a single design property and the requirements clause it validates; property tests use `fast-check` + Vitest at ≥ 100 iterations and carry the `Feature: docs-theming-and-versioning, Property N: ...` tag comment.
- Latest keeps `baseUrl: '/docs'` so no existing URL changes and no redirect is introduced.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.2", "2.4", "3.1"] },
    { "id": 1, "tasks": ["2.3", "2.5", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "4.1"] },
    { "id": 2, "tasks": ["2.6", "4.2", "4.3", "4.4", "4.5", "4.7", "4.9", "6.1", "6.2"] },
    { "id": 3, "tasks": ["4.6", "4.8", "4.10", "4.11", "6.3", "6.4", "6.5", "6.6", "6.7", "7.1", "7.2", "7.3", "7.4"] },
    { "id": 4, "tasks": ["7.5", "7.6", "7.7", "8.1", "9.1", "9.2", "9.3", "10.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "9.4"] },
    { "id": 6, "tasks": ["9.5", "9.6", "12.1", "12.2", "12.3", "12.4", "12.5"] }
  ]
}
```
