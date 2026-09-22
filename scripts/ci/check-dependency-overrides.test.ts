import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkDependencyOverrides,
  compareVersions,
  inspectOverrides,
  minimumVersionOf,
  type Workspace,
} from './check-dependency-overrides'

// Synthetic versions throughout: the gate compares an override against whatever
// a workspace declares, so it must not depend on today's real dependency set.
function fixture(override: string, declared: string): string[] {
  const workspaces: Workspace[] = [
    {
      label: 'apps/example',
      manifest: { name: '@rgss/example', dependencies: { widget: declared } },
    },
  ]
  return inspectOverrides({ overrides: { widget: override } }, workspaces)
}

describe('compareVersions', () => {
  it('orders by numeric component rather than string order', () => {
    expect(compareVersions('0.29.6', '0.29.10')).toBe(-1)
    expect(compareVersions('4.13.8', '4.13.7')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('treats a missing component as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('2', '1.9.9')).toBe(1)
  })

  it('sorts a prerelease below its own release', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
  })
})

describe('minimumVersionOf', () => {
  it('reads the floor of the range operators Dependabot emits', () => {
    expect(minimumVersionOf('1.2.3')).toBe('1.2.3')
    expect(minimumVersionOf('^1.2.3')).toBe('1.2.3')
    expect(minimumVersionOf('~1.2.3')).toBe('1.2.3')
    expect(minimumVersionOf('>=1.2.3')).toBe('1.2.3')
    expect(minimumVersionOf('1.0.0-rc.1')).toBe('1.0.0-rc.1')
  })

  it('declines ranges it cannot reason about instead of guessing a floor', () => {
    for (const range of ['*', 'workspace:*', 'latest', '^1.0.0 || ^2.0.0', '>=1.0.0 <2.0.0']) {
      expect(minimumVersionOf(range), range).toBeNull()
    }
  })
})

describe('inspectOverrides', () => {
  it('rejects an override that pins below the declared version', () => {
    // The real regression: kysely declared ^0.29.6, root override stuck at 0.29.5,
    // so node_modules/.bun held kysely@0.29.5 and the manifest described fiction.
    expect(fixture('0.29.5', '^0.29.6')).toEqual([
      'widget: root override pins 0.29.5, but apps/example declares ^0.29.6. ' +
        'Raise the override to at least 0.29.6 or the declared version never installs.',
    ])
  })

  it('accepts an override at or above the declared floor', () => {
    expect(fixture('0.29.6', '^0.29.6')).toEqual([])
    expect(fixture('0.30.0', '^0.29.6')).toEqual([])
  })

  it('ignores packages that carry no override', () => {
    const workspaces: Workspace[] = [
      { label: 'apps/example', manifest: { dependencies: { untouched: '^9.9.9' } } },
    ]
    expect(inspectOverrides({ overrides: { widget: '1.0.0' } }, workspaces)).toEqual([])
  })

  it('checks peer and dev declarations, not just runtime dependencies', () => {
    const workspaces: Workspace[] = [
      { label: 'packages/ui', manifest: { peerDependencies: { widget: '^2.0.0' } } },
      { label: 'apps/tooling', manifest: { devDependencies: { widget: '^3.0.0' } } },
    ]
    const problems = inspectOverrides({ overrides: { widget: '1.0.0' } }, workspaces)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('packages/ui declares ^2.0.0')
    expect(problems[1]).toContain('apps/tooling declares ^3.0.0')
  })

  it('stays silent when either side is a range it cannot compare', () => {
    expect(fixture('1.0.0', 'workspace:*')).toEqual([])
    expect(fixture('>=1.0.0 <2.0.0', '^3.0.0')).toEqual([])
  })
})

describe('the committed root manifest', () => {
  it('has no override pinning below a workspace-declared version', () => {
    expect(checkDependencyOverrides(resolve(import.meta.dirname, '../..'))).toEqual([])
  })
})
