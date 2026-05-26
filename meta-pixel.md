# Meta Pixel + CAPI — Implementation Plan

## What This File Covers

End-to-end plan for Meta Pixel (browser) + Conversions API (server-side) for Royal Glow Salon & Spa. Covers the technical setup, every event to track, where exactly in the codebase each event fires, how to build audiences, and how to structure campaigns.

**Prerequisite reading:** [environment-variables.md](./environment-variables.md) — 3 vars needed (`NEXT_PUBLIC_META_PIXEL_ID`, `META_PIXEL_ACCESS_TOKEN`, `META_TEST_EVENT_CODE`).

---

## The Big Picture — How This Makes You Money

```
Meta Ad (Facebook / Instagram)
    │
    ▼
User clicks ad → Meta stamps their browser with fbclid (click ID)
    │
    ▼
theroyalglow.in/book — Meta/Instagram ad landing page; Pixel fires PageView + stores fbp + fbc cookies
    │
    ▼
User browses services → ViewContent fires
    │
    ├── Leaves without booking?
    │       └── Meta retargeting ad shows next day on Instagram ← retargeting
    │
    ▼
Submits campaign lead form → Lead fires (browser + CAPI server)
    │
    ▼
Redirects into homepage booking dialog (`/?book=1&leadId=...`) → InitiateCheckout fires when dialog opens
    │
    ├── Doesn't show up?
    │       └── Meta retargeting ad: "Finish your Royal Glow booking" ← retargeting
    │
    ▼
Receptionist marks payment received → Purchase fires (CAPI server)
    │
    ├── Revenue attributed to the exact ad that caused this booking
    ├── Meta learns: "this type of person = customer, find more like them"
    └── Lookalike audience of real buyers = prospecting gold
```

**The compounding effect:** Every `Purchase` event teaches Meta's algorithm who your real customers are. After 50 purchases, you unlock Lookalike Audiences — Meta finds 1 million women in Bengaluru who match your buyers' profile. After 200+ purchases, Meta can predict who will book before they even click your ad.

---

## Browser Pixel vs CAPI — Why Both Are Mandatory

| | Browser Pixel | CAPI (Server) |
|--|--------------|---------------|
| Fires from | Visitor's browser JS | Your Next.js API route |
| Blocked by iOS 14+ / ad blockers | ✅ Yes — ~30–40% lost | ❌ Never blocked |
| Has browser cookies (fbp, fbc) | ✅ Automatically | Manually passed |
| Best for | UI interaction events | Transactional events |
| Required for | All events | `Lead`, `Purchase`, `CompleteRegistration` |

**Deduplication:** Both browser and server fire for `Lead` and `Purchase`. You pass the same `event_id` UUID from both — Meta sees two signals, deduplicates to one event. No double counting.

---

## Full Event Plan

**Route attribution split:** Meta/Instagram ads send traffic to `/book`, which creates a `lead` with source `meta_ad`. Organic users, Google Maps/GMB users (`/?book=1&utm_source=gmb`), and in-store QR users (`/?book=1&utm_source=walkin`) use the homepage booking dialog and create `booking` rows, not lead rows.

### Standard Events (Meta optimizes on these)

| Event | Fired when | Browser | CAPI | Optimization use |
|-------|-----------|---------|------|-----------------|
| `PageView` | Every page load | ✅ auto | ✅ | Retargeting all visitors |
| `ViewContent` | Service category page visited | ✅ | — | Retarget service-specific interest |
| `InitiateCheckout` | Booking dialog opened | ✅ | — | Retarget people who almost booked |
| `Lead` | Meta/Instagram lead form submitted; lead row created | ✅ | ✅ | **Primary optimization target for ads** |
| `Purchase` | Invoice generated (cash received) | ✅ | ✅ | **Revenue attribution + lookalike seed** |
| `CompleteRegistration` | Onboarding form completed | ✅ | ✅ | New customer acquisition signal |

### Custom Events (for retargeting segments, not for optimization)

| Event | Fired when | How |
|-------|-----------|-----|
| `BookingSubmitted` | Normal website booking request submitted | Browser or CAPI |
| `BookingConfirmed` | Booking status → confirmed | CAPI only (happens in admin) |
| `MembershipPurchased` | SPA membership created | CAPI only |

### Why `Lead` is more important than `Purchase` for ad optimization

