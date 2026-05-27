# Pages & Routes — Complete Application Map

> **Implementation reference for every page, route, and endpoint in Royal Glow Salon & Spa.**
> Each entry includes: route path, page title, purpose, UI components, states, realtime behaviour, SEO metadata, mobile/desktop differences, and connected data sources.

**Domain:** `theroyalglow.in`
**Subdomains:** `admin.theroyalglow.in` (Payload CMS) · `docs.theroyalglow.in` (Fumadocs) · `status.theroyalglow.in` (BetterStack)

---

## Route Groups (Next.js App Router)

| Route Group | Layout | Shared Components | Purpose |
|-------------|--------|-------------------|---------|
| `(customer)` | Header + Footer + Nav | Cookie banner, PWA prompt, skip-to-content link | Public and authenticated customer pages |
| `(auth)` | Minimal centered card | Logo only, no nav | Sign-in and onboarding flows |
| `(landing)` | No header/footer | Trust signals only | Conversion-optimised ad landing pages |
| `(legal)` | Header + Footer + Nav | Same as customer | Static legal/policy pages (SSG) |
| `admin/` | Sidebar nav + Top bar + RBAC gate | Role badge, notifications bell, breadcrumbs | Internal staff portal |

---


## 1. Customer-Facing — Public (No Auth Required)

These pages are accessible to everyone. They form the marketing and discovery layer.

---

### 1.1 `/` — Homepage

| Property | Detail |
|----------|--------|
| **Title** | Home |
| **Purpose** | Premium brand landing page with a single conversion goal: open the booking dialog. |
| **Rendering** | SSR (dynamic — personalised CTA if signed in) |
| **SEO** | `<title>Royal Glow Salon & SPA — Premium Beauty in Bengaluru</title>` |
| **JSON-LD** | `LocalBusiness` + `Organization` + `WebSite` (with `SearchAction`) + `FAQPage` |
| **OG Image** | Custom branded default (`/opengraph-image`) |
| **Canonical** | `https://theroyalglow.in` |

**UI Components:**
- Hero section: full-bleed image/video background, Royal Glow wordmark, tagline, single "Book Now" button (primary CTA)
- Services preview: top 4–6 services as horizontal scroll cards linking to `/services`
- Offers banner: active promotion (if any) with countdown timer and CTA
- Testimonials/Reviews: embedded Google Maps review snippets (static at build, refreshed ISR)
- Gallery preview: 4–6 images in masonry grid linking to gallery section
- FAQ section: 6–8 common questions (rendered as accordions, `FAQPage` JSON-LD)
- Footer: NAP (name, address, phone), social links, legal links, "Cookie Preferences" link

**States:**
- Loading: skeleton shimmer on hero image, service cards placeholder
- Error: graceful degradation — static fallback hero, services still rendered from cache
- Empty: N/A (homepage always has content)

**Deep-link behaviour:**
- `/?book=1` → auto-opens the 4-step booking dialog on mount
- `/?book=1&utm_source=gmb` → opens dialog + sets acquisition source `gmb`
- `/?book=1&utm_source=walkin` → opens dialog + sets acquisition source `walkin`
- `/?book=1&leadId={id}` → opens dialog with lead context linked (post-lead-capture redirect)
- `/?book=1&service=[slug]` → opens dialog with service pre-selected in Step 3

**Mobile vs Desktop:**
- Mobile: hero image cropped for portrait, "Book Now" button sticky at bottom of viewport, services as horizontal swipe
- Desktop: full-width hero with parallax, "Book Now" in hero center + fixed header CTA

**Realtime:** None (static content)

**Analytics events:**
- PostHog: `page_view`
- Meta Pixel: `PageView` (auto via base code)
- Clarity: heatmap + scroll depth tracking

**Accessibility:**
- Skip-to-content link as first focusable element
- Hero CTA: `aria-label="Book an appointment at Royal Glow"`
- FAQ accordions: `aria-expanded`, `aria-controls` pattern
- All images: descriptive `alt` text

---


### 1.2 `/services` — Services

| Property | Detail |
|----------|--------|
| **Title** | Services |
| **Purpose** | Browse all services with prices. Primary discovery page for what Royal Glow offers. |
| **Rendering** | SSR (data from Neon via Cloudflare KV cache) |
| **SEO** | `<title>Services & Prices | Royal Glow Salon & SPA</title>` |
| **JSON-LD** | `LocalBusiness` + `BreadcrumbList` + `Service` schema per service + `FAQPage` (service FAQs) |
| **OG Image** | Services-specific branded image |
| **Canonical** | `https://theroyalglow.in/services` |

**UI Components:**
- Salon / SPA toggle filter (sticky on scroll): switches between Salon categories and SPA categories
- Category sections: collapsible accordion groups (Haircut & Styling, Facial & Skincare, etc.)
- Service cards: name, price (₹ GST-inclusive), duration badge, "Book This" mini-button
- SPA services with 60/90min variants: single card with duration toggle (not two cards)
- Price display: always formatted as `₹X,XXX.00` with "Incl. 18% GST" note
- "Book Now" floating CTA at bottom (mobile) / fixed in header (desktop)

**States:**
- Loading: skeleton cards (6 placeholders per category)
- Error: "Unable to load services. Please try again." with retry button
- Empty: N/A (services always seeded)

**Mobile vs Desktop:**
- Mobile: single column, categories as full-width accordions, sticky Salon/SPA toggle at top
- Desktop: two-column grid within each category, toggle as horizontal tabs

**Analytics events:**
- PostHog: `page_view`, `service_viewed` (on card expand/click)
- Meta Pixel: `ViewContent` with `content_name` = category name

**Data source:** `GET /api/services` (Cloudflare KV cached, 5-min TTL)

---

### 1.3 `/offers` — Offers & Combos

| Property | Detail |
|----------|--------|
| **Title** | Offers & Combos |
| **Purpose** | Active promotions with terms, validity dates, and linked services. |
| **Rendering** | SSR |
| **SEO** | `<title>Current Offers & Combos | Royal Glow Salon & SPA</title>` |
| **JSON-LD** | `LocalBusiness` + `BreadcrumbList` + `Event` (per active offer) |
| **Canonical** | `https://theroyalglow.in/offers` |

**UI Components:**
- Offer cards (stacked): offer name, type badge (% off / ₹ off / Combo), linked services list, validity date range, terms text
- "Book Now" CTA on each card (opens homepage booking dialog with offer context)
- Expired offers: hidden (not shown to customers)
- "One offer per customer per day" info banner at top

**States:**
- Loading: skeleton cards (3 placeholders)
- Empty: "No active offers right now. Check back soon!" with illustration
- Error: "Unable to load offers." with retry

**Mobile vs Desktop:**
- Mobile: single column stacked cards
- Desktop: 2-column grid

**Data source:** `offer` table filtered by `start_date <= now AND end_date >= now`

---


### 1.4 `/about` — About Us

| Property | Detail |
|----------|--------|
| **Title** | About Us |
| **Purpose** | Business story, team gallery, salon philosophy. Builds trust and E-E-A-T signals. |
| **Rendering** | ISR (1h revalidation — content from Payload CMS) |
| **SEO** | `<title>About Royal Glow Salon & SPA — Our Story</title>` |
| **JSON-LD** | `LocalBusiness` + `BreadcrumbList` + `Person` (per staff member shown) |
| **Canonical** | `https://theroyalglow.in/about` |

**UI Components:**
- Brand story section: founder narrative, mission statement (from Payload CMS)
- Team gallery: staff cards with photo, name, designation (Stylist/Therapist), specialization
- Salon images: interior/exterior gallery (Cloudflare R2 images via Next.js `<Image>`)
- Values/philosophy section: icons + short text

**States:**
- Loading: skeleton text blocks + image placeholders
- Error: fallback to last cached ISR version

**Content source:** Payload CMS REST API (`/api/pages/about`)

---

### 1.5 `/contact` — Contact

| Property | Detail |
|----------|--------|
| **Title** | Contact |
| **Purpose** | All contact methods, location, and enquiry form. Critical for local SEO. |
| **Rendering** | SSG (static — contact info rarely changes) |
| **SEO** | `<title>Contact & Location | Royal Glow Salon & SPA Bengaluru</title>` |
| **JSON-LD** | `LocalBusiness` (full, with `geo`, `openingHoursSpecification`) + `BreadcrumbList` |
| **Canonical** | `https://theroyalglow.in/contact` |

**UI Components:**
- Address block: wrapped in `<address>` HTML tag, full NAP
- Google Maps embed: interactive map with pin (Place ID based)
- Business hours table: `<time>` tags for each day
- Phone: click-to-call link (`tel:+916360135720`)
- Email: `mailto:hello@theroyalglow.in`
- Social links: Instagram, Facebook (icon buttons with `aria-label`)
- Enquiry/feedback form: name, email, message, submit button
- Directions CTA: "Get Directions" opens Google Maps app on mobile

**States:**
- Form: idle → submitting (spinner) → success ("Thanks! We'll get back to you.") → error (inline message)

**Mobile vs Desktop:**
- Mobile: map full-width above form, click-to-call prominent
- Desktop: map on right, contact info + form on left (2-column)

**Offline (PWA):** This page is cached by service worker — accessible without internet

---

### 1.6 `/blog` — Blog

| Property | Detail |
|----------|--------|
| **Title** | Blog |
| **Purpose** | Beauty & wellness articles for SEO content marketing and E-E-A-T. |
| **Rendering** | ISR (1h revalidation) |
| **SEO** | `<title>Beauty & Wellness Blog | Royal Glow Salon & SPA</title>` |
| **JSON-LD** | `LocalBusiness` + `BreadcrumbList` |
| **Canonical** | `https://theroyalglow.in/blog` |

**UI Components:**
- Article list: cards with featured image, title, excerpt (150 chars), publish date, read time
- Pagination or "Load More" button
- Category filter chips (if categories defined in Payload CMS)

