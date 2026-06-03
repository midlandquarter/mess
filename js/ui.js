// ═══════════════════════════════════════════════
// js/ui.js
// Screen navigation, popstate, admin card popups,
// rules config popup, dark mode, modal, sec()
//
// Load order: AFTER auth.js  BEFORE app.js block
// Depends on (all global, loaded before this file):
//   core.js   → homeViewDate (var)
//   utils.js  → safeHTML(), toast(), messMonthKey()
//   auth.js   → isManagerOrCtrl(), CU
//   config.js → DB (for togRulesCfg only — async triggered)
// Calls into (async/user-triggered only — loaded after):
//   home.js   → refreshHome(), buildMessMonthOptions()
//   modules/* → initMeal, initBazar, initOthers, initDeposit,
//               loadBill, loadMembers, loadProfile, initAdmin,
//               initOfficeMealScreen, newMessManagerScreen,
//               initNotice, initRules
//
// Parse-time side effect: window.addEventListener('popstate')
//   — body only executes on back-button press, never at parse time.
// ═══════════════════════════════════════════════


// ═══════════════════════════════════════════════
// SCREEN NAV
// ═══════════════════════════════════════════════
function showSc(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById('sc-'+id);
  if(el) el.classList.add('active');
  window.scrollTo(0,0);
  // Hide the post-registration verify card whenever leaving login screen
  if(id !== 'login'){
    const vc = document.getElementById('verify-card');
    if(vc) vc.style.display='none';
  }
  // Push history state for back button
  if(id!=='login'&&id!=='register'&&id!=='forgot'){
    history.pushState({screen:id},'',window.location.pathname+'?s='+id);
  }
}
function goHome(){ closeAllAdminCards(); homeViewDate=null; showSc('home'); refreshHome(); }
// Handle back button
window.addEventListener('popstate',function(e){
  if(e.state&&e.state.screen){
    const id=e.state.screen;
    if(id==='home'){ homeViewDate=null; refreshHome(); }
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const el=document.getElementById('sc-'+id);
    if(el){ el.classList.add('active'); window.scrollTo(0,0); }
  } else {
    // No state = go home
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const el=document.getElementById('sc-home');
    if(el){ el.classList.add('active'); homeViewDate=null; refreshHome(); }
  }
});
function closeAdmPopup(){ const o=document.getElementById('adm-popup-overlay'); if(o){ const box=o.querySelector('.adm-popup-box'); if(box){ const cardId=o.dataset.cardId; const card=box.querySelector('[data-adm-card]'); if(card){ card.style.display='none'; document.getElementById('sc-admin').querySelector('.content').appendChild(card); }} o.remove(); }}

