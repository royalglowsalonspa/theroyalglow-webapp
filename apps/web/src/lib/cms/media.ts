import { cmsBaseUrl } from './config'
import type { ResolvedMedia } from './types'

// Resolves a Payload media field into a typed image reference. A Payload
// upload relation can arrive in several shapes depending on `depth`:
//   - a populated upload doc: `{ url, alt, width, height, ... }`
//   - a bare relation id (string/number) when `depth=0` / unpopulated
//   - null/undefined when the field is empty
// Anything that does not yield a usable `url` resolves to `null` so the UI can
// show a placeholder or omit the image — never a broken `<img>`.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Strip a single trailing slash so we never double up when joining. */
function stripTrailingSlash(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base
}

/** Prefix a relative URL with the R2 public base (fallback: CMS base). */
function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url
  }

  const r2Base = process.env.CLOUDFLARE_R2_PUBLIC_URL
  const base =
    typeof r2Base === 'string' && r2Base.trim() !== ''
      ? r2Base.trim()
      : cmsBaseUrl()

  if (base === null) {
    // No base to resolve against — return the relative URL as-is rather than
    // fabricating something wrong.
    return url
  }

  const normalisedBase = stripTrailingSlash(base)
  const normalisedPath = url.startsWith('/') ? url : `/${url}`
  return `${normalisedBase}${normalisedPath}`
}

/** Returns null when the media field is empty/unpopulated or has no URL. */
export function resolveMedia(media: unknown): ResolvedMedia | null {
  // Bare id or null → unpopulated, nothing to resolve.
  if (!isRecord(media)) {
    return null
  }

  const url = asString(media.url)
  if (url === null) {
    return null
  }

  return {
    url: toAbsoluteUrl(url),
    alt: asString(media.alt) ?? '',
    width: asNumber(media.width),
    height: asNumber(media.height),
  }
}
