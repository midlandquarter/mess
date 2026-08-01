// ═══════════════════════════════════════════════════════════════════
// .github/workflows/backup_db.js
// ─────────────────────────────────────────────────────────────────
// GitHub Action থেকে call হয়।
// কাজ:
//   ① FIREBASE_SERVICE_ACCOUNT দিয়ে পুরো Realtime Database export করা
//   ② নিজের Google account-এর OAuth token দিয়ে Drive-এ upload করা
//      (service account দিয়ে না — personal/Gmail account-এ service
//      account-এর নিজস্ব storage quota থাকে না, তাই সরাসরি ফাইল
//      তৈরি করতে পারে না, folder share করা থাকলেও না)
//
// লাগবে (সবগুলো GitHub Secrets থেকে):
//   - FIREBASE_SERVICE_ACCOUNT
//   - DRIVE_FOLDER_ID
//   - GOOGLE_CLIENT_ID
//   - GOOGLE_CLIENT_SECRET
//   - GOOGLE_REFRESH_TOKEN
// ═══════════════════════════════════════════════════════════════════
const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
const folderId     = process.env.DRIVE_FOLDER_ID;
const clientId      = process.env.GOOGLE_CLIENT_ID;
const clientSecret  = process.env.GOOGLE_CLIENT_SECRET;
const refreshToken  = process.env.GOOGLE_REFRESH_TOKEN;

for (const [name, val] of Object.entries({
  FIREBASE_SERVICE_ACCOUNT: serviceAccountJson,
  DRIVE_FOLDER_ID: folderId,
  GOOGLE_CLIENT_ID: clientId,
  GOOGLE_CLIENT_SECRET: clientSecret,
  GOOGLE_REFRESH_TOKEN: refreshToken,
})) {
  if (!val) {
    console.error(`❌ ${name} environment variable not set.`);
    process.exit(1);
  }
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (e) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message);
  process.exit(1);
}
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
console.log(`📁 Drive folder: ${folderId}`);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL,
});

async function exportDatabase() {
  const db = admin.database();

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timed out reading database (30s)')), 30000)
  );

  console.log('🔍 পুরো Database read করা হচ্ছে...');
  const snapshot = await Promise.race([db.ref('/').once('value'), timeoutPromise]);
  const data = snapshot.val();

  const localPath = 'backup.json';
  fs.writeFileSync(localPath, JSON.stringify(data, null, 2), 'utf8');

  const sizeKB = (fs.statSync(localPath).size / 1024).toFixed(1);
  console.log(`✅ Local export সম্পন্ন: ${localPath} (${sizeKB} KB)`);
  return localPath;
}

async function uploadToDrive(localPath) {
  // নিজের Google account হিসেবে upload — service account হিসেবে না
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });

  // BD সময় হিসেবে date বানানো হচ্ছে (runner UTC-তে চলে, তাই +6 ঘন্টা যোগ করা লাগে —
  // নাহলে রাত ১২টার পরের run-এ আগের দিনের date বসে যেত)
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000); // BD = UTC+6
  const dd = String(bd.getUTCDate()).padStart(2, '0');
  const mm = String(bd.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(bd.getUTCFullYear()).slice(-2);
  const fileName = `${dd}-${mm}-${yy}_mess-backup.json`;

  console.log(`📤 Google Drive-এ upload করা হচ্ছে: ${fileName}`);
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/json',
      body: fs.createReadStream(localPath),
    },
    fields: 'id, webViewLink',
  });

  console.log(`✅ Drive-এ আপলোড সম্পন্ন। File ID: ${res.data.id}`);
  if (res.data.webViewLink) {
    console.log(`🔗 Link: ${res.data.webViewLink}`);
  }
}

(async () => {
  try {
    const localPath = await exportDatabase();
    await uploadToDrive(localPath);
    process.exit(0);
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
})();
