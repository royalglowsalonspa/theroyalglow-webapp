# CRM & Lead Pipeline — Design Reference

> Complete customer relationship management: customer profiles, CRM tagging, lead pipeline kanban, no-show tier progression, and acquisition source tracking. The command center for understanding and nurturing every customer relationship.

---

## 1. Customer Profile Page — `/admin/customers/[id]`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Customers                                                     │
│                                                                          │
│  ┌─ Header ─────────────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  👤 Priya Sharma                                                  │   │
│  │  📞 +91 98765 43210   ✉️ priya.sharma@gmail.com                   │   │
│  │  Gender: Female · Branch: Rayasandra · Since: Jan 2025           │   │
│  │                                                                   │   │
│  │  Tags:                                                            │   │
│  │  ┌──────────┐ ┌──────────────┐ ┌─────────┐ ┌──────────┐        │   │
│  │  │ 🏷 VIP    │ │ 🏷 SPA-lover  │ │ 🏷 loyal │ │  + Add   │        │   │
│  │  └──────────┘ └──────────────┘ └─────────┘ └──────────┘        │   │
│  │  (chips are removable ✕, "+ Add" opens autocomplete)             │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ KPI Cards ──────────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────┐ ┌──────┐│   │
│  │  │ Visits    │ │ LTV       │ │ Avg Spend │ │No-shows│ │ Gems ││   │
│  │  │   14      │ │ ₹18,200  │ │ ₹1,300   │ │   1    │ │  55  ││   │
│  │  └───────────┘ └───────────┘ └───────────┘ └────────┘ └──────┘│   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Tabs ───────────────────────────────────────────────────────────┐   │
│  │  [ Bookings ] [ Invoices ] [ Membership ] [ Gems ] [ Notes ]     │   │
│  │  ════════════                                                     │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │

│  ┌─ Bookings Tab (Active) ───────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  Date        Service              Status      Staff    Amount     │   │
│  │  ──────────────────────────────────────────────────────────────  │   │
│  │  20/06/26   Swedish Massage       ●Completed  Meera   ₹2,500    │   │
│  │  15/06/26   Facial + Waxing       ●Completed  Anjali  ₹1,800    │   │
│  │  01/06/26   Haircut               ●Completed  Priya M ₹  500    │   │
│  │  28/05/26   SPA Aroma Therapy     ●Completed  Deepa   ₹2,500    │   │
│  │  24/05/26   Facial                ●No-show    —       —         │   │
│  │                                                                   │   │
│  │  Showing 5 of 14 · [ Load More ]                                 │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Customer List Page — `/admin/customers`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Customers                                                    [ Export ] │
│  ═════════                                                               │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ 🔍 Search by name, phone, or email...                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Filters:                                                                │
│  ┌──────────┐ ┌────────────┐ ┌──────────────┐ ┌───────────────────┐   │
│  │Tags    ▼ │ │Visits    ▼ │ │Last Visit  ▼ │ │Sort: LTV desc   ▼ │   │
│  └──────────┘ └────────────┘ └──────────────┘ └───────────────────┘   │
│                                                                          │
│  Tag filter expanded:                                                    │
│  ┌──────────────────────────────┐                                       │
│  │ ☑ VIP    ☑ loyal             │                                       │
│  │ ☐ SPA-lover  ☐ late_cancel  │                                       │
│  │ ☐ membership  ☐ no_show_1   │                                       │
│  └──────────────────────────────┘                                       │
│                                                                          │
│  ┌────────┬─────────────┬───────────┬──────┬────────┬──────┬────────┐ │
│  │ Name   │ Phone       │ Tags      │Visits│ LTV    │ Gems │ Last   │ │
│  ├────────┼─────────────┼───────────┼──────┼────────┼──────┼────────┤ │
│  │Priya S.│ 98765 43210 │VIP,loyal  │  14  │₹18,200│  55  │ 20 Jun │ │
│  │Aisha K.│ 87654 32109 │SPA-lover  │   8  │₹12,500│  32  │ 18 Jun │ │
│  │Rahul M.│ 76543 21098 │—          │   3  │ ₹1,500│   8  │ 23 May │ │
│  │Meena R.│ 65432 10987 │no_show_2  │   5  │ ₹4,200│  12  │ 10 Jun │ │
│  └────────┴─────────────┴───────────┴──────┴────────┴──────┴────────┘ │
│                                                                          │
│  ← 1 2 3 ... 8 →           Showing 1–20 of 156 customers               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

Sort options: LTV (desc), Visits (desc), Last Visit (recent first),
              Name (A→Z), Gems (desc), No-shows (desc)
