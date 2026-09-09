import { describe, expect, test } from 'vitest'
import { evaluateAudit } from './audit'

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
})
