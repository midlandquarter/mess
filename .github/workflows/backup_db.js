// ═══════════════════════════════════════════════════════════════════
// .github/workflows/backup_db.js
// ─────────────────────────────────────────────────────────────────
// GitHub Action থেকে call হয়।
// কাজ:
//   ① FIREBASE_SERVICE_ACCOUNT env থেকে service account JSON পড়া
//   ② পুরো Realtime Database (root থেকে) JSON আকারে export করা
//   ③ একই service account দিয়ে Google Drive-এর নির্দিষ্ট folder-এ upload করা
//
// লাগবে (দুটোই GitHub Secrets থেকে আসে):
//   - FIREBASE_SERVICE_ACCOUNT  (আগে থেকেই আছে)
//   - DRIVE_FOLDER_ID           (backup যে Drive folder-এ যাবে)
//
// শর্ত:
//   - সেই Drive folder service account-এর email-কে "Editor" হিসেবে share করা থাকতে হবে
//   - Google Cloud project-এ Google Drive API enabled থাকতে হবে
// ═══════════════════════════════════════════════════════════════════
const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
const folderId = process.env.DRIVE_FOLDER_ID;

if (!serviceAccountJson) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT environment variable not set.');
  process.exit(1);
}
if (!folderId) {
  console.error('❌ DRIVE_FOLDER_ID environment variable not set.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (e) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message);
  process.exit(1);
}

// private_key-এ literal newlines থাকলে \n দিয়ে replace করো
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

  // 30s timeout — hang করে workflow আটকে থাকবে না
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
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const fileName = `mess-backup-${date}.json`;

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
