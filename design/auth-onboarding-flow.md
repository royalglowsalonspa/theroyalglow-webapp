# Authentication & Onboarding Flow — Design Reference

> The complete sign-in → onboarding → redirect journey. Google OAuth only — no email/password. Designed to minimise friction while collecting necessary data and consent.

---

## 1. Complete Auth Flow (State Machine)

```
User triggers action requiring auth (e.g., "Book Now")
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  CHECK: Is user signed in?                                    │
│                                                               │
│  ├── YES → Is profile complete?                               │
│  │         ├── YES → Proceed to action (open dialog, etc.)   │
│  │         └── NO → Redirect to /onboarding                  │
│  │                                                            │
│  └── NO → Store context in sessionStorage:                    │
│            { book: "1", utm_source, leadId, service }         │
│            → Redirect to /sign-in                             │
└──────────────────────────────────────────────────────────────┘
    │
    ▼ (user lands on /sign-in)

┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  /sign-in   │────▶│ Google OAuth  │────▶│ OAuth Callback  │
│  page       │     │ consent      │     │ /api/auth/...   │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    │                             │
                             First sign-in?                Returning user?
                                    │                             │
                                    ▼                             ▼
                          ┌─────────────────┐          ┌───────────────┐
                          │   /onboarding   │          │  Redirect to  │
                          │   (collect data)│          │  / (homepage) │
                          └────────┬────────┘          │  + restore    │
                                   │                   │  context      │
                                   ▼                   └───────────────┘
                          Profile saved
                          Consent stored
                          Source assigned
                                   │
                                   ▼
                          ┌───────────────┐
                          │  Redirect to  │
                          │  / (homepage) │
                          │  + restore    │
                          │  context      │
                          └───────────────┘
                                   │
                                   ▼
                          sessionStorage read:
                          book=1? → open dialog
                          leadId? → link lead
                          service? → pre-select
```

---

## 2. Sign-In Page — `/sign-in`

### Mobile Wireframe

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│          ┌───────────────┐          │
│          │  👑            │          │
│          │  Royal Glow   │          │
│          │  Salon & SPA  │          │
│          └───────────────┘          │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │  Sign in to Royal Glow     │    │
│  │                             │    │
│  │  Use your Google account    │    │
│  │  to continue                │    │
│  │                             │    │
│  │  ┌───────────────────────┐ │    │
│  │  │ 🔵 Sign in with Google│ │    │
│  │  └───────────────────────┘ │    │
│  │                             │    │
│  │  By signing in, you agree  │    │
│  │  to our Privacy Policy     │    │
│  │  and Terms of Service.     │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│                                     │
└─────────────────────────────────────┘
```

### Desktop Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│         ┌── Premium gradient/brand background ──────────┐        │
│         │                                                │        │
│         │              ┌───────────────┐                 │        │
│         │              │  👑 Royal Glow │                 │        │
│         │              └───────────────┘                 │        │
│         │                                                │        │
│         │    ┌──────────────────────────────────┐       │        │
│         │    │                                  │       │        │
│         │    │   Sign in to Royal Glow          │       │        │
│         │    │                                  │       │        │
│         │    │   Use your Google account        │       │        │
│         │    │   to continue                    │       │        │
│         │    │                                  │       │        │
│         │    │   ┌────────────────────────┐    │       │        │
│         │    │   │ 🔵 Sign in with Google │    │       │        │
│         │    │   └────────────────────────┘    │       │        │
│         │    │                                  │       │        │
│         │    │   By signing in, you agree to   │       │        │
│         │    │   our Privacy Policy and         │       │        │
│         │    │   Terms of Service.              │       │        │
│         │    │                                  │       │        │
│         │    └──────────────────────────────────┘       │        │
│         │                                                │        │
│         └────────────────────────────────────────────────┘        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

Card: max-width 400px, centered, rounded corners, shadow
```

### Sign-In States

