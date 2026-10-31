/************************************************************
 * Module Name  : membership/session-request.test
 * Scope        : Business Logic — Membership
 *
 * Description  : A retried "record session" request may replay the session
 *                its idempotency key already recorded only when it asks for
 *                exactly the same lines: services, durations and staff, in any
 *                order. Anything else must be treated as a different request.
 *
 *                One person does a whole session, named by the form or by
 *                every line (0028); naming nobody or two people is a 400.
 ************************************************************/

import { AppError } from '@rgss/errors'
import { describe, expect, it } from 'vitest'
import { isSameSessionRequest, type SessionLine, sessionAssignee } from './session-request'

function refusalOf(run: () => unknown): { statusCode: number; message: string } | null {
  try {
    run()
  } catch (error) {
    if (error instanceof AppError) {
      return { statusCode: error.statusCode, message: error.message }
    }
    throw error
  }
  return null
}

describe('sessionAssignee', () => {
  it('takes the form’s choice when the lines name nobody', () => {
    expect(sessionAssignee('stf_1', [{ staffId: null }, {}])).toBe('stf_1')
  })

  it('takes the one person every naming line agrees on', () => {
    expect(sessionAssignee(undefined, [{ staffId: 'stf_1' }, { staffId: 'stf_1' }])).toBe('stf_1')
    // A line that names nobody follows the others.
    expect(sessionAssignee(undefined, [{ staffId: 'stf_1' }, { staffId: null }])).toBe('stf_1')
    expect(sessionAssignee('stf_1', [{ staffId: 'stf_1' }])).toBe('stf_1')
  })

  it('refuses a session that names nobody', () => {
    expect(refusalOf(() => sessionAssignee(undefined, [{}, { staffId: null }]))).toEqual({
      statusCode: 400,
      message: 'Choose who is doing this session.',
    })
    expect(refusalOf(() => sessionAssignee('', [{ staffId: '' }]))).toEqual({
      statusCode: 400,
      message: 'Choose who is doing this session.',
    })
  })

  it.each<{ name: string; staffId: string | undefined; lines: string[] }>([
    { name: 'two lines', staffId: undefined, lines: ['stf_1', 'stf_2'] },
    { name: 'the form and a line', staffId: 'stf_2', lines: ['stf_1'] },
  ])('refuses a session whose $name name different people', ({ staffId, lines }) => {
    expect(
      refusalOf(() =>
        sessionAssignee(
          staffId,
          lines.map((id) => ({ staffId: id })),
        ),
      ),
    ).toEqual({
      statusCode: 400,
      message: 'One person does the whole session. Choose one person for all of it.',
    })
  })
})

const RECORDED: SessionLine[] = [
  { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
  { serviceId: 'svc_scrub_30', durationMinutes: 30, staffId: null },
]

describe('isSameSessionRequest', () => {
  it('matches the same lines in any order, treating a missing staff member as null', () => {
    expect(
      isSameSessionRequest(
        [
          { serviceId: 'svc_scrub_30', durationMinutes: 30 },
          { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
        ],
        RECORDED,
      ),
    ).toBe(true)
  })

  it.each([
    [
      'a changed duration',
      [
        { serviceId: 'svc_aroma_60', durationMinutes: 90, staffId: 'stf_1' },
        { serviceId: 'svc_scrub_30', durationMinutes: 30 },
      ],
    ],
    [
      'a changed staff member',
      [
        { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_2' },
        { serviceId: 'svc_scrub_30', durationMinutes: 30 },
      ],
    ],
    [
      'a staff member added to an unassigned line',
      [
        { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
        { serviceId: 'svc_scrub_30', durationMinutes: 30, staffId: 'stf_1' },
      ],
    ],
    [
      'a different service',
      [
        { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
        { serviceId: 'svc_wrap_30', durationMinutes: 30 },
      ],
    ],
    ['a missing line', [{ serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' }]],
    [
      'an extra line',
      [...RECORDED, { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' }],
    ],
    [
      'one line repeated instead of two different lines',
      [
        { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
        { serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' },
      ],
    ],
  ])('rejects %s', (_label, requested) => {
    expect(isSameSessionRequest(requested, RECORDED)).toBe(false)
  })

  it('matches repeated lines only when the counts agree', () => {
    const twice: SessionLine[] = [
      { serviceId: 'svc_aroma_60', durationMinutes: 60 },
      { serviceId: 'svc_aroma_60', durationMinutes: 60 },
    ]
    expect(isSameSessionRequest(twice, twice)).toBe(true)
  })
})
