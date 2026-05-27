# Billing & Invoice Flow — Design Reference

> Complete billing lifecycle: checkout triggers invoice generation → PDF rendered → stored in R2 → emailed via Resend → gems awarded. Covers all three invoice types, GST calculation, and CA export.

---

## 1. Checkout-to-Invoice Flow

```
Receptionist marks booking "Completed" (checkout panel)
    │
    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  CHECKOUT PANEL (inline on booking detail page)                           │
│                                                                           │
│  Step 1: Apply Offer (optional)                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Available offers for this customer:                                │  │
│  │  (●) No offer    ( ) 20% off Facials    ( ) ₹200 off first visit  │  │
│  │  Max 1 offer per customer per day                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  Step 2: Select Payment Method                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  (●) Cash     ( ) UPI     ( ) Card                                 │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  Step 3: Review                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Classic Haircut (Anjali)         ₹  500.00                        │  │
│  │  Waxing Full Arms (Priya M.)     ₹  800.00                        │  │
│  │  ────────────────────────────────────────────                      │  │
│  │  Subtotal (before GST)           ₹1,101.69                        │  │
│  │  GST @ 18%                       ₹  198.31                        │  │
│  │  ────────────────────────────────────────────                      │  │
│  │  Total (GST-inclusive)           ₹1,300.00                        │  │
│  │                                                                    │  │
│  │  Gems to award: 💎 13 (₹100 = 1 gem, floor)                       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  [ Complete & Generate Invoice ]                                          │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
    │
    │  API: POST /api/admin/bookings/[id]/complete
    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  SERVER PIPELINE (single transaction):                                    │
│                                                                           │
│  1. booking.status → 'completed'                                         │
│  2. INSERT invoice row (with line_item snapshots)                        │
│  3. customer.gems_balance += calculated gems                             │
│  4. Generate PDF (React-PDF / @react-pdf/renderer)                       │
│  5. Upload PDF → Cloudflare R2 (invoices/{invoiceNumber}.pdf)           │
│  6. invoice.pdf_url = R2 signed URL                                      │
│  7. Queue email: Resend with PDF attachment                              │
│  8. Fire Meta CAPI Purchase event (if lead-attributed)                   │
│  9. Ably PUBLISH: booking.completed + invoice.created                    │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  PDF in R2   │     │ Email Sent   │     │ Gems Added   │
│  (permanent) │     │ (via Resend) │     │ (to balance) │
└──────────────┘     └──────────────┘     └──────────────┘
```

---


