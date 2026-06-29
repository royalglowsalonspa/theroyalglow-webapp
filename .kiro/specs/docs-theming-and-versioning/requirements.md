# Requirements Document

## Introduction

This feature has two coordinated goals for the Royal Glow Salon & Spa documentation
site (`docs.theroyalglow.in`, the Fumadocs app in `docs/`):

1. **Visual restyle.** Reproduce the look and feel of two reference documentation
   sites — `https://sunar.js.org/docs` and `https://www.expostarter.com/docs`
   (including `/docs/get-started`) — applied to the existing Fumadocs site. Both
   reference sites are themselves built on Fumadocs, so matching them means a
   polished **custom Fumadocs theme** (custom color palette, typography, spacing,
   component styling, and code-block theme), not importing a foreign framework.
   The exact design tokens (font families, color hex values, type scale, spacing)
   are extracted from the reference sites during the **design phase**; these
   requirements state the visual goals and quality bars, not literal token values.

2. **Multi-version documentation.** Introduce path-based versioning so that the
   latest documentation is served at the documentation root and older releases
   remain available under version path prefixes (e.g. `/v2`, `/v3`). This includes
   a version switcher, a clear legacy indicator when viewing a non-latest version,
   correct SEO/canonical behavior, and a repeatable workflow for cutting a new
   version on each future application release.

Both goals must preserve all existing documentation content and the project's
quality bars: WCAG 2.1 AA, Lighthouse Accessibility/SEO = 100, performance ≥ 95,
working dark/light mode, and respect for `prefers-reduced-motion`.

## Glossary

- **Docs_Site**: The Fumadocs (Next.js App Router) documentation application in the
  `docs/` directory, deployed to Cloudflare Workers (OpenNext) at `docs.theroyalglow.in`.
- **Reference_Sites**: The two external documentation sites whose visual style is
  being matched — `sunar.js.org/docs` and `expostarter.com/docs`.
- **Theme_System**: The custom Fumadocs theme layer — color tokens, typography,
  spacing, and component styling — defined in the Docs_Site's CSS and layout
  configuration.
- **Design_Tokens**: The named, reusable style values (font families, color values,
  type scale steps, spacing units, radii, code-block themes) that the Theme_System
  is built from.
- **Code_Block**: A rendered fenced code sample in documentation, syntax-highlighted
  via Shiki with distinct light-mode and dark-mode themes.
- **Doc_Version**: A complete, independently browsable copy of the documentation
  corresponding to one application release (e.g. latest, v2, v3).
- **Latest_Version**: The Doc_Version representing the most recent application
  release, served at the documentation root.
- **Legacy_Version**: Any Doc_Version that is not the Latest_Version, served under a
  version path prefix (e.g. `/v2`, `/v3`).
- **Version_Router**: The Docs_Site routing and content-loading mechanism that maps
  request paths to the correct Doc_Version.
- **Version_Switcher**: A user-facing control that lets a reader change which
  Doc_Version they are viewing.
- **Legacy_Banner**: A persistent visual notice shown while a reader views a
  Legacy_Version, indicating it is not the latest documentation.
- **Version_Workflow**: The documented, repeatable process a maintainer follows to
  cut and publish a new Doc_Version on a future application release.
- **Search_System**: The Docs_Site search index and query mechanism that returns
  documentation results scoped to the active Doc_Version.
- **Page_Affordances**: The per-page reader controls shown by the Reference_Sites —
  a "last updated" timestamp, an edit/report-issue link, a copy-as-markdown / open
  control, and a "was this helpful?" feedback control.
- **Feedback_Control**: The per-page control by which a Reader signals whether a
  documentation page was helpful.
- **Not_Found_Page**: The themed page the Docs_Site renders for a request that does
  not resolve to a documentation page (HTTP 404).
- **Reader**: Any person browsing the Docs_Site.
- **Maintainer**: The developer who publishes documentation and cuts new versions.

## Requirements

### Requirement 1: Match the reference sites' visual theme

**User Story:** As a Maintainer, I want the Docs_Site to adopt the visual theme of
the Reference_Sites, so that the documentation looks polished and consistent with
the styling I admire.

#### Acceptance Criteria

