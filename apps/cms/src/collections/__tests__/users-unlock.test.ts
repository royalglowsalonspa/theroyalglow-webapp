import { unlockOperation } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { Users } from '../Users'

describe('Users account-unlock protection (GHSA-jg8r-5jh2-v2xj)', () => {
  const callers = [
    { label: 'anonymous', user: null },
    { label: 'CMS user', user: { id: 1, collection: 'users', email: 'caller@example.test' } },
    { label: 'MCP key', user: { id: 2, collection: 'payload-mcp-api-keys' } },
  ]

  for (const { label, user } of callers) {
    it.each(['caller@example.test', 'other@example.test'])(
      `denies ${label} unlocking %s before reading or modifying an account`,
      async (email) => {
        const db = { findOne: vi.fn(), updateOne: vi.fn() }
        // Exercise Payload's real operation without booting a server or live database.
        const args = {
          collection: { config: { ...Users, auth: {} } },
          data: { email },
          overrideAccess: false,
          req: { user, payload: { db }, t: (key: string) => key },
        } as unknown as Parameters<typeof unlockOperation>[0]

        await expect(unlockOperation(args)).rejects.toMatchObject({ status: 403 })
        expect(db.findOne).not.toHaveBeenCalled()
        expect(db.updateOne).not.toHaveBeenCalled()
      },
    )
  }

  it('retains built-in login and timed lockout defaults', () => {
    expect(Users.auth).toBe(true)
    expect(Users.access?.unlock).toBeTypeOf('function')
  })
})
