# Notifications & Realtime Updates — Design Reference

> Push notifications, Ably realtime connections, email triggers, in-app notification bell, and UI update animations. The communication layer that keeps customers and staff informed in real time.

---

## 1. Push Notification Flow (Web Push API)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  WEB PUSH NOTIFICATION FLOW                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1. PERMISSION REQUEST (browser native prompt)                   │   │
│  │     Timing: After first successful booking (not on first load)   │   │
│  │     See Section 9 for permission strategy                        │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │                                       │
│                     ┌────────────┼────────────┐                         │
│                     │            │            │                         │
│                     ▼            ▼            ▼                         │
│              ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│              │ Granted  │ │ Denied   │ │Dismissed │                   │
│              └────┬─────┘ └──────────┘ └──────────┘                   │
│                   │       (never ask    (can ask                        │
│                   │        again)        again later)                    │
│                   ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  2. SUBSCRIPTION (client-side)                                   │   │
│  │     • navigator.serviceWorker.ready                              │   │
│  │     • registration.pushManager.subscribe({                       │   │
│  │         userVisibleOnly: true,                                   │   │
│  │         applicationServerKey: VAPID_PUBLIC_KEY                   │   │
│  │       })                                                         │   │
│  │     • Returns PushSubscription object                            │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │                                       │
│                                  ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  3. STORE SUBSCRIPTION (server-side)                             │   │
│  │     POST /api/push/subscribe                                     │   │
│  │     { endpoint, keys: { p256dh, auth }, userId }                │   │
│  │     → Saved to push_subscriptions table in Neon                 │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │                                       │
│                                  ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  4. SEND NOTIFICATION (server triggers)                          │   │
│  │     • Event occurs (booking confirmed, reminder due, etc.)       │   │
│  │     • Server fetches user's push subscription(s)                 │   │
│  │     • web-push library sends to push service endpoint           │   │
│  │     • Push service delivers to browser                          │   │
│  │     • Service worker receives 'push' event                      │   │
│  │     • self.registration.showNotification(title, options)         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---


