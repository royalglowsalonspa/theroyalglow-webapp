# Lead Capture Flow — Meta Ad → Booking Conversion

> The paid acquisition funnel: user clicks a Meta/Instagram ad → lands on `/book` → submits lead form → redirected into homepage booking dialog → converts to a real booking. Designed for maximum conversion from cold ad traffic.

---

## 1. Complete Conversion Funnel

```
┌──────────────────────────────────────────────────────────────────────┐
│                    META AD → BOOKING FUNNEL                            │
└──────────────────────────────────────────────────────────────────────┘

  Meta/Instagram Ad                                   PIXEL EVENTS:
  (Facebook Feed, Instagram Stories, Reels)
        │                                             
        │  User taps ad                               
        ▼                                             
  ┌─────────────────┐                                 
  │  /book page     │ ─────────────────────────────── PageView
  │  (lead form)    │                                 
  └────────┬────────┘                                 
           │                                          
           │  Submits form (name, phone, service)     
           ▼                                          
  ┌─────────────────┐                                 
  │  POST /api/leads│ ─────────────────────────────── Lead (browser + CAPI)
  │  Lead created   │                                 
  └────────┬────────┘                                 
           │                                          
           │  Redirect: /?book=1&leadId={id}          
           ▼                                          
  ┌─────────────────┐                                 
  │  Homepage       │ ─────────────────────────────── InitiateCheckout
  │  Dialog opens   │                                 
  └────────┬────────┘                                 
           │                                          
           │  User must sign in (if not already)      
           ▼                                          
  ┌─────────────────┐                                 
  │  /sign-in       │ ─────────────────────────────── (no pixel event)
  │  Google OAuth   │                                 
  └────────┬────────┘                                 
           │                                          
           │  First time? → /onboarding               
           ▼                                          
  ┌─────────────────┐                                 
  │  /onboarding    │ ─────────────────────────────── CompleteRegistration
  │  Profile setup  │                                 
  └────────┬────────┘                                 
           │                                          
           │  Redirect back: /?book=1&leadId={id}     
           ▼                                          
  ┌─────────────────┐                                 
  │  Booking dialog │                                 
  │  4-step flow    │                                 
  └────────┬────────┘                                 
           │                                          
           │  Submits booking                          
           ▼                                          
  ┌─────────────────┐                                 
  │  Booking created│  lead.converted_booking_id set  
  │  status: pending│  lead.status → 'booked'         
  └────────┬────────┘                                 
           │                                          
           │  Receptionist confirms + completes       
           ▼                                          
  ┌─────────────────┐                                 
  │  Invoice paid   │ ─────────────────────────────── Purchase (CAPI)
  │  Revenue tracked│                                 
  └─────────────────┘                                 


  DROP-OFF POINTS (retargeting triggers):
  ───────────────────────────────────────
  • Views /book but doesn't submit → Retarget: "Complete your enquiry"
  • Submits lead but doesn't book  → Receptionist follow-up (48h)
  • Submits booking but doesn't show → No-show tracking
```

---

## 2. `/book` Page — Mobile Wireframe (Ad Landing)

```
┌─────────────────────────────────────┐
│                                     │
│  ┌─────────────────────────────┐    │
│  │       👑 Royal Glow          │    │
│  │      Salon & SPA            │    │
│  └─────────────────────────────┘    │
│                                     │
│  ⭐ 4.9 · 86 reviews · Bengaluru   │
│                                     │
│  ─────────────────────────────      │
│                                     │
│  "Tell us what you're               │
│   looking for"                      │
│                                     │
│  Name                               │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  Phone                              │
│  ┌─────────────────────────────┐    │
│  │ +91                         │    │
│  └─────────────────────────────┘    │
│                                     │
│  What are you interested in?        │
│  ┌─────────────────────────────┐    │
│  │ Facial & Skincare        ▼  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │   [ Continue to Booking ]   │    │  ← Primary CTA (brand colour)
│  └─────────────────────────────┘    │
│                                     │
│  ─────────────────────────────      │
│  📍 1st Floor, Narmada Complex      │
│     Rayasandra, Bengaluru           │
│  📞 +91 63601 35720                 │
│                                     │
└─────────────────────────────────────┘

DESIGN RULES:
─────────────
• NO header navigation — zero distractions
• NO footer links — only address + phone
• NO "Sign in" prompt — cold traffic won't sign in
• Trust signals ABOVE the form (stars, reviews, city)
• CTA says "Continue to Booking" NOT "Submit"
• Phone field: +91 prefix auto-shown, 10-digit validation
• Form fits above fold on most phones (no scrolling to CTA)
• Min touch target: 44px on all interactive elements
```

