# Requirements Document

## Introduction

The Admin Portal Redesign re-skins and restructures the Royal Glow admin portal
(`apps/admin`, served at `admin.theroyalglow.in`) into a cohesive, premium
SaaS-grade admin/CRM interface. Every admin route is redesigned so that all UI
is composed from the **canonical shadcn/ui component set** (owned source copied
into `apps/admin/src/components/ui/` via the shadcn CLI) built on **Radix UI**
primitives, with the **`motion`** package (motion.dev) driving state, route, and
list transitions and micro-interactions. Where shadcn/ui provides a component
(Button, Input, Select, Checkbox, Table, Tabs, Sheet, Dialog, DropdownMenu,
Tooltip, Badge, Card, Skeleton, Popover, Command, Separator, Avatar, ScrollArea,
Sonner toast, Breadcrumb, Sidebar, and so on), the redesign uses that component
rather than a bespoke one-off control.

This is a **presentation-layer** effort only. It does **not** change data
models, API contracts, business logic, route paths, or the RBAC access-control
model. The shared design tokens in `@rgss/ui`
(`packages/ui/src/styles/theme.css`) remain the single source of truth. Because
`apps/admin/components.json` is configured with `baseColor: neutral`, the
redesign **remaps the shadcn theme CSS variables onto the existing Royal Glow
brand tokens** so every shadcn component inherits the warm cocoa/gold brand
identity rather than the default neutral palette. The redesign consumes and maps
those tokens rather than redefining brand colours, fonts, or radii.

This revision pivots the foundation away from admin-local hand-rolled primitives
toward the canonical shadcn/Radix component library. The previously introduced
custom primitives (Data_Table, Filter_Bar, Status_Badge, Slide_Over_Panel,
State_Presenter, KPI_Card, Chart_Card, Icon) are **refactored to compose
shadcn/ui and Radix primitives** rather than bespoke markup, while their pure
helper logic and property-tested behaviour are preserved.

The user experience follows Benji Taylor's **Family Values** principles —
Simplicity through gradual revelation, Fluidity through seamless transitions,
and Delight through selective emphasis — alongside standard shadcn/Radix admin
best practices (responsive sidebar, breadcrumb trails, TanStack-backed data
tables, a command palette for power actions, Sonner toasts, and sheets for
detail panels). The redesign meets WCAG 2.1 AA, achieves a Lighthouse
accessibility score of 100, uses India-first formatting, and remains responsive
from 375px to 1920px.

## Glossary

- **Admin_Portal**: The `apps/admin` Next.js application served at
  `admin.theroyalglow.in`, using the Root-Path Convention (no `/admin` prefix).
- **Admin_Design_System**: The cohesive set of redesigned admin UI components,
  token-mapping rules, typography scale, spacing scale, motion conventions, and
  iconography introduced by this feature, founded on the Component_Library.
- **Component_Library**: The canonical **shadcn/ui** component set installed as
  owned source under `apps/admin/src/components/ui/` via the shadcn CLI, built on
  **Radix UI** primitives.
- **shadcn_UI**: The shadcn/ui distribution (style `new-york`, configured in
  `apps/admin/components.json`) whose components are copied into the repository
  as editable source rather than imported from a runtime package.
- **Radix_Primitives**: The Radix UI unstyled, accessible primitive components
  (e.g. Dialog, DropdownMenu, Select, Checkbox, Tabs, Tooltip, Popover, Avatar,
  ScrollArea, Separator) on which shadcn_UI components are built.
- **Motion_Library**: The `motion` package (motion.dev) used for animating
  transitions and micro-interactions.
- **Brand_Tokens**: The shared design tokens defined in
  `packages/ui/src/styles/theme.css` (`@rgss/ui`) — brand colours, fonts
  (Cabinet Grotesk, Clash Grotesk, Plus Jakarta Sans), radii (cards 6px,
  buttons 8px, pill), shadows. The single source of truth shared with
  `apps/web`.
- **Theme_Variable_Mapping**: The set of shadcn theme CSS variables (e.g.
  `--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`,
  `--radius`) redefined in `apps/admin` to resolve to named Brand_Tokens values
  so Component_Library components render in the Royal Glow brand identity.
- **Family_Values**: The three guiding UX principles applied by the redesign —
  Simplicity, Fluidity, and Delight (defined below).
- **Simplicity**: Gradual revelation — surfacing controls and detail only as
  they become relevant (progressive disclosure, Detail_Sheet panels and the
  Command_Palette for secondary and power actions) and keeping default views
  uncluttered.
- **Fluidity**: Seamless transitions — directional, context-preserving motion
  between states ("fly, don't teleport"), overlaying detail rather than
  navigating away, with every animation serving an orientation purpose and
  respecting reduced-motion.
- **Delight**: Selective emphasis — applying richer motion to infrequent or
  important actions (success confirmations, empty states, onboarding) and
  restrained motion to high-frequency actions.
- **App_Shell**: The redesigned layout frame composed of the Sidebar, the
  Top_Bar, and the Breadcrumb_Trail, wrapping all admin page content, built on
  the shadcn Sidebar block.
