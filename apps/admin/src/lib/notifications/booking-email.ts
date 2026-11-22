import { type BranchAddressFields, branchAddressLines, telHref } from '@rgss/business'
import { escapeHtml, httpsUrlOrNull } from './html'

/** Render a customer booking email with the contact details of its branch. */
export function bookingEmailHtml(params: {
  title: string
  body: string
  branch: BranchAddressFields & { name: string; phone: string; googleMapsUrl: string | null }
  bookingUrl: string
}): string {
  const { branch } = params
  const lines = branchAddressLines(branch)
    .map((line) => `<br>${escapeHtml(line)}`)
    .join('')
  const tel = telHref(branch.phone)
  const phone = tel
    ? `<p style="margin:8px 0 0;font-size:14px"><a href="${escapeHtml(tel)}" style="color:#8a6a2f">${escapeHtml(branch.phone)}</a></p>`
    : ''
  const maps = httpsUrlOrNull(branch.googleMapsUrl)
  const directions = maps
    ? `<p style="margin:4px 0 0;font-size:14px"><a href="${escapeHtml(maps)}" style="color:#8a6a2f">Get directions</a></p>`
    : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#faf7f2;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#ffffff;border:1px solid #ece7df;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 12px;color:#1a0f0a;font-size:20px">${escapeHtml(params.title)}</h1>
      <p style="margin:0 0 16px;color:#5b5249;font-size:15px;line-height:1.55">${escapeHtml(params.body)}</p>
      <div style="padding:12px 16px;background:#faf7f2;border-radius:8px">
        <p style="margin:0;color:#1a0f0a;font-size:14px;line-height:1.55"><strong>Royal Glow ${escapeHtml(branch.name)}</strong>${lines}</p>
        ${phone}${directions}
      </div>
      <p style="margin:20px 0 0;font-size:14px"><a href="${escapeHtml(params.bookingUrl)}" style="color:#8a6a2f">View your booking</a></p>
    </div>
  </div>
</body></html>`
}
