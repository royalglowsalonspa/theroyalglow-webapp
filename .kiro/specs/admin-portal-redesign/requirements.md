# Requirements Document

## Introduction

The Admin Portal Redesign re-skins and restructures the Royal Glow admin portal
(`apps/admin`, served at `admin.theroyalglow.in`) into a cohesive, premium
SaaS-grade admin/CRM interface. The redesign adopts a clean white-canvas
dashboard aesthetic (sectioned sidebar, dense scannable data tables, status
pills, KPI/chart cards, slide-over detail panels, filter bars) while
reconciling that layout with the existing warm Royal Glow brand identity.

This is a **presentation-layer** effort only. It introduces a reusable admin
design system and applies it across all existing admin routes. It does **not**
change data models, API contracts, business logic, route paths, or the RBAC
access-control model. The shared design tokens in `@rgss/ui`
(`packages/ui/src/styles/theme.css`) remain the single source of truth; the
redesign consumes and extends those tokens rather than redefining brand
colours, fonts, or radii.

The core deliverables are shared primitives — the App Shell (sidebar + top bar
+ breadcrumbs), a Data Table pattern, a Status Badge system, a Dashboard with
KPI and chart cards, a Slide-Over detail panel, a Filter Bar pattern, an Icon
System (lucide-react), and consistent state presenters (empty / loading /
error / skeleton). Applying these primitives consistently across every admin
route is the in-scope outcome.

## Glossary

- **Admin_Portal**: The `apps/admin` Next.js application served at
  `admin.theroyalglow.in`, using the Root-Path Convention (no `/admin` prefix).
- **Admin_Design_System**: The cohesive set of redesigned, reusable admin UI
  primitives, token-usage rules, typography scale, spacing scale, and
  iconography introduced by this feature.
- **Brand_Tokens**: The shared design tokens defined in
  `packages/ui/src/styles/theme.css` (`@rgss/ui`) — brand colours, fonts
  (Cabinet Grotesk, Clash Grotesk, Plus Jakarta Sans), radii (cards 6px,
  buttons 8px, pill), shadows. The single source of truth shared with
  `apps/web`.
- **App_Shell**: The redesigned layout frame composed of the Sidebar, the
  Top_Bar, and the Breadcrumb_Trail, wrapping all admin page content.
- **Sidebar**: The left navigation panel rendering role-filtered, sectioned
  navigation items.
- **Top_Bar**: The horizontal bar at the top of the content area containing the
  sidebar toggle, breadcrumbs, notifications, and the user identity block.
- **Breadcrumb_Trail**: The hierarchical path indicator shown in the Top_Bar
  reflecting the current route.
- **Icon_System**: The `lucide-react` icon set replacing the current emoji
  icons, with a per-route icon mapping.
- **Data_Table**: The reusable table primitive supporting column headers with
  sorting, row hover, inline row actions, checkbox row selection, expandable
  nested rows, column-visibility toggling, and pagination.
- **Status_Badge**: The reusable pill component that renders a colour-coded
  label for a status value, using semantic Brand_Tokens.
- **Filter_Bar**: The reusable control row containing a search input, filter
  dropdowns, a column-visibility toggle, and tabbed filters.
- **Dashboard**: The admin landing page at route `/`, presenting KPI summary
  cards and chart cards.
- **KPI_Card**: A summary card presenting a single key metric with a label.
- **Chart_Card**: A card presenting a data visualisation (e.g. a bar chart)
  built with `recharts`.
- **Slide_Over_Panel**: The reusable right-side overlay panel for detail and
  activity views, built on Radix Dialog primitives.
- **State_Presenter**: The reusable components for empty, loading (skeleton),
  and error states shown in place of content.
- **Role_Level**: The numeric access level (0–5) resolved from a user's role
  via `@/lib/rbac` (Customer=0 … Developer=5).
- **WCAG_AA**: Web Content Accessibility Guidelines 2.1 Level AA.

## Requirements

