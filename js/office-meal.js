// ═══════════════════════════════════════════════
// OFFICE MEAL — MEPL / MPCL
// ═══════════════════════════════════════════════
const OFFICE_MEAL_USERS = ['Office MEPL','Office MPCL','mepl','mpcl'];

// isOfficeMealUser(), getOfficeMealUsers(), getOfficeMealRate() → moved to js/shared/core.js

function loadOfficeMealInfo(){
  const mmKey=document.getElementById('ofm-month').value;
  if(!mmKey){ document.getElementById('ofm-info').style.display='none'; return; }

  const rate=getOfficeMealRate(mmKey);
  document.getElementById('ofm-rate').value=rate||'';

  const ofUsers=getOfficeMealUsers();
  const infoEl=document.getElementById('ofm-info');
  const rowsEl=document.getElementById('ofm-info-rows');

  if(ofUsers.length===0){
    infoEl.style.display='block';
    rowsEl.innerHTML='<p style="color:var(--text-light);font-size:12px">ডেটাবেজে Office MEPL বা MPCL একাউন্ট পাওয়া যায়নি।</p>';
    return;
  }

  let rowsHtml='';
  let totalOfficeMeals=0;
  ofUsers.forEach(u=>{
    const meals=messMonthMeals(u.u,mmKey);
    const cost=meals*rate;
    totalOfficeMeals+=meals;
    rowsHtml+=`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span><b>${esc(u.name)}</b></span>
      <span>${meals.toFixed(2)} মিল × ৳${rate.toFixed(2)} = <b style="color:var(--primary)">৳${cost.toFixed(2)}</b></span>
    </div>`;
  });
  rowsHtml+=`<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;font-weight:700">
    <span>মোট অফিস মিল</span><span style="color:var(--primary)">${totalOfficeMeals.toFixed(2)} মিল → ৳${(totalOfficeMeals*rate).toFixed(2)}</span>
  </div>`;

  infoEl.style.display='block';
  rowsEl.innerHTML=safeHTML(rowsHtml);

  // Load notes
  renderOfficeMealNotes();
}

function saveOfficeMealRate(){
  if(!isOnline()){ noNetPopup(); return; }
  if(!isManagerOrCtrl()){ toast('❌ শুধুমাত্র ম্যানেজার বা এডমিন করতে পারবেন!'); return; }
  const mmKey=document.getElementById('ofm-month').value;
  if(!mmKey){ toast('❌ মেস মাস নির্বাচন করুন!'); return; }
  const rate=parseFloat(document.getElementById('ofm-rate').value);
  if(isNaN(rate)||rate<0){ toast('❌ সঠিক রেট দিন!'); return; }
  if(!DB.officeMealRates) DB.officeMealRates={};
  DB.officeMealRates[mmKey]=rate;
  saveMonth();
  loadOfficeMealInfo();
  toast('✅ অফিস মিল রেট সেভ হয়েছে! ৳'+rate.toFixed(2));
}

function saveOfficeMealNote(){
  if(!isManagerOrCtrl()){ toast('❌ শুধুমাত্র ম্যানেজার বা এডমিন করতে পারবেন!'); return; }
  const text=sanitizeInput(document.getElementById('ofm-note-input').value);
  if(!text||text.length<3){ toast('❌ নোট লিখুন!'); return; }
  if(!DB.officeMealNotes) DB.officeMealNotes=[];
  const _ni={id:genId(), date:tod(), text, by:CU?CU.name:'Admin'};
  DB.officeMealNotes.push(_ni);
  // ✅ FIX: saveMonth()-এ officeMealNotes নেই — individual path-এ save
  saveOfficeMealNoteItem(_ni);
  document.getElementById('ofm-note-input').value='';
  renderOfficeMealNotes();
  toast('✅ নোট সেভ হয়েছে!');
}

function deleteOfficeMealNote(id){
  showModal('নোট মুছুন','এই নোট মুছে ফেলবেন?',()=>{
    DB.officeMealNotes=DB.officeMealNotes.filter(n=>n.id!==id);
    // ✅ FIX: individual path-এ delete
    deleteOfficeMealNoteItem(id);
    renderOfficeMealNotes(); toast('✅ নোট মুছে ফেলা হয়েছে!');
  });
}

