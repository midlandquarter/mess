// ═══════════════════════════════════════════════════════════════════
// .github/workflows/send_fcm.js
// ─────────────────────────────────────────────────────────────────
// GitHub Action থেকে call হয়।
// কাজ:
//   ① FIREBASE_SERVICE_ACCOUNT env থেকে service account JSON পড়া
//   ② Firebase Admin SDK দিয়ে authenticate করা
//   ③ RTDB থেকে সব pushTokens পড়া
//   ④ FCM v1 API দিয়ে সবাইকে notification পাঠানো
//   ⑤ Invalid/expired token গুলো RTDB থেকে মুছে ফেলা (clean-up)
//
// Usage:
//   node send_fcm.js "Notification Title" "Notification Body" "https://optional-url"
// ═══════════════════════════════════════════════════════════════════

const admin = require('firebase-admin');

// Command line arguments
const title = process.argv[2] || 'মেস নোটিফিকেশন';
const body  = process.argv[3] || '';
const link  = process.argv[4] || 'https://midlandquarter.github.io/mess/';

// Service account JSON — GitHub Secret থেকে আসে
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT environment variable not set.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (e) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message);
  process.exit(1);
}

// Firebase Admin initialize
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://midlandquarter-19623-default-rtdb.firebaseio.com'
});

async function sendNotifications() {
  const db = admin.database();
  const messaging = admin.messaging();

  // RTDB থেকে সব push tokens পড়ো
  // structure: pushTokens/{uid} = "fcm_token_string"
  const snap = await db.ref('pushTokens').once('value');

  if (!snap.exists()) {
    console.log('ℹ️  কোনো registered token নেই। কেউ এখনো notification allow করেনি।');
    process.exit(0);
  }

  // uid → token map বানাও (invalid token মুছতে uid দরকার)
  const tokenMap = {}; // { uid: token }
  snap.forEach(child => {
    if (child.val()) tokenMap[child.key] = child.val();
  });

  const uids   = Object.keys(tokenMap);
  const tokens = Object.values(tokenMap);
  console.log(`📤 Sending to ${tokens.length} device(s)...`);

  // প্রতিটা token-এ আলাদাভাবে পাঠাও (FCM multicast-এ error tracking সহজ)
  const results = await Promise.allSettled(
    tokens.map(token =>
      messaging.send({
        token,
        notification: { title, body },
        // Web Push-specific settings
        webpush: {
          notification: {
            icon : 'https://midlandquarter.github.io/mess/icon-192.png',
            badge: 'https://midlandquarter.github.io/mess/icon-192.png',
            vibrate: [200, 100, 200],
            requireInteraction: false
          },
          fcmOptions: {
            link // notification-এ tap করলে এই URL খুলবে
          }
        }
      })
    )
  );

  // Result count
  const success = results.filter(r => r.status === 'fulfilled').length;
  const failed  = results.filter(r => r.status === 'rejected').length;
  console.log(`✅ Success: ${success} | ❌ Failed: ${failed}`);

  // Invalid/expired tokens RTDB থেকে মুছো (clutter prevent করতে)
  const toRemove = {};
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const errCode = result.reason?.errorInfo?.code || '';
      const isInvalid =
        errCode.includes('registration-token-not-registered') ||
        errCode.includes('invalid-registration-token') ||
        errCode.includes('invalid-argument');
      if (isInvalid) {
        console.log(`🗑️  Removing invalid token for uid: ${uids[i]}`);
        toRemove['pushTokens/' + uids[i]] = null;
      } else {
        console.warn(`⚠️  Send failed for uid ${uids[i]}:`, result.reason?.message || result.reason);
      }
    }
  });

  if (Object.keys(toRemove).length > 0) {
    await db.ref().update(toRemove);
    console.log(`🗑️  Removed ${Object.keys(toRemove).length} invalid token(s).`);
  }

  console.log('Done.');
  process.exit(0);
}

sendNotifications().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
  