### Requirement 1: Design System Token Consumption

**User Story:** As the salon owner, I want the redesigned admin portal to use
the established Royal Glow brand identity, so that the admin tool feels like a
premium, on-brand part of my business rather than a generic template.

#### Acceptance Criteria

1. THE Admin_Design_System SHALL source all brand colour, font, radius, and
   shadow values exclusively from the Brand_Tokens defined in `@rgss/ui`, such
   that zero such values are defined within `apps/admin`.
2. WHERE a colour, font, radius, or shadow value is required by an
   Admin_Design_System component, THE Admin_Design_System SHALL reference a
   named Brand_Tokens token rather than a hard-coded literal value, with zero
   hard-coded colour, font, radius, or shadow literals present in `apps/admin`
   component source.
3. THE Admin_Design_System SHALL apply the Cabinet Grotesk font family to
   heading text, the Clash Grotesk font family to body text, and the Plus
   Jakarta Sans font family to UI label text, as defined in Brand_Tokens.
4. THE Admin_Design_System SHALL apply the 6px card radius token to all card
   surfaces and the 8px button radius token to all button surfaces.
5. THE Admin_Design_System SHALL define a typography scale and a spacing scale
   composed exclusively of named Brand_Tokens tokens and Tailwind v4 utilities,
   containing no arbitrary literal values.
6. IF the existing `apps/web` application also consumes a Brand_Tokens token,
   THEN THE Admin_Design_System SHALL NOT redefine that token within
   `apps/admin`.
7. IF a required Brand_Tokens token is missing or undefined at build time, THEN
   THE Admin_Design_System SHALL fail the build with an error indicating the
   missing token name and SHALL NOT substitute a hard-coded fallback value.

### Requirement 2: Iconography Migration

**User Story:** As a salon staff member, I want clear, professional icons in
the admin portal, so that I can scan navigation and actions quickly without
emoji-rendering inconsistencies across devices.

#### Acceptance Criteria

1. THE Icon_System SHALL render navigation, action, and status icons using the
   `lucide-react` icon set.
2. THE Icon_System SHALL map each admin navigation route to exactly one
   `lucide-react` icon.
3. THE Admin_Design_System SHALL replace every emoji-based icon in the
   App_Shell, Sidebar, and Dashboard with an Icon_System icon such that no
   Unicode emoji glyph remains rendered as an icon within those three areas.
4. WHERE an icon is rendered for decorative purposes alongside a visible text
   label, THE Icon_System SHALL mark that icon as hidden from assistive
   technology.
5. WHERE an icon is the only content of an interactive control, THE Icon_System
   SHALL provide a non-empty accessible text label that names the control's
   action for assistive technology.
6. IF a navigation route has no `lucide-react` icon defined in the per-route
   mapping, THEN THE Icon_System SHALL render a single predefined default
   `lucide-react` fallback icon for that route.

### Requirement 3: App Shell Layout

**User Story:** As a salon manager, I want a polished, consistent layout frame
around every admin page, so that navigation and context are always available
and predictable.

#### Acceptance Criteria

1. THE App_Shell SHALL render the Sidebar, the Top_Bar, and the page content
   region on every admin page.
2. THE App_Shell SHALL render the Top_Bar containing the sidebar toggle
   control, the Breadcrumb_Trail, the notification control, and the user
   identity block.
3. THE App_Shell SHALL display the signed-in user's display name, up to the
   first two initials derived from the display name as the avatar, and the
   user's role label in the user identity block.
4. WHILE the viewport width is at least 1024px, THE Sidebar SHALL remain
   persistently visible alongside the page content.
5. WHILE the viewport width is below 1024px, THE Sidebar SHALL remain hidden
   until opened as an overlay drawer.
6. WHEN the user activates the sidebar toggle control on a viewport below
   1024px while the Sidebar overlay is closed, THE App_Shell SHALL open the
   Sidebar as an overlay drawer over the page content with a dimming backdrop
   and move keyboard focus into the drawer.
