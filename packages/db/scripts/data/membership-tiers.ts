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
    defaultHoursMinutes: 0,           // Custom — set per customer
    defaultPricePaise: 0,             // Custom pricing
    defaultValidityDays: 90,
    description: 'Bespoke membership. Custom hours and pricing tailored to you.',
    isActive: true,
    displayOrder: 3,
  },
]