## 2. Push Notification Types & Content

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NOTIFICATION CATALOG                                                    │
├──────────────────┬──────────────────────────────────────────────────────┤
│  Type            │  Content                                              │
├──────────────────┼──────────────────────────────────────────────────────┤
│                  │                                                        │
│  booking_        │  Title: "Booking Confirmed! ✓"                       │
│  confirmed       │  Body: "Your appointment on {date} at {time} is      │
│                  │         confirmed. See you at Royal Glow!"            │
│                  │  Action: Opens /bookings/{id}                        │
│                  │  Icon: ✓ green checkmark                             │
│                  │  Trigger: Receptionist approves booking               │
│                  │                                                        │
├──────────────────┼──────────────────────────────────────────────────────┤
│                  │                                                        │
│  reminder_24h    │  Title: "Reminder: Tomorrow at {time}"               │
│                  │  Body: "{services} at Royal Glow, {branch}.          │
│                  │         We're looking forward to seeing you!"         │
│                  │  Action: Opens /bookings/{id}                        │
│                  │  Icon: 🔔 bell                                        │
│                  │  Trigger: QStash scheduled job (T-24h)               │
│                  │                                                        │
├──────────────────┼──────────────────────────────────────────────────────┤
│                  │                                                        │
│  reminder_1h     │  Title: "Almost time! 1 hour to go"                  │
│                  │  Body: "Your {services} appointment is at {time}.    │
│                  │         📍 {branch_address}"                          │
│                  │  Action: Opens Google Maps directions                 │
│                  │  Icon: ⏰ clock                                       │
│                  │  Trigger: QStash scheduled job (T-1h)                │
│                  │                                                        │
├──────────────────┼──────────────────────────────────────────────────────┤
│                  │                                                        │
│  booking_        │  Title: "Booking Rescheduled"                        │
│  rescheduled     │  Body: "Your appointment has been moved to           │
│                  │         {new_date} at {new_time}."                    │
│                  │  Action: Opens /bookings/{id}                        │
│                  │  Icon: 📅 calendar                                    │
│                  │  Trigger: Admin or customer reschedules               │
│                  │                                                        │
├──────────────────┼──────────────────────────────────────────────────────┤
│                  │                                                        │
│  booking_        │  Title: "Booking Rejected"                           │
│  rejected        │  Body: "Sorry, your {date} booking couldn't be       │
│                  │         confirmed. Reason: {reason}. Book again?"     │
│                  │  Action: Opens /?book=1 (new booking)                │
│                  │  Icon: ✕ red cross                                    │
│                  │  Trigger: Receptionist rejects booking                │
│                  │                                                        │
├──────────────────┼──────────────────────────────────────────────────────┤
│                  │                                                        │
│  gems_earned     │  Title: "💎 +{count} Gems Earned!"                   │
│                  │  Body: "You earned {count} gems today.                │
│                  │         Balance: {total}. Browse the catalogue!"      │
│                  │  Action: Opens /gems                                  │
│                  │  Icon: 💎 diamond                                     │
│                  │  Trigger: Invoice completed with gems > 0            │
│                  │                                                        │
├──────────────────┼──────────────────────────────────────────────────────┤
│                  │                                                        │
│  staff_changed   │  Title: "Stylist Update"                             │
│                  │  Body: "Your stylist for {date} has been changed     │
│                  │         to {new_staff_name}."                         │
│                  │  Action: Opens /bookings/{id}                        │
│                  │  Icon: 👤 person                                      │
│                  │  Trigger: Booking reassigned (leave/mark-off)        │
│                  │                                                        │
└──────────────────┴──────────────────────────────────────────────────────┘
```

---

## 3. Ably Realtime Connection Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ABLY REALTIME ARCHITECTURE                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  CLIENT (Browser)                    SERVER (Next.js API)                │
│  ────────────────                    ────────────────────                │
│                                                                          │
│  Page mounts (e.g. /admin/bookings)                                     │
│       │                                                                  │
│       ▼                                                                  │
│  useEffect → Ably.Realtime({                                            │
│    authCallback: async (cb) => {                                        │
│      // Fetch token from our API                                        │
│      const token = await fetch('/api/ably/token')                       │
│      cb(null, token)                                                    │
│    }                                                                     │
│  })                                                                      │
│       │                                                                  │
│       ▼                                                                  │
│  channel = ably.channels.get('admin:bookings')                          │
│  channel.subscribe('booking.confirmed', (msg) => {                      │
│    // Update React state → UI re-renders                                │
│    updateBookingStatus(msg.data.bookingId, 'confirmed')                 │
│  })                                                                      │
│       │                                                                  │
│       │              ┌─────────────────────────────────────────┐        │
│       │              │                                          │        │
│       │              │  Server: POST /api/admin/bookings/       │        │
│       │              │          [id]/approve                    │        │
│       │              │                                          │        │
│       │              │  1. UPDATE booking SET status='confirmed'│        │
│       │              │  2. ably.channels.get('admin:bookings')  │        │
│       │              │     .publish('booking.confirmed', {      │        │
│       │              │       bookingId, customerName, time      │        │
│       │              │     })                                   │        │
│       │              │  3. ably.channels.get(                   │        │
│       │              │       `customer:${userId}:bookings`      │        │
│       │              │     ).publish('booking.confirmed', {...})│        │
│       │              │                                          │        │
│       │              └─────────────────────────┬───────────────┘        │
│       │                                        │                         │
│       ◄────────────── Ably delivers message ───┘                        │
│       │                                                                  │
│       ▼                                                                  │
│  React state updates → component re-renders                             │
│  → animated transition (status badge morph)                             │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────      │
│                                                                          │
│  CHANNELS:                                                               │
│  • admin:bookings       (all admin users)                               │
│  • admin:schedule       (schedule page viewers)                         │
│  • admin:leads          (lead pipeline viewers)                         │
│  • admin:notifications  (notification bell)                             │
│  • customer:{userId}:bookings  (specific customer's booking updates)    │
│  • customer:{userId}:gems      (gem balance updates)                    │
│                                                                          │
│  CONNECTION LIFECYCLE:                                                    │
│  • Connect on page mount (useEffect)                                    │
│  • Disconnect on page unmount (cleanup)                                 │
│  • Auto-reconnect on network loss (Ably handles)                        │
│  • Token refresh: authCallback called when token expires                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---


## 4. UI Update Animations

```
┌─────────────────────────────────────────────────────────────────────────┐
│  REALTIME UI ANIMATIONS (motion.dev / Framer Motion)                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. STATUS BADGE MORPH                                                   │
│  ─────────────────────                                                  │
│  When booking status changes via Ably:                                  │
│                                                                          │
│  BEFORE:  ┌─ ● Pending ─┐     AFTER:  ┌─ ● Confirmed ─┐              │
│           │  amber bg    │             │  green bg       │              │
│           └──────────────┘             └─────────────────┘              │
│                                                                          │
│  Animation: background-color crossfade (400ms, spring easing)           │
│            + text swap (scale 0.95 → 1.0, 200ms)                       │
│            + subtle pulse (scale 1.0 → 1.05 → 1.0, 300ms)             │
│                                                                          │
│  2. NEW CARD SLIDE-IN                                                    │
│  ────────────────────                                                   │
│  When new booking appears in admin list:                                │
│                                                                          │
│  ┌─────────────────────────────┐                                       │
│  │  (existing cards)           │                                       │
│  └─────────────────────────────┘                                       │
│  ┌─────────────────────────────┐  ← slides down from top              │
│  │  NEW: Priya S. · Pending   │     opacity 0→1, translateY -20→0     │
│  │  Just now                   │     duration: 300ms, ease-out         │
│  └─────────────────────────────┘                                       │
│                                                                          │
│  3. SLOT FILL ON SCHEDULE                                                │
│  ────────────────────────                                               │
│  When slot.booked event arrives:                                        │
│                                                                          │
│  BEFORE:        AFTER (animated):                                       │
│  ┌───────┐     ┌───────┐                                              │
│  │       │ ──▶ │░░░░░░░│  ← colour fills from left edge              │
│  │ avail │     │░Priya░│     width: 0% → 100%, 200ms                  │
│  │       │     │░░░░░░░│     + text fades in at 150ms                  │
│  └───────┘     └───────┘                                              │
│                                                                          │
│  4. SLOT RELEASE ON SCHEDULE                                             │
│  ───────────────────────────                                            │
│  When slot.released event arrives:                                      │
│                                                                          │
│  BEFORE:        AFTER (animated):                                       │
│  ┌───────┐     ┌───────┐                                              │
│  │░░░░░░░│ ──▶ │       │  ← colour fades out                          │
│  │░Aisha░│     │ avail │     opacity: 1→0, 150ms                      │
│  │░░░░░░░│     │       │     + slight scale down 1.0→0.98             │
│  └───────┘     └───────┘                                              │
│                                                                          │
│  5. NOTIFICATION BELL BOUNCE                                             │
│  ────────────────────────────                                           │
│  When new notification arrives:                                         │
│                                                                          │
│  🔔 → 🔔 (rotate -15° → 15° → -10° → 10° → 0°)                       │
│       duration: 600ms, spring easing                                    │
│       + badge count increments with scale pop                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Email Notification Trigger Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│  EMAIL TRIGGER MAP (via Resend + React Email templates)                  │
├──────────────────────────┬───────────────────────┬──────────────────────┤
│  Trigger Action          │  Email Template        │  Recipient           │
├──────────────────────────┼───────────────────────┼──────────────────────┤
│  Booking confirmed       │  booking-confirmed.tsx │  Customer            │
│  Booking rejected        │  booking-rejected.tsx  │  Customer            │
│  Booking cancelled       │  booking-cancelled.tsx │  Customer            │
│  Booking rescheduled     │  booking-rescheduled   │  Customer            │
│  Staff changed           │  staff-changed.tsx     │  Customer            │
│  Invoice generated       │  invoice-receipt.tsx   │  Customer (+ PDF)    │
│  Membership created      │  membership-welcome    │  Customer (+ PDF)    │
│  Membership session      │  session-recorded.tsx  │  Customer (+ PDF)    │
│  Membership T-30d        │  membership-expiry     │  Customer            │
│  Membership T-7d         │  membership-urgent     │  Customer            │
│  Membership T-1d         │  membership-lastday    │  Customer            │
│  Membership expired      │  membership-expired    │  Customer            │
│  Gems redeemed           │  gems-redeemed.tsx     │  Customer            │
│  Onboarding complete     │  welcome.tsx           │  Customer            │
│  Leave approved          │  leave-approved.tsx    │  Staff member        │
│  Leave rejected          │  leave-rejected.tsx    │  Staff member        │
│  No-show recorded        │  no-show-warning.tsx   │  Customer            │
│  Daily summary           │  daily-summary.tsx     │  Owner/Manager       │
│  Lead stale (48h)        │  (push only, no email) │  Receptionist        │
└──────────────────────────┴───────────────────────┴──────────────────────┘

