# Data Seeding Strategy

## Overview

Seed scripts provision production essentials in every environment and add realistic demo data in non-production environments for development, testing, and stakeholder demos. Seeds are **idempotent** — running twice produces the same result (upsert, not duplicate insert).

**Runtime:** Bun scripts (`bun run scripts/seed-*.ts`)
**ORM:** Drizzle (same schema used by the app)
**Environments seeded:** `prod` (essentials only), `dev`, `test` (with environment-specific profiles)

> **Preprod (`pprd`) is NOT seeded** — it receives daily data from prod via Neon branch reset + PII anonymization.

---

## Seeding Architecture

```
scripts/
├── seed.ts                       ← Master orchestrator (calls all seed modules in order)
├── seed-dev.ts                   ← Focused local dataset with all major statuses + edge cases
├── seed-test.ts                  ← Minimal deterministic fixtures for CI
├── seed-spa-tiers.ts             ← Membership tier defaults (shared across all envs)
├── seed-prod.ts                  ← Production essentials only (branch, settings, categories, services, tiers, tags)
├── verify-seed.ts                ← Row counts + FK integrity checks after seeding
└── data/
    ├── branches.ts               ← Branch seed data
    ├── categories.ts             ← Service categories (10)
    ├── services-salon.ts         ← Salon services (~40 services)
    ├── services-spa.ts           ← SPA services (23 services from DB schema)
    ├── staff.ts                  ← Demo staff members
    ├── membership-tiers.ts       ← Silver / Gold / Platinum defaults
    ├── offers.ts                 ← Demo offers & combos
    ├── settings.ts               ← System settings key-value pairs
    ├── customer-tags.ts          ← CRM tags (VIP, Frequent, Inactive, etc.)
    └── demo/
        ├── customers.ts          ← Fixture customers (dev/test only)
        ├── bookings.ts           ← Demo bookings across various statuses
        ├── invoices.ts           ← Completed bookings with invoices
        ├── memberships.ts        ← Active/expired memberships
        ├── gems.ts               ← Loyalty account + transactions
        └── leads.ts              ← CRM leads in various pipeline stages
```

---

## Seed Profiles by Environment

| Environment | What Gets Seeded | Volume | Purpose |
|-------------|-----------------|--------|---------|
| **prod** | Branch, categories, services, settings, membership tiers, customer tags | Minimal | Production bootstrap — real data added by staff |
| **pprd** | **Not seeded** — Neon branch reset copies prod daily, then PII anonymization runs. Real (anonymized) data. | From prod | UAT testing, stakeholder demos with real-shaped data |
| **dev** | Prod essentials + demo staff, customers, bookings, offers, memberships, leads, loyalty — all statuses and edge cases | Focused (~15 customers, ~30 bookings) | Developer testing, UI development |
| **test** | Prod essentials + all roles/designations + deterministic fixtures with known IDs | Minimal (~5 customers, ~20 bookings) | CI assertions, integration tests, RBAC testing |

---

## Execution Commands

```bash
# Seed everything for current environment (reads APP_ENV)
bun run scripts/seed.ts

# Seed specific modules
bun run scripts/seed.ts --only=services,staff,offers

# Reset and reseed (TRUNCATES all data first — dev/test only)
bun run scripts/seed.ts --reset

# Seed production essentials (safe — upserts only, no demo data)
bun run scripts/seed-prod.ts

# Preprod is NOT seeded — it syncs from prod nightly (Neon branch reset + anonymize)
# See .github/workflows/nightly-pprd-reset.yml
```

### Safety Guards

```ts
// scripts/seed.ts

const env = process.env.APP_ENV

// NEVER allow --reset on prod
if (flags.reset && env === 'prod') {
  console.error('❌ Cannot --reset on prod. Aborting.')
  process.exit(1)
}
```

---

## Seed Execution Order

Dependencies matter — FK constraints require specific insertion order:

```
1. branch              ← No FK dependencies
2. system_setting      ← No FK dependencies
3. service_category    ← No FK dependencies
4. service             ← FK → service_category
5. spa_membership_tier ← No FK dependencies
6. customer_tag        ← No FK dependencies
7. user (staff)        ← FK → branch (optional)
8. user (customers)    ← No FK dependencies (dev/test only)
9. customer_tag_assignment ← FK → user, customer_tag
10. offer              ← No FK dependencies
11. offer_service      ← FK → offer, service
12. booking            ← FK → user (customer), user (staff), branch
13. booking_service    ← FK → booking, service
14. invoice            ← FK → booking, user (customer), branch
15. invoice_item       ← FK → invoice, service
16. spa_membership     ← FK → user, spa_membership_tier, invoice
17. loyalty_account    ← FK → user
18. loyalty_transaction ← FK → loyalty_account, invoice
19. lead               ← FK → service, user (assigned_to)
20. lead_note          ← FK → lead, user (author)
21. notification       ← FK → user, booking
```

---

## Seed Data — Production Essentials

These are seeded in **all environments** including production. This is the minimum data the app needs to function.

### Branch

```ts
// scripts/data/branches.ts

export const branches = [
  {
    id: 'branch_rayasandra',
    number: 1,
    code: 'RS',
    name: 'Rayasandra',
    addressLine1: '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd',
    addressLine2: 'Above SBI Bank, Naganathapura, Parappana Agrahara',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560100',
    phone: '+91 63601 35720',
    email: 'hello@theroyalglow.in',
    googleMapsUrl: 'https://maps.app.goo.gl/xxxxx',
    latitude: '12.8777350',
    longitude: '77.6664252',
    status: 'operational',
    isPrimary: true,
    displayOrder: 1,
  },
  {
    id: 'branch_marathahalli',
    number: 2,
    code: 'MH',
    name: 'Marathahalli',
    addressLine1: 'TBD',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560037',
    phone: '+91 XXXXX XXXXX',
    status: 'opens_soon',
    isPrimary: false,
    displayOrder: 2,
  },
]
```