1. THE Theme_System SHALL define a custom color palette providing a distinct light-mode token set and dark-mode token set derived from the Reference_Sites' extracted color values, where every text-on-background color pairing meets a minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text (WCAG 2.1 AA).
2. THE Theme_System SHALL apply a typography scale specifying font families, font sizes, font weights, and line heights for headings, body text, and inline code, each value derived from the Reference_Sites' extracted typography.
3. THE Theme_System SHALL apply spacing, border-radius, and layout density values derived from the Reference_Sites' extracted layout style.
4. THE Docs_Site SHALL load all theme web fonts via a self-hosted or `next/font`-managed source such that zero render-blocking third-party font requests are issued during initial page load.
5. WHERE a Design_Token cannot be extracted from a Reference_Site, THE Theme_System SHALL use the nearest documented brand value and record the substitution in the design document.
6. WHEN a Reader toggles between light mode and dark mode, THE Theme_System SHALL apply the corresponding color token set to all rendered pages.
7. IF a theme web font fails to load, THEN THE Docs_Site SHALL render text using a defined fallback font stack without blocking display of page content.

### Requirement 2: Themed documentation components

**User Story:** As a Reader, I want documentation components (navigation, code
blocks, callouts, cards, file trees) to match the reference styling, so that the
reading experience feels cohesive and premium.

#### Acceptance Criteria

1. THE Docs_Site SHALL render a left sidebar navigation whose entries and nesting hierarchy correspond one-to-one with the files and folders under the `content/docs` directory.
2. WHEN a Reader opens a page that contains at least one heading of level 2, 3, or 4, THE Docs_Site SHALL render a right-hand "On this page" table of contents listing every heading of levels 2 through 4 in document order.
3. IF a page contains no heading of level 2, 3, or 4, THEN THE Docs_Site SHALL omit the "On this page" table of contents entirely.
4. THE Code_Block SHALL apply Shiki syntax highlighting using one Theme_System light-mode theme when the active color scheme is light and one Theme_System dark-mode theme when the active color scheme is dark, each selected to match the Reference_Sites' code styling.
5. THE Docs_Site SHALL style callouts, feature cards, and file-tree components using only Theme_System Design_Tokens, with no styling values defined outside the Design_Tokens.
6. WHEN a Reader activates a Code_Block copy control, THE Docs_Site SHALL copy the full code content of that Code_Block to the clipboard and display a visible confirmation indication within 500 milliseconds that remains visible for at least 1500 milliseconds.
7. IF the clipboard copy operation fails, THEN THE Docs_Site SHALL display a visible indication that the copy did not succeed and SHALL leave the Code_Block content unchanged.
8. WHEN a Reader opens the Docs_Site landing page, THE Docs_Site SHALL present feature cards styled with Theme_System Design_Tokens, consistent with the Reference_Sites' intro page.

### Requirement 3: Dark mode and reduced motion

**User Story:** As a Reader, I want a working theme toggle and motion preferences
respected, so that I can read comfortably in my preferred mode.

#### Acceptance Criteria

1. THE Docs_Site SHALL display a theme toggle control offering light mode, dark mode, and a follow-system option.
2. WHEN a Reader activates the theme toggle control and selects a color mode, THE Theme_System SHALL apply that mode to every themed component, including Code_Block, navigation, callouts, and cards, within 200 milliseconds and without a full page reload.
3. WHEN a Reader selects a color mode, THE Theme_System SHALL persist that selection so the same mode is applied on subsequent page loads and navigations within the same browser.
4. WHILE no Reader selection has been persisted, THE Theme_System SHALL apply the mode indicated by the Reader's operating-system color-scheme preference (`prefers-color-scheme`).
5. WHILE a Reader's system indicates `prefers-reduced-motion`, THE Docs_Site SHALL suppress all decorative animations and transitions (those that do not convey state or content) and limit any retained motion to opacity changes of 100 milliseconds or less.
6. THE Theme_System SHALL maintain a contrast ratio of at least 4.5:1 for normal text and at least 3:1 for large text (defined as 18.66px bold or 24px regular and larger) in both light mode and dark mode.

### Requirement 4: Restyle preserves existing content and quality bars

**User Story:** As a Maintainer, I want the restyle to leave all current
documentation intact and meet the project quality gates, so that no content or
compliance is lost during the theming work.

#### Acceptance Criteria

1. WHEN the Theme_System is applied, THE Docs_Site SHALL render every existing MDX document under `content/docs` and return an HTTP 200 response for each, with no build-time or runtime rendering errors.
2. WHEN the Theme_System is applied, THE Docs_Site SHALL resolve every documentation URL path that existed before the restyle to its corresponding content with an HTTP 200 response, without returning HTTP 404 and without introducing a redirect.
3. IF an existing MDX document under `content/docs` fails to render after the Theme_System is applied, THEN THE Docs_Site SHALL fail the build and produce an error indicating which document failed.
4. THE Docs_Site SHALL achieve a Lighthouse Accessibility score of 100 and a Lighthouse SEO score of 100 on the documentation landing page and on at least one content page from each top-level documentation section.
5. THE Docs_Site SHALL achieve a Lighthouse Performance score of at least 95 on the documentation landing page and on at least one content page from each top-level documentation section.
6. THE Docs_Site SHALL conform to WCAG 2.1 AA with zero automated-accessibility-checker violations on the documentation landing page and on at least one content page from each top-level documentation section.