7. WHEN the user activates the sidebar toggle control, the overlay backdrop,
   the Escape key, or a navigation item while the Sidebar overlay is open, THE
   App_Shell SHALL close the Sidebar overlay.
8. WHILE the Sidebar overlay is open, THE App_Shell SHALL trap keyboard focus
   within the Sidebar drawer.
9. WHEN the Sidebar overlay closes, THE App_Shell SHALL return keyboard focus
   to the sidebar toggle control.

### Requirement 4: Sidebar Navigation and Role Filtering

**User Story:** As a salon owner, I want each staff member to see only the
navigation entries their role permits, so that the portal stays focused and
access stays controlled after the redesign.

#### Acceptance Criteria

1. THE Sidebar SHALL render navigation entries grouped into titled sections,
   displaying each section's title text and ordering sections and items as
   defined in `ADMIN_NAV`.
2. THE Sidebar SHALL derive the visible navigation entries from `ADMIN_NAV` and
   `filterNavByLevel` in `@/lib/rbac` using the signed-in user's Role_Level.
3. THE Sidebar SHALL display a navigation item only when the item's minimum
   level is less than or equal to the signed-in user's Role_Level.
4. WHEN a section has no visible navigation items for the signed-in user's
   Role_Level, THE Sidebar SHALL omit that section entirely, including its
   section title.
5. WHEN the current route matches a navigation item by longest matching route
   prefix, THE Sidebar SHALL render exactly that one item in a visual state
   that is visually distinct from non-active items.
6. WHEN the current route matches a navigation item, THE Sidebar SHALL mark
   that item as the current page for assistive technology.
7. IF the signed-in user's Role_Level is unresolved, unknown, or absent, THEN
   THE Sidebar SHALL treat the user as the minimum Role_Level (0) when
   filtering navigation entries.
8. THE Sidebar SHALL render the Royal Glow logo and admin label at the top of
   the panel.
9. THE Admin_Design_System SHALL preserve the existing route paths defined by
   the Root-Path Convention without introducing an `/admin` prefix.

### Requirement 5: Breadcrumb Trail

**User Story:** As a salon receptionist, I want to see where I am in the portal,
so that I can orient myself and navigate back to parent sections quickly.

#### Acceptance Criteria

1. THE Breadcrumb_Trail SHALL display the hierarchical path of the current
   route within the Top_Bar, ordered from the highest-level ancestor segment to
   the current page segment.
2. WHEN the current route is a sub-route of a section, THE Breadcrumb_Trail
   SHALL display the parent section label followed by the current page label.
3. THE Breadcrumb_Trail SHALL render every segment except the current page
   segment as a link to that segment's route.
4. THE Breadcrumb_Trail SHALL render the current page segment as non-interactive
   text and mark it as the current page for assistive technology.
5. WHEN the user activates an ancestor segment link, THE Breadcrumb_Trail SHALL
   navigate to that ancestor route.
6. WHILE the current route is a top-level route with no ancestor section, THE
   Breadcrumb_Trail SHALL display only the current page segment, marked as the
   current page.
7. THE Breadcrumb_Trail SHALL present its segments within a navigation landmark
   labelled for assistive technology.

### Requirement 6: Reusable Data Table

**User Story:** As a salon manager, I want dense, scannable tables with sorting,
filtering, selection, and pagination, so that I can work through large lists of
bookings, customers, and invoices efficiently.

#### Acceptance Criteria

1. THE Data_Table SHALL render column headers, data rows, and a pagination
   control region.
2. THE Data_Table SHALL build its table state using the installed
   `@tanstack/react-table` library.
3. WHEN the user activates a sortable column header, THE Data_Table SHALL sort
   the displayed rows by that column, SHALL toggle the sort direction between
   ascending and descending on each successive activation, SHALL constrain
   active sorting to a single column at a time, and SHALL display an ascending
   or descending direction indicator on the active column header.
