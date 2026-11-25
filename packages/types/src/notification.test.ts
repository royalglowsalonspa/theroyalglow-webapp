import { describe, expect, it } from 'vitest'
import { normalizeWebPushEndpoint, pushSubscribeSchema } from './notification'

describe('supported Web Push endpoints', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/subscription',
    'https://updates.push.services.mozilla.com/wpush/v2/subscription',
    'https://push.services.mozilla.com/wpush/v2/subscription',
    'https://web.push.apple.com/subscription',
    'https://wns-example.notify.windows.com/w/?token=subscription',
  ])('accepts %s', (endpoint) => {
    expect(normalizeWebPushEndpoint(endpoint)).toBe(endpoint)
  })

  it.each([
    'https://example.invalid/push/subscription',
    'http://fcm.googleapis.com/fcm/send/subscription',
    'https://fcm.googleapis.com:444/fcm/send/subscription',
    'https://fcm.googleapis.com/fcm/send/subscription#fragment',
    'https://user@fcm.googleapis.com/fcm/send/subscription',
  ])('refuses unsupported destination %s', (endpoint) => {
    expect(normalizeWebPushEndpoint(endpoint)).toBeNull()
    expect(
      pushSubscribeSchema.safeParse({ endpoint, keys: { p256dh: 'test', auth: 'test' } }).success,
    ).toBe(false)
  })

  it('stores only the canonical endpoint', () => {
    const input = {
      endpoint: 'https://FCM.GOOGLEAPIS.COM:443/fcm/send/subscription',
      keys: { p256dh: 'test', auth: 'test' },
    }
    expect(pushSubscribeSchema.parse(input).endpoint).toBe(
      'https://fcm.googleapis.com/fcm/send/subscription',
    )
  })
})
