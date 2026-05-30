export const salonServices = [
  // Haircut & Styling
  { id: 'svc_haircut_basic', name: 'Haircut (Basic)', slug: 'haircut-basic', categoryId: 'cat_haircut', durationMinutes: 30, pricePaise: 50000 },
  { id: 'svc_haircut_advanced', name: 'Haircut (Advanced / Layered)', slug: 'haircut-advanced', categoryId: 'cat_haircut', durationMinutes: 45, pricePaise: 80000 },
  { id: 'svc_wash_blowdry', name: 'Hair Wash & Blow Dry', slug: 'wash-blowdry', categoryId: 'cat_haircut', durationMinutes: 30, pricePaise: 40000 },
  { id: 'svc_straightening_temp', name: 'Hair Straightening (Temporary)', slug: 'straightening-temp', categoryId: 'cat_haircut', durationMinutes: 60, pricePaise: 150000 },
  { id: 'svc_hair_ironing', name: 'Hair Ironing', slug: 'hair-ironing', categoryId: 'cat_haircut', durationMinutes: 30, pricePaise: 60000 },
  { id: 'svc_bridal_hair', name: 'Bridal Hair Styling', slug: 'bridal-hair', categoryId: 'cat_haircut', durationMinutes: 90, pricePaise: 500000 },

  // Hair Colouring / Treatment
  { id: 'svc_colour_global_short', name: 'Global Colour (Short Hair)', slug: 'colour-global-short', categoryId: 'cat_colour', durationMinutes: 90, pricePaise: 250000 },
  { id: 'svc_colour_global_long', name: 'Global Colour (Long Hair)', slug: 'colour-global-long', categoryId: 'cat_colour', durationMinutes: 120, pricePaise: 400000 },
  { id: 'svc_highlights', name: 'Highlights / Balayage', slug: 'highlights', categoryId: 'cat_colour', durationMinutes: 120, pricePaise: 350000 },
  { id: 'svc_root_touchup', name: 'Root Touch-Up', slug: 'root-touchup', categoryId: 'cat_colour', durationMinutes: 45, pricePaise: 150000 },
  { id: 'svc_keratin', name: 'Keratin Treatment', slug: 'keratin', categoryId: 'cat_colour', durationMinutes: 180, pricePaise: 600000 },

  // Facial & Skincare
  { id: 'svc_facial_classic', name: 'Classic Facial', slug: 'facial-classic', categoryId: 'cat_facial', durationMinutes: 45, pricePaise: 80000 },
  { id: 'svc_facial_gold', name: 'Gold Facial', slug: 'facial-gold', categoryId: 'cat_facial', durationMinutes: 60, pricePaise: 150000 },
  { id: 'svc_facial_diamond', name: 'Diamond Facial', slug: 'facial-diamond', categoryId: 'cat_facial', durationMinutes: 60, pricePaise: 200000 },
  { id: 'svc_detan', name: 'De-Tan Pack', slug: 'detan', categoryId: 'cat_facial', durationMinutes: 30, pricePaise: 60000 },
  { id: 'svc_cleanup_basic', name: 'Cleanup (Basic)', slug: 'cleanup-basic', categoryId: 'cat_facial', durationMinutes: 30, pricePaise: 50000 },

  // Waxing
  { id: 'svc_wax_full_arms', name: 'Full Arms Waxing', slug: 'wax-full-arms', categoryId: 'cat_waxing', durationMinutes: 30, pricePaise: 40000 },
  { id: 'svc_wax_full_legs', name: 'Full Legs Waxing', slug: 'wax-full-legs', categoryId: 'cat_waxing', durationMinutes: 45, pricePaise: 60000 },
  { id: 'svc_wax_underarms', name: 'Underarms Waxing', slug: 'wax-underarms', categoryId: 'cat_waxing', durationMinutes: 15, pricePaise: 15000 },
  { id: 'svc_wax_full_body', name: 'Full Body Waxing', slug: 'wax-full-body', categoryId: 'cat_waxing', durationMinutes: 90, pricePaise: 200000 },
  { id: 'svc_wax_face', name: 'Upper Lip / Eyebrows', slug: 'wax-face', categoryId: 'cat_waxing', durationMinutes: 15, pricePaise: 10000 },

  // Manicure & Pedicure
  { id: 'svc_manicure_classic', name: 'Classic Manicure', slug: 'manicure-classic', categoryId: 'cat_mani_pedi', durationMinutes: 30, pricePaise: 50000 },
  { id: 'svc_manicure_spa', name: 'Spa Manicure', slug: 'manicure-spa', categoryId: 'cat_mani_pedi', durationMinutes: 45, pricePaise: 80000 },
  { id: 'svc_pedicure_classic', name: 'Classic Pedicure', slug: 'pedicure-classic', categoryId: 'cat_mani_pedi', durationMinutes: 30, pricePaise: 50000 },
  { id: 'svc_pedicure_spa', name: 'Spa Pedicure', slug: 'pedicure-spa', categoryId: 'cat_mani_pedi', durationMinutes: 45, pricePaise: 80000 },
  { id: 'svc_gel_nails', name: 'Gel Nails', slug: 'gel-nails', categoryId: 'cat_mani_pedi', durationMinutes: 60, pricePaise: 150000 },

  // Makeup Services
  { id: 'svc_makeup_party', name: 'Party Makeup', slug: 'makeup-party', categoryId: 'cat_makeup', durationMinutes: 60, pricePaise: 250000 },
  { id: 'svc_makeup_bridal', name: 'Bridal Makeup', slug: 'makeup-bridal', categoryId: 'cat_makeup', durationMinutes: 120, pricePaise: 1500000 },
  { id: 'svc_makeup_engagement', name: 'Engagement / Reception Makeup', slug: 'makeup-engagement', categoryId: 'cat_makeup', durationMinutes: 90, pricePaise: 800000 },
  { id: 'svc_saree_draping', name: 'Saree Draping', slug: 'saree-draping', categoryId: 'cat_makeup', durationMinutes: 30, pricePaise: 100000 },

  // Hair SPA & Head Therapies
  { id: 'svc_hair_spa_basic', name: 'Hair Spa (Basic)', slug: 'hair-spa-basic', categoryId: 'cat_hair_spa', durationMinutes: 45, pricePaise: 80000 },
  { id: 'svc_hair_spa_premium', name: "Hair Spa (Premium / L'Oréal)", slug: 'hair-spa-premium', categoryId: 'cat_hair_spa', durationMinutes: 60, pricePaise: 150000 },
  { id: 'svc_head_massage_oil', name: 'Head Massage (Oil)', slug: 'head-massage-oil', categoryId: 'cat_hair_spa', durationMinutes: 30, pricePaise: 50000 },
  { id: 'svc_scalp_treatment', name: 'Scalp Treatment', slug: 'scalp-treatment', categoryId: 'cat_hair_spa', durationMinutes: 45, pricePaise: 120000 },
]