### Requirement 5: Latest version served at the root

**User Story:** As a Reader, I want the newest documentation at the documentation
root, so that I always land on current information by default.

#### Acceptance Criteria

1. THE Version_Router SHALL serve the Latest_Version at the documentation root path (`/`) with no version path segment (no `/vN` prefix) preceding the content path.
2. WHEN a Reader requests the documentation root path (`/`), THE Version_Router SHALL respond with the Latest_Version landing page content.
3. THE Docs_Site SHALL treat the current unversioned `content/docs` content as the Latest_Version so that every previously valid unversioned root URL continues to resolve to the same page it resolved to before versioning was introduced.
4. WHEN a Reader requests an unversioned content path that exists in the Latest_Version, THE Version_Router SHALL respond with that Latest_Version page.
5. IF a Reader requests an unversioned content path that does not exist in the Latest_Version, THEN THE Version_Router SHALL respond with a not-found response that indicates the requested page does not exist and SHALL NOT serve content from any legacy version.

### Requirement 6: Legacy versions served under path prefixes

**User Story:** As a Reader using an older application release, I want to read the
documentation for that release under a version path, so that the instructions match
the version I run.

#### Acceptance Criteria

1. THE Version_Router SHALL serve each Legacy_Version under a distinct version path prefix of the form `/v{N}`, WHERE `{N}` is a positive integer (1 or greater, no leading zeros) that exactly matches the version number of a published Doc_Version (for example `/v2`, `/v3`).
2. WHEN a Reader requests a path under a version prefix `/v{N}` whose `{N}` matches a published Doc_Version and the requested page exists within that Doc_Version, THE Version_Router SHALL respond with the corresponding Legacy_Version page and an HTTP 200 status.
3. IF a Reader requests a path under a version prefix `/v{N}` whose `{N}` does not match the version number of any published Doc_Version, THEN THE Version_Router SHALL respond with an HTTP 404 status and an indication that the requested version does not exist.
4. IF a Reader requests a path under a version prefix `/v{N}` whose `{N}` matches a published Doc_Version but the requested page does not exist within that Doc_Version, THEN THE Version_Router SHALL respond with an HTTP 404 status and an indication that the requested page does not exist within that version.
5. THE Version_Router SHALL load each Doc_Version's content exclusively from that Doc_Version's own content source, such that a change applied to one Doc_Version's content source produces no change in the served pages of any other Doc_Version.

### Requirement 7: Version switcher

**User Story:** As a Reader, I want to switch between documentation versions, so that
I can move between releases without editing the URL by hand.

#### Acceptance Criteria

1. THE Version_Switcher SHALL display the Doc_Version the Reader is currently viewing as a distinct, visually indicated selected entry separated from the non-selected entries.
2. WHEN the Version_Switcher is opened, THE Version_Switcher SHALL list every published Doc_Version available for selection, ordered most-recent first, with the Latest_Version labeled as the latest.
3. WHEN a Reader selects a different Doc_Version in the Version_Switcher and an equivalent page (a page at the same relative path) exists in that Doc_Version, THE Docs_Site SHALL navigate to that equivalent page within the selected Doc_Version within 2 seconds.
4. IF a Reader selects a different Doc_Version in the Version_Switcher and no equivalent page exists in that Doc_Version, THEN THE Docs_Site SHALL navigate to that Doc_Version's landing page within 2 seconds.
5. THE Version_Switcher SHALL be operable using keyboard navigation alone (focusable, openable, and selectable without a pointing device) and SHALL expose an accessible label identifying it as a version selector.

### Requirement 8: Legacy version indicator

**User Story:** As a Reader on an older version, I want a clear notice that I am not
on the latest docs, so that I am not misled by outdated content.

#### Acceptance Criteria

1. WHILE a Reader views any page of a Legacy_Version, THE Docs_Site SHALL display the Legacy_Banner stating that the documentation being viewed is not the Latest_Version and identifying the version label being viewed.
2. WHILE a Reader views a Legacy_Version, THE Legacy_Banner SHALL provide a link that navigates to the equivalent page in the Latest_Version.
3. IF the equivalent page does not exist in the Latest_Version, THEN THE Docs_Site SHALL navigate the link to the Latest_Version landing page.
4. WHEN a Reader navigates between pages within a Legacy_Version, THE Docs_Site SHALL keep the Legacy_Banner displayed on each Legacy_Version page.
5. WHILE a Reader views the Latest_Version, THE Docs_Site SHALL NOT display the Legacy_Banner.

