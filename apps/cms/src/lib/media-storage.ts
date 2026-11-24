import { sanitizeFilename } from 'payload/shared'

/** Build the direct URL for the same key used by Payload's S3 adapter. */
export function publicMediaFileUrl(origin: string, filename: string, prefix?: string): string {
  // The plugin supplies the normalized document prefix together with any
  // generated object-key segment. Empty prefixes use the collection prefix.
  const path = [...(prefix || 'cms').split('/'), sanitizeFilename(filename)]
  return `${origin}/${path.map(encodeURIComponent).join('/')}`
}

export function readPublicMediaOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  const url = URL.parse(value.trim())
  if (url?.protocol !== 'https:' || url.href !== `${url.origin}/`) {
    throw new Error('R2_MEDIA_PUBLIC_URL must be an HTTPS origin')
  }
  return url.origin
}
