/************************************************************
 * Module Name  : customers.create-profile.test
 * Scope        : Data Access — onboarding profile + consent receipt
 *
 * Description  : `createCustomerProfile` must write the customer_profile row
 *                and its consent receipt (an audit_log row) in ONE db.batch()
 *                transaction, so a profile can never exist without a record of
 *                the consent that allowed it.
 *
 * Approach     : The real function runs against a fake `db` whose insert
 *                builders only record what they were given. Awaiting a builder
 *                on its own (outside the batch) would call its `then`, which
 *                the fake records as a failure.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

type RecordedInsert = {
  table: unknown
  values: Record<string, unknown> | undefined
  returning: boolean
}

const fake = vi.hoisted(() => ({
  inserts: [] as RecordedInsert[],
  batches: [] as unknown[][],
  awaitedOutsideBatch: 0,
  batchResult: undefined as unknown,
  batchError: undefined as Error | undefined,
}))

vi.mock('../index', () => ({
  db: {
    insert(table: unknown) {
      const record: RecordedInsert = { table, values: undefined, returning: false }
      fake.inserts.push(record)
      const builder = {
        values(values: Record<string, unknown>) {
          record.values = values
          return builder
        },
        returning() {
          record.returning = true
          return builder
        },
        // Present only to detect a query executed on its own.
        // biome-ignore lint/suspicious/noThenProperty: deliberate thenable spy
        then(resolve: (value: unknown) => void) {
          fake.awaitedOutsideBatch += 1
          resolve([])
        },
      }
      return builder
    },
    async batch(queries: unknown[]) {
      fake.batches.push(queries)
      if (fake.batchError) throw fake.batchError
      if (fake.batchResult !== undefined) return fake.batchResult
      const profile = fake.inserts[0]?.values
      return [[{ id: profile?.id }], { rowCount: 1 }]
    },
  },
}))

import { customerProfile } from '../schema/profile'
import { auditLog } from '../schema/system'
import { createCustomerProfile, type NewCustomerProfile } from './customers'

const PROFILE: NewCustomerProfile = {
  userId: 'user_1',
  phone: '9876543210',
  gender: 'female',
  dateOfBirth: new Date('1995-04-12'),
  marketingConsent: true,
  marketingConsentAt: new Date('2026-09-23T10:00:00.000Z'),
  acquisitionSource: 'walkin',
  utmSource: 'walkin',
  utmCampaign: null,
  utmMedium: null,
}

const RECEIPT = {
  event: 'onboarding_consent',
  privacyPolicy: true,
  analytics: false,
  marketing: true,
} as const

const CONSENTED_AT = new Date('2026-09-23T10:00:00.000Z')

beforeEach(() => {
  fake.inserts.length = 0
  fake.batches.length = 0
  fake.awaitedOutsideBatch = 0
  fake.batchResult = undefined
  fake.batchError = undefined
})

describe('createCustomerProfile', () => {
  it('writes the profile and its consent receipt in a single batch', async () => {
    const result = await createCustomerProfile(PROFILE, RECEIPT, CONSENTED_AT)

    expect(fake.batches).toHaveLength(1)
    expect(fake.batches[0]).toHaveLength(2)
    expect(fake.awaitedOutsideBatch).toBe(0)

    const [profileInsert, receiptInsert] = fake.inserts
    expect(profileInsert?.table).toBe(customerProfile)
    expect(receiptInsert?.table).toBe(auditLog)

    const profileId = profileInsert?.values?.id
    expect(typeof profileId).toBe('string')
    expect(profileInsert?.values).toEqual({ ...PROFILE, id: profileId })
    expect(result).toEqual({ id: profileId })

    // The receipt points at the new profile and records the customer as actor.
    expect(receiptInsert?.values).toEqual({
      actorId: 'user_1',
      action: 'create',
      entityType: 'customer_profile',
      entityId: profileId,
      newValues: RECEIPT,
      createdAt: CONSENTED_AT,
    })
  })

  it('gives every profile its own id', async () => {
    await createCustomerProfile(PROFILE, RECEIPT, CONSENTED_AT)
    await createCustomerProfile({ ...PROFILE, userId: 'user_2' }, RECEIPT, CONSENTED_AT)

    const ids = fake.inserts
      .filter((insert) => insert.table === customerProfile)
      .map((insert) => insert.values?.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('surfaces a failed batch, such as a duplicate user_id, without writing anything else', async () => {
    fake.batchError = new Error('duplicate key value violates unique constraint')

    await expect(createCustomerProfile(PROFILE, RECEIPT, CONSENTED_AT)).rejects.toThrow(
      'duplicate key',
    )
    expect(fake.batches).toHaveLength(1)
    expect(fake.awaitedOutsideBatch).toBe(0)
  })

  it('throws when the profile insert returns no row', async () => {
    fake.batchResult = [[], { rowCount: 0 }]

    await expect(createCustomerProfile(PROFILE, RECEIPT, CONSENTED_AT)).rejects.toThrow(
      'customer_profile insert returned no rows.',
    )
  })
})
