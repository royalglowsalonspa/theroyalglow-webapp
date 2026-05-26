# Email Strategy

## Overview

Since authentication is **Google OAuth only**, the auth system sends **zero auth emails** (no password resets, no magic links). Every email Royal Glow sends is a **business event** handled by application code.

This means the email stack is completely independent of the auth library choice.

---

## Email Types

| Type | Trigger | Template | Service |
|------|---------|----------|---------|
| **Welcome** | Onboarding completed | `welcome.tsx` | Resend |
| **Booking confirmation** | Booking created (pending) | `booking-confirmation.tsx` | Resend |
| **Booking approved** | Receptionist confirms booking | `booking-approved.tsx` | Resend |
| **Booking rejected** | Receptionist rejects/cancels booking | `booking-rejected.tsx` | Resend |
| **Appointment reminder** | 24h / 1h before appointment | `appointment-reminder.tsx` | Resend |
| **Invoice — service** | Booking moves to `completed` | `invoice-service.tsx` | Resend |
| **Invoice — membership purchase** | `spa_membership` record created | `invoice-membership-purchase.tsx` | Resend |
| **Invoice — membership session** | Membership session recorded by admin | `invoice-membership-session.tsx` | Resend |
| **Membership expiry reminder** | 30d / 7d / 1d before expiry | `membership-expiry-reminder.tsx` | Resend |
| **Membership expired** | Auto-expire pg_cron runs | `membership-expired.tsx` | Resend |
| **Membership hours update** | Weekly batch to active members | `membership-hours-update.tsx` | Resend |
| **Post-service follow-up** | 2 days after booking completed | Brevo template | Brevo |
| **Re-engagement** | Customer inactive 60+ days | Brevo template | Brevo |
| **Seasonal / Festival offer** | Manual blast (Diwali, summer, etc.) | Brevo template | Brevo |
| **New offer announcement** | Owner publishes offer on `/admin/offers` | Brevo template | Brevo |
| **Membership renewal nudge** | 7 days after membership expired | Brevo template | Brevo |

---

## Two-Service Architecture

### Why two services?

Transactional and marketing emails are **fundamentally different infrastructure problems**:

| Concern | Transactional | Marketing |
|---------|---------------|-----------|
| Volume | Low (1-to-1) | High (1-to-many) |
| Speed | Instant delivery critical | Scheduled / batched |
| Attachments | Yes (PDF invoices) | No |
| Unsubscribe management | Not required | **Legally required** |
| Legal compliance | Basic | CAN-SPAM, GDPR, DPDP |
| Deliverability focus | Individual inbox | Bulk sender reputation |

---

## Service 1: Resend (Transactional)

**Use for:** Welcome emails, booking confirmations, invoices, reminders

### Why Resend
- Optimized for instant, reliable 1-to-1 delivery
- First-class support for PDF attachments (invoices)
- Clean TypeScript/React SDK
- Generous free tier — covers entire launch phase
- Integrates natively with React Email

**Free tier:** 3,000 emails/month, 100/day — sufficient for early growth

---

## Service 2: Brevo (Marketing)

**Use for:** Post-service marketing emails, promotional campaigns, bulk newsletters

### Why Brevo
- Built for bulk sending to subscriber lists
- **Automatic unsubscribe management** — legally required for marketing email
- GDPR-compliant list management
- Free tier: 300 emails/day, unlimited contacts

### Legal Note
Post-service marketing emails **require**:
1. An **unsubscribe link** in every email (Brevo handles this automatically)
2. **Customer consent** at signup — marketing consent checkbox on onboarding screen

Applicable laws: **CAN-SPAM** (US), **GDPR** (EU), **India DPDP Act**

---

## PDF Invoice Generation

**Library:** `@react-pdf/renderer` v4
**Runtime:** Node.js API deployed on **Render** (or Railway)

### Why a separate Node.js API
`@react-pdf/renderer` requires a full Node.js runtime — it cannot run on Cloudflare Workers (edge). Since the Next.js app is deployed on Cloudflare Pages, invoice PDF generation runs on a dedicated Render service and is called via internal HTTP.

### Flow
```
Booking moves to completed (Next.js on Cloudflare)
  → POST /invoices/generate  (Render Node.js API)
      ↓
  PDF generated with @react-pdf/renderer v4
      ↓
  PDF uploaded to Cloudflare R2 → URL stored in invoice.pdf_url
      ↓
  PDF Buffer returned to Next.js app
      ↓
  Resend email sent with PDF attached
```

---

## React Email (Templates)

All invoice email templates are built with **React Email**, designed visually in **Resend's AI template builder** with Royal Glow's brand styling.

### Template Files
```
packages/emails/                       ← React Email templates (Resend only)
  ├── welcome.tsx                      ← Onboarding complete — essential links
  ├── booking-confirmation.tsx         ← Booking pending — details + "we'll call you"
  ├── booking-approved.tsx             ← Booking confirmed — staff assigned, pricing, calendar
  ├── booking-rejected.tsx             ← Booking rejected — reason + rebook CTA
  ├── appointment-reminder.tsx         ← 24h / 1h reminder
  ├── invoice-service.tsx              ← Service invoice (Salon + SPA non-member)
  ├── invoice-membership-purchase.tsx  ← Membership enrollment invoice
  ├── invoice-membership-session.tsx   ← ₹0 session confirmation
  ├── membership-expiry-reminder.tsx   ← 30d / 7d / 1d expiry warning
  ├── membership-expired.tsx           ← Membership expired — renewal CTA
  └── membership-hours-update.tsx      ← Periodic hours remaining nudge
```

