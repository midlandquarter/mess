const CACHE_VERSION = 'mq-v11';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
];

const EXTERNAL_ASSETS = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js',
];

// ── Install: সব asset pre-cache ─────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      const shellP = SHELL_ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('[SW] Shell miss:', url, err))
      );
      const extP = EXTERNAL_ASSETS.map(url =>
        fetch(url, { mode: 'no-cors' })
          .then(res => cache.put(url, res))
          .catch(err => console.warn('[SW] Ext miss:', url, err))
      );
      return Promise.allSettled([...shellP, ...extP]);
    })
  );
  self.skipWaiting();
});

// ── Activate: পুরনো cache মুছো ──────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' })
        .then(cs => cs.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
      )
  );
});

// ── Fetch: 3-tier strategy ───────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // 1️⃣ Firebase RTDB + Auth → NETWORK ONLY (real-time data)
  const networkOnly = ['firebaseio.com', 'firebaseapp.com', 'googleapis.com'];
  if (networkOnly.some(d => url.hostname.includes(d))) return;

  // 2️⃣ Firebase SDK + CDN + Fonts → CACHE FIRST (instant)
  const cacheFirst = ['gstatic.com', 'cdnjs.cloudflare.com', 'fonts.gstatic.com'];
  if (cacheFirst.some(d => url.hostname.includes(d))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request, { mode: 'no-cors' }).then(res => {
          caches.open(CACHE_VERSION).then(c => c.put(event.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // 3️⃣ App shell (index.html, icons) → CACHE FIRST + background update
  // Cache থেকে তাৎক্ষণিক দেখাও, background-এ নতুন version fetch করো
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          caches.open(CACHE_VERSION).then(c => c.put(event.request, res.clone()));
        }
        return res;
      }).catch(() => cached);

      // Cache আছে → সাথে সাথে দেখাও (background-এ update হবে)
      // Cache নেই → network-এর জন্য অপেক্ষা করো
      return cached || networkFetch;
    })
  );
});