Your `Purchase` event fires only after the customer physically visits and pays cash. Meta ads drive online actions — they can bring someone to submit a campaign lead form and continue to booking, but they can't make someone walk through the door. So:

- **Optimize ads for `Lead`** → Meta drives campaign lead submissions
- **Track normal organic/GMB/walk-in QR bookings separately** → these are homepage dialog `booking` rows, not `lead` rows
- **Measure ROAS via `Purchase`** → tracks which leads actually paid
- **`Purchase` builds your lookalike audience** → best prospecting signal long-term

---

## Implementation

### Step 1 — Environment Variables

Add one new variable (others already in environment-variables.md):

```bash
# .env.local (dev only — never in production)
META_TEST_EVENT_CODE=TEST12345   # from Meta Events Manager > Test Events tab
```

Add to `env.ts` validation under `server`:
```ts
META_TEST_EVENT_CODE: z.string().optional(),
```

Full list of Meta vars (all in `apps/web`):
| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_META_PIXEL_ID` | Public | Pixel ID from Meta Business Manager → Events Manager |
| `META_PIXEL_ACCESS_TOKEN` | Private | System User token from Meta Business Manager → System Users |
| `META_TEST_EVENT_CODE` | Private, dev/pprd only | For testing CAPI events without polluting real data |

**Where to find these in Meta:**
1. `NEXT_PUBLIC_META_PIXEL_ID` → [business.facebook.com](https://business.facebook.com) → Events Manager → your Pixel → Settings → Pixel ID
2. `META_PIXEL_ACCESS_TOKEN` → Business Manager → System Users → Create system user → Generate token → select `ads_management` + `ads_read` + `business_management` permissions
3. `META_TEST_EVENT_CODE` → Events Manager → your Pixel → Test Events tab → copy the code

---

### Step 2 — Browser Pixel Base Code (`apps/web/app/layout.tsx`)

Install nothing. The Pixel is pure inline script via Next.js `Script` component.

```tsx
// apps/web/app/layout.tsx
import Script from 'next/script'
import { env } from '@/env'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>
        {children}

        {/* Meta Pixel base code — only fires after consent is given */}
        {/* Consent gating is handled by ConsentProvider (see DPDP section) */}
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${env.NEXT_PUBLIC_META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
        <noscript>
          <img
            height="1" width="1" style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${env.NEXT_PUBLIC_META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
      </body>
    </html>
  )
}
```

---

### Step 3 — Client-Side Helper (`apps/web/lib/meta-pixel.ts`)

All browser-side event firing goes through this helper so it's typed and centralized.

```ts
// apps/web/lib/meta-pixel.ts
import { env } from '@/env'

declare global {
  interface Window {
    fbq: (...args: unknown[]) => void
  }
}

// Generate a unique ID for deduplication with CAPI
export function generateEventId(): string {
  return crypto.randomUUID()
}

export function pixelViewContent(contentName: string) {
  if (typeof window === 'undefined' || !window.fbq) return
  window.fbq('track', 'ViewContent', { content_name: contentName })
}

export function pixelInitiateCheckout() {
  if (typeof window === 'undefined' || !window.fbq) return
  window.fbq('track', 'InitiateCheckout')
}

// Returns eventId — pass this to the API route for CAPI deduplication
export function pixelLead(params: {
  eventId: string
  contentName: string
}): void {
  if (typeof window === 'undefined' || !window.fbq) return
  window.fbq('track', 'Lead', {
    content_name: params.contentName,
    eventID: params.eventId,     // Meta deduplication key
  })
}

// Returns eventId — pass this to the API route for CAPI deduplication
export function pixelPurchase(params: {
  eventId: string
  valueRupees: number            // pass in ₹, NOT paise
  contentName: string
  contentIds: string[]
}): void {
  if (typeof window === 'undefined' || !window.fbq) return
  window.fbq('track', 'Purchase', {
    value: params.valueRupees,
    currency: 'INR',
    content_type: 'service',
    content_name: params.contentName,
    content_ids: params.contentIds,
    eventID: params.eventId,
  })
}

export function pixelCompleteRegistration(): void {
  if (typeof window === 'undefined' || !window.fbq) return
  window.fbq('track', 'CompleteRegistration')
}
```

---

### Step 4 — Server-Side CAPI Helper (`apps/web/lib/meta-capi.ts`)

This fires directly from your Next.js API routes to Meta's Graph API. Never reaches the browser.

```ts
// apps/web/lib/meta-capi.ts
import { createHash } from 'crypto'
import { env } from '@/env'

