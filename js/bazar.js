// ═══════════════════════════════════════════════
// BAZAR
// ═══════════════════════════════════════════════
// ── Mess cycle date bounds for input[type="date"] min/max ──
function getMessCycleBounds(mmKey, extendToNext){
  const k = mmKey || messMonthKey();
  const [y,m] = k.split('-').map(Number);
  const nm = m===12?1:m+1, ny = m===12?y+1:y;
  const minDate = y+'-'+String(m).padStart(2,'0')+'-11';
  let maxDate;
  if(extendToNext){
    // ✅ পরবর্তী মেস মাসের শেষ পর্যন্ত — যেন user আগাম meal দিতে পারে।
    // e.g. current=2026-05 (May11–Jun10) → extendToNext → max=2026-07-10
    const nnm = nm===12?1:nm+1, nny = nm===12?ny+1:ny;
    maxDate = nny+'-'+String(nnm).padStart(2,'0')+'-10';
  } else {
    maxDate = ny+'-'+String(nm).padStart(2,'0')+'-10';
  }
  return {minDate, maxDate};
}
function applyMessCycleBounds(inputId, mmKey, extendToNext){
  const el = document.getElementById(inputId);
  if(!el) return;
  const {minDate, maxDate} = getMessCycleBounds(mmKey, extendToNext);
  el.min = minDate;
  el.max = maxDate;
  // Clamp value if outside bounds
  if(el.value && (el.value < minDate || el.value > maxDate)){
    el.value = '';
  }
  updateDateLabel(inputId);
}

// ── Custom date label: shows DD-MM-YYYY over native date input ──
function updateDateLabel(inputId){
  const inp = document.getElementById(inputId);
  const lbl = document.getElementById(inputId+'-lbl');
  if(!inp || !lbl) return;
  if(inp.value){
    lbl.textContent = fmtDate(inp.value);
    lbl.style.display = 'block';
  } else {
    lbl.textContent = '-- তারিখ --';
    lbl.style.display = 'block';
  }
}
function initDateLabels(){
  ['meal-date','dep-date','bz-date','oth-date','adm-dt'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && el.value) updateDateLabel(id);
  });
}