### Desktop Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│     ┌── Premium background (brand gradient or salon image) ──┐   │
│     │                                                         │   │
│     │         ┌───────────────────────────────────┐          │   │
│     │         │                                   │          │   │
│     │         │   👑 Royal Glow Salon & SPA        │          │   │
│     │         │   ⭐ 4.9 · 86 reviews · Bengaluru  │          │   │
│     │         │                                   │          │   │
│     │         │   ─────────────────────────────   │          │   │
│     │         │                                   │          │   │
│     │         │   "Tell us what you're            │          │   │
│     │         │    looking for"                   │          │   │
│     │         │                                   │          │   │
│     │         │   Name                            │          │   │
│     │         │   ┌─────────────────────────┐    │          │   │
│     │         │   │                         │    │          │   │
│     │         │   └─────────────────────────┘    │          │   │
│     │         │                                   │          │   │
│     │         │   Phone                           │          │   │
│     │         │   ┌─────────────────────────┐    │          │   │
│     │         │   │ +91                     │    │          │   │
│     │         │   └─────────────────────────┘    │          │   │
│     │         │                                   │          │   │
│     │         │   Interested in                   │          │   │
│     │         │   ┌─────────────────────────┐    │          │   │
│     │         │   │ Select service...    ▼  │    │          │   │
│     │         │   └─────────────────────────┘    │          │   │
│     │         │                                   │          │   │
│     │         │   ┌─────────────────────────┐    │          │   │
│     │         │   │ [ Continue to Booking ] │    │          │   │
│     │         │   └─────────────────────────┘    │          │   │
│     │         │                                   │          │   │
│     │         │   📍 Rayasandra · 📞 63601 35720  │          │   │
│     │         │                                   │          │   │
│     │         └───────────────────────────────────┘          │   │
│     │                                                         │   │
│     │         Card: max-width 480px, centered                │   │
│     └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Form States

### Idle State
```
All fields empty, CTA active
Phone field shows "+91" prefix placeholder
Service dropdown shows "Select service..."
```

### Validation Errors
```
┌─────────────────────────────────────┐
│  Name                               │
│  ┌─────────────────────────────┐    │
│  │                      ← red  │    │
│  └─────────────────────────────┘    │
│  ⚠️ Name is required                │
│                                     │
│  Phone                              │
│  ┌─────────────────────────────┐    │
│  │ +91 123          ← red     │    │
│  └─────────────────────────────┘    │
│  ⚠️ Enter a valid 10-digit mobile   │
│    number                           │
│                                     │
│  What are you interested in?        │
│  ┌─────────────────────────────┐    │
│  │ Select service...        ▼  │    │  ← no error (optional? or red)
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Submitting State
```
┌─────────────────────────────────────┐
│  (all fields disabled/greyed)       │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  ⟳ Processing...            │    │  ← spinner in button
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Success State (brief, before redirect)
```
┌─────────────────────────────────────┐
│                                     │
│         ✓ Thank you!                │
│                                     │
│   Taking you to booking...          │
│                                     │
│   (subtle confetti animation)       │
│                                     │
└─────────────────────────────────────┘

Duration: 1.5 seconds, then redirect to /?book=1&leadId={id}
```

### Error State (API failure)
```
┌─────────────────────────────────────┐
│                                     │
│  ❌ Something went wrong.            │
│                                     │
│  We couldn't process your request.  │
│  Please try again or call us        │
│  directly.                          │
│                                     │
│  [ Try Again ]                      │
│                                     │
│  📞 +91 63601 35720 (tap to call)   │
│                                     │
└─────────────────────────────────────┘
```

---

## 4. Service Interest Dropdown Options

```
┌─────────────────────────────────────┐
│  What are you interested in?    ▼   │
├─────────────────────────────────────┤
│  💇 Haircut & Styling               │
│  🎨 Hair Colouring / Treatment      │
│  💆 Facial & Skincare               │
│  🧴 Waxing                          │
│  💅 Manicure & Pedicure             │
│  💄 Makeup Services                 │
│  🧖 Hair SPA & Head Therapies      │
│  ── SPA Services ──                 │
│  🌿 Standard SPA (Swedish, Thai)    │
│  ✨ Premium SPA (Deep Tissue, Bali) │
│  👑 VVIP SPA (Hot Stone, Potli)     │
│  ── Other ──                        │
│  💍 Bridal Packages                 │
│  ❓ Other / Not Sure                │
└─────────────────────────────────────┘
```