const GRAPH_API_VERSION = 'v20.0'
const CAPI_ENDPOINT = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.NEXT_PUBLIC_META_PIXEL_ID}/events`

// SHA256 hash PII before sending to Meta (required)
function hash(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex')
}

// Strip all non-digits, ensure country code prefix (91 for India)
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // If already has country code (starts with 91 and is 12 digits)
  if (digits.length === 12 && digits.startsWith('91')) return digits
  // Indian mobile: 10 digits → prepend 91
  if (digits.length === 10) return `91${digits}`
  return digits
}

interface UserData {
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  // From browser cookies — read from request headers
  fbp?: string   // _fbp cookie value
  fbc?: string   // _fbc cookie value
  clientIpAddress?: string
  clientUserAgent?: string
}

interface CAPIEvent {
  eventName: string
  eventId: string          // UUID matching the browser pixel eventID
  eventSourceUrl: string
  userData: UserData
  customData?: Record<string, unknown>
  actionSource?: 'website' | 'app' | 'phone_call' | 'chat' | 'email' | 'other'
}

export async function sendCAPIEvent(event: CAPIEvent): Promise<void> {
  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        event_source_url: event.eventSourceUrl,
        action_source: event.actionSource ?? 'website',
        user_data: {
          // Hashed PII — Meta requires SHA256, lowercase
          ...(event.userData.email && { em: [hash(event.userData.email)] }),
          ...(event.userData.phone && { ph: [hash(normalizePhone(event.userData.phone))] }),
          ...(event.userData.firstName && { fn: [hash(event.userData.firstName)] }),
          ...(event.userData.lastName && { ln: [hash(event.userData.lastName)] }),
          // Not hashed — browser identifiers
          ...(event.userData.fbp && { fbp: event.userData.fbp }),
          ...(event.userData.fbc && { fbc: event.userData.fbc }),
          ...(event.userData.clientIpAddress && { client_ip_address: event.userData.clientIpAddress }),
          ...(event.userData.clientUserAgent && { client_user_agent: event.userData.clientUserAgent }),
        },
        ...(event.customData && { custom_data: event.customData }),
      },
    ],
    access_token: env.META_PIXEL_ACCESS_TOKEN,
    // Only set in dev/pprd — routes real events to Test Events tab
    ...(env.META_TEST_EVENT_CODE && { test_event_code: env.META_TEST_EVENT_CODE }),
  }

  const res = await fetch(CAPI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    // Log but never throw — CAPI failure must never break the main API response
    const error = await res.text()
    console.error('[CAPI] Event failed:', event.eventName, error)
  }
}

// ── Typed convenience wrappers ────────────────────────────────────────────────

export async function capiLead(params: {
  eventId: string
  sourceUrl: string
  email: string
  phone: string
  firstName: string
  fbp?: string
  fbc?: string
  clientIp?: string
  userAgent?: string
  contentName: string
}): Promise<void> {
  return sendCAPIEvent({
    eventName: 'Lead',
    eventId: params.eventId,
    eventSourceUrl: params.sourceUrl,
    userData: {
      email: params.email,
      phone: params.phone,
      firstName: params.firstName,
      fbp: params.fbp,
      fbc: params.fbc,
      clientIpAddress: params.clientIp,
      clientUserAgent: params.userAgent,
    },
    customData: { content_name: params.contentName },
  })
}

export async function capiPurchase(params: {
  eventId: string
  sourceUrl: string
  email: string
  phone: string
  firstName: string
  lastName?: string
  fbp?: string
  fbc?: string
  clientIp?: string
  userAgent?: string
  valueRupees: number          // pass in ₹ (invoice.total_amount_paise / 100)
  contentName: string
  contentIds: string[]
}): Promise<void> {
  return sendCAPIEvent({
    eventName: 'Purchase',
    eventId: params.eventId,
    eventSourceUrl: params.sourceUrl,
    userData: {
      email: params.email,
      phone: params.phone,
      firstName: params.firstName,
      lastName: params.lastName,
      fbp: params.fbp,
      fbc: params.fbc,
      clientIpAddress: params.clientIp,
      clientUserAgent: params.userAgent,
    },
    customData: {
      value: params.valueRupees,
      currency: 'INR',
      content_type: 'service',
      content_name: params.contentName,
      content_ids: params.contentIds,
    },
  })
}

export async function capiCompleteRegistration(params: {
  eventId: string
  sourceUrl: string
  email: string
  phone: string
  firstName: string
  fbp?: string
  fbc?: string
  clientIp?: string
  userAgent?: string
}): Promise<void> {
  return sendCAPIEvent({
    eventName: 'CompleteRegistration',
    eventId: params.eventId,
    eventSourceUrl: params.sourceUrl,
    userData: {
      email: params.email,
      phone: params.phone,
      firstName: params.firstName,
      fbp: params.fbp,
      fbc: params.fbc,
      clientIpAddress: params.clientIp,
      clientUserAgent: params.userAgent,
    },
  })
}

export async function capiBookingConfirmed(params: {
  email: string
  phone: string
  firstName: string
  fbp?: string
  fbc?: string
  clientIp?: string
  userAgent?: string
}): Promise<void> {
  return sendCAPIEvent({
    eventName: 'BookingConfirmed',
    eventId: crypto.randomUUID(),
    eventSourceUrl: 'https://theroyalglow.in/bookings',
    actionSource: 'website',
    userData: {
      email: params.email,
      phone: params.phone,
      firstName: params.firstName,
      fbp: params.fbp,
      fbc: params.fbc,
      clientIpAddress: params.clientIp,
      clientUserAgent: params.userAgent,
    },
  })
}
```

