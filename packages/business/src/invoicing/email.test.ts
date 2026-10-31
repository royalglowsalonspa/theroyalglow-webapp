/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/email.test
 * Scope        : Unit tests for buildInvoiceEmailHtml
 *
 * Description  : Verifies the pure invoice-email builder — subject, money
 *                formatting, conditional discount/gems rows, and HTML-escaping
 *                of interpolated names (injection safety).
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { buildInvoiceEmailHtml, sharedRatePercentLabel } from './email'

const base = {
  customerName: 'Asha Rao',
  invoiceNumber: 'INV-1-2627-00042',
  bookingNumber: 'BK-RS-2606-H-12345',
  items: [{ name: 'Classic Haircut', staff: 'Maya', pricePaise: 49900 }],
  subtotalPaise: 49900,
  discountPaise: 0,
  gstPaise: 7610,
  totalPaise: 49900,
  gemsEarned: 4,
  paymentMethod: 'upi',
  issuedAt: new Date('2026-06-21T10:00:00+05:30'),
}

describe('buildInvoiceEmailHtml', () => {
  it('returns a subject containing the invoice number', () => {
    const { subject } = buildInvoiceEmailHtml(base)
    expect(subject).toContain('INV-1-2627-00042')
  })

  it('renders the customer, item, INR total, and gems line', () => {
    const { html } = buildInvoiceEmailHtml(base)
    expect(html).toContain('Asha Rao')
    expect(html).toContain('Classic Haircut')
    expect(html).toContain('₹499.00')
    expect(html).toContain('4 gems')
  })

  it('omits the discount row when there is no discount', () => {
    const { html } = buildInvoiceEmailHtml(base)
    expect(html).not.toContain('Discount')
  })

  it('shows the discount row when a discount applies', () => {
    const { html } = buildInvoiceEmailHtml({ ...base, discountPaise: 5000 })
    expect(html).toContain('Discount')
    expect(html).toContain('₹50.00')
  })

  it('omits the gems line when none were earned', () => {
    const { html } = buildInvoiceEmailHtml({ ...base, gemsEarned: 0 })
    expect(html).not.toContain('gems')
  })

  it('escapes HTML in interpolated names (injection safety)', () => {
    const { html } = buildInvoiceEmailHtml({
      ...base,
      customerName: '<script>alert(1)</script>',
      issuerName: '<b>Branch</b>',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<b>Branch</b>')
    expect(html).toContain('&lt;b&gt;Branch&lt;/b&gt;')
  })
})

describe('buildInvoiceEmailHtml — the tax as issued (multi-branch R6.1, R6.4)', () => {
  // ₹499 at 5%: taxable round(49,900 × 10,000 / 10,500) = 47,524; GST 2,376.
  const issued = {
    ...base,
    invoiceNumber: 'RS/2627/000042',
    taxableValuePaise: 47524,
    gstPaise: 2376,
    cgstPaise: 1188,
    sgstPaise: 1188,
    ratePercentLabel: '5%',
    issuerName: 'Royal Glow Salon & Spa — Rayasandra',
    issuerGstin: '29ABCDE1234F1Z5',
  }

  it('prints the stored taxable value and CGST/SGST at half the lines’ rate', () => {
    const { html } = buildInvoiceEmailHtml(issued)
    expect(html).toContain('Taxable value')
    expect(html).toContain('₹475.24')
    expect(html).toContain('CGST @ 2.5%')
    expect(html).toContain('SGST @ 2.5%')
    expect(html).toContain('₹11.88')
    expect(html).not.toContain('GST @ 5%, inclusive')
  })

  it('prints the halves without a rate when the lines used different rates', () => {
    const { html } = buildInvoiceEmailHtml({ ...issued, ratePercentLabel: null })
    expect(html).toContain('>CGST<')
    expect(html).toContain('>SGST<')
    expect(html).not.toContain('@')
  })

  it('prints one GST line for an older invoice without stored halves', () => {
    const { html } = buildInvoiceEmailHtml(base)
    expect(html).toContain('GST, inclusive')
    expect(html).toContain('₹76.10')
    // No built-in rate: an older invoice names none it did not store.
    expect(html).not.toContain('18%')
    // The taxable value is derived as total − GST.
    expect(html).toContain('₹422.90')
  })

  it('names the issuer and its GSTIN as issued', () => {
    const { html } = buildInvoiceEmailHtml(issued)
    expect(html).toContain(
      'Issued by Royal Glow Salon &amp; Spa — Rayasandra · GSTIN 29ABCDE1234F1Z5. Prices include GST.',
    )
  })

  it('says an invoice issued with provisional rates is a test invoice (TX-10)', () => {
    const { html } = buildInvoiceEmailHtml({ ...issued, provisional: true })
    expect(html).toContain('This is a test invoice: its tax rates are provisional')
    expect(html).not.toContain('Issued by')
  })
})

describe('sharedRatePercentLabel', () => {
  it.each([
    [[500, 500], '5%'],
    [[1250], '12.5%'],
    [[0, 0], '0%'],
    [[500, 1800], null],
    [[500, null], null],
    [[], null],
  ])('%j → %s', (rates, label) => {
    expect(sharedRatePercentLabel(rates)).toBe(label)
  })
})