> **Brevo marketing emails** use Brevo's drag-and-drop template editor — no React Email templates needed. Templates are managed directly in the Brevo dashboard.

---

## Transactional Email Formats (Finalized)

### Common Footer — all transactional emails

```
──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA — Rayasandra
──────────────────────────────────────────────────────────────
📞 +91 63601 35720 | theroyalglow.in
```

> Branch name in footer is dynamic — renders the correct branch as multi-branch expands.

### Invoice Footer — extended (invoice emails only)

```
──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA — Rayasandra
──────────────────────────────────────────────────────────────
"Thank you for choosing Royal Glow! ✨"
Review us on Google Maps → [Google Maps link]
Cancellation & Refund Policy: theroyalglow.in/refund-policy
This is a computer-generated invoice and does not require a physical signature.
```

---

### 1. Welcome / Onboarding Email

**Trigger:** Onboarding completed (profile created after first Google sign-in)
**Template:** `welcome.tsx`
**Subject:** `Welcome to the Royal Glow family, [First Name] 👑`

```
Hi [First Name],

We're so glad you're here. Royal Glow Salon & SPA is your space to
unwind, transform, and feel like royalty — every single visit.

Here's everything you need to get started:

──────────────────────────────────────────
🗓️  Book Your First Appointment
    theroyalglow.in → "Book Now"

💇‍♀️  Browse Our Services
    Salon: Haircuts, Facials, Waxing, Makeup & more
    SPA: Swedish, Thai, Aroma, Hot Stone & more
    → theroyalglow.in/services

🎁  Current Offers & Combos
    → theroyalglow.in/offers

💎  Royal Gems — Our Loyalty Program
    Earn 1 gem per ₹100 spent. Redeem for free services.
    → theroyalglow.in/gems

📍  Find Us
    1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd
    Parappana Agrahara, Bengaluru – 560100
    → Google Maps [link]
    📞 +91 63601 35720
──────────────────────────────────────────

Your first Royal Glow moment awaits. See you soon! ✨

──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA — Rayasandra
──────────────────────────────────────────────────────────────
theroyalglow.in | Instagram → @theroyalglow
📞 +91 63601 35720
```

**Template props:**
```ts
{
  firstName: string
  branchName: string           // "Rayasandra"
  branchAddress: string
  googleMapsUrl: string
  phone: string
}
```

---

### 2. Booking Confirmation (Pending)

**Trigger:** Booking created — status `pending`
**Template:** `booking-confirmation.tsx`
**Subject:** `Booking received, [First Name] — we'll confirm shortly 📞`

```
Hi [First Name],

Your booking request has been received! Our receptionist will call you
shortly to confirm your appointment.

──────────────────────────────────────────
📋  Booking Details

Booking:      #BKRS2605H38291
Date:         24 May 2026 (Saturday)
Time:         03:30 PM
Branch:       Rayasandra

[Salon/SPA] Services selected:
  • Classic Facial
  • Waxing — Full Arms
──────────────────────────────────────────

⏳ Status: Pending Confirmation
   Our team will reach out within 30 minutes during business hours.

[View My Bookings →]  theroyalglow.in/bookings

──────────────────────────────────────────
💡 Need to make changes?
   You can edit services, reschedule, or cancel from "My Bookings"
   while your booking is pending.
──────────────────────────────────────────

──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA — Rayasandra
──────────────────────────────────────────────────────────────
📍 1st Floor, Narmada Complex, Rayasandra Main Rd, Bengaluru – 560100
📞 +91 63601 35720 | theroyalglow.in
Cancellation & Refund Policy: theroyalglow.in/refund-policy
```

**Template props:**
```ts
{
  firstName: string
  bookingNumber: string        // "#BKRS2605H38291"
  bookingId: string            // for /bookings deep link
  bookingDate: string          // "24 May 2026 (Saturday)"
  bookingTime: string          // "03:30 PM"
  branchName: string           // "Rayasandra"
  serviceType: 'salon' | 'spa'
  services: { name: string }[]
}
```

---

### 3. Booking Approved

**Trigger:** Receptionist confirms booking — status moves to `confirmed`
**Template:** `booking-approved.tsx`
**Subject:** `You're all set, [First Name] ✅ See you on [Day]!`

```
Hi [First Name],

Great news — your booking is confirmed! We're looking forward to
seeing you.

──────────────────────────────────────────
✅  Confirmed Booking

Booking:      #BKRS2605H38291
Date:         24 May 2026 (Saturday)
Time:         03:30 PM
Branch:       Rayasandra

[Salon/SPA] Services:
  • Classic Facial              by Anjali                ₹   500.00
  • Waxing — Full Arms          by Priya                 ₹   800.00
──────────────────────────────────────────
Total (GST-inclusive)                                  ₹ 1,300.00
Payment: Cash / UPI / Card
──────────────────────────────────────────

📅  [Add to Google Calendar]

📍  Directions
    1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd
    → Open in Google Maps [link]

──────────────────────────────────────────
💡 Need to reschedule?
   You can reschedule (up to 2x) or cancel from "My Bookings"
   → theroyalglow.in/bookings
   Please cancel at least 4 hours before your appointment.
──────────────────────────────────────────

──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA — Rayasandra
──────────────────────────────────────────────────────────────
📞 +91 63601 35720 | theroyalglow.in
Cancellation & Refund Policy: theroyalglow.in/refund-policy
```