---

### Step 5 — Helper to Extract Browser Signals from Request

`fbp` and `fbc` cookies dramatically improve attribution. Read them from every API request.

```ts
// apps/web/lib/meta-signals.ts
import { type NextRequest } from 'next/server'

export interface MetaSignals {
  fbp?: string          // Facebook browser ID (set by Pixel)
  fbc?: string          // Facebook click ID (set when user arrives via Meta ad)
  clientIp: string
  userAgent: string
}

export function extractMetaSignals(req: NextRequest): MetaSignals {
  return {
    fbp: req.cookies.get('_fbp')?.value,
    fbc: req.cookies.get('_fbc')?.value,
    // Cloudflare sets CF-Connecting-IP; fallback to x-forwarded-for
    clientIp: req.headers.get('cf-connecting-ip')
           ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           ?? '0.0.0.0',
    userAgent: req.headers.get('user-agent') ?? '',
  }
}
```

---

### Step 6 — Where Each Event Fires in the Codebase

#### `ViewContent` — service category page

```tsx
// apps/web/app/(customer)/services/[category]/page.tsx
'use client'
import { useEffect } from 'react'
import { pixelViewContent } from '@/lib/meta-pixel'

export default function ServiceCategoryPage({ params }: { params: { category: string } }) {
  useEffect(() => {
    pixelViewContent(params.category)   // e.g., "Facial & Skincare"
  }, [params.category])

  // ... rest of page
}
```

#### `InitiateCheckout` — booking dialog open

```tsx
// apps/web/components/booking/BookingDialog.tsx
import { pixelInitiateCheckout } from '@/lib/meta-pixel'

function BookingDialog() {
  const handleOpen = () => {
    pixelInitiateCheckout()
    setOpen(true)
  }
  // ...
}
```

#### `Lead` — campaign lead form submitted (browser + CAPI)

The browser fires first (instant feedback), then the API route fires CAPI with the same `eventId`.

```tsx
// apps/web/components/leads/LeadCaptureForm.tsx
import { generateEventId, pixelLead } from '@/lib/meta-pixel'

async function handleSubmit(formData: LeadCaptureFormData) {
  const eventId = generateEventId()        // generate ONCE, pass to both

  // Browser pixel fires immediately
  pixelLead({ eventId, contentName: selectedServiceLabel })

  // API route receives eventId and fires CAPI with same ID → Meta deduplicates
  const res = await fetch('/api/leads', {
    method: 'POST',
    body: JSON.stringify({ ...formData, metaEventId: eventId }),
  })
  const lead = await res.json()

  redirectToBookingFlow('/?book=1&leadId=' + lead.id)
}
```

