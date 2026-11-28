import { DurableObject } from 'cloudflare:workers'
import devanagari from '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2'
import kannada from '@fontsource/noto-sans-kannada/files/noto-sans-kannada-kannada-400-normal.woff2'
import telugu from '@fontsource/noto-sans-telugu/files/noto-sans-telugu-telugu-400-normal.woff2'
import { render } from 'takumi-pdf'
import logo from '../../../apps/web/public/icons/icon-192.png'

interface Env {
  RENDERER: DurableObjectNamespace<InvoiceRenderer>
  INVOICE_PROBE_TOKEN?: string
}

const sampleLineCounts = { normal: 3, large: 60 } as const
type Sample = keyof typeof sampleLineCounts

const services = ['Hair cut and finish', 'Scalp treatment', 'Manicure and nail care']
const rupees = new Intl.NumberFormat('en-IN', { currency: 'INR', style: 'currency' })
const fonts = [
  { name: 'Noto Kannada', data: kannada },
  { name: 'Noto Telugu', data: telugu },
  { name: 'Noto Devanagari', data: devanagari },
]
const encoder = new TextEncoder()
const logoSource = 'rgss-logo.png'

function fixtureHtml(sample: Sample) {
  const lineCount = sampleLineCounts[sample]
  const rows = Array.from({ length: lineCount }, (_, index) => {
    const service = services[index % services.length]
    const suffix = sample === 'large' ? ' · Consultation and aftercare included' : ''
    return `<div class="row"><span class="description">${index + 1}. ${service}${suffix}</span><span>${rupees.format(500)}</span></div>`
  }).join('')

  return `
    <style>
      * { font-family: Geist, 'Noto Kannada', 'Noto Telugu', 'Noto Devanagari'; }
      .header { display: flex; align-items: center; gap: 12px; }
      h1 { color: #553d2a; font-size: 26px; margin-bottom: 4px; }
      p { font-size: 13px; margin-top: 5px; }
      .row { display: flex; justify-content: space-between; padding: 8px;
             border-bottom: 1px solid #ded6cf; font-size: 13px; break-inside: avoid; }
      .description { width: 74%; }
      .total { background: #f6eee6; font-weight: 700; }
    </style>
    <div class="header"><img src="${logoSource}" alt="Royal Glow" width="52" height="52"><h1>Royal Glow · Synthetic Invoice</h1></div>
    <p>Invoice RGSS-PROBE-${sample.toUpperCase()} · Customer Zoë Martín</p>
    <p>Test branch · Bengaluru, Karnataka · Synthetic data only</p>
    <p>Sample names: ಅಮೃತ · లత · आरती</p>
    <div class="row total"><span>Service</span><span>Amount</span></div>
    ${rows}
    <div class="row total"><span>Fixture total</span><span>${rupees.format(lineCount * 500)}</span></div>
  `
}

export class InvoiceRenderer extends DurableObject<Env> {
  async pdf(sample: Sample): Promise<Response> {
    const bytes = await render(fixtureHtml(sample), {
      size: 'a4',
      fonts,
      images: [{ src: logoSource, data: new Uint8Array(logo) }],
    })
    return new Response(bytes, {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/pdf',
        'x-content-type-options': 'nosniff',
      },
    })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const token = env.INVOICE_PROBE_TOKEN
    if (!token || token.length < 32) {
      return new Response('Probe unavailable', { status: 503 })
    }
    const expected = encoder.encode(`Bearer ${token}`)
    const authorization = encoder.encode(request.headers.get('authorization') ?? '')
    if (
      authorization.byteLength !== expected.byteLength ||
      !crypto.subtle.timingSafeEqual(authorization, expected)
    ) {
      return new Response('Unauthorized', { status: 401 })
    }
    const path = new URL(request.url).pathname
    if (path !== '/fixtures/normal' && path !== '/fixtures/large') {
      return new Response('Not found', { status: 404 })
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } })
    }

    const sample = path === '/fixtures/normal' ? 'normal' : 'large'
    const renderer = env.RENDERER.getByName(sample)
    return renderer.pdf(sample)
  },
} satisfies ExportedHandler<Env>
