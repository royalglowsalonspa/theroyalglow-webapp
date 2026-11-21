/************************************************************
 * Module Name  : sync-offer.test
 * Scope        : CMS Integration — Offer sync (cms.offer → public.offer)
 *
 * Description  : An offer with a checkout rule upserts its mirror
 *                (`cms_offer_<id>`, IST dates, only its type's value) and
 *                replaces its linked services; without a rule it retires a
 *                mirror made earlier; a failure re-throws so Payload rolls
 *                the save back; with sync off nothing is written. The mapper
 *                is covered here too. Only txDb is mocked; no database.
 ************************************************************/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { offer, offerService, txDb } from '../../lib/sync-db'
import { mapPayloadToPublicOffer, type PayloadOfferDoc, publicOfferId } from '../offer-mapper'
import { syncOfferToPublic } from '../sync-offer'
import { makeFakeTxDb } from './fake-tx-db'

vi.mock('../../lib/sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

const CREATED_AT = '2026-11-01T04:30:00.000Z'

function offerDoc(over: Partial<PayloadOfferDoc> = {}): PayloadOfferDoc {
  return {
    id: 7,
    title: '20% off facials',
    description: 'This week only',
    active: true,
    showOnWebsite: true,
    // 01/12 00:00 IST and 31/12 12:00 IST.
    validFrom: '2026-11-30T18:30:00.000Z',
    validUntil: '2026-12-31T06:30:00.000Z',
    order: 2,
    rule: {
      type: 'percentage',
      percentage: 20,
      services: ['svc_facial', { id: 'svc_cleanup' }],
      terms: '  Weekdays only ',
    },
    createdAt: CREATED_AT,
    ...over,
  }
}

type HookArgs = Parameters<typeof syncOfferToPublic>[0]

function runHook(doc: PayloadOfferDoc, operation: 'create' | 'update' = 'update') {
  return syncOfferToPublic({ doc, operation, req: {} } as unknown as HookArgs)
}

let fake: ReturnType<typeof makeFakeTxDb>

beforeEach(() => {
  fake = makeFakeTxDb()
  vi.mocked(txDb).mockResolvedValue(fake.db as never)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(txDb).mockReset()
})

describe('mapPayloadToPublicOffer', () => {
  it('maps a rule to the mirror row with IST dates and only its value', () => {
    const mapped = mapPayloadToPublicOffer(offerDoc())
    expect(mapped?.serviceIds).toEqual(['svc_cleanup', 'svc_facial'])
    expect(mapped?.row).toEqual({
      id: 'cms_offer_7',
      name: '20% off facials',
      slug: 'cms-offer-7',
      description: 'This week only',
      offerType: 'percentage',
      discountPercentage: 20,
      discountAmountPaise: null,
      comboPricePaise: null,
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      isActive: true,
      terms: 'Weekdays only',
      imageUrl: null,
      displayOrder: 2,
      cmsId: 7,
      showOnWebsite: true,
      createdAt: CREATED_AT,
    })
  })

  it('keeps only the combo price for a combo, and a counter-only flag', () => {
    const mapped = mapPayloadToPublicOffer(
      offerDoc({
        showOnWebsite: false,
        rule: {
          type: 'combo_price',
          percentage: 20,
          comboPricePaise: 299_900,
          services: ['a', 'b'],
        },
      }),
    )
    expect(mapped?.row).toMatchObject({
      offerType: 'combo_price',
      discountPercentage: null,
      comboPricePaise: 299_900,
      showOnWebsite: false,
      terms: null,
    })
  })

  it('is null without a rule', () => {
    expect(mapPayloadToPublicOffer(offerDoc({ rule: { type: 'none' } }))).toBeNull()
    expect(mapPayloadToPublicOffer(offerDoc({ rule: null }))).toBeNull()
  })

  it('refuses a rule without its dates', () => {
    expect(() => mapPayloadToPublicOffer(offerDoc({ validUntil: null }))).toThrow(
      'offer rule without validUntil',
    )
  })
})

describe('syncOfferToPublic', () => {
  it('upserts the mirror and replaces its linked services', async () => {
    fake.joinRows.set('offer_service', [
      { offerId: 'cms_offer_7', serviceId: 'svc_old' },
      { offerId: 'cms_offer_9', serviceId: 'svc_other' },
    ])

    await runHook(offerDoc(), 'create')

    expect(fake.insert).toHaveBeenCalledWith(offer)
    expect(fake.rows.get('cms_offer_7')).toMatchObject({
      offerType: 'percentage',
      discountPercentage: 20,
      cmsId: 7,
      createdAt: new Date(CREATED_AT),
    })
    // The set clause never moves the id or the creation time.
    expect(fake.upsertSet()).not.toHaveProperty('id')
    expect(fake.upsertSet()).not.toHaveProperty('createdAt')
    expect(fake.upsertSet().updatedAt).toBeInstanceOf(Date)
    expect(fake.insert).toHaveBeenCalledWith(offerService)
    expect(fake.joinRowsOf('offer_service')).toEqual([
      { offerId: 'cms_offer_9', serviceId: 'svc_other' },
      { offerId: 'cms_offer_7', serviceId: 'svc_cleanup' },
      { offerId: 'cms_offer_7', serviceId: 'svc_facial' },
    ])
  })

  it('updates an existing mirror in place, so a save repairs a missing one too', async () => {
    await runHook(offerDoc(), 'update')
    await runHook(
      offerDoc({ title: 'Renamed', rule: { type: 'flat', amountPaise: 50_000, services: ['a'] } }),
    )

    expect(fake.rows.size).toBe(1)
    expect(fake.rows.get('cms_offer_7')).toMatchObject({
      name: 'Renamed',
      offerType: 'flat',
      discountAmountPaise: 50_000,
      discountPercentage: null,
    })
    expect(fake.joinRowsOf('offer_service')).toEqual([{ offerId: 'cms_offer_7', serviceId: 'a' }])
  })

  it('retires a mirror when the rule is removed, keeping its last rule', async () => {
    await runHook(offerDoc())
    await runHook(offerDoc({ rule: { type: 'none' } }))

    expect(fake.rows.get('cms_offer_7')).toMatchObject({
      isActive: false,
      offerType: 'percentage',
      discountPercentage: 20,
    })
    expect(fake.update).toHaveBeenCalledWith(offer)
  })

  it('writes nothing for a card that never had a rule', async () => {
    await runHook(offerDoc({ id: 3, rule: { type: 'none' } }), 'create')

    expect(fake.insert).not.toHaveBeenCalled()
    expect(fake.rows.size).toBe(0)
    expect(publicOfferId(3)).toBe('cms_offer_3')
  })

  it('re-throws a failed write so the save rolls back', async () => {
    fake.failWritesWith(new Error('constraint offer_cms_rule_check'))

    await expect(runHook(offerDoc())).rejects.toThrow('constraint offer_cms_rule_check')
    expect(console.error).toHaveBeenCalled()
  })

  it('writes nothing while sync is off', async () => {
    vi.stubEnv('SERVICE_SYNC_ENABLED', 'false')

    await runHook(offerDoc())

    expect(txDb).not.toHaveBeenCalled()
    expect(fake.insert).not.toHaveBeenCalled()
  })
})