```
STATE 1: Idle
┌───────────────────────┐
│ 🔵 Sign in with Google│  ← Active, clickable
└───────────────────────┘

STATE 2: Redirecting (after click)
┌───────────────────────┐
│ ⟳  Redirecting...     │  ← Disabled, spinner
└───────────────────────┘

STATE 3: Error (popup blocked / OAuth failed)
┌───────────────────────────────────────┐
│  ❌ Sign-in failed.                    │
│  Please allow popups or try again.    │
│                                        │
│  [ Try Again ]                         │
└───────────────────────────────────────┘
```

---

## 3. Pre-Redirect Context Preservation

```
BEFORE Google OAuth redirect:

┌──────────────────────────────────────────────────────┐
│  sessionStorage.setItem('rgss_auth_context', {       │
│    book: "1",              // was trying to book      │
│    utm_source: "gmb",     // came from Google Maps   │
│    utm_campaign: null,                                │
│    leadId: null,           // or "lead_xyz" if from   │
│    service: "classic-facial" // pre-selected service  │
│  })                                                   │
└──────────────────────────────────────────────────────┘

AFTER OAuth callback returns:

┌──────────────────────────────────────────────────────┐
│  const context = sessionStorage.get('rgss_auth_ctx') │
│                                                       │
│  if (context.book === "1") {                         │
│    // Redirect to homepage with dialog trigger       │
│    router.push(`/?book=1&service=${context.service}`)│
│  }                                                    │
│                                                       │
│  sessionStorage.remove('rgss_auth_context')          │
└──────────────────────────────────────────────────────┘
```

---

## 4. Onboarding Page — `/onboarding`

### Mobile Wireframe

```
┌─────────────────────────────────────┐
│                                     │
│  Welcome to Royal Glow, Priya! 👑   │
│  ═══════════════════════════════     │
│                                     │
│  Let's set up your profile          │
│                                     │
│  Name                               │
│  ┌─────────────────────────────┐    │
│  │ Priya Sharma               │    │
│  └─────────────────────────────┘    │
│                                     │
│  Email                              │
│  ┌─────────────────────────────┐    │
│  │ priya.sharma@gmail.com 🔒  │    │  ← greyed, locked
│  └─────────────────────────────┘    │
│                                     │
│  Phone                              │
│  ┌─────────────────────────────┐    │
│  │ +91 98765 43210            │    │
│  └─────────────────────────────┘    │
│                                     │
│  Date of Birth                      │
│  ┌─────────────────────────────┐    │
│  │ DD / MM / YYYY         📅  │    │
│  └─────────────────────────────┘    │
│                                     │
│  Gender                             │
│  ┌─────────────────────────────┐    │
│  │ Female                   ▼  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ─────────────────────────────      │
│  Privacy & Preferences              │
│  ─────────────────────────────      │
│                                     │
│  ☑ I agree to the Privacy Policy.  │
│    My data is stored securely on    │
│    Indian servers. (Required)       │
│                                     │
│  ☐ Help us improve Royal Glow —    │
│    allow anonymous usage analytics  │
│                                     │
│  ☐ Send me offers, updates &       │
│    promotions via email and         │
│    notifications                    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │       [ Let's Go! ]        │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### Onboarding States

```
STATE: Validation Error
┌─────────────────────────────┐
│  Phone                       │
│  ┌───────────────────────┐  │
│  │ 12345          ← red  │  │   ← red border
│  └───────────────────────┘  │
│  ⚠️ Enter a valid Indian     │   ← red text, aria-describedby
│    mobile number (+91 10 dig)│
└─────────────────────────────┘

┌─────────────────────────────┐
│  ☐ I agree to Privacy Policy│   ← red border
│  ⚠️ You must accept to       │
│    continue                  │
└─────────────────────────────┘


STATE: Submitting
┌─────────────────────────────┐
│  All fields disabled/greyed  │
│                              │
│  ┌────────────────────────┐ │
│  │  ⟳  Setting up...     │ │  ← spinner in button
│  └────────────────────────┘ │
└─────────────────────────────┘


