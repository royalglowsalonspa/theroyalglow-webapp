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
 * Approach     : Fixtures shaped like getInvoiceForPdf's result, plus an
 *                invoice delivery check with stubbed rendering and email.
 ************************************************************/

import { invoicePdfPayloadSchema } from '@rgss/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoiceMocks = vi.hoisted(() => ({
  getInvoiceForPdf: vi.fn(),
  setInvoicePdfUrl: vi.fn(),
  send: vi.fn(),
  service: {
    INVOICING_SERVICE_URL: 'https://invoice-render.test',
    INVOICE_PDF_HMAC_SECRET: 'test-signing-key',
  },
}))

vi.mock('@rgss/db/queries', () => ({
  getInvoiceForPdf: invoiceMocks.getInvoiceForPdf,
  setInvoicePdfUrl: invoiceMocks.setInvoicePdfUrl,
}))
vi.mock('@/env', () => ({ env: invoiceMocks.service }))
vi.mock('@/lib/jobs/verify', () => ({ verifyQStashSignature: vi.fn().mockResolvedValue(true) }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: invoiceMocks.send }
  },
}))

import { POST as invoicePdfPOST } from '@/app/api/jobs/invoice-pdf/route'
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
    workerOwnsEmail: false,
    paymentTenders: null,
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