### Service Categories (10)

```ts
// scripts/data/categories.ts

export const categories = [
  { id: 'cat_haircut', name: 'Haircut & Styling', slug: 'haircut-styling', type: 'salon', displayOrder: 1 },
  { id: 'cat_colour', name: 'Hair Colouring / Treatment', slug: 'hair-colouring-treatment', type: 'salon', displayOrder: 2 },
  { id: 'cat_facial', name: 'Facial & Skincare', slug: 'facial-skincare', type: 'salon', displayOrder: 3 },
  { id: 'cat_waxing', name: 'Waxing', slug: 'waxing', type: 'salon', displayOrder: 4 },
  { id: 'cat_mani_pedi', name: 'Manicure & Pedicure', slug: 'manicure-pedicure', type: 'salon', displayOrder: 5 },
  { id: 'cat_makeup', name: 'Makeup Services', slug: 'makeup-services', type: 'salon', displayOrder: 6 },
  { id: 'cat_hair_spa', name: 'Hair SPA & Head Therapies', slug: 'hair-spa-head-therapies', type: 'salon', displayOrder: 7 },
  { id: 'cat_standard_spa', name: 'Standard SPA Service', slug: 'standard-spa', type: 'spa', displayOrder: 8 },
  { id: 'cat_premium_spa', name: 'Premium SPA Service', slug: 'premium-spa', type: 'spa', displayOrder: 9 },
  { id: 'cat_vvip_spa', name: 'VVIP SPA Service', slug: 'vvip-spa', type: 'spa', displayOrder: 10 },
]
```

### SPA Services (23 — from database-schema.md)

```ts
// scripts/data/services-spa.ts

export const spaServices = [
  // Standard SPA
  { name: 'Swedish Therapy', slug: 'swedish-60', categoryId: 'cat_standard_spa', durationMinutes: 60, pricePaise: 200000 },
  { name: 'Swedish Therapy', slug: 'swedish-90', categoryId: 'cat_standard_spa', durationMinutes: 90, pricePaise: 300000 },
  { name: 'Thai Therapy', slug: 'thai-60', categoryId: 'cat_standard_spa', durationMinutes: 60, pricePaise: 250000 },
  { name: 'Thai Therapy', slug: 'thai-90', categoryId: 'cat_standard_spa', durationMinutes: 90, pricePaise: 350000 },
  { name: 'Aroma Therapy', slug: 'aroma-60', categoryId: 'cat_standard_spa', durationMinutes: 60, pricePaise: 250000 },
  { name: 'Aroma Therapy', slug: 'aroma-90', categoryId: 'cat_standard_spa', durationMinutes: 90, pricePaise: 350000 },

  // Premium SPA
  { name: 'Lomi Lomi Spa', slug: 'lomi-lomi-60', categoryId: 'cat_premium_spa', durationMinutes: 60, pricePaise: 350000 },
  { name: 'Lomi Lomi Spa', slug: 'lomi-lomi-90', categoryId: 'cat_premium_spa', durationMinutes: 90, pricePaise: 450000 },
  { name: 'Balinese Therapy', slug: 'balinese-60', categoryId: 'cat_premium_spa', durationMinutes: 60, pricePaise: 300000 },
  { name: 'Balinese Therapy', slug: 'balinese-90', categoryId: 'cat_premium_spa', durationMinutes: 90, pricePaise: 400000 },
  { name: 'Deep Tissue Therapy', slug: 'deep-tissue-60', categoryId: 'cat_premium_spa', durationMinutes: 60, pricePaise: 350000 },
  { name: 'Deep Tissue Therapy', slug: 'deep-tissue-90', categoryId: 'cat_premium_spa', durationMinutes: 90, pricePaise: 450000 },

  // VVIP SPA
  { name: 'Hot Stone Massage', slug: 'hot-stone-60', categoryId: 'cat_vvip_spa', durationMinutes: 60, pricePaise: 350000 },
  { name: 'Hot Stone Massage', slug: 'hot-stone-90', categoryId: 'cat_vvip_spa', durationMinutes: 90, pricePaise: 450000 },
  { name: 'Kerala Potli Massage', slug: 'kerala-potli-60', categoryId: 'cat_vvip_spa', durationMinutes: 60, pricePaise: 350000 },
  { name: 'Kerala Potli Massage', slug: 'kerala-potli-90', categoryId: 'cat_vvip_spa', durationMinutes: 90, pricePaise: 450000 },
  { name: 'Synchronic Massage', slug: 'synchronic-60', categoryId: 'cat_vvip_spa', durationMinutes: 60, pricePaise: 450000 },
  { name: 'Synchronic Massage', slug: 'synchronic-90', categoryId: 'cat_vvip_spa', durationMinutes: 90, pricePaise: 550000 },
  { name: 'Body Polish Massage', slug: 'body-polish-60', categoryId: 'cat_vvip_spa', durationMinutes: 60, pricePaise: 300000 },
  { name: 'Body Scrub & Cleansing – Normal', slug: 'body-scrub-normal', categoryId: 'cat_vvip_spa', durationMinutes: 60, pricePaise: 260000 },
  { name: 'Body Scrub & Cleansing – Fruit', slug: 'body-scrub-fruit', categoryId: 'cat_vvip_spa', durationMinutes: 60, pricePaise: 280000 },
  { name: 'Body Scrub & Cleansing – Coffee', slug: 'body-scrub-coffee', categoryId: 'cat_vvip_spa', durationMinutes: 60, pricePaise: 280000 },
  { name: 'Body Scrub & Cleansing – Almond / Coconut', slug: 'body-scrub-almond', categoryId: 'cat_vvip_spa', durationMinutes: 60, pricePaise: 300000 },
]
```