function tog(id){
  // Admin panel cards → popup modal system
  const cardEl=document.getElementById(id);
  if(!cardEl) return;

  // If popup already open with same card → close
  const existing=document.getElementById('adm-popup-overlay');
  if(existing){
    const wasId=existing.dataset.cardId;
    closeAdmPopup();
    if(wasId===id) return;
  }

  // Overlay
  const overlay=document.createElement('div');
  overlay.id='adm-popup-overlay';
  overlay.dataset.cardId=id;
  overlay.style.cssText=`
    position:fixed;inset:0;z-index:9000;
    background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;
    padding:16px;animation:fadeIn .18s ease;
  `;

  // Popup box
  const box=document.createElement('div');
  box.className='adm-popup-box';
  box.style.cssText=`
    background:var(--card);color:var(--text);
    border-radius:20px;width:100%;max-width:440px;
    max-height:84vh;overflow-y:auto;
    padding:0 0 8px;
    position:relative;
    box-shadow:0 28px 70px rgba(0,0,0,.45);
    border:1px solid var(--border);
    animation:slideUp .2s ease;
  `;

  // Header bar with close button
  const header=document.createElement('div');
  header.style.cssText=`
    display:flex;align-items:center;justify-content:flex-end;
    padding:12px 14px 0;position:sticky;top:0;
    background:var(--card);border-radius:20px 20px 0 0;z-index:1;
  `;
  const closeBtn=document.createElement('button');
  closeBtn.innerHTML='✕';
  closeBtn.setAttribute('aria-label','বন্ধ করুন');
  closeBtn.style.cssText=`
    background:var(--danger);color:#fff;border:none;
    border-radius:50%;width:32px;height:32px;
    font-size:15px;font-weight:700;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.25);
  `;
  closeBtn.onclick=()=>closeAdmPopup();
  header.appendChild(closeBtn);

  // Card content wrapper
  const content=document.createElement('div');
  content.style.cssText='padding:4px 18px 14px;';

  // Move original card into popup
  cardEl.dataset.admCard='1';
  cardEl.style.display='block';
  // Remove card's own box-shadow/border since popup provides it
  cardEl.style.boxShadow='none';
  cardEl.style.border='none';
  cardEl.style.borderRadius='0';
  cardEl.style.margin='0';
  content.appendChild(cardEl);

  box.appendChild(header);
  box.appendChild(content);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Close on overlay backdrop click
  overlay.addEventListener('click',(e)=>{ if(e.target===overlay) closeAdmPopup(); });

  // ESC key close
  const escFn=(e)=>{ if(e.key==='Escape'){ closeAdmPopup(); document.removeEventListener('keydown',escFn); }};
  document.addEventListener('keydown',escFn);
}
function closeAllAdminCards(){
  closeAdmPopup();
  closeRulesCfgPopup();
}
function closeRulesCfgPopup(){
  const o=document.getElementById('rules-cfg-popup-overlay');
  if(o){
    const box=o.querySelector('.adm-popup-box');
    if(box){
      const cardId=o.dataset.cardId;
      const card=box.querySelector('[data-rules-card]');
      if(card){
        card.style.display='none';
        const sc=document.getElementById('sc-rules');
        if(sc) sc.appendChild(card);
      }
    }
    o.remove();
  }
}
function togRulesCfg(grpKey){
  const id='card-cfg-'+grpKey;
  const cardEl=document.getElementById(id);
  if(!cardEl) return;
  const existing=document.getElementById('rules-cfg-popup-overlay');
  if(existing){
    const wasId=existing.dataset.cardId;
    closeRulesCfgPopup();
    if(wasId===id) return;
  }
  // Populate current values — এই মেস মাসের config load করো
  // নতুন মাসে config না থাকলে আগের মাস থেকে inherit করো
  const mmKey = messMonthKey();
  const mmCfg = DB.cfg[mmKey] && DB.cfg[mmKey][grpKey];
  let cfg = mmCfg;
  if(!cfg && DB.handoverDone && DB.handoverDone.length > 0){
    const prevMonths = [...DB.handoverDone].sort().reverse().filter(ho=>ho<mmKey);
    for(const pm of prevMonths){
      if(DB.cfg[pm] && DB.cfg[pm][grpKey]){ cfg = DB.cfg[pm][grpKey]; break; }
    }
  }
  cfg = cfg || DB.cfg[grpKey] || {def:{b:0.75,l:1.5,d:0.75}};
  document.getElementById('cfg-bv-'+grpKey).value=cfg.def.b;
  document.getElementById('cfg-lv-'+grpKey).value=cfg.def.l;
  document.getElementById('cfg-dv-'+grpKey).value=cfg.def.d;
  document.getElementById('cfg-date-'+grpKey).value='';
  // Build overlay (same style as tog())
  const overlay=document.createElement('div');
  overlay.id='rules-cfg-popup-overlay';
  overlay.dataset.cardId=id;
  overlay.style.cssText=`position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .18s ease;`;
  const box=document.createElement('div');
  box.className='adm-popup-box';
  box.style.cssText=`background:var(--card);color:var(--text);border-radius:20px;width:100%;max-width:440px;max-height:84vh;overflow-y:auto;padding:0 0 8px;position:relative;box-shadow:0 28px 70px rgba(0,0,0,.45);border:1px solid var(--border);animation:slideUp .2s ease;`;
  const header=document.createElement('div');
  header.style.cssText=`display:flex;align-items:center;justify-content:flex-end;padding:12px 14px 0;position:sticky;top:0;background:var(--card);border-radius:20px 20px 0 0;z-index:1;`;
  const closeBtn=document.createElement('button');
  closeBtn.innerHTML='✕';
  closeBtn.style.cssText=`background:var(--danger);color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.25);`;
  closeBtn.onclick=()=>closeRulesCfgPopup();
  header.appendChild(closeBtn);
  const content=document.createElement('div');
  content.style.cssText='padding:4px 18px 14px;';
  cardEl.dataset.rulesCard='1';
  cardEl.style.display='block';
  cardEl.style.boxShadow='none';
  cardEl.style.border='none';
  cardEl.style.borderRadius='0';
  cardEl.style.margin='0';
  content.appendChild(cardEl);
  box.appendChild(header);
  box.appendChild(content);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click',(e)=>{ if(e.target===overlay) closeRulesCfgPopup(); });
  const escFn=(e)=>{ if(e.key==='Escape'){ closeRulesCfgPopup(); document.removeEventListener('keydown',escFn); }};
  document.addEventListener('keydown',escFn);
}
function sec(s){
  closeAllAdminCards();
  if(s==='mealhistory'){ showMyMealHistory(); return; }
  if(s==='meal'){ initMeal(); showSc('meal'); return; }
  if(s==='bazar'){ initBazar(); showSc('bazar'); return; }
  if(s==='others'){ initOthers(); showSc('others'); return; }
  if(s==='deposit'){ initDeposit(); showSc('deposit'); return; }
  if(s==='bill'){ loadBill(); showSc('bill'); return; }
  if(s==='report'){ buildMessMonthOptions(); showSc('report'); return; }
  if(s==='members'){ loadMembers(); showSc('members'); return; }
  if(s==='profile'){ loadProfile(); showSc('profile'); return; }
  if(s==='admin'){ if(!isManagerOrCtrl()){ toast('❌ অনুমতি নেই!'); return; } initAdmin(); showSc('admin'); return; }
  if(s==='officemeal'){ initOfficeMealScreen(); showSc('officemeal'); return; }
  if(s==='messmanager'){ newMessManagerScreen(); return; }
  if(s==='notice'){ initNotice(); showSc('notice'); return; }
  if(s==='rules'){
    if(!CU||!isManagerOrCtrl()) return;
    initRules(); showSc('rules'); return;
  }
  if(s==='whoeats'){ showSc('whoeats'); return; }
}