```

---


## 3. Lead Pipeline — Kanban Board `/admin/leads`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Lead Pipeline                                        [ + Manual Lead ] │
│  ═════════════                                                           │
│                                                                          │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬───────────┐ │
│  │  New (5)    │ Contacted(3)│ Follow-up(2)│  Booked (4) │Won/Lost   │ │
│  │═════════════│═════════════│═════════════│═════════════│═══════════│ │
│  │             │             │             │             │           │ │
│  │┌───────────┐│┌───────────┐│┌───────────┐│┌───────────┐│┌─────────┐│ │
│  ││ Priya     │││ Rahul     │││ Kavya     │││ Aisha     │││ Meena   ││ │
│  ││ 📞 98765  │││ 📞 87654  │││ 📞 76543  │││ 📞 65432  │││ ✓ Won   ││ │
│  ││ Facial    │││ SPA       │││ Haircut   │││ Waxing    │││ ₹2,500  ││ │
│  ││ meta/     │││ meta/     │││ meta/     │││ meta/     │││ 3 Jun   ││ │
│  ││ facial_may│││ spa_jun   │││ hair_jun  │││ wax_jun   ││└─────────┘│ │
│  ││ 🔴 3 days │││ 1 day ago │││ 🔴 5 days │││ Booked!   ││┌─────────┐│ │
│  │└───────────┘│└───────────┘│└───────────┘│└───────────┘││ Deepa   ││ │
│  │┌───────────┐│┌───────────┐│┌───────────┐│┌───────────┐││ ✕ Lost  ││ │
│  ││ Neha      │││ Sita      │││ Arjun     │││ Kiran     │││ Reason: ││ │
│  ││ 📞 54321  │││ 📞 43210  │││ 📞 32109  │││ 📞 21098  │││ "Too    ││ │
│  ││ Bridal    │││ Facial    │││ Massage   │││ Hair Color│││  far"   ││ │
│  ││ organic   │││ meta/     │││ meta/     │││ meta/     ││└─────────┘│ │
│  ││ 2 days    │││ 3 days    │││ 🔴 7 days │││ Today     ││           │ │
│  │└───────────┘│└───────────┘│└───────────┘│└───────────┘││           │ │
│  │             │             │             │             │           │ │
│  └─────────────┴─────────────┴─────────────┴─────────────┴───────────┘ │
│                                                                          │
│  Legend: 🔴 = Stale (48h+ no contact)   Cards show days since capture   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

Card Details:
┌─────────────────────────────┐
│  Name (lead name)           │
│  📞 Phone (tap to call)     │
│  Service interest (category)│
│  Campaign source/name       │
│  Days since capture         │
│  🔴 Stale indicator (48h+)  │
└─────────────────────────────┘
```

---

## 4. Lead Detail Page — `/admin/leads/[id]`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Pipeline                                                      │
│                                                                          │
│  ┌─ Info Card ──────────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  Lead: Priya Sharma                    Status: ● New              │   │
│  │  📞 +91 98765 43210 (tap to call)      Created: 22 May 2026      │   │
│  │  Interest: Facial & Skincare            Days: 3                   │   │
│  │                                                                   │   │
│  │  Actions:                                                         │   │
│  │  [ 📞 Call ] [ 💬 WhatsApp ] [ → Mark Contacted ] [ 🗑 Mark Lost ]│   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Attribution Panel ──────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  Source:      meta_ad                                             │   │
│  │  Campaign:    facial_may                                          │   │
│  │  Content:     carousel_1                                          │   │
│  │  Landing:     /book                                               │   │
│  │  fbp:         fb.1.168...                                         │   │
│  │  fbc:         fb.1.168...click123                                 │   │
│  │                                                                   │   │
│  │  Linked Customer: — (not yet signed up)                          │   │
│  │  Converted Booking: — (not yet booked)                           │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Notes Timeline ────────────────────────────────────────────────┐    │
│  │                                                                   │   │
│  │  24 May · 11:30 AM · Anjali (Receptionist)                       │   │
│  │  "Called, interested in facial. Wants Saturday 3 PM."            │   │
│  │                                                                   │   │
│  │  22 May · 02:15 PM · System                                      │   │
│  │  "Lead created from Meta ad (facial_may campaign)"               │   │
│  │                                                                   │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │ Add note...                                    [ Save ] │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---


## 5. Lead Status Flow — State Machine