### Salon Services (~40 representative services)

```ts
// scripts/data/services-salon.ts

export const salonServices = [
  // Haircut & Styling
  { name: 'Haircut (Basic)', slug: 'haircut-basic', categoryId: 'cat_haircut', durationMinutes: 30, pricePaise: 50000 },
  { name: 'Haircut (Advanced / Layered)', slug: 'haircut-advanced', categoryId: 'cat_haircut', durationMinutes: 45, pricePaise: 80000 },
  { name: 'Hair Wash & Blow Dry', slug: 'wash-blowdry', categoryId: 'cat_haircut', durationMinutes: 30, pricePaise: 40000 },
  { name: 'Hair Straightening (Temporary)', slug: 'straightening-temp', categoryId: 'cat_haircut', durationMinutes: 60, pricePaise: 150000 },
  { name: 'Hair Ironing', slug: 'hair-ironing', categoryId: 'cat_haircut', durationMinutes: 30, pricePaise: 60000 },
  { name: 'Bridal Hair Styling', slug: 'bridal-hair', categoryId: 'cat_haircut', durationMinutes: 90, pricePaise: 500000 },

  // Hair Colouring / Treatment
  { name: 'Global Colour (Short Hair)', slug: 'colour-global-short', categoryId: 'cat_colour', durationMinutes: 90, pricePaise: 250000 },
  { name: 'Global Colour (Long Hair)', slug: 'colour-global-long', categoryId: 'cat_colour', durationMinutes: 120, pricePaise: 400000 },
  { name: 'Highlights / Balayage', slug: 'highlights', categoryId: 'cat_colour', durationMinutes: 120, pricePaise: 350000 },
  { name: 'Root Touch-Up', slug: 'root-touchup', categoryId: 'cat_colour', durationMinutes: 45, pricePaise: 150000 },
  { name: 'Keratin Treatment', slug: 'keratin', categoryId: 'cat_colour', durationMinutes: 180, pricePaise: 600000 },

  // Facial & Skincare
  { name: 'Classic Facial', slug: 'facial-classic', categoryId: 'cat_facial', durationMinutes: 45, pricePaise: 80000 },
  { name: 'Gold Facial', slug: 'facial-gold', categoryId: 'cat_facial', durationMinutes: 60, pricePaise: 150000 },
  { name: 'Diamond Facial', slug: 'facial-diamond', categoryId: 'cat_facial', durationMinutes: 60, pricePaise: 200000 },
  { name: 'De-Tan Pack', slug: 'detan', categoryId: 'cat_facial', durationMinutes: 30, pricePaise: 60000 },
  { name: 'Cleanup (Basic)', slug: 'cleanup-basic', categoryId: 'cat_facial', durationMinutes: 30, pricePaise: 50000 },

  // Waxing
  { name: 'Full Arms Waxing', slug: 'wax-full-arms', categoryId: 'cat_waxing', durationMinutes: 30, pricePaise: 40000 },
  { name: 'Full Legs Waxing', slug: 'wax-full-legs', categoryId: 'cat_waxing', durationMinutes: 45, pricePaise: 60000 },
  { name: 'Underarms Waxing', slug: 'wax-underarms', categoryId: 'cat_waxing', durationMinutes: 15, pricePaise: 15000 },
  { name: 'Full Body Waxing', slug: 'wax-full-body', categoryId: 'cat_waxing', durationMinutes: 90, pricePaise: 200000 },
  { name: 'Upper Lip / Eyebrows', slug: 'wax-face', categoryId: 'cat_waxing', durationMinutes: 15, pricePaise: 10000 },

  // Manicure & Pedicure
  { name: 'Classic Manicure', slug: 'manicure-classic', categoryId: 'cat_mani_pedi', durationMinutes: 30, pricePaise: 50000 },
  { name: 'Spa Manicure', slug: 'manicure-spa', categoryId: 'cat_mani_pedi', durationMinutes: 45, pricePaise: 80000 },
  { name: 'Classic Pedicure', slug: 'pedicure-classic', categoryId: 'cat_mani_pedi', durationMinutes: 30, pricePaise: 50000 },
  { name: 'Spa Pedicure', slug: 'pedicure-spa', categoryId: 'cat_mani_pedi', durationMinutes: 45, pricePaise: 80000 },
  { name: 'Gel Nails', slug: 'gel-nails', categoryId: 'cat_mani_pedi', durationMinutes: 60, pricePaise: 150000 },

  // Makeup Services
  { name: 'Party Makeup', slug: 'makeup-party', categoryId: 'cat_makeup', durationMinutes: 60, pricePaise: 250000 },
  { name: 'Bridal Makeup', slug: 'makeup-bridal', categoryId: 'cat_makeup', durationMinutes: 120, pricePaise: 1500000 },
  { name: 'Engagement / Reception Makeup', slug: 'makeup-engagement', categoryId: 'cat_makeup', durationMinutes: 90, pricePaise: 800000 },
  { name: 'Saree Draping', slug: 'saree-draping', categoryId: 'cat_makeup', durationMinutes: 30, pricePaise: 100000 },

  // Hair SPA & Head Therapies
  { name: 'Hair Spa (Basic)', slug: 'hair-spa-basic', categoryId: 'cat_hair_spa', durationMinutes: 45, pricePaise: 80000 },
  { name: 'Hair Spa (Premium / L\'Oréal)', slug: 'hair-spa-premium', categoryId: 'cat_hair_spa', durationMinutes: 60, pricePaise: 150000 },
  { name: 'Head Massage (Oil)', slug: 'head-massage-oil', categoryId: 'cat_hair_spa', durationMinutes: 30, pricePaise: 50000 },
  { name: 'Scalp Treatment', slug: 'scalp-treatment', categoryId: 'cat_hair_spa', durationMinutes: 45, pricePaise: 120000 },
]
```

