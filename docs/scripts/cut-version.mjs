#!/usr/bin/env bun
/**
 * Version_Workflow automation — cut a new legacy docs version `/docs/v{N}`.
 *
 * Run with Bun (so the pure TypeScript core can be imported directly):
 *
 *     bun run scripts/cut-version.mjs <N>
 *     bun run scripts/cut-version.mjs v3
 *
 * Steps (design "Version_Workflow", Requirements 10.1–10.4, 10.6):
 *   1. Parse + validate `N` (positive integer, no leading zeros).
 *   2. GUARD: import the pure `cutVersion` core + `versionsMeta` and run the
 *      cut against the live registry. If `v{N}` already exists, `cutVersion`
 *      throws `VersionCutConflictError`; the script prints the conflicting
 *      `/docs/v{N}` prefix and exits non-zero WITHOUT writing anything (Req 10.6).
 *   3. Copy `content/docs` (latest) → `content/docs-v{N}` (isolated recursive
 *      copy) via `node:fs/promises` (Req 10.1, 10.4).
 *   4. Best-effort register the collection (`source.config.ts`), the loader
 *      (`lib/source.ts`), and the registry entry (`lib/versions.ts`). Each edit
 *      is applied only when its anchor marker is found and the change is not
 *      already present; otherwise a copy-pasteable manual step is printed
 *      instead of risking file corruption (Req 10.2).
 *   5. Print a summary and remind to run `bun run postinstall` + `bun run build`.
 *
 * The decision/guard logic lives in `lib/cut-version.ts` (pure, unit/PBT
 * tested). This script only performs the side effects that core sanctions.
 */