RULES:
• Every email has "Unsubscribe" footer (legal requirement)
• Transactional emails (invoice, booking confirm) always sent
• Marketing emails (membership expiry CTA) respect preferences
• All emails: from hello@theroyalglow.in via Resend
• Reply-to: +91 63601 35720 (WhatsApp link in footer)
```

---

## 6. Notification Bell — Admin Header

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Header (Admin):                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  👑 Royal Glow Admin          /bookings  /customers  /leads       │  │
│  │                                                           🔔(3) 👤│  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                           │              │
│  Click 🔔 → dropdown:                                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐           │
│  │  Notifications                          [ Mark all read ]│           │
│  │  ──────────────────────────────────────────────────────  │           │
│  │                                                          │           │
│  │  ● New booking from Priya S.              2 min ago     │           │
│  │    Facial + Waxing · 24 May 03:30 PM                    │           │
│  │                                                          │           │
│  │  ● Stale lead: Neha (72h+)                 1 hr ago     │           │
│  │    Bridal package inquiry · meta/bridal_jun             │           │
│  │                                                          │           │
│  │  ● Leave request from Meera                3 hr ago     │           │
│  │    Sick leave 21–22 May (⚠️ has bookings)               │           │
│  │                                                          │           │
│  │  ○ Booking completed: Aisha K.             5 hr ago     │           │
│  │    Invoice #INV..5002 generated (₹2,500)                │           │
│  │                                                          │           │
│  │  ○ Daily summary ready                   Yesterday     │           │
│  │    12 bookings · ₹15,600 revenue                       │           │
│  │                                                          │           │
│  │  ──────────────────────────────────────────────────────  │           │
│  │  [ View All Notifications → ]                           │           │
│  └─────────────────────────────────────────────────────────┘           │
│                                                                          │
│  ● = unread (bold text, blue dot)                                       │
│  ○ = read (normal weight, no dot)                                       │
│  (3) = unread count badge (red circle, max "9+")                        │
│                                                                          │
│  Updates in realtime via Ably channel: admin:notifications              │
│  New notification → bell bounces + badge count increments               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---


## 7. Customer Notification Preferences — `/profile`

```
┌─────────────────────────────────────────────────────┐
│  Notification Preferences                            │
│  ════════════════════════                            │
│                                                      │
│  Push Notifications (Browser)                        │
│  ────────────────────────────                        │
│  Status: ● Enabled                                   │
│  [ Disable Push Notifications ]                     │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │                                                │  │
│  │  Booking confirmations        [====●]  ON     │  │
│  │  Booking reminders (24h/1h)   [====●]  ON     │  │
│  │  Booking changes              [====●]  ON     │  │
│  │  Gems & rewards               [====●]  ON     │  │
│  │  Membership alerts            [====●]  ON     │  │
│  │  Offers & promotions          [●====]  OFF    │  │
│  │                                                │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  Email Notifications                                 │
│  ───────────────────                                │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │                                                │  │
│  │  Invoice receipts (PDF)       [====●]  ON     │  │
│  │  Booking confirmations        [====●]  ON     │  │
│  │  Booking reminders            [●====]  OFF    │  │
│  │  Membership expiry alerts     [====●]  ON     │  │
│  │  Gems summary (monthly)       [====●]  ON     │  │
│  │  Offers & promotions          [●====]  OFF    │  │
│  │                                                │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  Note: Invoice receipts and booking confirmations    │
│  cannot be fully disabled (transactional emails).   │
│  Toggle only controls the push notification.         │
│                                                      │
│  [ Save Preferences ]                                │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 8. QStash Scheduled Job → Notification Delivery

