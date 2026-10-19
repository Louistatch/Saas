const CACHE_NAME = 'coopscan-v2'
const PRECACHE = [
  '/scan',
  '/scan/offline',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('coopscan-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Cloudflare and Supabase must use the browser's normal network path. Never intercept or
  // replay authentication, third-party scripts, or requests that modify data.
  if (url.origin !== self.location.origin || request.method !== 'GET') return
  if (url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') return

  // API and verify routes: network first, no offline fallback
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/verify/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    )
    return
  }

  // Navigation requests: network first, fallback to offline page
  if (request.mode === 'navigate') {
    // Only the scanner has an offline shell. Game/auth/dashboard HTML and RSC responses must
    // not be saved in the asset cache or replaced by a scanner page when the network fails.
    if (url.pathname !== '/scan' && url.pathname !== '/scan/offline') return
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return res
        })
        .catch(() => caches.match('/scan/offline').then((r) => r || fetch('/scan/offline')))
    )
    return
  }

  // Only public, local assets are cacheable. Other GETs (including private RSC prefetches)
  // remain network requests, even if an older worker once cached a response for the same URL.
  if (!/^\/(?:_next\/static\/|icons\/|images\/|fonts\/|haroolife\/(?:city|vendor|models)\/)/.test(url.pathname) &&
    !PRECACHE.includes(url.pathname)) return

  // Public static assets: cache first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return res
      })
    })
  )
})

// Alertes de la console de validation (Web Push). Le lien est toujours interne au site.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const link = typeof data.link === 'string' && data.link.startsWith('/') ? data.link : '/operator/professionals'
  event.waitUntil(
    self.registration.showNotification(data.title || 'FaîtiereHub', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { link },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.link || '/operator/professionals', self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).pathname === target.pathname)
      if (open) return open.focus()
      return self.clients.openWindow(target.href)
    })
  )
})