4. WHEN the user points at a data row with a pointer device, THE Data_Table
   SHALL render that row in a hover visual state.
5. THE Data_Table SHALL render inline row action controls for each row.
6. WHERE row selection is enabled, THE Data_Table SHALL render a selection
   checkbox for each row and a select-all checkbox in the header.
7. WHERE a row has child rows, THE Data_Table SHALL render an expand control
   that reveals the child rows when activated.
8. THE Data_Table SHALL render a "Rows per page" control offering the page-size
   options 10, 25, 50, and 100, with 25 selected by default.
9. WHEN the user selects a value in the "Rows per page" control, THE Data_Table
   SHALL display at most that number of rows per page.
10. THE Data_Table SHALL associate each column header with its column cells for
    assistive technology and support keyboard operation of all interactive
    controls.
11. THE Data_Table SHALL render a previous-page control, a next-page control,
    and a current-page position indicator showing the displayed page number
    relative to the total page count.
12. WHEN the user activates a pagination control for an available adjacent page,
    THE Data_Table SHALL replace the displayed rows with that page's rows.
13. IF no adjacent page exists in the direction requested by a pagination
    control, THEN THE Data_Table SHALL disable that pagination control.

### Requirement 7: Column Visibility Toggle

**User Story:** As a salon manager, I want to show or hide table columns, so
that I can tailor dense tables to the task in front of me.

#### Acceptance Criteria

1. THE Filter_Bar SHALL render a column-visibility control that lists each
   toggleable data column of the associated Data_Table by its header label and
   indicates each column's current visibility state, excluding the selection,
   expand, and row-action control columns from the list.
2. WHEN the user toggles a column off in the column-visibility control, THE
   Data_Table SHALL remove that column's header and all of its row cells from
   the rendered table within 200 ms.
3. WHEN the user toggles a column on in the column-visibility control, THE
   Data_Table SHALL render that column's header and all of its row cells within
   200 ms.
4. IF toggling a column off would leave zero visible toggleable data columns,
   THEN THE Filter_Bar SHALL keep that column visible and indicate that at
   least one data column must remain visible.
5. WHILE the user remains on the same admin route, THE Data_Table SHALL
   preserve the current column-visibility selection across sorting, filtering,
   and pagination changes.
6. THE Filter_Bar SHALL associate each column toggle in the column-visibility
   control with a text label and expose its on/off state for assistive
   technology.

### Requirement 8: Filter Bar

**User Story:** As a salon receptionist, I want a consistent filter bar above
each list, so that I can search and narrow results the same way on every page.

#### Acceptance Criteria

1. WHEN a page that includes the Filter_Bar is rendered, THE Filter_Bar SHALL
   display only the controls designated in that page's control configuration,
   selected from the set {search input, filter dropdown controls,
   column-visibility control, tabbed filter control}.
2. WHEN the user enters text in the search input and 300 milliseconds elapse
   with no further keystroke, THE Filter_Bar SHALL emit the trimmed search term
   to the associated Data_Table for filtering.
3. THE Filter_Bar SHALL limit the search input to a maximum of 100 characters.
4. WHEN the user selects an option in a filter dropdown control, THE Filter_Bar
   SHALL emit the selected filter value to the associated Data_Table.
5. WHEN the user selects a tab in the tabbed filter control, THE Filter_Bar
   SHALL emit the selected tab value to the associated Data_Table.
6. WHEN the user toggles a column in the column-visibility control, THE
   Filter_Bar SHALL emit the updated set of visible columns to the associated
   Data_Table.
7. THE Filter_Bar SHALL associate each rendered control with a programmatically
   associated text label exposed to assistive technology.

### Requirement 9: Status Badge System

**User Story:** As a salon staff member, I want status pills with consistent,
meaningful colours, so that I can recognise booking, payment, and membership
states at a glance.

#### Acceptance Criteria

1. WHEN a status value is provided, THE Status_Badge SHALL render a colour-coded
   pill containing a human-readable text label.
