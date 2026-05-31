// Royal Glow Salon & Spa — service worker (dependency-free, no Workbox).
// Strategy: network-first for navigations with an offline fallback page.
// Never caches or serves API, admin, or auth responses.

const CACHE = 'rgss-v1'
const OFFLINE_URL = '/offline'

// Paths that must never be cached or served from cache.
const BYPASS_PREFIXES = ['/api', '/admin', '/sign-in']

function isBypassed(pathname) {
  return BYPASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only handle GET requests; let the browser handle everything else.
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  // Never intercept API, admin, or auth routes.
  if (isBypassed(url.pathname)) {
    return
  }

  // Only handle navigation requests: network-first, offline fallback on failure.
  if (request.mode === 'navigation') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    )
    return
  }

  // All other requests: let the browser handle them (no caching).
})
