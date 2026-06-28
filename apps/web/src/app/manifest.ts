/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : manifest
 * Scope        : PWA Configuration
 *
 * Description  : Web App Manifest for Progressive Web App capabilities
 *                including installability, theme, and icon definitions.
 *
 * Responsibilities :
 * - Define PWA name, icons, display mode, and theme colors
 * - Enable Add-to-Home-Screen on mobile devices
 *
 * Features / Functionality :
 * - Standalone display mode
 * - Brand colors (cocoa-dark theme, white background)
 * - 192px, 512px, and maskable icon variants
 * - en-IN locale, lifestyle/health categories
 *
 * Tech Stack   : Next.js 16 (MetadataRoute.Manifest)
 * Layer        : Infrastructure (PWA)
 *
 * Dependencies : next
 *
 * Notes        :
 * - Icons must exist in /public/icons/ directory
 ************************************************************/
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
      // Each size is listed twice: once with no purpose (defaults to "any" —
      // the standard home-screen icon) and once as "maskable" (adaptive
      // launchers). Next's Manifest type only accepts a single purpose literal
      // per entry, so the two purposes cannot be combined on one entry.
      // favicon.ico, icon0.svg, icon1.png, and apple-icon.png live in app/ and
      // are auto-emitted by Next's metadata file conventions (not part of this
      // web-app manifest).
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
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