**States:**
- Loading: skeleton article cards (6 placeholders)
- Empty: "No articles yet. Check back soon!" (unlikely post-launch)

**Content source:** Payload CMS REST API (`/api/posts?limit=12&page=X`)

---

### 1.7 `/blog/[slug]` — Blog Post

| Property | Detail |
|----------|--------|
| **Title** | `[Article Title] | Royal Glow Blog` |
| **Purpose** | Individual article page with rich structured data for Google. |
| **Rendering** | ISR (1h revalidation) |
| **SEO** | Dynamic `<title>` + `<meta description>` from Payload CMS fields |
| **JSON-LD** | `BlogPosting` + `BreadcrumbList` + `LocalBusiness` |
| **OG Image** | Per-post generated OG image (article title + Royal Glow branding) |
| **Canonical** | `https://theroyalglow.in/blog/[slug]` |

**UI Components:**
- Article header: title (h1), publish date (`<time>`), read time, author
- Rich text body: rendered from Payload CMS rich text field (headings, paragraphs, images, lists)
- Table of contents sidebar (desktop only — sticky)
- Related articles: 2–3 cards at bottom
- CTA banner: "Ready to experience this? Book Now →" linking to `/?book=1`

**States:**
- 404: "Article not found" with link back to `/blog`

---

### 1.8 `/faq` — FAQ

| Property | Detail |
|----------|--------|
| **Title** | FAQ |
| **Purpose** | Frequently asked questions — optimised for Google AI Overviews and FAQ rich results. |
| **Rendering** | SSG (static) |
| **SEO** | `<title>Frequently Asked Questions | Royal Glow Salon & SPA</title>` |
| **JSON-LD** | `FAQPage` + `BreadcrumbList` + `LocalBusiness` |
| **Canonical** | `https://theroyalglow.in/faq` |

**UI Components:**
- Question groups by topic (Booking, Services, Pricing, Membership, Cancellation)
- Accordion pattern: question as `<h3>`, answer revealed on click
- Each answer: 1–3 sentences, answer-first writing pattern (AI-optimised)
- "Still have questions?" CTA at bottom linking to `/contact`

**States:**
- Static — no loading/error states needed (SSG)

**Accessibility:**
- `aria-expanded` on each accordion trigger
- `aria-controls` linking trigger to content panel
- Enter/Space to toggle, no mouse-only interactions

**Offline (PWA):** Cached by service worker

---


## 2. Customer-Facing — Authenticated (Sign-in Required)

These pages require Google OAuth sign-in. Accessible to role `customer` and above. Redirect to `/sign-in` if unauthenticated.

---

### 2.1 `/profile` — My Profile

| Property | Detail |
|----------|--------|
| **Title** | My Profile |
| **Purpose** | View and edit personal details, manage notification preferences and consent. |
| **Rendering** | SSR (auth-gated) |
| **SEO** | `robots: noindex, nofollow` (private page) |

**UI Components:**
- Profile card: avatar (Google profile pic), name, email (read-only, greyed out)
- Editable fields form: name, phone, DOB (date picker, DD/MM/YYYY), gender (select)
- "Member Since" + "Last Updated" timestamps (DD/MM/YYYY format)
- Notification preferences section (toggle switches):
  - Appointment reminders (push + email) — default ON
  - Membership alerts — default ON
  - Marketing emails & offers — respects onboarding consent
- Analytics consent toggle (DPDP Act)
- "Delete My Account" link (leads to support email — DPDP Act right to erasure)
- Save button with form validation

**States:**
- Loading: skeleton form fields
- Saving: button shows spinner, fields disabled
- Success: toast "Profile updated successfully"
- Validation error: inline field errors via `aria-describedby`

**Data source:** `customer_profile` table + Better Auth `user` table

---

### 2.2 `/bookings` — My Bookings

| Property | Detail |
|----------|--------|
| **Title** | My Bookings |
| **Purpose** | View all upcoming and past bookings with status and available actions. |
| **Rendering** | SSR (auth-gated) |
| **SEO** | `robots: noindex, nofollow` |

**UI Components:**
- Tab bar: "Upcoming" (default active) | "Past"
- Booking cards (per booking):
  - Status badge: coloured pill (Pending=amber, Confirmed=green, In Progress=blue, Completed=grey, Cancelled=red, Rejected=red-outline)
  - Booking number: `#BKRS2605H38291`
  - Date + time: `24 May 2026 (Saturday) · 03:30 PM`
  - Services list (truncated to 2, "and X more" if > 2)
  - Total amount: `₹1,300.00`
  - Assigned staff (shown only after confirmation)
- Action buttons per status:
  - Pending: "Edit Services" | "Reschedule" | "Cancel"
  - Confirmed: "Reschedule" | "Cancel"
  - Completed: "View Invoice" | "Book Again"
  - Rejected: "View Reason" | "Book Again"
  - Cancelled: "Book Again"

**States:**
- Loading: skeleton cards (3 placeholders)
- Empty (Upcoming): "No upcoming bookings. Ready for your next Royal Glow moment?" + "Book Now" CTA
- Empty (Past): "No past bookings yet."
- Error: "Unable to load bookings." with retry

**Realtime (Ably):**
- Subscribes to: `customer:{userId}:bookings`
- Live updates: status badge animates on change, new bookings appear, cancelled bookings move sections
- Events: `booking.created`, `booking.status_changed`, `booking.rescheduled`, `booking.cancelled`, `booking.staff_assigned`

**Mobile vs Desktop:**
- Mobile: full-width stacked cards, swipe actions (reschedule/cancel)
- Desktop: table-style list with action buttons inline

**Data source:** `GET /api/bookings` (authenticated)

---

### 2.3 `/bookings/[id]` — Booking Detail

| Property | Detail |
|----------|--------|
| **Title** | Booking Detail |
| **Purpose** | Full detail view of a single booking with status timeline and all associated data. |
| **Rendering** | SSR (auth-gated, ownership check) |
| **SEO** | `robots: noindex, nofollow` |

**UI Components:**
- Status timeline: visual stepper showing all status transitions with timestamps
  - Each step: status name, timestamp, changed by (system/receptionist name)
  - Rejection reason shown inline at rejected step
- Booking info card:
  - Booking number, branch name
  - Date + time + total duration
  - Service type badge (Salon / SPA)
- Services list (detailed):
  - Service name, individual price, duration, assigned staff (after confirmation)
- Payment summary:
  - Subtotal, discount (if offer applied), GST breakdown, total
  - Payment note: "Pay at the salon (Cash / UPI / Card)"
- Staff assignment (after confirmation): name + designation
- Notes section (if any staff notes visible to customer)
- Invoice link (after completion): "View Invoice PDF" button
- Google Maps review prompt (after completion): "Rate your experience →" with Maps link
- Action buttons (context-dependent based on current status)

**States:**
- Loading: skeleton timeline + info card
- 404: "Booking not found" with back link
- Error: "Unable to load booking details." with retry

**Realtime (Ably):**
- Subscribes to: `booking:{bookingId}`
- Live updates: status timeline extends, notes appear, staff assignment shows
- Events: `status.changed`, `note.added`, `service.added`, `service.removed`

**Data source:** `GET /api/bookings/[id]` (authenticated, ownership verified)

---


### 2.4 `/membership` — SPA Membership

| Property | Detail |
|----------|--------|
| **Title** | My SPA Membership |
| **Purpose** | View active membership details, hours balance, session history, and past memberships. |
| **Rendering** | SSR (auth-gated) |
| **SEO** | `robots: noindex, nofollow` |
| **Visibility** | Only shown in navigation if customer has an active or past membership |

**UI Components:**
- Active membership card (if exists):
  - Tier badge: Silver / Gold / Platinum (colour-coded)
  - Membership ID: `#RGMEM26XXXXX`
  - Hours progress bar: visual bar showing used vs remaining (e.g., `████████░░░░ 5 hrs used · 3 hrs remaining`)
  - Numeric breakdown: `X hrs used / Y hrs total / Z hrs remaining`
  - Expiry date: `Valid until: DD/MM/YYYY` with days remaining count
  - Expiry urgency: amber badge if ≤30 days, red badge if ≤7 days
- Session history table:
  - Columns: date, service performed, duration, staff
  - Sorted by most recent first
  - Pagination if > 10 sessions
- Past memberships (collapsed section):
  - Accordion: "Past Memberships (X)" → expandable list
  - Each shows: tier, dates active, hours used/total, status (expired/cancelled)
- No membership state: section not shown in navigation at all

**States:**
- Loading: skeleton card + table rows
- No active membership: "You don't have an active SPA membership" + "Visit us to learn about membership options" + phone number
- Error: "Unable to load membership details." with retry

**Data source:** `spa_membership` + `booking` (where `is_membership_session = true`) tables

---

### 2.5 `/gems` — Gems Catalogue

| Property | Detail |
|----------|--------|
| **Title** | Royal Gems |
| **Purpose** | View gems balance, browse redeemable services, and see transaction history. |
| **Rendering** | SSR (auth-gated) |
| **SEO** | `robots: noindex, nofollow` |

**UI Components:**
- Gems balance hero: large number display with gem icon, e.g., "💎 42 Gems"
- Earn rate info: "Earn 1 gem per ₹100 spent. Gems expire 1 year after earning."
- Expiry warning: if any gems expiring within 30 days, show amber alert banner
- Redeemable services catalogue:
  - Grid of service cards available for gem redemption
  - Each card: service name, gems required, "Redeem" badge
  - Greyed out if customer doesn't have enough gems
- Transaction history (expandable section):
  - Table: date, description (earned/redeemed/expired), amount (+/- gems), balance after
  - Sorted by most recent first

**States:**
- Loading: skeleton balance + card grid
- Zero gems: "You haven't earned any gems yet. Book a service to start earning!" + "Book Now" CTA
- Error: "Unable to load gems." with retry