function renderOfficeMealNotes(){
  const el=document.getElementById('ofm-notes-list');
  if(!el) return;
  const notes=(DB.officeMealNotes||[]).slice().reverse();
  if(!notes.length){ el.innerHTML='<p style="font-size:12px;color:var(--text-light);text-align:center">কোনো নোট নেই</p>'; return; }
  let html='<div class="sec-title" style="font-size:13px;margin-bottom:8px">📋 নোট ইতিহাস</div>';
  notes.forEach(n=>{
    html+=`<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;font-size:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:var(--text-light)">${fmtDate(n.date)} — ${esc(n.by)}</span>
        ${isManagerOrCtrl()?`<button onclick="deleteOfficeMealNote(${n.id})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:14px">🗑️</button>`:''}
      </div>
      <div style="color:var(--text);line-height:1.5">${esc(n.text)}</div>
    </div>`;
  });
  el.innerHTML=safeHTML(html);
}

function initOfficeMealCard(){
  const el=document.getElementById('ofm-month');
  if(el){ fillMessCycleSelect(el); }
  loadOfficeMealInfo();
}

// Override getOfficeMealTotalBill — used in report
function getOfficeMealBill(mmKey){
  const rate=getOfficeMealRate(mmKey);
  if(!rate) return 0;
  return getOfficeMealUsers().reduce((s,u)=>s+messMonthMeals(u.u,mmKey)*rate, 0);
}


// ═══════════════════════════════════════════════
// OFFICE MEAL SCREEN FUNCTIONS
// ═══════════════════════════════════════════════
const OFFICE_ACCOUNTS = {
  mepl: 'Office MEPL',
  mpcl: 'Office MPCL'
};

function getOrCreateOfficeUser(key){
  const name = OFFICE_ACCOUNTS[key];
  let u = DB.users.find(x=>x.name===name||x.u===('off_'+key));
  if(!u){
    u = {u:'off_'+key, p:'', name:name, mob:'', job:'OFF-'+key.toUpperCase(),
         room:'—', role:'member', type:'outside', joined:tod(), _office:true};
    DB.users.push(u);
    // ✅ FIX: users = global data — saveMonth() নয়, saveGlobal()+saveUsers()
    saveGlobal(); saveUsers();
  }
  return u;
}

// ═══════════════════════════════════════════════
// OFFICE MEAL SCREEN — full meal-update-style
// ═══════════════════════════════════════════════
let ofmsDate = '';

function initOfficeMealScreen(){
  if(!isManagerOrCtrl()){ toast('❌ অনুমতি নেই!'); goHome(); return; }
  getOrCreateOfficeUser('mepl');
  getOrCreateOfficeUser('mpcl');
  const el = document.getElementById('ofms-month');
  if(el){ fillMessCycleSelect(el); }
  if(!ofmsDate) ofmsDate = nextDay(tod());
  const dateEl = document.getElementById('ofms-date');
  if(dateEl) dateEl.value = ofmsDate;
  document.getElementById('ofms-date-sub').textContent = fmtDate(ofmsDate);
  loadOfficeMealScreen();
  renderOfficeMealNotesScreen(); // নোট ইতিহাস দেখাও
}

function ofmsShiftDate(delta){
  const d = new Date(ofmsDate); d.setDate(d.getDate()+delta);
  ofmsDate = toISODate(d);
  document.getElementById('ofms-date').value = ofmsDate;
  document.getElementById('ofms-date-sub').textContent = fmtDate(ofmsDate);
  ['mepl','mpcl'].forEach(key => {
    const entry = document.getElementById('ofms-'+key+'-entry');
    if(entry && entry.style.display !== 'none') ofmsPrefill(key);
    ['b','l','d'].forEach(t => {
      const cfgEl = document.getElementById('ofms-cfg-'+key+'-'+t);
      if(cfgEl) cfgEl.textContent = 'মিল মান: '+getCfg(t, ofmsDate, 'inside');
      ofmsCalcMeal(key, t);
    });
  });
}

function ofmsLoadDate(){
  ofmsDate = document.getElementById('ofms-date').value || tod();
  document.getElementById('ofms-date-sub').textContent = fmtDate(ofmsDate);
  ['mepl','mpcl'].forEach(key => {
    const entry = document.getElementById('ofms-'+key+'-entry');
    if(entry && entry.style.display !== 'none') ofmsPrefill(key);
    ['b','l','d'].forEach(t => {
      const cfgEl = document.getElementById('ofms-cfg-'+key+'-'+t);
      if(cfgEl) cfgEl.textContent = 'মিল মান: '+getCfg(t, ofmsDate, 'inside');
      ofmsCalcMeal(key, t);
    });
  });
}