**Template props:**
```ts
{
  firstName: string
  bookingNumber: string
  bookingId: string
  bookingDate: string          // "24 May 2026 (Saturday)"
  bookingDay: string           // "Saturday" (for subject line)
  bookingTime: string          // "03:30 PM"
  branchName: string
  serviceType: 'salon' | 'spa'
  services: { name: string; staffName: string; pricePaise: number }[]
  totalPaise: number
  googleCalendarUrl: string    // pre-built gcal add link
  googleMapsUrl: string
}
```

---

### 4. Booking Rejected / Cancelled by Receptionist

**Trigger:** Receptionist rejects or cancels booking — status moves to `rejected` or `cancelled`
**Template:** `booking-rejected.tsx`
**Subject:** `Your booking couldn't be confirmed — here's what to do next`

```
Hi [First Name],

Unfortunately, your booking for [Date] could not be confirmed.

──────────────────────────────────────────
❌  Booking Not Confirmed

Booking:      #BKRS2605H38291
Date:         24 May 2026 (Saturday)
Time:         03:30 PM
Branch:       Rayasandra

Reason:       [Rejection reason from receptionist]
              e.g., "Staff unavailable for the selected time slot"
──────────────────────────────────────────

We're sorry for the inconvenience. You can easily book a new
appointment at a different time:

[Book Again →]  theroyalglow.in (click "Book Now")

Or call us directly:
📞 +91 63601 35720

──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA — Rayasandra
──────────────────────────────────────────────────────────────
📞 +91 63601 35720 | theroyalglow.in
```

**Template props:**
```ts
{
  firstName: string
  bookingNumber: string
  bookingDate: string          // "24 May 2026 (Saturday)"
  bookingTime: string
  branchName: string
  rejectionReason: string      // from receptionist
  phone: string
}
```

---

### 5. Appointment Reminder (24h / 1h)

**Trigger:**
- 24h before appointment (if booked >24h in advance)
- 1h before appointment (always sent)
- Same-day bookings: only 1h reminder (skip 24h)

**Template:** `appointment-reminder.tsx`
**Subject (24h):** `Tomorrow at [Time] — your Royal Glow appointment 💆‍♀️`
**Subject (1h):** `In 1 hour — your appointment at Royal Glow ⏰`

```
Hi [First Name],

[24h variant:] Just a reminder — you have an appointment tomorrow!
[1h variant:]  Your appointment starts in 1 hour. See you soon!

──────────────────────────────────────────
📋  Your Appointment

Booking:      #BKRS2605H38291
Date:         24 May 2026 (Saturday)
Time:         03:30 PM
Branch:       Rayasandra

Services:
  • Classic Facial              by Anjali
  • Waxing — Full Arms          by Priya

Duration:     ~90 min
──────────────────────────────────────────

📍  Directions
    1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd
    → Open in Google Maps [link]

──────────────────────────────────────────
⚠️  Can't make it?
    Cancel at least 4 hours before your appointment.
    → theroyalglow.in/bookings
──────────────────────────────────────────

──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA — Rayasandra
──────────────────────────────────────────────────────────────
📞 +91 63601 35720 | theroyalglow.in
```

**Template props:**
```ts
{
  firstName: string
  reminderType: '24h' | '1h'
  bookingNumber: string
  bookingDate: string          // "24 May 2026 (Saturday)"
  bookingTime: string          // "03:30 PM"
  branchName: string
  services: { name: string; staffName: string }[]
  totalDurationMinutes: number
  googleMapsUrl: string
  bookingId: string
}
```

**Scheduling logic:**
```
Booking confirmed:
  If bookingDate - now > 24h  → schedule 24h reminder + 1h reminder
  If bookingDate - now ≤ 24h  → schedule 1h reminder only
```

---

### 6. Membership Expiry Reminder (30d / 7d / 1d)

**Trigger:** pg_cron daily at 09:00 IST → finds active memberships where `expires_at = today + 30` / `+ 7` / `+ 1`
**Template:** `membership-expiry-reminder.tsx`
**Subject (30d):** `[First Name], 30 days left on your SPA membership`
**Subject (7d):** `Only 7 days left — don't let your hours expire ⏳`
**Subject (1d):** `Last day tomorrow! Book your remaining hours NOW`

```
Hi [First Name],

[30d:] Your Royal Glow SPA Membership expires in 30 days. You still
       have hours to enjoy — book them before they're gone!
[7d:]  Time is running out. 7 days left to use your remaining SPA hours.
       Don't leave them on the table.
[1d:]  This is your last chance. Your membership expires TOMORROW.
       Unused hours will be forfeited.

──────────────────────────────────────────
📊  Your Membership Status

Membership:    #RGMEM26XXXXX
Tier:          Gold
Expires on:    18/08/2026  ([30/7/1] days from today)

Hours used:    5 hrs 0 min
Hours left:    3 hrs 0 min
──────────────────────────────────────────
████████████████████░░░░░░░░░░░░  5 hrs used · 3 hrs remaining
──────────────────────────────────────────

📞  Call us to book your next session:
    +91 63601 35720

Or visit:
    [View My Membership →]  theroyalglow.in/membership

──────────────────────────────────────────
💡 Tip: Our receptionist can help you schedule multiple sessions
   to use your remaining hours before expiry.
──────────────────────────────────────────

──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA — Rayasandra
──────────────────────────────────────────────────────────────
📞 +91 63601 35720 | theroyalglow.in
```

