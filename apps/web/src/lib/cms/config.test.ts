// @vitest-environment node
/************************************************************
 * Module Name  : config.test
 * Scope        : CMS Integration — Tests
 *
 * Description  : Pins the cmsFetch timeout: every blocking CMS request carries
 *                an abort signal, and a CMS that never answers degrades to
 *                null (the caller's fallback content) instead of hanging.
 *
 * Notes        : Node environment so fetch and AbortSignal are both Node's own
 *                (jsdom's AbortSignal is rejected by Node's fetch). The real
 *                AbortSignal.timeout timer cannot be faked, so the "never
 *                answers" case swaps in a controller the test aborts itself.
 ************************************************************/
import { HttpResponse, http } from 'msw/http'
import { delay } from 'msw/utils/delay'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw-server'
import { CMS_FETCH_TIMEOUT_MS, cmsFetch } from './config'

const CMS_URL = 'https://cms.test'

describe('cmsFetch timeout', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CMS_URL', CMS_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('bounds every request with a timeout signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    server.use(http.get(`${CMS_URL}/api/banners`, () => HttpResponse.json({ docs: [] })))

    await expect(cmsFetch('/api/banners')).resolves.toEqual({ docs: [] })
    expect(timeout).toHaveBeenCalledWith(CMS_FETCH_TIMEOUT_MS)
  })

  it('returns null instead of hanging when the CMS never answers', async () => {
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    server.use(
      http.get(`${CMS_URL}/api/banners`, async () => {
        await delay('infinite')
      }),
    )

    const pending = cmsFetch('/api/banners')
    controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))

    await expect(pending).resolves.toBeNull()
  })
})