```ts
// apps/web/app/api/leads/route.ts
import { capiLead } from '@/lib/meta-capi'
import { extractMetaSignals } from '@/lib/meta-signals'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const signals = extractMetaSignals(req)

  const lead = await createLead({
    ...body,
    source: 'meta_ad',
  })

  // CAPI — fires alongside DB write, never awaited as a blocker
  capiLead({
    eventId: body.metaEventId,     // same ID as browser pixel
    sourceUrl: 'https://theroyalglow.in/book',
    email: body.email,
    phone: body.phone,
    firstName: body.name,
    fbp: signals.fbp,
    fbc: signals.fbc,
    clientIp: signals.clientIp,
    userAgent: signals.userAgent,
    contentName: body.serviceName,
  }).catch(console.error)          // never block the response

  return Response.json({ success: true, id: lead.id })
}
```

#### `Purchase` — invoice generated (CAPI only from admin route)

The `Purchase` event fires from the admin API when the receptionist marks payment received. Since the receptionist is logged in on the admin app, there's no browser Pixel here — CAPI only.

```ts
// apps/web/app/api/admin/bookings/[id]/complete/route.ts
import { capiPurchase } from '@/lib/meta-capi'
import { extractMetaSignals } from '@/lib/meta-signals'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // ... mark booking completed, generate invoice, calculate gems ...

  // CAPI Purchase — fired after invoice is created
  capiPurchase({
    eventId: randomUUID(),             // no browser counterpart — no dedup needed
    sourceUrl: `https://theroyalglow.in`,
    email: customer.email,
    phone: customer.phone,
    firstName: customer.firstName,
    lastName: customer.lastName,
    fbp: signals.fbp,
    fbc: signals.fbc,
    clientIp: signals.clientIp,
    userAgent: signals.userAgent,
    valueRupees: invoice.total_amount_paise / 100,   // convert paise → ₹
    contentName: invoice.items.map(i => i.service_name_snapshot).join(', '),
    contentIds: invoice.items.map(i => i.service_id),
  }).catch(console.error)

  return Response.json({ invoiceId: invoice.id })
}
```

#### `CompleteRegistration` — onboarding complete

```ts
// apps/web/app/api/onboarding/complete/route.ts
import { capiCompleteRegistration } from '@/lib/meta-capi'
import { extractMetaSignals } from '@/lib/meta-signals'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  // ... save onboarding data to customer_profile ...

  capiCompleteRegistration({
    eventId: randomUUID(),
    sourceUrl: 'https://theroyalglow.in/onboarding',
    email: body.email,
    phone: body.phone,
    firstName: body.firstName,
    fbp: signals.fbp,
    fbc: signals.fbc,
    clientIp: signals.clientIp,
    userAgent: signals.userAgent,
  }).catch(console.error)

  return Response.json({ success: true })
}
```

---

## Consent Gating (DPDP Act 2023)

Meta Pixel **must not fire** until the visitor accepts the cookie consent banner. This is a legal requirement under DPDP Act 2023, GDPR, and Meta's own policies.

```ts
// apps/web/lib/consent.ts
// Consent stored in localStorage after banner interaction

export function hasMarketingConsent(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('cookie_consent') === 'accepted'
}

export function grantConsent(): void {
  localStorage.setItem('cookie_consent', 'accepted')
  // Re-initialize Pixel now that consent is given
  if (window.fbq) {
    window.fbq('consent', 'grant')
  }
}

