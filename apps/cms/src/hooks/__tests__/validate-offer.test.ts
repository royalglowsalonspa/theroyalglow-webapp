/************************************************************
 * Module Name  : validate-offer.test
 * Scope        : CMS Collections — Offer save validation (offers.md)
 *
 * Description  : The beforeValidate hook refuses an incomplete rule with
 *                field errors, checks linked services against the app's
 *                catalogue in the save's transaction, refuses rule changes
 *                while sync is off, and lets a valid save through unchanged.
 *                Only txDb is mocked; no database.
 ************************************************************/

import { ValidationError } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { txDb } from '../../lib/sync-db'
import { SYNC_OFF_MESSAGE, validateOffer } from '../validate-offer'

vi.mock('../../lib/sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

type Row = {
  id: string
  name: string
  isActive: boolean
  serviceType: string
  categoryActive: boolean
}

/** A db whose select chain answers with `rows`, recording the ids asked for. */
function catalogueDb(rows: Row[]) {
  const where = vi.fn(async () => rows)
  return {
    db: { select: () => ({ from: () => ({ innerJoin: () => ({ where }) }) }) },
    where,
  }
}

const SALON = (id: string, name: string): Row => ({
  id,
  name,
  isActive: true,
  serviceType: 'salon',
  categoryActive: true,
})

const VALID = {
  title: '20% off facials',
  image: 4,
  showOnWebsite: true,
  validFrom: '2026-11-30T18:30:00.000Z',
  validUntil: '2026-12-31T18:30:00.000Z',
  rule: { type: 'percentage', percentage: 20, services: ['svc_facial'] },
}

type HookArgs = Parameters<typeof validateOffer>[0]

function run(data: unknown, originalDoc?: unknown) {
  return validateOffer({ data, originalDoc, req: {} } as unknown as HookArgs)
}

async function errorsOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError)
    return (error as ValidationError).data.errors.map((e) => e.path)
  }
  throw new Error('expected a ValidationError')
}

beforeEach(() => {
  vi.mocked(txDb).mockResolvedValue(catalogueDb([SALON('svc_facial', 'Facial')]).db as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(txDb).mockReset()
})

describe('validateOffer', () => {
  it('lets a valid rule through unchanged', async () => {
    await expect(run(VALID)).resolves.toBe(VALID)
  })

  it('reports every field error at once, before reading the catalogue', async () => {
    const paths = await errorsOf(
      run({ ...VALID, image: null, validUntil: null, rule: { type: 'flat', services: [] } }),
    )
    expect(paths).toEqual(['image', 'rule.amountPaise', 'rule.services', 'validUntil'])
    expect(txDb).not.toHaveBeenCalled()
  })

  it('checks the linked services against the catalogue', async () => {
    const catalogue = catalogueDb([{ ...SALON('svc_stone', 'Hot Stone'), serviceType: 'spa' }])
    vi.mocked(txDb).mockResolvedValue(catalogue.db as never)

    const paths = await errorsOf(
      run({ ...VALID, rule: { type: 'percentage', percentage: 10, services: ['svc_stone'] } }),
    )
    expect(paths).toEqual(['rule.services'])
    expect(catalogue.where).toHaveBeenCalledTimes(1)
  })

  it('merges an update’s changed fields over the saved offer', async () => {
    // Only the percentage changed; the saved rule supplies the rest.
    await expect(run({ rule: { percentage: 30 } }, VALID)).resolves.toEqual({
      rule: { percentage: 30 },
    })
    await expect(errorsOf(run({ rule: { percentage: 0 } }, VALID))).resolves.toEqual([
      'rule.percentage',
    ])
  })

  it('needs no catalogue read for a card without a rule', async () => {
    const card = { title: 'Free head massage', image: 2, rule: { type: 'none' } }
    await expect(run(card)).resolves.toBe(card)
    expect(txDb).not.toHaveBeenCalled()
  })

  describe('while sync is off', () => {
    beforeEach(() => {
      vi.stubEnv('SERVICE_SYNC_ENABLED', 'false')
    })

    it('refuses a save that adds, changes or removes a rule', async () => {
      for (const promise of [run(VALID), run({ rule: { type: 'none' } }, VALID)]) {
        let error: unknown
        try {
          await promise
        } catch (e) {
          error = e
        }
        expect(error).toBeInstanceOf(ValidationError)
        expect((error as ValidationError).data.errors).toContainEqual({
          path: 'rule.type',
          message: SYNC_OFF_MESSAGE,
        })
      }
    })

    it('still saves a card without a rule', async () => {
      const card = { title: 'Free head massage', image: 2, rule: { type: 'none' } }
      await expect(run(card)).resolves.toBe(card)
    })
  })
})
