# Deep Links & UTM Contracts

> These are not separate pages but URL patterns that trigger specific behaviour on existing pages. They define the contract between marketing channels and the application.

---

## URL Patterns

| URL Pattern | Behaviour | Source | Analytics |
|-------------|-----------|--------|-----------|
| `/?book=1` | Auto-opens 4-step booking dialog on homepage | General deep-link (shareable) | PostHog: `booking_started` |
| `/?book=1&utm_source=gmb` | Opens dialog + acquisition source = `gmb` | Google Maps / Google My Business action button | PostHog: source tracked |
| `/?book=1&utm_source=walkin` | Opens dialog + acquisition source = `walkin` | In-store QR code posters | PostHog: source tracked |
| `/?book=1&service=[slug]` | Opens dialog with service pre-selected in Step 3 | Service page "Book This" buttons | PostHog: service pre-selection |
| `/?book=1&leadId={id}` | Opens dialog with lead context linked (post-lead-capture redirect) | After `/book` form submit | Lead → booking conversion tracked |
| `/book?utm_source=meta&utm_campaign=X&utm_content=Y` | Meta ad landing page with full campaign tracking | Meta/Instagram ads only | Meta Pixel + CAPI + PostHog |

---

## Pre-Auth Preservation

Before Google OAuth redirect, all query params (`book`, `utm_source`, `utm_campaign`, `utm_content`, `leadId`, `service`) are stored in `sessionStorage`. After OAuth callback, they're read back to restore context (open dialog, assign source, link lead).