// ═══════════════════════════════════════════════
// DARK MODE
// ═══════════════════════════════════════════════
function getPreferredDark(){
  try{
    const stored = localStorage.getItem('mq_dark');
    if(stored==='1') return true;
    if(stored==='0') return false;
  }catch(e){}
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function persistDark(isDark){
  try{ localStorage.setItem('mq_dark', isDark?'1':'0'); }catch(e){}
}
function syncThemeMeta(isDark){
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', isDark ? '#0f0f1a' : '#0f4526');
}
function applyDark(force){
  const isDark = typeof force === 'boolean' ? force : getPreferredDark();
  document.documentElement.classList.toggle('dark-mode', isDark);
  if(document.body) document.body.classList.toggle('dark-mode', isDark);
  syncThemeMeta(isDark);
  return isDark;
}
function setTheme(mode){
  const isDark = mode==='night';
  // Note: darkMode not in GLOBAL_FIELDS — persisted only in localStorage via persistDark()
  applyDark(isDark);
  persistDark(isDark);
  updateThemeBtns();
}
function updateThemeBtns(){
  const isDark = document.documentElement.classList.contains('dark-mode');
  const dayBtn = document.getElementById('theme-day-btn');
  const nightBtn = document.getElementById('theme-night-btn');
  if(!dayBtn||!nightBtn) return;
  if(isDark){
    dayBtn.style.background='transparent'; dayBtn.style.color='var(--text-light)';
    nightBtn.style.background='var(--primary)'; nightBtn.style.color='#fff';
  } else {
    dayBtn.style.background='var(--primary)'; dayBtn.style.color='#fff';
    nightBtn.style.background='transparent'; nightBtn.style.color='var(--text-light)';
  }
}


// ═══════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════
function showModal(title,body,onOk,isHtml){
  document.getElementById('modal-title').textContent=title;
  const bodyEl=document.getElementById('modal-body');
  if(isHtml){ bodyEl.innerHTML=safeHTML(body); }
  else bodyEl.textContent=body;
  const okBtn=document.getElementById('modal-ok');
  okBtn.textContent=isHtml?'✅ সেভ করুন':'হ্যাঁ';
  document.getElementById('modal-bg').classList.add('show');
  okBtn.onclick=function(){
    if(isHtml){
      // For edit modals, onOk handles validation and closes if valid
      if(onOk) onOk();
    } else {
      closeModal();
      if(onOk) onOk();
    }
  };
}
function closeModal(){ document.getElementById('modal-bg').classList.remove('show'); }
