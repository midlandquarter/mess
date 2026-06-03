// ═══════════════════════════════════════════════
// js/rules.js
// Rules screen, Shortfall entry,
// Meal config (saveCfg — moved from ADMIN block)
//
// Load order: AFTER ui.js
// Depends on (all global, loaded before this file):
//   config.js  → DB
//   utils.js   → esc(), safeHTML(), messMonthKey(), toast()
//   db.js      → saveDB(), saveGlobal(), isOnline(), noNetPopup()
//   meal.js    → messMonthMeals(), getNetMemberMeals(), getShortfallMeals(),
//               invalidateMealRateCache(), invalidateMealIndex(),
//               invalidateMemberCountsCache()
//   core.js    → isOfficeMealUser()
//   ui.js      → togRulesCfg(), closeRulesCfgPopup(), showModal()
//   home.js    → refreshHome() (called via typeof guard — async safe)
//
// Extracted: 2026-05-19
// Original inline ranges: L3381–L3498 (RULES), L2509–L2536 (saveCfg from ADMIN)
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// RULES
// ═══════════════════════════════════════════════
function initRules(){
  if(!DB.cfg) DB.cfg={insider:{def:{b:0.75,l:1.5,d:0.75},byDate:{}},outsider:{def:{b:0.75,l:1.5,d:0.75},byDate:{}}};
  ['insider','outsider'].forEach(grp=>{
    const cfg=DB.cfg[grp]||{def:{b:0.75,l:1.5,d:0.75}};
    const bv=document.getElementById('cfg-bv-'+grp);
    const lv=document.getElementById('cfg-lv-'+grp);
    const dv=document.getElementById('cfg-dv-'+grp);
    const dt=document.getElementById('cfg-date-'+grp);
    if(bv) bv.value=cfg.def.b;
    if(lv) lv.value=cfg.def.l;
    if(dv) dv.value=cfg.def.d;
    if(dt) dt.value='';
  });
  // Reset shortfall UI
  const sfSel=document.getElementById('sf-selected');
  const sfSrc=document.getElementById('sf-search');
  if(sfSel) sfSel.style.display='none';
  if(sfSrc) sfSrc.value='';
}