**Template props:**
```ts
{
  firstName: string
  reminderType: '30d' | '7d' | '1d'
  membershipNumber: string     // "#RGMEM26XXXXX"
  membershipId: string
  tier: string
  expiresAt: string            // "18/08/2026"
  daysRemaining: number        // 30, 7, or 1
  usedHoursMinutes: number
  totalHoursMinutes: number
  remainingHoursMinutes: number
  progressPercent: number
  phone: string
}
```

---

### 7. Membership Expired

**Trigger:** pg_cron auto-expire job sets `status = 'expired'`
**Template:** `membership-expired.tsx`
**Subject:** `[First Name], your SPA membership has expired — let's renew`

```
Hi [First Name],

Your Royal Glow SPA Membership has expired. Any unused hours have
been forfeited.

──────────────────────────────────────────
📋  Expired Membership Summary

Membership:    #RGMEM26XXXXX
Tier:          Gold
Expired on:    18/08/2026

Total hours:   8 hrs
Hours used:    5 hrs 0 min
Hours lost:    3 hrs 0 min (forfeited)
──────────────────────────────────────────

We'd love to have you back. Visit your nearest branch and our team
will help you pick a membership that fits your schedule perfectly —
we even customize hours and pricing.

🏷️  Our Membership Tiers:
    • Silver — 8 hrs / 90 days / ₹10,000
    • Gold — 15 hrs / 90 days / ₹15,000
    • Platinum — custom hours & pricing

📞  Call to renew: +91 63601 35720
📍  Visit us: Rayasandra | Marathahalli (coming soon)

──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA — Rayasandra
──────────────────────────────────────────────────────────────
📞 +91 63601 35720 | theroyalglow.in
```

**Template props:**
```ts
{
  firstName: string
  membershipNumber: string
  tier: string
  expiredAt: string            // "18/08/2026"
  totalHoursMinutes: number
  usedHoursMinutes: number
  forfeitedHoursMinutes: number
  phone: string
  branches: { name: string; status: string }[]  // for "visit nearest branch"
}
```

---

### 8. Membership Hours Remaining (Periodic Nudge)

**Trigger:** QStash scheduled batch — every Wednesday at 11:00 IST. Picks active members with `remaining > 60 min` AND `expires_at ≤ today + 30 days`. Tracks `last_nudge_sent_at` to avoid resending within 7 days.
**Template:** `membership-hours-update.tsx`
**Subject:** `[First Name], you have [X hrs Y min] of SPA bliss waiting 💆‍♀️`

```
Hi [First Name],

Just checking in — your SPA membership still has unused hours. Don't
let them go to waste!

──────────────────────────────────────────
💆‍♀️  Your SPA Balance

Membership:    #RGMEM26XXXXX
Tier:          Gold

Hours remaining:  3 hrs 0 min
Valid until:      18/08/2026 (23 days left)
──────────────────────────────────────────
████████████████████░░░░░░░░░░░░  5 hrs used · 3 hrs remaining
──────────────────────────────────────────

That's enough for:
  • 3x 60-min sessions   OR
  • 2x 90-min sessions

Book your next session — treat yourself before they expire.

📞  Call to book: +91 63601 35720
🌐  [View My Membership →]  theroyalglow.in/membership

──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA — Rayasandra
──────────────────────────────────────────────────────────────
📞 +91 63601 35720 | theroyalglow.in
```

**Template props:**
```ts
{
  firstName: string
  membershipNumber: string
  membershipId: string
  tier: string
  remainingHoursMinutes: number
  expiresAt: string
  daysRemaining: number
  totalHoursMinutes: number
  usedHoursMinutes: number
  progressPercent: number
  suggestedSessions: string    // "3x 60-min sessions OR 2x 90-min sessions"
  phone: string
}
```

---

### 9. Service Invoice

**Trigger:** Booking moves to `completed`, invoice generated
**Template:** `invoice-service.tsx`
**Subject:** `Hey [First Name], Your Royal Glow receipt is ready.`

```
Hi [First Name],

You just had a Royal Glow moment — and we want it to last. Here's your
invoice for today's visit. Every service was crafted with care, just for you.

──────────────────────────────────────────
Salon Services availed:                     [or: SPA Services availed:]

1x Classic Facial            by [Staff Name]              ₹   500.00
1x Waxing — Full Arms        by [Staff Name]              ₹   800.00
──────────────────────────────────────────
Subtotal                                                  ₹   399.05
GST 18% (SAC 999721)                                      ₹    19.96
──────────────────────────────────────────
Paid (Cash / UPI / Card)                                  ₹   419.01
──────────────────────────────────────────
Amount in words: Rupees Four Hundred Nineteen and One Paise Only

Your invoice is attached as a PDF for your records.

Booking:    #BKRS2605H38291   [View Booking →]
Invoice:    #INV1262XXXXX
Date:       21 May 2026
Visit Time: 08:58 PM
Branch:     Rayasandra

──────────────────────────────────────────
Gems Earned This Visit: +7 gems  |  New Balance: 42 gems
Redeem at: theroyalglow.in/gems
──────────────────────────────────────────

[Common Footer]
```

