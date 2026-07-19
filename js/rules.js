// ═══════════════════════════════════════════════
// js/rules.js
// Rules screen, Shortfall entry, Feast Meal entry,
// Meal config (saveCfg — moved from ADMIN block)
//
// Load order: AFTER ui.js
// Depends on (all global, loaded before this file):
//   config.js  → DB (DB.feastMeals)
//   utils.js   → esc(), safeHTML(), messMonthKey(), toast(), tod(),
//               dateInMessMonth(), validAmount()
//   db.js      → saveDB(), saveGlobal(), isOnline(), noNetPopup(),
//               genId(), saveFeastItem(), deleteFeastItem()
//   meal.js    → messMonthMeals(), getNetMemberMeals(), getShortfallMeals(),
//               invalidateMealRateCache(), invalidateMealIndex(),
//               invalidateMemberCountsCache()
//   core.js    → isOfficeMealUser(), fmtDate()
//   ui.js      → togRulesCfg(), closeRulesCfgPopup(), showModal(), closeModal()
//   home.js    → refreshHome() (called via typeof guard — async safe)
//   inline     → V(), applyMessCycleBounds(), getMessCycleBounds()
//
// Extracted: 2026-05-19
// Original inline ranges: L3381–L3498 (RULES), L2509–L2536 (saveCfg from ADMIN)
// Feast Meal added: 2026-07
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
  initFeast();
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

