import type { MetadataRoute } from 'next'

// Royal Glow brand tokens (from apps/web/src/styles/globals.css):
//   --color-cocoa-dark:   #1a0f0a  → theme_color
//   --color-canvas-white: #ffffff  → background_color
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Royal Glow Salon & Spa',
    short_name: 'Royal Glow',
    description:
      'Royal Glow Salon & Spa — a premium beauty and wellness destination in Bengaluru. Book salon and spa appointments, explore offers, and manage your visits.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1a0f0a',
    lang: 'en-IN',
    categories: ['lifestyle', 'health'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