2. THE Status_Badge SHALL map each recognised status value to one Brand_Tokens
   semantic colour: the success token for positive or completed states (e.g.
   confirmed, completed, active, paid, won), the warning token for pending or
   in-progress states (e.g. pending, follow_up, in_progress), and the error
   token for negative or terminal-failure states (e.g. rejected, cancelled,
   no_show, expired, lost).
3. WHEN a status value is provided in snake_case, THE Status_Badge SHALL render
   the label in Title Case by replacing each underscore with a single space and
   capitalising the first letter of every word.
4. IF a status value has no defined colour mapping, or is empty, null, or
   undefined, THEN THE Status_Badge SHALL render the pill in a neutral default
   colour, using the supplied status value as the label or a fixed placeholder
   label when no value is present.
5. THE Status_Badge SHALL maintain a text-to-background contrast ratio of at
   least 4.5:1 for every colour mapping, including the warning and the neutral
   default colours.
6. THE Status_Badge SHALL convey the status through the rendered text label and
   not through colour as the sole means of indication.

### Requirement 10: Dashboard KPI and Chart Cards

**User Story:** As a salon owner, I want an at-a-glance dashboard with key
metrics and trends, so that I can understand the state of the business as soon
as I open the portal.

#### Acceptance Criteria

1. THE Dashboard SHALL render at least four KPI_Card components, each presenting
   a single summary metric value with a text label.
2. THE Dashboard SHALL render at least one Chart_Card presenting a data
   visualisation built with the installed `recharts` library.
3. THE Dashboard SHALL render a recent-activity Data_Table beneath the KPI and
   chart cards.
4. WHILE Dashboard data is loading, THE Dashboard SHALL render skeleton
   State_Presenter placeholders in place of the KPI_Card values, the Chart_Card
   visualisation, and the recent-activity Data_Table rows.
5. IF Dashboard data fails to load, THEN THE Dashboard SHALL render an error
   State_Presenter with a retry control that re-requests the Dashboard data when
   activated.
6. THE KPI_Card SHALL display monetary values with the Indian Rupee symbol,
   Indian digit grouping, and exactly two decimal places (e.g. ₹1,00,000.00).
7. WHEN Dashboard data loads successfully and the recent-activity Data_Table has
   no records, THE Dashboard SHALL render an empty-state State_Presenter in
   place of the Data_Table rows.
8. IF Dashboard data has not loaded within 10 seconds of the request being
   issued, THEN THE Dashboard SHALL render the error State_Presenter with a
   retry control.

### Requirement 11: Slide-Over Detail Panel

**User Story:** As a salon manager, I want detail and activity views to slide in
from the right, so that I can inspect a record without losing my place in the
list.

#### Acceptance Criteria

1. THE Slide_Over_Panel SHALL render as a right-side overlay built on the
   installed Radix Dialog primitive.
2. WHEN the user activates a control that opens a Slide_Over_Panel, THE
   Slide_Over_Panel SHALL slide in from the right edge over a dimming backdrop
   within a 300 ms transition.
3. WHEN the user activates the close control, the overlay backdrop, or the
   Escape key, THE Slide_Over_Panel SHALL remove the panel and backdrop from
   view within 300 ms.
4. WHILE the Slide_Over_Panel is open, THE Slide_Over_Panel SHALL trap keyboard
   focus within the panel.
5. WHEN the Slide_Over_Panel closes, THE Slide_Over_Panel SHALL return keyboard
   focus to the control that opened it.
6. WHILE the Slide_Over_Panel is open, THE Slide_Over_Panel SHALL lock scrolling
   of the background page content.
7. THE Slide_Over_Panel SHALL expose modal dialog semantics with an accessible
   name to assistive technology.
8. WHILE the user's system requests reduced motion, THE Slide_Over_Panel SHALL
   suppress its slide transition and appear without motion.

### Requirement 12: Consistent State Presenters

**User Story:** As a salon staff member, I want loading, empty, and error states
to look and behave the same everywhere, so that the portal feels reliable and
predictable.