---

## 5. UTM Parameter Handling

```
URL arriving from Meta ad:
https://theroyalglow.in/book?utm_source=meta&utm_campaign=facial_may&utm_content=carousel_1

┌──────────────────────────────────────────────────────┐
│  WHAT GETS STORED (on form submit):                   │
│                                                       │
│  lead table row:                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  name: "Priya"                                   │ │
│  │  phone: "+919876543210"                          │ │
│  │  service_interested: "facial_skincare"           │ │
│  │  source: "meta_ad"                               │ │
│  │  utm_source: "meta"                              │ │
│  │  utm_campaign: "facial_may"                      │ │
│  │  utm_content: "carousel_1"                       │ │
│  │  fbp: "_fbp cookie value" (from browser)         │ │
│  │  fbc: "_fbc cookie value" (click ID)             │ │
│  │  status: "new"                                    │ │
│  │  created_at: now()                                │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  WHAT FIRES TO META:                                  │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Browser Pixel: fbq('track', 'Lead', {           │ │
│  │    content_name: 'Facial & Skincare',            │ │
│  │    eventID: 'uuid-123...'                        │ │
│  │  })                                               │ │
│  │                                                   │ │
│  │  CAPI (server): POST graph.facebook.com/events   │ │
│  │    event_name: 'Lead'                             │ │
│  │    event_id: 'uuid-123...' (same = deduplication)│ │
│  │    user_data: { em: hash, ph: hash, fbp, fbc }  │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## 6. Post-Lead Redirect Flow

```
After lead form submit + 1.5s success animation:

Browser redirects to:
  https://theroyalglow.in/?book=1&leadId=lead_abc123

    │
    ▼
Homepage loads with book=1 query param
    │
    ├── User signed in? 
    │   ├── YES → Booking dialog opens immediately
    │   │         leadId passed to POST /api/bookings on submit
    │   │         → lead.converted_booking_id = new booking ID
    │   │         → lead.status = 'booked'
    │   │
    │   └── NO → Store { book:1, leadId } in sessionStorage
    │            → Redirect to /sign-in
    │            → After OAuth + onboarding → redirect back
    │            → Dialog opens with leadId context
    │
    ▼
Booking submitted with leadId linked
    │
    ▼
