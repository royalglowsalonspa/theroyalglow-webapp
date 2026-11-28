import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { signRequest } from '@rgss/business'
import { type InvoicePdfPayload, invoicePdfResultSchema } from '@rgss/types'
import { Children, isValidElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from './app'
import { InvoiceDocument } from './template/InvoiceDocument'

const fixture = vi.hoisted(() => ({
  secret: 'fixture-invoice-hmac-secret',
  bucket: 'fixture-invoices',
  publicUrl: 'https://media.example.invalid',
  privateStorage: false,
  send: vi.fn(),
}))

vi.mock('./env', () => ({
  env: {
    NODE_ENV: 'test',
    INVOICE_PDF_HMAC_SECRET: fixture.secret,
    R2_BUCKET_NAME: fixture.bucket,
    R2_ENDPOINT: 'https://s3.example.invalid',
    R2_ACCESS_KEY_ID: 'fixture',
    R2_SECRET_ACCESS_KEY: 'fixture',
    R2_PUBLIC_BASE_URL: fixture.publicUrl,
    get R2_INVOICE_ACCESS() {
      return fixture.privateStorage ? 'private' : 'public'
    },
  },
}))

vi.mock('@aws-sdk/client-s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    send = fixture.send
  },
}))

const issuedInvoice: InvoicePdfPayload = {
  templateVersion: 'v2',
  invoiceNumber: 'RS/2627/000042',
  issuedAt: '2026-10-24T18:30:00.000Z',
  paymentMethod: 'upi',
  seller: {
    name: 'Snapshot Salon',
    legalName: 'Fixture Salon LLP',
    addressLines: ['12 Snapshot Road', 'Bengaluru, Karnataka 560099'],
    gstin: '29ABCDE1234F1Z5',
  },
  customer: { name: 'Fixture Customer' },
  items: [
    {
      name: 'Fixture Haircut',
      quantity: 1,
      unitPricePaise: 110_000,
      totalPricePaise: 110_000,
      gemsCovered: false,
      sacCode: '999721',
      rateBps: 500,
      discountPaise: 5_000,
      taxableValuePaise: 100_000,
      taxPaise: 5_000,
    },
  ],
  totals: {
    subtotalPaise: 110_000,
    discountPaise: 5_000,
    taxableValuePaise: 100_000,
    cgstPaise: 2_500,
    sgstPaise: 2_500,
    gstPaise: 5_000,
    totalPaise: 105_000,
  },
  gemsEarned: 0,
  gemsRedeemed: 0,
  taxReviewStatus: 'reviewed',
  invoiceType: 'service',
}

async function postInvoice(body: string, signedBody = body, path = '/v1/invoices') {
  const timestamp = Date.now()
  const signature = await signRequest({ secret: fixture.secret, timestamp, body: signedBody })
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rgss-timestamp': String(timestamp),
      'x-rgss-signature': signature,
    },
    body,
  })
}

function documentText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? documentText(child.props.children)
        : String(child),
    )
    .join(' ')
}