function initBazar(){
  const sel=document.getElementById('bz-month-sel');
  const _prevBz = sel ? sel.value : '';
  fillHistorySelect(sel);
  if(sel) sel.value = _prevBz || ''; // auto-select বন্ধ
  if(!document.getElementById('bz-date').value) document.getElementById('bz-date').value=tod();
  applyMessCycleBounds('bz-date', sel ? sel.value : null);
  const mgr=isManagerOrCtrl();
  document.getElementById('bazar-form-wrap').style.display=mgr?'block':'none';
  document.getElementById('bazar-readonly-notice').style.display='none';
  document.getElementById('bazar-header-sub').textContent=mgr?'Bazar Entry':'ইতিহাস দেখুন';
  renderBazar();
}
function addBazar(){
  if(!isOnline()){ noNetPopup(); return; }
  const descEl=document.getElementById('bz-desc');
  const desc=sanitizeInput(descEl.value);
  const amount=parseFloat(document.getElementById('bz-amt').value);
  const date=V('bz-date');
  if(!desc||desc.length<2){ toast('❌ বিবরণ দিন!'); return; }
  if(!validAmount(amount)){ toast('❌ সঠিক পরিমাণ দিন!'); return; }
  if(!date){ toast('❌ তারিখ দিন!'); return; }
  // ✅ FIX: Date.now() → genId()
  // Bug: Date.now() ব্যবহার করলে একই millisecond-এ দুজন আলাদা ব্রাউজার
  // থেকে বাজার add করলে same ID হয় → একটি overwrite হয়ে হারিয়ে যায়।
  // genId() = Date.now()*10000 + random(0–9999) → collision practically impossible।
  const _bzi={id:genId(),desc,amount,date,by:CU.name};
  DB.bazar.push(_bzi);
  saveBazarItem(_bzi);
  // entry যোগের পর current month দেখাও
  const sel=document.getElementById('bz-month-sel');
  if(sel) sel.value=currentMonthKey;
  renderBazar();
  descEl.value='';
  document.getElementById('bz-amt').value='';
  toast('✅ বাজার যোগ হয়েছে!');
}
function renderBazar(){
  const m=document.getElementById('bz-month-sel').value;
  const list=document.getElementById('bz-list');
  const totalEl=document.getElementById('bz-total');
  if(!m){
    if(list) list.innerHTML='<p class="muted tc" style="padding:20px 0;font-size:13px">📅 ড্রপডাউন থেকে মাস সিলেক্ট করুন</p>';
    if(totalEl) totalEl.textContent='';
    return;
  }
  applyMessCycleBounds('bz-date', m);
  _withMonthData(m, list, ()=>{
    const items=DB.bazar.filter(b=>dateInMessMonth(b.date,m)).sort((a,b)=>b.date.localeCompare(a.date));
    if(!items.length){ list.innerHTML='<p class="muted tc">কোনো এন্ট্রি নেই</p>'; if(totalEl) totalEl.textContent='৳ ০'; return; }
    let total=0;
    const canEdit=isManagerOrCtrl()&&!_histViewMode;
    list.innerHTML = safeHTML(items.map(b=>{
      total+=b.amount;
      const btns=canEdit?`
        <button data-action="edit-bazar" data-id="${b.id}" style="background:rgba(26,107,60,.12);border:1px solid var(--primary);color:var(--primary);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;">✏️</button>
        <button data-action="del-bazar" data-id="${b.id}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:18px;padding:0 2px;">🗑️</button>`:'';
      return`<div class="bazar-item"><div><div class="bz-name">${esc(b.desc)}</div><div class="bz-meta">${fmtDate(b.date)} · ${esc(b.by)}</div></div><div style="display:flex;align-items:center;gap:6px"><div class="bz-amt">৳ ${b.amount.toLocaleString()}</div>${btns}</div></div>`;
    }).join(''));
    if(totalEl) totalEl.textContent='৳ '+total.toLocaleString();
    list.onclick = function(e){
      const btn = e.target.closest('button[data-action]');
      if(!btn) return;
      const id = Number(btn.getAttribute('data-id'));
      if(btn.getAttribute('data-action')==='del-bazar') delBazar(id);
      else if(btn.getAttribute('data-action')==='edit-bazar') editBazar(id);
    };
  });
}
function delBazar(id){
  showModal('বাজার মুছুন','এই এন্ট্রি মুছে ফেলবেন?',()=>{ DB.bazar=DB.bazar.filter(b=>b.id!==id); deleteBazarItem(id); renderBazar(); toast('✅ মুছে ফেলা হয়েছে!'); });
}
function editBazar(id){
  const b=DB.bazar.find(x=>x.id===id); if(!b) return;
  // ✅ FIX BUG-03: item-এর mess month-এর bounds বের করো এবং modal-এ enforce করো।
  // Bug: edit modal-এ date input-এ কোনো min/max ছিল না।
  // Date অন্য mess month-এ দিলে: item current bucket-এ থাকে কিন্তু নতুন date-এ
  // dateInMessMonth() fail → কোনো month-এই দেখা যায় না → entry হারিয়ে যায়।
  const itemMmKey=messMonthKey(new Date(b.date+'T12:00:00'));
  const {minDate,maxDate}=getMessCycleBounds(itemMmKey);
  const html=`<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">বিবরণ</label>
    <input id="edit-bz-desc" class="form-input" value="${esc(b.desc)}" style="margin-top:4px"></div>
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">পরিমাণ ৳</label>
    <input id="edit-bz-amt" type="number" class="form-input" value="${b.amount}" style="margin-top:4px"></div>
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">তারিখ</label>
    <input id="edit-bz-date" type="date" class="form-input" value="${esc(b.date)}" min="${minDate}" max="${maxDate}" style="margin-top:4px"></div>
  </div>`;
  showModal('বাজার সম্পাদনা', html, ()=>{
    const desc=sanitizeInput(document.getElementById('edit-bz-desc').value);
    const amount=parseFloat(document.getElementById('edit-bz-amt').value);
    const date=document.getElementById('edit-bz-date').value;
    if(!desc||desc.length<2){ toast('❌ বিবরণ দিন!'); return; }
    if(!validAmount(amount)){ toast('❌ সঠিক পরিমাণ দিন!'); return; }
    if(!date){ toast('❌ তারিখ দিন!'); return; }
    // ✅ server-side validation: input bypass হলেও ধরা পড়বে
    if(date<minDate||date>maxDate){ toast('❌ তারিখ এই মেস মাসের বাইরে দেওয়া যাবে না!'); return; }
    b.desc=desc; b.amount=amount; b.date=date;
    saveBazarItem(b); renderBazar(); closeModal(); toast('✅ আপডেট হয়েছে!');
  }, true);
}
