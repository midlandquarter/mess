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
const CACHE_VERSION = 'mq-v14'; // v14: local app code (html/js/css) এখন network-first+timeout — শুধু app-logic ফাইল
// বদলালে (sw.js নিজে অক্ষত থাকলেও) পরের লোডেই latest কোড আসবে, SW lifecycle/version-bump-এর
// উপর নির্ভর করতে হবে না। দুর্বল নেটে/অফলাইনে timeout-এর পর আগের মতোই cache থেকে ফলব্যাক করে।
// এই ৮টাই সত্যিকারের "static" — index.html-এর script/link ট্যাগ থেকে discover করা যায় না,
// তাই এগুলোই একমাত্র hardcoded থাকবে। বাকি সব JS/CSS নিচে _discoverLocalAssets()-এ
// index.html পড়ে নিজে থেকেই বের করা হয় — নতুন js ফাইল ভবিষ্যতে যোগ হলে (যেটা index.html-এ
// <script src="..."> লিখতেই হবে, ব্যবহার করতে হলে) sw.js এখানে ছোঁয়া লাগবে না।
const BASE_ASSETS = [
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

// index.html নিজে fetch করে তার <script src="...js"> আর <link href="...css">
// থেকে local (non-CDN) ফাইলগুলোর path বের করে — এটাই SHELL_ASSETS-এর dynamic অংশ।
// fetch fail করলে খালি array ফেরত দেয় (fail-safe — তখন শুধু BASE_ASSETS cache হবে,
// বাকি JS/CSS আগের মতোই lazy/tier-3 caching-এ চলবে, এর চেয়ে খারাপ কিছু হবে না)।
async function _discoverLocalAssets(){
  try{
    const res = await fetch('./index.html');
    const html = await res.text();
    const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map(m => m[1]);
    const hrefs = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/g)].map(m => m[1]);
    return [...new Set([...srcs, ...hrefs])]
      .filter(u => !/^https?:\/\//.test(u))
      .map(u => './' + u.replace(/^\.?\//, ''));
  }catch(err){
    console.warn('[SW] Asset auto-discovery failed, falling back to BASE_ASSETS only:', err);
    return [];
  }
}

// ── Install: সব asset pre-cache ─────────────────────
self.addEventListener('install', event => {
  // ✅ FIX: প্রথমবার install (কোনো আগের active SW নেই) হলে page নিজেই তখন
  // এই একই ফাইলগুলো normal ভাবে লোড করছে — SW-ও যদি সেই মুহূর্তে একই ফাইল
  // আবার fetch করতে যায়, দুইটা network-এ একসাথে লড়াই করবে, দুর্বল নেটে
  // প্রথম-visit ধীর হয়ে যাবে। তাই প্রথমবার শুধু হালকা BASE_ASSETS নেওয়া হয়
  // (বাকি ফাইল এমনিতেই lazy/tier-3 caching-এ চলে আসবে, ডাবল-ফেচ ছাড়াই)।
  // আসল আপডেটের সময় (self.registration.active সত্য — মানে পুরনো SW তখনও
  // চলছে, page cache থেকেই ফাস্ট) পুরো ভারী pre-cache নিরাপদে background-এ হয়।
  const isUpdate = !!self.registration.active;
  console.log('[SW] Installing:', CACHE_VERSION, isUpdate ? '(আপডেট)' : '(প্রথম ইনস্টল)');
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      const discovered = isUpdate ? await _discoverLocalAssets() : [];
      const shellAssets = [...new Set([...BASE_ASSETS, ...discovered])];
      const shellP = shellAssets.map(url =>
        cache.add(url).catch(err => console.warn('[SW] Shell miss:', url, err))
      );
      const extP = isUpdate ? EXTERNAL_ASSETS.map(url =>
        fetch(url, { mode: 'no-cors' })
          .then(res => cache.put(url, res))
          .catch(err => console.warn('[SW] Ext miss:', url, err))
      ) : [];
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

// ── Fetch: 4-tier strategy ───────────────────────────
// ✅ FIX (2026-07-30): আগে "App shell" tier (index.html সহ সব local JS/CSS)
// cache-first ছিল — deploy হওয়ার পরেও প্রথম লোডে পুরোনো cached কোডই
// দেখাত, শুধু background-এ পরের বারের জন্য cache আপডেট হতো। sw.js নিজে
// অপরিবর্তিত থাকলে (যেমন শুধু meal.js বদলালে) SW lifecycle/update-toast
// কখনো trigger-ই হতো না — তাই Chrome-এ install করা PWA পুরোনো হিসাব
// দেখাতেই থাকত (Kiwi ব্রাউজারে ঠিক দেখাচ্ছিল কারণ ওর SW handling আলাদা)।
// সমাধান: local কোড ফাইল (html/js/css) এখন NETWORK-FIRST, ছোট timeout
// race দিয়ে — ভালো নেটে সবসময় একদম latest কোড আসবে, কোনো version-bump/
// hard-refresh ছাড়াই। দুর্বল নেট/অফলাইনে timeout-এর পর cache থেকে
// ফলব্যাক করে, তাই লোড কখনো আটকে থাকবে না। আইকন/ম্যানিফেস্টের মতো
// সত্যিকারের static asset আগের মতোই cache-first (এগুলো কখনো বদলায় না)।
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // 1️⃣ Firebase RTDB + Auth → NETWORK ONLY (real-time data)
  const networkOnly = ['firebaseio.com', 'firebaseapp.com', 'googleapis.com'];
  if (networkOnly.some(d => url.hostname.includes(d))) return;

  // 2️⃣ Firebase SDK + CDN + Fonts (URL-এ version pinned, কখনো বদলায় না) → CACHE FIRST
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

  // 3️⃣ App কোড (navigation + html/js/css) → NETWORK FIRST, timeout হলে cache fallback
  const isNavigation = event.request.mode === 'navigate';
  const isAppCode = isNavigation || /\.(js|css|html)(\?|$)/.test(url.pathname) ||
                     url.pathname === '/' || url.pathname.endsWith('/');
  if (isAppCode) {
    event.respondWith(_networkFirstWithTimeout(event.request, 3000));
    return;
  }

  // 4️⃣ বাকি static asset (icon, manifest, favicon) → CACHE FIRST + background update
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

// নেটওয়ার্ক আগে চেষ্টা করে (browser HTTP cache বাইপাস করে, no-store দিয়ে —
// যাতে GitHub Pages-এর নিজের cache-header-এর কারণে পুরোনো ফাইল না আসে)।
// timeoutMs-এর মধ্যে সাড়া না পেলে, বা fetch fail করলে, SW-এর নিজের
// cache (Cache Storage) থেকে ফলব্যাক করে। Network দেরিতে সাড়া দিলেও
// (timeout-এর পরে হলেও) cache আপডেট করে রাখে, যাতে পরের লোড আরও ফ্রেশ হয়।
function _networkFirstWithTimeout(request, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const freshReq = new Request(request, { cache: 'no-store' });

    const toCache = res => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        caches.open(CACHE_VERSION).then(c => c.put(request, res.clone()));
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      caches.match(request).then(cached => {
        if (settled) return;
        settled = true;
        if (cached) resolve(cached);
        // cache-ও না থাকলে নিচের network promise (এখনও চলছে) resolve করবে
      });
    }, timeoutMs);

    fetch(freshReq).then(res => {
      toCache(res);
      if (settled) return; // দেরিতে এসেছে — cache আপডেট হয়ে গেছে, আর resolve লাগবে না
      settled = true;
      clearTimeout(timer);
      resolve(res);
    }).catch(() => {
      if (settled) return;
      clearTimeout(timer);
      caches.match(request).then(cached => {
        settled = true;
        resolve(cached || Response.error());
      });
    });
  });
}

