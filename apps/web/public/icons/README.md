# Icon & OG Asset Manifest — Royal Glow Salon & Spa

Status of the brand raster assets and where each one lives.

## PWA manifest icons — PRESENT ✅

Referenced by `apps/web/src/app/manifest.ts` (served from the site root).

| File | Size | Format | Purpose |
|------|------|--------|---------|
| `icons/icon-192.png` | 192×192 | PNG | PWA manifest icon (`any maskable`) |
| `icons/icon-512.png` | 512×512 | PNG | PWA manifest icon (`any maskable`) |

## Browser / tab / iOS icons — PRESENT ✅ (Next.js app/ convention)

These live in `apps/web/src/app/` and are auto-emitted by Next.js 16 metadata
file conventions — no manual `<link>` wiring required:

| File | Emits |
|------|-------|
| `app/favicon.ico` | `<link rel="icon">` (legacy/tab) |
| `app/icon0.svg` | `<link rel="icon" type="image/svg+xml">` |
| `app/icon1.png` | `<link rel="icon" type="image/png">` |
| `app/apple-icon.png` | `<link rel="apple-touch-icon">` |

## Still pending ❌

| File | Path | Size | Used by |
|------|------|------|---------|
| `og-default.jpg` | `apps/web/public/og-default.jpg` | 1200×630 (1.91:1) | Default OpenGraph / social share image (referenced by `src/lib/seo/metadata.ts` as `/og-default.jpg`). Until supplied, social link previews have no image. |

## Brand colours (for artwork)

- Cocoa dark `#1a0f0a` — theme colour
- Canvas white `#ffffff` — manifest background colour
- Royal gold `#f4e09b` / Deep gold `#c8a961` — accent

## Notes

- The OG image should be 1.91:1 (1200×630) for correct rendering on Facebook,
  WhatsApp, X, and LinkedIn.
- `app/icon0.svg` is a large vector (~2 MB). Optional optimisation: minify/flatten
  it, or drop it and keep only `icon1.png` + `favicon.ico` if tab-icon payload
  matters.