```
                Lead form submitted (Meta ad / manual entry)
                                 │
                                 ▼
                         ┌──────────────┐
                         │     NEW      │ ← Initial state
                         └──────┬───────┘
                                │
                                │  Receptionist calls/messages
                                ▼
                         ┌──────────────┐
                         │  CONTACTED   │ ← First contact made
                         └──────┬───────┘
                                │
                    ┌───────────┼───────────┐
                    │                       │
                    ▼                       ▼
           ┌──────────────┐       ┌──────────────┐
           │  FOLLOW_UP   │       │    BOOKED    │ ← Booking created with leadId
           └──────┬───────┘       └──────┬───────┘
                  │                       │
                  │  Eventually books     │  Booking completed + paid
                  │  or gives up          │
                  ▼                       ▼
           ┌──────────────┐       ┌──────────────┐
           │     LOST     │       │     WON      │ ← Invoice paid, revenue attributed
           └──────────────┘       └──────────────┘
           (reason recorded)      (LTV tracked)


  TRANSITIONS:
  ─────────────
  new → contacted      Receptionist marks after first call/WhatsApp
  new → lost           Lead unreachable after 5 attempts over 14 days
  contacted → follow_up   Needs more nurturing, appointment not yet set
  contacted → booked      Customer books (manual or self-service)
  follow_up → booked      Customer books after follow-up
  follow_up → lost        Customer declines / unresponsive 14d+
  booked → won            Booking completed + invoice paid
  booked → lost           Booking cancelled / no-show (rare)

  AUTOMATIC TRANSITIONS:
  ─────────────────────
  • new → stale alert (48h, no status change) — push to receptionist
  • booked → won (auto when booking.status = 'completed')
```

---

## 6. CRM Tagging System

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CRM TAG SYSTEM                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  AUTOMATIC TAGS (system-assigned after events):                          │
│  ─────────────────────────────────────────────                          │
│                                                                          │
│  Tag               │ Trigger                          │ Removable?       │
│  ──────────────────┼──────────────────────────────────┼─────────────     │
│  vip               │ LTV ≥ ₹25,000                   │ No (auto-calc)  │
│  loyal             │ ≥ 10 completed bookings          │ No (auto-calc)  │
│  membership        │ Active membership exists         │ No (auto-sync)  │
│  spa_lover         │ ≥ 5 SPA bookings completed      │ No (auto-calc)  │
│  new_customer      │ 1 completed booking only         │ No (auto-calc)  │
│  no_show_1         │ 1 no-show recorded              │ No (auto)       │
│  no_show_2         │ 2 no-shows recorded             │ No (auto)       │
│  no_show_3         │ 3 no-shows (deposit required)   │ No (auto)       │
│  late_cancellation │ Cancelled < 4h before slot      │ No (auto)       │
│  dormant           │ No visit in 60+ days            │ No (auto-calc)  │
│  at_risk           │ Was loyal, now dormant 30+ days │ No (auto-calc)  │
│                                                                          │
│  MANUAL TAGS (receptionist/manager assigns):                            │
│  ──────────────────────────────────────────                             │
│                                                                          │
│  Tag               │ Use Case                                            │
│  ──────────────────┼────────────────────────────────────────────────     │
│  bridal            │ Bridal package client                              │
│  influencer        │ Social media collaboration                         │
│  corporate         │ Company-referred client                            │
│  friend_of_owner   │ Personal connection (no special pricing)           │
│  difficult         │ Frequent complaints / high-maintenance             │
│  price_sensitive   │ Always asks for discounts                          │
│  feedback_given    │ Left Google review                                 │
│                                                                          │
│  ADDING TAGS:                                                            │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │  Tags: [VIP ✕] [loyal ✕] [spa_lover ✕] [ + Add tag... ]    │        │
│  │                                          ┌──────────────┐   │        │
│  │  Autocomplete dropdown shows:            │ bridal       │   │        │
│  │  - Existing tags (type-ahead)            │ influencer   │   │        │
│  │  - Create new: "corporate_xyz"           │ corporate    │   │        │
│  │  - Max 10 tags per customer              │ + Create new │   │        │
│  │                                          └──────────────┘   │        │
│  └─────────────────────────────────────────────────────────────┘        │
│                                                                          │
│  Auto tags: grey chips (non-removable, system badge icon)               │
│  Manual tags: coloured chips (removable with ✕)                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---


## 7. No-Show Tier Progression Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NO-SHOW TIER SYSTEM                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Count │ Tag        │ Consequence                    │ Recovery Path     │
│  ──────┼────────────┼────────────────────────────────┼─────────────────  │
│   1st  │ no_show_1  │ Warning SMS/push sent          │ Complete next     │
│        │            │ "We missed you today!"         │ booking = reset   │
│        │            │ No penalty                     │ to no_show_0     │
│        │            │                                │                   │
│   2nd  │ no_show_2  │ Phone call from receptionist   │ Complete 2        │
│        │            │ Marked in CRM                  │ consecutive =     │
│        │            │ Manager notified               │ downgrade to      │
│        │            │                                │ no_show_1        │
│        │            │                                │                   │
│   3rd  │ no_show_3  │ ₹500 advance deposit required │ Complete 3        │
│        │            │ for future bookings            │ consecutive =     │
│        │            │ Booking requires phone confirm │ remove deposit    │
│        │            │ 24h before appointment         │ requirement       │
│        │            │                                │                   │
│   4th  │ no_show_4  │ ₹1,000 advance deposit        │ Owner discretion  │
│        │            │ Flagged for owner review       │ to reinstate      │
│        │            │ Consider blocking              │                   │
│        │            │                                │                   │
│   5th  │ no_show_5  │ BLOCKED from online booking   │ Can only book     │
│        │            │ Must call salon directly       │ via phone call    │
│        │            │ Owner manually creates booking │ Owner can reset   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

