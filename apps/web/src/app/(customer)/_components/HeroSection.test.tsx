/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 12-06-2026 & Updated - 12-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : HeroSection (component test)
 * Scope        : Customer Pages — Homepage Hero
 *
 * Description  : Component tests for the homepage hero image. Verifies the
 *                image is owner-managed (renders the Payload banner image and
 *                its alt text), falls back to the bundled brand SVG when no
 *                banner is active, is never lazy-loaded (it is the LCP element),
 *                and no longer hardcodes a Stitch asset URL.
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, Node fs
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        :
 * - The Stitch URL assertion reads the component source so a regression that
 *   reintroduces a hardcoded asset fails here rather than in production.
 * - No network access: next/image resolves the local SVG through its own loader
 *   and the CMS URL is supplied as a prop.
 ************************************************************/

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { ResolvedMedia } from '@/lib/cms/types'
import { HeroSection } from './HeroSection'

const CMS_IMAGE: ResolvedMedia = {
  url: 'https://pub-40c9806a7ea146c9b0469960f8b84d94.r2.dev/banner/hero.jpg',
  alt: 'Royal Glow treatment suite lit by warm evening light',
  width: 1240,
  height: 1120,
}

const HERO_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'HeroSection.tsx'),
  'utf8',
)

afterEach(() => {
  cleanup()
})

describe('HeroSection hero image', () => {
  it('renders the CMS banner image with its own alt text', () => {
    render(<HeroSection image={CMS_IMAGE} />)

    const img = screen.getByAltText(CMS_IMAGE.alt)
    expect(img).toBeInTheDocument()
    // next/image rewrites `src` through the optimiser, so assert the source URL
    // survives inside it rather than matching it byte-for-byte.
    expect(img.getAttribute('src')).toContain(encodeURIComponent(CMS_IMAGE.url))
  })

  it('falls back to the bundled brand SVG, marked decorative', () => {
    const { container } = render(<HeroSection />)

    // The fallback is `unoptimized`, so the local path is used verbatim.
    const img = container.querySelector('img[src="/hero-fallback.svg"]')
    expect(img).not.toBeNull()

    // Abstract brand geometry is DECORATIVE: the alt must be empty so screen
    // readers skip it rather than being told it depicts a salon interior. The
    // attribute must still be PRESENT (a missing alt is an a11y failure).
    expect(img?.getAttribute('alt')).toBe('')
    expect(img?.hasAttribute('alt')).toBe(true)

    // No stale descriptive alt survives on the fallback path.
    expect(screen.queryByAltText('Royal Glow salon interior — warm, premium atmosphere')).toBeNull()
  })

  it('never lazy-loads the hero image (it is the homepage LCP element)', () => {
    render(<HeroSection image={CMS_IMAGE} />)

    const img = screen.getByAltText(CMS_IMAGE.alt)
    expect(img.getAttribute('loading')).not.toBe('lazy')
    expect(img).toHaveAttribute('fetchpriority', 'high')
  })

  it('keeps the glassmorphism location/hours overlay intact', () => {
    render(<HeroSection />)

    expect(screen.getByText(/RAYASANDRA · BENGALURU/)).toBeInTheDocument()
    expect(screen.getByText(/Open today · 10:00 — 21:00/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Visit' })).toBeInTheDocument()
  })

  it('hardcodes no Stitch asset URL', () => {
    expect(HERO_SOURCE).not.toContain('lh3.googleusercontent.com')
  })
})