### Membership Tiers

```ts
// scripts/data/membership-tiers.ts

export const membershipTiers = [
  {
    id: 'tier_silver',
    name: 'Silver',
    slug: 'silver',
    defaultHoursMinutes: 480,         // 8 hours
    defaultPricePaise: 1000000,       // ₹10,000
    defaultValidityDays: 90,
    description: 'Perfect for occasional SPA visitors. 8 hours of pure relaxation.',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'tier_gold',
    name: 'Gold',
    slug: 'gold',
    defaultHoursMinutes: 900,         // 15 hours
    defaultPricePaise: 1500000,       // ₹15,000
    defaultValidityDays: 90,
    description: 'Our most popular tier. 15 hours — enough for weekly sessions.',
    isActive: true,
    displayOrder: 2,
  },
  {
    id: 'tier_platinum',
    name: 'Platinum',
    slug: 'platinum',
    defaultHoursMinutes: null,        // Custom — set per customer
    defaultPricePaise: null,          // Custom pricing
    defaultValidityDays: 90,
    description: 'Bespoke membership. Custom hours and pricing tailored to you.',
    isActive: true,
    displayOrder: 3,
  },
]
```

### System Settings

```ts
// scripts/data/settings.ts

export const systemSettings = [
  { key: 'salon_name', value: '"Royal Glow Salon & Spa"' },
  { key: 'salon_phone', value: '"+91 63601 35720"' },
  { key: 'salon_email', value: '"hello@theroyalglow.in"' },
  { key: 'salon_address', value: JSON.stringify({
    line1: '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd',
    line2: 'Above SBI Bank, Naganathapura, Parappana Agrahara',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560100',
  })},
  { key: 'salon_lat', value: '"12.877734987033477"' },
  { key: 'salon_lng', value: '"77.66642516860671"' },
  { key: 'gst_number', value: '"XXAAACR1234X1ZX"' },
  { key: 'sac_code', value: '"999721"' },
  { key: 'gst_rate', value: '0.18' },
  { key: 'gems_earn_rate', value: '0.01' },
  { key: 'gems_value_paise', value: '100' },
  { key: 'gems_expiry_days', value: '30' },
  { key: 'cancellation_window_hours', value: '4' },
  { key: 'reschedule_window_hours', value: '1' },
  { key: 'reschedule_limit_per_booking', value: '2' },
  { key: 'noshow_approval_threshold', value: '4' },
  { key: 'noshow_flag_threshold', value: '5' },
  { key: 'noshow_recovery_bookings', value: '3' },
  { key: 'noshow_reset_window_days', value: '90' },
]
```

### Customer Tags

```ts
// scripts/data/customer-tags.ts

export const customerTags = [
  { id: 'tag_vip', name: 'VIP', slug: 'vip', color: '#FFD700', description: 'High-value repeat customer' },
  { id: 'tag_frequent', name: 'Frequent Visitor', slug: 'frequent-visitor', color: '#4CAF50', description: '10+ completed bookings' },
  { id: 'tag_inactive', name: 'Inactive 60d+', slug: 'inactive-60d', color: '#FF5722', description: 'No visit in last 60 days' },
  { id: 'tag_bridal', name: 'Bridal', slug: 'bridal', color: '#E91E63', description: 'Bridal package customer' },
  { id: 'tag_noshow_risk', name: 'No-Show Risk', slug: 'noshow-risk', color: '#F44336', description: '4+ no-shows — requires approval' },
  { id: 'tag_spa_member', name: 'SPA Member', slug: 'spa-member', color: '#9C27B0', description: 'Has active SPA membership' },
  { id: 'tag_referred', name: 'Referred', slug: 'referred', color: '#2196F3', description: 'Came via customer referral' },
]
```

---

## Demo Data — Dev & Test Only

> **Preprod does NOT get demo seeds.** It receives real (anonymized) data via nightly Neon branch reset from prod. See CI/CD section below.

### Demo Staff (8 users — all roles + designations covered)

```ts
// scripts/data/staff.ts

export const staffMembers = [
  {
    id: 'user_developer',
    email: 'dev@theroyalglow.in',
    firstName: 'Siddharth',
    lastName: 'Fernandes',
    role: 'developer',
    designation: null,
    phone: '+919999900000',
    branchId: 'branch_rayasandra',
  },
  {
    id: 'user_owner',
    email: 'owner@theroyalglow.in',
    firstName: 'Roshini',
    lastName: 'Verma',
    role: 'owner',
    designation: null,
    phone: '+919999900001',
    branchId: 'branch_rayasandra',
  },
  {
    id: 'user_manager',
    email: 'manager@theroyalglow.in',
    firstName: 'Kavitha',
    lastName: 'Nair',
    role: 'manager',
    designation: null,
    phone: '+919999900002',
    branchId: 'branch_rayasandra',
  },
  {
    id: 'user_receptionist',
    email: 'reception@theroyalglow.in',
    firstName: 'Divya',
    lastName: 'Sharma',
    role: 'receptionist',
    designation: null,
    phone: '+919999900003',
    branchId: 'branch_rayasandra',
  },
  {
    id: 'user_stylist_anjali',
    email: 'anjali@theroyalglow.in',
    firstName: 'Anjali',
    lastName: 'Reddy',
    role: 'staff',
    designation: 'senior_stylist',
    phone: '+919999900004',
    branchId: 'branch_rayasandra',
  },
  {
    id: 'user_stylist_priya',
    email: 'priya@theroyalglow.in',
    firstName: 'Priya',
    lastName: 'Menon',
    role: 'staff',
    designation: 'stylist',
    phone: '+919999900005',
    branchId: 'branch_rayasandra',
  },
  {
    id: 'user_therapist_meera',
    email: 'meera@theroyalglow.in',
    firstName: 'Meera',
    lastName: 'Iyer',
    role: 'staff',
    designation: 'senior_therapist',
    phone: '+919999900006',
    branchId: 'branch_rayasandra',
  },
  {
    id: 'user_therapist_lakshmi',
    email: 'lakshmi@theroyalglow.in',
    firstName: 'Lakshmi',
    lastName: 'Krishnan',
    role: 'staff',
    designation: 'therapist',
    phone: '+919999900007',
    branchId: 'branch_rayasandra',
  },
]
```