```
┌─────────────────────────────────────────────────────────────────────────┐
│  QSTASH → NOTIFICATION PIPELINE                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  SCHEDULING (at booking confirmation time):                              │
│                                                                          │
│  Booking confirmed: 26 May 2026 · 15:30                                │
│       │                                                                  │
│       ├── QStash schedule: reminder_24h                                 │
│       │   URL: POST /api/jobs/send-reminder                             │
│       │   Deliver at: 25 May 2026 · 15:30 (T-24h)                     │
│       │   Body: { bookingId, type: '24h' }                             │
│       │                                                                  │
│       └── QStash schedule: reminder_1h                                  │
│           URL: POST /api/jobs/send-reminder                             │
│           Deliver at: 26 May 2026 · 14:30 (T-1h)                      │
│           Body: { bookingId, type: '1h' }                              │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────      │
│                                                                          │
│  DELIVERY (when QStash fires):                                          │
│                                                                          │
│  QStash → POST /api/jobs/send-reminder                                  │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  1. Verify QStash signature (security)                        │       │
│  │  2. Fetch booking from DB                                     │       │
│  │  3. Check: booking still confirmed? (skip if cancelled)       │       │
│  │  4. Check: customer preferences (push enabled? email enabled?)│       │
│  │  5. Send push notification (if enabled)                       │       │
│  │     • Fetch push_subscription from DB                         │       │
│  │     • web-push.sendNotification(subscription, payload)        │       │
│  │  6. Send email (if enabled for reminders)                     │       │
│  │     • Resend.emails.send({ template, to, data })              │       │
│  │  7. Log delivery status                                       │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────      │
│                                                                          │
│  OTHER SCHEDULED JOBS:                                                   │
│                                                                          │
│  Job                  │ Schedule      │ Endpoint                         │
│  ─────────────────────┼──────────────┼────────────────────────────────  │
│  Lead stale alert     │ Every 1h     │ /api/jobs/lead-followups         │
│  Membership expiry    │ Daily 09:00  │ /api/jobs/membership-expiry      │
│  Daily summary        │ Daily 21:00  │ /api/jobs/daily-summary          │
│  Dormant customer     │ Weekly Mon   │ /api/jobs/dormant-check          │
│  No-show followup     │ T+2h after   │ /api/jobs/noshow-followup        │
│                       │ missed appt  │                                   │
│                                                                          │
│  FAILURE HANDLING:                                                       │
│  • QStash retries 3x with exponential backoff                           │
│  • Dead letter queue for inspection                                     │
│  • Push subscription invalid → delete from DB (410 Gone response)       │
│  • Email bounce → mark customer email as invalid                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Permission Strategy — Ask After First Booking

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PUSH PERMISSION STRATEGY                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  RULE: NEVER ask for push permission on first page load.                │
│  Ask AFTER the user has completed their first booking.                  │
│                                                                          │
│  Timing:                                                                 │
│                                                                          │
│  First visit → Browse → Sign in → Book → Confirmation page              │
│                                                                          │
│  Confirmation page shows:                                                │
│  ┌─────────────────────────────────────────────────────┐               │
│  │  ✓ Booking Submitted!                               │               │
│  │                                                      │               │
│  │  Our team will confirm shortly.                     │               │
│  │                                                      │               │
│  │  ┌──────────────────────────────────────────────┐   │               │
│  │  │  🔔 Get notified instantly                    │   │               │
│  │  │                                               │   │               │
│  │  │  We'll let you know the moment your           │   │               │
│  │  │  booking is confirmed. No need to             │   │               │
│  │  │  check back!                                  │   │               │
│  │  │                                               │   │               │
│  │  │  [ Enable Notifications ]  [ Maybe Later ]   │   │               │
│  │  └──────────────────────────────────────────────┘   │               │
│  │                                                      │               │
│  └─────────────────────────────────────────────────────┘               │
│                                                                          │
│  User clicks "Enable Notifications":                                    │
│       │                                                                  │
│       ▼                                                                  │
│  Browser native permission prompt appears                               │
│  (this is the standard browser dialog — we cannot style it)            │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────      │
│                                                                          │
│  FALLBACK (if user clicks "Maybe Later" or dismisses):                  │
│                                                                          │
│  Show again on SECOND visit (not immediately):                          │
│  • Track in localStorage: push_prompt_dismissed_at                      │
│  • On next visit (different session), show subtle banner:               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  🔔 Never miss a booking update. [ Enable Notifications ]    │       │
│  │                                                  [ Dismiss ] │       │
│  └─────────────────────────────────────────────────────────────┘       │
│  (top banner, dismissible, non-intrusive)                               │
│                                                                          │
│  NEVER ask again after:                                                  │
│  • 2 dismissals → respect the choice permanently                       │
│  • Permission denied → cannot ask again (browser blocks it)            │
│  • Permission granted → no need to ask                                  │
│                                                                          │
│  WHY THIS STRATEGY:                                                      │
│  • Context: User just booked, WANTS to know when it's confirmed        │
│  • Value prop clear: "Know instantly" vs generic "Allow notifications"  │
│  • Higher grant rate: 60-70% vs 20-30% for cold prompts               │
│  • No dark patterns: "Maybe Later" is equally prominent                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```
