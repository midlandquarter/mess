// ═══════════════════════════════════════════════
// js/notice.js
// Notice board screen + notice popup
//
// Load order: AFTER admin.js
//             BEFORE final inline bootstrap <script>
//
// Depends on (all global):
//   config.js  → DB, CU
//   db.js      → saveDB(), isOnline(), noNetPopup()
//   inline block → toast()
//   ui.js      → showModal()
//   auth.js    → isManagerOrCtrl()
//
// Exposes (global):
//   initNotice()          ← called by ui.js sec('notice'), db.js onDB
//   updatePopupToggleBtn()← called internally
//   toggleNoticePopup()   ← inline onclick: #popup-toggle-btn
//   saveNotice()          ← inline onclick: sc-notice
//   clearNotice()         ← inline onclick: sc-notice
//   showNoticePopup()     ← called by auth.js after login
//   closeNoticePopup()    ← inline onclick: #notice-popup-modal buttons
//
// HTML DOM targets:
//   #notice-edit-card, #notice-display, #notice-text-input
//   #popup-toggle-btn, #notice-popup-body, #notice-popup-modal
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// NOTICE BOARD
// ═══════════════════════════════════════════════
function initNotice(){
  const canEdit=CU&&isManagerOrCtrl();
  const editCard=document.getElementById('notice-edit-card');
  if(editCard) editCard.style.display=canEdit?'block':'none';
  // Render current notice
  const nd=document.getElementById('notice-display');
  if(nd){
    if(DB.notice.text&&DB.notice.text.trim()){
      nd.textContent=DB.notice.text;
      nd.style.color='var(--text)';
    } else {
      nd.innerHTML='<p class="muted tc">কোনো নোটিশ নেই</p>';
    }
  }
  if(canEdit){
    const ta=document.getElementById('notice-text-input');
    if(ta) ta.value=DB.notice.text||'';
    updatePopupToggleBtn();
  }
}
function updatePopupToggleBtn(){
  const btn=document.getElementById('popup-toggle-btn');
  if(!btn) return;
  const on=DB.notice.popupEnabled;
  btn.textContent=on?'🔔 চালু (বন্ধ করতে চাপুন)':'🔕 বন্ধ (চালু করতে চাপুন)';
  btn.style.background=on?'var(--primary)':'var(--bg)';
  btn.style.color=on?'#fff':'var(--primary)';
}
function toggleNoticePopup(){
  DB.notice.popupEnabled=!DB.notice.popupEnabled;
  // ✅ FIX: notice = global data — saveGlobal() যথেষ্ট, saveDB() বাদ
  saveGlobal(); updatePopupToggleBtn();
  toast(DB.notice.popupEnabled?'🔔 পপআপ চালু হয়েছে!':'🔕 পপআপ বন্ধ করা হয়েছে!');
}
function saveNotice(){
  if(!isOnline()){ noNetPopup(); return; }
  const ta=document.getElementById('notice-text-input');
  const text=ta?(ta.value||'').trim().slice(0,2000):'';
  DB.notice.text=text;
  // ✅ FIX: notice = global data — saveGlobal() যথেষ্ট
  saveGlobal(); initNotice();
  toast('✅ নোটিশ সেভ হয়েছে!');
}
function clearNotice(){
  if(!isOnline()){ noNetPopup(); return; }
  showModal('নোটিশ মুছুন','নোটিশ মুছে ফেলবেন?',()=>{
    DB.notice.text=''; saveGlobal(); initNotice(); toast('✅ নোটিশ মুছে ফেলা হয়েছে!');
  });
}
// ═══════════════════════════════════════════════
// NOTICE POPUP
// Originally in js/rules.js | Moved: 2026-05-20
// ═══════════════════════════════════════════════
function showNoticePopup(){
  if(!DB.notice||!DB.notice.text||!DB.notice.popupEnabled) return;
  document.getElementById('notice-popup-body').textContent=DB.notice.text;
  document.getElementById('notice-popup-modal').classList.add('show');
}
function closeNoticePopup(){
  document.getElementById('notice-popup-modal').classList.remove('show');
}