### Demo Customers (15 in dev, 5 in test)

```ts
// scripts/data/demo/customers.ts

// Realistic Indian women's names — target demographic
export const demoCustomers = [
  { id: 'cust_001', firstName: 'Sneha', lastName: 'Patil', email: 'sneha.p@demo.test', phone: '+919876500001', acquisitionSource: 'organic' },
  { id: 'cust_002', firstName: 'Ananya', lastName: 'Rao', email: 'ananya.r@demo.test', phone: '+919876500002', acquisitionSource: 'gmb', utmSource: 'gmb' },
  { id: 'cust_003', firstName: 'Deepika', lastName: 'Joshi', email: 'deepika.j@demo.test', phone: '+919876500003', acquisitionSource: 'walkin', utmSource: 'walkin' },
  { id: 'cust_004', firstName: 'Nithya', lastName: 'Kumar', email: 'nithya.k@demo.test', phone: '+919876500004', acquisitionSource: 'meta_ad', utmSource: 'meta', utmCampaign: 'facial-offers-april' },
  { id: 'cust_005', firstName: 'Rashmi', lastName: 'Hegde', email: 'rashmi.h@demo.test', phone: '+919876500005', acquisitionSource: 'organic' },
  { id: 'cust_006', firstName: 'Pooja', lastName: 'Agarwal', email: 'pooja.a@demo.test', phone: '+919876500006', acquisitionSource: 'gmb', utmSource: 'gmb' },
  { id: 'cust_007', firstName: 'Shruti', lastName: 'Desai', email: 'shruti.d@demo.test', phone: '+919876500007', acquisitionSource: 'walkin', utmSource: 'walkin' },
  { id: 'cust_008', firstName: 'Aishwarya', lastName: 'Shetty', email: 'aish.s@demo.test', phone: '+919876500008', acquisitionSource: 'organic' },
  { id: 'cust_009', firstName: 'Kavya', lastName: 'Naik', email: 'kavya.n@demo.test', phone: '+919876500009', acquisitionSource: 'gmb', utmSource: 'gmb' },
  { id: 'cust_010', firstName: 'Tanvi', lastName: 'Bhat', email: 'tanvi.b@demo.test', phone: '+919876500010', acquisitionSource: 'organic' },
  { id: 'cust_011', firstName: 'Meghana', lastName: 'Gowda', email: 'meghana.g@demo.test', phone: '+919876500011', acquisitionSource: 'walkin', utmSource: 'walkin' },
  { id: 'cust_012', firstName: 'Pallavi', lastName: 'Singh', email: 'pallavi.s@demo.test', phone: '+919876500012', acquisitionSource: 'organic' },
  { id: 'cust_013', firstName: 'Swathi', lastName: 'Prasad', email: 'swathi.p@demo.test', phone: '+919876500013', acquisitionSource: 'meta_ad', utmSource: 'meta', utmCampaign: 'keratin-treatment-may' },
  { id: 'cust_014', firstName: 'Harini', lastName: 'Mohan', email: 'harini.m@demo.test', phone: '+919876500014', acquisitionSource: 'gmb', utmSource: 'gmb' },
  { id: 'cust_015', firstName: 'Bhavya', lastName: 'Ramesh', email: 'bhavya.r@demo.test', phone: '+919876500015', acquisitionSource: 'walkin', utmSource: 'walkin' },
]

// All demo emails use @demo.test domain — never accidentally sent real emails
// Acquisition source coverage is intentional: organic root, GMB deep-link,
// in-store QR, and converted Meta ad leads are all represented.
// In dev, marketing_consent is randomized true/false (70/30 split)
// Test fixtures stay deterministic for reliable assertions
```

### Demo Bookings — All Statuses Represented

