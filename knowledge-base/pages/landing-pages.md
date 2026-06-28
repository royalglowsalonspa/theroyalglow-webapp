# Landing Pages

> Distraction-free pages with no header, no footer, and no navigation links. Single conversion goal. Used exclusively for paid advertising traffic.

---

## 5.1 `/book` — Ad Landing Page (Lead Capture)

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