describe('invoice PDF delivery', () => {
  beforeEach(() => {
    invoiceMocks.send.mockResolvedValue({ data: { id: 'sent_42' }, error: null })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it.each([true, false])(
    'does not send legacy email for a Worker-owned invoice when rendering succeeds=%s',
    async (renderOk) => {
      const invoice = { ...loaded(), workerOwnsEmail: true }
      invoiceMocks.getInvoiceForPdf.mockResolvedValue(invoice)
      vi.stubEnv('RESEND_API_KEY', 'test-email-key')
      const fetcher = vi.fn().mockResolvedValue(
        renderOk
          ? Response.json({
              invoiceNumber: invoice.invoice.invoiceNumber,
              pdfUrl: 'https://invoice-storage.test/42.pdf',
              pdfBase64: 'cGRm',
            })
          : new Response(null, { status: 503 }),
      )
      vi.stubGlobal('fetch', fetcher)
      const response = await invoicePdfPOST(
        new Request('https://admin.test/api/jobs/invoice-pdf', {
          method: 'POST',
          body: JSON.stringify({ invoiceId: invoice.invoice.id }),
        }),
      )

      expect(await response.json()).toMatchObject({ success: true, sent: false })
      expect(fetcher).toHaveBeenCalledOnce()
      expect(invoiceMocks.send).not.toHaveBeenCalled()
      if (renderOk)
        expect(invoiceMocks.setInvoicePdfUrl).toHaveBeenCalledWith(
          invoice.invoice.id,
          'https://invoice-storage.test/42.pdf',
        )
    },
  )

  it('emails the stored issuer and forwards the rendered PDF to the email provider', async () => {
    const invoice = loaded()
    const pdfUrl = 'https://invoice-storage.test/42.pdf'
    const renderResult = Response.json({
      invoiceNumber: invoice.invoice.invoiceNumber,
      pdfUrl,
      pdfBase64: 'cGRm',
    })
    invoiceMocks.getInvoiceForPdf.mockResolvedValue(invoice)
    vi.stubEnv('RESEND_API_KEY', 'test-email-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(renderResult))

    const response = await invoicePdfPOST(
      new Request('https://admin.test/api/jobs/invoice-pdf', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: invoice.invoice.id }),
      }),
    )

    expect(await response.json()).toMatchObject({ success: true, sent: true, attached: true })
    expect(invoiceMocks.setInvoicePdfUrl).toHaveBeenCalledWith(invoice.invoice.id, pdfUrl)
    expect(invoiceMocks.send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        to: invoice.customer.email,
        html: expect.stringContaining('12 Rayasandra Main Road'),
        attachments: [{ filename: 'RS-2627-000042.pdf', content: 'cGRm' }],
      }),
    )
    expect(invoiceMocks.send.mock.calls[0]?.[0]?.html).not.toContain('99 New Address')
  })

  it('stores a protected link for private storage and emails the inline PDF', async () => {
    const invoice = loaded()
    invoiceMocks.getInvoiceForPdf.mockResolvedValue(invoice)
    vi.stubEnv('RESEND_API_KEY', 'test-email-key')
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        invoiceNumber: invoice.invoice.invoiceNumber,
        pdfObjectKey: 'invoices/2026/RS-2627-000042.pdf',
        pdfBase64: 'cGRm',
      }),
    )
    vi.stubGlobal('fetch', fetcher)

    const response = await invoicePdfPOST(
      new Request('https://admin.test/api/jobs/invoice-pdf', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: invoice.invoice.id }),
      }),
    )

    expect(await response.json()).toMatchObject({ success: true, sent: true, attached: true })
    expect(invoiceMocks.setInvoicePdfUrl).toHaveBeenCalledWith(
      invoice.invoice.id,
      `/api/billing/${invoice.invoice.id}/pdf`,
    )
    expect(invoiceMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: invoice.customer.email,
        attachments: [{ filename: 'RS-2627-000042.pdf', content: 'cGRm' }],
      }),
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not save or send a private PDF key that belongs to a different invoice', async () => {
    const invoice = loaded()
    invoiceMocks.getInvoiceForPdf.mockResolvedValue(invoice)
    vi.stubEnv('RESEND_API_KEY', 'test-email-key')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          invoiceNumber: invoice.invoice.invoiceNumber,
          pdfObjectKey: 'invoices/2026/RS-2627-111111.pdf',
          pdfBase64: 'cGRm',
        }),
      ),
    )
    const response = await invoicePdfPOST(
      new Request('https://admin.test/api/jobs/invoice-pdf', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: invoice.invoice.id }),
      }),
    )
    expect(await response.json()).toMatchObject({
      success: true,
      attached: false,
      reason: 'invalid-result',
    })
    expect(invoiceMocks.setInvoicePdfUrl).not.toHaveBeenCalled()
    expect(invoiceMocks.send.mock.calls[0]?.[0]).not.toHaveProperty('attachments')
  })

  it('emails a legacy invoice with the branch address when rendering fails', async () => {
    const invoice = loaded({
      invoice: storedInvoice({
        taxPointAt: null,
        issuerName: null,
        issuerAddress: null,
        issuerGstin: null,
        taxReviewStatus: null,
      }),
    })
    invoiceMocks.getInvoiceForPdf.mockResolvedValue(invoice)
    vi.stubEnv('RESEND_API_KEY', 'test-email-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    const response = await invoicePdfPOST(
      new Request('https://admin.test/api/jobs/invoice-pdf', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: invoice.invoice.id }),
      }),
    )

    expect(await response.json()).toMatchObject({
      success: true,
      sent: true,
      attached: false,
      reason: 'service-status-503',
    })
    const sent = invoiceMocks.send.mock.calls[0]?.[0]
    expect(sent?.html).toContain('Royal Glow — Rayasandra (renamed)')
    expect(sent?.html).toContain('99 New Address')
    expect(sent).not.toHaveProperty('attachments')
    expect(invoiceMocks.setInvoicePdfUrl).not.toHaveBeenCalled()
  })

  it('reports the invoice as unsent when the email provider rejects it', async () => {
    const invoice = loaded()
    invoiceMocks.getInvoiceForPdf.mockResolvedValue(invoice)
    invoiceMocks.send.mockResolvedValue({ data: null, error: { name: 'validation_error' } })
    vi.stubEnv('RESEND_API_KEY', 'test-email-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    const response = await invoicePdfPOST(
      new Request('https://admin.test/api/jobs/invoice-pdf', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: invoice.invoice.id }),
      }),
    )

    expect(await response.json()).toMatchObject({ success: true, attached: false, sent: false })
  })
})
