// @vitest-environment node
/************************************************************
 * Module Name  : invoices/pdf-payload.test
 * Scope        : Unit tests — the invoice render payload (multi-branch R6.1, TX-05)
 *
 * Description  : buildPdfPayload maps an invoice as stored into the payload
 *                the invoicing service renders. An invoice issued with the
 *                snapshots renders from them alone: its issuer, tax point,
 *                stored CGST/SGST and each line's SAC code and rate, whatever
 *                the branch looks like today. An invoice from before the
 *                snapshots renders as it always did: the branch row, one SAC
 *                code and an even split. Both satisfy the render contract.
 *
 * Approach     : Pure mapping; fixtures shaped like getInvoiceForPdf's result.
 ************************************************************/

import { invoicePdfPayloadSchema } from '@rgss/types'
import { describe, expect, it } from 'vitest'
import { buildPdfPayload, type LoadedInvoice } from './pdf-payload'

const ISSUED_AT = new Date('2026-10-25T06:45:00.000Z')

type StoredInvoice = LoadedInvoice['invoice']
type StoredItem = LoadedInvoice['items'][number]

function storedInvoice(overrides: Partial<StoredInvoice> = {}): StoredInvoice {
  return {
    id: 'inv_1',
    invoiceNumber: 'RS/2627/000042',
    branchId: 'branch_rs',
    bookingId: 'bk_1',
    customerId: 'cust_1',
    subtotalPaise: 350000,
    discountAmountPaise: 0,
    taxableValuePaise: 322841,
    gstAmountPaise: 27159,
    cgstPaise: 13579,
    sgstPaise: 13580,
    totalAmountPaise: 350000,
    invoiceType: 'service',
    paymentMethod: 'upi',
    paymentStatus: 'paid',
    paymentReference: null,
    gemsEarned: 35,
    gemsRedeemed: 0,
    gemsRedeemedServiceId: null,
    taxPointAt: ISSUED_AT,
    financialYear: '2627',
    sequenceNumber: 42,
    taxReviewStatus: 'provisional',
    issuerName: 'Royal Glow Salon & Spa — Rayasandra',
    issuerLegalName: 'Royal Glow Salon and Spa LLP',
    issuerGstin: '29ABCDE1234F1Z5',
    issuerAddress: '12 Rayasandra Main Road\nNear Lake\nBengaluru, Karnataka 560099',
    issuerState: 'Karnataka',
    offerId: null,
    offerNameSnapshot: null,
    offerTypeSnapshot: null,
    offerValueSnapshot: null,
    pdfUrl: null,
    notes: null,
    paidAt: ISSUED_AT,
    createdAt: new Date(ISSUED_AT.getTime() + 1000),
    updatedAt: new Date(ISSUED_AT.getTime() + 1000),
    ...overrides,
  }
}

function storedItem(overrides: Partial<StoredItem> = {}): StoredItem {
  return {
    serviceId: 'svc_haircut',
    serviceNameSnapshot: 'Haircut',
    staffNameSnapshot: 'Maya',
    quantity: 1,
    unitPricePaise: 250000,
    totalPricePaise: 250000,
    sacCode: '999721',
    rateBps: 500,
    discountPaise: 0,
    taxableValuePaise: 238095,
    taxPaise: 11905,
    displayOrder: 0,
    ...overrides,
  }
}

function loaded(overrides: Partial<LoadedInvoice> = {}): LoadedInvoice {
  return {
    invoice: storedInvoice(),
    items: [
      storedItem(),
      storedItem({
        serviceId: 'svc_facial',
        serviceNameSnapshot: 'Facial',
        unitPricePaise: 100000,
        totalPricePaise: 100000,
        sacCode: '999722',
        rateBps: 1800,
        taxableValuePaise: 84746,
        taxPaise: 15254,
        displayOrder: 1,
      }),
    ],
    // The branch as it is today: renamed and moved since the invoice was issued.
    branch: {
      name: 'Royal Glow — Rayasandra (renamed)',
      addressLine1: '99 New Address',
      addressLine2: null,
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560100',
      phone: '+91 80 1234 5678',
      email: 'rayasandra@theroyalglow.in',
    },
    customer: { name: 'Asha Rao', email: 'asha@example.com', phone: '+919876543210' },
    bookingNumber: 'BK-RS-2610-H-12345',
    ...overrides,
  }
}