export function revokeConsent(): void {
  localStorage.setItem('cookie_consent', 'declined')
  if (window.fbq) {
    window.fbq('consent', 'revoke')
  }
}
```

Update the Pixel base code in `layout.tsx` to initialize in consent-pending mode:

```js
// Replace fbq('init', ...) in layout.tsx with:
fbq('consent', 'revoke');        // start in revoked state
fbq('init', '${PIXEL_ID}');
fbq('track', 'PageView');        // PageView fires but no data collected until grant()
```

Call `grantConsent()` when user clicks "Accept" on the consent banner. This is already planned in your cookie consent banner implementation.

**CAPI note:** CAPI fires server-side and only for users who have actually taken a transactional action (submitted a booking, completed onboarding). By that point they have accepted the consent banner. No separate gating needed for CAPI.

---

## Audience Building Strategy

These are the custom audiences you build in Meta Ads Manager using your Pixel events. Each audience is a pool of people Meta can retarget with ads.

### Website Custom Audiences (WCA) — create on launch day

Create these in Meta Ads Manager → Audiences → Create Audience → Custom Audience → Website.

| Audience Name | Based on | Window | Use for |
|--------------|---------|--------|---------|
| `RGSS - All Visitors` | PageView | 180 days | Broadest retargeting pool |
| `RGSS - Service Viewers` | ViewContent | 14 days | People who browsed specific services |
| `RGSS - Initiated Booking` | InitiateCheckout | 30 days | Warm audience — opened booking dialog |
| `RGSS - Submitted Lead Form` | Lead | 30 days | Hot paid-audience pool — submitted campaign lead form |
| `RGSS - Past Customers` | Purchase | 180 days | Existing customers — seed for Lookalike |
| `RGSS - New Customers (30d)` | Purchase | 30 days | Recent buyers — high-intent |

**Exclusions matter:** When running retargeting ads, always exclude `RGSS - Past Customers` from top-of-funnel campaigns so you don't waste money showing acquisition ads to people who already booked.

### Lookalike Audiences — unlock after 100+ Purchase events

Meta needs a minimum of 100 people in a seed audience to create a Lookalike. At 100+ purchases you get the most valuable audiences in your entire ad account.

| Audience Name | Seed | Size | Use for |
|--------------|------|------|---------|
| `RGSS - LAL 1% Customers (IN)` | Past Customers | ~1M | Top prospecting — tightest match |
| `RGSS - LAL 2% Customers (IN)` | Past Customers | ~2M | Broader prospecting after 1% saturates |
| `RGSS - LAL 1% Leads (IN)` | Submitted Lead Form | ~1M | Earlier-funnel version |

**Geo-filter all Lookalikes** to Bengaluru + 25km radius inside the ad set, not inside the audience. This way the audience stays large (Meta needs data to work) but your ads only show to relevant geography.

### Customer List Upload — do this monthly

Export hashed emails from your Neon DB monthly and upload to Meta Audiences → Customer List. This matches your offline customers to Meta profiles (even those who never visited your website).

```sql
-- Monthly: pull all customers with email and phone
SELECT
  encode(sha256(lower(email)::bytea), 'hex') AS email_hash,
  encode(sha256(('91' || regexp_replace(phone, '\D', '', 'g'))::bytea), 'hex') AS phone_hash
FROM customer_profile
WHERE marketing_consent = true;
-- Export as CSV → upload to Meta
```

---

## Campaign Architecture — Launch Playbook

### Phase 1: First 90 days (seed the algorithm, budget ₹500–1,000/day)

The goal in Phase 1 is not maximum ROAS. It's to accumulate enough `Purchase` events to teach Meta's algorithm and build your Lookalike audiences.

```
Campaign 1: Retargeting — Warm (₹300/day)
├── Objective: Leads
├── Audience: RGSS - Initiated Booking (30d) EXCLUDING RGSS - Past Customers
├── Ad: "Complete your booking at Royal Glow — slots available"
└── Format: Single image + CTA "Book Now"

Campaign 2: Retargeting — Hot (₹200/day)
├── Objective: Conversions (Lead)
├── Audience: RGSS - Service Viewers (14d) EXCLUDING Submitted Booking
├── Ad: Show the exact service category they viewed
└── Format: Carousel of that service category

Campaign 3: Prospecting — Interest (₹500/day)
├── Objective: Leads
├── Audience: Women, Bengaluru 20km, age 20–45, interests: beauty, skincare, spa, wellness
├── Ad: Transformation content / "What a Royal Glow session feels like"
└── Format: Video (15s) or before/after
```

### Phase 2: After 100 Purchase events (scale with Lookalike)

```
Campaign 4: Prospecting — Lookalike (₹800/day)
├── Objective: Leads
├── Audience: RGSS - LAL 1% Customers (IN) + geo filter Bengaluru 25km
├── Ad: Social proof — "Rated 4.9★ by 86 women in Bengaluru"
└── This replaces Campaign 3 interest targeting — Lookalike almost always outperforms it

Campaign 5: Re-engagement (₹200/day)
├── Objective: Traffic
├── Audience: RGSS - Past Customers (180d) — customers who haven't booked in 60d
├── Ad: "We miss you at Royal Glow — your next session awaits"
└── Seasonal variations: new service launches, festive offers
```

### What to put in the ads (creative guidance)

| Top-performing creative for salons | Why |
|-----------------------------------|-----|
| Before/after transformation videos | Highest CTR for beauty services |
| "Rated 4.9★ by 86 women in Bengaluru" | Local social proof is powerful |
| Stylist/therapist face + name | Human face = trust, reduces ad fatigue |
| Specific service names ("Hydrafacial from ₹1,499") | Price + specificity drives qualified clicks |
| Short Reels shot in the salon | Authentic > polished for Instagram |

**One critical rule:** Never run Meta/Instagram ads without a CTA that goes to `https://theroyalglow.in/book`, the dedicated lead capture flow. Never send Meta ad traffic only to Instagram profile, WhatsApp, GMB, or the homepage dialog — you lose the intended `Lead` event and `meta_ad` attribution.

