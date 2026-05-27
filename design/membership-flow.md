# SPA Membership Flow — Design Reference

> Complete lifecycle of SPA memberships: purchase by admin → hours tracking → session recording → expiry alerts → renewal. Covers all wireframes and state transitions.

---

## 1. Membership Lifecycle (State Machine)

```
Admin creates membership for customer
    │
    ▼
┌──────────────┐
│    ACTIVE    │ ← Hours available, sessions can be recorded
└──────┬───────┘
       │
       ├── Sessions recorded (hours deducted over time)
       │
       ├── All hours used? → Still active until expires_at
       │
       │          Automated alerts:
       │          ├── 30 days before expiry → reminder email + push
       │          ├── 7 days before expiry → urgent reminder
       │          ├── 1 day before expiry → "Last chance!" alert
       │          └── Hours < 60 min → "Less than 1 hour left"
       │
       ├─── expires_at reached (auto by pg_cron):
       │    ▼
       │    ┌──────────────┐
       │    │   EXPIRED    │ → Unused hours forfeited
       │    └──────────────┘   → Final email with renewal CTA
       │
       └─── Manager/Owner cancels manually:
            ▼
            ┌──────────────┐
            │  CANCELLED   │ → Reason recorded
            └──────────────┘   → No refund (handled offline)


No rollover. No pause. No transfer between branches.
```

---

## 2. Create Membership — `/admin/memberships/new`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Create SPA Membership                                                   │
│  ════════════════════                                                    │
│                                                                          │
│  Customer                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 🔍 Search customer...                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  Selected: Priya Sharma — priya@gmail.com — 98765 43210                 │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────      │
│                                                                          │
│  Select Tier:                                                            │
│                                                                          │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐       │
│  │    🥈 Silver      │ │    🥇 Gold        │ │    💎 Platinum    │       │
│  │                   │ │    ▲ SELECTED    │ │                   │       │
│  │  8 hrs · ₹10,000 │ │ 15 hrs · ₹15,000│ │  Custom pricing  │       │
│  │  90 days          │ │ 90 days          │ │  Custom hours    │       │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘       │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────      │
│                                                                          │
│  Hours          (prefilled, overridable for negotiated deals)            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 15                                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Price (₹, GST-inclusive)                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 15,000                                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Start Date                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 24/05/2026 (today)                                       📅     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Expires: 21/08/2026 (90 days from start)  ← auto-calculated           │
│                                                                          │
│  Payment Method                                                          │
│  (●) Cash     ( ) UPI     ( ) Card                                      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              [ Create Membership ]                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  This will:                                                              │
│  • Generate membership_purchase invoice (₹15,000)                       │
│  • Email invoice + welcome message to customer                          │
│  • NO gems earned on membership purchase                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Membership Detail — `/admin/memberships/[id]`

### Active Membership (Hours Remaining)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Memberships                                                   │
│                                                                          │
│  Membership #RGMEM26190872                     Status: ● Active          │
│  ═══════════════════════════                                             │
│                                                                          │
│  Customer: Priya Sharma (→ view profile)                                │
│  Tier: 🥇 Gold                                                           │
│  Created: 24/05/2026                                                    │
│                                                                          │
│  ┌─ Hours Balance ──────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  ████████████████████░░░░░░░░░░░░  10 hrs used · 5 hrs remaining │   │
│  │                                                                   │   │
│  │  Used: 10 hrs 0 min  /  Total: 15 hrs  /  Remaining: 5 hrs      │   │
│  │                                                                   │   │
│  │  Expires: 21/08/2026 (58 days left)                              │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Session History ────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  Date        Service              Duration   Staff               │   │
│  │  ──────────────────────────────────────────────────────────────  │   │
│  │  20/06/26   Swedish Massage       90 min     Meera              │   │
│  │  15/06/26   Aroma Therapy         60 min     Deepa              │   │
│  │  08/06/26   Thai Massage          60 min     Meera              │   │
│  │  01/06/26   Hot Stone             90 min     Deepa              │   │
│  │  28/05/26   Swedish Massage       60 min     Meera              │   │
│  │  26/05/26   Deep Tissue           90 min     Deepa              │   │
│  │  24/05/26   Aroma Therapy         60 min     Meera              │   │
│  │                                                                   │   │
│  │  Total sessions: 7    Total hours used: 10 hrs 0 min             │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  [ Record Session ]              [ Cancel Membership ]           │   │
│  │  (blue, primary)                  (red outline, Manager+ only)   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Invoice: #INV1262XXXXX (membership_purchase) → View PDF                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Record Session Modal