function ofmsPrefill(key){
  const u = getOrCreateOfficeUser(key);
  const mKey = u.u + '_' + ofmsDate;
  const m = DB.meals[mKey] || {b:{t:'off',q:1}, l:{t:'off',q:1}, d:{t:'off',q:1}};
  ['b','l','d'].forEach(t => {
    const slot = m[t] || {t:'off', q:1};
    const qty = document.getElementById('ofms-qty-'+key+'-'+t);
    if(qty){ qty.value = slot.q||1; qty.disabled = (slot.t==='off'); }
    ofmsHlPQO(key, t, slot.t||'off');
    const cfgEl = document.getElementById('ofms-cfg-'+key+'-'+t);
    if(cfgEl) cfgEl.textContent = 'মিল মান: '+getCfg(t, ofmsDate, 'inside');
    ofmsCalcMeal(key, t);
  });
}

function ofmsHlPQO(key, t, val){
  ['P','Q','off'].forEach(v => {
    const b = document.getElementById('ofms-btn-'+key+'-'+t+'-'+v);
    if(b) b.className = 'pqo-btn'+(val===v?' sel'+v:'');
  });
}

function ofmsGetSel(key, t){
  for(const v of ['P','Q','off']){
    const b = document.getElementById('ofms-btn-'+key+'-'+t+'-'+v);
    if(b && b.className.includes('sel'+v)) return v;
  }
  return 'off';
}

function ofmsSetPQO(key, t, val){
  ofmsHlPQO(key, t, val);
  const qi = document.getElementById('ofms-qty-'+key+'-'+t);
  if(qi){ qi.disabled=(val==='off'); if(val==='off') qi.value=1; }
  ofmsCalcMeal(key, t);
}

function ofmsCalcMeal(key, t){
  const calcEl = document.getElementById('ofms-calc-'+key+'-'+t);
  if(!calcEl) return;
  const sel = ofmsGetSel(key, t);
  const qty = parseInt(document.getElementById('ofms-qty-'+key+'-'+t)?.value)||1;
  const base = getCfg(t, ofmsDate||tod(), 'inside');
  if(sel==='off'){ calcEl.textContent='বন্ধ'; return; }
  const total = qty*base;
  const tag = qty>1?sel+qty:sel;
  calcEl.textContent = tag+' = '+qty+'×'+base+' = '+total.toFixed(2)+' মিল';
}

function toggleOfficeMealEntry(key){
  const el = document.getElementById('ofms-'+key+'-entry');
  const btn = document.getElementById('ofms-'+key+'-toggle');
  const show = el.style.display==='none';
  el.style.display = show?'block':'none';
  if(btn) btn.style.display = show?'none':'block';
  if(show){
    ofmsPrefill(key);
    const noteEl = document.getElementById('ofms-'+key+'-note');
    if(noteEl) noteEl.value='';
  }
}

function loadOfficeMealScreen(){
  const mmKey = document.getElementById('ofms-month')?.value || messMonthKey();
  const rate = getOfficeMealRate(mmKey);
  const rateEl = document.getElementById('ofms-rate');
  if(rateEl) rateEl.value = rate||'';
  if(!ofmsDate) ofmsDate = nextDay(tod());
  const dateEl = document.getElementById('ofms-date');
  if(dateEl) dateEl.value = ofmsDate;
  const subEl = document.getElementById('ofms-date-sub');
  if(subEl) subEl.textContent = fmtDate(ofmsDate);
  ['mepl','mpcl'].forEach(key=>{
    const u = getOrCreateOfficeUser(key);
    const meals = messMonthMeals(u.u, mmKey);
    const cost = meals*(rate||0);
    const tmEl = document.getElementById('ofms-'+key+'-total-meals');
    const tbEl = document.getElementById('ofms-'+key+'-total-bill');
    if(tmEl) tmEl.textContent = meals.toFixed(2);
    if(tbEl) tbEl.textContent = '৳'+cost.toFixed(2);
  });
  renderOfficeMealNotesScreen();
}

function saveOfficeMealRateScreen(){
  if(!isOnline()){ noNetPopup(); return; }
  const mmKey = document.getElementById('ofms-month')?.value;
  if(!mmKey){ toast('❌ মাস নির্বাচন করুন!'); return; }
  const rate = parseFloat(document.getElementById('ofms-rate').value);
  if(isNaN(rate)||rate<0){ toast('❌ সঠিক রেট দিন!'); return; }
  if(!DB.officeMealRates) DB.officeMealRates={};
  DB.officeMealRates[mmKey] = rate;
  saveMonth(); loadOfficeMealScreen();
  toast('✅ অফিস মিল রেট সেভ: ৳'+rate.toFixed(2));
}