### Requirement 9: SEO and canonical handling across versions

**User Story:** As a Maintainer, I want search engines to favor the latest
documentation, so that Readers find current content first.

#### Acceptance Criteria

1. WHEN the Docs_Site renders any documentation page, THE Docs_Site SHALL emit exactly one canonical link element in that page's head referencing an absolute URL.
2. WHILE serving a Latest_Version page, THE Docs_Site SHALL set the canonical link to that same Latest_Version page's own absolute URL (self-canonical).
3. WHILE serving a Legacy_Version page that has an equivalent Latest_Version page, where equivalence means a Latest_Version page exists at the same document path/slug, THE Docs_Site SHALL set the canonical link to that equivalent Latest_Version page's absolute URL.
4. IF the Docs_Site serves a Legacy_Version page that has no equivalent Latest_Version page, THEN THE Docs_Site SHALL set the canonical link to that same Legacy_Version page's own absolute URL (self-canonical).
5. WHEN the Docs_Site generates its sitemap, THE Docs_Site SHALL include every published Doc_Version page exactly once, each entry referencing the page's absolute URL.
6. WHEN the Docs_Site renders a Latest_Version page, THE Docs_Site SHALL emit a robots directive that permits both indexing and link following for that page.
7. WHEN the Docs_Site renders a Legacy_Version page, THE Docs_Site SHALL emit a robots directive that permits indexing and link following for that page, relying on the canonical link in criterion 3 or 4 to direct ranking to the Latest_Version page where one exists.

### Requirement 10: Repeatable version-cutting workflow

**User Story:** As a Maintainer, I want a documented, repeatable process to cut a new
documentation version on each release, so that adding versions stays low-effort and
consistent.

#### Acceptance Criteria

1. THE Version_Workflow SHALL document the ordered steps to promote the current Latest_Version content into a new Legacy_Version addressed under a `/v{N}` prefix, where N is the integer version number of the Doc_Version being cut.
2. THE Version_Workflow SHALL document the ordered steps to register a newly cut Doc_Version in the Version_Switcher such that the Version_Switcher lists every available Doc_Version and indicates which Doc_Version is the Latest_Version.
3. WHEN a Maintainer completes the Version_Workflow steps to add a Doc_Version, THE Docs_Site SHALL serve the new Doc_Version while continuing to serve every pre-existing Doc_Version unchanged at its original `/v{N}` prefix.
4. THE Version_Workflow SHALL document the repository location where each Doc_Version's content and version metadata are stored, such that each Doc_Version's content and metadata are isolated from every other Doc_Version's.
5. WHEN the Docs_Site is built with two or more Doc_Versions present (the Latest_Version plus at least one Legacy_Version), THE Docs_Site SHALL complete the build with no build errors and produce navigable output for every present Doc_Version.
6. IF a Maintainer follows the Version_Workflow to cut a Doc_Version whose `/v{N}` prefix already exists, THEN THE Version_Workflow SHALL halt the cut and produce an indication identifying the conflicting `/v{N}` prefix, leaving all existing Doc_Versions unchanged.

### Requirement 11: Search within the current version

**User Story:** As a Reader, I want to search the documentation I am currently
viewing, so that I can find topics quickly within the relevant version.

#### Acceptance Criteria

1. THE Docs_Site SHALL display a documentation search control on every documentation page.
2. WHEN a Reader submits a search query of 1 to 100 characters, THE Search_System SHALL return results scoped to the Doc_Version the Reader is currently viewing within 2 seconds.
3. WHEN the Search_System returns results, THE Docs_Site SHALL display at most 20 results ordered by relevance.
4. IF the Search_System returns no results for a submitted query, THEN THE Docs_Site SHALL display a no-results message indicating that no matching topics were found in the current Doc_Version.
5. WHEN a Reader selects a search result, THE Docs_Site SHALL navigate to the corresponding page within the current Doc_Version.
6. IF the Search_System is unavailable or returns an error, THEN THE Docs_Site SHALL display an error message indicating that search is temporarily unavailable and SHALL preserve the Reader's entered query.
7. THE Docs_Site search control SHALL be fully operable by keyboard, including opening the control, entering a query, moving focus across results, and activating a result.

### Requirement 12: Navigation and sidebar correctness across versions

