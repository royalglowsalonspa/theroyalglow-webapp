# Icon & OG Asset Manifest — Royal Glow Salon & Spa

These raster assets are **design deliverables**. The PWA manifest
(`apps/web/src/app/manifest.ts`) and page metadata already reference the stable
paths below, so the art can be dropped in later without any code change.

All files live under `apps/web/public/` and are served from the site root
(e.g. `public/icons/icon-192.png` → `https://theroyalglow.in/icons/icon-192.png`).

## Required assets

| File | Size | Format | Purpose |
|------|------|--------|---------|
| `icons/icon-192.png` | 192×192 | PNG | PWA manifest icon (home screen, small) |
| `icons/icon-512.png` | 512×512 | PNG | PWA manifest icon (splash / large) |
| `icons/icon-512-maskable.png` | 512×512 | PNG | Maskable icon — keep key content inside the [maskable safe zone](https://web.dev/articles/maskable-icon) (centre 80% / ~40px padding) |
| `icons/apple-touch-icon.png` | 180×180 | PNG | iOS home-screen icon |
| `og-default.jpg` | 1200×630 | JPG | Default OpenGraph / social share image |
| `logo.png` | — | PNG | Brand logo (Organization JSON-LD / header) |
| `favicon.ico` | 16/32/48 | ICO | Browser tab favicon (multi-resolution) |

## Brand colours (for the artwork)

- Cocoa dark `#1a0f0a` — primary background / theme colour
- Canvas white `#ffffff` — manifest background colour
- Royal gold `#f4e09b` / Deep gold `#c8a961` — accent

## Notes

- Maskable icons must survive aggressive platform masking (circle, squircle,
  rounded rect). Keep the logo well within the safe zone.
- `og-default.jpg` should be 1.91:1 (1200×630) for correct rendering on
  Facebook, WhatsApp, X, and LinkedIn.
- Until the final art lands, these paths will 404 — that is expected and does
  not break the manifest/metadata, which only reference the paths.