> Gems section is hidden when `gemsEarned = 0` (e.g. membership sessions, gem-redemption bookings).

**Template props:**
```ts
{
  firstName: string
  serviceType: 'salon' | 'spa'
  lineItems: { name: string; staffName: string; pricePaise: number }[]
  subtotalPaise: number
  taxPaise: number
  discountPaise: number        // 0 if no discount
  totalPaise: number
  amountInWords: string
  paymentMethod: 'cash' | 'upi' | 'card' // selected by receptionist at checkout
  bookingNumber: string        // "#BKRS2605H38291"
  invoiceNumber: string        // "#INV1262XXXXX"
  bookingId: string            // for /bookings/[id] deep link
  date: string                 // "21 May 2026"
  visitTime: string            // "08:58 PM"
  branchName: string           // "Rayasandra"
  gemsEarned: number           // 0 = hide gems section
  newGemsBalance: number
}
```

---

### 10. Membership Purchase Invoice

**Trigger:** `spa_membership` record created
**Template:** `invoice-membership-purchase.tsx`
**Subject:** `You're in the Royal club, [First Name] — your X hrs are ready`

```
Hi [First Name],

Welcome to the inner circle. Your Royal Glow SPA Membership is now live —
X hours of pure indulgence, ready whenever you are. Book your first session
and let the transformation begin.

──────────────────────────────────────────
Membership:   #RGMEM26XXXXX   [View Membership →]
Tier:         Gold
Hours:        15 hrs (900 min)
Validity:     90 days (until 18/08/2026)
──────────────────────────────────────────
1x Gold SPA Membership                                    ₹ 15,000.00
──────────────────────────────────────────
Subtotal                                                  ₹ 12,711.86
GST 18% (SAC 999721)                                      ₹  2,288.14
──────────────────────────────────────────
Paid (Cash / UPI / Card)                                  ₹ 15,000.00
──────────────────────────────────────────
Amount in words: Rupees Fifteen Thousand Only

Your invoice is attached as a PDF for your records.

Invoice:   #INV1262XXXXX
Date:      21 May 2026
Branch:    Rayasandra

[Common Footer]
```

**Template props:**
```ts
{
  firstName: string
  membershipNumber: string     // "#RGMEM26XXXXX"
  membershipId: string         // for /membership deep link
  tier: string                 // "Silver" | "Gold" | "Platinum"
  totalHoursMinutes: number    // 900
  validityDays: number         // 90
  expiresAt: string            // "18/08/2026"
  tierLabel: string            // "1x Gold SPA Membership"
  subtotalPaise: number
  taxPaise: number
  totalPaise: number
  amountInWords: string
  paymentMethod: 'cash' | 'upi' | 'card' // selected by receptionist at checkout
  invoiceNumber: string        // "#INV1262XXXXX"
  date: string                 // "21 May 2026"
  branchName: string           // "Rayasandra"
}
```

---

### 11. Membership Session Confirmation (₹0)

**Trigger:** Membership session recorded by admin
**Template:** `invoice-membership-session.tsx`
**Subject:** `Session done. [X hrs Y min] still waiting for you`

```
Hi [First Name],

You showed up for yourself today — and that matters. Your SPA session has
been recorded and your membership balance updated. Here's your session summary.

──────────────────────────────────────────
SPA Session availed:

1x Aroma Therapy (60 min)      by [Staff Name]            ₹ 2,500.00
──────────────────────────────────────────
Session Total         ₹0.00  (Included in Membership)
──────────────────────────────────────────

Booking:   #BKRS2605S71042M   [View Booking →]
Date:      21 May 2026
Branch:    Rayasandra

──────────────────────────────────────────
Membership Balance:  #RGMEM26XXXXX   [View Membership →]
Tier:       Gold
Hours used: 1 hr 0 min
Remaining:  7 hrs 0 min  (42 days left · until 18/08/2026)

████████████░░░░░░░░░░░░░░░░░░░░  1 hr used · 7 hrs remaining
──────────────────────────────────────────
Invoice:    #INV1262XXXXX  (₹0.00 — for your records)
A ₹0.00 invoice is attached as a PDF.

[Common Footer]
```

**Template props:**
```ts
{
  firstName: string
  sessionItems: { name: string; durationMinutes: number; staffName: string; valuePaise: number }[]
  bookingNumber: string        // "#BKRS2605S71042M"
  bookingId: string
  date: string                 // "21 May 2026"
  branchName: string           // "Rayasandra"
  membershipNumber: string     // "#RGMEM26XXXXX"
  membershipId: string
  tier: string
  usedHoursMinutes: number     // 60
  totalHoursMinutes: number    // 480
  remainingHoursMinutes: number // 420
  daysRemaining: number        // 42
  expiresAt: string            // "18/08/2026"
  progressPercent: number      // usedHoursMinutes / totalHoursMinutes * 100
  invoiceNumber: string        // "#INV1262XXXXX"
}
```

---

## Implementation Pattern