**User Story:** As a Reader, I want navigation that reflects the version I am viewing,
so that links and the sidebar stay consistent with the active documentation set.

#### Acceptance Criteria

1. WHILE a Reader views a given Doc_Version, THE Docs_Site SHALL render sidebar navigation containing only the entries derived from that Doc_Version's content structure, and SHALL exclude any entry that belongs to a different Doc_Version.
2. WHEN a Reader follows an internal documentation link (a link whose target resides within the Docs_Site), THE Version_Router SHALL resolve the target within the same Doc_Version the Reader is currently viewing.
3. IF an internal link target does not exist within the active Doc_Version, THEN THE Docs_Site SHALL respond with a not-found (HTTP 404) response and SHALL NOT switch the Reader to a different Doc_Version.
4. WHEN a Reader opens a documentation page, THE Docs_Site SHALL visually mark the sidebar entry corresponding to that page as the active item and SHALL leave all other entries unmarked.
5. IF a Reader requests a documentation URL that does not identify a Doc_Version, THEN THE Docs_Site SHALL serve the content of the Latest_Version.
6. WHEN a Reader switches to a different Doc_Version using the Version_Switcher, THE Version_Router SHALL load the page in the selected Doc_Version that corresponds to the current page, or the selected Doc_Version's landing page if no corresponding page exists.

### Requirement 13: Responsive layout and mobile navigation

**User Story:** As a Reader on a small screen, I want the documentation to adapt to
my device with usable navigation, so that I can read and navigate comfortably on
mobile.

#### Acceptance Criteria

1. THE Docs_Site SHALL render a usable layout without horizontal overflow at viewport widths from 320px up to at least 1920px.
2. WHILE the viewport width is below the Theme_System's mobile breakpoint, THE Docs_Site SHALL collapse the left sidebar navigation into a toggleable control rather than displaying it inline.
3. WHEN a Reader activates the collapsed-navigation control on a small viewport, THE Docs_Site SHALL reveal the sidebar navigation for the active Doc_Version.
4. THE Docs_Site SHALL keep the Version_Switcher and the search control reachable at every supported viewport width.
5. THE Docs_Site SHALL provide touch targets of at least 24 by 24 CSS pixels for interactive navigation, switcher, and search controls.
6. WHILE the viewport width is below the Theme_System's mobile breakpoint, THE Docs_Site SHALL collapse or relocate the "On this page" table of contents so that it does not obscure page content.

### Requirement 14: Page-level reader affordances

**User Story:** As a Reader, I want per-page helpers like the reference sites — a
last-updated indicator, a way to view or copy the page source, links to report or
request changes, and a feedback control — so that I can trust and act on the docs.

#### Acceptance Criteria

1. WHEN the Docs_Site renders a documentation content page, THE Docs_Site SHALL display a "last updated" indicator for that page derived from the content's source metadata.
2. THE Docs_Site SHALL display, on each documentation content page, a control that lets a Reader copy or open the page's Markdown source.
3. WHEN a Reader activates the copy-Markdown control, THE Docs_Site SHALL copy the page's Markdown source to the clipboard and display a visible confirmation indication.
4. THE Docs_Site SHALL display, on each documentation content page, a link to report an issue or request a change for that page.
5. THE Docs_Site SHALL display a Feedback_Control on each documentation content page allowing a Reader to indicate whether the page was helpful.
6. WHEN a Reader submits a response via the Feedback_Control, THE Docs_Site SHALL acknowledge the submission with a visible confirmation and SHALL NOT navigate the Reader away from the current page.
7. THE Page_Affordances SHALL be operable by keyboard and SHALL meet the same WCAG 2.1 AA contrast and focus-visibility requirements as the rest of the Theme_System.

### Requirement 15: Themed not-found page

**User Story:** As a Reader who hits a broken or outdated link, I want a branded,
helpful not-found page, so that I can recover instead of seeing an unstyled error.

#### Acceptance Criteria

1. WHEN the Docs_Site responds with an HTTP 404 status, THE Docs_Site SHALL render a Not_Found_Page styled with the Theme_System Design_Tokens.
2. THE Not_Found_Page SHALL provide a link to the Latest_Version documentation root.
3. THE Not_Found_Page SHALL provide access to the search control so a Reader can search for the intended page.
4. WHILE a Reader reached the Not_Found_Page from within a Legacy_Version path, THE Docs_Site SHALL indicate which Doc_Version context the missing page was requested under.
5. THE Not_Found_Page SHALL conform to WCAG 2.1 AA and SHALL respond with an HTTP 404 status code.
