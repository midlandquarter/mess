// ═══════════════════════════════════════════════════════════════════
// .github/workflows/send_fcm.js
// ─────────────────────────────────────────────────────────────────
// GitHub Action থেকে call হয়।
// কাজ:
//   ① FIREBASE_SERVICE_ACCOUNT env থেকে service account JSON পড়া
//   ② Firebase Admin SDK দিয়ে authenticate করা
//   ③ RTDB থেকে সব pushTokens পড়া  (path: users/{uid}/pushToken)
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

// ✅ private_key-এ literal newlines থাকলে \n দিয়ে replace করো
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

const projectId = serviceAccount.project_id;
if (!projectId) {
  console.error('❌ project_id not found in service account JSON.');
  process.exit(1);
}

const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;
console.log(`📡 Project: ${projectId}`);
console.log(`📡 Database: ${databaseURL}`);
console.log(`📢 Title: "${title}"`);
console.log(`📢 Body:  "${body}"`);

// Firebase Admin initialize
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL
});

async function sendNotifications() {
  const db        = admin.database();
  const messaging = admin.messaging();

  // 30s timeout — auth error হলে আর hang করবে না
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('⏱️ Timeout: Firebase 30s-এ respond করেনি। Service account চেক করুন।')), 30000)
  );

  // RTDB থেকে সব users পড়ো
  console.log('🔍 Firebase RTDB থেকে users পড়া হচ্ছে...');
  const snap = await Promise.race([
    db.ref('users').once('value'),
    timeoutPromise
  ]);

  // ✅ FIX: verbose logging — কতজন user আছে ও কতজনের token আছে দেখাও
  const totalUsers = snap.numChildren();
  console.log(`👥 মোট users found: ${totalUsers}`);

  if (!snap.exists() || totalUsers === 0) {
    // ✅ FIX: exit code 2 — "no tokens" কে success (0) থেকে আলাদা করো।
    // আগে exit(0) দেওয়ায় GitHub Actions সবসময় সবুজ দেখাত —
    // token না থাকলেও "success" মনে হত।
    console.log('⚠️  RTDB-তে কোনো user node নেই।');
    console.log('   Firebase Console → RTDB → users/ node চেক করুন।');
    process.exit(2);
  }

  // uid → token map
  const tokenMap = {};
  snap.forEach(child => {
    const token = child.val()?.pushToken;
    // ✅ FIX: প্রতিটা user-এর token status log করো — debugging-এ সাহায্য করবে
    if (token) {
      tokenMap[child.key] = token;
      console.log(`  ✓ uid=${child.key} → token found (${token.slice(0,20)}...)`);
    } else {
      console.log(`  – uid=${child.key} → pushToken নেই`);
    }
  });

  if (Object.keys(tokenMap).length === 0) {
    // ✅ FIX: exit code 2 — users আছে কিন্তু কারো token নেই
    console.log('');
    console.log('⚠️  কোনো device-এ pushToken নেই।');
    console.log('   কারণ হতে পারে:');
    console.log('   ① App-এ notification permission দেওয়া হয়নি');
    console.log('   ② App একবারও login করা হয়নি এই device-এ');
    console.log('   ③ push.js-এ কোনো error হয়েছিল token save করার সময়');
    process.exit(2);
  }

  const uids   = Object.keys(tokenMap);
  const tokens = Object.values(tokenMap);
  console.log(`\n📤 ${tokens.length}টি device-এ notification পাঠানো হচ্ছে...`);

  // প্রতিটা token-এ আলাদাভাবে পাঠাও
  const results = await Promise.allSettled(
    tokens.map(token =>
      messaging.send({
        token,
        // ✅ FIX: top-level notification + webpush দুটোই দাও।
        // শুধু webpush.notification দিলে কিছু Android Chrome version-এ
        // background notification reliably দেখায় না।
        // top-level notification = FCM SDK-এর default fallback।
        notification: {
          title,
          body,
        },
        webpush: {
          notification: {
            title,
            body,
            icon : 'https://midlandquarter.github.io/mess/icon-192.png',
            badge: 'https://midlandquarter.github.io/mess/icon-192.png',
            vibrate: [200, 100, 200],
            requireInteraction: false,
          },
          fcm_options: {
            link,
          },
        },
      })
    )
  );

  // Result
  const success = results.filter(r => r.status === 'fulfilled').length;
  const failed  = results.filter(r => r.status === 'rejected').length;
  console.log(`\n✅ Success: ${success} | ❌ Failed: ${failed}`);

  // Invalid/expired token মুছো
  const toRemove = {};
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const errCode = result.reason?.errorInfo?.code || '';
      const errMsg  = result.reason?.message || String(result.reason);
      const isInvalid =
        errCode.includes('registration-token-not-registered') ||
        errCode.includes('invalid-registration-token') ||
        errCode.includes('invalid-argument');
      if (isInvalid) {
        console.log(`🗑️ Invalid token → uid: ${uids[i]} (মুছে ফেলা হবে)`);
        toRemove['users/' + uids[i] + '/pushToken'] = null;
      } else {
        console.warn(`⚠️ Send failed → uid: ${uids[i]} | Error: ${errMsg}`);
      }
    }
  });

  if (Object.keys(toRemove).length > 0) {
    await db.ref().update(toRemove);
    console.log(`🗑️ ${Object.keys(toRemove).length}টি invalid token সরানো হয়েছে।`);
  }

  // ✅ FIX: সব fail হলে exit code 1 দাও — GitHub-এ লাল দেখাবে
  if (success === 0 && failed > 0) {
    console.error('❌ সব notification fail হয়েছে!');
    process.exit(1);
  }

  console.log('\n✅ Done.');
  process.exit(0);
}

sendNotifications().catch(err => {
  console.error('❌ Fatal error:', err.message || err);
  process.exit(1);
});