```ts
// scripts/data/demo/bookings.ts

import { subDays, addDays, setHours } from 'date-fns'

const today = new Date()

export function generateDemoBookings() {
  return [
    // ── Pending bookings (awaiting receptionist confirmation) ──
    {
      customerId: 'cust_001',
      branchId: 'branch_rayasandra',
      status: 'pending',
      serviceType: 'salon',
      bookingDate: addDays(today, 2),
      bookingTime: '14:30',
      services: ['haircut-advanced', 'facial-classic'],
    },
    {
      customerId: 'cust_003',
      branchId: 'branch_rayasandra',
      status: 'pending',
      serviceType: 'spa',
      bookingDate: addDays(today, 1),
      bookingTime: '11:00',
      services: ['swedish-60'],
    },

    // ── Confirmed bookings (upcoming appointments) ──
    {
      customerId: 'cust_002',
      branchId: 'branch_rayasandra',
      status: 'confirmed',
      serviceType: 'salon',
      bookingDate: addDays(today, 1),
      bookingTime: '10:00',
      services: ['colour-global-short'],
      assignedStaffId: 'user_stylist_anjali',
    },
    {
      customerId: 'cust_005',
      branchId: 'branch_rayasandra',
      status: 'confirmed',
      serviceType: 'spa',
      bookingDate: today,
      bookingTime: '16:00',
      services: ['hot-stone-90'],
      assignedStaffId: 'user_therapist_meera',
    },

    // ── Completed bookings (past, with invoices) ──
    {
      customerId: 'cust_004',
      branchId: 'branch_rayasandra',
      status: 'completed',
      serviceType: 'salon',
      bookingDate: subDays(today, 3),
      bookingTime: '11:30',
      services: ['facial-gold', 'wax-full-arms'],
      assignedStaffId: 'user_stylist_priya',
      paymentMethod: 'cash',
      generateInvoice: true,
    },
    {
      customerId: 'cust_006',
      branchId: 'branch_rayasandra',
      status: 'completed',
      serviceType: 'salon',
      bookingDate: subDays(today, 7),
      bookingTime: '15:00',
      services: ['makeup-party', 'hair-ironing'],
      assignedStaffId: 'user_stylist_anjali',
      paymentMethod: 'upi',
      generateInvoice: true,
    },
    {
      customerId: 'cust_007',
      branchId: 'branch_rayasandra',
      status: 'completed',
      serviceType: 'spa',
      bookingDate: subDays(today, 5),
      bookingTime: '12:00',
      services: ['balinese-90'],
      assignedStaffId: 'user_therapist_lakshmi',
      paymentMethod: 'card',
      generateInvoice: true,
    },

    // ── Cancelled bookings ──
    {
      customerId: 'cust_008',
      branchId: 'branch_rayasandra',
      status: 'cancelled',
      serviceType: 'salon',
      bookingDate: subDays(today, 2),
      bookingTime: '14:00',
      services: ['keratin'],
      cancelledBy: 'customer',
      cancelReason: 'Personal emergency',
    },

    // ── Rejected bookings ──
    {
      customerId: 'cust_009',
      branchId: 'branch_rayasandra',
      status: 'rejected',
      serviceType: 'salon',
      bookingDate: subDays(today, 4),
      bookingTime: '17:00',
      services: ['bridal-hair', 'makeup-bridal'],
      rejectionReason: 'Staff unavailable for the selected time slot',
    },

    // ── No-show bookings ──
    {
      customerId: 'cust_010',
      branchId: 'branch_rayasandra',
      status: 'no_show',
      serviceType: 'salon',
      bookingDate: subDays(today, 6),
      bookingTime: '10:30',
      services: ['haircut-basic'],
      assignedStaffId: 'user_stylist_priya',
    },

    // ── Membership session (₹0 completed) ──
    {
      customerId: 'cust_004',
      branchId: 'branch_rayasandra',
      status: 'completed',
      serviceType: 'spa',
      bookingDate: subDays(today, 1),
      bookingTime: '13:00',
      services: ['deep-tissue-60'],
      assignedStaffId: 'user_therapist_meera',
      isMembershipSession: true,
      paymentMethod: 'cash', // N/A for membership but field required
      generateInvoice: true,
    },
  ]
}
```

### Demo Memberships

```ts
// scripts/data/demo/memberships.ts

import { subDays, addDays } from 'date-fns'

const today = new Date()

export const demoMemberships = [
  // Active Gold — plenty of hours left
  {
    customerId: 'cust_004',
    tierId: 'tier_gold',
    tierNameSnapshot: 'Gold',
    totalHoursMinutes: 900,
    usedHoursMinutes: 300,          // 5 hours used
    pricePaidPaise: 1500000,
    startsAt: subDays(today, 30),
    expiresAt: addDays(today, 60),
    status: 'active',
    createdBy: 'user_receptionist',
  },
  // Active Silver — almost expired, hours remaining
  {
    customerId: 'cust_005',
    tierId: 'tier_silver',
    tierNameSnapshot: 'Silver',
    totalHoursMinutes: 480,
    usedHoursMinutes: 360,          // 6 hours used, 2 hours left
    pricePaidPaise: 1000000,
    startsAt: subDays(today, 83),
    expiresAt: addDays(today, 7),   // Expires in 7 days
    status: 'active',
    createdBy: 'user_manager',
  },
  // Expired — forfeited hours (for testing expiry UI)
  {
    customerId: 'cust_006',
    tierId: 'tier_gold',
    tierNameSnapshot: 'Gold',
    totalHoursMinutes: 900,
    usedHoursMinutes: 540,          // 9 hours used, 6 hours forfeited
    pricePaidPaise: 1500000,
    startsAt: subDays(today, 100),
    expiresAt: subDays(today, 10),
    status: 'expired',
    createdBy: 'user_receptionist',
  },
]
```

### Demo Offers