// ═══════════════════════════════════════════════
// FEAST MEAL (ফিস্ট মিল) — Entry + History
// চলতি মেস মাসের এন্ট্রি — others.js এর add/render/edit/delete প্যাটার্ন
// অনুসরণ করে। মাসিক রিপোর্ট/PDF স্ক্রিনে পুরনো মাসের এন্ট্রি দেখা যাবে,
// এখানে শুধু চলতি মাস এডিটযোগ্য (shortfall entry-র মতোই)।
// ═══════════════════════════════════════════════
function initFeast(){
  const dateEl=document.getElementById('feast-date');
  if(dateEl && !dateEl.value) dateEl.value=tod();
  applyMessCycleBounds('feast-date');
  updateDateLabel('feast-date');
  const amtEl=document.getElementById('feast-amt');
  if(amtEl) amtEl.value='';
  renderFeast();
}
function _feastSlotLabel(slot){ return slot==='b'?'🌄 সকাল':slot==='l'?'☀️ দুপুর':'🌙 রাত'; }
function addFeast(){
  if(!isOnline()){ noNetPopup(); return; }
  const date=V('feast-date');
  const slotEl=document.getElementById('feast-slot');
  const slot=slotEl?slotEl.value:'';
  const amount=parseFloat(document.getElementById('feast-amt').value);
  if(!date){ toast('❌ তারিখ দিন!'); return; }
  if(!['b','l','d'].includes(slot)){ toast('❌ বেলা নির্বাচন করুন!'); return; }
  if(!validAmount(amount)){ toast('❌ খরচের সঠিক পরিমাণ দিন!'); return; }
  const _fmi={id:genId(), date, slot, amount, by:CU.name};
  if(!DB.feastMeals) DB.feastMeals=[];
  DB.feastMeals.push(_fmi);
  saveFeastItem(_fmi);
  invalidateMealRateCache();
  document.getElementById('feast-amt').value='';
  renderFeast();
  toast('✅ Feast Meal Expense Entry Done');
  if(typeof refreshHome==='function') refreshHome();
}
function renderFeast(){
  const mmKey=messMonthKey();
  const list=document.getElementById('feast-list');
  const totalEl=document.getElementById('feast-total');
  if(!list) return;
  const items=(DB.feastMeals||[]).filter(f=>dateInMessMonth(f.date,mmKey)).sort((a,b)=>b.date.localeCompare(a.date));
  if(!items.length){
    list.innerHTML='<p class="muted tc">কোনো এন্ট্রি নেই</p>';
    if(totalEl) totalEl.textContent='৳ ০';
    return;
  }
  let total=0;
  list.innerHTML = safeHTML(items.map(f=>{
    total+=f.amount;
    return `<div class="bazar-item"><div style="flex:1"><div class="bz-name">🎉 ${_feastSlotLabel(f.slot)}</div><div class="bz-meta">${fmtDate(f.date)} · ${esc(f.by)}</div></div><div style="display:flex;align-items:center;gap:6px"><div class="bz-amt">৳ ${f.amount.toLocaleString()}</div><button data-action="edit-feast" data-id="${f.id}" style="background:rgba(26,107,60,.12);border:1px solid var(--primary);color:var(--primary);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;">✏️</button><button data-action="del-feast" data-id="${f.id}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:18px;padding:0 2px;">🗑️</button></div></div>`;
  }).join(''));
  if(totalEl) totalEl.textContent='৳ '+total.toLocaleString();
  list.onclick = function(e){
    const btn = e.target.closest('button[data-action]');
    if(!btn) return;
    const id = Number(btn.getAttribute('data-id'));
    if(btn.getAttribute('data-action')==='del-feast') delFeast(id);
    else if(btn.getAttribute('data-action')==='edit-feast') editFeast(id);
  };
}
function delFeast(id){
  showModal('Feast Meal Expense Delete','এই এন্ট্রি মুছে ফেলবেন?',()=>{
    DB.feastMeals=DB.feastMeals.filter(f=>f.id!==id);
    deleteFeastItem(id);
    invalidateMealRateCache();
    renderFeast();
    toast('✅ মুছে ফেলা হয়েছে!');
    if(typeof refreshHome==='function') refreshHome();
  });
}
function editFeast(id){
  const f=DB.feastMeals.find(x=>x.id===id); if(!f) return;
  const itemMmKey=messMonthKey(new Date(f.date+'T12:00:00'));
  const {minDate,maxDate}=getMessCycleBounds(itemMmKey);
  const html=`<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">তারিখ</label>
    <input id="edit-feast-date" type="date" class="form-input" value="${esc(f.date)}" min="${minDate}" max="${maxDate}" style="margin-top:4px"></div>
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">বেলা</label>
    <select id="edit-feast-slot" class="form-input" style="margin-top:4px">
      <option value="b" ${f.slot==='b'?'selected':''}>সকাল</option>
      <option value="l" ${f.slot==='l'?'selected':''}>দুপুর</option>
      <option value="d" ${f.slot==='d'?'selected':''}>রাত</option>
    </select></div>
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">পরিমাণ ৳</label>
    <input id="edit-feast-amt" type="number" class="form-input" value="${f.amount}" style="margin-top:4px"></div>
  </div>`;
  showModal('Feast Meal Expense Edit', html, ()=>{
    const date=document.getElementById('edit-feast-date').value;
    const slot=document.getElementById('edit-feast-slot').value;
    const amount=parseFloat(document.getElementById('edit-feast-amt').value);
    if(!date){ toast('❌ তারিখ দিন!'); return; }
    if(!['b','l','d'].includes(slot)){ toast('❌ বেলা নির্বাচন করুন!'); return; }
    if(!validAmount(amount)){ toast('❌ সঠিক পরিমাণ দিন!'); return; }
    if(date<minDate||date>maxDate){ toast('❌ তারিখ এই মেস মাসের বাইরে দেওয়া যাবে না!'); return; }
    f.date=date; f.slot=slot; f.amount=amount;
    saveFeastItem(f);
    invalidateMealRateCache();
    renderFeast();
    closeModal();
    toast('✅ আপডেট হয়েছে!');
    if(typeof refreshHome==='function') refreshHome();
  }, true);
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
  // ✅ FIX: আগে parseFloat(...)||default ব্যবহার হতো। ইনপুটে 0 দিলে সেটা
  // JS-এ falsy বলে "0 || 0.75" আসলে 0.75 হয়ে যেত — তাই কোনো বেলাকে 0
  // করা যাচ্ছিল না। এখন শুধু ফাঁকা/অসংখ্যা ইনপুটেই default বসবে, বৈধ 0
  // ইনপুট 0 হিসেবেই সেভ হবে।
  const bvRaw=parseFloat(document.getElementById('cfg-bv-'+grpKey).value);
  const lvRaw=parseFloat(document.getElementById('cfg-lv-'+grpKey).value);
  const dvRaw=parseFloat(document.getElementById('cfg-dv-'+grpKey).value);
  const bv=isNaN(bvRaw)?0.75:bvRaw;
  const lv=isNaN(lvRaw)?1.5:lvRaw;
  const dv=isNaN(dvRaw)?0.75:dvRaw;
  if(bv<0||lv<0||dv<0){ toast('❌ ঋণাত্মক মান দেওয়া যাবে না!'); return; }
  const grp=grpKey==='outsider'?'outsider':'insider';

  // ✅ FIX: তারিখ দেওয়া থাকলে সেই তারিখ যে মেস মাসে পড়ে সেই mmKey ব্যবহার করো
  // (আগে সবসময় আজকের মেস মাসেই সেভ হতো — মাস-বাউন্ডারির (১১ তারিখ) আশেপাশে
  // অন্য মেস মাসের কোনো তারিখে মান সেট করলে getCfg() সঠিক mmKey-তে খুঁজে
  // সেটা আর পেত না)। তারিখ ফাঁকা থাকলে (ডিফল্ট সেভ) আজকের মেস মাসই ব্যবহার হবে।
  const mmKey = dateStr ? messMonthKey(new Date(dateStr)) : messMonthKey();
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

// ═══════════════════════════════════════════════
// MEAL CONFIG — LOAD ON DATE PICK — loadCfgForDate()
// ✅ FIX: এই ফাংশনটাই ছিল না, তাই তারিখ ফিল্ডে কোনো তারিখ বেছে নিলে
// (বা আগে সেভ করা কোনো তারিখ আবার সিলেক্ট করলে) ইনপুট বক্সে আগের/ডিফল্ট
// মানই থেকে যেত — byDate-এ যা আসলে সেভ আছে তা কখনো লোড হতো না।
// তারিখ ফাঁকা করলে ডিফল্ট মান ফিরে আসবে (initRules()-এর সোর্সের সাথে
// সামঞ্জস্যপূর্ণ)। তারিখ দিলে getCfg() (meal.js)-এর মতোই fallback চেইন
// অনুসরণ করে সেই তারিখে প্রযোজ্য মান দেখাবে: এই মেস মাসের byDate → এই
// মাসের def → আগের মাসের def → পুরনো flat ফরম্যাট → hardcoded default।
// ═══════════════════════════════════════════════
function _resolveCfgValue(grp,t,dateStr,mmKey){
  const mmCfg = DB.cfg[mmKey] && DB.cfg[mmKey][grp];
  if(mmCfg){
    if(mmCfg.byDate && mmCfg.byDate[dateStr] && mmCfg.byDate[dateStr][t]!==undefined)
      return mmCfg.byDate[dateStr][t];
    if(mmCfg.def && mmCfg.def[t]!=null) return mmCfg.def[t];
  }
  if(DB.handoverDone && DB.handoverDone.length>0){
    const prevMonths=[...DB.handoverDone].sort().reverse().filter(ho=>ho<mmKey);
    for(const pm of prevMonths){
      const pmCfg=DB.cfg[pm] && DB.cfg[pm][grp];
      if(pmCfg && pmCfg.def && pmCfg.def[t]!=null) return pmCfg.def[t];
    }
  }
  const flatGrp = !mmCfg && DB.cfg[grp];
  if(flatGrp){
    if(flatGrp.byDate && flatGrp.byDate[dateStr] && flatGrp.byDate[dateStr][t]!==undefined)
      return flatGrp.byDate[dateStr][t];
    if(flatGrp.def && flatGrp.def[t]!=null) return flatGrp.def[t];
  }
  return t==='l' ? 1.5 : 0.75;
}
function loadCfgForDate(grpKey){
  const grp=grpKey==='outsider'?'outsider':'insider';
  const dateStr=document.getElementById('cfg-date-'+grpKey).value;
  const bv=document.getElementById('cfg-bv-'+grpKey);
  const lv=document.getElementById('cfg-lv-'+grpKey);
  const dv=document.getElementById('cfg-dv-'+grpKey);
  if(!dateStr){
    const cfg=DB.cfg[grp]||{def:{b:0.75,l:1.5,d:0.75}};
    if(bv) bv.value=cfg.def.b;
    if(lv) lv.value=cfg.def.l;
    if(dv) dv.value=cfg.def.d;
    return;
  }
  const mmKey=messMonthKey(new Date(dateStr));
  if(bv) bv.value=_resolveCfgValue(grp,'b',dateStr,mmKey);
  if(lv) lv.value=_resolveCfgValue(grp,'l',dateStr,mmKey);
  if(dv) dv.value=_resolveCfgValue(grp,'d',dateStr,mmKey);
}