```ts
// packages/business/invoicing/send.ts
import { Resend } from 'resend'
import { InvoiceServiceEmail } from '@repo/emails/invoice-service'

const resend = new Resend(process.env.RESEND_API_KEY)

async function sendServiceInvoice(invoice: Invoice, booking: Booking, customer: User) {
  // 1. Generate PDF via Render Node.js API
  const res = await fetch(`${process.env.PDF_API_URL}/invoices/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId: invoice.id }),
  })
  const pdfBuffer = Buffer.from(await res.arrayBuffer())

  // 2. Send email with PDF attached
  await resend.emails.send({
    from: 'Royal Glow <hello@theroyalglow.in>',
    to: customer.email,
    subject: `Hey ${customer.firstName}, Your Royal Glow receipt is ready.`,
    react: InvoiceServiceEmail(buildServiceEmailProps(invoice, booking, customer)),
    attachments: [{
      filename: `RoyalGlow-Invoice-${invoice.invoiceNumber}.pdf`,
      content: pdfBuffer,
    }],
  })
}
```

---

## Onboarding Screen Requirements

The first-time user onboarding screen must include:

- [ ] Marketing consent checkbox: *"I agree to receive promotional emails and offers from Royal Glow Salon & Spa"*
- [ ] This consent is stored on the user record in the neon database (`marketing_consent` boolean)
- [ ] Only users with `marketing_consent = true` are added to Brevo subscriber lists

---

## Brevo — Contact Sync & Segmentation

### Contact Sync Strategy

When a user completes onboarding with `marketing_consent = true`, sync to Brevo Contacts:

```ts
// Triggered after onboarding completion
await brevo.contacts.create({
  email: user.email,
  attributes: {
    FIRSTNAME: user.firstName,
    LASTNAME: user.lastName,
    PHONE: user.phone,
    BRANCH: user.primaryBranch,           // "Rayasandra"
    SIGNUP_DATE: user.createdAt,
    HAS_MEMBERSHIP: false,
    MEMBERSHIP_TIER: null,
    LAST_VISIT_DATE: null,
    TOTAL_VISITS: 0,
    TOTAL_SPEND_PAISE: 0,
  },
  listIds: [BREVO_LIST_ALL_CUSTOMERS],
})
```

**Attribute updates** — sync on every relevant event:

| Event | Attributes Updated |
|-------|-------------------|
| Booking completed | `LAST_VISIT_DATE`, `TOTAL_VISITS` +1, `TOTAL_SPEND_PAISE` |
| Membership purchased | `HAS_MEMBERSHIP` = true, `MEMBERSHIP_TIER`, `MEMBERSHIP_EXPIRES_AT` |
| Membership expired | `HAS_MEMBERSHIP` = false, `MEMBERSHIP_TIER` = null |

### Segmentation (Brevo Lists)

| List | Criteria | Purpose |
|------|----------|---------|
| All Customers | `marketing_consent = true` | Seasonal offers, announcements |
| Active Members | `HAS_MEMBERSHIP = true` | Membership-specific campaigns |
| Lapsed Members | Membership expired in last 90d | Renewal nudges |
| Inactive 60d+ | `LAST_VISIT_DATE` < today - 60 | Re-engagement |
| VIP (≥10 visits) | `TOTAL_VISITS >= 10` | Exclusive offers |

> Segment membership is recalculated on attribute sync — Brevo handles this automatically via segment conditions.

### Consent & Unsubscribe Flow

```
User unsubscribes (via Brevo link in email footer)
  → Brevo webhook fires to our API
  → App sets marketing_consent = false in DB
  → Contact removed from all marketing lists
  → User still receives Resend transactional emails (unaffected)
```

---

## Brevo Marketing Email Formats

### Common Marketing Footer — all Brevo emails

```
──────────────────────────────────────────────────────────────
              Royal Glow Salon & SPA
──────────────────────────────────────────────────────────────
📍 1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd
   Parappana Agrahara, Bengaluru – 560100
📞 +91 63601 35720
🌐 theroyalglow.in | Instagram → @theroyalglow

You received this because you opted in to marketing emails.
[Unsubscribe] | [Manage Preferences]
──────────────────────────────────────────────────────────────
```

> `[Unsubscribe]` link is auto-injected by Brevo. Required by CAN-SPAM / DPDP Act.

---

### 1. Post-Service Follow-up

**Trigger:** Automated — 2 days after booking `status = 'completed'`
**Automation:** Brevo workflow triggered via API event `booking_completed`
**Audience:** Customer who just completed the booking (must have `marketing_consent = true`)
**Subject:** `How was your visit, [First Name]? 💕 Here's a little thank you`

```
Hi [First Name],

We hope you loved your time at Royal Glow! Your feedback helps us
serve you better.

──────────────────────────────────────────
⭐  Rate Your Experience

How was your recent visit on [Booking Date]?

    [⭐⭐⭐⭐⭐  Leave a Google Review]
    → [Google Maps Review Link]

Your review means the world to us and helps others discover
Royal Glow.
──────────────────────────────────────────

🎁  As a thank you — here's something special:

┌─────────────────────────────────────────┐
│  10% OFF your next Salon booking        │
│                                         │
│  Use code: THANKYOU10                   │
│  Valid until: [Date + 30 days]          │
│  Book now → theroyalglow.in             │
└─────────────────────────────────────────┘

See you again soon! ✨

[Marketing Footer]
```