```
Receptionist clicks "Record Session":

┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  Record Membership Session                                   │
│  ════════════════════════                                    │
│                                                              │
│  Member: Priya Sharma (#RGMEM26190872 · Gold)               │
│  Remaining: 5 hrs 0 min                                      │
│                                                              │
│  Service(s) performed:                                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ✓ Swedish Massage                                     │   │
│  │   Meera · [60 min ▼]                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Total duration: 60 min                                      │
│  After session: 4 hrs 0 min remaining                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           [ Record Session ]                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  This will:                                                  │
│  • Deduct 60 min from membership hours                      │
│  • Create ₹0 membership_session invoice                     │
│  • Email session confirmation to customer                   │
│  • NO gems earned                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘

VALIDATION: If requested duration > remaining hours:

┌──────────────────────────────────────────────────────────┐
│  ⚠️  Insufficient hours                                   │
│                                                           │
│  Requested: 90 min                                        │
│  Remaining: 30 min                                        │
│                                                           │
│  Cannot record this session. Customer can:                │
│  • Book a shorter session (≤30 min)                      │
│  • Pay per-service rate for excess time                   │
│                                                           │
│  [ Close ]                                                │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Customer Membership View — `/membership`

```
┌─────────────────────────────────────────────────────────────┐
│  My SPA Membership                                           │
│  ═════════════════                                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                      │    │
│  │  🥇 Gold Membership                                  │    │
│  │  #RGMEM26190872                                      │    │
│  │                                                      │    │
│  │  ████████████████████░░░░░░░░░░░░                    │    │
│  │  10 hrs used · 5 hrs remaining                       │    │
│  │                                                      │    │
│  │  Valid until: 21/08/2026 (58 days left)              │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Session History                                             │
│  ────────────────                                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  20 Jun 2026 · Swedish Massage · 90 min · Meera     │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  15 Jun 2026 · Aroma Therapy · 60 min · Deepa       │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  08 Jun 2026 · Thai Massage · 60 min · Meera        │    │
│  └─────────────────────────────────────────────────────┘    │
│  ... (pagination if > 10)                                    │
│                                                              │
│  ┌─ Past Memberships (1) ──────────────────────────────┐    │
│  │  ▶ Silver · Jan–Apr 2026 · 6/8 hrs used · Expired  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

URGENCY STATES:

≤30 days remaining:
┌──────────────────────────────────────────────────┐
│  ⚠️  Expires in 28 days. Book your remaining      │
│     hours before they're gone!                    │
│  📞 Call to book: +91 63601 35720                 │
└──────────────────────────────────────────────────┘

≤7 days remaining:
┌──────────────────────────────────────────────────┐
│  🔴 URGENT: Expires in 5 days!                    │
│     3 hrs remaining — will be forfeited.          │
│  📞 Call NOW: +91 63601 35720                     │
└──────────────────────────────────────────────────┘
```

---

## 6. Expiry Notification Timeline

```
                  Purchase                              Expiry
                     │                                    │
  ───────────────────┼────────────────────────────────────┼───────
                     │                                    │
                     │    ← 90 days (Gold default) →      │
                     │                                    │
                     │              T-30d    T-7d   T-1d  │
                     │                │       │      │    │
                     │                ▼       ▼      ▼    │
                     │            Email+   Email+  Email+ │
                     │            Push     Push    Push   │
                     │                                    │
                     │    If hours < 60min at any point:  │
                     │    → immediate push notification    │
                     │                                    │
                     │                                    ▼
                     │                              pg_cron runs:
                     │                              status → 'expired'
                     │                              +1h: final email
                     │                              with renewal CTA
```

---

## 7. Membership Tiers — Visual Comparison

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │                  │  │                  │  │                  │ │
│  │    🥈 Silver      │  │    🥇 Gold        │  │    💎 Platinum    │ │
│  │                  │  │                  │  │                  │ │
│  │  8 hours         │  │  15 hours        │  │  Custom hours   │ │
│  │  ₹10,000        │  │  ₹15,000        │  │  Negotiated     │ │
│  │  90 days         │  │  90 days         │  │  Custom validity│ │
│  │                  │  │                  │  │                  │ │
│  │  All SPA         │  │  All SPA         │  │  All SPA        │ │
│  │  services        │  │  services        │  │  services       │ │
│  │                  │  │                  │  │                  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                   │
│  • All tiers access ALL SPA services (Standard, Premium, VVIP)   │
│  • Hours are the only constraint                                  │
│  • Branch-locked (sessions only at purchase branch)              │
│  • No gems earned on purchase or sessions                        │
│  • Hours/price fully overridable at creation (negotiated deals)  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```