- **Sidebar**: The left navigation panel (shadcn Sidebar) rendering role-filtered,
  sectioned navigation items.
- **Top_Bar**: The horizontal bar at the top of the content area containing the
  sidebar toggle, breadcrumbs, the command-palette trigger, notifications, and
  the user identity block.
- **Breadcrumb_Trail**: The hierarchical path indicator shown in the Top_Bar
  using the shadcn Breadcrumb component.
- **Command_Palette**: The shadcn Command (⌘K) overlay providing keyboard-driven
  search and power actions across admin routes.
- **Toast**: A transient notification rendered through the shadcn Sonner
  component for action feedback.
- **Icon_System**: The `lucide-react` icon set replacing emoji icons, with a
  per-route icon mapping.
- **Data_Table**: The reusable table composed from the shadcn Table component and
  `@tanstack/react-table` state, supporting sorting, row hover, inline row
  actions, checkbox row selection, expandable nested rows, column-visibility
  toggling, and pagination.
- **Status_Badge**: The reusable label composed from the shadcn Badge component
  that renders a colour-coded status, using semantic Brand_Tokens.
- **Filter_Bar**: The reusable control row composed from shadcn Input, Select,
  Tabs, and DropdownMenu components, containing a search input, filter
  dropdowns, a column-visibility toggle, and tabbed filters.
- **Dashboard**: The admin landing page at route `/`, presenting KPI summary
  cards and chart cards.
- **KPI_Card**: A summary card composed from the shadcn Card component presenting
  a single key metric with a label.
- **Chart_Card**: A shadcn Card presenting a data visualisation built with
  `recharts`.
- **Detail_Sheet**: The reusable right-side overlay panel for detail and activity
  views, composed from the shadcn Sheet component (built on Radix Dialog).
- **State_Presenter**: The reusable components for empty, loading (shadcn
  Skeleton), and error states shown in place of content.
- **Role_Level**: The numeric access level (0–5) resolved from a user's role
  via `@/lib/rbac` (Customer=0 … Developer=5).
- **WCAG_AA**: Web Content Accessibility Guidelines 2.1 Level AA.

## Requirements

### Requirement 1: Brand Token Consumption and shadcn Theme Mapping

**User Story:** As the salon owner, I want every shadcn component in the
redesigned admin portal to render in the established Royal Glow brand identity,
so that the admin tool feels like a premium, on-brand part of my business rather
than a generic neutral template.

#### Acceptance Criteria

1. THE Admin_Design_System SHALL source all brand colour, font, radius, and
   shadow values exclusively from the Brand_Tokens defined in `@rgss/ui`, such
   that zero such values are defined as literals within `apps/admin`.
2. THE Theme_Variable_Mapping SHALL redefine each shadcn theme CSS variable used
   by the Component_Library to resolve to a named Brand_Tokens value, such that
   no Component_Library component renders the shadcn default `neutral` base
   colour.
3. WHERE a colour, font, radius, or shadow value is required by an
   Admin_Design_System component, THE Admin_Design_System SHALL reference a
   Brand_Tokens token or a mapped shadcn theme variable rather than a hard-coded
   literal value, with zero hard-coded colour, font, radius, or shadow literals
   present in `apps/admin` component source.
4. THE Admin_Design_System SHALL apply the Cabinet Grotesk font family to
   heading text, the Clash Grotesk font family to body text, and the Plus Jakarta
   Sans font family to UI label text, as defined in Brand_Tokens.
5. THE Admin_Design_System SHALL map the shadcn radius variable so that card
   surfaces use the 6px card radius token and button surfaces use the 8px button
   radius token defined in Brand_Tokens.
6. IF the existing `apps/web` application also consumes a Brand_Tokens token,
   THEN THE Admin_Design_System SHALL NOT redefine that token within `apps/admin`.
7. IF a Brand_Tokens token referenced by the Theme_Variable_Mapping is missing or
   undefined at build time, THEN THE Admin_Design_System SHALL fail the build
   with an error indicating the missing token name and SHALL NOT substitute a
   hard-coded fallback value.

### Requirement 2: Canonical shadcn/ui and Radix Component Foundation

**User Story:** As the solo developer, I want every interactive element built
from canonical shadcn/ui components on Radix primitives, so that the portal is
accessible by default, consistent, and free of bespoke one-off controls.

#### Acceptance Criteria

1. WHERE the Component_Library provides a component for an interactive UI
   control's role, THE Admin_Design_System SHALL compose that control from the
   Component_Library component built on its Radix_Primitive rather than from a
   hand-authored element.
2. WHERE the Component_Library provides a component for a control's role (button,
   text input, select, checkbox, table, tabs, sheet, dialog, dropdown menu,
   tooltip, badge, card, skeleton, popover, command, separator, avatar, scroll
   area, toast, breadcrumb, sidebar), THE Admin_Design_System SHALL use that
   Component_Library component such that zero instances of a hand-authored
   substitute for that role remain in `apps/admin` component source.
3. THE Admin_Design_System SHALL install each Component_Library component as
   editable owned source under `apps/admin/src/components/ui/` via the shadcn
   CLI such that the `apps/admin` package manifest declares zero runtime shadcn
   package dependency.
