// FaîtiereHub Scanner — Service Worker
// Stratégie : cache-first pour assets statiques, network-first pour les pages

const CACHE_NAME = 'faitierehub-scanner-v1'
const OFFLINE_URL = '/scan/offline'

const PRECACHE_ASSETS = [
  '/scan',
  '/scan/offline',
  '/manifest.webmanifest',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
]

// ── Install : précache les assets essentiels ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  )
  self.skipWaiting()
})

// ── Activate : nettoie les anciens caches ─────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch : network-first, fallback cache puis offline ────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Ne pas intercepter les requêtes non-GET ni les API
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) return

  // Pages de navigation → network-first avec fallback offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const clone = resp.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          return resp
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    )
    return
  }

  // Assets statiques → cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
        }
        return resp
      })
    })
  )
})
