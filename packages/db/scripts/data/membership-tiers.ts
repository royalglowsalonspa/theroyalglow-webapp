/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : membership-tiers
 * Scope        : Seed Data — Membership Tiers
 *
 * Description  : SPA membership tier seed data defining Silver, Gold, and
 *                Platinum tiers with default hours, pricing, and validity.
 *
 * Responsibilities :
 * - Define Silver tier (8hrs, ₹10,000, 90 days)
 * - Define Gold tier (15hrs, ₹15,000, 90 days)
 * - Define Platinum tier (custom hours/pricing)
 *
 * Features / Functionality :
 * - Hours stored in minutes for precision (480, 900, 0)
 * - Pricing in paise (₹10,000 = 1000000 paise)
 * - Display ordering for UI tier selector
 * - Platinum tier supports fully custom configuration
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : None
 *
 * Notes        : All SPA services are accessible in any tier — hours are
 *                the only constraint. No gems earned on membership sessions.
 ************************************************************/

export const membershipTiers = [
  {
    id: 'tier_silver',
    name: 'Silver',
    slug: 'silver',
    defaultHoursMinutes: 480, // 8 hours
    defaultPricePaise: 1000000, // ₹10,000
    defaultValidityDays: 90,
    description: 'Perfect for occasional SPA visitors. 8 hours of pure relaxation.',
    isActive: true,
    displayOrder: 1,
  },
  {
    id: 'tier_gold',
    name: 'Gold',
    slug: 'gold',
    defaultHoursMinutes: 900, // 15 hours
    defaultPricePaise: 1500000, // ₹15,000
    defaultValidityDays: 90,
    description: 'Our most popular tier. 15 hours — enough for weekly sessions.',
    isActive: true,
    displayOrder: 2,
  },
  {
    id: 'tier_platinum',
    name: 'Platinum',
    slug: 'platinum',
    defaultHoursMinutes: 0, // Custom — set per customer
    defaultPricePaise: 0, // Custom pricing
    defaultValidityDays: 90,
    description: 'Bespoke membership. Custom hours and pricing tailored to you.',
    isActive: true,
    displayOrder: 3,
  },
]