4. THE Admin_Design_System SHALL refactor each previously hand-rolled admin
   primitive (Data_Table, Filter_Bar, Status_Badge, Detail_Sheet,
   State_Presenter, KPI_Card, Chart_Card, Icon_System) to compose
   Component_Library and Radix_Primitive components such that the existing tests
   under `apps/admin/src/components/ui` (`data-table-model.test.ts`,
   `filter-bar-render.property.test.ts`, `filter-bar-search.property.test.ts`,
   `status-badge-contrast.property.test.ts`, `use-async-data.property.test.ts`)
   pass unchanged.
5. THE Admin_Design_System SHALL add the `motion` package and the Radix primitive
   packages required by the installed Component_Library components as
   exact-version-pinned dependencies of `apps/admin`.
6. IF an admin UI control's role has no corresponding Component_Library component,
   THEN THE Admin_Design_System SHALL build that control by composing
   Radix_Primitive components styled with mapped theme variables rather than
   ungoverned bespoke markup.
7. WHEN an admin UI control built under this foundation is rendered, THE
   Admin_Design_System SHALL make that control fully keyboard operable, present a
   visible focus indicator on the focused control, and expose a programmatically
   determinable name, role, and state, as verified by `primitives.a11y.test.tsx`.

### Requirement 3: Motion-Driven Transitions and Micro-Interactions

**User Story:** As a salon manager, I want polished, purposeful motion between
states, so that the portal feels fluid and I stay oriented as views change.

#### Acceptance Criteria

1. THE Admin_Design_System SHALL animate route transitions, overlay open and
   close transitions, list row insertion and removal, and control state-change
   micro-interactions using the Motion_Library.
2. WHEN an overlay (Detail_Sheet, Sidebar drawer, dialog, or Command_Palette)
   opens or closes, THE Admin_Design_System SHALL animate the overlay with a
   directional, context-preserving transition that completes within 300 ms.
3. WHEN rows are inserted into or removed from a list or Data_Table, THE
   Admin_Design_System SHALL animate the entry or exit of the affected rows to
   completion within 300 ms rather than replacing them instantly.
4. WHILE the user's system requests reduced motion (prefers-reduced-motion), THE
   Admin_Design_System SHALL suppress all Motion_Library transition and
   micro-interaction motion and SHALL present the same final visual state that
   the animated transition would have produced, without intermediate animation.
5. THE Admin_Design_System SHALL apply motion only where it conveys orientation,
   feedback, or hierarchy, and SHALL NOT animate static decorative content.
6. WHEN a control state-change micro-interaction (such as hover, focus,
   selection, or press feedback) animates, THE Admin_Design_System SHALL complete
   that micro-interaction within 150 ms.
7. WHEN a route transition occurs between two admin pages, THE Admin_Design_System
   SHALL complete the transition within 300 ms.

### Requirement 4: Family Values Interaction Principles

**User Story:** As a salon staff member, I want the portal to reveal complexity
gradually and emphasise the moments that matter, so that everyday work stays
uncluttered and important actions feel considered.

#### Acceptance Criteria

1. WHERE a route exposes secondary or power actions (any action beyond the
   route's primary list-and-read flow, such as bulk operations, configuration, or
   cross-route commands), THE Admin_Design_System SHALL exclude those actions from
   the default rendered view and surface them only through progressive disclosure,
   a Detail_Sheet, or the Command_Palette (Simplicity).
2. WHEN the user opens a record's detail, THE Admin_Design_System SHALL present
   that detail in a Detail_Sheet overlaid on the current view, keeping the
   underlying list rendered beneath it and not navigating to a separate full-page
   route (Fluidity).
3. WHEN a state transition occurs between two related views, THE
   Admin_Design_System SHALL animate the transition as a directional movement that
   translates content along a consistent axis from the originating view toward the
   destination view and completes within 300 ms, rather than an instant swap
   (Fluidity).
4. WHERE an action is infrequent or high-importance (success confirmation,
   empty-state reveal, onboarding step), THE Admin_Design_System SHALL apply
   emphasis motion that completes between 200 ms and 600 ms and animates at least
   two visual properties (for example opacity together with position or scale)
   (Delight).
5. WHERE an action is high-frequency (typing, sorting, paginating, hovering), THE
   Admin_Design_System SHALL apply restrained motion that completes within 150 ms
   and SHALL begin processing the interaction without waiting for that motion to
   complete (Delight).
6. WHILE the user's system requests reduced motion, THE Admin_Design_System SHALL
   present both emphasis and restrained state changes without animation, rendering
   the resulting state directly (Delight).

### Requirement 5: Iconography Migration

**User Story:** As a salon staff member, I want clear, professional icons in the
admin portal, so that I can scan navigation and actions quickly without
emoji-rendering inconsistencies across devices.

#### Acceptance Criteria

1. THE Icon_System SHALL render navigation, action, and status icons using the
   `lucide-react` icon set.
2. THE Icon_System SHALL map each admin navigation route to exactly one
   `lucide-react` icon.
3. THE Admin_Design_System SHALL replace every emoji-based icon in the App_Shell,
   Sidebar, and Dashboard with an Icon_System icon such that no Unicode emoji
   glyph remains rendered as an icon within those three areas.
