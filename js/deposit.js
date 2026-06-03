// ═══════════════════════════════════════════════
// DEPOSIT / WITHDRAW
// ═══════════════════════════════════════════════
function initDeposit(){
  renderDepMyBalance();
  renderDepMyHistory();
  const mgr=isManagerOrCtrl();
  document.getElementById('dep-mgr-section').style.display=mgr?'block':'none';
  if(mgr){
    if(!document.getElementById('dep-date').value) document.getElementById('dep-date').value=tod();
    applyMessCycleBounds('dep-date');
    updateDateLabel('dep-date');
    clearDepMem();
    document.getElementById('dep-mem-search').value='';
    document.getElementById('dep-mem-dropdown').style.display='none';
    renderDepHistory();
  }
}
function renderDepMyBalance(){
  if(!CU) return;
  const cu=DB.users.find(x=>x.u===CU.u)||CU;
  const _rmmKey=messMonthKey();
  const prevBal=getPreBal(cu.u, _rmmKey);
  const _rDep=(DB.transactions||[]).filter(tx=>tx.uname===CU.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,_rmmKey)).reduce((s,tx)=>s+(tx.amount||0),0);
  const _rWith=(DB.transactions||[]).filter(tx=>tx.uname===CU.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,_rmmKey)).reduce((s,tx)=>s+(tx.amount||0),0);
  const depBal=_rDep-_rWith;
  const totalBal=prevBal+depBal;
  const fmt=v=>{const r=Math.round(v*100)/100;return(r<0?'\u2212\u09F3':'\u09F3')+Math.abs(r).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
  const col=v=>v>=0?'var(--primary)':'var(--danger)';
  const infoCol=v=>v>=0?'var(--info)':'var(--danger)';
  const pEl=document.getElementById('dep-prev-bal');
  const dEl=document.getElementById('dep-dep-bal');
  const tEl=document.getElementById('dep-total-bal');
  if(pEl){pEl.textContent=fmt(prevBal);pEl.style.color=col(prevBal);}
  if(dEl){dEl.textContent=fmt(depBal);dEl.style.color=infoCol(depBal);}
  if(tEl){tEl.textContent=fmt(totalBal);}
}
function renderDepMyHistory(){
  if(!CU) return;
  const el=document.getElementById('dep-my-history'); if(!el) return;
  const cu=DB.users.find(x=>x.u===CU.u)||CU;
  const mmKey=messMonthKey();
  const prevBal=getPreBal(cu.u, mmKey);
  // শুধু চলমান মাসের (11 to 10) transactions দেখাবে
  const txsAsc=DB.transactions
    .filter(t=>t.uname===CU.u && dateInMessMonth(t.date, mmKey))
    .slice().sort((a,b)=>a.id-b.id);
  // running balance শুরু হবে prevBal থেকে (handover এর নেট ব্যালেন্স)
  let running=prevBal;
  const balMap={};
  txsAsc.forEach(tx=>{running+=(tx.type==='deposit'?tx.amount:-tx.amount);balMap[tx.id]=running;});
  const txs=txsAsc.slice().reverse();
  const fmtAmt=v=>(v<0?'\u2212':'')+'\u09F3'+Math.abs(v).toLocaleString();
  let html='';
  html+=`<div style="background:var(--success-light);border:1px solid #c8e6c9;border-radius:8px;padding:9px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:12px;font-weight:700;color:var(--primary)">\u{1F4C5} \u09AA\u09C2\u09B0\u09CD\u09AC\u09AC\u09B0\u09CD\u09A4\u09C0 \u09AC\u09CD\u09AF\u09BE\u09B2\u09C7\u09A8\u09CD\u09B8</div>
    </div>
    <div style="font-size:14px;font-weight:700;color:${prevBal>=0?'var(--primary)':'var(--danger)'}">${fmtAmt(prevBal)}</div>
  </div>`;
  if(!txs.length){
    html+='<p class="muted tc">\u098F\u0987 \u09AE\u09BE\u09B8\u09C7 \u0995\u09CB\u09A8\u09CB \u09B2\u09C7\u09A8\u09A6\u09C7\u09A8 \u09A8\u09C7\u0987</p>';
  } else {
    txs.forEach(tx=>{
      const bal=balMap[tx.id];
      html+=`<div class="tx-item"><div class="tx-icon">${tx.type==='deposit'?'\u{1F4E5}':'\u{1F4E4}'}</div><div class="tx-info" style="flex:1"><div class="tx-name">${tx.type==='deposit'?'\u099C\u09AE\u09BE':'\u0989\u09A4\u09CD\u09A4\u09CB\u09B2\u09A8'}</div><div class="tx-meta">${fmtDate(tx.date)}${tx.note?' \u00B7 '+esc(tx.note):''}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><div class="${tx.type==='deposit'?'tx-amt-pos':'tx-amt-neg'}">${tx.type==='deposit'?'+':'\u2212'}\u09F3${tx.amount.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}</div><div style="font-size:10px;color:${bal>=0?'var(--success)':'var(--danger)'};font-weight:600">\u09AC\u09CD\u09AF\u09BE\u09B2\u09C7\u09A8\u09CD\u09B8: \u09F3${Math.abs(bal).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}</div></div></div>`;
    });
  }
  el.innerHTML=safeHTML(html)||'<p class="muted tc">\u0995\u09CB\u09A8\u09CB \u09B2\u09C7\u09A8\u09A6\u09C7\u09A8 \u09A8\u09C7\u0987</p>';
}
// ── Transaction balance cache for deposit search ──
let _txBalCache = null;
let _txBalCacheKey = '';
function _getTxBalCache(mmKey){
  if(_txBalCache && _txBalCacheKey===mmKey) return _txBalCache;
  // সব transaction একবার scan করে প্রতি user-এর dep/with sum বানাই
  const cache = {};
  (DB.transactions||[]).forEach(tx=>{
    if(!dateInMessMonth(tx.date, mmKey)) return;
    if(!cache[tx.uname]) cache[tx.uname]={dep:0,with:0};
    if(tx.type==='deposit')  cache[tx.uname].dep  += (tx.amount||0);
    if(tx.type==='withdraw') cache[tx.uname].with += (tx.amount||0);
  });
  _txBalCache = cache;
  _txBalCacheKey = mmKey;
  return cache;
}
// Real override of core.js stub — runs after _txBalCache above is declared
function invalidateTxBalCache(){ _txBalCache = null; _txBalCacheKey = ''; }

