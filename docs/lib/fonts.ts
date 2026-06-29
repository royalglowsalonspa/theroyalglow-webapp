/**
 * Self-hosted font definitions for the Docs_Site Theme_System.
 *
 * Three faces are exposed as CSS variables and consumed by `app/global.css`
 * (the typography scale) and applied to `<html>`/`<body>` in `app/layout.tsx`
 * (task 2.3, separate change). Each face uses `display: 'swap'` and declares a
 * fallback stack so text renders immediately if a web font fails to load
 * (Req 1.7), and every face is self-hosted by `next/font` so no render-blocking
 * third-party font request is issued on first load (Req 1.4).
 *
 * Substitution record (Requirement 1.5):
 * The design's font table specifies the heading face as Cabinet Grotesk via
 * `next/font/local` (woff2). Those woff2 binaries are NOT present in the repo
 * (no `docs/app/fonts/` directory), and inventing binary font files is not
 * acceptable. To keep the build green now, the heading face is substituted with
 * the nearest documented `next/font/google` geometric-grotesk family, `Sora`
 * (a close match to Cabinet Grotesk's wide, high-contrast display character).
 * When the Cabinet Grotesk woff2 files are added under `docs/app/fonts/`, swap
 * the `heading` definition below to `next/font/local` pointing at those files.
 * Body (Plus Jakarta Sans) and Mono (JetBrains Mono) match the design exactly.
 */
import { JetBrains_Mono, Plus_Jakarta_Sans, Sora } from 'next/font/google'

/**
 * Heading face — `--font-heading`.
 * Design target: Cabinet Grotesk (next/font/local woff2).
 * Substituted with Sora (next/font/google) — see substitution record above.
 * Fallback stack per design: 'Segoe UI', system-ui, sans-serif.
 */
export const heading = Sora({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
  variable: '--font-heading',
  fallback: ['Segoe UI', 'system-ui', 'sans-serif'],
})

/**
 * Body / UI face — `--font-body`.
 * Plus Jakarta Sans via next/font/google (self-hosted by next/font).
 * Fallback stack per design: system-ui, -apple-system, sans-serif.
 */
export const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
})

/**
 * Code face — `--font-mono`.
 * JetBrains Mono via next/font/google (self-hosted by next/font).
 * Fallback stack per design: ui-monospace, 'Cascadia Code', monospace.
 */
export const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-mono',
  fallback: ['ui-monospace', 'Cascadia Code', 'monospace'],
})

/**
 * Composed `className` binding for the three font CSS variables.
 *
 * Apply to the root `<html>` (or `<body>`) element in `app/layout.tsx` so the
 * `--font-heading`, `--font-body`, and `--font-mono` custom properties are
 * available to the Theme_System token blocks. Example:
 *
 *   <html lang="en" className={fontVariables} suppressHydrationWarning>
 */
export const fontVariables = `${heading.variable} ${body.variable} ${mono.variable}`