**Brevo workflow:**
```
Event: booking_completed (via API)
  → Wait 2 days
  → Condition: marketing_consent = true
  → Send template: post-service-followup
```

**Dynamic variables:**
```
{{ contact.FIRSTNAME }}
{{ params.BOOKING_DATE }}       // "18 May 2026"
{{ params.SERVICES }}           // "Classic Facial, Waxing — Full Arms"
{{ params.GOOGLE_REVIEW_URL }}
{{ params.OFFER_CODE }}         // "THANKYOU10"
{{ params.OFFER_EXPIRY }}       // "17 Jun 2026"
```

---

### 2. Re-engagement (Inactive 60+ Days)

**Trigger:** Automated — Brevo segment condition `LAST_VISIT_DATE < today - 60`
**Automation:** Brevo workflow runs weekly, targets contacts entering "Inactive 60d+" segment
**Audience:** Customers who haven't visited in 60+ days
**Subject:** `We miss you, [First Name]! Come back to Royal Glow 💆‍♀️`

```
Hi [First Name],

It's been a while since your last visit — and we miss pampering you!

Royal Glow has some exciting updates since you were last here:

🆕  What's New:
    • New SPA therapy: Hot Stone Relaxation (60 min)
    • Extended hours: Now open until 8 PM on weekends
    • Loyalty program: Earn gems on every visit

──────────────────────────────────────────

🎁  Welcome Back Offer — Just For You

┌─────────────────────────────────────────┐
│  15% OFF any service                    │
│                                         │
│  Use code: MISSYOU15                    │
│  Valid until: [Date + 14 days]          │
│  One-time use only                      │
└─────────────────────────────────────────┘

[Book Now →]  theroyalglow.in

──────────────────────────────────────────

Or call us to book:
📞 +91 63601 35720

We'd love to see you again, [First Name]. ✨

[Marketing Footer]
```

**Brevo workflow:**
```
Segment entry: "Inactive 60d+"
  → Wait 1 day (batching)
  → Condition: has NOT received re-engagement email in last 90 days
  → Send template: re-engagement
  → If no open in 7 days → Send reminder (optional)
```

**Dynamic variables:**
```
{{ contact.FIRSTNAME }}
{{ params.OFFER_CODE }}         // "MISSYOU15"
{{ params.OFFER_EXPIRY }}       // 14 days from send
{{ params.DAYS_INACTIVE }}      // "67"
```

---

### 3. Seasonal / Festival Offer