```ts
// scripts/data/offers.ts

import { addDays, subDays } from 'date-fns'

const today = new Date()

export const demoOffers = [
  // Active percentage discount
  {
    id: 'offer_summer_glow',
    name: 'Summer Glow Special',
    slug: 'summer-glow-special',
    description: '20% OFF all facial services this summer! Glow up before the heat gets to you.',
    offerType: 'percentage',
    discountPercentage: 20,
    startDate: subDays(today, 10),
    endDate: addDays(today, 30),
    isActive: true,
    terms: 'Valid on weekdays only. Cannot combine with gems redemption.',
    displayOrder: 1,
    linkedServices: ['facial-classic', 'facial-gold', 'facial-diamond', 'detan', 'cleanup-basic'],
  },
  // Active combo price
  {
    id: 'offer_bridal_combo',
    name: 'Bridal Bliss Package',
    slug: 'bridal-bliss-package',
    description: 'Complete bridal package: Makeup + Hair Styling + Manicure + Pedicure at one unbeatable price.',
    offerType: 'combo_price',
    comboPricePaise: 2000000,        // ₹20,000 (vs ₹24,000 individual)
    startDate: subDays(today, 30),
    endDate: addDays(today, 60),
    isActive: true,
    terms: 'Advance booking required. Subject to staff availability.',
    displayOrder: 2,
    linkedServices: ['makeup-bridal', 'bridal-hair', 'manicure-spa', 'pedicure-spa'],
  },
  // Active flat discount
  {
    id: 'offer_first_visit',
    name: '₹200 OFF First Visit',
    slug: 'first-visit-200-off',
    description: 'New to Royal Glow? Get ₹200 off your first booking on any service.',
    offerType: 'flat',
    discountAmountPaise: 20000,
    startDate: subDays(today, 60),
    endDate: addDays(today, 90),
    isActive: true,
    terms: 'New customers only. One-time use.',
    displayOrder: 3,
    linkedServices: [], // All services eligible
  },
  // Expired offer (for testing expired state)
  {
    id: 'offer_diwali_2025',
    name: 'Diwali Sparkle 2025',
    slug: 'diwali-sparkle-2025',
    description: 'Celebrate Diwali with 30% OFF premium facials and SPA sessions!',
    offerType: 'percentage',
    discountPercentage: 30,
    startDate: subDays(today, 200),
    endDate: subDays(today, 170),
    isActive: false,
    displayOrder: 99,
    linkedServices: ['facial-gold', 'facial-diamond', 'swedish-60', 'aroma-60'],
  },
]
```

### Demo Gems / Loyalty

```ts
// scripts/data/demo/gems.ts

export const demoLoyaltyAccounts = [
  // Frequent customer with high balance
  {
    customerId: 'cust_004',
    gemsBalance: 156,
    totalGemsEarned: 230,
    totalGemsRedeemed: 74,
  },
  // New customer with small balance
  {
    customerId: 'cust_006',
    gemsBalance: 42,
    totalGemsEarned: 42,
    totalGemsRedeemed: 0,
  },
  // Customer who redeemed gems recently
  {
    customerId: 'cust_002',
    gemsBalance: 8,
    totalGemsEarned: 95,
    totalGemsRedeemed: 87,
  },
]
```

### Demo Leads (CRM)

```ts
// scripts/data/demo/leads.ts

export const demoLeads = [
  {
    name: 'Ritu Agarwal',
    phone: '+919876543001',
    email: 'ritu.a@example.com',
    serviceInterestedId: 'keratin',
    status: 'new',
    source: 'meta_ad',
    utmSource: 'facebook',
    utmCampaign: 'keratin-treatment-may',
    utmMedium: 'cpc',
  },
  {
    name: 'Sunita Rao',
    phone: '+919876543002',
    status: 'contacted',
    serviceInterestedId: 'swedish-60',
    source: 'meta_ad',
    utmSource: 'instagram',
    utmCampaign: 'spa-awareness-may',
    utmMedium: 'story',
    assignedTo: 'user_receptionist',
    lastContactedAt: subDays(today, 1),
  },
  {
    name: 'Prerna Mehta',
    phone: '+919876543003',
    status: 'follow_up',
    serviceInterestedId: 'makeup-bridal',
    source: 'meta_ad',
    utmSource: 'facebook',
    utmCampaign: 'bridal-meta',
    utmMedium: 'cpc',
    assignedTo: 'user_manager',
    lastContactedAt: subDays(today, 3),
  },
  {
    name: 'Deepa Nair',
    phone: '+919876543004',
    status: 'booked',
    serviceInterestedId: 'facial-gold',
    source: 'meta_ad',
    utmSource: 'facebook',
    utmCampaign: 'facial-offers-april',
    utmMedium: 'cpc',
    assignedTo: 'user_receptionist',
  },
  {
    name: 'Geeta Singh',
    phone: '+919876543005',
    status: 'lost',
    serviceInterestedId: 'colour-global-long',
    source: 'meta_ad',
    utmSource: 'instagram',
    utmCampaign: 'hair-colour-may',
    utmMedium: 'reel',
    assignedTo: 'user_receptionist',
    lastContactedAt: subDays(today, 15),
  },
]
```

---

## Seed Script Implementation Pattern

### Master Orchestrator

```ts
// scripts/seed.ts

import { db } from '@repo/database'
import { parseArgs } from 'util'
import { branches } from './data/branches'
import { categories } from './data/categories'
import { salonServices } from './data/services-salon'
import { spaServices } from './data/services-spa'
import { membershipTiers } from './data/membership-tiers'
import { staffMembers } from './data/staff'
import { systemSettings } from './data/settings'
import { customerTags } from './data/customer-tags'
import { demoCustomers } from './data/demo/customers'
import { generateDemoBookings } from './data/demo/bookings'
import { demoMemberships } from './data/demo/memberships'
import { demoOffers } from './data/offers'
import { demoLoyaltyAccounts } from './data/demo/gems'
import { demoLeads } from './data/demo/leads'

const env = process.env.APP_ENV as 'dev' | 'test' | 'prod'
const { values: flags } = parseArgs({
  options: {
    reset: { type: 'boolean', default: false },
    only: { type: 'string' },
    confirm: { type: 'boolean', default: false },
  },
})

// Safety guards
if (env === 'prod' && !flags.only?.match(/^(branch|settings|categories|services|tiers|tags)$/)) {
  console.error('❌ Only essential seeds allowed on prod.')
  process.exit(1)
}
if (flags.reset && env === 'prod') {
  console.error('❌ Cannot --reset on prod.')
  process.exit(1)
}

async function main() {
  console.log(`\n🌱 Seeding ${env} environment...\n`)
  const start = performance.now()

  // Phase 1: Production essentials (all envs)
  await seedBranches()
  await seedSettings()
  await seedCategories()
  await seedServices()
  await seedMembershipTiers()
  await seedCustomerTags()
  console.log('✅ Production essentials seeded')

  // Phase 2: Staff + demo data (dev, test only)
  if (env !== 'prod') {
    await seedStaff()
    await seedDemoCustomers()
    await seedDemoOffers()
    await seedDemoBookings()
    await seedDemoMemberships()
    await seedDemoGems()
    await seedDemoLeads()
    console.log('✅ Demo data seeded')
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(2)
  console.log(`\n🎉 Seeding complete in ${elapsed}s\n`)
}

main().catch((e) => {
  console.error('❌ Seed failed:', e)
  process.exit(1)
})
```