function saveOfficeMeal(key){
  if(!isOnline()){ noNetPopup(); return; }
  if(!isManagerOrCtrl()){ toast('❌ অনুমতি নেই!'); return; }
  const u = getOrCreateOfficeUser(key);
  const date = ofmsDate||tod();
  const bT=ofmsGetSel(key,'b'), lT=ofmsGetSel(key,'l'), dT=ofmsGetSel(key,'d');
  const bQ=parseInt(document.getElementById('ofms-qty-'+key+'-b')?.value)||1;
  const lQ=parseInt(document.getElementById('ofms-qty-'+key+'-l')?.value)||1;
  const dQ=parseInt(document.getElementById('ofms-qty-'+key+'-d')?.value)||1;
  // ✅ FIX: mealTypeValue() নামে কোনো function-ই নেই — সঠিক নাম mTV(), আর তার
  // signature আলাদা (t, {t,q} অবজেক্ট, date, type)। ভুল নামে call করায়
  // "mealTypeValue is not defined" error থ্রো হতো এখানেই — showModal() পর্যন্ত
  // কোড কখনো পৌঁছাতই না, তাই কনফারমেশন পপআপ আসত না। P/Q বাটন আগেই আলাদাভাবে
  // হাইলাইট হয়ে গিয়েছিল (ofmsSetPQO) বলে মিল "চালু" হয়ে গেছে মনে হতো, কিন্তু
  // Save আসলে silently crash করত — Firebase-এ কিছুই সেভ হতো না।
  // 'inside' রাখা হয়েছে যেন ঠিক উপরের ofmsCalcMeal()-এর live preview-এর
  // সাথে সংখ্যা মিলে যায় (সেটাও 'inside' দিয়েই হিসাব করে)।
  const bv=mTV('b',{t:bT,q:bQ},date,'inside'), lv=mTV('l',{t:lT,q:lQ},date,'inside'), dv=mTV('d',{t:dT,q:dQ},date,'inside');
  const bLabel=bT==='off'?'off':(bQ>1?bT+bQ:bT);
  const lLabel=lT==='off'?'off':(lQ>1?lT+lQ:lT);
  const dLabel=dT==='off'?'off':(dQ>1?dT+dQ:dT);
  const note=sanitizeInput(document.getElementById('ofms-'+key+'-note')?.value||'');
  showModal('মিল সেভ করুন',
    date+' — '+OFFICE_ACCOUNTS[key]+'\n\n☀️ সকাল: '+bLabel+' = '+bv.toFixed(2)+' meals\n🌞 দুপুর: '+lLabel+' = '+lv.toFixed(2)+' meals\n🌙 রাত: '+dLabel+' = '+dv.toFixed(2)+' meals\n\nমোট: '+(bv+lv+dv).toFixed(2)+' meals',
    function(){
      const _mKey=u.u+'_'+date;
      const _mVal={b:{t:bT,q:bQ},l:{t:lT,q:lQ},d:{t:dT,q:dQ}};
      DB.meals[_mKey]=_mVal;
      // ✅ FIX: surgical meal save — saveMonth() meals object overwrite করত
      saveMealEntry(_mKey, _mVal);
      if(note){
        if(!DB.officeMealNotes) DB.officeMealNotes=[];
        const _ni={id:genId(),date,text:OFFICE_ACCOUNTS[key]+': '+note,by:CU?CU.name:'Admin'};
        DB.officeMealNotes.push(_ni);
        // ✅ FIX: individual note save — saveMonth()-এ officeMealNotes নেই
        saveOfficeMealNoteItem(_ni);
      }
      toggleOfficeMealEntry(key); loadOfficeMealScreen();
      toast('✅ '+OFFICE_ACCOUNTS[key]+' মিল সেভ! ('+date+')');
    }
  );
}

