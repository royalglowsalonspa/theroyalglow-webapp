import { describe, expect, it } from 'vitest'
import { formatDateIN } from './date'

describe('formatDateIN', () => {
  it('formats a date as DD/MM/YYYY', () => {
    // 30 May 2026 (use UTC noon to avoid any local-midnight edge)
    const d = new Date(Date.UTC(2026, 4, 30, 12, 0, 0))
    expect(formatDateIN(d)).toBe('30/05/2026')
  })

  it('zero-pads day and month', () => {
    const d = new Date(Date.UTC(2026, 0, 5, 12, 0, 0))
    expect(formatDateIN(d)).toBe('05/01/2026')
  })
})