## 2. Invoice Detail Page — `/admin/invoices/[id]`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Invoices                                                      │
│                                                                          │
│  Invoice #INV1262605001                  Type: ● Service                 │
│  ═════════════════════                   Status: Paid                    │
│                                                                          │
│  ┌─ Header ─────────────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  Customer: Priya Sharma                                          │   │
│  │  Phone: +91 98765 43210                                          │   │
│  │  Email: priya.sharma@gmail.com                                   │   │
│  │                                                                   │   │
│  │  Date: 24 May 2026                                               │   │
│  │  Booking: #BKRS2605H38291 (→ view)                              │   │
│  │  Payment: Cash                                                    │   │
│  │  Branch: Rayasandra                                              │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Line Items ─────────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  #  Service              Staff     Qty   Rate      Amount        │   │
│  │  ── ──────────────────── ──────── ───── ─────────── ──────────  │   │
│  │  1  Classic Haircut      Anjali    1     ₹500.00    ₹  500.00   │   │
│  │  2  Waxing Full Arms     Priya M.  1     ₹800.00    ₹  800.00   │   │
│  │                                                                   │   │
│  │  ───────────────────────────────────────────────────────────────  │   │
│  │  Subtotal (excl. GST)                              ₹1,101.69    │   │
│  │  CGST @ 9%                                         ₹   99.15    │   │
│  │  SGST @ 9%                                         ₹   99.15    │   │
│  │  ───────────────────────────────────────────────────────────────  │   │
│  │  Grand Total                                       ₹1,300.00    │   │
│  │                                                                   │   │
│  │  Amount in Words: Rupees One Thousand Three Hundred Only         │   │
│  │                                                                   │   │
│  │  NOTE: Line items are SNAPSHOTS at time of invoice creation.     │   │
│  │  Price changes after this date do not affect this invoice.       │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Payment & Gems ────────────────────────────────────────────────┐    │
│  │                                                                   │   │
│  │  Payment Method: Cash      Paid: ₹1,300.00                      │   │
│  │  Gems Awarded: 💎 13       Customer Balance: 55 gems             │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Actions ────────────────────────────────────────────────────────┐   │
│  │  [ 📄 View PDF ] [ 📧 Resend Email ] [ 🖨 Print ] [ ↗ Share ]   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Invoice List Page — `/admin/invoices`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Invoices                                               [ Export CSV ]   │
│  ════════                                                                │
│                                                                          │
│  Filters:                                                                │
│  ┌───────────────┐ ┌────────────────┐ ┌──────────────────┐             │
│  │Type         ▼ │ │Date Range    ▼ │ │Payment Method  ▼ │             │
│  │○ All          │ │ Today          │ │○ All             │             │
│  │○ Service      │ │ This Week      │ │○ Cash            │             │
│  │○ Membership   │ │ This Month     │ │○ UPI             │             │
│  │  Purchase     │ │ Custom ───     │ │○ Card            │             │
│  │○ Membership   │ │ [from] [to]    │ │                  │             │
│  │  Session      │ │                │ │                  │             │
│  └───────────────┘ └────────────────┘ └──────────────────┘             │
│                                                                          │
│  ┌──────────┬───────────┬──────────┬──────────┬────────┬──────┬──────┐ │
│  │Invoice # │ Customer  │ Date     │ Type     │Payment │Amount│ PDF  │ │
│  ├──────────┼───────────┼──────────┼──────────┼────────┼──────┼──────┤ │
│  │INV..5001 │ Priya S.  │ 24/05/26 │ Service  │ Cash   │1,300 │ 📄   │ │
│  │INV..5002 │ Aisha K.  │ 24/05/26 │ Service  │ UPI    │2,500 │ 📄   │ │
│  │INV..4998 │ Priya S.  │ 20/05/26 │ Mem.Sess │ —      │    0 │ 📄   │ │
│  │INV..4990 │ Priya S.  │ 15/05/26 │ Mem.Purch│ Card   │15,000│ 📄   │ │
│  └──────────┴───────────┴──────────┴──────────┴────────┴──────┴──────┘ │
│                                                                          │
│  ← 1 2 3 ... 24 →            Total this month: ₹2,34,500               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---


## 4. PDF Invoice Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌── PDF PAGE (A4, branded) ────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │  👑 Royal Glow Salon & SPA           TAX INVOICE            │ │   │
│  │  │  1st Floor, Narmada Complex                                  │ │   │
│  │  │  Rayasandra Main Road, Bengaluru 560099                     │ │   │
│  │  │  GSTIN: 29XXXXX1234A1Z5                                     │ │   │
│  │  │  Phone: +91 63601 35720                                     │ │   │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  │                                                                   │   │
│  │  Invoice No: INV1262605001        Date: 24 May 2026             │   │
│  │  Booking:    BKRS2605H38291       Payment: Cash                 │   │
│  │                                                                   │   │
│  │  Bill To:                                                        │   │
│  │  Priya Sharma                                                    │   │
│  │  +91 98765 43210 · priya.sharma@gmail.com                       │   │
│  │                                                                   │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │ # │ Service            │ Staff   │ Qty │ Rate    │ Amount│   │   │
│  │  ├───┼────────────────────┼─────────┼─────┼─────────┼───────┤   │   │
│  │  │ 1 │ Classic Haircut    │ Anjali  │  1  │ ₹500.00│₹500.00│   │   │
│  │  │ 2 │ Waxing Full Arms   │ Priya M.│  1  │ ₹800.00│₹800.00│   │   │
│  │  ├───┴────────────────────┴─────────┴─────┴─────────┼───────┤   │   │
│  │  │ Subtotal (excl. GST)                             │₹1,101.69│ │   │
│  │  │ CGST @ 9%                                        │₹   99.15│ │   │
│  │  │ SGST @ 9%                                        │₹   99.15│ │   │
│  │  ├──────────────────────────────────────────────────┼─────────┤ │   │
│  │  │ GRAND TOTAL                                      │₹1,300.00│ │   │
│  │  └──────────────────────────────────────────────────┴─────────┘ │   │
│  │                                                                   │   │
│  │  Amount in Words: Rupees One Thousand Three Hundred Only         │   │
│  │                                                                   │   │
│  │  💎 Gems Earned: 13  │  Your Balance: 55 gems                    │   │
│  │                                                                   │   │
│  │  ─────────────────────────────────────────────────────────────── │   │
│  │                                                                   │   │
│  │  ⭐ Loved your experience?                                       │   │
│  │  Leave us a review: https://g.page/r/royalglow/review           │   │
│  │                                                                   │   │
│  │  Terms & Conditions:                                              │   │
│  │  • All prices are GST-inclusive                                   │   │
│  │  • No refunds after service completion                           │   │
│  │  • Visit theroyalglow.in for bookings                            │   │
│  │                                                                   │   │
│  │  ─────────────────────────────────────────────────────────────── │   │
│  │  This is a computer-generated invoice.                           │   │
│  │  Royal Glow Salon & SPA · theroyalglow.in                       │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Three Invoice Types — Side-by-Side Comparison