**Business rules displayed:**
- Cannot combine gems redemption with offers on same booking
- Gems expire 1 year after earning date
- Gems earned: `floor(total_rupees × 0.01)` per paid invoice
- No gems earned on: membership purchases, membership sessions, gem-redemption bookings

**Data source:** `gems_transaction` table + computed balance

---

## 3. Booking Dialog (Overlay — Not a Separate Page)

This is a multi-step dialog that overlays the homepage. It is NOT a route — it's a component triggered by `/?book=1` or the "Book Now" button.

| Property | Detail |
|----------|--------|
| **Trigger** | "Book Now" button on homepage / `/?book=1` deep-link / service card "Book This" button |
| **Mobile UX** | Bottom sheet (slides up from bottom, draggable handle, full height on expand) |
| **Desktop UX** | Centered modal (max-width 600px, backdrop blur, click-outside to close) |
| **Animations** | motion.dev (Framer Motion): slide-up on mobile, scale-in on desktop, step transitions as horizontal slide |
| **Accessibility** | `role="dialog"`, `aria-modal="true"`, focus trapped inside, Escape to close, focus returned to trigger on close |

**Step 1 — Branch + Date + Time Slot:**
- Branch selector: hidden in Phase 1 (auto-selects Rayasandra); future: radio cards
- Name + Email: prefilled from profile (read-only display, not editable)
- Gender: prefilled, editable (select dropdown)
- Date picker: calendar UI, future dates only, holidays/closures greyed out with tooltip
- Time slot grid: available slots as tappable chips, fully-booked slots greyed out with "Full" label
- Slot updates: `aria-live="polite"` announces availability changes

**Step 2 — Choose Categories:**
- Salon / SPA toggle: segmented control (one booking = one type only)
- Category cards: multi-select with checkmarks, icon per category
- Cannot proceed without at least one category selected
- Validation: "Select at least one category" inline error

**Step 3 — Choose Services:**
- Services filtered by selected categories
- SPA 60/90min variants: single card with inline duration toggle
- Multi-select with running total at bottom: "3 services · ₹3,500.00 · ~90 min"
- "Add more" prompt if only 1 service selected (non-blocking)
- Cannot proceed without at least one service selected

**Step 4 — Summary & Confirmation:**
- "Booking Submitted!" status badge (green)
- Selected services list with individual prices
- Total: `₹X,XXX.00` with "Inclusive of 18% GST" label
- Payment note: "Pay at the salon (Cash / UPI / Card)"
- Gems info: "You have X gems — Browse Gems Catalogue →"
- Actions: "Go to Home" | "View My Bookings"
- Confetti animation on successful submit (subtle, motion.dev)

**Error states per step:**
- Step 1: "Please select a date and time" / "This slot is no longer available" (real-time conflict)
- Step 3: "Please select at least one service"
- Submit failure: "Something went wrong. Please try again." with retry button

**Analytics events:**
- PostHog: `booking_started` (dialog open), `booking_step_completed` (each step), `booking_request_submitted` (final), `booking_abandoned` (dialog closed before step 4)
- Meta Pixel: `InitiateCheckout` (dialog open)

---


## 4. Auth Flow Pages

Minimal layout — centered card, no main navigation. Focused on conversion.

---

### 4.1 `/sign-in` — Sign In

| Property | Detail |
|----------|--------|
| **Title** | Sign In |
| **Purpose** | Single entry point for authentication via Google OAuth. |
| **Rendering** | SSR |
| **SEO** | `robots: noindex, nofollow` |
| **Layout** | Centered card on gradient/brand background, Royal Glow logo above card |

**UI Components:**
- Royal Glow logo (centered, above card)
- Card:
  - Heading: "Sign in to Royal Glow"
  - Subheading: "Use your Google account to continue"
  - "Sign in with Google" button (Google branded, full-width)
  - Legal text below: "By signing in, you agree to our [Privacy Policy] and [Terms of Service]"
- No email/password fields (Google OAuth only)

**Pre-redirect behaviour:**
- Stores in `sessionStorage`: `book=1` flag, `utm_source`, all UTM fields, `leadId`, `service` slug
- These survive the OAuth redirect and are read on `/onboarding` or homepage return

**States:**
- Idle: button active
- Redirecting: button disabled with spinner, "Redirecting to Google..."
- Error: "Sign-in failed. Please try again." with retry button (e.g., popup blocked)

**Mobile vs Desktop:**
- Mobile: card full-width with bottom padding
- Desktop: card centered (max-width 400px) with decorative background

---

### 4.2 `/onboarding` — Welcome Setup

| Property | Detail |
|----------|--------|
| **Title** | Welcome to Royal Glow |
| **Purpose** | First-time user data collection — name, phone, DOB, gender, consent. |
| **Rendering** | SSR (auth-gated, shows only for users without a completed profile) |
| **SEO** | `robots: noindex, nofollow` |
| **Redirect** | If profile already complete → redirect to `/` immediately |

**UI Components:**
- Welcome header: "Welcome to Royal Glow, [First Name from Google]! 👑"
- Form fields:
  - Name: prefilled from Google, editable (`<input>` with `<label>`)
  - Email: prefilled from Google, read-only (greyed out, `disabled`)
  - Phone: pre-populated from Google People API if available, else empty (`tel` input, validated Indian mobile format)
  - Date of Birth: date picker (DD/MM/YYYY format, Indian standard)
  - Gender: select dropdown (Male / Female / Other / Prefer not to say)
- Consent section (fieldset with legend "Privacy & Preferences"):
  - ☑ Required checkbox: "I agree to the Privacy Policy..." (links to `/privacy`) — cannot submit without
  - ☐ Optional checkbox: "Help us improve Royal Glow — allow anonymous usage analytics"
  - ☐ Optional checkbox: "Send me offers, updates & promotions via email and notifications"
- Submit button: "Let's Go!" (primary, full-width)

**On submit:**
- `POST /api/onboarding/complete`
- Acquisition source assigned from `sessionStorage` first-touch context (organic / gmb / walkin / meta_ad lead)
- Consent choices written to `rgss_cookie_consent` in localStorage
- Cookie consent banner suppressed for categories already consented to
- Meta CAPI: `CompleteRegistration` event fired
- Redirect to `/` (if `book=1` in sessionStorage, homepage auto-opens dialog)

**States:**
- Validation errors: inline per field (phone format, DOB required, privacy consent required)
- Submitting: button spinner, fields disabled
- Success: redirect to `/` (no success page — instant transition)

**Analytics events:**
- PostHog: `onboarding_completed` with gender, has_phone, consent_analytics, consent_marketing
- Meta Pixel: `CompleteRegistration` (browser) + CAPI (server)

---

## 5. Landing Pages (No Navigation)

Distraction-free. No header, no footer, no navigation links. Single conversion goal.

---

### 5.1 `/book` — Ad Landing Page (Lead Capture)

| Property | Detail |
|----------|--------|
| **Title** | Book Now — Royal Glow Salon & SPA |
| **Purpose** | Dedicated lead capture for Meta/Instagram ad traffic. Creates a `lead` row, then funnels to booking dialog. |
| **Rendering** | SSR |
| **SEO** | `robots: noindex, nofollow` (excluded from sitemap — ad traffic only) |
| **Layout** | Zero navigation. Brand-focused. Single form. |

**IMPORTANT: Never link to this page from homepage, GMB, Google Maps, or in-store QR. Only Meta/Instagram ads should point here.**

**UI Components:**
- Trust signals (above fold):
  - Royal Glow wordmark/logo
  - "⭐ 4.9 · 86 reviews · Bengaluru" (social proof)
- Heading: "Tell us what you're looking for"
- Lead capture form (3 fields only):
  - Name: text input
  - Phone: tel input (Indian mobile validation)
  - Service interested in: dropdown (Haircut, Facial, Waxing, Massage, SPA, Bridal, Other)
- CTA button: **"Continue to Booking"** (not "Submit" — tells user what happens next)
- Minimal footer: address + phone only (no nav links)

**Post-submit flow:**
1. `POST /api/leads` → lead row created with `source = 'meta_ad'`, UTM fields from URL
2. Meta Pixel: `Lead` event (browser) + Meta CAPI: `Lead` event (server) — same `eventId` for deduplication
3. Brief "Thank you!" animation (1.5s)
4. Redirect to `/?book=1&leadId={lead.id}` → homepage booking dialog opens with lead context

**No sign-in required for lead capture** — cold ad traffic won't sign in. Sign-in happens when they proceed into the booking dialog.

**States:**
- Idle: form active
- Submitting: button spinner, fields disabled
- Validation: inline errors (phone format, name required)
- Success: confetti + "Taking you to booking..." → redirect
- Error: "Something went wrong. Call us: +91 63601 35720" with phone link

**UTM handling:**
- URL example: `/book?utm_source=meta&utm_campaign=facial_may&utm_content=carousel_1`
- All UTM params saved to `lead` row for campaign attribution
- `fbc` and `fbp` cookies read from request for Meta CAPI

**Meta Pixel events on this page:**
- `PageView`: fires on load (auto)
- `Lead`: fires after successful form submit

**Mobile vs Desktop:**
- Mobile: full-screen card, form centered vertically, thumb-friendly input sizing (min 44px targets)
- Desktop: centered narrow card (max-width 480px) with premium background

---

## 6. Legal Pages (Static/SSG)

Customer layout (header + footer). Built once at build time.

---

### 6.1 `/privacy` — Privacy Policy

| Property | Detail |
|----------|--------|
| **Title** | Privacy Policy |
| **Rendering** | SSG |
| **SEO** | `<title>Privacy Policy | Royal Glow Salon & SPA</title>` |
| **JSON-LD** | `BreadcrumbList` |
| **Canonical** | `https://theroyalglow.in/privacy` |
| **Requirement** | Mandatory — India Digital Personal Data Protection Act 2023 |