### Upsert Pattern (Idempotent)

```ts
// scripts/helpers/upsert.ts

import { db } from '@repo/database'
import { sql } from 'drizzle-orm'

/**
 * Upsert rows into a table. On conflict (id), update all columns.
 * This makes seeds idempotent — safe to run multiple times.
 */
export async function upsertMany<T extends { id: string }>(
  table: any,
  rows: T[],
  conflictColumn = 'id'
) {
  if (rows.length === 0) return

  for (const row of rows) {
    await db
      .insert(table)
      .values(row)
      .onConflictDoUpdate({
        target: [table[conflictColumn]],
        set: row,
      })
  }
}
```

### Reset Pattern (Dev/Test Only)

```ts
// scripts/helpers/reset.ts

import { db } from '@repo/database'
import { sql } from 'drizzle-orm'

/**
 * Truncate all tables in reverse FK order.
 * ONLY for dev and test environments.
 */
export async function resetDatabase() {
  const env = process.env.APP_ENV
  if (env === 'prod' || env === 'pprd') {
    throw new Error('CANNOT RESET PROD OR PPRD')
  }

  console.log('⚠️  Resetting database...')

  await db.execute(sql`
    TRUNCATE TABLE
      notification,
      audit_log,
      monthly_gst_summary,
      daily_sales_summary,
      loyalty_transaction,
      loyalty_account,
      lead_note,
      lead,
      customer_note,
      customer_tag_assignment,
      offer_redemption,
      offer_service,
      offer,
      invoice_item,
      invoice,
      booking_service,
      booking,
      spa_membership,
      push_subscription,
      "user",
      service,
      service_category,
      spa_membership_tier,
      customer_tag,
      branch,
      system_setting
    CASCADE
  `)

  console.log('✅ All tables truncated')
}
```

---

## CI/CD Integration

### Test Environment (CI Pipeline)

```yaml
# .github/workflows/test.yml (relevant step)

- name: Seed test database
  run: bun run scripts/seed.ts --reset
  env:
    APP_ENV: test
    DATABASE_URL: ${{ secrets.DATABASE_URL_TEST }}
```

### Preprod (Nightly Reset)

```yaml
# .github/workflows/nightly-pprd-reset.yml

name: Nightly Preprod Reset
on:
  schedule:
    - cron: '0 20 * * *'  # 01:30 IST (20:00 UTC)

jobs:
  reset-pprd:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - name: Reset preprod from prod + anonymize PII
        run: bun run scripts/anonymize-preprod.ts
        env:
          APP_ENV: pprd
          DATABASE_URL: ${{ secrets.NEON_PPRD_URL }}
```

---

## Data Volume by Environment

| Entity | Dev | Test |
|--------|-----|------|
| Branches | 2 | 1 |
| Categories | 10 | 10 |
| Services (salon) | ~40 | 10 |
| Services (spa) | 23 | 6 |
| Membership tiers | 3 | 3 |
| Staff | 8 | 8 |
| Customers | 15 | 5 |
| Bookings | ~30 | 20 |
| Invoices | ~15 | 10 |
| Active memberships | 2 | 1 |
| Expired memberships | 1 | 1 |
| Offers | 4 | 2 |
| Leads | 5 | 3 |
| Loyalty accounts | 3 | 2 |
| System settings | 20 | 20 |
| Customer tags | 7 | 7 |

> **Preprod** is not in this table — it gets real (anonymized) production data via nightly Neon branch reset. Volume mirrors prod.

---

## Important Rules

1. **Never seed production with demo data** — prod only gets branch, categories, services, tiers, settings, and customer tags
2. **All demo emails use `@demo.test`** — no risk of sending real emails to fake addresses
3. **All demo phones use `+9199xxx` pattern** — not real numbers
4. **Deterministic IDs in test env** — test assertions rely on known IDs (`cust_001`, `user_owner`, etc.)
5. **No passwords in seeds** — auth is Google OAuth only, no password column exists
6. **Seeds respect all DB constraints** — FK order, unique constraints, check constraints
7. **Timestamps are relative to `today`** — seed data always looks "fresh" (bookings in recent past/near future)
8. **Payment methods are randomized** — mix of `cash`, `upi`, `card` across completed bookings
9. **Demo attribution covers all sources** — `organic`, `gmb`, `walkin`, and converted `meta_ad` customers must always exist in dev/test data

---

## Running Locally

```bash
# First time setup (dev)
bun run scripts/seed.ts

# After schema changes (dev)
bun run scripts/seed.ts --reset

# Quick seed specific modules
bun run scripts/seed.ts --only=services
bun run scripts/seed.ts --only=staff,customers

# Verify seed data
bun run scripts/verify-seed.ts  # Counts rows per table, checks FK integrity
```