```
┌────────────────────────┬─────────────────────────┬─────────────────────────┐
│  SERVICE INVOICE        │  MEMBERSHIP PURCHASE     │  MEMBERSHIP SESSION      │
│  (type: 'service')      │  (type: 'membership_     │  (type: 'membership_     │
│                         │   purchase')              │   session')              │
├────────────────────────┼─────────────────────────┼─────────────────────────┤
│                         │                          │                          │
│ Trigger:                │ Trigger:                 │ Trigger:                 │
│ Booking completed       │ Membership created       │ Session recorded         │
│ (checkout flow)         │ (admin creates)          │ (hours deducted)         │
│                         │                          │                          │
│ Line Items:             │ Line Items:              │ Line Items:              │
│ Individual services     │ Single line:             │ Services performed       │
│ performed (snapshot)    │ "Gold Membership         │ (snapshot of names)      │
│                         │  15 hrs · 90 days"       │                          │
│                         │                          │                          │
│ Amount:                 │ Amount:                  │ Amount:                  │
│ Sum of service prices   │ Membership price         │ ₹0.00 (always zero)     │
│ (GST-inclusive)         │ (GST-inclusive)          │ "Covered by membership" │
│                         │                          │                          │
│ Payment:                │ Payment:                 │ Payment:                 │
│ Cash / UPI / Card       │ Cash / UPI / Card        │ N/A (no payment)        │
│                         │                          │                          │
│ GST:                    │ GST:                     │ GST:                     │
│ 18% back-calculated     │ 18% back-calculated      │ ₹0 (zero amount)        │
│                         │                          │                          │
│ Gems:                   │ Gems:                    │ Gems:                    │
│ ₹100 = 1 gem (floor)  │ NO gems awarded          │ NO gems awarded          │
│                         │                          │                          │
│ Email:                  │ Email:                   │ Email:                   │
│ invoice + review CTA    │ invoice + welcome msg    │ session confirmation     │
│                         │                          │                          │
│ PDF Footer:             │ PDF Footer:              │ PDF Footer:              │
│ Review link             │ "Welcome to Gold tier"   │ "X hrs remaining"        │
│                         │                          │                          │
│ Meta CAPI:              │ Meta CAPI:               │ Meta CAPI:               │
│ Purchase event (if      │ None                     │ None                     │
│ lead-attributed)        │                          │                          │
│                         │                          │                          │
└────────────────────────┴─────────────────────────┴─────────────────────────┘
```

---


## 6. GST Calculation Breakdown

```
┌─────────────────────────────────────────────────────────────────────────┐
│  GST CALCULATION METHOD                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  RULE: All prices in the system are GST-INCLUSIVE.                       │
│  The displayed price IS the final price the customer pays.              │
│                                                                          │
│  Back-calculation formula:                                               │
│  ─────────────────────────                                              │
│                                                                          │
│  Given: Total (GST-inclusive) = ₹1,300.00                               │
│                                                                          │
│  Base Amount = Total / 1.18                                             │
│             = 1300 / 1.18                                               │
│             = ₹1,101.694915...                                          │
│             = ₹1,101.69 (rounded to 2 decimals)                        │
│                                                                          │
│  GST Amount  = Total - Base                                              │
│             = 1300.00 - 1101.69                                         │
│             = ₹198.31                                                   │
│                                                                          │
│  Split (intra-state, Karnataka → Karnataka):                            │
│  CGST @ 9% = ₹99.15 (GST / 2, rounded)                                │
│  SGST @ 9% = ₹99.16 (GST - CGST, remainder takes rounding diff)       │
│                                                                          │
│  Verification: 1101.69 + 99.15 + 99.16 = 1,300.00 ✓                   │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────      │
│                                                                          │
│  MULTIPLE LINE ITEMS:                                                    │
│  GST is calculated PER LINE ITEM, not on subtotal.                      │
│                                                                          │
│  Line 1: Haircut ₹500    → Base: ₹423.73  GST: ₹76.27                 │
│  Line 2: Waxing  ₹800    → Base: ₹677.97  GST: ₹122.03                │
│  ──────────────────────────────────────────────────────                 │
│  Total:          ₹1,300   → Base: ₹1,101.69 GST: ₹198.31 ✓           │
│                                                                          │
│  NOTE: Sum of per-line GST may differ by ₹0.01 from                    │
│  total-level GST due to rounding. We use total-level                    │
│  calculation for the invoice, per-line for the breakdown.               │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────      │
│                                                                          │
│  SAC CODE: 997212 (Beauty and physical well-being services)             │
│  GST RATE: 18% (9% CGST + 9% SGST for intra-state)                    │
│  GSTIN displayed on all invoices                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Export for CA Flow

```
Owner/Manager clicks "Export CSV" on /admin/invoices:

┌─────────────────────────────────────────────────────────────────┐
│  Export Invoices for Accountant                                   │
│  ═════════════════════════════                                    │
│                                                                   │
│  Date Range:                                                      │
│  ┌───────────────────┐  to  ┌───────────────────┐              │
│  │ 01/04/2026   📅   │      │ 30/06/2026   📅   │              │
│  └───────────────────┘      └───────────────────┘              │
│                                                                   │
│  Quick select: [This Month] [Last Month] [This Quarter] [FY]    │
│                                                                   │
│  Include:                                                         │
│  ☑ Service invoices                                               │
│  ☑ Membership purchase invoices                                   │
│  ☐ Membership session invoices (₹0)                              │
│                                                                   │
│  [ Download CSV ]                                                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

CSV Columns:
┌────────────────────────────────────────────────────────────────────────┐
│ invoice_number, date, customer_name, customer_phone, type,             │
│ payment_method, base_amount, cgst, sgst, total_amount,                │
│ services (semicolon-separated), staff (semicolon-separated),          │
│ booking_number, branch, gems_awarded                                   │
└────────────────────────────────────────────────────────────────────────┘

Example row:
INV1262605001, 2026-05-24, Priya Sharma, +919876543210, service,
cash, 1101.69, 99.15, 99.16, 1300.00,
"Classic Haircut;Waxing Full Arms", "Anjali;Priya M.",
BKRS2605H38291, Rayasandra, 13
```

---

## 8. Email Delivery Flow

```
Invoice created (POST /api/admin/bookings/[id]/complete)
    │
    ▼
┌──────────────────────────────────────────────────────────────────┐
│  PDF Generation (server-side)                                     │
│  • @react-pdf/renderer generates PDF buffer                      │
│  • Upload to Cloudflare R2: invoices/{number}.pdf                │
│  • Get signed URL (7-day expiry for email link)                  │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Email via Resend                                                 │
│                                                                   │
│  Template: invoice-receipt.tsx (React Email)                      │
│                                                                   │
│  From: Royal Glow <hello@theroyalglow.in>                        │
│  To: priya.sharma@gmail.com                                      │
│  Subject: "Your invoice from Royal Glow — #INV1262605001"        │
│                                                                   │
│  Body:                                                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Hi Priya! 👑                                              │  │
│  │                                                             │  │
│  │  Thank you for visiting Royal Glow Salon & SPA!            │  │
│  │                                                             │  │
│  │  Services: Classic Haircut, Waxing Full Arms               │  │
│  │  Total Paid: ₹1,300.00 (Cash)                             │  │
│  │  Gems Earned: 💎 13 (Balance: 55)                          │  │
│  │                                                             │  │
│  │  📎 Your invoice is attached as PDF.                        │  │
│  │                                                             │  │
│  │  ⭐ Rate us on Google Maps:                                 │  │
│  │  [ Leave a Review → ]                                      │  │
│  │                                                             │  │
│  │  See you next time!                                         │  │
│  │  — Team Royal Glow                                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Attachment: INV1262605001.pdf (from R2 buffer)                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
    │
    ▼
Customer receives email with PDF attachment
    │
    ├── Opens PDF → sees branded invoice with review link
    │
    └── Clicks "Leave a Review" → opens Google Maps review page
        (UTM tracked: utm_source=invoice_email)


FAILURE HANDLING:
─────────────────
• Resend returns error → retry via QStash (max 3 attempts, exponential backoff)
• After 3 failures → log error, invoice still accessible in admin panel
• Customer can request resend: receptionist clicks "Resend Email" on invoice detail
• PDF always available via R2 regardless of email delivery status
```