**Content covers:** data collected, purpose, storage (Indian servers — Neon Singapore), sharing policy, retention, right to access/delete, cookie usage, third-party services (PostHog, Clarity, Meta Pixel, Ably, Resend, Brevo).

---

### 6.2 `/terms` — Terms of Service

| Property | Detail |
|----------|--------|
| **Title** | Terms of Service |
| **Rendering** | SSG |
| **SEO** | `<title>Terms of Service | Royal Glow Salon & SPA</title>` |
| **Canonical** | `https://theroyalglow.in/terms` |

**Content covers:** service usage terms, booking rules, account responsibilities, intellectual property, liability limitations, governing law (India), dispute resolution.

---

### 6.3 `/refund-policy` — Refund & Cancellation Policy

| Property | Detail |
|----------|--------|
| **Title** | Refund & Cancellation Policy |
| **Rendering** | SSG |
| **SEO** | `<title>Refund & Cancellation Policy | Royal Glow Salon & SPA</title>` |
| **Canonical** | `https://theroyalglow.in/refund-policy` |

**Content covers:**
- Free cancellation: >4 hours before appointment
- Late cancellation (<4h): tagged in CRM, no fee
- Reschedule: max 2 per booking, min 1h before
- No-show consequences (tiered — see features.md)
- Salon-initiated cancellation: apology + priority rebooking
- Membership sessions: hours not deducted if salon cancels
- No online payments = no refund processing needed at launch

---


## 7. Admin Portal — `/admin/*`

All admin routes are RBAC-gated. Unauthenticated or under-privileged requests redirect to `/sign-in`. Layout: persistent sidebar navigation (collapsible on mobile) + top bar with user name, role badge, and notification bell.

**Shared admin layout components:**
- Sidebar nav: grouped sections (Dashboard, Bookings, CRM, Leads, Staff, Schedule, Services, Offers, Memberships, Billing, Reports, Settings, Branches, Users, Integrations, Logs) — items shown/hidden based on role
- Top bar: breadcrumbs, user avatar + name + role, notification bell (Ably-powered real-time count)
- Mobile: sidebar collapses to hamburger menu overlay
- Command palette: `Cmd+K` / `Ctrl+K` to search pages, customers, bookings by number
- Toast notifications: bottom-right stack for async operation confirmations

---

### 7.1 `/admin` — Dashboard

| Property | Detail |
|----------|--------|
| **Title** | Admin Dashboard |
| **Min. Role** | Receptionist (Staff sees limited "My Schedule" view) |
| **Purpose** | Today's operational overview with pending actions and quick-access buttons. |

**UI Components (Receptionist+ view):**
- KPI cards row: Pending Bookings (count + badge), Today's Revenue (₹), Today's Appointments (count), Stale Leads (count)
- Today's booking feed: chronological list of today's appointments (time, customer, services, status, staff)
- Pending actions panel:
  - Unreviewed bookings (pending status) — clickable, links to booking detail
  - Leave requests awaiting approval
  - Stale leads (48h+ without contact)
  - Stale bookings (2h+ in pending without review)
- Quick-action buttons: "Create Walk-in" | "View Schedule" | "Lead Pipeline"
- Recent activity feed: last 10 system events (booking confirmed, invoice generated, lead captured, etc.)

**UI Components (Staff-only view — Stylist/Therapist):**
- Today's assigned appointments: customer first name, service, time, duration
- Next 7 days upcoming appointments
- "Submit Leave Request" button
- Cannot see: other staff bookings, customer contact details, prices, invoices, revenue, CRM data

**States:**
- Loading: skeleton KPI cards + feed rows
- Empty (no bookings today): "No appointments today. Enjoy the quiet!" with schedule link

**Realtime (Ably):**
- Subscribes to: `admin:bookings`
- Live updates: new booking appears in pending queue, status changes animate, revenue KPI updates
- Events: `booking.new`, `booking.status_changed`, `booking.walkin_created`

---

### 7.2 `/admin/bookings` — All Bookings

| Property | Detail |
|----------|--------|
| **Title** | All Bookings |
| **Min. Role** | Receptionist |
| **Purpose** | Full booking list with comprehensive filtering and search. |

**UI Components:**
- Filters bar (sticky):
  - Status multi-select: pending, confirmed, in_progress, completed, cancelled, rejected, no_show
  - Date range picker
  - Staff filter (dropdown)
  - Service type toggle: All / Salon / SPA
  - Walk-in toggle
  - Search: by booking number, customer name, phone
- Data table:
  - Columns: Booking #, Customer, Date/Time, Services (truncated), Status (badge), Staff, Total, Type, Actions
  - Sortable columns: date, status, total
  - Row click → navigates to `/admin/bookings/[id]`
- Pagination: 25 per page with page navigation
- Bulk actions: none (each booking handled individually)

**States:**
- Loading: table skeleton rows
- Empty (with filters): "No bookings match your filters." with clear-filters button
- Empty (no filters): "No bookings yet." (unlikely in production)

**Realtime (Ably):**
- Subscribes to: `admin:bookings`
- Live updates: new rows appear at top, status badges animate in-place

---

### 7.3 `/admin/bookings/new` — Create Walk-in

| Property | Detail |
|----------|--------|
| **Title** | Create Walk-in Booking |
| **Min. Role** | Receptionist |
| **Purpose** | Create a booking for a customer who is physically present. Skips pending → directly confirmed. |

**UI Components:**
- Customer search/select: searchable dropdown (name/phone/email) + "New Customer" option
- Service selector: Salon/SPA toggle → category → multi-select services
- Staff assignment: dropdown per service (required — walk-in gets immediate assignment)
- Time: defaults to "now", adjustable
- Notes field: optional text area
- Submit button: "Create Walk-in" → booking created with status `confirmed`

**Business rule:** Walk-in no-shows do NOT count toward no-show tier (customer is already present).

**States:**
- Validation: customer required, at least 1 service, staff assignment required
- Submitting: button spinner
- Success: redirect to `/admin/bookings/[newId]` with success toast

---

### 7.4 `/admin/bookings/[id]` — Booking Detail (Admin)

| Property | Detail |
|----------|--------|
| **Title** | Booking Detail |
| **Min. Role** | Receptionist |
| **Purpose** | Full booking management: approve, reject, assign staff, change status, checkout, add notes. |

**UI Components:**
- Status timeline (same as customer view but with admin context — who changed what)
- Customer info card: name, phone (click-to-call), email, CRM tags, no-show tier badge
- Booking info: number, branch, date, time, type (Salon/SPA), walk-in flag
- Services panel:
  - Service list with staff assignment dropdowns (editable while pending/confirmed)
  - Add/remove services (while pending)
  - Individual prices
- Action buttons (context-dependent):
  - Pending: "Approve" (green) | "Reject" (red, opens reason modal)
  - Confirmed: "Mark In Progress" | "Reschedule" | "Cancel" | "Mark No-Show"
  - In Progress: "Mark Completed" (opens checkout flow)
  - Completed: "View Invoice" | "Resend Invoice Email"
- Checkout flow (on "Mark Completed"):
  - Apply offer dropdown (optional, max 1 per customer per day)
  - Payment method selector: Cash / UPI / Card
  - Invoice preview: line items, GST breakdown, total
  - "Complete & Generate Invoice" button
- Notes section:
  - Timeline of staff notes (author, timestamp, text)
  - "Add Note" text input
- Status history log: full audit trail (who, what, when, reason)
- Rejection modal: reason text input (required when rejecting)

**States:**
- Loading: skeleton panels
- 404: "Booking not found" with back link
- Checkout submitting: invoice generation spinner (may take 2–3s for PDF)

**Realtime (Ably):**
- Subscribes to: `booking:{bookingId}`
- Live updates: notes appear, status changes (if another admin acts simultaneously)

**Connected actions on complete:**
- Invoice generated (PDF via Render API → stored in R2)
- Invoice emailed to customer (Resend with PDF attachment)
- Gems awarded: `floor(total_rupees × 0.01)` (unless membership session or gem redemption)
- Meta CAPI: `Purchase` event fired (with revenue value)
- Brevo: customer attributes updated (LAST_VISIT_DATE, TOTAL_VISITS, TOTAL_SPEND_PAISE)

---


### 7.5 `/admin/waitlist` — Waitlist

| Property | Detail |
|----------|--------|
| **Title** | Waitlist |
| **Min. Role** | Receptionist |
| **Purpose** | Manage customers waiting for fully-booked slots. Promote to booking when slot opens. |

**UI Components:**
- Waitlist entries table: customer name, requested date/time, services, date added, status
- "Promote to Booking" button: creates a booking from waitlist entry, sends notification to customer
- "Remove" button: removes from waitlist with optional notification
- Filter: by date, service type

**States:**
- Empty: "No one on the waitlist right now."

---

### 7.6 `/admin/customers` — Customer List (CRM)

| Property | Detail |
|----------|--------|
| **Title** | Customer List |
| **Min. Role** | Receptionist |
| **Purpose** | Search and browse all customers with CRM tags, lifetime value, and visit data. |

**UI Components:**
- Search bar: name, phone, email (instant search with debounce)
- Tag filter: multi-select chips (VIP, Frequent, Inactive, No-Show Risk, custom tags)
- Sort options: LTV (descending), Visit Count, No-Show Count, Last Visit, Signup Date
- Customer table:
  - Columns: Name, Phone, Email, Visits, LTV (₹), Last Visit, Tags, Status
  - Row click → navigates to `/admin/customers/[id]`
- Pagination: 50 per page

**States:**
- Loading: table skeleton
- Empty (with search): "No customers found matching '[query]'"
- Empty (no customers): N/A (always seeded data)

---

### 7.7 `/admin/customers/[id]` — Customer Profile (CRM)

| Property | Detail |
|----------|--------|
| **Title** | Customer Profile |
| **Min. Role** | Receptionist |
| **Purpose** | Complete 360° customer view with all historical data, CRM notes, and actionable insights. |