let _sfUser=null;
function sfSearch(){
  const q=(document.getElementById('sf-search').value||'').trim();
  const dd=document.getElementById('sf-dropdown');
  const users=DB.users.filter(u=>u.type!=='cook'&&!isOfficeMealUser(u));
  let matches;
  if(!q){ matches=users; }
  else {
    const exact=users.filter(u=>String(u.job||'').toLowerCase()===q.toLowerCase());
    const starts=users.filter(u=>String(u.job||'').toLowerCase().startsWith(q.toLowerCase())&&String(u.job||'').toLowerCase()!==q.toLowerCase());
    matches=[...exact,...starts];
  }
  if(!matches.length){
    dd.innerHTML='<div style="padding:10px;text-align:center;font-size:13px;color:var(--text-light)">কোনো সদস্য পাওয়া যায়নি</div>';
    dd.style.display='block'; return;
  }
  const mmKey=messMonthKey();
  dd.innerHTML=safeHTML(matches.slice(0,12).map(u=>{
    const netM=getNetMemberMeals(u.u,mmKey);
    const sf=getShortfallMeals(u.u,mmKey);
    const typeLabel=u.type==='inside'?'In':'Out';
    return `<div data-uname="${esc(u.u)}" data-action="sf-select" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
      <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-light));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0">${esc(u.name[0])}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:var(--text)">${esc(u.name)}</div>
        <div style="font-size:11px;color:var(--text-light)">ID: ${esc(String(u.job||'-'))} · ${typeLabel}${sf>0?' · S/F: +'+sf.toFixed(2):''}</div>
      </div>
      <div style="font-size:14px;font-weight:700;color:var(--primary)">${netM.toFixed(2)}</div>
    </div>`;
  }).join(''));
  dd.style.display='block';
  dd.onmousedown=function(e){
    const item=e.target.closest('[data-action="sf-select"]');
    if(item){ e.preventDefault(); sfSelectMember(item.getAttribute('data-uname')); }
  };
}
function sfSelectMember(uname){
  const u=DB.users.find(x=>x.u===uname); if(!u) return;
  _sfUser=u;
  const mmKey=messMonthKey();
  const actual=messMonthMeals(u.u,mmKey);
  const sf=getShortfallMeals(u.u,mmKey);
  const net=actual+sf;
  const typeLabel=u.type==='inside'?'Insider (কোয়ার্টার)':'Outside (বাইরে)';
  document.getElementById('sf-search').value='';
  document.getElementById('sf-dropdown').style.display='none';
  document.getElementById('sf-mem-avatar').textContent=u.name[0];
  document.getElementById('sf-mem-name').textContent=u.name;
  document.getElementById('sf-mem-sub').textContent='ID: '+String(u.job||u.u)+' · '+typeLabel;
  document.getElementById('sf-mem-meals').textContent=net.toFixed(2);
  document.getElementById('sf-amount').value=sf>0?sf:'';
  document.getElementById('sf-current-note').textContent=sf>0?'বর্তমান Shortfall: '+sf.toFixed(2)+' মিল · নতুন সংখ্যা দিলে replace হবে':'';
  document.getElementById('sf-selected').style.display='block';
}
function saveShortfall(){
  if(!isOnline()){ noNetPopup(); return; }
  if(!_sfUser){ toast('❌ আগে সদস্য নির্বাচন করুন'); return; }
  const amt=parseFloat(document.getElementById('sf-amount').value);
  if(isNaN(amt)||amt<0){ toast('❌ সঠিক সংখ্যা দিন'); return; }
  const mmKey=messMonthKey();
  if(!DB.shortfall) DB.shortfall={};
  if(amt===0){
    delete DB.shortfall[_sfUser.u+'_'+mmKey];
  } else {
    DB.shortfall[_sfUser.u+'_'+mmKey]=amt;
  }
  // ✅ FIX: shortfall = global data — saveGlobal() যথেষ্ট, saveDB() বাদ
  saveGlobal();
  // Update display
  const net=getNetMemberMeals(_sfUser.u,mmKey);
  document.getElementById('sf-mem-meals').textContent=net.toFixed(2);
  document.getElementById('sf-current-note').textContent=amt>0?'বর্তমান Shortfall: '+amt.toFixed(2)+' মিল':'';
  toast('✅ '+_sfUser.name+' এর Shortfall '+amt.toFixed(2)+' মিল সেভ হয়েছে!');
}
// saveRules() এবং clearRules() — নিয়মনীতি text feature বাদ দেওয়া হয়েছে।
// Firebase-এ rules node থাকলেও ব্যবহার হচ্ছে না।
// ═══════════════════════════════════════════════
// showNoticePopup(), closeNoticePopup()
// Moved to js/notice.js | Extracted: 2026-05-20
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// MEAL CONFIG SAVE — saveCfg()
// Originally in ADMIN block (L2509–L2536).
// Belongs here: called exclusively from rules screen HTML.
// ═══════════════════════════════════════════════
function saveCfg(grpKey){
  if(!isOnline()){ noNetPopup(); return; }
  const dateStr=document.getElementById('cfg-date-'+grpKey).value;
  const bv=parseFloat(document.getElementById('cfg-bv-'+grpKey).value)||0.75;
  const lv=parseFloat(document.getElementById('cfg-lv-'+grpKey).value)||1.5;
  const dv=parseFloat(document.getElementById('cfg-dv-'+grpKey).value)||0.75;
  const grp=grpKey==='outsider'?'outsider':'insider';

  // ── এই মেস মাসের জন্যই save করো — অন্য মাস অপরিবর্তিত থাকবে ──
  const mmKey = messMonthKey();
  if(!DB.cfg[mmKey]) DB.cfg[mmKey]={};
  if(!DB.cfg[mmKey][grp]) DB.cfg[mmKey][grp]={def:{b:0.75,l:1.5,d:0.75},byDate:{}};
  if(!DB.cfg[mmKey][grp].byDate) DB.cfg[mmKey][grp].byDate={};

  if(dateStr){
    DB.cfg[mmKey][grp].byDate[dateStr]={b:bv,l:lv,d:dv};
    toast('✅ '+dateStr+' ('+(grp==='insider'?'Insider':'Outsider')+') মিল মান সেট! ('+mmKey+')');
  } else {
    DB.cfg[mmKey][grp].def={b:bv,l:lv,d:dv};
    toast('✅ '+(grp==='insider'?'Insider':'Outsider')+' ডিফল্ট মিল মান সেভ! ('+mmKey+')');
  }
  invalidateMealRateCache();
  invalidateMealIndex();
  invalidateMemberCountsCache();
  saveGlobal();
  closeRulesCfgPopup();
  if(typeof refreshHome==='function') refreshHome();
}
