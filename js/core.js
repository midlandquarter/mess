// ═══════════════════════════════════════════════
// js/shared/core.js
// Minimal shared layer — breaks circular deps
// NO import/export. NO bundler. Global scope only.
//
// Load order: AFTER config.js + utils.js
//             BEFORE db.js and all modules
//
// Sources (index_stable.html exact lines):
//   homeViewDate    → line 3312  (let → var)
//   fmtDate         → line 3628
//   isActiveInMonth → line 3908
//   isOfficeMealUser   → line 6131
//   getOfficeMealUsers → line 6139
//   getOfficeMealRate  → line 6143
//   invalidate stubs   → real impls at 3795/3847/3930/4230
//                        overridden by meal.js + deposit.js
// ═══════════════════════════════════════════════


// ── GROUP 1: Shared State ────────────────────────
// var (not let) — must be window-scoped so ui.js (goHome)
// and home.js can share the same binding across script files.
// let would create two separate script-scoped variables.
var homeViewDate = null; // null = always show today


// ── GROUP 2: Format Utility ──────────────────────
// Defined in original: meal.js section (line 3628)
// Needed by: home.js, whoeats (home.js), pdf.js, office-meal.js
// Zero external dependencies — pure string transform.
function fmtDate(isoStr){
  // Converts "YYYY-MM-DD" → "DD-MM-YYYY" e.g. "16-04-2026"
  if(!isoStr) return '';
  const parts=isoStr.split('-');
  if(parts.length!==3) return isoStr;
  return parts[2]+'-'+parts[1]+'-'+parts[0];
}


// ── GROUP 3: Member Activity Check ──────────────
// Defined in original: meal.js section (line 3908)
// Needed by: meal.js (_getMemberCounts, getCookMeals),
//            admin.js (handover), pdf.js, home.js (activeUsers)
// External dep: messMonthKey() — lives in utils.js (loads before core.js ✓)
function isActiveInMonth(u, mmKey){
  if(u.activeFrom) return u.activeFrom <= mmKey;
  // activeFrom নেই → joined date থেকে সঠিক মেস মাস বের করো (11-10 cycle)
  if(u.joined) return messMonthKey(new Date(u.joined)) <= mmKey;
  // কোনো তথ্যই নেই → founding member safety fallback
  return true;
}


// ── GROUP 4: Office Meal Identity ───────────────
// Defined in original: office-meal.js section (lines 6131–6145)
// Moved here because meal.js calls these BEFORE office-meal.js loads:
//   getNetMeals()          → isOfficeMealUser()    (line 3841)
//   calcMemberOtherShares()→ isOfficeMealUser()    (line 3934)
//   calcMealRate()         → getOfficeMealRate()   (inside meal.js ~3870)
//   calcMealRate()         → getOfficeMealUsers()  (line 4455)
// All three have zero deps beyond DB (config.js, loads first ✓).
function isOfficeMealUser(u){
  // ✅ FIX: শুধু _office flag চেক করো — name/username substring match
  // বাদ দেওয়া হলো। কারণ real member "আব্দুর রহিম (MPCL)" এর নামে
  // "MPCL" (তার কর্মস্থল) থাকায় ভুলভাবে office-meal user হিসেবে ধরা
  // হচ্ছিল — ফলে তার জুলাই মাসের real meal (07-11, 07-18, 07-30) office
  // মিল bucket-এ চলে যাচ্ছিল, আর সে নিজে অন্যান্য/বাবুর্চি খরচ থেকে বাদ
  // পড়ে যাচ্ছিল (see meal.js calcMemberOtherShares)। office-meal.js-এ
  // account তৈরির একমাত্র জায়গায় সবসময় _office:true সেট হয় (নিশ্চিত করা
  // হয়েছে) — তাই এই flag-ই যথেষ্ট এবং নির্ভরযোগ্য একমাত্র সংকেত।
  return !!(u && u._office);
}

function getOfficeMealUsers(){
  return DB.users.filter(u=>isOfficeMealUser(u));
}

function getOfficeMealRate(mmKey){
  return DB.officeMealRates[mmKey]||0;
}


// ── GROUP 5: Invalidation Stubs ──────────────────
// These are safe no-ops until meal.js / deposit.js load and
// redefine them with real cache-clearing implementations.
//
// Why stubs here:
//   saveDB()         (db.js)   calls all four — db.js loads before meal.js
//   _swapAndRender() (utils.js) calls invalidateMealIndex + invalidateMealRateCache
//   _checkReady()    (db.js)   calls all four inside Firebase async callback
//
// Override sequence:
//   core.js      → stub (no-op)
//   meal.js      → real invalidateMealIndex, invalidateMealRateCache,
//                  invalidateMemberCountsCache   (after cache vars declared)
//   deposit.js   → real invalidateTxBalCache     (after cache vars declared)
//
// Runtime safety: all callers are inside functions/callbacks, never
// at parse time. By user's first interaction all overrides are in place.

function invalidateMealIndex() { /* stub — overridden by meal.js */ }
function invalidateMealRateCache() { /* stub — overridden by meal.js */ }
function invalidateMemberCountsCache() { /* stub — overridden by meal.js */ }
function invalidateTxBalCache() { /* stub — overridden by deposit.js */ }