**UI Components:**
- Profile header: avatar, name, phone (click-to-call), email, gender, DOB, member since
- CRM tags: editable tag chips (VIP, Frequent, Inactive, No-Show Risk) + "Add Tag" button
- Acquisition source badge: organic / gmb / walkin / meta_ad (with UTM campaign if applicable)
- KPI cards row: Total Visits, Lifetime Value (₹), Avg Spend/Visit, No-Show Count, Gems Balance
- No-show tier indicator: if tier 4+ reached, red badge with "Requires Manager Approval" label
- Tabs:
  - **Bookings**: full booking history table (status, date, services, total, staff)
  - **Invoices**: all invoices (type badge: service/membership_purchase/membership_session, date, total, PDF link)
  - **Membership**: active/past memberships with hours breakdown
  - **Gems**: transaction history (earned/redeemed/expired)
  - **Notes**: timeline of staff notes (author, date, text) + "Add Note" input
- Quick actions: "Create Booking" | "View Lead" (if converted from lead)

**States:**
- Loading: skeleton header + tabs
- 404: "Customer not found"

---

### 7.8 `/admin/leads` — Lead Pipeline

| Property | Detail |
|----------|--------|
| **Title** | Lead Pipeline |
| **Min. Role** | Receptionist |
| **Purpose** | Manage Meta/Instagram campaign leads through the conversion pipeline. |

**UI Components:**
- View toggle: Kanban board | Table view
- Kanban columns: New → Contacted → Follow-up → Booked → Won / Lost
  - Each card: name, phone, service interest, source campaign, days since capture, assigned staff
  - Drag-and-drop between columns (updates status)
- Table view: sortable columns (name, phone, service, status, campaign, created, assigned to)
- Filters: campaign, date range, assigned staff, status
- Lead count badges on each column header
- "Stale" indicator: red dot on leads not contacted within 48h
- Click any lead → navigates to `/admin/leads/[id]`

**States:**
- Loading: skeleton kanban cards
- Empty: "No leads captured yet. Campaign leads from Meta/Instagram will appear here."

---

### 7.9 `/admin/leads/[id]` — Lead Detail

| Property | Detail |
|----------|--------|
| **Title** | Lead Detail |
| **Min. Role** | Receptionist |
| **Purpose** | Full lead information with notes, attribution, and conversion tracking. |

**UI Components:**
- Lead info card: name, phone (click-to-call + WhatsApp deep link), service interested in
- Attribution panel: UTM source, campaign, content, ad set (if from Meta webhook)
- Status selector: dropdown to change pipeline stage
- Assigned to: dropdown to assign receptionist
- AiSensy WhatsApp link: "Open in AiSensy" button (deep link to WhatsApp thread)
- Converted booking link: if lead converted → link to `/admin/bookings/[id]`
- Notes timeline: chronological notes (call notes, preferences, follow-up reminders) + "Add Note" input
- Quick actions: "Create Booking from Lead" | "Mark Won" | "Mark Lost" (with reason)

**States:**
- Loading: skeleton card
- 404: "Lead not found"

---

### 7.10 `/admin/staff` — Staff List

| Property | Detail |
|----------|--------|
| **Title** | Staff Management |
| **Min. Role** | Manager |
| **Purpose** | View all staff members with designation, status, and schedule summary. |

**UI Components:**
- Staff cards/table: name, photo, designation (Stylist/Therapist/Receptionist/Manager), active status, today's booking count
- Filter: by designation, active/inactive
- Row click → navigates to `/admin/staff/[id]`
- "Add Staff" button → navigates to `/admin/staff/new`

---

### 7.11 `/admin/staff/new` — Add Staff

| Property | Detail |
|----------|--------|
| **Title** | Add Staff Member |
| **Min. Role** | Manager |
| **Purpose** | Create a new staff profile: link to user account, assign designation and services. |

**UI Components:**
- User selector: search existing users by name/email (must have an account)
- Designation: select (Stylist / Therapist / Receptionist / Manager)
- Bio/specialization: text area
- Services they can perform: multi-select from service catalogue
- Initial schedule: weekly grid (select working days/hours)
- Submit button: "Add Staff Member"

---

### 7.12 `/admin/staff/[id]` — Staff Profile

| Property | Detail |
|----------|--------|
| **Title** | Staff Profile |
| **Min. Role** | Manager |
| **Purpose** | Full staff detail with schedule, leave history, performance metrics, and assigned services. |

**UI Components:**
- Profile header: photo, name, designation, active status toggle
- Tabs:
  - **Schedule**: weekly grid showing working hours, current week highlighted
  - **Leave History**: table of all leave requests (date, type, status, reason)
  - **Performance**: KPI cards — bookings completed, revenue attributed, utilisation rate (booked/available hours)
  - **Services**: list of services this staff member can perform (editable)
- Quick actions: "Edit Schedule" | "View Today's Bookings"

---


### 7.13 `/admin/schedule` — Staff Schedule

| Property | Detail |
|----------|--------|
| **Title** | Staff Schedule |
| **Min. Role** | Receptionist |
| **Purpose** | Weekly/daily calendar view of all staff availability, booked slots, and leave. |

**UI Components:**
- View toggle: Daily | Weekly
- Date navigation: previous/next arrows + date picker
- Schedule grid: rows = staff members, columns = time slots (30-min increments)
  - Booked slots: filled with booking colour (Salon=purple, SPA=teal) + customer first name
  - Available slots: open/white
  - Leave/off: greyed out with "Leave" label
  - Buffer time: hatched pattern between bookings
- Staff column: name + designation + avatar
- Click on booked slot → navigates to booking detail
- Click on empty slot → "Create Walk-in" prefilled with staff + time

**States:**
- Loading: grid skeleton with time headers
- Empty day: all slots available (no bookings)

**Realtime (Ably):**
- Subscribes to: `admin:schedule:{YYYY-MM-DD}` (selected date)
- Live updates: slots fill/release as bookings are made/cancelled, staff marked off
- Events: `slot.booked`, `slot.released`, `staff.marked_off`, `leave.approved`

---

### 7.14 `/admin/leave` — Leave Management

| Property | Detail |
|----------|--------|
| **Title** | Leave Management |
| **Min. Role** | Receptionist (Staff sees only "My Leave" view) |
| **Purpose** | Review, approve/reject leave requests. View staff leave calendar. |

**UI Components (Receptionist+ view):**
- Pending requests queue: cards with staff name, date, leave type, reason, "Approve" / "Reject" buttons
  - Warning badge: if staff has confirmed bookings on requested date
  - Rejection requires reason text input
- Staff leave calendar: monthly view showing approved leaves per staff (colour-coded by staff)
- "Mark Day-Off" button: directly mark a staff member absent for today (same-day, no pending step)
- Filter: by staff member, leave type, status

**UI Components (Staff-only view):**
- "Submit Leave Request" form: date picker, leave type (Sick/Casual/Personal/Other), reason
- Own leave history: table of past requests (date, type, status, reason, rejection reason if any)
- Pending requests: "Withdraw" button available (before review only)

**States:**
- Loading: skeleton queue
- Empty (no pending): "No pending leave requests. All caught up!"

**Realtime (Ably):**
- Subscribes to: `admin:leave`
- Live updates: new requests appear without refresh, withdrawn requests disappear
- Events: `leave.requested`, `leave.withdrawn`

---

### 7.15 `/admin/services` — All Services

| Property | Detail |
|----------|--------|
| **Title** | Service Catalogue |
| **Min. Role** | Manager |
| **Purpose** | Manage all services grouped by category. Toggle active/inactive, reorder display. |

**UI Components:**
- Category sections: Salon categories + SPA categories (collapsible)
- Service cards within each category:
  - Name, price (₹), duration, active/inactive toggle, gems config
  - Drag handle for reorder (within category)
- "Add Service" button → navigates to `/admin/services/new`
- Click service → navigates to `/admin/services/[id]`
- Inactive services: dimmed with "Inactive" badge (hidden from customer-facing pages)

---

### 7.16 `/admin/services/new` — Add Service

| Property | Detail |
|----------|--------|
| **Title** | Add New Service |
| **Min. Role** | Manager |

**UI Components:**
- Form fields: name, category (select), price (₹, GST-inclusive), duration (minutes), buffer time, description
- Gems config: "Redeemable with gems" toggle + gems required field, "Earns gems" toggle
- Image upload: drag-and-drop or file picker (uploaded to R2)
- Staff assignment: multi-select staff who can perform this service
- Active toggle: default ON
- Submit: "Create Service"

---

### 7.17 `/admin/services/[id]` — Edit Service

| Property | Detail |
|----------|--------|
| **Title** | Edit Service |
| **Min. Role** | Manager |

**UI Components:** Same form as "Add Service" but prefilled with current values. Additional:
- "Deactivate" button (soft-delete — hides from customers, preserves historical bookings)
- Booking count: "Used in X bookings" (read-only stat)

---

### 7.18 `/admin/offers` — All Offers

| Property | Detail |
|----------|--------|
| **Title** | Offers & Promotions |
| **Min. Role** | Manager |
| **Purpose** | List all offers: active, scheduled (future start), expired. |

**UI Components:**
- Status tabs: Active | Scheduled | Expired
- Offer cards: name, type badge (Percentage/Flat/Combo), discount value, linked services, validity dates, redemption count
- "Create Offer" button → navigates to `/admin/offers/new`
- Click offer → navigates to `/admin/offers/[id]`

---

### 7.19 `/admin/offers/new` — Create Offer

| Property | Detail |
|----------|--------|
| **Title** | Create Offer |
| **Min. Role** | Manager |

**Form fields:** name, type (percentage/flat/combo), discount value, linked services (multi-select), start date, end date, terms text, max redemptions (optional).

---

### 7.20 `/admin/offers/[id]` — Edit Offer

| Property | Detail |
|----------|--------|
| **Title** | Edit Offer |
| **Min. Role** | Manager |

**Additional vs create:** redemption count (read-only), "Deactivate" button, cannot edit after expiry (read-only view).