#### Acceptance Criteria

1. WHILE a data view is loading, THE State_Presenter SHALL render a skeleton
   placeholder occupying the same width and height as the expected content,
   rendering one placeholder row per expected record up to a maximum of 10 rows.
2. WHEN a data view has loaded with no records, THE State_Presenter SHALL render
   an empty-state message describing the absence of records for that view.
3. IF a data view fails to load, THEN THE State_Presenter SHALL render an
   error-state message and a retry control.
4. WHEN the user activates the retry control in an error State_Presenter, THE
   Admin_Portal SHALL re-request the data for that view.
5. WHEN the user activates the retry control in an error State_Presenter, THE
   State_Presenter SHALL return to the loading state.
6. IF a data view has not completed loading within 30 seconds of the request
   being issued, THEN THE State_Presenter SHALL render the error-state message
   and a retry control.
7. WHILE a data view is loading, THE State_Presenter SHALL announce the loading
   state to assistive technology using a polite live region.
8. IF a data view fails to load, THEN THE State_Presenter SHALL announce the
   error state to assistive technology using an assertive live region.

### Requirement 13: Accessibility Compliance

**User Story:** As a salon owner, I want the redesigned portal to meet
accessibility standards, so that every staff member can use it and the project
passes its required quality gate.

#### Acceptance Criteria

1. THE Admin_Design_System SHALL meet WCAG_AA conformance for every redesigned
   component and every redesigned route.
2. WHEN an interactive control receives keyboard focus, THE Admin_Design_System
   SHALL render a focus indicator that maintains a contrast ratio of at least
   3:1 against the adjacent background and is not fully obscured by other
   content.
3. THE Admin_Design_System SHALL allow every interactive control to be operated
   using keyboard alone, with no dependence on pointer-only gestures or input
   timing.
4. WHEN keyboard focus enters any component that constrains focus (such as a
   modal dialog or menu), THE Admin_Design_System SHALL allow focus to move away
   from that component using keyboard alone.
5. THE Admin_Design_System SHALL maintain a contrast ratio of at least 4.5:1 for
   normal-size text and at least 3:1 for large-size text.
6. WHILE the user's system requests reduced motion, THE Admin_Design_System
   SHALL suppress all non-essential animation and transition motion, retaining
   only motion required to convey information or operational state.
7. WHEN the Lighthouse Accessibility audit runs against a redesigned route, THE
   Admin_Portal SHALL achieve a score of 100 on that route.
8. IF any redesigned route scores below 100 on the Lighthouse Accessibility
   audit, THEN THE Admin_Portal SHALL fail its accessibility quality gate and
   block the change from merging, with an indication identifying the failing
   route.

### Requirement 14: Responsive Behaviour

**User Story:** As a salon receptionist, I want the portal to work on a tablet
or phone at the front desk, so that I can manage bookings away from a desktop.

#### Acceptance Criteria

1. WHILE the viewport width is between 375px and 1023px inclusive, THE
   Data_Table SHALL confine horizontal scrolling to its own content region,
   keeping every column value fully visible without clipping or truncation that
   hides data, and producing no horizontal scrolling of the surrounding page.
2. WHILE the viewport width is between 375px and 1023px inclusive, THE App_Shell
   SHALL hide the user-name text in the user identity block while keeping the
   avatar visible and operable as an interactive control.
3. THE Admin_Design_System SHALL render every redesigned page without horizontal
   page overflow, producing no horizontal page scrollbar and no content
   extending beyond the viewport's right edge, at all viewport widths from
   375px to 1920px inclusive.
4. WHEN the viewport width is at or above 1024px, THE App_Shell SHALL display
   both the avatar and the user-name text in the user identity block.
5. WHILE the viewport width is between 375px and 1023px inclusive, THE
   Admin_Design_System SHALL present every interactive control with a touch
   target measuring at least 44 by 44 CSS pixels.