**Trigger:** Manual — Owner/Manager creates campaign in Brevo dashboard
**Audience:** "All Customers" list (or targeted segment)
**Frequency:** 4–6 times per year (Diwali, Christmas, New Year, Summer, Ugadi, Women's Day)
**Subject examples:**
- `Diwali Glow-Up, [First Name] ✨ Up to 30% OFF all services`
- `Summer Refresh: Cool SPA packages starting ₹2,999`
- `Happy Women's Day! A special treat from Royal Glow 👑`

```
Hi [First Name],

[Festival greeting — e.g., "Wishing you a sparkling Diwali!"]

This [festival], treat yourself (or someone special) to the
Royal Glow experience:

──────────────────────────────────────────
🎉  [Festival Name] Special Offers

🏷️  Offer 1: [Service/Combo Name]
    [Original Price] → [Discounted Price]
    Save [X]%

🏷️  Offer 2: [Service/Combo Name]
    [Original Price] → [Discounted Price]
    Save [X]%

🏷️  Offer 3: SPA Membership — [Festival] Special
    Buy [X] hrs, get [Y] hrs FREE
    Limited period only
──────────────────────────────────────────

⏰  Offer valid: [Start Date] – [End Date]

[View All Offers →]  theroyalglow.in/offers
[Book Now →]  theroyalglow.in

──────────────────────────────────────────

📞 +91 63601 35720
Walk-ins welcome | Advance booking recommended

[Marketing Footer]
```

> **Note:** This is a Brevo drag-and-drop template. Owner/Manager edits the content directly in the Brevo campaign editor — no developer involvement needed.

**Template placeholders (set in Brevo editor):**
```
{{ contact.FIRSTNAME }}
[Festival name, offers, dates — manually entered by Owner/Manager]
```

---

### 4. New Offer Announcement

**Trigger:** Manual or semi-automated — when Owner adds a new offer on `/admin/offers`
**Automation option:** API call to Brevo on offer publish → triggers campaign
**Audience:** "All Customers" list
**Subject:** `New at Royal Glow: [Offer Name] — [X]% OFF 🎁`

```
Hi [First Name],

Something new just dropped at Royal Glow — and we wanted you to be
the first to know!

──────────────────────────────────────────
🆕  [Offer Name]

[Offer description — e.g., "Get a luxurious Swedish Massage +
Classic Facial combo at an unbeatable price"]

💰  [Original Price] → [Offer Price]
    You save: ₹[Savings]

⏰  Valid: [Start Date] – [End Date]
    [Or: "Limited slots available"]
──────────────────────────────────────────

[View Offer →]  theroyalglow.in/offers
[Book Now →]  theroyalglow.in

──────────────────────────────────────────

📞 Have questions? Call us:
   +91 63601 35720

[Marketing Footer]
```

**Semi-automated flow:**
```
Owner publishes offer on /admin/offers
  → App calls Brevo API: create campaign from template
  → Owner reviews in Brevo dashboard
  → Owner clicks "Send" (manual approval gate)
```

**Dynamic variables:**
```
{{ contact.FIRSTNAME }}
{{ params.OFFER_NAME }}
{{ params.OFFER_DESCRIPTION }}
{{ params.ORIGINAL_PRICE }}
{{ params.OFFER_PRICE }}
{{ params.SAVINGS }}
{{ params.VALID_FROM }}
{{ params.VALID_UNTIL }}
{{ params.OFFER_URL }}
```

---

### 5. Membership Renewal Nudge (Brevo)

**Trigger:** Automated — 7 days after membership expires (complements Email #7 from Resend which fires on expiry day)
**Automation:** Brevo workflow triggered when contact enters "Lapsed Members" segment AND `days_since_expiry >= 7`
**Audience:** Expired members who haven't renewed
**Subject:** `[First Name], your SPA membership perks are waiting — renew today`

```
Hi [First Name],

It's been a week since your Royal Glow SPA Membership expired.
We'd hate for you to lose the benefits you love.

──────────────────────────────────────────
💎  What You're Missing:

    ✗  Priority booking slots
    ✗  Discounted hourly SPA rates
    ✗  Membership-only seasonal perks
    ✗  Gem bonus on every session

──────────────────────────────────────────

🏷️  Renew & Save — Our Membership Tiers:

┌─────────────────────────────────────────┐
│  🥈 Silver   8 hrs / 90 days   ₹10,000 │
│  🥇 Gold    15 hrs / 90 days   ₹15,000 │
│  💎 Platinum  Custom hours & pricing    │
└─────────────────────────────────────────┘

💡  Not sure which tier? Our team can help you choose the
    perfect plan for your schedule.

📞  Call to renew: +91 63601 35720
📍  Walk in: Rayasandra branch

──────────────────────────────────────────

🎁  Renewal Bonus: Renew within 14 days of expiry and
    receive 30 bonus minutes FREE.

[Marketing Footer]
```

**Brevo workflow:**
```
Segment entry: "Lapsed Members" (membership expired)
  → Wait 7 days
  → Condition: HAS_MEMBERSHIP = false AND marketing_consent = true
  → Condition: has NOT renewed (check via attribute)
  → Send template: membership-renewal-nudge
  → If no open in 7 days → Send final reminder (day 14)
```

**Dynamic variables:**
```
{{ contact.FIRSTNAME }}
{{ contact.MEMBERSHIP_TIER }}       // previous tier
{{ params.EXPIRED_DATE }}
{{ params.DAYS_SINCE_EXPIRY }}
{{ params.RENEWAL_DEADLINE }}       // expiry + 14 days (for bonus)
```

---

## Brevo Integration Architecture

### API Events (App → Brevo)

Our app fires Brevo tracking events to trigger automated workflows:

```ts
// packages/integrations/brevo/events.ts
import { ApiClient, TransactionalEmailsApi } from '@getbrevo/brevo'

const brevo = new ApiClient()
brevo.authentications['apiKey'].apiKey = process.env.BREVO_API_KEY

// Fire event to trigger Brevo automation
export async function trackBrevoEvent(
  email: string,
  event: string,
  properties: Record<string, unknown>
) {
  await fetch('https://in-automate.brevo.com/api/v2/trackEvent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ma-key': process.env.BREVO_AUTOMATION_KEY!,
    },
    body: JSON.stringify({
      email,
      event,
      properties,
    }),
  })
}
```

### Events Fired

| Event Name | When | Properties |
|-----------|------|------------|
| `booking_completed` | After invoice generated | `booking_date`, `services`, `total_amount_paise`, `branch` |
| `membership_expired` | pg_cron auto-expire | `tier`, `expired_at`, `hours_forfeited` |
| `offer_published` | Owner publishes offer | `offer_name`, `offer_url`, `valid_until` |

### Webhook: Brevo → App

```
POST /api/webhooks/brevo

Events handled:
  - unsubscribe → set marketing_consent = false
  - hard_bounce → mark email invalid, stop all sends
  - spam_complaint → set marketing_consent = false, flag account
```

### Campaign Creation Flow (Owner/Manager)

```
┌──────────────────────────────────────────────────────────────┐
│                     Campaign Workflow                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Automated (no human action):                                │
│    booking_completed event → 2-day delay → post-service      │
│    segment entry (inactive 60d) → re-engagement              │
│    segment entry (lapsed member) → 7-day delay → renewal     │
│                                                              │
│  Semi-automated (Owner approves in Brevo):                   │
│    offer_published event → draft campaign created             │
│    → Owner reviews in Brevo → clicks Send                    │
│                                                              │
│  Manual (Owner creates in Brevo dashboard):                  │
│    Seasonal offers, festival campaigns                        │
│    Uses drag-and-drop editor with brand template              │
│    Selects audience segment → schedules send                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Rate Limiting & Sending Limits

| Plan | Daily Limit | Notes |
|------|------------|-------|
| Free tier | 300 emails/day | Sufficient for early stage (< 100 active customers) |
| Starter (₹1,575/mo) | 20,000 emails/mo | When customer base exceeds ~200 |

> Marketing emails are batched — never send more than 1 marketing email per customer per 7 days (enforced via Brevo frequency capping rules).