4. WHERE an icon is rendered for decorative purposes alongside a visible text
   label, THE Icon_System SHALL mark that icon as hidden from assistive
   technology.
5. WHERE an icon is the only content of an interactive control, THE Icon_System
   SHALL provide a non-empty accessible text label that names the control's
   action for assistive technology.
6. IF a navigation route has no `lucide-react` icon defined in the per-route
   mapping, THEN THE Icon_System SHALL render a single predefined default
   `lucide-react` fallback icon for that route.

### Requirement 6: App Shell Layout

**User Story:** As a salon manager, I want a polished, consistent layout frame
around every admin page, so that navigation and context are always available and
predictable.

#### Acceptance Criteria

1. THE App_Shell SHALL render the Sidebar, the Top_Bar, and the page content
   region on every admin page using the shadcn Sidebar block.
2. THE App_Shell SHALL render the Top_Bar containing the sidebar toggle control,
   the Breadcrumb_Trail, the Command_Palette trigger, the notification control,
   and the user identity block.
3. THE App_Shell SHALL display the signed-in user's display name, up to the first
   two initials derived from the display name as a shadcn Avatar, and the user's
   role label in the user identity block.
4. WHILE the viewport width is at least 1024px, THE Sidebar SHALL remain
   persistently visible alongside the page content.
5. WHILE the viewport width is below 1024px, THE Sidebar SHALL remain hidden until
   opened as an overlay drawer.
6. WHEN the user activates the sidebar toggle control on a viewport below 1024px
   while the Sidebar overlay is closed, THE App_Shell SHALL open the Sidebar as
   an overlay drawer over the page content with a dimming backdrop and move
   keyboard focus into the drawer.
7. WHEN the user activates the sidebar toggle control, the overlay backdrop, the
   Escape key, or a navigation item while the Sidebar overlay is open, THE
   App_Shell SHALL close the Sidebar overlay.
8. WHILE the Sidebar overlay is open, THE App_Shell SHALL trap keyboard focus
   within the Sidebar drawer.
9. WHEN the Sidebar overlay closes, THE App_Shell SHALL return keyboard focus to
   the sidebar toggle control.

### Requirement 7: Sidebar Navigation and Role Filtering

**User Story:** As a salon owner, I want each staff member to see only the
navigation entries their role permits, so that the portal stays focused and
access stays controlled after the redesign.

#### Acceptance Criteria

1. THE Sidebar SHALL render navigation entries grouped into titled sections,
   displaying each section's title text and ordering sections and items as
   defined in `ADMIN_NAV`.
2. THE Sidebar SHALL derive the visible navigation entries from `ADMIN_NAV` and
   `filterNavByLevel` in `@/lib/rbac` using the signed-in user's Role_Level.
3. THE Sidebar SHALL display a navigation item only when the item's minimum level
   is less than or equal to the signed-in user's Role_Level.
4. WHEN a section has no visible navigation items for the signed-in user's
   Role_Level, THE Sidebar SHALL omit that section entirely, including its section
   title.
5. WHEN the current route matches a navigation item by longest matching route
   prefix, THE Sidebar SHALL render exactly that one item in a visual state that
   is visually distinct from non-active items.
6. WHEN the current route matches a navigation item, THE Sidebar SHALL mark that
   item as the current page for assistive technology.
7. IF the signed-in user's Role_Level is unresolved, unknown, or absent, THEN THE
   Sidebar SHALL treat the user as the minimum Role_Level (0) when filtering
   navigation entries.
8. THE Sidebar SHALL render the Royal Glow logo and admin label at the top of the
   panel.
9. THE Admin_Design_System SHALL preserve the existing route paths defined by the
   Root-Path Convention without introducing an `/admin` prefix.

### Requirement 8: Breadcrumb Trail

**User Story:** As a salon receptionist, I want to see where I am in the portal,
so that I can orient myself and navigate back to parent sections quickly.

#### Acceptance Criteria

1. THE Breadcrumb_Trail SHALL display the hierarchical path of the current route
   within the Top_Bar using the shadcn Breadcrumb component, ordered from the
   highest-level ancestor segment to the current page segment.
2. WHEN the current route is a sub-route of a section, THE Breadcrumb_Trail SHALL
   display the parent section label followed by the current page label.
3. THE Breadcrumb_Trail SHALL render every segment except the current page segment
   as a link to that segment's route.
4. THE Breadcrumb_Trail SHALL render the current page segment as non-interactive
   text and mark it as the current page for assistive technology.
5. WHEN the user activates an ancestor segment link, THE Breadcrumb_Trail SHALL
   navigate to that ancestor route.
6. WHILE the current route is a top-level route with no ancestor section, THE
   Breadcrumb_Trail SHALL display only the current page segment, marked as the
   current page.
7. THE Breadcrumb_Trail SHALL present its segments within a navigation landmark
   labelled for assistive technology.

### Requirement 9: Command Palette

**User Story:** As a salon manager, I want a keyboard-driven command palette, so
that I can jump to any route or run common actions without hunting through menus.

#### Acceptance Criteria

