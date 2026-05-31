import { expect, test } from '@playwright/test'

// SEO route smoke tests. These confirm the machine-readable surfaces are
// reachable and serve the expected content type. They use APIRequestContext
// (no browser rendering needed) so they are fast and robust.

test('GET /sitemap.xml returns 200 XML', async ({ request }) => {
  const res = await request.get('/sitemap.xml')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('xml')
})

test('GET /robots.txt returns 200 and lists the sitemap', async ({
  request,
}) => {
  const res = await request.get('/robots.txt')
  expect(res.status()).toBe(200)
  const body = await res.text()
  expect(body).toContain('Sitemap:')
})

test('GET /llms.txt returns 200 plain text', async ({ request }) => {
  const res = await request.get('/llms.txt')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/plain')
})
