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

// Toast notification — centered glass card, auto-detects type/icon from
// the leading emoji already used across the app (✅ ❌ ⚠️ ⏳ 🔔 🗑️ ✏️)
const TOAST_TYPES={'✅':'success','❌':'error','⚠️':'warning','⏳':'loading','🔔':'info','🗑️':'info','✏️':'info'};
let _toastTimer=null;
function toast(msg){
  const t=document.getElementById('toast');
  if(!t) return;
  let type='neutral',icon='',text=msg;
  for(const key in TOAST_TYPES){
    if(msg.indexOf(key)===0){ type=TOAST_TYPES[key]; icon=key; text=msg.slice(key.length).trim(); break; }
  }
  t.dataset.type=type;
  t.innerHTML=(icon?'<span class="toast-icon">'+icon+'</span>':'')+'<span class="toast-msg"></span>';
  t.querySelector('.toast-msg').textContent=text;
  t.classList.remove('show'); void t.offsetWidth; // restart pop-in animation on rapid re-trigger
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>t.classList.remove('show'),type==='loading'?4000:2800);
}