1. THE Command_Palette SHALL be composed from the shadcn Command component.
2. WHILE the Command_Palette is closed, WHEN the user presses Ctrl+K
   (Windows/Linux) or Cmd+K (macOS) or activates the Command_Palette trigger in
   the Top_Bar, THE App_Shell SHALL open the Command_Palette as a modal overlay
   and move keyboard focus into its search input within 200 milliseconds.
3. WHEN the user types in the Command_Palette search input, THE Command_Palette
   SHALL filter the listed commands to those whose label contains the entered
   text using case-insensitive matching, and SHALL apply the updated filtered
   list within 200 milliseconds of the last keystroke.
4. THE Command_Palette SHALL list only the navigation destinations and actions
   returned by `filterNavByLevel` for the signed-in user's Role_Level, where an
   item is included only when its minimum required level is less than or equal to
   Role_Level.
5. IF the signed-in user's role cannot be resolved, THEN THE Command_Palette SHALL
   apply Role_Level 0 when filtering the listed navigation destinations and
   actions.
6. IF no listed command matches the entered text, THEN THE Command_Palette SHALL
   display a no-results indication in place of the command list.
7. WHEN the user selects a navigation command, THE Command_Palette SHALL navigate
   to that route and close the overlay.
8. WHILE the Command_Palette is open, THE App_Shell SHALL confine keyboard focus
   to the focusable elements within the Command_Palette overlay.
9. WHEN the user activates the Escape key or selects a command, THE
   Command_Palette SHALL close and return keyboard focus to the element that was
   focused before the Command_Palette opened.

### Requirement 10: Reusable Data Table

**User Story:** As a salon manager, I want dense, scannable tables with sorting,
filtering, selection, and pagination, so that I can work through large lists of
bookings, customers, and invoices efficiently.

#### Acceptance Criteria

1. THE Data_Table SHALL render its column headers, data rows, and pagination
   control region using the shadcn Table component.
2. THE Data_Table SHALL build its table state using the installed
   `@tanstack/react-table` library.
3. WHEN the user activates a sortable column header, THE Data_Table SHALL sort the
   displayed rows by that column, SHALL toggle the sort direction between
   ascending and descending on each successive activation, SHALL constrain active
   sorting to a single column at a time, and SHALL display an ascending or
   descending direction indicator on the active column header.
4. WHEN the user points at a data row with a pointer device, THE Data_Table SHALL
   render that row in a hover visual state.
5. THE Data_Table SHALL render inline row action controls for each row using the
   shadcn DropdownMenu component.
6. WHERE row selection is enabled, THE Data_Table SHALL render a shadcn Checkbox
   for each row and a select-all shadcn Checkbox in the header.
7. WHERE a row has child rows, THE Data_Table SHALL render an expand control that
   reveals the child rows when activated.
8. THE Data_Table SHALL render a "Rows per page" control offering the page-size
   options 10, 25, 50, and 100, with 25 selected by default.
9. WHEN the user selects a value in the "Rows per page" control, THE Data_Table
   SHALL display at most that number of rows per page.
10. THE Data_Table SHALL associate each column header with its column cells for
    assistive technology and support keyboard operation of all interactive
    controls.
11. THE Data_Table SHALL render a previous-page control, a next-page control, and
    a current-page position indicator showing the displayed page number relative
    to the total page count.
12. WHEN the user activates a pagination control for an available adjacent page,
    THE Data_Table SHALL replace the displayed rows with that page's rows.
13. IF no adjacent page exists in the direction requested by a pagination control,
    THEN THE Data_Table SHALL disable that pagination control.

### Requirement 11: Column Visibility Toggle

**User Story:** As a salon manager, I want to show or hide table columns, so that
I can tailor dense tables to the task in front of me.

#### Acceptance Criteria

1. THE Filter_Bar SHALL render a column-visibility control, composed from the
   shadcn DropdownMenu component, that lists each toggleable data column of the
   associated Data_Table by its header label and indicates each column's current
   visibility state, excluding the selection, expand, and row-action control
   columns from the list.
2. WHEN the user toggles a column off in the column-visibility control, THE
   Data_Table SHALL remove that column's header and all of its row cells from the
   rendered table within 200 ms.
3. WHEN the user toggles a column on in the column-visibility control, THE
   Data_Table SHALL render that column's header and all of its row cells within
   200 ms.
4. IF toggling a column off would leave zero visible toggleable data columns, THEN
   THE Filter_Bar SHALL keep that column visible and indicate that at least one
   data column must remain visible.
5. WHILE the user remains on the same admin route, THE Data_Table SHALL preserve
   the current column-visibility selection across sorting, filtering, and
   pagination changes.
6. THE Filter_Bar SHALL associate each column toggle in the column-visibility
   control with a text label and expose its on/off state for assistive technology.

### Requirement 12: Filter Bar

**User Story:** As a salon receptionist, I want a consistent filter bar above
each list, so that I can search and narrow results the same way on every page.

#### Acceptance Criteria

1. WHEN a page that includes the Filter_Bar is rendered, THE Filter_Bar SHALL
   display only the controls designated in that page's control configuration,
   composing each from its shadcn component (Input for search, Select for filter
   dropdowns, DropdownMenu for column visibility, Tabs for tabbed filters).
