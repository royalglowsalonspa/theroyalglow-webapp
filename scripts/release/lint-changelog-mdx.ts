import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guards the one hazard created by letting Release Please write the Mintlify
 * changelog page directly.
 *
 * WHY RELEASE PLEASE CAN OWN A .mdx AT ALL:
 * Its changelog updater splices each new entry in at the first match of
 * `\n###? v?[0-9[]` and passes everything before that point through untouched
 * (release-please/src/updaters/changelog.ts). Once the file holds one
 * `## [x.y.z](...)` heading, the frontmatter and introduction above it are
 * permanently safe, and the `# Changelog` H1 it would otherwise prepend is
 * never emitted.
 *
 * WHAT IT CANNOT DO IS ESCAPE MDX.
 * MDX treats `<` as a tag opener and `{`/`}` as expression delimiters, so a
 * commit subject such as `fix: handle <Suspense> boundary` lands in the page raw
 * and fails the docs build. This lints only the release history — the region
 * Release Please owns — because the preamble above it is hand-written and
 * legitimately contains an MDX comment.
 *
 * On failure, escape the character on the offending line in the release pull
 * request: `&lt;` for `<`, `&#123;` for `{`, `&#125;` for `}`.
 */

export type Finding = {
  line: number
  column: number
  character: string
}

export const CHANGELOG_PATH = join('docs', 'releases', 'changelog.mdx')

/** Characters MDX parses as syntax, mapped to the entity that escapes them. */
export const ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '{': '&#123;',
  '}': '&#125;',
}

const RELEASE_HEADING = /^## /m
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const INLINE_CODE = /(`+[^`]*`+)/g

/**
 * Index of the first release heading, which is where Release Please's territory
 * begins. Returns -1 when no release has been published yet.
 */
export function historyStart(text: string): number {
  return text.search(RELEASE_HEADING)
}

/** Report MDX syntax characters outside code fences and inline-code spans. */
export function findUnsafe(text: string, firstLineNumber = 1): Finding[] {
  const findings: Finding[] = []
  let inFence = false

  text.split(/\r?\n/).forEach((line, index) => {
    if (FENCE.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    let column = 1
    for (const [segmentIndex, segment] of line.split(INLINE_CODE).entries()) {
      // Odd segments are the captured inline-code spans, where MDX parses nothing.
      if (segmentIndex % 2 === 0) {
        for (const [offset, character] of [...segment].entries()) {
          if (character in ESCAPES) {
            findings.push({
              line: firstLineNumber + index,
              column: column + offset,
              character,
            })
          }
        }
      }
      column += segment.length
    }
  })

  return findings
}

/** Lint the release-history region of a changelog page. */
export function lint(text: string): Finding[] {
  const start = historyStart(text)
  if (start === -1) return []
  const lineNumber = text.slice(0, start).split(/\r?\n/).length
  return findUnsafe(text.slice(start), lineNumber)
}

if (process.argv[1]?.endsWith('lint-changelog-mdx.ts')) {
  const path = join(import.meta.dirname, '..', '..', CHANGELOG_PATH)
  const findings = lint(readFileSync(path, 'utf8'))

  if (findings.length > 0) {
    console.error(
      `${CHANGELOG_PATH} contains ${findings.length} unescaped MDX character(s).\n` +
        'A commit subject introduced syntax that breaks the docs build. Escape each\n' +
        'one on the offending line in the release pull request:\n',
    )
    for (const { line, column, character } of findings) {
      console.error(
        `  ${CHANGELOG_PATH}:${line}:${column}  ${character}  ->  ${ESCAPES[character]}`,
      )
    }
    process.exitCode = 1
  } else {
    console.log(`${CHANGELOG_PATH} contains no unescaped MDX syntax.`)
  }
}
