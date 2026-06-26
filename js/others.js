// ═══════════════════════════════════════════════
// OTHERS EXPENSE — js/others.js
// Extracted from inline script (lines 1809–1905)
// No import/export — classic global script architecture
// Load order: after config.js, utils.js, core.js, db.js,
//             auth.js, ui.js, bazar.js
// ═══════════════════════════════════════════════

function initOthers(){
  const mgr2=isManagerOrCtrl();
  if(!document.getElementById('oth-date').value) document.getElementById('oth-date').value=tod();
  applyMessCycleBounds('oth-date');
  document.getElementById('others-form-wrap').style.display=mgr2?'block':'none';
  document.getElementById('others-readonly-notice').style.display='none';
  document.getElementById('others-header-sub').textContent=mgr2?'Others Expense':'ইতিহাস দেখুন';
  const sel=document.getElementById('oth-month-sel');
  const _prevOth = sel ? sel.value : '';
  fillHistorySelect(sel);
  if(sel) sel.value = _prevOth || '';
  renderOthers();
}
function switchOthTab(tab){ /* বাবুর্চি বিল tab সরানো হয়েছে */ }
function addOther(){
  if(!isOnline()){ noNetPopup(); return; }
  const descEl=document.getElementById('oth-desc');
  const desc=sanitizeInput(descEl.value);
  const amount=parseFloat(document.getElementById('oth-amt').value);
  const date=V('oth-date');
  const split=document.getElementById('oth-split').value||'equal';
  if(!desc||desc.length<2){ toast('❌ বিবরণ দিন!'); return; }
  if(!validAmount(amount)){ toast('❌ সঠিক পরিমাণ দিন!'); return; }
  if(!date){ toast('❌ তারিখ দিন!'); return; }
  const _othi={id:genId(),desc,amount,date,by:CU.name,split};
  DB.others.push(_othi);
  saveOtherItem(_othi);
  const selO=document.getElementById('oth-month-sel');
  if(selO) selO.value=currentMonthKey;
  renderOthers();
  document.getElementById('oth-amt').value='';
  descEl.value='';
  toast('✅ খরচ যোগ হয়েছে!');
}
function renderOthers(){
  const sel=document.getElementById('oth-month-sel');
  const m=sel&&sel.value;
  const list=document.getElementById('oth-list');
  const totalEl=document.getElementById('oth-total');
  if(!m){
    if(list) list.innerHTML='<p class="muted tc" style="padding:20px 0;font-size:13px">📅 উপরের dropdown থেকে মাস সিলেক্ট করুন</p>';
    if(totalEl) totalEl.textContent='৳ ০';
    return;
  }
  applyMessCycleBounds('oth-date', m);
  _withMonthData(m, list, ()=>{
    const items=DB.others.filter(o=>dateInMessMonth(o.date,m)).sort((a,b)=>b.date.localeCompare(a.date));
    if(!items.length){ list.innerHTML='<p class="muted tc">কোনো এন্ট্রি নেই</p>'; if(totalEl) totalEl.textContent='৳ ০'; return; }
    let total=0;
    const canEdit=isManagerOrCtrl()&&!_histViewMode;
    const splitLabel=(s)=>s==='outside50'?'<span style="font-size:10px;background:rgba(21,101,192,.12);color:var(--info);border-radius:4px;padding:1px 6px;margin-left:4px">Outside 50%</span>':'<span style="font-size:10px;background:rgba(26,107,60,.1);color:var(--primary);border-radius:4px;padding:1px 6px;margin-left:4px">সমান</span>';
    list.innerHTML = safeHTML(items.map(o=>{
      total+=o.amount;
      const btns=canEdit?`
        <button data-action="edit-other" data-id="${o.id}" style="background:rgba(26,107,60,.12);border:1px solid var(--primary);color:var(--primary);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;">✏️</button>
        <button data-action="del-other" data-id="${o.id}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:18px;padding:0 2px;">🗑️</button>`:'';
      return`<div class="bazar-item"><div style="flex:1"><div class="bz-name">${esc(o.desc)}${splitLabel(o.split||'equal')}</div><div class="bz-meta">${fmtDate(o.date)} · ${esc(o.by)}</div></div><div style="display:flex;align-items:center;gap:6px"><div class="bz-amt" style="color:var(--info)">৳ ${o.amount.toLocaleString()}</div>${btns}</div></div>`;
    }).join(''));
    if(totalEl) totalEl.textContent='৳ '+total.toLocaleString();
    list.onclick = function(e){
      const btn = e.target.closest('button[data-action]');
      if(!btn) return;
      const id = Number(btn.getAttribute('data-id'));
      if(btn.getAttribute('data-action')==='del-other') delOther(id);
      else if(btn.getAttribute('data-action')==='edit-other') editOther(id);
    };
  });
}
function delOther(id){
  showModal('খরচ মুছুন','এই এন্ট্রি মুছে ফেলবেন?',()=>{ DB.others=DB.others.filter(o=>o.id!==id); deleteOtherItem(id); renderOthers(); toast('✅ মুছে ফেলা হয়েছে!'); });
}
function editOther(id){
  const o=DB.others.find(x=>x.id===id); if(!o) return;
  // ✅ FIX BUG-03: bazar-এর মতোই — item-এর mess month bounds enforce করো।
  // Bug: Date অন্য mess month-এ দিলে entry কোনো month-এই দেখা যেত না।
  const itemMmKey=messMonthKey(new Date(o.date+'T12:00:00'));
  const {minDate,maxDate}=getMessCycleBounds(itemMmKey);
  const html=`<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">বিবরণ</label>
    <input id="edit-oth-desc" class="form-input" value="${esc(o.desc)}" style="margin-top:4px"></div>
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">পরিমাণ ৳</label>
    <input id="edit-oth-amt" type="number" class="form-input" value="${o.amount}" style="margin-top:4px"></div>
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">তারিখ</label>
    <input id="edit-oth-date" type="date" class="form-input" value="${esc(o.date)}" min="${minDate}" max="${maxDate}" style="margin-top:4px"></div>
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">ভাগের ধরন</label>
    <select id="edit-oth-split" class="form-input" style="margin-top:4px">
      <option value="equal" ${(o.split||'equal')==='equal'?'selected':''}>সমান ভাগ</option>
      <option value="outside50" ${o.split==='outside50'?'selected':''}>Outside 50%</option>
    </select></div>
  </div>`;
  showModal('অন্যান্য খরচ সম্পাদনা', html, ()=>{
    const desc=sanitizeInput(document.getElementById('edit-oth-desc').value);
    const amount=parseFloat(document.getElementById('edit-oth-amt').value);
    const date=document.getElementById('edit-oth-date').value;
    const split=document.getElementById('edit-oth-split').value;
    if(!desc||desc.length<2){ toast('❌ বিবরণ দিন!'); return; }
    if(!validAmount(amount)){ toast('❌ সঠিক পরিমাণ দিন!'); return; }
    if(!date){ toast('❌ তারিখ দিন!'); return; }
    // ✅ server-side validation
    if(date<minDate||date>maxDate){ toast('❌ তারিখ এই মেস মাসের বাইরে দেওয়া যাবে না!'); return; }
    o.desc=desc; o.amount=amount; o.date=date; o.split=split;
    saveOtherItem(o); renderOthers(); closeModal(); toast('✅ আপডেট হয়েছে!');
  }, true);
}
// বাবুর্চি বিল entry সরানো হয়েছে — ওরা বাজারের সাথেই খায়, আলাদা বিল নেই
function addCookBill(){ toast('বাবুর্চির আলাদা বিল নেই।'); }
function renderCookBills(){ /* deprecated */ }
function delCookBill(id){ /* deprecated */ }
function editCookBill(id){ /* deprecated */ }
