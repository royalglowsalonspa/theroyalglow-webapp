import { verifyRequest } from '@rgss/business'

export async function readBodyBytes(
  request: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body || Number(request.headers.get('content-length')) > limit) return null
  const reader = request.body.getReader()
  const buffer = new Uint8Array(limit)
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return buffer.subarray(0, length)
      if (length + value.length > limit) {
        await reader.cancel()
        return null
      }
      buffer.set(value, length)
      length += value.length
    }
  } finally {
    reader.releaseLock()
  }
}

export async function signedBody(
  request: Request,
  secret: string | undefined,
  limit: number,
): Promise<string | Response> {
  if (!secret || secret.length < 32) return new Response(null, { status: 503 })
  const signature = request.headers.get('x-rgss-signature') ?? ''
  const timestamp = request.headers.get('x-rgss-timestamp') ?? ''
  if (!/^[a-f0-9]{64}$/.test(signature) || !/^\d{13}$/.test(timestamp)) {
    return new Response(null, { status: 401 })
  }

  let body: string
  try {
    const bytes = await readBodyBytes(request, limit)
    if (bytes === null) return new Response(null, { status: 413 })
    body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return new Response(null, { status: 400 })
  }
  if (!(await verifyRequest({ secret, body, timestamp: Number(timestamp), signature }))) {
    return new Response(null, { status: 401 })
  }
  return body
}
