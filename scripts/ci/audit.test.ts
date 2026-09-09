import { describe, expect, test } from 'vitest'
import { evaluateAudit, runAudit } from './audit'

const known = {
  url: 'https://github.com/advisories/GHSA-jg8r-5jh2-v2xj',
  title: 'Payload unlock access',
  vulnerable_versions: '<=3.88.0',
}

describe('maintainer audit exception', () => {
  test('accepts only the known advisory on exactly Payload 3.88.0', () => {
    expect(evaluateAudit({ payload: [known] }, '3.88.0')).toEqual([])
    expect(evaluateAudit({ payload: [known] }, '3.88.1')).toHaveLength(1)
    expect(evaluateAudit({ other: [known] }, '3.88.0')).toHaveLength(1)
  })
  test('blocks additional findings even alongside the accepted advisory', () => {
    expect(
      evaluateAudit({ payload: [known, { ...known, url: 'https://example.com/new' }] }, '3.88.0'),
    ).toHaveLength(1)
    expect(evaluateAudit({ payload: [known], joi: [known] }, '3.88.0')).toHaveLength(1)
  })
  test('rejects malformed reports and allows a clean report', () => {
    for (const report of [null, [], { error: 'unavailable' }, { payload: [{}] }]) {
      expect(() => evaluateAudit(report, '3.88.0')).toThrow()
    }
    expect(evaluateAudit({}, '3.88.0')).toEqual([])
  })
  test('blocks execution errors, signals, invalid JSON, and unexplained failure exit codes', () => {
    for (const result of [
      { stdout: '{}', status: 2 },
      { stdout: '{}', status: null },
      { stdout: '{}', status: 1 },
      { stdout: '{}', status: 0, error: new Error('spawn failed') },
      { stdout: '{}', status: 0, signal: 'SIGTERM' },
      { stdout: 'registry unavailable', status: 1 },
    ])
      expect(() => runAudit(result, '3.88.0')).toThrow()
  })
  test('returns success only for a clean audit or the explicit exception', () => {
    expect(runAudit({ stdout: '{}', status: 0 }, '3.88.0')).toBe(0)
    expect(runAudit({ stdout: JSON.stringify({ payload: [known] }), status: 1 }, '3.88.0')).toBe(0)
    expect(
      runAudit({ stdout: JSON.stringify({ payload: [known], joi: [known] }), status: 1 }, '3.88.0'),
    ).toBe(1)
  })
})
