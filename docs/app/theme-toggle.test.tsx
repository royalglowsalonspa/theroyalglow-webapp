import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Theme-toggle configuration contract (task 2.6, Req 3.1-3.4).
 *
 * The docs theme toggle is NOT a custom component: it is provided by fumadocs
 * `RootProvider`, which mounts `next-themes` with `attribute="class"`,
 * `defaultTheme="system"`, `enableSystem: true` (confirmed in
 * `fumadocs-ui/dist/provider/base.js`). That configuration is what delivers the
 * three theme modes — light, dark, and system (the `prefers-color-scheme`
 * default when no preference is stored) — and the `localStorage` persistence
 * (Req 3.1-3.4).
 *
 * Rather than re-test `next-themes` internals, this suite verifies the
 * configuration contract our app is responsible for: that `app/layout.tsx`
 * mounts `RootProvider` from the next-themes-backed fumadocs provider and does
 * NOT disable its search dialog.
 *
 * LIMITATION (noted intentionally): a live behavioral unit test that drives
 * `next-themes` `useTheme().setTheme(...)` is not run here. `next-themes` is a
 * transitive dependency of fumadocs (not a direct `docs` dependency), so the
 * docs Vitest resolver cannot import it directly; and mounting the full
 * `RootProvider` requires an App Router context (`usePathname`) that jsdom does
 * not provide. The three-mode + persistence behavior is owned and covered by
 * `next-themes` itself; here we assert the wiring contract that selects it.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const layoutSource = readFileSync(resolve(HERE, 'layout.tsx'), 'utf-8')

describe('docs theme toggle configuration contract (task 2.6, Req 3.1-3.4)', () => {
  it('mounts RootProvider from the next-themes-backed fumadocs provider', () => {
    expect(layoutSource).toMatch(
      /import\s*\{\s*RootProvider\s*\}\s*from\s*'fumadocs-ui\/provider\/next'/,
    )
    expect(layoutSource).toMatch(/<RootProvider[\s>]/)
  })

  it('does not disable the search dialog on RootProvider (Req 3.1 toggle + search coexist)', () => {
    // No `search={{ enabled: false }}` (or any `enabled: false`) is passed.
    expect(layoutSource).not.toMatch(/enabled:\s*false/)
  })

  it('keeps theme application on <html> with suppressHydrationWarning for the class-attribute strategy', () => {
    // next-themes uses attribute="class" on the html element; the layout opts
    // into the documented hydration handling for that injected class.
    expect(layoutSource).toMatch(/<html[^>]*suppressHydrationWarning/)
  })
})