---

### 7.21 `/admin/memberships` — All Memberships

| Property | Detail |
|----------|--------|
| **Title** | SPA Memberships |
| **Min. Role** | Receptionist |
| **Purpose** | List all SPA memberships with status, tier, and customer info. |

**UI Components:**
- Filters: status (Active/Expired/Cancelled), tier (Silver/Gold/Platinum), customer search
- Membership table: customer name, membership ID, tier badge, hours used/remaining, expiry date, status badge
- Row click → navigates to `/admin/memberships/[id]`
- "Create Membership" button → navigates to `/admin/memberships/new`

---

### 7.22 `/admin/memberships/new` — Create Membership

| Property | Detail |
|----------|--------|
| **Title** | Create SPA Membership |
| **Min. Role** | Receptionist |

**UI Components:**
- Customer selector: searchable dropdown
- Tier selector: Silver / Gold / Platinum (radio cards with defaults shown)
- Hours: prefilled from tier default, **fully overridable** (for negotiated deals)
- Price: prefilled from tier default, **fully overridable**
- Start date: defaults to today, adjustable
- Expiry: auto-calculated display (`start_date + validity_days`)
- Payment method: Cash / UPI / Card
- Submit: "Create Membership" → generates `membership_purchase` invoice + emails customer

---

### 7.23 `/admin/memberships/[id]` — Membership Detail

| Property | Detail |
|----------|--------|
| **Title** | Membership Detail |
| **Min. Role** | Receptionist |

**UI Components:**
- Membership header: ID, tier badge, customer name (link to CRM profile), status badge
- Hours progress bar: visual + numeric (used / total / remaining)
- Expiry: date + days remaining + urgency colour
- Session history table: date, service, duration, staff
- Actions:
  - "Record Session" button: opens modal (select services, confirm duration, deduct hours)
  - "Cancel Membership" button (Manager+ only): confirmation dialog with reason
- Invoice link: link to the original `membership_purchase` invoice

---


### 7.24 `/admin/billing` — All Invoices

| Property | Detail |
|----------|--------|
| **Title** | Billing & Invoices |
| **Min. Role** | Receptionist |
| **Purpose** | Browse all invoices with filtering by type, date, and payment method. |

**UI Components:**
- Filters: type (service / membership_purchase / membership_session), date range, payment method (Cash/UPI/Card), customer search
- Invoice table:
  - Columns: Invoice #, Customer, Type badge, Date, Total (₹), Payment Method, Status
  - Row click → navigates to `/admin/billing/[id]`
- Export button: "Export CSV" for accountant/CA use (filtered data)
- Pagination: 50 per page

---

### 7.25 `/admin/billing/[id]` — Invoice Detail

| Property | Detail |
|----------|--------|
| **Title** | Invoice Detail |
| **Min. Role** | Receptionist |
| **Purpose** | Full invoice view with line items, GST breakdown, PDF preview, and email actions. |

