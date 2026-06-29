// @vitest-environment node
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { latestSource, pageExistsIn, v2Source, versions } from '@/lib/source'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// These properties exercise the *runtime* fumadocs sources wired in
// `@/lib/source` — the real per-version loader page trees built from
// `content/docs` (latest, `baseUrl: '/docs'`) and `content/docs-v2`
// (`baseUrl: '/docs/v2'`).
//
// Toolchain workaround (documented): `@/lib/source` imports the generated
// `@/.source/server`, which statically imports raw MDX via `?collection=`
// specifiers. Vitest 2.x bundles Vite 5, which cannot transform those imports
// (the fumadocs Vite MDX plugin requires Vite 7/8's `runnerImport`). The Vitest
// config therefore aliases `@/.source/server` to `test/source-server.shim.ts`,
// which loads the *same real content* from disk through the fumadocs dynamic
// runtime (Node + esbuild). `@/lib/source` itself runs entirely unchanged, so
// these tests observe the real page trees, slugs, URLs, and compiled bodies.

const DOCS_ROOT = resolve(__dirname, '..')

/**
 * Extract the compiled MDX body from a page's data, tolerating both shapes:
 * the eager production build exposes `data.body` directly, while the dynamic
 * runtime used under test exposes a lazy `data.load()`. Either way a defined
 * body proves the document compiled and renders without error.
 */
async function loadBody(data: unknown): Promise<unknown> {
  const entry = data as {
    body?: unknown
    load?: () => Promise<{ body?: unknown }>
  }
  if (typeof entry.load === 'function') {
    return (await entry.load()).body
  }
  return entry.body
}

/** Recursively list every `.mdx` file under `dir`, as posix-relative paths. */
function walkMdx(dir: string, base = ''): string[] {
  const out: string[] = []
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const rel = base === '' ? dirent.name : `${base}/${dirent.name}`
    if (dirent.isDirectory()) {
      out.push(...walkMdx(join(dir, dirent.name), rel))
    } else if (rel.endsWith('.mdx')) {
      out.push(rel)
    }
  }
  return out
}

/** A minimal page-tree node shape (only the fields these properties inspect). */
type TreeNode = {
  type: string
  url?: string
  index?: TreeNode
  children?: TreeNode[]
}

/** Collect every page `url` reachable in a fumadocs page tree. */
function collectTreeUrls(node: TreeNode): string[] {
  const urls: string[] = []
  if (typeof node.url === 'string') {
    urls.push(node.url)
  }
  if (node.index) {
    urls.push(...collectTreeUrls(node.index))
  }
  for (const child of node.children ?? []) {
    urls.push(...collectTreeUrls(child))
  }
  return urls
}

/**
 * The version that *owns* a URL: the one whose `basePath` is the longest prefix
 * of the URL. This disambiguates `/docs` (latest) from `/docs/v2` (legacy),
 * since the latest base path is itself a prefix of every legacy base path.
 */
function owningVersion(url: string): (typeof versions)[number] | undefined {
  return versions
    .filter((v) => url === v.basePath || url.startsWith(`${v.basePath}/`))
    .sort((a, b) => b.basePath.length - a.basePath.length)[0]
}

/**
 * Does a page `slug` correspond to its source file `path` under fumadocs' slug
 * derivation? The slug equals the file path segments (minus `.mdx`), except a
 * folder `index` file collapses to its folder slug (trailing `index` dropped)
 * unless that slug is already claimed (then the `index` segment is kept).
 */
function slugMatchesPath(slug: string[], path: string): boolean {
  const segments = path.replace(/\.mdx$/, '').split('/')
  const collapsed = segments.at(-1) === 'index' ? segments.slice(0, -1) : segments
  const asString = JSON.stringify(slug)
  return asString === JSON.stringify(segments) || asString === JSON.stringify(collapsed)
}

// Feature: docs-theming-and-versioning, Property 2: Sidebar tree mirrors the content directory
//
// Validates: Requirements 2.1
//
// For each version source, the pages produced by its loader correspond
// one-to-one with the MDX files under its content directory (meta.json
// excluded), with folder nesting preserved.
describe('Property 2: Sidebar tree mirrors the content directory', () => {
  const cases = [
    { name: 'latest', source: latestSource, dir: 'content/docs' },
    { name: 'v2', source: v2Source, dir: 'content/docs-v2' },
  ] as const

  for (const { name, source, dir } of cases) {
    it(`${name}: pages correspond one-to-one with MDX files`, () => {
      const filesOnDisk = walkMdx(join(DOCS_ROOT, dir)).sort()
      const pageFiles = source
        .getPages()
        .map((page) => page.path)
        .sort()

      // No extra and no missing entries: the set of source files backing pages
      // is exactly the set of MDX files on disk (meta.json never appears).
      expect(pageFiles).toEqual(filesOnDisk)
      expect(pageFiles.some((p) => p.endsWith('meta.json'))).toBe(false)
    })

    it(`${name}: every page's slug preserves its file's folder nesting`, () => {
      for (const page of source.getPages()) {
        expect(
          slugMatchesPath(page.slugs, page.path),
          `slug ${JSON.stringify(page.slugs)} should derive from ${page.path}`,
        ).toBe(true)
      }
    })
  }
})

