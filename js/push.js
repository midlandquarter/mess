// ═══════════════════════════════════════════════════════════════════
// js/push.js  —  FCM Push Notification Registration
// ─────────────────────────────────────────────────────────────────
// কাজ:
//   ① Firebase Messaging SDK লোড করা (index.html না ছুঁয়ে dynamic load)
//   ② User login করলে notification permission চাওয়া
//   ③ FCM token নেওয়া এবং Firebase RTDB-তে সেভ করা
//      path: pushTokens/{uid}
//   ④ App খোলা থাকলে (foreground) push এলে toast দেখানো
// ─────────────────────────────────────────────────────────────────
// ⚠️  VAPID_KEY: Firebase Console → Project Settings →
//     Cloud Messaging → Web configuration → Key pair
//     "Generate key pair" থেকে পাওয়া Public key এখানে বসাও।
// ═══════════════════════════════════════════════════════════════════

const VAPID_KEY = 'BN5I0AJqbVGfhQnedAKjHcwUojZMEdszieqwvQnucvWI6t5VBmxXNNW4OgPpVqbuLOAase6BP9kuRnqP14i4_Yo';
// ↑ Firebase Console → Project Settings → Cloud Messaging →
//   Web Push certificates → Key pair (copy the public key)

// Push notification support আছে কিনা চেক করো
if (!('Notification' in window) || !('serviceWorker' in navigator)) {
  console.log('[Push] Browser supports না।');
}

// Firebase Messaging SDK dynamically load করো
// (index.html-এ আলাদা script tag লাগবে না)
function _loadMessagingSDK() {
  return new Promise((resolve, reject) => {
    // ইতিমধ্যে লোড হয়ে থাকলে সরাসরি resolve
    if (typeof firebase !== 'undefined' && firebase.messaging) {
      return resolve();
    }
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Messaging SDK load failed'));
    document.head.appendChild(s);
  });
}

async function _registerPush(user) {
  try {
    // Messaging SDK নিশ্চিত করো
    await _loadMessagingSDK();

    const messaging = firebase.messaging();

    // বর্তমান SW registration পাসো — sw.js-ই ব্যবহার হবে,
    // firebase-messaging-sw.js নয়
    const swReg = await navigator.serviceWorker.ready;

    // Notification permission চাও (user দেখবে একটি popup)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Permission denied.');
      return;
    }

    // FCM token নাও
    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (!token) {
      console.warn('[Push] Token পাওয়া যায়নি।');
      return;
    }

    // Firebase RTDB-তে সেভ করো: pushTokens/{uid} = "token_string"
    // GitHub Action এই path থেকে সব tokens পড়বে
    await firebase.database().ref('pushTokens/' + user.uid).set(token);
    console.log('[Push] Token saved ✅');

    // Foreground message handler:
    // App খোলা থাকলে FCM SDK notification দেখায় না — আমাদেরই handle করতে হয়
    messaging.onMessage(payload => {
      const title = payload.notification?.title || 'মেস নোটিফিকেশন';
      const body  = payload.notification?.body  || '';
      // App-এর নিজস্ব toast function থাকলে সেটা ব্যবহার করো
      if (typeof toast === 'function') {
        toast('🔔 ' + title + (body ? ' — ' + body : ''));
      }
      // Browser notification-ও দেখাও (foreground)
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/mess/icon-192.png'
        });
      }
    });

  } catch (err) {
    console.warn('[Push] Registration error:', err);
  }
}

// App শুরু হলেই run করো
// firebase.auth() available হওয়ার জন্য config.js আগে load হওয়া দরকার
// index.html-এ push.js সবার শেষে load করলে এটা নিশ্চিত হবে
(function initPush() {
  // Firebase initialize হওয়ার জন্য একটু অপেক্ষা করো
  const MAX_WAIT = 10000; // 10 seconds
  const START = Date.now();

  function tryInit() {
    // Firebase আর auth ready কিনা চেক করো
    if (typeof firebase === 'undefined' || !firebase.apps?.length || !firebase.auth) {
      if (Date.now() - START < MAX_WAIT) {
        setTimeout(tryInit, 500);
      }
      return;
    }

    // Auth state পরিবর্তনে token register/update করো
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        _registerPush(user).catch(e => console.warn('[Push] init error:', e));
      } else {
        // Logout হলে token সরানোর দরকার নেই — token device-এ থাকে,
        // অন্য user একই device-এ login করলে overwrite হবে
        console.log('[Push] User logged out.');
      }
    });
  }

  // DOM ready হওয়ার পরে শুরু করো
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