---

## ROAS Measurement

Once `Purchase` events with `value` are flowing, you can measure return on ad spend directly in Meta Ads Manager.

**In Meta Ads Manager → Columns → Customize:**
Add: `Purchases`, `Purchase ROAS`, `Cost per Lead`, `Cost per Purchase`

**What good looks like for a local salon:**
| Metric | Target (Phase 1) | Target (Phase 2) |
|--------|-----------------|-----------------|
| Cost per Lead | ₹150–400 | ₹80–200 |
| Lead → Show rate | 50–60% | 60–75% |
| Purchase ROAS | 2–4× | 4–8× |
| Cost per Purchase | ₹300–600 | ₹150–350 |

**Example:** ₹1,000/day spend → 4 bookings submitted → 2–3 complete → avg invoice ₹800 → ₹2,000 revenue → 2× ROAS. This is the floor. Phase 2 Lookalike campaigns typically hit 4–6×.

---

## Testing & Verification

### Before going live — use Meta Test Events

1. Set `META_TEST_EVENT_CODE=TEST12345` in `.env.local`
2. Open Meta Events Manager → your Pixel → **Test Events** tab
3. Navigate your site, open booking dialog, submit a test booking
4. Events appear in real-time in the Test Events panel within 60 seconds
5. Verify: event name, parameters (`value`, `currency`, `content_name`), deduplication (both browser + server show, count = 1)

### Browser Pixel verification

Install **Meta Pixel Helper** Chrome extension. Open theroyalglow.in:
- Green checkmark = Pixel loaded correctly
- Event list = shows every event fired on the current page
- Red warning = misconfiguration

### Deduplication check

In Test Events panel, a deduplicated event shows: `Received: 2, Used: 1 (deduplicated)`. If you see `Used: 2` for Lead or Purchase, your `eventID` values don't match — check that the same UUID is being passed from browser and server.

### Production verification (after launch)

Meta Events Manager → Overview → check:
- Event match quality score (aim for 7+/10) — higher = better attribution
- Deduplication rate — should show 1 used per Lead and Purchase
- Event count vs your DB booking count — should be within ~5%

**If event match quality is low (below 6):** Add more user data fields to CAPI — `lastName`, city (`ct`), state (`st`), country (`country`) all hashed. More matching data = Meta can match server events to more profiles.

---

## File References

| Helper | Path |
|--------|------|
| Browser Pixel helper | `apps/web/lib/meta-pixel.ts` |
| CAPI helper | `apps/web/lib/meta-capi.ts` |
| Signal extractor | `apps/web/lib/meta-signals.ts` |
| Consent manager | `apps/web/lib/consent.ts` |
| Lead API (Lead CAPI) | `apps/web/app/api/leads/route.ts` |
| Invoice API (Purchase CAPI) | `apps/web/app/api/admin/bookings/[id]/complete/route.ts` |
| Onboarding API (Registration CAPI) | `apps/web/app/api/onboarding/complete/route.ts` |

---

## Summary — What You Need to Do

| Step | When | What |
|------|------|------|
| 1 | Pre-launch | Create Meta Pixel in Business Manager, get Pixel ID |
| 2 | Pre-launch | Create System User, generate access token |
| 3 | Pre-launch | Add 3 env vars to GitHub Secrets + Cloudflare Pages |
| 4 | Dev | Implement 4 helper files above |
| 5 | Dev | Wire events into booking flow, onboarding, service pages |
| 6 | Dev | Test all events in Meta Test Events tab |
| 7 | Launch day | Create all 6 WCA audiences in Ads Manager |
| 8 | Launch day | Launch Campaign 1 + 2 + 3 (retargeting + interest prospecting) |
| 9 | At 100 Purchases | Create LAL audiences, launch Campaign 4 |
| 10 | Monthly | Export customer list from Neon, upload to Meta |