### Requirement 15: India-First Formatting

**User Story:** As a salon owner operating in India, I want currency, dates, and
times shown in Indian conventions, so that the data matches how my business
records information.

#### Acceptance Criteria

1. WHEN displaying a monetary value, THE Admin_Design_System SHALL format it in
   Indian Rupee using the Indian digit-grouping convention (groups of two digits
   beyond the first three, e.g. ₹1,00,000.00) with exactly two decimal places,
   for values from 0.00 to 999,999,999.99.
2. WHEN displaying a calendar date, THE Admin_Design_System SHALL format it as
   DD/MM/YYYY using the `en-IN` locale, with each component zero-padded to its
   fixed width (two digits for day and month, four digits for year).
3. WHEN displaying a date-and-time value, THE Admin_Design_System SHALL convert
   the stored UTC value to India Standard Time (UTC+05:30) before presentation
   and SHALL apply no daylight-saving offset.
4. IF a value supplied for currency, date, or time formatting is null,
   undefined, or not a valid number or date, THEN THE Admin_Design_System SHALL
   render a fixed placeholder indicating no value is available and SHALL NOT
   display a partial, raw, or unformatted value.
5. WHEN displaying a time-of-day value, THE Admin_Design_System SHALL format it
   in 24-hour HH:MM form, with each component zero-padded to two digits, in
   India Standard Time.

### Requirement 16: Presentation-Layer Boundary

**User Story:** As the solo developer, I want the redesign to touch only the
presentation layer, so that I can re-skin the portal without risking data
integrity or business rules.

#### Acceptance Criteria

1. THE Admin_Design_System SHALL change only files within `apps/admin/app/`,
   `apps/admin/components/`, `apps/admin/src/components/`, and shared UI
   primitives in `@rgss/ui`.
2. THE Admin_Design_System SHALL NOT modify data models or database schema in
   `packages/db/schema/` or `packages/db/migrations/`, nor the request and
   response contract fields (names, types, required status) of API routes under
   `apps/admin`.
3. THE Admin_Design_System SHALL NOT modify the RBAC access-control logic in
   `@/lib/rbac`.
4. THE Admin_Design_System SHALL consume existing admin API endpoints using
   their current request and response contracts.
5. THE Admin_Design_System SHALL contain no business logic — domain
   calculations, validation, or state-transition rules — within presentation
   components, delegating any such logic to `packages/business`.
6. THE Admin_Design_System SHALL confine every changed file path to the
   directories permitted by acceptance criterion 1.
7. IF a redesign change would modify a file outside the permitted directories,
   THEN THE Admin_Design_System SHALL reject that change and preserve the
   affected file unchanged.
8. THE Admin_Design_System SHALL leave the CI Drift_Gate and the committed
   schema fingerprint reference unchanged.

### Requirement 17: Consistent Application Across Routes

**User Story:** As a salon manager, I want every admin page to use the same
redesigned primitives, so that the whole portal feels like one cohesive product.

#### Acceptance Criteria

1. THE Admin_Design_System SHALL render every authenticated admin route served
   under the Root-Path Convention within the App_Shell, and SHALL NOT render
   admin page content within any alternative layout frame.
2. WHERE an admin route presents a tabular list of records, THE
   Admin_Design_System SHALL render that list using the Data_Table primitive.
3. WHERE an admin route presents a status value, THE Admin_Design_System SHALL
   render that value using the Status_Badge primitive.
4. WHERE an admin route presents loading, empty, or error conditions, THE
   Admin_Design_System SHALL render those conditions using the State_Presenter
   components.
5. WHERE an admin route provides search or filter controls over a list, THE
   Admin_Design_System SHALL render those controls using the Filter_Bar
   primitive.
6. THE Admin_Design_System SHALL preserve, on each redesigned route, every data
   field that the route displayed before the redesign, removing none of them.
7. THE Admin_Design_System SHALL keep every user action that a route provided
   before the redesign available and functional with its pre-redesign effect.