**UI Components:**
- Invoice header: number (#INV1262XXXXX), date, type badge, status
- Customer info: name, email, phone
- Line items table:
  - Columns: Service (snapshot name), Staff (snapshot), Duration, Price (₹)
  - Snapshots: prices and names frozen at time of invoice (historical accuracy)
- Totals section:
  - Subtotal (base amount)
  - Discount (if offer applied — offer name + amount)
  - GST 18% (SAC 999721)
  - **Total (₹ GST-inclusive)**
  - Amount in words: "Rupees X Only"
- Payment info: method (Cash/UPI/Card), received by (receptionist name)
- Gems awarded: "+X gems" (if applicable)
- PDF preview: embedded viewer or "Download PDF" button
- Actions: "Resend Email" button (re-sends via Resend with PDF attachment), "Download PDF"
- Linked booking: link to `/admin/bookings/[id]`

---

### 7.26 `/admin/reports` — Reports Overview

| Property | Detail |
|----------|--------|
| **Title** | Reports & Analytics |
| **Min. Role** | Manager |
| **Purpose** | Top-level KPI dashboard with links to detailed report pages. |

**UI Components:**
- KPI cards: Today's Revenue, This Week's Bookings, Top Service (this month), Busiest Slot, New Customers (this month)
- Quick charts: revenue trend (last 7 days sparkline), booking volume (last 7 days)
- Report links grid: cards for each sub-report (Financial, Salon, SPA, Staff, Leads) with icon + description

---

### 7.27 `/admin/reports/financial` — Financial Report

| Property | Detail |
|----------|--------|
| **Title** | Financial Report |
| **Min. Role** | Manager |

**UI Components:**
- Date range selector: presets (Today, This Week, This Month, Last Month, Custom)
- Revenue chart: daily/monthly line/bar chart
- GST summary table: month, taxable amount, GST collected, total
- Payment method breakdown: pie chart (Cash vs UPI vs Card) + table with totals
- Daily summary table: date, booking count, revenue, avg transaction value
- Export: "Export for CA" button (CSV with GST-ready columns)

---

### 7.28 `/admin/reports/salon` — Salon Analytics

| Property | Detail |
|----------|--------|
| **Title** | Salon Analytics |
| **Min. Role** | Manager |

**UI Components:**
- Service category performance: bar chart (revenue per category)
- Most booked services: ranked list with count + revenue
- Revenue by individual service: sortable table
- Category trends: line chart over time (weekly/monthly)
- Date range filter

---

### 7.29 `/admin/reports/spa` — SPA Analytics

| Property | Detail |
|----------|--------|
| **Title** | SPA Analytics |
| **Min. Role** | Manager |

**UI Components:**
- Membership tier distribution: donut chart (Silver/Gold/Platinum)
- Membership utilisation rates: avg % hours used before expiry
- Session frequency: avg sessions per member per month
- Revenue split: memberships purchased vs per-session SPA income
- Forfeited hours: total hours lost to expiry (waste metric)
- Active vs expired memberships count

---

### 7.30 `/admin/reports/staff` — Staff Performance

| Property | Detail |
|----------|--------|
| **Title** | Staff Performance |
| **Min. Role** | Manager |

**UI Components:**
- Staff comparison table: name, bookings completed, revenue attributed, utilisation rate (%), avg rating signal
- Utilisation chart: booked hours / available hours per staff (bar chart)
- Revenue per staff: who generates the most revenue
- Date range filter
- Sort by any column

---

### 7.31 `/admin/reports/leads` — Lead Analytics

| Property | Detail |
|----------|--------|
| **Title** | Lead Analytics |
| **Min. Role** | Manager |

**UI Components:**
- Pipeline funnel visualisation: New → Contacted → Follow-up → Booked → Won (with drop-off %)
- Lead conversion rate: % of leads that became bookings
- Revenue per Meta campaign: table showing campaign name, spend (manual input), leads, bookings, revenue, ROAS
- Source comparison: chart comparing meta_ad vs organic vs gmb vs walkin
- Cost per lead / cost per acquisition metrics
- Date range filter

---

### 7.32 `/admin/settings` — System Settings

| Property | Detail |
|----------|--------|
| **Title** | Settings |
| **Min. Role** | Manager |

**UI Components:**
- Salon info section: business name, GST number (GSTIN), registered address, phone, email
- Business hours table: per-day open/close times (editable)
- Policy config keys (editable):
  - Cancellation window (hours): default 4
  - Max reschedules per booking: default 2
  - No-show threshold for manager approval: default 4
  - Consecutive completed to clear no-show flag: default 3
- Gems config:
  - Earn rate: gems per ₹100 (default 1)
  - Expiry days: default 365
- Membership tier defaults table: tier name, default hours, default price, default validity days
- Save button per section

---

### 7.33 `/admin/branches` — Branch Management

| Property | Detail |
|----------|--------|
| **Title** | Branch Management |
| **Min. Role** | Owner |

**UI Components:**
- Branch cards: name, address (truncated), status badge (operational/temporarily_closed/opens_soon/shutdown), primary flag
- "Add Branch" button (opens form)
- Click branch → navigates to `/admin/branches/[id]`

---

### 7.34 `/admin/branches/[id]` — Edit Branch

| Property | Detail |
|----------|--------|
| **Title** | Edit Branch |
| **Min. Role** | Owner |

**Form fields:** branch number, code (2-char), name, address (line1, line2, city, state, pincode), phone, email, Google Maps URL, Place ID, GPS (lat/lng), status (select), close reason (shown if temporarily_closed), opening date, primary toggle.

---

### 7.35 `/admin/users` — User Management

| Property | Detail |
|----------|--------|
| **Title** | User Management |
| **Min. Role** | Owner |
| **Purpose** | Manage all user accounts, roles, and access. |

**UI Components:**
- Filters: role (Customer/Staff/Receptionist/Manager/Owner/Developer), status (active/suspended/banned), signup date range
- User table: name, email, role badge, status, signup date, last active
- Row actions: "Change Role" (dropdown respecting hierarchy), "Suspend", "Ban", "View Sessions"
- Search: by name, email, phone
- Pagination: 50 per page

**Business rules:**
- Cannot assign a role higher than your own
- Cannot modify your own role
- Developer can assign Owner; Owner can assign Manager; Manager can assign Receptionist/Staff

---

### 7.36 `/admin/integrations` — Integrations (Developer Only)

| Property | Detail |
|----------|--------|
| **Title** | Integrations |
| **Min. Role** | Developer |

**UI Components:**
- Integration cards (read/edit):
  - Ably: connection status, channel count, last event timestamp
  - AiSensy: webhook URL, last webhook received, connection test button
  - Meta Pixel/CAPI: Pixel ID, last event fired, event count (24h), event match quality score
  - Sentry: DSN (masked), error count (24h), link to Sentry dashboard
  - BetterStack: heartbeat statuses, last pings, link to status page
  - Resend: domain verification status, emails sent (24h)
  - Brevo: API status, subscriber count, last campaign sent

---

### 7.37 `/admin/logs` — Error Logs (Developer Only)

| Property | Detail |
|----------|--------|
| **Title** | Error Logs |
| **Min. Role** | Developer |

**UI Components:**
- Filters: severity (error/warning/info), date range, route/endpoint
- Error list: timestamp, severity badge, error message (truncated), route, count (if grouped)
- Click error → expanded view with full stack trace, breadcrumbs, user context, request payload
- Source: Sentry API (fetched on-demand, not stored locally)
- "Open in Sentry" external link per error

---


## 8. API Routes — `/api/*`

Thin layer: parse request → validate with Zod → delegate to business logic → return JSON response. All responses follow consistent shape: `{ success: boolean, data?: T, error?: { code, message } }`.

---

### 8a. Authentication

| Route | Method | Summary | Auth |
|-------|--------|---------|------|
| `/api/auth/[...betterauth]` | ALL | Better Auth catch-all: Google OAuth sign-in, callback, session check, sign-out, CSRF token generation. | No (handles auth itself) |

---

### 8b. Customer-Facing API

| Route | Method | Summary | Auth | Cache |
|-------|--------|---------|------|-------|
| `/api/services` | GET | All service categories + services. Returns: `{ categories: [{ name, services: [{ id, name, slug, pricePaise, durationMin, category, active }] }] }` | No | Cloudflare KV (5-min TTL) |
| `/api/services/[slug]` | GET | Single service detail by slug. Returns: `{ service: { id, name, slug, description, pricePaise, durationMin, category, gemsRedeemable, gemsRequired, image } }` | No | Cloudflare KV |
| `/api/availability` | GET | Available time slots. Query params: `date` (YYYY-MM-DD), `serviceIds[]` (optional), `staffId` (optional). Returns: `{ slots: [{ startTime, endTime, available: boolean }] }` | No | No cache (real-time) |
| `/api/bookings` | GET | List authenticated customer's bookings. Query: `status`, `upcoming` (boolean). Returns: `{ bookings: [...] }` | Yes | No cache |
| `/api/bookings` | POST | Create a new booking. Body: `{ branchId, date, startTime, serviceIds[], leadId? }`. Returns: `{ booking: { id, bookingNumber, status: 'pending' } }`. Side effects: Ably publish, email via Resend, PostHog event. | Yes | — |
| `/api/bookings/[id]` | GET | Single booking detail for authenticated owner. Returns full booking with services, staff, status history, notes. | Yes | No cache |
| `/api/bookings/[id]/cancel` | POST | Cancel a booking. Validates: ≥4h before appointment (free) or late cancel (CRM tag). Body: `{ reason? }`. Side effects: slot released, Ably publish, email notification. | Yes | — |
| `/api/bookings/[id]/reschedule` | POST | Reschedule. Validates: max 2 reschedules, ≥1h before. Body: `{ newDate, newStartTime }`. Side effects: slot swap, Ably publish, calendar event updated, email. | Yes | — |
| `/api/leads` | POST | Lead capture from `/book`. Body: `{ name, phone, serviceInterested, metaEventId }`. No auth required. Side effects: lead row created, Meta CAPI `Lead` event fired. | No | — |
| `/api/onboarding/complete` | POST | Save onboarding data. Body: `{ name, phone, dob, gender, privacyConsent, analyticsConsent, marketingConsent }`. Side effects: profile created, acquisition source assigned, Brevo contact synced (if marketing consent), Meta CAPI `CompleteRegistration`, welcome email via Resend. | Yes | — |
| `/api/push/subscribe` | POST | Register Web Push subscription. Body: `{ endpoint, keys: { p256dh, auth } }`. Stores in Neon. | Yes | — |
| `/api/push/unsubscribe` | DELETE | Remove push subscription. Body: `{ endpoint }`. | Yes | — |
| `/api/ably/token` | POST | Ably Token Auth. Returns scoped JWT token based on user role. Customer: subscribe to own channels only. Admin: subscribe to admin channels. Staff: own schedule channel. Never includes publish capability. | Yes | — |

---

### 8c. Admin API

All routes require min. Receptionist role unless noted.

| Route | Method | Summary | Min. Role | Side Effects |
|-------|--------|---------|-----------|--------------|
| `/api/admin/bookings/[id]` | PATCH | Approve (assign staff), reject (with reason), or update booking. Body: `{ action: 'approve'|'reject'|'assign', staffAssignments?, rejectionReason? }` | Receptionist | Ably publish to customer + admin channels, email notification, calendar event (on approve) |
| `/api/admin/bookings/[id]/complete` | POST | Mark completed + checkout. Body: `{ paymentMethod, offerId? }`. Generates invoice, awards gems, emails PDF. | Receptionist | Invoice PDF generated (Render API), stored in R2, emailed (Resend), gems awarded, Meta CAPI `Purchase`, Brevo attributes updated, Ably publish |
| `/api/admin/bookings/[id]/noshow` | POST | Mark no-show. Increments `noshow_count`, checks tier threshold. | Receptionist | CRM tag applied if threshold reached, customer notified |
| `/api/admin/memberships` | POST | Create membership. Body: `{ customerId, tier, hours?, price?, startDate? }`. | Receptionist | `membership_purchase` invoice generated + emailed, customer notified |
| `/api/admin/memberships/[id]/session` | POST | Record session. Body: `{ serviceIds[], durationMinutes }`. Validates remaining hours. | Receptionist | Hours deducted, `membership_session` invoice (₹0) generated + emailed, booking row created |
| `/api/admin/leave` | POST | Submit leave request (staff self-service). Body: `{ date, leaveType, reason }`. | Staff | Push + email to receptionists/manager |
| `/api/admin/leave/[id]` | PATCH | Approve or reject leave. Body: `{ action: 'approve'|'reject', rejectionReason? }`. | Receptionist | Ably publish to staff channel, email notification, schedule slot blocked (if approved) |

---

### 8d. Background Job Endpoints (QStash)

Called by Upstash QStash scheduler. Verified via `Upstash-Signature` header. Never called directly by browser.

| Route | Schedule | Summary | On Failure |
|-------|----------|---------|------------|
| `/api/jobs/appointment-reminders` | Every 15 min | Finds confirmed bookings in next 24h/1h without matching reminder. Sends push (Web Push API) + email (Resend). | BetterStack heartbeat missed → alert |
| `/api/jobs/membership-expiry` | Daily 12:30 AM IST | Finds memberships expiring in 30d/7d/1d. Sends push + email reminders. | BetterStack heartbeat missed |
| `/api/jobs/birthday-emails` | Daily 9:30 AM IST | Finds customers with today's DOB. Sends birthday offer email (Brevo) + push notification. | Silent fail (non-critical) |
| `/api/jobs/membership-usage-nudges` | Daily 11:00 AM IST (Wed only) | Randomised batch: reminds active members with unused hours (≤30d to expiry, >60min remaining). Respects 7-day cooldown. | Silent fail |
| `/api/jobs/lead-followups` | Daily 10:30 AM IST | Finds leads in "New" status for 48h+ without contact. Alerts assigned receptionist via push + Ably. | Silent fail |
| `/api/jobs/daily-sales-report` | Daily 10:30 PM IST | Compiles today's revenue, booking count, Cash/UPI/Card breakdown. Emails to Owner/Manager. | BetterStack heartbeat missed |
| `/api/jobs/weekly-report` | Monday 9:00 AM IST | Week-over-week revenue comparison, top services, new customers. Emails to Owner/Manager. | Silent fail |
| `/api/jobs/gems-expiry-reminder` | Daily 10:30 AM IST | Finds customers with gems expiring in 7 days. Sends push notification. | Silent fail |
| `/api/jobs/post-service-followup` | +24h after completed | Sends post-service email with Google Maps review link (Brevo template). | Silent fail |
| `/api/jobs/stale-booking-alert` | +2h after pending created | If booking still pending after 2h, alerts receptionists via push + Ably `admin:bookings`. | Silent fail |
| `/api/jobs/noshow-check` | +15min after scheduled end_time | If booking status still "confirmed" after end time, alerts receptionist to check if no-show. | Silent fail |
| `/api/jobs/membership-expired-notice` | +1h after expires_at | Final expiry email with renewal prompt (Resend template). | Silent fail |

---

### 8e. Incoming Webhooks

Signature-verified. External services push data into the system.

| Route | Method | Source | Verification | Summary |
|-------|--------|--------|-------------|---------|
| `/api/webhooks/meta-leads` | POST | Meta Lead Gen (Instant Forms) | Meta signature verification | Receives leads from Instagram/Facebook native forms. Saves to `lead` table with source `meta_ad`, ad_id, campaign_id. Fires Meta CAPI `Lead` event as confirmation. |
| `/api/webhooks/aisensy` | POST | AiSensy | AiSensy webhook signature | WhatsApp lead status change notification. Updates `lead` record status in Neon to keep pipeline in sync. |

---

## 9. External Subdomains

Separate deployments, not part of the main Next.js app.

---

### 9.1 `admin.theroyalglow.in` — Payload CMS

| Property | Detail |
|----------|--------|
| **Platform** | Payload CMS v3 on Render (Node.js) |
| **Database** | Separate Payload Postgres (not main Neon DB) |
| **Purpose** | Marketing content management: blog posts, gallery photos, team bios, homepage banners, FAQ items, about page content |
| **Access** | Manager + Owner (2 seats on free tier) |
| **Integration** | Main Next.js app fetches via Payload REST API (ISR with 1h revalidation) |

**Collections managed:**
- Blog Posts (title, slug, body rich text, featured image, publish date, author)
- Gallery Images (image, caption, category, display order)
- Team Members (name, photo, designation, bio, specializations)
- FAQ Items (question, answer, category, display order)
- Homepage Banners (image, title, subtitle, CTA link, active toggle)

---

### 9.2 `docs.theroyalglow.in` — Technical Docs

| Property | Detail |
|----------|--------|
| **Platform** | Fumadocs (Next.js) on Vercel or Cloudflare Pages |
| **Purpose** | Developer documentation: architecture, API reference (auto-generated from OpenAPI spec via fumadocs-openapi), business logic guides, changelog |
| **Access** | Public (developer reference) |

---

### 9.3 `status.theroyalglow.in` — Status Page

| Property | Detail |
|----------|--------|
| **Platform** | BetterStack Status Page (free tier) |
| **Purpose** | Public uptime status: 10 monitors, incident history, scheduled maintenance |
| **Access** | Public |
| **Monitors** | Homepage, GMB deep link, QR deep link, `/book`, API health, Payload CMS, Neon probe, Ably probe, Redis probe, R2 probe |

---

## 10. Special Files & Endpoints

| Path | Type | Purpose | Update Frequency |
|------|------|---------|-----------------|
| `/sitemap.xml` | Generated (Next.js `app/sitemap.ts`) | Static routes + dynamic blog posts from Payload API. Submitted to Google Search Console. | On build + ISR |
| `/robots.txt` | Generated | AI crawlers explicitly allowed (GPTBot, Claude-Web, PerplexityBot, Googlebot-Extended, Applebot, etc.). Disallows `/admin/`, `/api/`, `/profile/`. | Static |
| `/llms.txt` | Static or API-driven | AI agent discovery: site description, key pages, services, contact, API endpoints. Emerging standard. | Updated when services/prices change |
| `/llms-full.txt` | Static or API-driven | Extended version: complete service menu with prices, staff specializations, full booking instructions. | Updated when services change |
| `/manifest.json` | Static | PWA manifest: Royal Glow branding, theme colour (`#gold`), icons (192px, 512px), start_url: `/`, display: `standalone` | Rarely |
| `/sw.js` | Generated (next-pwa or custom) | Service worker: caches service menu, prices, contact page, hours, gallery thumbnails, homepage shell. Enables offline access to cached content. | On build |
| `/opengraph-image` | Generated (Next.js OG image generation) | Default branded OG image for social sharing. Royal Glow logo + tagline on brand background. | Static |
| `/favicon.ico` | Static | 32x32 favicon | Never |
| `/apple-icon.png` | Static | 180x180 Apple homescreen icon for iOS PWA | Never |
| `/api/health` | API route | Health check endpoint monitored by BetterStack. Returns: `{ status: 'ok', db: 'connected', redis: 'connected', timestamp }` | Always live |

---


## 11. Deep Links & UTM Contracts

These are not separate pages but URL patterns that trigger specific behaviour on existing pages.

| URL Pattern | Behaviour | Source | Analytics |
|-------------|-----------|--------|-----------|
| `/?book=1` | Auto-opens 4-step booking dialog on homepage | General deep-link (shareable) | PostHog: `booking_started` |
| `/?book=1&utm_source=gmb` | Opens dialog + acquisition source = `gmb` | Google Maps / Google My Business action button | PostHog: source tracked |
| `/?book=1&utm_source=walkin` | Opens dialog + acquisition source = `walkin` | In-store QR code posters | PostHog: source tracked |
| `/?book=1&service=[slug]` | Opens dialog with service pre-selected in Step 3 | Service page "Book This" buttons | PostHog: service pre-selection |
| `/?book=1&leadId={id}` | Opens dialog with lead context linked (post-lead-capture redirect) | After `/book` form submit | Lead → booking conversion tracked |
| `/book?utm_source=meta&utm_campaign=X&utm_content=Y` | Meta ad landing page with full campaign tracking | Meta/Instagram ads only | Meta Pixel + CAPI + PostHog |

**Pre-auth preservation:** Before Google OAuth redirect, all query params (`book`, `utm_source`, `utm_campaign`, `utm_content`, `leadId`, `service`) are stored in `sessionStorage`. After OAuth callback, they're read back to restore context (open dialog, assign source, link lead).

---

## 12. Page Count Summary

| Section | Count | Notes |
|---------|-------|-------|
| Customer public pages | 8 | Homepage, services, offers, about, contact, blog, blog post, FAQ |
| Customer authenticated pages | 5 | Profile, bookings, booking detail, membership, gems |
| Booking dialog (overlay) | 1 | 4-step dialog on homepage (not a route) |
| Auth flow pages | 2 | Sign-in, onboarding |
| Landing pages | 1 | `/book` (Meta ad lead capture) |
| Legal pages | 3 | Privacy, terms, refund policy |
| Admin pages | 37 | Dashboard, bookings (4), CRM (2), leads (2), staff (3), schedule (2), services (3), offers (3), memberships (3), billing (2), reports (6), settings (1), branches (2), users (1), integrations (1), logs (1) |
| Customer API routes | 13 | Auth, services, availability, bookings, leads, onboarding, push, ably |
| Admin API routes | 7 | Booking actions, memberships, leave |
| Background job endpoints | 12 | QStash-triggered scheduled work |
| Webhook endpoints | 2 | Meta Leads, AiSensy |
| External subdomains | 3 | Payload CMS, Fumadocs, BetterStack |
| Special files/endpoints | 10 | Sitemap, robots, llms.txt, manifest, SW, OG, favicon, apple-icon, health |
| **Total unique routes/endpoints** | **~104** | |

---

## 13. Role Access Matrix

Quick reference: which roles can access which page sections.

| Section | Customer | Staff | Receptionist | Manager | Owner | Developer |
|---------|:--------:|:-----:|:------------:|:-------:|:-----:|:---------:|
| Public pages (`/`, `/services`, etc.) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth pages (`/profile`, `/bookings`, `/membership`, `/gems`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/admin` dashboard | — | 🔒 Limited | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| `/admin/bookings/*` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/customers/*` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/leads/*` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/memberships/*` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/billing/*` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/schedule` | — | — | ✅ | ✅ | ✅ | ✅ |
| `/admin/leave` | — | 🔒 Own only | ✅ | ✅ | ✅ | ✅ |
| `/admin/staff/*` | — | — | — | ✅ | ✅ | ✅ |
| `/admin/services/*` | — | — | — | ✅ | ✅ | ✅ |
| `/admin/offers/*` | — | — | — | ✅ | ✅ | ✅ |
| `/admin/reports/*` | — | — | — | ✅ | ✅ | ✅ |
| `/admin/settings` | — | — | — | ✅ | ✅ | ✅ |
| `/admin/branches/*` | — | — | — | — | ✅ | ✅ |
| `/admin/users` | — | — | — | — | ✅ | ✅ |
| `/admin/integrations` | — | — | — | — | — | ✅ |
| `/admin/logs` | — | — | — | — | — | ✅ |

**🔒 Legend:**
- Staff sees: own schedule, own appointments, own leave history only
- Receptionist: full day-to-day operations
- Manager: all receptionist + catalog/pricing/reports/settings
- Owner: all manager + branches/users
- Developer: everything including integrations and error logs

---

## 14. Realtime Subscription Map (Ably Channels)

Which pages subscribe to which Ably channels for live updates.

| Page | Channel | Events Received | UI Effect |
|------|---------|----------------|-----------|
| `/bookings` | `customer:{userId}:bookings` | `booking.created`, `booking.status_changed`, `booking.rescheduled`, `booking.cancelled`, `booking.staff_assigned` | Status badges animate, cards appear/move |
| `/bookings/[id]` | `booking:{bookingId}` | `status.changed`, `note.added`, `service.added`, `service.removed` | Timeline extends, notes appear live |
| `/admin` (dashboard) | `admin:bookings` | `booking.new`, `booking.status_changed`, `booking.walkin_created`, `booking.cancelled`, `booking.no_show` | Pending count updates, feed refreshes |
| `/admin/bookings` | `admin:bookings` | Same as above | Table rows update in-place |
| `/admin/bookings/[id]` | `booking:{bookingId}` | `status.changed`, `note.added` | Detail panel live-updates |
| `/admin/schedule` | `admin:schedule:{YYYY-MM-DD}` | `slot.booked`, `slot.released`, `staff.marked_off`, `leave.approved` | Grid slots fill/release live |
| `/admin/leave` | `admin:leave` | `leave.requested`, `leave.withdrawn` | Queue updates without refresh |
| Staff dashboard | `staff:{staffId}:schedule` | `booking.assigned`, `booking.unassigned`, `leave.approved`, `leave.rejected` | Schedule updates live |

---

## 15. PWA & Offline Capabilities

| Content | Cached (Offline) | Why |
|---------|:----------------:|-----|
| Service menu + prices | ✅ | Customer can browse services on bad network |
| Contact page | ✅ | Address, phone, hours always accessible |
| FAQ page | ✅ | Common questions answered offline |
| Homepage shell | ✅ | App feels instant on repeat visits |
| Gallery thumbnails | ✅ | Premium feel maintained |
| Booking flow | ❌ | Requires server (slot availability, auth) |
| Profile / Bookings | ❌ | Requires auth + live data |
| Admin pages | ❌ | All require server |

**Install prompt strategy:** Shown after 2nd visit (not first — first feels pushy). Custom branded prompt using `beforeinstallprompt` event.

---

## 16. References

- [features.md](./features.md) — Full feature specifications and business rules
- [architecture.md](./architecture.md) — Infrastructure, routing, and project structure
- [authentication.md](./authentication.md) — Auth flow, roles, and permissions matrix
- [database-schema.md](./database-schema.md) — All 38 tables and relationships
- [background-jobs.md](./background-jobs.md) — All 19 scheduled/triggered jobs
- [ably-channels.md](./ably-channels.md) — Realtime channel structure and event payloads
- [email-strategy.md](./email-strategy.md) — All email templates and sending strategy
- [meta-pixel.md](./meta-pixel.md) — Meta Pixel + CAPI implementation
- [seo.md](./seo.md) — JSON-LD schemas, sitemap, robots.txt, AI search visibility
- [observability.md](./observability.md) — Monitoring stack (Sentry, BetterStack, PostHog, Clarity, Checkly)