describe('buildPdfPayload — an invoice issued with its snapshot (TX-05)', () => {
  it('renders the issuer, tax point and amounts it stored, not today’s branch', () => {
    const payload = buildPdfPayload(loaded())

    expect(payload.templateVersion).toBe('v2')
    expect(payload.invoiceNumber).toBe('RS/2627/000042')
    expect(payload.issuedAt).toBe(ISSUED_AT.toISOString())
    expect(payload.seller).toEqual({
      name: 'Royal Glow Salon & Spa — Rayasandra',
      legalName: 'Royal Glow Salon and Spa LLP',
      addressLines: ['12 Rayasandra Main Road', 'Near Lake', 'Bengaluru, Karnataka 560099'],
      gstin: '29ABCDE1234F1Z5',
      phone: '+91 80 1234 5678',
      email: 'rayasandra@theroyalglow.in',
      sacCode: undefined,
    })
    // Stored halves, the odd paisa on SGST, never re-split.
    expect(payload.totals).toEqual({
      subtotalPaise: 350000,
      discountPaise: 0,
      taxableValuePaise: 322841,
      cgstPaise: 13579,
      sgstPaise: 13580,
      gstPaise: 27159,
      totalPaise: 350000,
    })
    expect(payload.taxReviewStatus).toBe('provisional')
    expect(payload.invoiceType).toBe('service')
    expect(payload.bookingNumber).toBe('BK-RS-2610-H-12345')
  })

  it('prints each line’s SAC code, rate and tax as stored', () => {
    const payload = buildPdfPayload(loaded())

    expect(payload.items).toEqual([
      {
        name: 'Haircut',
        staffName: 'Maya',
        quantity: 1,
        unitPricePaise: 250000,
        totalPricePaise: 250000,
        gemsCovered: false,
        sacCode: '999721',
        rateBps: 500,
        discountPaise: 0,
        taxableValuePaise: 238095,
        taxPaise: 11905,
      },
      {
        name: 'Facial',
        staffName: 'Maya',
        quantity: 1,
        unitPricePaise: 100000,
        totalPricePaise: 100000,
        gemsCovered: false,
        sacCode: '999722',
        rateBps: 1800,
        discountPaise: 0,
        taxableValuePaise: 84746,
        taxPaise: 15254,
      },
    ])
  })

  it('prints no GSTIN when the branch had none at issue, whatever it has now', () => {
    const payload = buildPdfPayload(
      loaded({ invoice: storedInvoice({ issuerGstin: null, issuerLegalName: null }) }),
    )

    expect(payload.seller.gstin).toBeUndefined()
    expect(payload.seller.legalName).toBeUndefined()
  })

  it('marks the gems-covered service and records the gems', () => {
    const payload = buildPdfPayload(
      loaded({
        invoice: storedInvoice({
          gemsRedeemed: 50,
          gemsRedeemedServiceId: 'svc_facial',
          subtotalPaise: 250000,
          taxableValuePaise: 238095,
          gstAmountPaise: 11905,
          cgstPaise: 5952,
          sgstPaise: 5953,
          totalAmountPaise: 250000,
          gemsEarned: 25,
        }),
        items: [
          storedItem(),
          storedItem({
            serviceId: 'svc_facial',
            serviceNameSnapshot: 'Facial',
            unitPricePaise: 100000,
            totalPricePaise: 0,
            sacCode: '999722',
            rateBps: 1800,
            taxableValuePaise: 0,
            taxPaise: 0,
            displayOrder: 1,
          }),
        ],
      }),
    )

    expect(payload.items.map((item) => item.gemsCovered)).toEqual([false, true])
    expect(payload.gemsRedeemed).toBe(50)
    expect(payload.gemsEarned).toBe(25)
  })

  it('names a membership session so it prints as a ₹0 usage record (TX-07)', () => {
    const payload = buildPdfPayload(
      loaded({ invoice: storedInvoice({ invoiceType: 'membership_session' }) }),
    )

    expect(payload.invoiceType).toBe('membership_session')
  })

  it('satisfies the render contract', () => {
    expect(invoicePdfPayloadSchema.safeParse(buildPdfPayload(loaded())).success).toBe(true)
  })
})

describe('buildPdfPayload — an invoice from before the snapshots', () => {
  const legacy = () =>
    loaded({
      invoice: storedInvoice({
        invoiceNumber: 'INV-1-2627-48213',
        taxPointAt: null,
        financialYear: null,
        sequenceNumber: null,
        taxReviewStatus: null,
        issuerName: null,
        issuerLegalName: null,
        issuerGstin: null,
        issuerAddress: null,
        issuerState: null,
        cgstPaise: null,
        sgstPaise: null,
        subtotalPaise: 118001,
        taxableValuePaise: 100000,
        gstAmountPaise: 18001,
        totalAmountPaise: 118001,
      }),
      items: [
        storedItem({
          unitPricePaise: 118001,
          totalPricePaise: 118001,
          sacCode: null,
          rateBps: null,
          discountPaise: null,
          taxableValuePaise: null,
          taxPaise: null,
        }),
      ],
    })

  it('renders from the branch row with its old number and one SAC code', () => {
    const payload = buildPdfPayload(legacy())

    expect(payload.templateVersion).toBe('v1')
    expect(payload.invoiceNumber).toBe('INV-1-2627-48213')
    // No tax point: the creation instant.
    expect(payload.issuedAt).toBe(new Date(ISSUED_AT.getTime() + 1000).toISOString())
    expect(payload.seller).toMatchObject({
      name: 'Royal Glow — Rayasandra (renamed)',
      addressLines: ['99 New Address', 'Bengaluru, Karnataka 560100'],
      sacCode: '999721',
    })
    expect(payload.seller.gstin).toBeUndefined()
    expect(payload.seller.legalName).toBeUndefined()
    expect(payload.taxReviewStatus).toBeUndefined()
    expect(payload.items[0]).toMatchObject({ sacCode: null, rateBps: null, taxPaise: null })
  })

  it('splits its GST evenly, the odd paisa to SGST', () => {
    const payload = buildPdfPayload(legacy())

    expect(payload.totals).toMatchObject({ gstPaise: 18001, cgstPaise: 9000, sgstPaise: 9001 })
  })

  it('satisfies the render contract', () => {
    expect(invoicePdfPayloadSchema.safeParse(buildPdfPayload(legacy())).success).toBe(true)
  })
})