Lead is now "converted" — appears in admin pipeline as "Booked"
Revenue from this booking attributed to the original Meta campaign
```

---

## 7. Receptionist Follow-up Flow (Lead Not Converted)

```
Lead submitted but customer dropped off (didn't complete booking):

Timeline:
─────────
T+0min    Lead created (status: 'new')
T+48hrs   QStash job fires: /api/jobs/lead-followups
           │
           ▼
          Lead still in 'new' status?
           ├── YES → Alert receptionist:
           │         • Push notification
           │         • Ably: admin:bookings event
           │         • Dashboard "Stale Leads" count +1
           │
           └── NO → Already contacted/booked, skip


Admin sees in /admin/leads:

┌─────────────────────────────────────────────────────────────┐
│  Lead Pipeline                                               │
│                                                              │
│  New (3)         Contacted (1)     Follow-up (0)    Booked  │
│  ┌──────────┐   ┌──────────┐                               │
│  │ Priya    │   │ Rahul    │                               │
│  │ 📞 98765 │   │ 📞 87654 │                               │
│  │ Facial   │   │ SPA      │                               │
│  │ 🔴 48h+  │   │ 2d ago   │                               │
│  │ meta/    │   │ meta/    │                               │
│  │ facial_m │   │ spa_jun  │                               │
│  └──────────┘   └──────────┘                               │
│  ┌──────────┐                                               │
│  │ Aisha   │                                               │
│  │ 📞 76543 │                                               │
│  │ Haircut  │                                               │
│  │ 🔴 72h+  │  ← RED DOT = stale (needs attention)         │
│  └──────────┘                                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Receptionist actions:
  → Tap lead card → open lead detail
  → Call phone number
  → Open WhatsApp via AiSensy link
  → Update status to "Contacted"
  → Add note: "Called, interested in facial, booking for Saturday"
  → Create booking from lead (links the conversion)
```

---

## 8. Meta Ad Creative → Landing Page Connection

```
┌─────────────────────────────────────────────────────────────────┐
│  AD CREATIVE                    │  LANDING PAGE MATCH            │
├─────────────────────────────────┼─────────────────────────────────┤
│                                 │                                 │
│  "Hydrafacial from ₹1,499"     │  Service dropdown pre-selects   │
│  Image: facial being performed  │  "Facial & Skincare"            │
│  CTA: "Book Now"               │  (via utm_content parameter)    │
│                                 │                                 │
│  "Transform your hair"          │  Service dropdown pre-selects   │
│  Video: hair colouring          │  "Hair Colouring / Treatment"   │
│  CTA: "Book Now"               │                                 │
│                                 │                                 │
│  "Premium SPA experience"       │  Service dropdown pre-selects   │
│  Carousel: spa images           │  "Premium SPA"                  │
│  CTA: "Book Now"               │                                 │
│                                 │                                 │
└─────────────────────────────────┴─────────────────────────────────┘

URL structure for pre-selection:
  /book?utm_source=meta&utm_campaign=facial_may&utm_content=facial_skincare
                                                          ▲
                                                  maps to dropdown value
```

---

## 9. Why `/book` is Separate from Homepage Booking

```
┌────────────────────────────────┐     ┌────────────────────────────────┐
│   /book (Ad Landing)            │     │   /?book=1 (Homepage Dialog)    │
├────────────────────────────────┤     ├────────────────────────────────┤
│ • Cold traffic (never visited)  │     │ • Warm traffic (knows brand)   │
│ • No sign-in required           │     │ • Sign-in required             │
│ • Creates LEAD row              │     │ • Creates BOOKING row          │
│ • 3 fields only (low friction)  │     │ • 4-step full flow             │
│ • No navigation (distraction    │     │ • Full navigation visible      │
│   free)                         │     │                                │
│ • Meta Pixel Lead event fires   │     │ • No Lead event (not a lead)   │
│ • Source: meta_ad               │     │ • Source: organic/gmb/walkin   │
│ • After submit → redirects to  │     │ • Direct booking submission    │
│   homepage dialog               │     │                                │
│ • NEVER linked from site nav   │     │ • Primary CTA everywhere       │
└────────────────────────────────┘     └────────────────────────────────┘

KEY RULE: /book is ONLY for Meta/Instagram ad traffic.
          Homepage CTA, GMB, Google Maps, in-store QR → all use /?book=1
```

---

## 10. Conversion Attribution Chain

```
Meta Ad Click
    │
    ├── fbclid stamped on URL (Meta click ID)
    │   → _fbc cookie set by Pixel
    │
    ├── _fbp cookie set by Pixel (browser ID)
    │
    ▼
Lead form submitted
    │
    ├── Lead row: source='meta_ad', utm_campaign, fbc, fbp stored
    │
    ├── Meta Pixel: Lead event (browser, eventID=X)
    │
    ├── Meta CAPI: Lead event (server, event_id=X) ← deduplication
    │
    ▼
Customer books (links leadId)
    │
    ├── lead.converted_booking_id = booking.id
    │
    ▼
Receptionist marks completed + payment received
    │
    ├── Meta CAPI: Purchase event (server)
    │   { value: ₹1300, currency: 'INR', content_ids: [...] }
    │
    ▼
Meta Ads Manager shows:
    │
    ├── Campaign: "facial_may"
    │   ├── Leads: 15
    │   ├── Purchases: 8
    │   ├── Revenue: ₹12,400
    │   ├── ROAS: 4.1x
    │   └── Cost per Purchase: ₹375
    │
    └── This data trains Meta's algorithm to find more
        people like Priya who actually pay ₹1,300+ for facials
```

---

## 11. Page Design Constraints

| Rule | Reason |
|------|--------|
| No header/nav links | Zero exit paths — only the form CTA |
| No "sign in" prompt | Cold traffic bounces on auth screens |
| Trust signals above fold | Social proof reduces form abandonment |
| 3 fields maximum | Every extra field drops conversion ~10% |
| CTA text: "Continue to Booking" | Tells user what happens next (not "Submit") |
| Phone shows +91 prefix | Indian context, reduces typing |
| Address + phone in footer only | Legitimacy signal without competing with form |
| No mention of prices | Price can cause sticker shock before they experience the brand |
| Never link from main site | Would pollute organic/GMB attribution |
| robots: noindex, nofollow | Not an SEO page — ad traffic only |
