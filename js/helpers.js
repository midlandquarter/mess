// ═══════════════════════════════════════════════
// js/helpers.js
// Tiny global helpers used across all modules
// Load order: AFTER inline bootstrap script block
//             (needs DOM #toast element to exist)
// Depends on: auth.js → isManagerOrCtrl()
// ═══════════════════════════════════════════════

// DOM value helper
function V(id){ return document.getElementById(id)?.value?.trim()||''; }

// Role alias (thin wrapper)
function isAdmin(){ return CU&&isManagerOrCtrl(CU); }

// Bengali date formatter
function fmtDateBN(dt){
  const days=['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার'];
  const months=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  return `${days[dt.getDay()]}, ${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}

// Toast notification
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}