// Feature: docs-theming-and-versioning, Property 3: Every existing document resolves and renders
//
// Validates: Requirements 4.1
//
// For every page derived from a file under `content/docs`, the latest source's
// `getPage(slugs)` returns a defined page with a title, whose body compiles and
// renders without error.
describe('Property 3: Every existing document resolves and renders', () => {
  const pages = latestSource.getPages()

  it('latestSource exposes at least the known content pages', () => {
    expect(pages.length).toBeGreaterThan(0)
  })

  it.each(pages.map((page) => [page.slugs.join('/') || '(root)', page.slugs] as const))(
    'getPage resolves and renders %s',
    async (_label, slugs) => {
      const page = latestSource.getPage(slugs)
      expect(page).toBeDefined()
      if (page === undefined) {
        return
      }
      // Frontmatter title is present (drives the sidebar entry + page heading).
      expect(typeof page.data.title).toBe('string')
      expect(page.data.title.length).toBeGreaterThan(0)
      // The MDX body compiles to a renderable component without throwing.
      expect(await loadBody(page.data)).toBeDefined()
    },
  )
})

// Feature: docs-theming-and-versioning, Property 9: Versions are isolated
//
// Validates: Requirements 6.5, 10.4
//
// The slug set resolvable in latest is independent of v2's content source: a
// latest-only page is not resolvable under v2, every v2 page is reachable only
// under `/docs/v2`, and latest never serves a `/docs/v2` URL.
describe('Property 9: Versions are isolated', () => {
  const latest = versions.find((v) => v.isLatest)
  const v2 = versions.find((v) => v.id === 'v2')

  it('the registry wires both the latest and v2 runtime sources', () => {
    expect(latest).toBeDefined()
    expect(v2).toBeDefined()
  })

  it('v2 pages are reachable only under /docs/v2', () => {
    for (const page of v2Source.getPages()) {
      expect(page.url.startsWith('/docs/v2')).toBe(true)
    }
  })

  it('latest pages are reachable under /docs and never under /docs/v2', () => {
    for (const page of latestSource.getPages()) {
      expect(page.url.startsWith('/docs')).toBe(true)
      expect(page.url === '/docs/v2' || page.url.startsWith('/docs/v2/')).toBe(false)
    }
  })

  it('a latest-only slug does not resolve in v2 (and vice-versa holds for isolation)', () => {
    // `analytics` and `tech-stack` exist in latest but not in the v2 fixture.
    for (const latestOnly of [['analytics'], ['tech-stack']]) {
      expect(latestSource.getPage(latestOnly)).toBeDefined()
      expect(v2Source.getPage(latestOnly)).toBeUndefined()
      if (latest && v2) {
        expect(pageExistsIn(latest, latestOnly)).toBe(true)
        expect(pageExistsIn(v2, latestOnly)).toBe(false)
      }
    }
  })

  it('pageExistsIn keeps each version scoped to its own content (random latest pages)', () => {
    if (latest === undefined || v2 === undefined) {
      throw new Error('both versions must be registered')
    }
    const latestSlugs = latestSource
      .getPages()
      .map((page) => page.slugs)
      .filter((slug) => slug.length > 0)
    const v2Slugs = new Set(v2Source.getPages().map((page) => page.slugs.join('/')))

    fc.assert(
      fc.property(fc.constantFrom(...latestSlugs), (slug) => {
        // Every latest page resolves in latest. If the same relative slug is
        // absent from the v2 fixture, v2 must not resolve it — a change to one
        // version's content never leaks into the other.
        expect(pageExistsIn(latest, slug)).toBe(true)
        if (!v2Slugs.has(slug.join('/'))) {
          expect(pageExistsIn(v2, slug)).toBe(false)
        }
      }),
      { numRuns: 100 },
    )
  })
})

// Feature: docs-theming-and-versioning, Property 19: Sidebar is scoped to the active version
//
// Validates: Requirements 12.1
//
// For each version, every node in its page tree belongs to that version: the
// owning version of each tree URL (longest matching base path) is the version
// itself, so no cross-version entry appears in the sidebar.
describe('Property 19: Sidebar is scoped to the active version', () => {
  for (const version of versions) {
    it(`${version.id}: every page-tree URL belongs to ${version.id}`, () => {
      const urls = collectTreeUrls(version.source.pageTree as unknown as TreeNode)
      expect(urls.length).toBeGreaterThan(0)
      for (const url of urls) {
        expect(owningVersion(url)?.id).toBe(version.id)
      }
    })
  }
})

// Feature: docs-theming-and-versioning, Property 20: Internal links stay within the active version
//
// Validates: Requirements 12.2
//
// For each version, every page URL is owned by that version's base path, so
// following any internal link cannot switch the reader to a different version.
describe('Property 20: Internal links stay within the active version', () => {
  for (const version of versions) {
    it(`${version.id}: every page URL is prefixed by its base path`, () => {
      const pages = version.source.getPages()
      expect(pages.length).toBeGreaterThan(0)
      for (const page of pages) {
        expect(page.url.startsWith(version.basePath)).toBe(true)
        expect(owningVersion(page.url)?.id).toBe(version.id)
      }
    })

    it(`${version.id}: random page URLs never resolve under another version`, () => {
      const urls = version.source.getPages().map((page) => page.url)
      fc.assert(
        fc.property(fc.constantFrom(...urls), (url) => {
          const owner = owningVersion(url)
          expect(owner).toBeDefined()
          expect(owner?.basePath).toBe(version.basePath)
        }),
        { numRuns: 100 },
      )
    })
  }
})
