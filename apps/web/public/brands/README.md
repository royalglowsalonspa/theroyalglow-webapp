# Trusted-brand logos (`/public/brands/`)

The homepage "Products We Trust" wall (`BrandLogosSection`) renders these as
**monochrome** logos. Drop the official **SVG** (preferred) or transparent PNG
for each brand here, using the exact filenames below.

Until a file exists, the section automatically falls back to the styled-text
wordmark for that brand — so the page is never broken.

## Required files

| Filename                | Brand        |
| ----------------------- | ------------ |
| `loreal.svg`            | L'ORÉAL      |
| `tresemme.svg`          | TRESemmé     |
| `lakme.svg`             | LAKMÉ        |
| `olaplex.svg`           | OLAPLEX      |
| `wella.svg`             | WELLA        |
| `moroccanoil.svg`       | MOROCCANOIL  |

> **SCHWARZKOPF is intentionally text-only** (final decision) — it has no SVG
> file and renders as a styled-text wordmark. Do not add `schwarzkopf.svg`.

## Guidelines

- **Monochrome is automatic.** The component applies `filter: brightness(0)`,
  so any source colour is rendered as solid dark ink to match the site. You can
  supply the brand's full-colour logo; it will display calm and on-brand.
- **Transparent background**, please (SVG or PNG-24).
- **Prefer the horizontal wordmark** lockup (not the stacked / icon-only mark)
  so it reads cleanly in a single row.
- Aim for a similar visual weight across brands; the wall renders them at a
  fixed height (~28px) with auto width.

## Where to get official assets

Each brand provides press / brand-kit assets on their corporate site. Only use
logos you are authorised to display (a salon retailing these products generally
is, but confirm for your jurisdiction).
