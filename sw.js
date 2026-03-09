// ══ YSSN Games Service Worker — Offline First ══
const CACHE = 'yssn-v4';
const OFFLINE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
];

// External resources to cache when first fetched online
const RUNTIME_CACHE = 'yssn-runtime-v4';

// ── Install: cache core files ──────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return Promise.allSettled(
        OFFLINE_URLS.map(url => 
          cache.add(url).catch(err => console.warn('Cache miss:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ─────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: smart caching strategy ─────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip non-GET
  if(e.request.method !== 'GET') return;

  // Skip Firebase & API calls (always need network)
  if(
    url.includes('firebaseio.com') ||
    url.includes('firebaseapp.com') ||
    url.includes('googleapis.com') ||
    url.includes('firebase') ||
    url.includes('identitytoolkit')
  ) return;

  // Google Fonts & gstatic — cache on first load, use cache offline
  if(url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('gstatic.com/firebasejs')) {
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if(cached) return cached;
          return fetch(e.request).then(response => {
            if(response && response.status === 200) {
              cache.put(e.request, response.clone());
            }
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // App shell — cache first, fallback to network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) {
        // Serve from cache, update in background
        const networkFetch = fetch(e.request).then(response => {
          if(response && response.status === 200 && response.type === 'basic') {
            caches.open(CACHE).then(cache => cache.put(e.request, response.clone()));
          }
          return response;
        }).catch(() => {});
        return cached;
      }

      // Not in cache — try network, then save to cache
      return fetch(e.request).then(response => {
        if(!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback: return main HTML for navigation requests
        if(e.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Message: force update ──────────────────────────────────
self.addEventListener('message', e => {
  if(e.data === 'skipWaiting') self.skipWaiting();
});