STATE: Success
  (No success state shown — instant redirect to / )
  Cookie consent banner suppressed for checked categories
  Dialog auto-opens if book=1 was in sessionStorage
```

---

## 5. Onboarding Side Effects Flow

```
User clicks "Let's Go!" with valid form
    │
    ▼
POST /api/onboarding/complete
    │
    ├── 1. Save to customer_profile table:
    │       { name, phone, dob, gender, marketing_consent, analytics_consent }
    │
    ├── 2. Assign acquisition source:
    │       Read sessionStorage → utm_source
    │       ├── "gmb" → source = 'gmb'
    │       ├── "walkin" → source = 'walkin'
    │       ├── leadId exists → source = 'meta_ad'
    │       └── none → source = 'organic'
    │
    ├── 3. Write localStorage consent:
    │       rgss_cookie_consent = { v:1, analytics: ☑, marketing: ☑, ts: now }
    │
    ├── 4. If marketing_consent = true:
    │       → Sync contact to Brevo (subscriber list)
    │
    ├── 5. Fire Meta CAPI: CompleteRegistration event
    │
    ├── 6. Send welcome email via Resend (welcome.tsx template)
    │
    └── 7. Redirect to / (homepage)
            │
            └── If sessionStorage had book=1:
                → URL becomes /?book=1
                → Booking dialog auto-opens
```

---

## 6. Cookie Consent Banner (Post-Onboarding)

```
Logic: If user checked analytics AND marketing on onboarding:
       → Cookie banner NEVER shows (already consented)

       If user checked only marketing:
       → Banner shows only for analytics toggle

       If user checked nothing (only privacy required):
       → Full banner shows on next page visit


Banner wireframe (bottom of screen):

┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│  We use cookies to improve your experience and show you          │
│  relevant offers. You're in control — change preferences         │
│  any time.                                                        │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │ Accept All   │  │ Reject All   │  Manage Preferences ›      │
│  │ (solid/bold) │  │ (outline)    │  (text link)                │
│  └──────────────┘  └──────────────┘                             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

"Manage Preferences" expands inline to:

┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Necessary      Session & security         [████] ON 🔒  │ │
│  │  Analytics      PostHog, Clarity            [    ] OFF    │ │
│  │  Marketing      Meta Pixel, offers          [    ] OFF    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│                              [ Save Preferences ]                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Google Calendar Integration (Incremental Consent)

```
TIMING: Asked AFTER first booking is confirmed (not at sign-in)

Receptionist confirms booking
    │
    ▼
Customer receives confirmation + push notification
    │
    ▼
Next time customer opens /bookings:

┌─────────────────────────────────────────────────────┐
│                                                      │
│  📅 Add appointments to Google Calendar?             │
│                                                      │
│  Never miss an appointment — we'll add events       │
│  automatically when your bookings are confirmed.     │
│                                                      │
│  [ Not Now ]     [ Allow Calendar Access ]           │
│                                                      │
└─────────────────────────────────────────────────────┘
    │
    ├── "Not Now" → dismiss, ask again after next confirmed booking
    │
    └── "Allow Calendar Access"
            → Google OAuth incremental consent (calendar.events scope)
            → On success: create event for current confirmed booking
            → Future bookings: auto-create on confirmation
```

---

## 8. Session Expiry & Re-authentication

```
User's session expires (Better Auth session timeout)
    │
    ▼
User tries to access authenticated page (/bookings, /profile, etc.)
    │
    ▼
┌─────────────────────────────────────┐
│  Session Expired                     │
│                                      │
│  Your session has ended. Please      │
│  sign in again to continue.          │
│                                      │
│  [ Sign in with Google ]             │
└─────────────────────────────────────┘
    │
    ▼
Re-auth → redirect back to the page they were trying to access
(No onboarding needed — profile already complete)
```
