import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHANGELOG_PATH, ESCAPES, findUnsafe, historyStart, lint } from './lint-changelog-mdx'

const PREAMBLE = `---
title: Changelog
---

{/* Hand-written preamble. Contains \`{\` and \`}\` legitimately. */}

Intro prose with a <kbd>tag</kbd> that must not be linted.
`

describe('historyStart', () => {
  it('finds the first release heading', () => {
    const text = `${PREAMBLE}\n## [0.2.1](https://example.test/c) (2026-09-10)\n`
    expect(text.slice(historyStart(text), historyStart(text) + 5)).toBe('## [0')
  })

  it('returns -1 before the first release', () => {
    expect(historyStart(PREAMBLE)).toBe(-1)
  })
})

describe('findUnsafe', () => {
  it('flags the three MDX syntax characters', () => {
    const findings = findUnsafe('* fix: handle <Suspense> and {value}')
    expect(findings.map((f) => f.character)).toEqual(['<', '{', '}'])
  })

  it('leaves > alone, which is only markdown syntax at line start', () => {
    expect(findUnsafe('* fix: rename a -> b')).toEqual([])
  })

  it('ignores inline-code spans, where MDX parses nothing', () => {
    expect(findUnsafe('* fix: escape `<Suspense>` and `{value}` in output')).toEqual([])
  })

  it('ignores fenced code blocks', () => {
    const text = ['* fix: document the shape', '', '```ts', 'type A = { b: string }', '```'].join(
      '\n',
    )
    expect(findUnsafe(text)).toEqual([])
  })

  it('resumes linting after a fence closes', () => {
    const text = ['```ts', 'const a = { b: 1 }', '```', '* fix: handle <div>'].join('\n')
    expect(findUnsafe(text).map((f) => f.character)).toEqual(['<'])
  })

  it('reports 1-based line and column', () => {
    const text = ['* fix: fine', '* fix: bad <tag>'].join('\n')
    expect(findUnsafe(text)).toEqual([{ line: 2, column: 12, character: '<' }])
  })

  it('offsets line numbers by the history start', () => {
    expect(findUnsafe('* fix: bad <tag>', 21)[0]?.line).toBe(21)
  })

  it('accepts already-escaped entities', () => {
    expect(findUnsafe('* fix: handle &lt;Suspense&gt; and &#123;value&#125;')).toEqual([])
  })
})

describe('lint', () => {
  it('skips the hand-written preamble', () => {
    expect(lint(`${PREAMBLE}\n## [0.2.1](https://example.test/c) (2026-09-10)\n`)).toEqual([])
  })

  it('reports findings inside the release history only', () => {
    const text = `${PREAMBLE}\n## [0.2.1](https://example.test/c) (2026-09-10)\n\n* fix: handle <div>\n`
    const findings = lint(text)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.character).toBe('<')
  })

  it('returns nothing when no release exists yet', () => {
    expect(lint(PREAMBLE)).toEqual([])
  })
})

describe('the committed changelog page', () => {
  const text = readFileSync(join(import.meta.dirname, '..', '..', CHANGELOG_PATH), 'utf8')

  it('is clean', () => {
    expect(lint(text)).toEqual([])
  })

  it('keeps its frontmatter first, which Release Please relies on preserving', () => {
    expect(text.startsWith('---\ntitle: Changelog')).toBe(true)
  })

  it('carries no `# Changelog` H1 that would duplicate the frontmatter title', () => {
    expect(text).not.toMatch(/^# Changelog$/m)
  })

  it('holds a release heading, so Release Please always takes the splice branch', () => {
    // The `-1` branch of its updater prepends an H1 above the frontmatter.
    expect(text.search(/\n###? v?[0-9[]/)).toBeGreaterThan(0)
  })
})

describe('ESCAPES', () => {
  it('maps every flagged character to an entity', () => {
    for (const character of Object.keys(ESCAPES)) {
      expect(findUnsafe(character)).toHaveLength(1)
      expect(ESCAPES[character]).toMatch(/^&[a-z#0-9]+;$/)
    }
  })
})