2. WHEN the user enters text in the search input and 300 milliseconds elapse with
   no further keystroke, THE Filter_Bar SHALL emit the trimmed search term to the
   associated Data_Table for filtering.
3. THE Filter_Bar SHALL limit the search input to a maximum of 100 characters.
4. WHEN the user selects an option in a filter dropdown control, THE Filter_Bar
   SHALL emit the selected filter value to the associated Data_Table.
5. WHEN the user selects a tab in the tabbed filter control, THE Filter_Bar SHALL
   emit the selected tab value to the associated Data_Table.
6. WHEN the user toggles a column in the column-visibility control, THE Filter_Bar
   SHALL emit the updated set of visible columns to the associated Data_Table.
7. THE Filter_Bar SHALL associate each rendered control with a programmatically
   associated text label exposed to assistive technology.

### Requirement 13: Status Badge System

**User Story:** As a salon staff member, I want status pills with consistent,
meaningful colours, so that I can recognise booking, payment, and membership
states at a glance.

#### Acceptance Criteria

1. WHEN a status value is provided, THE Status_Badge SHALL render a colour-coded
   shadcn Badge containing a human-readable text label.
2. THE Status_Badge SHALL map each recognised status value to one Brand_Tokens
   semantic colour: the success token for positive or completed states (e.g.
   confirmed, completed, active, paid, won), the warning token for pending or
   in-progress states (e.g. pending, follow_up, in_progress), and the error token
   for negative or terminal-failure states (e.g. rejected, cancelled, no_show,
   expired, lost).
3. WHEN a status value is provided in snake_case, THE Status_Badge SHALL render
   the label in Title Case by replacing each underscore with a single space and
   capitalising the first letter of every word.
4. IF a status value has no defined colour mapping, or is empty, null, or
   undefined, THEN THE Status_Badge SHALL render the badge in a neutral default
   colour, using the supplied status value as the label or a fixed placeholder
   label when no value is present.
5. THE Status_Badge SHALL maintain a text-to-background contrast ratio of at least
   4.5:1 for every colour mapping, including the warning and the neutral default
   colours.
6. THE Status_Badge SHALL convey the status through the rendered text label and
   not through colour as the sole means of indication.

### Requirement 14: Dashboard KPI and Chart Cards

**User Story:** As a salon owner, I want an at-a-glance dashboard with key metrics
and trends, so that I can understand the state of the business as soon as I open
the portal.

#### Acceptance Criteria

1. THE Dashboard SHALL render at least four KPI_Card components, each composed from
   the shadcn Card component and presenting a single summary metric value with a
   text label.
2. THE Dashboard SHALL render at least one Chart_Card presenting a data
   visualisation built with the installed `recharts` library.
3. THE Dashboard SHALL render a recent-activity Data_Table beneath the KPI and
   chart cards.
4. WHILE Dashboard data is loading, THE Dashboard SHALL render shadcn Skeleton
   State_Presenter placeholders in place of the KPI_Card values, the Chart_Card
   visualisation, and the recent-activity Data_Table rows.
5. IF Dashboard data fails to load, THEN THE Dashboard SHALL render an error
   State_Presenter with a retry control that re-requests the Dashboard data when
   activated.
6. THE KPI_Card SHALL display monetary values with the Indian Rupee symbol, Indian
   digit grouping, and exactly two decimal places (e.g. ₹1,00,000.00).
7. WHEN Dashboard data loads successfully and the recent-activity Data_Table has
   no records, THE Dashboard SHALL render an empty-state State_Presenter in place
   of the Data_Table rows.
8. IF Dashboard data has not loaded within 10 seconds of the request being issued,
   THEN THE Dashboard SHALL render the error State_Presenter with a retry control.

### Requirement 15: Detail Sheet Panel

**User Story:** As a salon manager, I want detail and activity views to slide in
from the right, so that I can inspect a record without losing my place in the
list.

#### Acceptance Criteria

1. THE Detail_Sheet SHALL render as a right-side overlay composed from the shadcn
   Sheet component (built on the Radix Dialog primitive).
2. WHEN the user activates a control that opens a Detail_Sheet, THE Detail_Sheet
   SHALL slide in from the right edge over a dimming backdrop within a 300 ms
   Motion_Library transition.
3. WHEN the user activates the close control, the overlay backdrop, or the Escape
   key, THE Detail_Sheet SHALL remove the panel and backdrop from view within
   300 ms.
4. WHILE the Detail_Sheet is open, THE Detail_Sheet SHALL trap keyboard focus
   within the panel.
5. WHEN the Detail_Sheet closes, THE Detail_Sheet SHALL return keyboard focus to
   the control that opened it.
6. WHILE the Detail_Sheet is open, THE Detail_Sheet SHALL lock scrolling of the
   background page content.
7. THE Detail_Sheet SHALL expose modal dialog semantics with an accessible name to
   assistive technology.
8. WHILE the user's system requests reduced motion, THE Detail_Sheet SHALL suppress
   its slide transition and appear without motion.

### Requirement 16: Toast Notifications

