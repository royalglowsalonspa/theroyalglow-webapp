# Legal Pages

> Static legal/policy pages rendered with SSG. Customer layout (header + footer). Built once at build time. Required for DPDP Act compliance and business terms.

---

## 6.1 `/privacy` — Privacy Policy

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

## 6.2 `/terms` — Terms of Service

| Property | Detail |
|----------|--------|
| **Title** | Terms of Service |
| **Rendering** | SSG |
| **SEO** | `<title>Terms of Service | Royal Glow Salon & SPA</title>` |
| **Canonical** | `https://theroyalglow.in/terms` |

**Content covers:** service usage terms, booking rules, account responsibilities, intellectual property, liability limitations, governing law (India), dispute resolution.

---

## 6.3 `/refund-policy` — Refund & Cancellation Policy

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
- No-show consequences (tier system):
  - Tier 1–3: CRM tag, no penalty
  - Tier 4+: future bookings require manager approval
  - Reset: 3 consecutive completed bookings clears no-show flag
- Salon-initiated cancellation: apology + priority rebooking
- Membership sessions: hours not deducted if salon cancels
- No online payments = no refund processing needed at launch
