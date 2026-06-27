// ═══════════════════════════════════════════════════════════════════
// Firebase Messaging — Background Push Notification
// ─────────────────────────────────────────────────────────────────
// কেন: Browser app বন্ধ থাকলেও FCM-এর push পৌঁছালে এই SW এটা
// ধরে notification দেখায়। App খোলা থাকলে push.js-এর onMessage()
// handle করে।
// ═══════════════════════════════════════════════════════════════════
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// SW-এ Firebase আলাদাভাবে init করতে হয় (config.js এখানে চলে না)
if (!firebase.apps.length) {
  firebase.initializeApp({
    apiKey: 'AIzaSyDBR9Z3gnk0oHBRyqC5eOcGhu8ONa8Up-U',
    authDomain: 'midlandquarter-19623.firebaseapp.com',
    databaseURL: 'https://midlandquarter-19623-default-rtdb.firebaseio.com',
    projectId: 'midlandquarter-19623',
    storageBucket: 'midlandquarter-19623.firebasestorage.app',
    messagingSenderId: '370339958840',
    appId: '1:370339958840:web:dc81e43f4f584d1b1956cd'
  });
}

const messaging = firebase.messaging();

// ✅ Background message handler:
// FCM payload-এ 'notification' field থাকলে browser নিজেই notification দেখায়
// এই callback শুধু 'data'-only payload-এর জন্য call হয়
messaging.onBackgroundMessage(payload => {
  console.log('[sw.js] Received background message:', payload);
  
  const title = payload.notification?.title || payload.data?.title || 'মেস নোটিফিকেশন';
  const body  = payload.notification?.body  || payload.data?.body  || '';
  const icon  = '/mess/icon-192.png';
  const link  = payload.fcm_options?.link || payload.data?.url || 'https://midlandquarter.github.io/mess/';

  const notificationOptions = {
    body: body,
    icon: icon,
    badge: icon,
    vibrate: [200, 100, 200],
    data: { url: link },
    requireInteraction: false,
    tag: 'meal-reminder' // একই notification বার বার আসবে না
  };

  return self.registration.showNotification(title, notificationOptions);
});

// ✅ Notification-এ tap করলে app খুলবে
self.addEventListener('notificationclick', event => {
  console.log('[sw.js] Notification clicked:', event.notification.title);
  event.notification.close();
  
  const target = event.notification.data?.url || 'https://midlandquarter.github.io/mess/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // App ইতিমধ্যে খোলা থাকলে focus করো
      const existing = list.find(c => c.url.includes('/mess/'));
      if (existing) return existing.focus();
      // না থাকলে নতুন tab খোলো
      return clients.openWindow(target);
    })
  );
});

// ─────────────────────────────────────────────────────────────────
const CACHE_VERSION = 'mq-v12'; // v12: Firebase Messaging added
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
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js',
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