function depMemSearch(){
  const q=(document.getElementById('dep-mem-search').value||'').trim();
  const dd=document.getElementById('dep-mem-dropdown');
  const users=DB.users.filter(u=>u.type!=='cook');
  let matches;
  if(!q){
    // খালি থাকলে সব দেখাও
    matches=users;
  } else {
    // String conversion নিশ্চিত করো — u.job number হতে পারে
    const qLow=q.toLowerCase();
    const exact=users.filter(u=>String(u.job||'').toLowerCase()===qLow);
    const starts=users.filter(u=>{ const j=String(u.job||'').toLowerCase(); return j.startsWith(qLow)&&j!==qLow; });
    matches=[...exact,...starts];
  }
  if(!matches.length){
    dd.innerHTML='<div style="padding:12px;text-align:center;font-size:13px;color:var(--text-light)">কোনো সদস্য পাওয়া যায়নি</div>';
    dd.style.display='block'; return;
  }
  // ✅ একবার scan করে cache — ১৫ user × ২ filter এর বদলে O(n) একবার
  const _dmk=messMonthKey();
  const txCache=_getTxBalCache(_dmk);
  dd.innerHTML = safeHTML(matches.slice(0,15).map(u=>{
    const tx=txCache[u.u]||{dep:0,with:0};
    const _ddep=tx.dep, _dwith=tx.with;
    const bal=getPreBal(u.u,_dmk)+(_ddep-_dwith);
    const balColor=bal>=0?'var(--success)':'var(--danger)';
    const balTxt=bal>=0?'+৳'+Math.abs(bal).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2}):'-৳'+Math.abs(bal).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
    return`<div data-uname="${esc(u.u)}" data-action="select-dep-mem" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-light));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;flex-shrink:0">${esc(u.name[0])}</div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:700;color:var(--text)">${esc(u.name)}</div>
        <div style="font-size:12px;color:var(--primary);font-weight:600">ID: ${esc(String(u.job||'-'))}</div>
      </div>
      <div style="font-size:13px;font-weight:700;color:${balColor}">${balTxt}</div>
    </div>`;
  }).join(''));
  dd.style.display='block';
  dd.onmousedown = function(e){
    const item = e.target.closest('[data-action="select-dep-mem"]');
    if(item){ e.preventDefault(); selectDepMem(item.getAttribute('data-uname')); }
  };
}
function selectDepMem(uname){
  document.getElementById('dep-mem').value=uname;
  document.getElementById('dep-mem-dropdown').style.display='none';
  const u=DB.users.find(x=>x.u===uname); if(!u) return;
  document.getElementById('dep-mem-search').value='';
  const sel=document.getElementById('dep-mem-selected');
  sel.style.display='flex'; sel.style.alignItems='center'; sel.style.justifyContent='space-between';
  const _smk=messMonthKey();
  const _sdep=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,_smk)).reduce((s,tx)=>s+(tx.amount||0),0);
  const _swith=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,_smk)).reduce((s,tx)=>s+(tx.amount||0),0);
  const bal=getPreBal(u.u,_smk)+(_sdep-_swith);
  // Use textContent-safe approach for the selected name display
  document.getElementById('dep-mem-selected-name').innerHTML = safeHTML(
    `✅ ${esc(u.name)} &nbsp;<span style="font-size:11px;color:var(--text-light)">| ID: ${esc(String(u.job||'-'))}</span> &nbsp;<span style="color:${bal>=0?'var(--success)':'var(--danger)'};font-size:12px">${bal>=0?'+':''} ৳${Math.abs(bal).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}</span>`
  );
  showMemberBalance();
}
function clearDepMem(){
  document.getElementById('dep-mem').value='';
  const sel=document.getElementById('dep-mem-selected');
  if(sel){ sel.style.display='none'; }
  document.getElementById('dep-bal-info').style.display='none';
}
function setDepType(t){
  document.getElementById('dep-type').value=t;
  document.getElementById('dep-type-btn-dep').className='btn btn-sm '+(t==='deposit'?'btn-primary':'btn-outline');
  document.getElementById('dep-type-btn-with').className='btn btn-sm '+(t==='withdraw'?'btn-danger':'btn-outline');
}
function showMemberBalance(){
  const uname=document.getElementById('dep-mem').value;
  const info=document.getElementById('dep-bal-info');
  if(!uname){ info.style.display='none'; return; }
  const u=DB.users.find(x=>x.u===uname);
  if(!u){ info.style.display='none'; return; }
  const _bmk=messMonthKey();
  const _bdep=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,_bmk)).reduce((s,tx)=>s+(tx.amount||0),0);
  const _bwith=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,_bmk)).reduce((s,tx)=>s+(tx.amount||0),0);
  const bal=getPreBal(u.u,_bmk)+(_bdep-_bwith);
  info.style.display='block';
  info.className='alert '+(bal>=0?'alert-success':'alert-danger')+' show';
  info.textContent=`${u.name} এর বর্তমান ব্যালেন্স: ৳ ${Math.abs(bal).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})} (${bal>=0?'জমা আছে':'বকেয়া আছে'})`;
}
function saveDeposit(){
  if(!isOnline()){ noNetPopup(); return; }
  const uname=document.getElementById('dep-mem').value;
  const type=document.getElementById('dep-type').value;
  const amount=parseFloat(document.getElementById('dep-amt').value);
  const date=V('dep-date');
  const note=sanitizeInput(V('dep-note')).slice(0,100);
  if(!uname){ toast('❌ সদস্য নির্বাচন করুন!'); return; }
  if(!validAmount(amount)){ toast('❌ সঠিক পরিমাণ দিন!'); return; }
  if(!date){ toast('❌ তারিখ দিন!'); return; }
  if(!['deposit','withdraw'].includes(type)){ toast('❌ ধরন নির্বাচন করুন!'); return; }
  const u=DB.users.find(x=>x.u===uname); if(!u){ toast('❌ সদস্য পাওয়া যায়নি!'); return; }
  const _txi={id:genId(),uname,type,amount,date,note,by:CU.u};
  DB.transactions.push(_txi);
  // balance সবসময় getPreBal + transactions থেকে calculate হয়
  saveTxItem(_txi); renderDepHistory(); showMemberBalance(); renderDepMyBalance(); renderDepMyHistory();
  document.getElementById('dep-amt').value='';
  document.getElementById('dep-note').value='';
  const _tmk=messMonthKey();
  const _tDep=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,_tmk)).reduce((s,tx)=>s+(tx.amount||0),0);
  const _tWith=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,_tmk)).reduce((s,tx)=>s+(tx.amount||0),0);
  const _tBal=getPreBal(u.u,_tmk)+(_tDep-_tWith);
  toast(`✅ ${type==='deposit'?'জমা':'উত্তোলন'} সম্পন্ন! ব্যালেন্স: ৳${Math.abs(_tBal).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}`);
}
function renderDepHistory(){
  const histEl=document.getElementById('dep-history');
  // মাস selector — পূর্বের selection সংরক্ষণ করো, repopulate-এ হারাবে না
  const selEl=document.getElementById('dep-hist-month');
  const _prevVal = selEl ? selEl.value : '';
  if(selEl) fillMessCycleSelect(selEl, 12, true); // addBlank=true
  // আগের selection রাখো, নাহলে খালি রাখো — auto-select বন্ধ
  if(selEl) selEl.value = _prevVal || '';
  const mmKey = selEl ? selEl.value : '';
  if(!mmKey){
    if(histEl) histEl.innerHTML='<p class="muted tc" style="padding:20px 0;font-size:13px">📅 উপরের dropdown থেকে মাস সিলেক্ট করুন</p>';
    return;
  }
  _withMonthData(mmKey, histEl, ()=>{
    const txs=DB.transactions.filter(tx=>dateInMessMonth(tx.date,mmKey)).slice().reverse();
    if(!txs.length){ histEl.innerHTML='<p class="muted tc">এই মাসে কোনো লেনদেন নেই</p>'; return; }
    const canEdit=isManagerOrCtrl()&&!_histViewMode;
    const html=txs.map(tx=>{
      const u=DB.users.find(x=>x.u===tx.uname);
      const editBtn=canEdit?`<button data-action="edit-tx" data-id="${tx.id}" style="background:rgba(26,107,60,.12);border:1px solid var(--primary);color:var(--primary);border-radius:7px;padding:3px 9px;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;">✏️</button>`:'';
      return`<div class="tx-item"><div class="tx-icon">${tx.type==='deposit'?'📥':'📤'}</div><div class="tx-info"><div class="tx-name">${esc(u?.name||tx.uname)}${u?.job?` <span style="font-size:11px;color:var(--text-light)">(${esc(u.job)})</span>`:''}</div><div class="tx-meta">${fmtDate(tx.date)}${tx.note?' · '+esc(tx.note):''}</div></div><div class="${tx.type==='deposit'?'tx-amt-pos':'tx-amt-neg'}" style="display:flex;align-items:center;gap:6px">${tx.type==='deposit'?'+':'−'}৳${tx.amount.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}${editBtn}</div></div>`;
    }).join('');
    histEl.innerHTML = safeHTML(html)||'<p class="muted tc">কোনো লেনদেন নেই</p>';
    histEl.onclick = function(e){
      const btn=e.target.closest('button[data-action="edit-tx"]');
      if(!btn) return;
      const id=Number(btn.getAttribute('data-id'));
      editTransaction(id);
    };
  });
}
function editTransaction(id){
  if(!isOnline()){ noNetPopup(); return; }
  const tx=DB.transactions.find(x=>x.id===id); if(!tx) return;
  const u=DB.users.find(x=>x.u===tx.uname); if(!u) return;
  const typeLabel=tx.type==='deposit'?'জমা':'উত্তোলন';
  const html=`<div style="display:flex;flex-direction:column;gap:10px;padding-top:4px">
    <div style="background:var(--bg);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--text-light)">
      <b>${esc(u.name)}</b> — ${typeLabel} (${fmtDate(tx.date)})
    </div>
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">পরিমাণ ৳</label>
    <input id="edit-tx-amt" type="number" class="form-input" value="${tx.amount}" style="margin-top:4px" min="1"></div>
    <div><label style="font-size:12px;font-weight:600;color:var(--text-light)">নোট (ঐচ্ছিক)</label>
    <input id="edit-tx-note" type="text" class="form-input" value="${esc(tx.note||'')}" style="margin-top:4px" placeholder="মাসিক জমা, ফেরত..."></div>
  </div>`;
  showModal('লেনদেন সম্পাদনা', html, ()=>{
    const newAmt=parseFloat(document.getElementById('edit-tx-amt').value);
    const newNote=sanitizeInput(document.getElementById('edit-tx-note').value).slice(0,100);
    if(!validAmount(newAmt)){ toast('❌ সঠিক পরিমাণ দিন!'); return; }
    tx.amount=newAmt;
    tx.note=newNote;
    saveTxItem(tx); renderDepHistory(); showMemberBalance(); renderDepMyBalance(); renderDepMyHistory();
    closeModal(); toast('✅ লেনদেন আপডেট হয়েছে!');
  }, true);
}

// Close dep-mem dropdown on outside click
document.addEventListener('click', function(e){
  const dd=document.getElementById('dep-mem-dropdown');
  const inp=document.getElementById('dep-mem-search');
  if(dd && inp && !dd.contains(e.target) && e.target!==inp){
    dd.style.display='none';
  }
});
