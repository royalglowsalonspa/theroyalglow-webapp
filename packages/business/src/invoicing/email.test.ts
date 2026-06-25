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
import { buildInvoiceEmailHtml } from './email'

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
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