**User Story:** As a salon staff member, I want consistent confirmation and error
messages, so that I know whether an action succeeded without losing my place.

#### Acceptance Criteria

1. THE Admin_Design_System SHALL render transient action feedback using the
   shadcn Sonner Toast component.
2. WHEN a user-initiated action completes successfully, THE Admin_Design_System
   SHALL display a success Toast whose text names the completed action.
3. IF a user-initiated action fails, THEN THE Admin_Design_System SHALL display an
   error Toast whose text names the attempted action and indicates the reason for
   failure.
4. WHEN a success Toast is displayed, THE Admin_Design_System SHALL announce it to
   assistive technology through a live region without interrupting the screen
   reader's current output.
5. WHEN an error Toast is displayed, THE Admin_Design_System SHALL announce it to
   assistive technology through a live region that interrupts the screen reader's
   current output.
6. WHILE the user's system requests reduced motion, THE Admin_Design_System SHALL
   present each Toast without entrance or exit motion.
7. WHEN a success Toast is displayed, THE Admin_Design_System SHALL automatically
   dismiss it after 5 seconds, and SHALL provide a keyboard-operable control that
   dismisses it before that time.
8. WHILE an error Toast is displayed, THE Admin_Design_System SHALL keep it visible
   until the user dismisses it through a keyboard-operable control rather than
   auto-dismissing it.
9. IF a failed action prevents the user from completing their current task, THEN
   THE Admin_Design_System SHALL also convey the failure through a persistent
   in-page message that remains visible until the user resolves or dismisses it,
   so that the Toast is not the sole means of conveying the error.

### Requirement 17: Consistent State Presenters

**User Story:** As a salon staff member, I want loading, empty, and error states
to look and behave the same everywhere, so that the portal feels reliable and
predictable.

#### Acceptance Criteria

1. WHILE a data view is loading, THE State_Presenter SHALL render a shadcn Skeleton
   placeholder occupying the same width and height as the expected content,
   rendering one placeholder row per expected record up to a maximum of 10 rows.
2. WHEN a data view has loaded with no records, THE State_Presenter SHALL render an
   empty-state message describing the absence of records for that view.
3. IF a data view fails to load, THEN THE State_Presenter SHALL render an
   error-state message and a retry control.
4. WHEN the user activates the retry control in an error State_Presenter, THE
   Admin_Portal SHALL re-request the data for that view.
5. WHEN the user activates the retry control in an error State_Presenter, THE
   State_Presenter SHALL return to the loading state.
6. IF a data view has not completed loading within 30 seconds of the request being
   issued, THEN THE State_Presenter SHALL render the error-state message and a
   retry control.
7. WHILE a data view is loading, THE State_Presenter SHALL announce the loading
   state to assistive technology using a polite live region.
8. IF a data view fails to load, THEN THE State_Presenter SHALL announce the error
   state to assistive technology using an assertive live region.

### Requirement 18: Accessibility Compliance

**User Story:** As a salon owner, I want the redesigned portal to meet
accessibility standards, so that every staff member can use it and the project
passes its required quality gate.

#### Acceptance Criteria

1. THE Admin_Design_System SHALL meet WCAG_AA conformance for every redesigned
   component and every redesigned route.
2. WHEN an interactive control receives keyboard focus, THE Admin_Design_System
   SHALL render a focus indicator that maintains a contrast ratio of at least 3:1
   against the adjacent background and is not fully obscured by other content.
3. THE Admin_Design_System SHALL allow every interactive control to be operated
   using keyboard alone, with no dependence on pointer-only gestures or input
   timing.
4. WHEN keyboard focus enters any component that constrains focus (such as a modal
   dialog, sheet, menu, or Command_Palette), THE Admin_Design_System SHALL allow
   focus to move away from that component using keyboard alone.
5. THE Admin_Design_System SHALL maintain a contrast ratio of at least 4.5:1 for
   normal-size text and at least 3:1 for large-size text.
6. WHILE the user's system requests reduced motion, THE Admin_Design_System SHALL
   suppress all non-essential animation and transition motion, retaining only
   motion required to convey information or operational state.
7. WHEN the Lighthouse Accessibility audit runs against a redesigned route, THE
   Admin_Portal SHALL achieve a score of 100 on that route.
8. IF any redesigned route scores below 100 on the Lighthouse Accessibility audit,
   THEN THE Admin_Portal SHALL fail its accessibility quality gate and block the
   change from merging, with an indication identifying the failing route.

### Requirement 19: Responsive Behaviour

**User Story:** As a salon receptionist, I want the portal to work on a tablet or
phone at the front desk, so that I can manage bookings away from a desktop.

#### Acceptance Criteria

1. WHILE the viewport width is between 375px and 1023px inclusive, THE Data_Table
   SHALL confine horizontal scrolling to its own content region, keeping every
   column value fully visible without clipping or truncation that hides data, and
   producing no horizontal scrolling of the surrounding page.
2. WHILE the viewport width is between 375px and 1023px inclusive, THE App_Shell
   SHALL hide the user-name text in the user identity block while keeping the
   avatar visible and operable as an interactive control.
