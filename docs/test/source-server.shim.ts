/**
 * Test-only stand-in for the generated `@/.source/server` module.
 *
 * ## Why this shim exists
 *
 * `@/.source/server` (produced by `fumadocs-mdx`) statically imports every MDX
 * file via `?collection=` query specifiers. Those imports are transformed at
 * build time by the fumadocs Next.js/webpack loader. Under Vitest the transform
 * is unavailable: the fumadocs **Vite** plugin requires Vite 7/8 (`runnerImport`)
 * while Vitest 2.x bundles Vite 5, so importing the generated server module fails
 * with "content contains invalid JS syntax" when Vite tries to parse raw MDX.
 *
 * This shim produces the exact same public surface (`docs`, `docsV2`, each with
 * `toFumadocsSource()`) by loading the real content from disk through the
 * fumadocs **dynamic runtime** (`fumadocs-mdx/runtime/dynamic`), which compiles
 * MDX in pure Node via esbuild — no Vite MDX transform needed. The module under
 * test (`@/lib/source`) runs entirely unchanged on top of these collections; the
 * Vitest config aliases `@/.source/server` to this file.
 *
 * The page trees, slugs, URLs, and frontmatter are the real ones derived from
 * the real `content/docs` and `content/docs-v2` directories.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as Config from '@/source.config'
import { dynamic } from 'fumadocs-mdx/runtime/dynamic'

/** A discovered MDX entry in the shape the dynamic runtime expects. */
type LazyEntry = {
  info: { path: string; fullPath: string }
  data: Record<string, unknown>
}

const DOCS_ROOT = resolve(__dirname, '..')

/**
 * Minimal YAML-frontmatter reader. The content files use flat `key: value`
 * frontmatter; this extracts those pairs (with simple multi-line continuation)
 * so the dynamic runtime receives the real `title`/`description` for the page
 * tree. The compiled body is produced separately by the runtime from the file.
 */
function readFrontmatter(source: string): Record<string, unknown> {
  if (!source.startsWith('---')) {
    return {}
  }
  const end = source.indexOf('\n---', 3)
  if (end === -1) {
    return {}
  }
  const block = source.slice(3, end).split('\n')
  const data: Record<string, string> = {}
  let lastKey: string | null = null
  for (const rawLine of block) {
    const line = rawLine.trimEnd()
    if (line.trim() === '') {
      continue
    }
    const match = /^([A-Za-z][\w-]*):\s?(.*)$/.exec(line)
    if (match?.[1] !== undefined) {
      lastKey = match[1]
      data[lastKey] = stripQuotes(match[2] ?? '')
    } else if (lastKey !== null) {
      data[lastKey] = `${data[lastKey]} ${line.trim()}`.trim()
    }
  }
  return data
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** Recursively collect every file path (posix-relative to `dir`) under `dir`. */
function walk(dir: string, base = ''): string[] {
  const out: string[] = []
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const rel = base === '' ? dirent.name : `${base}/${dirent.name}`
    if (dirent.isDirectory()) {
      out.push(...walk(join(dir, dirent.name), rel))
    } else {
      out.push(rel)
    }
  }
  return out
}

/** Build the `{ entries, meta }` inputs the dynamic runtime needs for a dir. */
function scanCollection(relDir: string): {
  entries: LazyEntry[]
  meta: Record<string, unknown>
} {
  const absDir = join(DOCS_ROOT, relDir)
  const entries: LazyEntry[] = []
  const meta: Record<string, unknown> = {}

  for (const relPath of walk(absDir)) {
    const fullPath = join(absDir, relPath)
    if (relPath.endsWith('.mdx')) {
      const source = readFileSync(fullPath, 'utf-8')
      entries.push({
        info: { path: relPath, fullPath },
        data: readFrontmatter(source),
      })
    } else if (relPath.endsWith('meta.json')) {
      meta[relPath] = JSON.parse(readFileSync(fullPath, 'utf-8'))
    }
  }

  return { entries, meta }
}

const create = await dynamic(
  Config,
  { configPath: 'source.config.ts', environment: 'next', outDir: '.source' },
  { doc: { passthroughs: ['extractedReferences', 'lastModified'] } },
)

const docsScan = scanCollection('content/docs')
const docsV2Scan = scanCollection('content/docs-v2')

export const docs = await create.docs(
  'docs',
  join(DOCS_ROOT, 'content/docs'),
  docsScan.meta,
  docsScan.entries,
)

export const docsV2 = await create.docs(
  'docsV2',
  join(DOCS_ROOT, 'content/docs-v2'),
  docsV2Scan.meta,
  docsV2Scan.entries,
)
