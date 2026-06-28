# Auth Flow Pages

> Minimal layout — centered card, no main navigation. Focused on conversion. These pages handle Google OAuth sign-in and first-time user onboarding.

---

## 4.1 `/sign-in` — Sign In

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

## 4.2 `/onboarding` — Welcome Setup

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