3. THE Admin_Design_System SHALL render every redesigned page without horizontal
   page overflow, producing no horizontal page scrollbar and no content extending
   beyond the viewport's right edge, at all viewport widths from 375px to 1920px
   inclusive.
4. WHEN the viewport width is at or above 1024px, THE App_Shell SHALL display both
   the avatar and the user-name text in the user identity block.
5. WHILE the viewport width is between 375px and 1023px inclusive, THE
   Admin_Design_System SHALL present every interactive control with a touch target
   measuring at least 44 by 44 CSS pixels.

### Requirement 20: India-First Formatting

**User Story:** As a salon owner operating in India, I want currency, dates, and
times shown in Indian conventions, so that the data matches how my business
records information.

#### Acceptance Criteria

1. WHEN displaying a monetary value, THE Admin_Design_System SHALL format it in
   Indian Rupee using the Indian digit-grouping convention (groups of two digits
   beyond the first three, e.g. ₹1,00,000.00) with exactly two decimal places, for
   values from 0.00 to 999,999,999.99.
2. WHEN displaying a calendar date, THE Admin_Design_System SHALL format it as
   DD/MM/YYYY using the `en-IN` locale, with each component zero-padded to its
   fixed width (two digits for day and month, four digits for year).
3. WHEN displaying a date-and-time value, THE Admin_Design_System SHALL convert the
   stored UTC value to India Standard Time (UTC+05:30) before presentation and
   SHALL apply no daylight-saving offset.
4. IF a value supplied for currency, date, or time formatting is null, undefined,
   or not a valid number or date, THEN THE Admin_Design_System SHALL render a fixed
   placeholder indicating no value is available and SHALL NOT display a partial,
   raw, or unformatted value.
5. WHEN displaying a time-of-day value, THE Admin_Design_System SHALL format it in
   24-hour HH:MM form, with each component zero-padded to two digits, in India
   Standard Time.

### Requirement 21: Presentation-Layer Boundary

**User Story:** As the solo developer, I want the redesign to touch only the
presentation layer, so that I can re-skin the portal without risking data
integrity or business rules.

#### Acceptance Criteria

1. THE Admin_Design_System SHALL change only files within `apps/admin/app/`,
   `apps/admin/src/app/`, `apps/admin/src/components/`, `apps/admin/src/lib/`
   (presentation helpers only), `apps/admin/src/styles/` (theme-variable mapping),
   `apps/admin/components.json`, the dependency list in `apps/admin/package.json`,
   and shared UI primitives in `@rgss/ui`.
2. THE Admin_Design_System SHALL NOT modify data models or database schema in
   `packages/db/schema/` or `packages/db/migrations/`, nor the request and response
   contract fields (names, types, required status) of API routes under `apps/admin`.
3. THE Admin_Design_System SHALL NOT modify the RBAC access-control logic in
   `@/lib/rbac`.
4. THE Admin_Design_System SHALL consume existing admin API endpoints using their
   current request and response contracts.
5. THE Admin_Design_System SHALL contain no business logic — domain calculations,
   validation, or state-transition rules — within presentation components,
   delegating any such logic to `packages/business`.
6. THE Admin_Design_System SHALL confine every changed file path to the directories
   and files permitted by acceptance criterion 1.
7. IF a redesign change would modify a file outside the permitted paths, THEN THE
   Admin_Design_System SHALL reject that change and preserve the affected file
   unchanged.
8. THE Admin_Design_System SHALL leave the CI Drift_Gate and the committed schema
   fingerprint reference unchanged.

### Requirement 22: Consistent Application Across Routes

**User Story:** As a salon manager, I want every admin page redesigned with the
same shadcn/Radix/motion foundation, so that the whole portal feels like one
cohesive product.

#### Acceptance Criteria

1. THE Admin_Design_System SHALL redesign every authenticated admin route served
   under the Root-Path Convention (`/`, `/bookings`, `/bookings/[id]`,
   `/bookings/new`, `/waitlist`, `/customers`, `/customers/[id]`, `/leads`,
   `/leads/[id]`, `/staff`, `/schedule`, `/leave`, `/services`, `/offers`,
   `/memberships`, `/memberships/[id]`, `/memberships/new`, `/billing`,
   `/billing/[id]`, `/reports`, `/settings`, `/branches`, `/users`,
   `/integrations`, `/logs`, `/me/schedule`, `/me/leave`) using the
   Component_Library, and SHALL render each within the App_Shell with no
   alternative layout frame.
2. WHERE an admin route presents a tabular list of records, THE Admin_Design_System
   SHALL render that list using the Data_Table primitive.
3. WHERE an admin route presents a status value, THE Admin_Design_System SHALL
   render that value using the Status_Badge primitive.
4. WHERE an admin route presents loading, empty, or error conditions, THE
   Admin_Design_System SHALL render those conditions using the State_Presenter
   components.
5. WHERE an admin route provides search or filter controls over a list, THE
   Admin_Design_System SHALL render those controls using the Filter_Bar primitive.
6. THE Admin_Design_System SHALL preserve, on each redesigned route, every data
   field that the route displayed before the redesign, removing none of them.
7. THE Admin_Design_System SHALL keep every user action that a route provided
   before the redesign available and functional with its pre-redesign effect.