import { cp, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** docs/ root, resolved from this script's location (scripts/ → ..). */
const DOCS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIB_DIR = join(DOCS_ROOT, 'lib')
const CONTENT_DIR = join(DOCS_ROOT, 'content')

/** ANSI helpers (no dependency); degrade to plain text when not a TTY. */
const color = process.stdout.isTTY
  ? {
      bold: (s) => `\u001b[1m${s}\u001b[0m`,
      red: (s) => `\u001b[31m${s}\u001b[0m`,
      green: (s) => `\u001b[32m${s}\u001b[0m`,
      yellow: (s) => `\u001b[33m${s}\u001b[0m`,
      cyan: (s) => `\u001b[36m${s}\u001b[0m`,
    }
  : {
      bold: (s) => s,
      red: (s) => s,
      green: (s) => s,
      yellow: (s) => s,
      cyan: (s) => s,
    }

/** Print an error and exit non-zero without having written anything. */
function fail(message) {
  console.error(`${color.red('✗')} ${message}`)
  process.exit(1)
}

/**
 * Parse the requested version number from argv. Accepts `3` or `v3`. Mirrors
 * the `cutVersion` core contract: a positive integer with no leading zeros.
 */
function parseVersionArg(raw) {
  if (raw === undefined) {
    fail('Missing version number.\n  Usage: bun run scripts/cut-version.mjs <N>   (e.g. 3 or v3)')
  }
  const cleaned = raw.startsWith('v') ? raw.slice(1) : raw
  if (!/^[1-9]\d*$/.test(cleaned)) {
    fail(
      `Invalid version "${raw}". Expected a positive integer with no leading zeros (e.g. 3 or v3).`,
    )
  }
  return Number.parseInt(cleaned, 10)
}

/** Does a filesystem path exist? */
async function pathExists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

/**
 * Apply a single best-effort string edit to a file.
 *
 * @returns one of:
 *   - `{ status: 'applied' }`   — anchor found, edit written.
 *   - `{ status: 'present' }`   — change already in the file (idempotent skip).
 *   - `{ status: 'manual' }`    — anchor missing; nothing written, caller prints
 *                                 the manual instruction.
 */
async function applyEdit(filePath, { alreadyPresent, anchor, replacement }) {
  const content = await readFile(filePath, 'utf8')
  if (alreadyPresent(content)) {
    return { status: 'present' }
  }
  if (!content.includes(anchor)) {
    return { status: 'manual' }
  }
  const next = content.replace(anchor, replacement)
  await writeFile(filePath, next, 'utf8')
  return { status: 'applied' }
}

async function main() {
  const n = parseVersionArg(process.argv[2])
  const idLabel = `v${n}`
  const prefix = `/docs/${idLabel}`
  const contentSrc = join(CONTENT_DIR, 'docs')
  const contentDest = join(CONTENT_DIR, `docs-${idLabel}`)

  console.log(color.bold(`\nCutting documentation version ${idLabel} (${prefix})\n`))

  // ── Step 1 + 2: import the pure core and run the guard ────────────────────
  let cutVersion
  let VersionCutConflictError
  let versionsMeta
  try {
    const coreUrl = pathToFileURL(join(LIB_DIR, 'cut-version.ts')).href
    const versionsUrl = pathToFileURL(join(LIB_DIR, 'versions.ts')).href
    const core = await import(coreUrl)
    const versions = await import(versionsUrl)
    cutVersion = core.cutVersion
    VersionCutConflictError = core.VersionCutConflictError
    versionsMeta = versions.versionsMeta
  } catch (error) {
    fail(
      `Could not import the pure cut-version core from lib/. This script must be run with Bun (which executes TypeScript): "bun run scripts/cut-version.mjs ${n}".\n  ${error}`,
    )
  }

  /** @type {readonly unknown[]} */
  let nextRegistry
  try {
    // GUARD: throws VersionCutConflictError if v{N} already exists, or RangeError
    // for a non-positive integer. Nothing has been written yet.
    nextRegistry = cutVersion(versionsMeta, n)
  } catch (error) {
    if (error instanceof VersionCutConflictError) {
      fail(
        `Version ${idLabel} already exists — conflicting prefix ${color.bold(error.prefix)}.\n  No files were changed. Pick a different version number.`,
      )
    }
    fail(`${error}`)
  }

  console.log(
    `${color.green('✓')} Guard passed: ${idLabel} is free to cut ` +
      `(registry will hold ${nextRegistry.length} versions).`,
  )

  // ── Step 3: copy content/docs → content/docs-v{N} (isolated) ──────────────
  const copyNotes = []
  if (await pathExists(contentDest)) {
    copyNotes.push(
      `${color.yellow('!')} content/docs-${idLabel} already exists — skipped the copy to avoid overwriting it. Delete it first if you want a fresh copy.`,
    )
  } else if (!(await pathExists(contentSrc))) {
    fail(`Source content directory not found: ${contentSrc}`)
  } else {
    await cp(contentSrc, contentDest, { recursive: true })
    copyNotes.push(
      `${color.green('✓')} Copied content/docs → content/docs-${idLabel} (isolated, independent).`,
    )
  }

  // ── Step 4: best-effort register collection + loader + registry entry ─────
  const sourceConfigPath = join(DOCS_ROOT, 'source.config.ts')
  const sourceLibPath = join(LIB_DIR, 'source.ts')
  const versionsLibPath = join(LIB_DIR, 'versions.ts')

  /** Manual fallback instructions, collected per file when an anchor is missing. */
  const manualSteps = []
  const autoEdits = []

  // 4a. source.config.ts — add the defineDocs collection before the default export.
  {
    const collectionBlock = `export const docs${idLabel.toUpperCase()} = defineDocs({\n  dir: 'content/docs-${idLabel}',\n})\n\n`
    const anchor = 'export default defineConfig({'
    const result = await applyEdit(sourceConfigPath, {
      alreadyPresent: (c) => c.includes(`export const docs${idLabel.toUpperCase()} =`),
      anchor,
      replacement: `${collectionBlock}${anchor}`,
    })
    if (result.status === 'applied') {
      autoEdits.push(
        `${color.green('✓')} source.config.ts — added docs${idLabel.toUpperCase()} collection.`,
      )
    } else if (result.status === 'present') {
      autoEdits.push(
        `${color.yellow('!')} source.config.ts — docs${idLabel.toUpperCase()} already declared (skipped).`,
      )
    } else {
      manualSteps.push(
        `source.config.ts — add this export above "export default defineConfig":\n\n    export const docs${idLabel.toUpperCase()} = defineDocs({\n      dir: 'content/docs-${idLabel}',\n    })\n`,
      )
    }
  }

  // 4b. lib/source.ts — extend the @/.source import, add the loader, register in the map.
  {
    const content = await readFile(sourceLibPath, 'utf8')
    const loaderConst = `${idLabel}Source`
    const collectionName = `docs${idLabel.toUpperCase()}`

    const importAnchorRe = /import\s*\{([^}]*)\}\s*from\s*'@\/\.source\/server'/
    const importMatch = content.match(importAnchorRe)

    const hasLoader = content.includes(`export const ${loaderConst} =`)
    const hasImport = importMatch ? importMatch[1].includes(collectionName) : false
    const hasMapEntry = content.includes(`['${idLabel}', ${loaderConst}]`)

    const loaderBlock = `/** Legacy ${idLabel} source — served under ${prefix}, loaded from its own collection. */\nexport const ${loaderConst} = loader({\n  baseUrl: '${prefix}',\n  source: ${collectionName}.toFumadocsSource(),\n})\n\n`
    const loaderAnchor = '/**\n * Backward-compatible alias for the Latest_Version source.'
    const mapAnchor = "['latest', latestSource],"

    const canAuto =
      importMatch !== null && content.includes(loaderAnchor) && content.includes(mapAnchor)

    if (hasLoader && hasImport && hasMapEntry) {
      autoEdits.push(`${color.yellow('!')} lib/source.ts — ${loaderConst} already wired (skipped).`)
    } else if (canAuto) {
      let next = content
      if (!hasImport) {
        next = next.replace(importAnchorRe, (_full, names) => {
          const trimmed = names.trim().replace(/,\s*$/, '')
          return `import { ${trimmed}, ${collectionName} } from '@/.source/server'`
        })
      }
      if (!hasLoader) {
        next = next.replace(loaderAnchor, `${loaderBlock}${loaderAnchor}`)
      }
      if (!hasMapEntry) {
        next = next.replace(mapAnchor, `${mapAnchor}\n  ['${idLabel}', ${loaderConst}],`)
      }
      await writeFile(sourceLibPath, next, 'utf8')
      autoEdits.push(
        `${color.green('✓')} lib/source.ts — imported ${collectionName}, added ${loaderConst}, registered in sourcesById.`,
      )
    } else {
      manualSteps.push(
        `lib/source.ts — make three edits:\n\n  1. Add "${collectionName}" to the import from '@/.source/server'.\n  2. Add the loader:\n\n     export const ${loaderConst} = loader({\n       baseUrl: '${prefix}',\n       source: ${collectionName}.toFumadocsSource(),\n     })\n\n  3. Add to the sourcesById map:  ['${idLabel}', ${loaderConst}],\n`,
      )
    }
  }

  // 4c. lib/versions.ts — insert the registry entry after the Latest_Version entry.
  {
    const entryBlock = `  {\n    id: '${idLabel}',\n    label: '${idLabel}',\n    versionNumber: ${n},\n    basePath: '${prefix}',\n    isLatest: false,\n  },\n`
    const anchor = '    isLatest: true,\n  },\n'
    const result = await applyEdit(versionsLibPath, {
      alreadyPresent: (c) => c.includes(`id: '${idLabel}',`),
      anchor,
      replacement: `${anchor}${entryBlock}`,
    })
    if (result.status === 'applied') {
      autoEdits.push(`${color.green('✓')} lib/versions.ts — inserted ${idLabel} registry entry.`)
    } else if (result.status === 'present') {
      autoEdits.push(
        `${color.yellow('!')} lib/versions.ts — ${idLabel} entry already present (skipped).`,
      )
    } else {
      manualSteps.push(
        `lib/versions.ts — add this entry to the versionsMeta array (after the Latest entry):\n\n${entryBlock}`,
      )
    }
  }

  // ── Step 5: summary ───────────────────────────────────────────────────────
  console.log(`\n${color.bold('Content')}`)
  for (const note of copyNotes) {
    console.log(`  ${note}`)
  }

  console.log(`\n${color.bold('Registration (best-effort)')}`)
  for (const edit of autoEdits) {
    console.log(`  ${edit}`)
  }

  if (manualSteps.length > 0) {
    console.log(
      `\n${color.bold(color.yellow('Manual steps required (anchors not found — nothing written for these):'))}`,
    )
    for (const step of manualSteps) {
      console.log(`\n${color.cyan(step)}`)
    }
  }

  console.log(`\n${color.bold('Next')}`)
  console.log('  1. Review the diffs for source.config.ts, lib/source.ts, lib/versions.ts.')
  console.log(`  2. Regenerate the fumadocs source:  ${color.cyan('bun run postinstall')}`)
  console.log(`  3. Verify the build:                ${color.cyan('bun run build')}`)
  console.log(
    `\n${color.green('Done.')} ${idLabel} cut. Every pre-existing version remains unchanged (additive cut).\n`,
  )
}

main().catch((error) => {
  fail(`${error?.stack ?? error}`)
})
