import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import type { InvoiceEnv } from './env'

let signingKeys: { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined

export const gmail = z.string().trim().toLowerCase().max(254).pipe(z.email().endsWith('@gmail.com'))

export function developerEmail(env: InvoiceEnv) {
  const parsed = gmail.safeParse(env.ACCESS_DEVELOPER_EMAIL)
  return parsed.success ? parsed.data : null
}

export async function accessEmail(request: Request, env: InvoiceEnv): Promise<string | null> {
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token || token.length > 8192 || !env.ACCESS_AUDIENCE || !env.ACCESS_TEAM) return null
  if (!/^[a-z0-9-]{1,63}$/.test(env.ACCESS_TEAM)) return null
  const issuer = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`
  if (signingKeys?.issuer !== issuer) {
    signingKeys = { issuer, keys: createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer)) }
  }
  try {
    const { payload } = await jwtVerify(token, signingKeys.keys, {
      issuer,
      audience: env.ACCESS_AUDIENCE,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat', 'email'],
    })
    const email = gmail.safeParse(payload.email)
    return email.success ? email.data : null
  } catch {
    return null
  }
}