Progression Flow:

  0 no-shows        1st no-show         2nd no-show         3rd no-show
      │                  │                   │                   │
      ▼                  ▼                   ▼                   ▼
  ┌────────┐       ┌──────────┐       ┌──────────┐       ┌──────────┐
  │ Normal │──────▶│ Warning  │──────▶│ Flagged  │──────▶│ Deposit  │
  │ booking│  +1   │ no_show_1│  +1   │ no_show_2│  +1   │ no_show_3│
  └────────┘       └──────────┘       └──────────┘       └──────────┘
                        │                   │                   │
                        │ Complete          │ Complete 2x       │ Complete 3x
                        │ next booking      │ consecutive       │ consecutive
                        ▼                   ▼                   ▼
                   ┌────────┐         ┌──────────┐       ┌──────────┐
                   │ Reset  │         │Downgrade │       │ Remove   │
                   │ to 0   │         │ to tier 1│       │ deposit  │
                   └────────┘         └──────────┘       └──────────┘

IMPLEMENTATION NOTES:
─────────────────────
• noshow_count stored on customer row (integer)
• Tag auto-assigned: no_show_{count} (replaces previous tier tag)
• Recovery tracked via consecutive_completed_count (resets on new no-show)
• Deposit collection: manual (receptionist marks "deposit received" on booking)
• Block enforcement: booking API returns 403 if noshow_count >= 5
• Owner override: PATCH /api/admin/customers/[id] { noshow_count: 0 }
```

---

## 8. Acquisition Source Tracking

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ACQUISITION SOURCE ASSIGNMENT                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Source        │ How Assigned                │ Stored On                 │
│  ──────────────┼─────────────────────────────┼────────────────────────── │
│  meta_ad       │ Lead submitted via /book    │ lead.source               │
│                │ page with utm_source=meta   │ booking.source (linked)   │
│                │                             │                           │
│  organic       │ Customer books via homepage │ booking.source            │
│                │ without any UTM params      │ (default if no params)    │
│                │                             │                           │
│  gmb           │ Click from Google My        │ booking.source            │
│                │ Business link:              │                           │
│                │ /?book=1&utm_source=gmb     │                           │
│                │                             │                           │
│  walkin        │ QR code scanned in-store:   │ booking.source            │
│                │ /?book=1&utm_source=walkin  │                           │
│                │ OR receptionist creates     │                           │
│                │ walk-in booking manually    │                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

Detection Logic (on booking creation):

```
GET /?book=1&utm_source=X
         │
         ▼
┌──────────────────────────────────┐
│  Check utm_source param          │
│                                  │
│  utm_source present?             │
│  ├── "meta" → source = meta_ad  │
│  ├── "gmb"  → source = gmb      │
│  ├── "walkin" → source = walkin  │
│  └── other → source = organic    │
│                                  │
│  No utm_source?                  │
│  ├── Has leadId? → source = lead's original source │
│  └── No leadId? → source = organic                 │
│                                                    │
│  Walk-in (admin creates):                          │
│  → source = walkin (hardcoded in admin form)       │
│                                                    │
└────────────────────────────────────────────────────┘
```

Revenue Attribution Dashboard (Owner-only):

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Revenue by Source (Last 30 days)                                        │
│                                                                          │
│  Source      │ Bookings │ Revenue    │ Avg Ticket │ Conversion          │
│  ────────────┼──────────┼────────────┼────────────┼──────────────────── │
│  organic     │    45    │ ₹58,500   │  ₹1,300   │  N/A                │
│  meta_ad     │    18    │ ₹27,000   │  ₹1,500   │  Lead→Book: 60%    │
│  gmb         │    12    │ ₹14,400   │  ₹1,200   │  N/A                │
│  walkin      │     8    │  ₹6,400   │    ₹800   │  N/A                │
│  ────────────┼──────────┼────────────┼────────────┼──────────────────── │
│  TOTAL       │    83    │₹1,06,300  │  ₹1,280   │                     │
│                                                                          │
│  Meta ROAS: 4.2x (spend ₹6,500 → revenue ₹27,000)                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```