describe('issued invoice rendering', () => {
  beforeEach(() => {
    fixture.privateStorage = false
    fixture.send.mockReset()
  })

  it('prints the saved invoice facts in IST with a currency label Helvetica supports', () => {
    const visibleText = documentText(InvoiceDocument(issuedInvoice)).replace(/\s+/g, ' ')

    expect(visibleText).toContain('Fixture Salon LLP 12 Snapshot Road')
    expect(visibleText).toContain('GSTIN: 29ABCDE1234F1Z5')
    expect(visibleText).toContain('Invoice No RS/2627/000042 Date 25/10/2026')
    expect(visibleText).toContain('Fixture Haircut Discount - INR 50.00 999721')
    expect(visibleText).toContain('INR 1,100.00 5%')
    expect(visibleText).toContain('Taxable value INR 1,000.00')
    expect(visibleText).toContain('CGST @ 2.5% INR 25.00 SGST @ 2.5% INR 25.00')
    expect(visibleText).toContain('Total INR 1,050.00')
    expect(visibleText).not.toContain('₹')
  })

  it('prints both tenders in the signed Node renderer layout', () => {
    const visibleText = documentText(
      InvoiceDocument({
        ...issuedInvoice,
        paymentTenders: [
          { method: 'upi', amountPaise: 70_025 },
          { method: 'cash', amountPaise: 34_975 },
        ],
      }),
    )

    expect(visibleText).toContain('Payment UPI INR 700.25 + Cash INR 349.75')
  })

  it('prints a zero-charge membership session with its SAC and rate and no charge due', () => {
    const session: InvoicePdfPayload = {
      ...issuedInvoice,
      invoiceType: 'membership_session',
      items: [
        {
          name: 'Fixture SPA session',
          quantity: 1,
          unitPricePaise: 0,
          totalPricePaise: 0,
          gemsCovered: false,
          sacCode: '999723',
          rateBps: 500,
          taxableValuePaise: 0,
          taxPaise: 0,
        },
      ],
      totals: {
        subtotalPaise: 0,
        discountPaise: 0,
        taxableValuePaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        gstPaise: 0,
        totalPaise: 0,
      },
    }

    const visibleText = documentText(InvoiceDocument(session)).replace(/\s+/g, ' ')
    expect(visibleText).toContain('MEMBERSHIP SESSION')
    expect(visibleText).toContain('Fixture SPA session 999723 — 1 INR 0.00 5% INR 0.00')
    expect(visibleText).toContain('Total INR 0.00')
    expect(visibleText).toContain("membership's purchase invoice, so nothing is due here")
  })

  it('renders a signed invoice and reuses the bytes stored at its branch invoice key', async () => {
    const key = 'invoices/2026/RS-2627-000042.pdf'
    const object = { Bucket: fixture.bucket, Key: key }
    fixture.send.mockRejectedValueOnce({ name: 'NotFound' }).mockResolvedValueOnce({})

    const body = JSON.stringify(issuedInvoice)
    const response = await postInvoice(body)
    expect(response.status).toBe(200)
    const result = invoicePdfResultSchema.parse(await response.json())
    expect(result).toMatchObject({
      invoiceNumber: issuedInvoice.invoiceNumber,
      pdfUrl: `${fixture.publicUrl}/${key}`,
      reused: false,
    })
    const pdf = Buffer.from(result.pdfBase64 ?? '', 'base64')
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(fixture.send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand)
    expect(fixture.send.mock.calls[0]?.[0]?.input).toEqual(object)
    expect(fixture.send.mock.calls[1]?.[0]).toBeInstanceOf(PutObjectCommand)
    expect(fixture.send.mock.calls[1]?.[0]?.input).toEqual({
      ...object,
      ContentType: 'application/pdf',
      IfNoneMatch: '*',
      Body: new Uint8Array(pdf),
    })
    fixture.send.mockResolvedValueOnce({}).mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array(pdf) },
    })

    const replay = await postInvoice(body)
    expect(replay.status).toBe(200)
    expect(invoicePdfResultSchema.parse(await replay.json())).toEqual({ ...result, reused: true })
    expect(fixture.send).toHaveBeenCalledTimes(4)
    expect(fixture.send.mock.calls[2]?.[0]).toBeInstanceOf(HeadObjectCommand)
    expect(fixture.send.mock.calls[3]?.[0]).toBeInstanceOf(GetObjectCommand)
    expect(fixture.send.mock.calls[3]?.[0]?.input).toEqual(object)
  })

  it('keeps the first stored PDF when two signed render requests race', async () => {
    let markBothChecked: (() => void) | undefined
    const bothChecked = new Promise<void>((resolve) => {
      markBothChecked = resolve
    })
    let checks = 0
    let stored: Uint8Array | undefined
    const candidates: Uint8Array[] = []

    fixture.send.mockImplementation(
      async (command: HeadObjectCommand | PutObjectCommand | GetObjectCommand) => {
        if (command instanceof HeadObjectCommand) {
          checks++
          if (checks === 2) markBothChecked?.()
          await bothChecked
          throw { name: 'NotFound' }
        }
        if (command instanceof PutObjectCommand) {
          const { Body, IfNoneMatch } = command.input
          if (!(Body instanceof Uint8Array)) throw new Error('Expected rendered PDF bytes')
          candidates.push(Body)
          if (IfNoneMatch === '*' && stored) {
            throw new S3ServiceException({
              name: 'PreconditionFailed',
              $fault: 'client',
              $metadata: { httpStatusCode: 412 },
            })
          }
          stored = Body
          return {}
        }
        return { Body: { transformToByteArray: async () => stored } }
      },
    )

    const responses = await Promise.all([
      postInvoice(JSON.stringify(issuedInvoice)),
      postInvoice(JSON.stringify({ ...issuedInvoice, notes: 'Added after issue' })),
    ])
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    const results = await Promise.all(
      responses.map(async (response) => invoicePdfResultSchema.parse(await response.json())),
    )

    expect(candidates).toHaveLength(2)
    expect(candidates[0]).not.toEqual(candidates[1])
    expect(stored).toBe(candidates[0])
    expect(results.map((result) => result.reused).sort()).toEqual([false, true])
    const storedBase64 = Buffer.from(candidates[0] ?? []).toString('base64')
    for (const result of results) {
      expect(result.pdfBase64).toBe(storedBase64)
    }
  })

  it('rejects a changed signed body before reading storage', async () => {
    const response = await postInvoice('{', '{}')

    expect(response.status).toBe(401)
    expect(fixture.send).not.toHaveBeenCalled()
  })

  it('renders private PDFs without a public URL and serves them only after signing', async () => {
    fixture.privateStorage = true
    fixture.send.mockRejectedValueOnce({ name: 'NotFound' }).mockResolvedValueOnce({})
    const render = await postInvoice(JSON.stringify(issuedInvoice))
    expect(render.status).toBe(200)
    const result = invoicePdfResultSchema.parse(await render.json())
    const key = 'invoices/2026/RS-2627-000042.pdf'
    expect(result).toMatchObject({ pdfObjectKey: key, invoiceNumber: issuedInvoice.invoiceNumber })
    expect(result).not.toHaveProperty('pdfUrl')

    const path = '/v1/invoices/download'
    const body = JSON.stringify({
      invoiceNumber: issuedInvoice.invoiceNumber,
      issuedAt: issuedInvoice.issuedAt,
    })
    const unsigned = await app.request(path, { method: 'POST', body })
    expect(unsigned.status).toBe(401)
    expect(fixture.send).toHaveBeenCalledTimes(2)

    const bytes = Buffer.from(result.pdfBase64 ?? '', 'base64')
    fixture.send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytes },
    })
    const download = await postInvoice(body, body, path)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('application/pdf')
    expect(download.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes)
    expect(fixture.send.mock.calls[2]?.[0]).toBeInstanceOf(GetObjectCommand)
    expect(fixture.send.mock.calls[2]?.[0]?.input).toEqual({ Bucket: fixture.bucket, Key: key })

    fixture.send.mockRejectedValueOnce({ name: 'NoSuchKey' })
    expect((await postInvoice(body, body, path)).status).toBe(404)
  })

  it('rejects invalid signed JSON before reading storage', async () => {
    const response = await postInvoice('{')

    expect(response.status).toBe(400)
    expect(fixture.send).not.toHaveBeenCalled()
  })

  it('returns a generic error on a storage failure without attempting an upload', async () => {
    fixture.send.mockRejectedValueOnce({ name: 'AccessDenied' })

    const response = await postInvoice(JSON.stringify(issuedInvoice))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    })
    expect(fixture.send).toHaveBeenCalledTimes(1)
    expect(fixture.send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand)
  })
})