function saveOfficeMealNoteScreen(){
  const noteInput = document.getElementById('ofms-note-input');
  const text = sanitizeInput(noteInput?.value||'');
  if(!text||text.length<2){ toast('❌ নোট লিখুন!'); return; }
  if(!DB.officeMealNotes) DB.officeMealNotes=[];
  const _ni={id:genId(), date:tod(), text, by:CU?CU.name:'Admin'};
  DB.officeMealNotes.push(_ni);
  // ✅ FIX: individual note save
  saveOfficeMealNoteItem(_ni);
  if(noteInput) noteInput.value='';
  renderOfficeMealNotesScreen();
  toast('✅ নোট সেভ হয়েছে!');
}

function renderOfficeMealNotesScreen(){
  const el = document.getElementById('ofms-notes-history');
  if(!el) return;
  const sel = document.getElementById('ofms-note-month-sel');
  const _prevValNotes = sel ? sel.value : '';
  // addBlank=true → auto-select হবে না, placeholder দেখাবে
  if(sel) fillMessCycleSelect(sel, 12, true);
  if(sel && _prevValNotes) sel.value = _prevValNotes;
  const mmKey = sel ? sel.value : '';
  if(!mmKey){
    el.innerHTML='<p class="muted tc" style="padding:20px 0;font-size:13px">📅 উপরের dropdown থেকে মাস সিলেক্ট করুন</p>';
    el.onclick=null; return;
  }

  const isCurrent = mmKey === messMonthKey();
  const canDel = isManagerOrCtrl() && isCurrent;

  const notes = (DB.officeMealNotes||[])
    .filter(n => messMonthKey(new Date(n.date)) === mmKey)
    .sort((a,b) => b.id - a.id);

  if(!notes.length){
    el.innerHTML = '<p class="muted tc" style="padding:20px 0">এই মাসে কোনো নোট নেই</p>';
    el.onclick = null;
    return;
  }

  let h = '';
  notes.forEach(n=>{
    const btns = canDel ? `
      <div style="display:flex;align-items:center;gap:6px">
        <button data-action="edit-note" data-id="${n.id}" style="background:rgba(26,107,60,.12);border:1px solid var(--primary);color:var(--primary);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer">✏️</button>
        <button data-action="del-note" data-id="${n.id}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:18px;padding:0 2px">🗑️</button>
      </div>` : '';
    h += `<div class="bazar-item">
      <div>
        <div class="bz-name">${esc(n.text)}</div>
        <div class="bz-meta">${fmtDate(n.date)} · ${esc(n.by)}</div>
      </div>
      ${btns}
    </div>`;
  });
  el.innerHTML = safeHTML(h);
  el.onclick = function(e){
    const btn = e.target.closest('button[data-action]');
    if(!btn) return;
    const id = Number(btn.getAttribute('data-id'));
    if(btn.getAttribute('data-action')==='del-note') delOfficeMealNote(id);
    else if(btn.getAttribute('data-action')==='edit-note') editOfficeMealNote(id);
  };
}

function delOfficeMealNote(id){
  if(!isManagerOrCtrl()){ toast('❌ অনুমতি নেই!'); return; }
  showModal('নোট মুছুন','এই নোট মুছে ফেলবেন?',()=>{
    DB.officeMealNotes = (DB.officeMealNotes||[]).filter(n=>n.id!==id);
    // ✅ FIX: individual delete
    deleteOfficeMealNoteItem(id);
    renderOfficeMealNotesScreen();
    toast('🗑️ নোট মুছে ফেলা হয়েছে');
  });
}

function editOfficeMealNote(id){
  if(!isManagerOrCtrl()){ toast('❌ অনুমতি নেই!'); return; }
  const n = (DB.officeMealNotes||[]).find(x=>x.id===id);
  if(!n) return;
  const html=`<div style="padding-top:4px">
    <label style="font-size:12px;font-weight:600;color:var(--text-light)">নোট</label>
    <textarea id="edit-ofms-note" class="form-input" rows="3" style="margin-top:4px;resize:none"></textarea>
  </div>`;
  showModal('নোট সম্পাদনা', html, ()=>{
    const text = sanitizeInput(document.getElementById('edit-ofms-note').value);
    if(!text||text.length<2){ toast('❌ নোট লিখুন!'); return; }
    n.text = text;
    // ✅ FIX: individual update (set overwrites the path)
    saveOfficeMealNoteItem(n);
    renderOfficeMealNotesScreen();
    closeModal();
    toast('✅ নোট আপডেট হয়েছে!');
  }, true);
  // Modal render হওয়ার পরে value set করো
  setTimeout(()=>{
    const ta = document.getElementById('edit-ofms-note');
    if(ta) ta.value = n.text;
  }, 50);
}

