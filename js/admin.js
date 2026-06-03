// ═══════════════════════════════════════════════
// js/admin.js
// Admin panel, month handover, PDF generation,
// bill screen, mess manager screen
//
// Extracted: 2026-05-19
// Source: index.html inline block L2186–L3353
//
// Load order: AFTER ui.js  BEFORE bazar.js
// Depends on (all global, loaded before this file):
//   config.js  → DB, CU, admBuf, MONTH_FIELDS, monthsRef, currentMonthKey
//   utils.js   → esc(), safeHTML(), messMonthKey(), messMonthLabel(),
//                getMessMonth(), getBSTDate(), nextCycleKey(), tod(),
//                mk(), sanitizeInput(), validName(), validMobile()
//   db.js      → isOnline(), noNetPopup()
//   core.js    → getOfficeMealRate(), getOfficeMealUsers(),
//                isActiveInMonth(), isOfficeMealUser(),
//                dateInMessMonth(), homeViewDate
//   meal.js    → calcMealRate(), calcMemberOtherShares(), messMonthMeals(),
//                getShortfallMeals(), getPreBal(), invalidateMealRateCache(),
//                invalidateMealIndex(), mTV()
//   db.js      → saveDB(), saveGlobal(), saveMonth(), noNetPopup(),
//                _withMonthData(), _getCached(), _cacheMonth()
//   meal.js    → mTV(), hlPQO(), applyMessCycleBounds()
//   auth.js    → isController(), isManagerOrCtrl()
//   ui.js      → closeAdmPopup(), tog(), showModal(), closeModal(),
//                showSc(), goHome()
// Calls into (async/user-triggered only):
//   index.html HELPERS → toast()   (runtime-only, never at parse time)
//
// Parse-time side effects: NONE — all code is inside function bodies
// ═══════════════════════════════════════════════


// ═══════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════
function initAdmin(){
  // Controller-only items: show/hide based on role
  const ctrl=isController();
  document.querySelectorAll('.ctrl-only').forEach(el=>{ el.style.display=ctrl?'flex':'none'; });
  const sub=document.getElementById('admin-panel-sub');
  if(sub) sub.textContent=ctrl?'পরিচালনা কেন্দ্র (Controller)':'পরিচালনা কেন্দ্র (Manager)';
  // Controller হলে pending approval badge আপডেট করো
  if(ctrl){
    firebase.database().ref('pendingApprovals').once('value').then(snap=>{
      const data=snap.val()||{};
      const cnt=Object.values(data).filter(v=>v&&v.status==='pending').length;
      _updateApprovalBadge(cnt);
    }).catch(()=>{});
  }

  const sortedForSel=[...DB.users].sort((a,b)=>{
    const ai=parseInt(a.job)||Infinity, bi=parseInt(b.job)||Infinity;
    if(ai!==Infinity||bi!==Infinity) return ai-bi;
    return (a.job||'').localeCompare(b.job||'');
  });
  ['mgr-sel','adm-mem','edit-mem-sel','del-mem-sel'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.innerHTML='<option value="">-- নির্বাচন করুন --</option>';
    sortedForSel.forEach(u=>{ el.innerHTML+=`<option value="${esc(u.u)}">${esc(u.name)} (ID: ${esc(u.job||'-')})</option>`; });
  });
  // Populate mgr-month with mess month options
  const mgrMonSel=document.getElementById('mgr-month');
  if(mgrMonSel){
    mgrMonSel.innerHTML='';
    const now2=getBSTDate();
    const mnames2=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
    const currentKey=messMonthKey();
    for(let i=-1;i<12;i++){
      const d=new Date(now2.getFullYear(),now2.getMonth()-i+1,15);
      const key=messMonthKey(d);
      const {y,m}=getMessMonth(d);
      const nm=(m+1)%12, ny=m===11?y+1:y;
      const opt=document.createElement('option');
      opt.value=key;
      opt.textContent=`${mnames2[m]} ১১ – ${mnames2[nm]} ১০, ${y}`;
      if(key===currentKey) opt.selected=true;
      mgrMonSel.appendChild(opt);
    }
  }
  document.getElementById('adm-dt').value=tod();
  applyMessCycleBounds('adm-dt');
  renderManagerInfo();
  renderControllerList();
  initSiteNoteCard();
  // Populate cycle delete dropdown — শুধু handoverDone মাস দেখাও
  const cycSel=document.getElementById('del-cycle-sel');
  if(cycSel){
    const mnames=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
    const currentKey = messMonthKey();
    // শুধু handoverDone মাস — current মাস বাদ (current মাস delete করা নিরাপদ না)
    const deletable = [...(DB.handoverDone||[])].sort().reverse();
    cycSel.innerHTML='<option value="">-- চক্র নির্বাচন --</option>';
    deletable.forEach(key=>{
      const {y,m}=getMessMonth(new Date(key+'-15'));
      const nm=(m+1)%12;
      cycSel.innerHTML+=`<option value="${key}">${mnames[m]} ১১ – ${mnames[nm]} ১০, ${y}</option>`;
    });
    if(!deletable.length){
      cycSel.innerHTML='<option value="">হস্তান্তর করা কোনো মাস নেই</option>';
    }
    cycSel.onchange=function(){
      const prev=document.getElementById('del-cycle-preview');
      if(!this.value){ prev.style.display='none'; return; }
      prev.innerHTML=`⚠️ এই চক্রের সব meal, বাজার ও অন্যান্য ডেটা Firebase থেকে স্থায়ীভাবে মুছে যাবে।`;
      prev.style.display='block';
    };
  }
}

function deleteMessCycle(){
  if(!isOnline()){ noNetPopup(); return; }
  const key=document.getElementById('del-cycle-sel').value;
  if(!key){ toast('❌ চক্র নির্বাচন করুন!'); return; }
  const mnames=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  const {y,m}=getMessMonth(new Date(key+'-15'));
  const nm=(m+1)%12, ny=m===11?y+1:y;
  const label=`${mnames[m]} ১১ – ${mnames[nm]} ১০, ${y}`;
  const isCurrent = key === messMonthKey();

  showModal('⚠️ চক্র ডিলিট',`"${label}" চক্রের সব ডেটা মুছে ফেলবেন?\n\nসদস্য তালিকা ও ব্যালেন্স অপরিবর্তিত থাকবে।`,()=>{
    if(isCurrent){
      // Current month: DB fields clear করো + save
      DB.meals={}; DB.bazar=[]; DB.others=[]; DB.cookBills=[];
      DB.transactions=[]; DB.mealRates={}; DB.officeMealRates={};
      DB.officeMealNotes=[]; DB.managers={};
      saveMonth();
    } else {
      // পুরনো মাস: Firebase-এর month node সরাসরি delete করো
      const monthNode = firebase.database().ref('messData/months/'+key);
      monthNode.remove().then(()=>{
        // prevBalances এ এই মাসের entry সরাও (গত মাস থেকে যে carry এসেছিল)
        // nextKey এর prevBalance ছোঁয়া যাবে না — ওটা পরের মাসের opening balance
        if(DB.prevBalances && DB.prevBalances[key]){
          delete DB.prevBalances[key];
          saveHandover(); // ✅ controller-only Firebase path
        }
        // handoverDone থেকে এই মাস সরাও
        if(DB.handoverDone){
          DB.handoverDone = DB.handoverDone.filter(h=>h!==key);
          saveHandover(); // ✅ controller-only Firebase path
        }
        toast(`✅ "${label}" চক্রের ডেটা মুছে ফেলা হয়েছে!`);
        initAdmin();
      }).catch(e=>{ toast('❌ মুছতে সমস্যা হয়েছে!'); console.error(e); });
      return;
    }
    toast(`✅ "${label}" চক্রের ডেটা মুছে ফেলা হয়েছে!`);
    initAdmin();
  });
}

// ══════════════════════════════════════════════════
// মাস হস্তান্তর — MONTH HANDOVER
// ══════════════════════════════════════════════════
function _calcHandoverData(mmKey){
  const {othersAll,cookBillsAll,pm,cookFoodCost}=calcMealRate(mmKey);
  const ofRate=getOfficeMealRate(mmKey);
  // ✅ শুধু সেই মাসে active ছিল এমন users — নতুন member আগের মাসের carry-forward-এ যাবে না
  return DB.users.filter(u=>u.type!=='cook' && isActiveInMonth(u, mmKey)).map(u=>{
    const isOff=isOfficeMealUser(u);
    const appliedRate=isOff?(ofRate||pm):pm;
    const myMeals=messMonthMeals(u.u,mmKey);
    const myShortfall=getShortfallMeals(u.u,mmKey);
    const myNetMeals=myMeals+myShortfall;
    const mealBill=myNetMeals*appliedRate;
    const {othersShare,cookFoodShare}=isOff
      ?{othersShare:0,cookFoodShare:0}
      :calcMemberOtherShares(u,mmKey,othersAll,cookBillsAll,cookFoodCost);
    const totalBill=mealBill+othersShare+cookFoodShare;
    const prevBal=getPreBal(u.u, mmKey);
    const monthDep=(DB.transactions||[])
      .filter(tx=>tx.uname===u.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,mmKey))
      .reduce((s,tx)=>s+(tx.amount||0),0);
    const monthWith=(DB.transactions||[])
      .filter(tx=>tx.uname===u.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,mmKey))
      .reduce((s,tx)=>s+(tx.amount||0),0);
    const depositBal=monthDep-monthWith;
    const totalBal=prevBal+depositBal;
    const netBal=Math.round((totalBal-totalBill)*100)/100;
    return {u, netBal};
  });
}
function initHandoverCard(){
  const sel=document.getElementById('handover-month-sel');
  if(!sel) return;
  // চলমান মাস ও গত মাস — ২টাই যথেষ্ট
  const mnames=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  const currentKey=messMonthKey();
  sel.innerHTML='';
  for(let i=0;i<=1;i++){
    const now=getBSTDate();
    const d=new Date(now.getFullYear(),now.getMonth()-i,15);
    const key=messMonthKey(d);
    const {y,m}=getMessMonth(d);
    const nm=(m+1)%12;
    const opt=document.createElement('option');
    opt.value=key;
    opt.textContent=`${mnames[m]} ১১ – ${mnames[nm]} ১০, ${y}`;
    if(i===1) opt.selected=true;   // default = গত মাস
    sel.appendChild(opt);
  }
}
function doMonthHandover(){
  if(!isOnline()){ noNetPopup(); return; }
  if(!isManagerOrCtrl()){ toast('❌ অনুমতি নেই!'); return; }
  const sel=document.getElementById('handover-month-sel');
  const mmKey=sel?sel.value:messMonthKey();
  if(!mmKey){ toast('❌ মাস নির্বাচন করুন!'); return; }
  // ── handover lock: একই মাসে দ্বিতীয়বার করা যাবে না ──
  const doneKeys=DB.handoverDone||[];
  if(doneKeys.includes(mmKey)){
    toast('⚠️ এই মাসের হস্তান্তর আগেই সম্পন্ন হয়েছে! আবার করা যাবে না।');
    return;
  }
  const mnames=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  const {y,m}=getMessMonth(new Date(mmKey+'-15'));
  const nm=(m+1)%12;
  const label=`${mnames[m]} ১১ – ${mnames[nm]} ১০, ${y}`;
  showModal('🔄 মাস হস্তান্তর নিশ্চিত করুন',
    `"${label}" মাসের নেট ব্যালেন্স সকল সদস্যের পূর্ববর্তী ব্যালেন্স হিসেবে সেট হবে। এটি নিশ্চিত করবেন?`,
    ()=>{
      closeModal();

      // ── Step 2: rows পেলে prevBalances সেট ও saveGlobal ──
      // saveDB() না, saveGlobal() — month data ছোঁব না
      const _applyHandover = (rows) => {
        const beforeCount = DB.users.length;
        const nextKey = nextCycleKey(mmKey);
        if(!DB.prevBalances) DB.prevBalances = {};
        if(!DB.prevBalances[nextKey]) DB.prevBalances[nextKey] = {};
        rows.forEach(({u, netBal}) => { DB.prevBalances[nextKey][u.u] = netBal; });
        if(DB.users.length !== beforeCount){
          toast('❌ ত্রুটি: user list পরিবর্তন হয়ে গেছে! Handover বাতিল।');
          return;
        }
        if(!DB.handoverDone) DB.handoverDone = [];
        DB.handoverDone.push(mmKey);
        saveHandover(); // ✅ controller-only Firebase path — saveGlobal() বাদ
        toast(`✅ "${label}" মাসের হস্তান্তর সম্পন্ন!`);
      };

      // ── Step 1: historical data দিয়ে calculate, তারপর DB restore করো ──
      const _calcWithHist = (hist) => {
        const saved = {};
        MONTH_FIELDS.forEach(f => { saved[f] = DB[f]; });
        MONTH_FIELDS.forEach(f => { DB[f] = hist[f] || (f==='meals'||f==='managers'||f==='mealRates'||f==='officeMealRates' ? {} : []); });
        invalidateMealIndex(); invalidateMealRateCache();
        const rows = _calcHandoverData(mmKey);   // ঐতিহাসিক data দিয়ে সঠিক হিসাব
        // *** DB restore — saveGlobal-এর আগে অবশ্যই ***
        MONTH_FIELDS.forEach(f => { DB[f] = saved[f]; });
        invalidateMealIndex(); invalidateMealRateCache();
        _applyHandover(rows);
      };

      // Current month হলে DB-তেই আছে, সরাসরি calculate করো
      if(mmKey === currentMonthKey){
        _applyHandover(_calcHandoverData(mmKey));
        return;
      }

      // Past month — cache চেক করো
      const cached = _getCached(mmKey);
      // ✅ Handover-এ সবসময় fresh Firebase data — stale cache দিয়ে হিসাব নয়
      if(cached && false){ _calcWithHist(cached); return; } // disabled intentionally

      // Firebase থেকে লোড করো
      toast('⏳ ডেটা লোড হচ্ছে...');
      monthsRef.child(mmKey).once('value').then(snap => {
        const hist = snap.val() || {};
        _cacheMonth(mmKey, hist);
        _calcWithHist(hist);
      }).catch(e => {
        toast('❌ ডেটা লোড ব্যর্থ! আবার চেষ্টা করুন।');
        console.error('Handover load error:', e);
      });
    });
}
function resetHandoverLock(){
  if(!isManagerOrCtrl()){ toast('❌ অনুমতি নেই!'); return; }
  const sel=document.getElementById('handover-month-sel');
  const mmKey=sel?sel.value:messMonthKey();
  showModal('🔓 লক রিসেট নিশ্চিত করুন',
    'এই মাসের হস্তান্তর লক রিসেট হবে। তারপর আবার সঠিক হিসাবে হস্তান্তর করতে পারবেন। নিশ্চিত?',
    ()=>{
      closeModal();
      if(!DB.handoverDone) DB.handoverDone=[];
      DB.handoverDone=DB.handoverDone.filter(k=>k!==mmKey);
      // পরের মাসের prevBalances মুছো
      const nextKey=nextCycleKey(mmKey);
      if(DB.prevBalances&&DB.prevBalances[nextKey]) delete DB.prevBalances[nextKey];
      saveGlobal();  // শুধু global — month data ছোঁব না
      toast('✅ লক রিসেট হয়েছে। এখন সঠিক মাস হস্তান্তর করুন।');
    });
}
function renderManagerInfo(){
  const m=document.getElementById('mgr-month').value||mk();
  const mgrs=DB.managers[m]||[];
  const el=document.getElementById('mgr-current');
  if(!el) return;
  if(!mgrs.length){ el.innerHTML='<p class="muted" style="margin:0">এই মাসে কোনো ম্যানেজার নেই</p>'; return; }
  el.innerHTML = safeHTML(mgrs.map(u=>{
    const usr=DB.users.find(x=>x.u===u);
    if(!usr) return '';
    return`<div class="ctrl-edit-row">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">👑 ${esc(usr.name)}</div>
        <div style="font-size:11px;color:var(--text-light);margin-top:2px">
          <span class="ctrl-id-badge">ID: ${esc(u)}</span>
          &nbsp; রুম ${esc(usr.room||'-')}
        </div>
      </div>
      <button onclick="editController('${esc(u)}')" style="background:rgba(26,107,60,.15);color:var(--primary);border:1px solid var(--primary);border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">✏️ Edit</button>
    </div>`;
  }).join(''));
  const sel=document.getElementById('mgr-remove');
  if(sel){
    sel.innerHTML='<option value="">-- ম্যানেজার নির্বাচন --</option>';
    mgrs.forEach(u=>{ const usr=DB.users.find(x=>x.u===u); if(usr) sel.innerHTML+=`<option value="${esc(u)}">${esc(usr.name)} (ID: ${esc(u)})</option>`; });
  }
}
// ✅ SHARED HELPER — uid থাকলে সরাসরি, না থাকলে Firebase-এ খুঁজে role update করো
function syncRole(uname, role){
  const u = DB.users.find(x=>x.u===uname);
  const doUpdate = uid => {
    firebase.database().ref('roles/'+uid).set({role}).catch(e=>console.warn('syncRole roles:',e));
    firebase.database().ref('users/'+uid+'/role').set(role).catch(e=>console.warn('syncRole users:',e));
  };
  if(u?.uid){
    doUpdate(u.uid);
  } else {
    firebase.database().ref('users').once('value', snap=>{
      snap.forEach(child=>{
        const d=child.val();
        if(d&&(d.u===uname||d.mobile===uname||child.key===uname)) doUpdate(child.key);
      });
    }).catch(()=>{});
  }
}

function setManager(){
  if(!isOnline()){ noNetPopup(); return; }
  const month=document.getElementById('mgr-month').value, uname=document.getElementById('mgr-sel').value;
  if(!month||!uname){ toast('❌ মাস ও সদস্য নির্বাচন করুন!'); return; }
  if(!DB.managers[month]) DB.managers[month]=[];
  if(DB.managers[month].length>=10){ toast('❌ সর্বোচ্চ ১০ জন ম্যানেজার রাখা যাবে!'); return; }
  if(!DB.managers[month].includes(uname)) DB.managers[month].push(uname);
  const u=DB.users.find(x=>x.u===uname);
  if(u && u.role==='member'){ u.role='manager'; syncRole(uname,'manager'); }
  // ✅ FIX: saveDB() বাদ — targeted saves। managers=month data, users=global।
  // saveDB() → saveMonth() পুরো month array overwrite করত (race condition)।
  currentMonthRef.child('managers').set(DB.managers).catch(e=>console.error('Managers save:',e));
  saveGlobal(); saveUsers(); renderManagerInfo();
  const sel=document.getElementById('mgr-remove');
  sel.innerHTML='<option value="">-- ম্যানেজার নির্বাচন --</option>';
  (DB.managers[month]||[]).forEach(u=>{ const usr=DB.users.find(x=>x.u===u); if(usr) sel.innerHTML+=`<option value="${esc(u)}">${esc(usr.name)}</option>`; });
  toast('✅ ম্যানেজার নির্বাচন সফল!');
}
function removeManager(){
  if(!isOnline()){ noNetPopup(); return; }
  const month=document.getElementById('mgr-month').value, uname=document.getElementById('mgr-remove').value;
  if(!month||!uname){ toast('❌ ম্যানেজার নির্বাচন করুন!'); return; }
  if(DB.managers[month]) DB.managers[month]=DB.managers[month].filter(u=>u!==uname);
  const u=DB.users.find(x=>x.u===uname);
  if(u && u.role==='manager'){ u.role='member'; syncRole(uname,'member'); }
  // ✅ FIX: targeted saves — managers path + global only
  currentMonthRef.child('managers').set(DB.managers).catch(e=>console.error('Managers save:',e));
  saveGlobal(); saveUsers(); renderManagerInfo(); toast('✅ ম্যানেজার বাদ দেওয়া হয়েছে!');
}
// saveCfg() — moved to js/rules.js (rules screen function, misplaced in ADMIN)
// Extracted: 2026-05-19 | Original lines: 2509–2536
function loadAdmMeal(){
  const uname=document.getElementById('adm-mem').value, dateStr=document.getElementById('adm-dt').value;
  if(!uname||!dateStr){ document.getElementById('adm-pqo').style.display='none'; return; }
  document.getElementById('adm-pqo').style.display='block';
  const meal=DB.meals[uname+'_'+dateStr]||{b:{t:'off',q:1},l:{t:'off',q:1},d:{t:'off',q:1}};
  admBuf={uname,dateStr,b:{...meal.b},l:{...meal.l},d:{...meal.d}};
  ['b','l','d'].forEach(t=>{
    const m=meal[t]||{t:'off',q:1};
    document.getElementById('adm-qty-'+t).value=m.q||1;
    hlPQO(t,m.t||'off',true);
  });
}
function setAdmPQO(t,val){ if(!admBuf[t]) admBuf[t]={t:'off',q:1}; admBuf[t].t=val; hlPQO(t,val,true); }
function saveAdmMeal(){
  if(!isOnline()){ noNetPopup(); return; }
  if(!admBuf.uname||!admBuf.dateStr){ toast('❌ সদস্য ও তারিখ নির্বাচন করুন!'); return; }
  ['b','l','d'].forEach(t=>{ if(!admBuf[t]) admBuf[t]={t:'off',q:1}; admBuf[t].q=parseInt(document.getElementById('adm-qty-'+t).value)||1; });
  const _admKey=admBuf.uname+'_'+admBuf.dateStr;
  const _admVal={b:{...admBuf.b},l:{...admBuf.l},d:{...admBuf.d}};
  DB.meals[_admKey]=_admVal;
  // ✅ FIX: saveDB() বাদ — শুধু এই একটা meal entry save হবে।
  // saveDB() → saveMonth() → পুরো meals object overwrite (race condition)।
  saveMealEntry(_admKey, _admVal);
  invalidateMealIndex(); invalidateMealRateCache(); invalidateMemberCountsCache();
  toast('✅ মিল আপডেট হয়েছে!'); closeAdmPopup();
}
// Edit member
function loadEditMem(){
  const uname=document.getElementById('edit-mem-sel').value;
  const frm=document.getElementById('edit-mem-form');
  if(!uname){ frm.style.display='none'; return; }
  const u=DB.users.find(x=>x.u===uname); if(!u){ frm.style.display='none'; return; }
  frm.style.display='block';
  document.getElementById('edit-mem-name').value=u.name||'';
  document.getElementById('edit-mem-room').value=u.room||'';
  document.getElementById('edit-mem-mob').value=u.mob||'';
  document.getElementById('edit-mem-job').value=u.job||'';
  document.getElementById('edit-mem-type').value=u.type||'inside';
  document.getElementById('edit-mem-joined').textContent=u.joined||'—';
}
function saveEditMem(){
  if(!isOnline()){ noNetPopup(); return; }
  const uname=document.getElementById('edit-mem-sel').value; if(!uname) return;
  const u=DB.users.find(x=>x.u===uname); if(!u) return;
  const newName=sanitizeInput(document.getElementById('edit-mem-name').value);
  const newRoom=sanitizeInput(document.getElementById('edit-mem-room').value).slice(0,20);
  const newMob=sanitizeInput(document.getElementById('edit-mem-mob').value);
  const newJob=sanitizeInput(document.getElementById('edit-mem-job').value).slice(0,30);
  const newType=document.getElementById('edit-mem-type').value;
  if(newName && !validName(newName)){ toast('❌ নাম সঠিক নয়!'); return; }
  if(newMob && !validMobile(newMob)){ toast('❌ মোবাইল নম্বর সঠিক নয়!'); return; }
  if(newName) u.name=newName;
  u.room=newRoom;
  if(newMob) u.mob=newMob;
  u.job=newJob;
  // joined ও activeFrom edit করা নিষিদ্ধ — registration-এ set হয়, পরে অপরিবর্তনীয়
  if(['inside','outside','cook'].includes(newType)) u.type=newType;

  // ✅ FIX: saveDB() বাদ — শুধু users (global data) পরিবর্তন হয়েছে।
  // saveDB() → saveMonth() month arrays overwrite করত।
  saveGlobal(); saveUsers();

  // ✅ users/{uid} path-ও update করো — না হলে refresh-এ পুরনো data ফিরে আসে
  if(u.uid){
    firebase.database().ref('users/'+u.uid).update({
      name:   u.name||'',
      mobile: u.mob||'',
      room:   u.room||'',
      jobId:  u.job||'',
      type:   u.type||'inside',
    }).catch(e=>console.warn('EditMem uid sync error:',e));
  }

  toast('✅ সদস্যের তথ্য সংরক্ষিত হয়েছে!'); closeAdmPopup(); initAdmin();
}
// Delete member
function deleteMember(){
  if(!isOnline()){ noNetPopup(); return; }
  const uname=document.getElementById('del-mem-sel').value; if(!uname){ toast('❌ সদস্য নির্বাচন করুন!'); return; }
  const u=DB.users.find(x=>x.u===uname);
  showModal('সদস্য মুছুন',`${u?.name||uname} কে স্থায়ীভাবে মুছে ফেলবেন? সব ডেটা হারিয়ে যাবে!`,()=>{
    DB.users=DB.users.filter(x=>x.u!==uname);
    DB.controllers=DB.controllers.filter(c=>c!==uname);
    Object.keys(DB.managers).forEach(m=>{ DB.managers[m]=(DB.managers[m]||[]).filter(u=>u!==uname); });
    // member মুছলে _minUserCount আপডেট — নাহলে false block
    if(typeof _minUserCount!=='undefined') _minUserCount=Math.max(0,new Set(DB.users.filter(u=>u&&u.u).map(u=>u.u)).size);
    saveControllers(); saveGlobal(); saveUsers(); // ✅ controllers আলাদা path
    currentMonthRef.child('managers').set(DB.managers).catch(e=>console.error('Managers save:',e));
    closeAdmPopup(); initAdmin(); toast('✅ সদস্য মুছে ফেলা হয়েছে!');
  });
}
// Controller management
function renderControllerList(){
  const div=document.getElementById('ctrl-list'); if(!div) return;
  if(!DB.controllers.length){ div.innerHTML='<p class="muted">কোনো Controller নেই</p>'; }
  else{
    div.innerHTML = safeHTML(DB.controllers.map(c=>{
      const usr=DB.users.find(x=>x.u===c);
      if(!usr) return '';
      return`<div class="ctrl-edit-row">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600">${esc(usr.name)}</div>
          <div style="font-size:12px;color:var(--text-light);margin-top:2px">
            <span class="ctrl-id-badge">ID: ${esc(c)}</span>
            &nbsp; রুম ${esc(usr.room||'-')} · ${esc(usr.job||'-')}
          </div>
        </div>
        <button onclick="editController('${esc(c)}')" style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">✏️ Edit</button>
      </div>`;
    }).join(''));
  }
  const addSel=document.getElementById('ctrl-add-sel');
  const remSel=document.getElementById('ctrl-rem-sel');
  addSel.innerHTML='<option value="">-- সদস্য নির্বাচন --</option>';
  remSel.innerHTML='<option value="">-- Controller নির্বাচন --</option>';
  DB.users.filter(u=>!DB.controllers.includes(u.u)).sort((a,b)=>(parseInt(a.job)||0)-(parseInt(b.job)||0)).forEach(u=>{ addSel.innerHTML+=`<option value="${esc(u.u)}">${esc(u.name)} (ID: ${esc(u.job||'-')})</option>`; });
  DB.controllers.forEach(c=>{ const usr=DB.users.find(x=>x.u===c); if(usr) remSel.innerHTML+=`<option value="${esc(c)}">${esc(usr.name)} (ID: ${esc(c)})</option>`; });
}
function addController(){
  if(!isOnline()){ noNetPopup(); return; }
  const uname=document.getElementById('ctrl-add-sel').value; if(!uname){ toast('❌ সদস্য নির্বাচন করুন!'); return; }
  if(DB.controllers.length>=5){ toast('❌ সর্বোচ্চ ৫ জন Controller রাখা যাবে!'); return; }
  if(!DB.controllers.includes(uname)) DB.controllers.push(uname);
  const u=DB.users.find(x=>x.u===uname);
  if(u){ u.role='controller'; syncRole(uname,'controller'); }
  // ✅ controllers = controller-only path → saveControllers() আলাদা
  saveControllers(); saveGlobal(); saveUsers(); renderControllerList(); toast('✅ Controller যোগ করা হয়েছে!');
}
function removeController(){
  if(!isOnline()){ noNetPopup(); return; }
  const uname=document.getElementById('ctrl-rem-sel').value; if(!uname){ toast('❌ Controller নির্বাচন করুন!'); return; }
  if(uname===CU.u){ toast('❌ নিজেকে Controller থেকে বাদ দেওয়া যাবে না!'); return; }
  DB.controllers=DB.controllers.filter(c=>c!==uname);
  const u=DB.users.find(x=>x.u===uname);
  if(u&&u.role==='controller'){ u.role='member'; }
  syncRole(uname,'member');
  // ✅ controllers = controller-only path → saveControllers() আলাদা
  saveControllers(); saveGlobal(); saveUsers(); renderControllerList(); toast('✅ Controller বাদ দেওয়া হয়েছে!');
}

// ═══════════════════════════════════════════════
// DAY PDF DOWNLOAD (CSV এর পরিবর্তে)
// ═══════════════════════════════════════════════
function downloadDayPDF(){
  // Debug: library check
  if(typeof html2canvas === 'undefined'){
    toast('❌ html2canvas লোড হয়নি! পেজ রিফ্রেশ করুন।');
    console.error('html2canvas not loaded');
    return;
  }
  if(!window.jspdf || !window.jspdf.jsPDF){
    toast('❌ jsPDF লোড হয়নি! পেজ রিফ্রেশ করুন।');
    console.error('jsPDF not loaded');
    return;
  }
  toast('⏳ শুরু হচ্ছে...');
  try{
  const dt = homeViewDate || tod();
  const dtObj = new Date(dt+'T00:00:00');
  const dd=String(dtObj.getDate()).padStart(2,'0');
  const mm=String(dtObj.getMonth()+1).padStart(2,'0');
  const yy=String(dtObj.getFullYear()).slice(2);
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName=days[dtObj.getDay()];

  // ── Totals ──
  let totBQ=0,totLQ=0,totDQ=0,totBM=0,totLM=0,totDM=0;
  const activeUsers = DB.users.filter(u=>!u.blocked && isActiveInMonth(u, messMonthKey()));
  activeUsers.forEach(u=>{
    const meal=DB.meals[u.u+'_'+dt]||{};
    const bm=meal.b||{t:'off',q:1}, lm=meal.l||{t:'off',q:1}, dm=meal.d||{t:'off',q:1};
    if(bm.t!=='off'){ totBQ+=(bm.q||1); totBM+=mTV('b',bm,dt,u.type); }
    if(lm.t!=='off'){ totLQ+=(lm.q||1); totLM+=mTV('l',lm,dt,u.type); }
    if(dm.t!=='off'){ totDQ+=(dm.q||1); totDM+=mTV('d',dm,dt,u.type); }
  });
  const grandTotal=(totBM+totLM+totDM).toFixed(2);

  // ── Sort by job ID ──
  const sorted = [...activeUsers].sort((a,b)=>{
    const aj=parseInt(a.job)||0, bj=parseInt(b.job)||0;
    if(aj&&bj) return aj-bj;
    return String(a.job||'').localeCompare(String(b.job||''));
  });

  // ── Rows: compact ──
  let rows='';
  sorted.forEach((u,ri)=>{
    const meal=DB.meals[u.u+'_'+dt]||{};
    const bm=meal.b||{t:'off',q:1}, lm=meal.l||{t:'off',q:1}, dm=meal.d||{t:'off',q:1};
    const bv=mTV('b',bm,dt,u.type), lv=mTV('l',lm,dt,u.type), dv=mTV('d',dm,dt,u.type);
    const rowTot=(bv+lv+dv).toFixed(2);
    const bg=ri%2===0?'#f7f9f7':'#ffffff';

    const cell=(m,v)=>{
      if(m.t==='off') return `<td style="text-align:center;color:#bbb;padding:2px 4px;">—</td>`;
      const q=m.q&&m.q>1?m.q:1;
      const label=m.t+(q>1?'×'+q:'');
      const c=m.t==='P'?'#1a6b3c':'#1565c0';
      return `<td style="text-align:center;font-weight:700;color:${c};padding:2px 4px;">${label}</td>`;
    };

    const isOff=(bm.t==='off'&&lm.t==='off'&&dm.t==='off');
    const totColor=isOff?'#bbb':'#1a2e22';
    const totWeight=isOff?'400':'700';

    rows+=`<tr style="background:${bg};border-top:1px solid #e8f0eb;">
      <td style="padding:2px 4px;font-size:10px;color:#555;white-space:nowrap;">${String(u.job||u.u).substring(0,8)}</td>
      <td style="padding:2px 4px;font-size:10px;font-weight:600;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${(u.name||'').substring(0,16)}</td>
      ${cell(bm,bv)}${cell(lm,lv)}${cell(dm,dv)}
      <td style="text-align:right;padding:2px 6px;font-weight:${totWeight};color:${totColor};font-size:10px;">${isOff?'—':rowTot}</td>
    </tr>`;
  });

  const html=`<div style="font-family:Arial,sans-serif;background:#fff;padding:10px 14px;width:720px;color:#1a2e22;font-size:10px;">

    <!-- Compact Header -->
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1a6b3c;padding-bottom:6px;margin-bottom:8px;">
      <div style="font-size:14px;font-weight:700;color:#1a6b3c;">Daily Meal Sheet</div>
      <div style="text-align:right;">
        <span style="font-size:13px;font-weight:700;">${dd}-${mm}-20${yy}</span>
        <span style="font-size:10px;color:#666;margin-left:6px;">${dayName}</span>
      </div>
    </div>

    <!-- Compact Summary -->
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <div style="flex:1;background:#fff8f0;border:1px solid #f0a05a;border-radius:5px;padding:4px 6px;text-align:center;">
        <div style="font-size:9px;color:#888;">Morning</div>
        <div style="font-size:13px;font-weight:700;color:#c45000;">${totBQ} <span style="font-size:9px;font-weight:400;">(${totBM.toFixed(2)})</span></div>
      </div>
      <div style="flex:1;background:#f0fff4;border:1px solid #5abf7a;border-radius:5px;padding:4px 6px;text-align:center;">
        <div style="font-size:9px;color:#888;">Lunch</div>
        <div style="font-size:13px;font-weight:700;color:#1a6b3c;">${totLQ} <span style="font-size:9px;font-weight:400;">(${totLM.toFixed(2)})</span></div>
      </div>
      <div style="flex:1;background:#f0f4ff;border:1px solid #5a7abf;border-radius:5px;padding:4px 6px;text-align:center;">
        <div style="font-size:9px;color:#888;">Night</div>
        <div style="font-size:13px;font-weight:700;color:#1565c0;">${totDQ} <span style="font-size:9px;font-weight:400;">(${totDM.toFixed(2)})</span></div>
      </div>
      <div style="flex:1;background:#1a6b3c;border-radius:5px;padding:4px 6px;text-align:center;">
        <div style="font-size:9px;color:rgba(255,255,255,.8);">Total</div>
        <div style="font-size:13px;font-weight:700;color:#fff;">${grandTotal}</div>
      </div>
    </div>

    <!-- Table -->
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead>
        <tr style="background:#1a6b3c;color:#fff;">
          <th style="padding:4px 4px;text-align:left;width:55px;">ID</th>
          <th style="padding:4px 4px;text-align:left;width:120px;">Name</th>
          <th style="padding:4px 4px;text-align:center;width:60px;">Morning</th>
          <th style="padding:4px 4px;text-align:center;width:60px;">Lunch</th>
          <th style="padding:4px 4px;text-align:center;width:60px;">Night</th>
          <th style="padding:4px 6px;text-align:right;width:60px;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#0f4526;color:#fff;font-weight:700;font-size:10px;">
          <td colspan="2" style="padding:4px 4px;">Grand Total</td>
          <td style="padding:4px 4px;text-align:center;">${totBQ} (${totBM.toFixed(2)})</td>
          <td style="padding:4px 4px;text-align:center;">${totLQ} (${totLM.toFixed(2)})</td>
          <td style="padding:4px 4px;text-align:center;">${totDQ} (${totDM.toFixed(2)})</td>
          <td style="padding:4px 6px;text-align:right;color:#fcd34d;">${grandTotal}</td>
        </tr>
      </tfoot>
    </table>
    <div style="margin-top:6px;font-size:8px;color:#aaa;text-align:right;">P=Plant · Q=Quarter · off=— · Generated: ${dd}.${mm}.20${yy}</div>
  </div>`;

  const wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;left:-9999px;top:0;z-index:-1;';
  wrap.innerHTML=html;
  document.body.appendChild(wrap);
  toast('⏳ PDF তৈরি হচ্ছে...');
  html2canvas(wrap.firstChild,{scale:2.5,useCORS:true,backgroundColor:'#fff'}).then(canvas=>{
    document.body.removeChild(wrap);
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const imgW=210, imgH=(canvas.height*imgW)/canvas.width;
    const pageH=297;
    let yPos=0;
    while(yPos<imgH){
      if(yPos>0) doc.addPage();
      doc.addImage(canvas.toDataURL('image/jpeg',0.95),'JPEG',0,-yPos*canvas.width/imgW/2.5,imgW,imgH);
      yPos+=pageH;
    }
    // File name: DD.MM.YY_mealsheet
    doc.save(`${dd}.${mm}.${yy}_mealsheet.pdf`);
    toast('✅ PDF তৈরি হয়েছে!');
  }).catch(e=>{ document.body.removeChild(wrap); toast('❌ PDF তৈরিতে সমস্যা!'); console.error(e); });
  } catch(err){ toast('❌ Error: '+err.message); console.error('downloadDayPDF error:',err); }
}

// ═══════════════════════════════════════════════
// PDF — English, proper grid table layout
// ═══════════════════════════════════════════════
// Helper: convert Bengali/Unicode text to ASCII-safe for jsPDF
function toASCII(str){
  if(!str) return '-';
  // Replace common Bengali characters with nothing, keep ASCII
  const ascii=str.replace(/[^\x00-\x7F]/g,'');
  return ascii.trim()||('['+str.substring(0,6)+']');
}

function makePDF(type){
  // _withMonthData ব্যবহার করো — cache থাকলে Firebase read হবে না
  const _mmKey = (type==='report'||type==='bill')
    ? (document.getElementById('rpt-month')?.value || messMonthKey())
    : messMonthKey();
  if((type==='report'||type==='bill') && _mmKey && _mmKey !== currentMonthKey){
    _withMonthData(_mmKey, null, ()=>_doMakePDF(type));
    return;
  }
  _doMakePDF(type);
}

function _doMakePDF(type){
  try{
    const today = tod();
    const mmKey = (type==='report'||type==='bill')
      ? (document.getElementById('rpt-month')?.value || messMonthKey())
      : messMonthKey();
    const calc = calcMealRate(mmKey);
    const {bazar,others,othersAll,cookBillsAll,total,totalMeals,cookMeals,pm,cookFoodCost} = calc;
    // ✅ শুধু সেই মাসে active ছিল এমন users — নতুন member আগের মাসে যাবে না
    const nonCookUsers = DB.users.filter(u=>u.type!=='cook' && isActiveInMonth(u, mmKey));
    // ── deduplicate: একই u (username) দুইবার থাকলে প্রথমটা রাখো ──
    const seenU=new Set();
    const dedupUsers=nonCookUsers.filter(u=>{ if(seenU.has(u.u)) return false; seenU.add(u.u); return true; });
    const pdfOfRate = getOfficeMealRate(mmKey);
    // ── sort by job ID (fix: convert to string safely) ──
    const sortedUsers = [...dedupUsers].sort((a,b)=>{
      const ai=parseInt(a.job)||0, bi=parseInt(b.job)||0;
      if(ai&&bi) return ai-bi;
      return String(a.job||'').localeCompare(String(b.job||''));
    });

    // ── helper: mess month label in English ──
    const EN_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    function enMonthLabel(){
      const k=mmKey||''; // e.g. "2026-04"
      const [y,mo]=k.split('-').map(Number);
      if(!y||!mo) return messMonthLabel();
      const nm=mo%12, ny=mo===12?y+1:y;
      return `${EN_MONTHS[mo-1]} 11 - ${EN_MONTHS[nm]} 10, ${ny}`;
    }

    let html = `<div style="font-family:Arial,sans-serif;background:#fff;color:#1a2e22;padding:16px;">`;

    // ── HEADER ──
    html += `<div style="background:linear-gradient(135deg,#0f4526,#1a6b3c);color:#fff;border-radius:10px;padding:14px 6px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:18px;font-weight:700;">Midland Quarter</div>
        <div style="font-size:10px;opacity:.8;margin-top:2px;">Mess Management | ${fmtDate(tod())}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:600;">${type==='daily'?'Daily Report':'Monthly Report'}</div>
        <div style="font-size:10px;opacity:.8">${type==='daily'?today:enMonthLabel()}</div>
      </div>
    </div>`;

    if(type==='report'||type==='bill'){
      // ── SUMMARY CARDS ──
      html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:#e8f5e9;border-radius:8px;padding:10px 12px;border-left:3px solid #1a6b3c;">
          <div style="font-size:10px;color:#5a7a65;">Total Bazar</div>
          <div style="font-size:16px;font-weight:700;color:#1a6b3c;">Tk ${bazar.toLocaleString()}</div>
        </div>
        <div style="background:#e3f2fd;border-radius:8px;padding:10px 12px;border-left:3px solid #1565c0;">
          <div style="font-size:10px;color:#5a7a65;">Other Expenses</div>
          <div style="font-size:16px;font-weight:700;color:#1565c0;">Tk ${others.toLocaleString()}</div>
        </div>
        <div style="background:#fff3e0;border-radius:8px;padding:10px 12px;border-left:3px solid #e65100;">
          <div style="font-size:10px;color:#5a7a65;">Cook Food Cost</div>
          <div style="font-size:16px;font-weight:700;color:#e65100;">Tk ${(cookFoodCost||0).toFixed(0)}</div>
        </div>
        <div style="background:linear-gradient(135deg,#1a6b3c,#28a15e);border-radius:8px;padding:10px 12px;">
          <div style="font-size:10px;color:rgba(255,255,255,.8);">Meal Rate</div>
          <div style="font-size:16px;font-weight:700;color:#fff;">Tk ${pm.toFixed(2)}</div>
        </div>
        <div style="background:#f3e5f5;border-radius:8px;padding:10px 12px;border-left:3px solid #7b1fa2;">
          <div style="font-size:10px;color:#5a7a65;">Total Meal</div>
          <div style="font-size:16px;font-weight:700;color:#7b1fa2;">${totalMeals.toFixed(2)}</div>
        </div>
      </div>`;

      // ── TOTAL ──
      html += `<div style="background:#1a2e22;color:#fff;border-radius:8px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;">Total Monthly Expense</span>
        <span style="font-size:18px;font-weight:700;color:#fcd34d;">Tk ${total.toLocaleString()}</span>
      </div>`;

      // ── FUND SUMMARY (PDF) ──
      const _activeU=DB.users.filter(u=>u.type!=='cook'&&isActiveInMonth(u,mmKey));
      const _handover=_activeU.reduce((s,u)=>s+getPreBal(u.u,mmKey),0);
      const _thisDep=_activeU.reduce((s,u)=>{
        const dep=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,mmKey)).reduce((a,tx)=>a+(tx.amount||0),0);
        const wd=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,mmKey)).reduce((a,tx)=>a+(tx.amount||0),0);
        return s+(dep-wd);
      },0);
      const _messFund=_handover+_thisDep-total;
      const fF=v=>Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
      html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:14px;">
        <div style="background:#e3f2fd;border-radius:8px;padding:10px;border-left:3px solid #1565c0;">
          <div style="font-size:9px;color:#666;margin-bottom:2px;">Received (Prev Handover)</div>
          <div style="font-size:14px;font-weight:700;color:${_handover>=0?'#1565c0':'#e53935'}">${_handover>=0?'+':'-'}Tk ${fF(_handover)}</div>
        </div>
        <div style="background:#e8f5e9;border-radius:8px;padding:10px;border-left:3px solid #2e7d32;">
          <div style="font-size:9px;color:#666;margin-bottom:2px;">This Month Deposit (Net)</div>
          <div style="font-size:14px;font-weight:700;color:#2e7d32">${_thisDep>=0?'+':'-'}Tk ${fF(_thisDep)}</div>
        </div>
        <div style="background:${_messFund>=0?'#e8f5e9':'#fce4ec'};border-radius:8px;padding:10px;border-left:3px solid ${_messFund>=0?'#1a6b3c':'#e53935'};">
          <div style="font-size:9px;color:#666;margin-bottom:2px;">Mess Fund Balance</div>
          <div style="font-size:14px;font-weight:700;color:${_messFund>=0?'#1a6b3c':'#e53935'}">${_messFund>=0?'+':'-'}Tk ${fF(_messFund)}</div>
        </div>
      </div>`;

      // ── MEMBER BILL TABLE ──
      html += `<div style="font-size:13px;font-weight:700;color:#1a6b3c;margin-bottom:8px;">Member Bill Details</div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr style="background:#1a6b3c;color:#fff;">
          <th style="padding:7px 6px;text-align:left;">Name / ID</th>
          <th style="padding:7px 4px;text-align:center;">Type</th>
          <th style="padding:7px 4px;text-align:right;">Prev Balance</th>
          <th style="padding:7px 4px;text-align:right;">Deposit</th>
          <th style="padding:7px 4px;text-align:right;">Total Balance</th>
          <th style="padding:7px 4px;text-align:right;">Meals</th>
          <th style="padding:7px 4px;text-align:right;">S/F</th>
          <th style="padding:7px 4px;text-align:right;background:#145a32;">Net Meals</th>
          <th style="padding:7px 4px;text-align:right;">Meal Bill</th>
          <th style="padding:7px 4px;text-align:right;">Others</th>
          <th style="padding:7px 4px;text-align:right;">Cook</th>
          <th style="padding:7px 4px;text-align:right;">Total Bill</th>
          <th style="padding:7px 6px;text-align:right;">Net</th>
        </tr></thead><tbody>`;

      sortedUsers.forEach((u,ri)=>{
        const myMeals = messMonthMeals(u.u, mmKey);
        const myShortfall = getShortfallMeals(u.u, mmKey);
        const myNetMeals = myMeals + myShortfall;
        const isOffU = isOfficeMealUser(u);
        const appRate = isOffU ? (pdfOfRate||pm) : pm;
        const mealBill = myNetMeals * appRate;
        const sh = isOffU ? {othersShare:0,cookBillShare:0,cookFoodShare:0}
                          : calcMemberOtherShares(u,mmKey,othersAll,cookBillsAll,cookFoodCost);
        const totalBill = mealBill + sh.othersShare + sh.cookFoodShare;
        const monthDeposits = (DB.transactions||[])
          .filter(tx => tx.uname===u.u && tx.type==='deposit' && dateInMessMonth(tx.date, mmKey))
          .reduce((s, tx) => s + (tx.amount||0), 0);
        const monthWithdrawals = (DB.transactions||[])
          .filter(tx => tx.uname===u.u && tx.type==='withdraw' && dateInMessMonth(tx.date, mmKey))
          .reduce((s, tx) => s + (tx.amount||0), 0);
        const prevBalance = getPreBal(u.u, mmKey);
        const depositBalance = monthDeposits - monthWithdrawals;
        const totalBal = prevBalance + depositBalance;   // ✅ cycle-correct
        const netBal = totalBal - totalBill;
        const bg = ri%2===0 ? '#f4f7f5' : '#fff';
        const netColor = netBal>=0 ? '#2e7d32' : '#e53935';
        const typeLabel = isOffU?'Office':u.type==='inside'?'In':'Out';
        const prevColor = prevBalance>=0?'#1a6b3c':'#e53935';
        const fN=v=>{const r=Math.round(v*100)/100;return r.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});};
        html += `<tr style="background:${bg}">
          <td style="padding:6px 6px;font-weight:600;">${esc(u.name)}<br><span style="font-size:9px;color:#888;font-weight:400">ID: ${esc(String(u.job||u.u))}</span></td>
          <td style="padding:6px 4px;text-align:center;font-size:10px">${typeLabel}</td>
          <td style="padding:6px 4px;text-align:right;color:${prevColor}">${prevBalance>=0?'':'-'}${fN(Math.abs(prevBalance))}</td>
          <td style="padding:6px 4px;text-align:right;color:#1565c0;font-weight:600">${depositBalance>0?'+':''}${fN(depositBalance)}</td>
          <td style="padding:6px 4px;text-align:right;color:${totalBal>=0?'#1a6b3c':'#e53935'};font-weight:700">${totalBal>=0?'':'-'}${fN(Math.abs(totalBal))}</td>
          <td style="padding:6px 4px;text-align:right;color:#555">${myMeals.toFixed(2)}</td>
          <td style="padding:6px 4px;text-align:right;color:${myShortfall>0?'#e65100':'#aaa'};font-size:10px">${myShortfall>0?'+'+myShortfall.toFixed(2):'-'}</td>
          <td style="padding:6px 4px;text-align:right;color:#1a6b3c;font-weight:700;background:#f0f9f4">${myNetMeals.toFixed(2)}</td>
          <td style="padding:6px 4px;text-align:right">${fN(mealBill)}</td>
          <td style="padding:6px 4px;text-align:right;color:#1565c0">${isOffU?'-':fN(sh.othersShare)}</td>
          <td style="padding:6px 4px;text-align:right;color:#e65100">${isOffU?'-':fN(sh.cookFoodShare)}</td>
          <td style="padding:6px 4px;text-align:right;font-weight:700;color:#e53935">${fN(totalBill)}</td>
          <td style="padding:6px 6px;text-align:right;font-weight:700;color:${netColor}">${netBal>=0?'+':'-'}${fN(Math.abs(netBal))}</td>
        </tr>`;
      });

      // Cook rows
      DB.users.filter(u=>u.type==='cook' && isActiveInMonth(u, mmKey)).forEach((u,ri)=>{
        const myMeals = messMonthMeals(u.u, mmKey);
        html += `<tr style="background:#f0fdf4;opacity:.85">
          <td style="padding:6px 6px;font-weight:600">Cook: ${esc(u.name)}</td>
          <td style="padding:6px 4px;text-align:center;font-size:10px">Cook</td>
          <td style="padding:6px 4px;text-align:center;color:#888;font-size:10px">-</td>
          <td style="padding:6px 4px;text-align:center;color:#888;font-size:10px">-</td>
          <td style="padding:6px 4px;text-align:center;color:#888;font-size:10px">-</td>
          <td style="padding:6px 4px;text-align:right;color:#f59e0b;font-weight:700">${myMeals.toFixed(2)}</td>
          <td style="padding:6px 4px;text-align:center;color:#aaa;font-size:10px">-</td>
          <td style="padding:6px 4px;text-align:center;color:#aaa;font-size:10px">${myMeals.toFixed(2)}</td>
          <td colspan="6" style="padding:6px 4px;text-align:center;font-size:10px;color:#888">Included in meal rate</td>
        </tr>`;
      });

      html += `</tbody></table>
        <div style="margin-top:12px;font-size:10px;color:#aaa;border-top:1px solid #e2e8f0;padding-top:8px;text-align:center;">
          Midland Quarter Mess Management | Generated: ${fmtDate(tod())} | Period: ${enMonthLabel()}
        </div>`;

    } else {
      // ── DAILY REPORT ──
      let totB=0,totL=0,totD=0;
      DB.users.forEach(u=>{
        const m=DB.meals[u.u+'_'+today]||{b:{t:'off',q:1},l:{t:'off',q:1},d:{t:'off',q:1}};
        totB+=mTV('b',m.b,today,u.type); totL+=mTV('l',m.l,today,u.type); totD+=mTV('d',m.d,today,u.type);
      });
      html += `<div style="background:#e8f5e9;border-radius:8px;padding:10px;margin-bottom:12px;display:flex;gap:10px;text-align:center;">
        <div style="flex:1"><div style="font-size:10px;color:#5a7a65">Breakfast</div><div style="font-size:18px;font-weight:700;color:#1a6b3c">${totB.toFixed(2)}</div></div>
        <div style="flex:1"><div style="font-size:10px;color:#5a7a65">Lunch</div><div style="font-size:18px;font-weight:700;color:#1a6b3c">${totL.toFixed(2)}</div></div>
        <div style="flex:1"><div style="font-size:10px;color:#5a7a65">Dinner</div><div style="font-size:18px;font-weight:700;color:#1a6b3c">${totD.toFixed(2)}</div></div>
        <div style="flex:1;background:#1a6b3c;border-radius:6px;padding:8px"><div style="font-size:10px;color:rgba(255,255,255,.8)">Total</div><div style="font-size:18px;font-weight:700;color:#fff">${(totB+totL+totD).toFixed(2)}</div></div>
      </div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#1a6b3c;color:#fff">
          <th style="padding:7px 8px;text-align:left">Name</th>
          <th style="padding:7px 6px;text-align:center">Breakfast</th>
          <th style="padding:7px 6px;text-align:center">Lunch</th>
          <th style="padding:7px 6px;text-align:center">Dinner</th>
          <th style="padding:7px 8px;text-align:right">Total</th>
        </tr></thead><tbody>`;
      DB.users.forEach((u,ri)=>{
        const m=DB.meals[u.u+'_'+today]||{b:{t:'off',q:1},l:{t:'off',q:1},d:{t:'off',q:1}};
        const bv=mTV('b',m.b,today,u.type),lv=mTV('l',m.l,today,u.type),dv=mTV('d',m.d,today,u.type);
        const bL=m.b.t==='off'?'-':(m.b.q>1?m.b.t+m.b.q:m.b.t);
        const lL=m.l.t==='off'?'-':(m.l.q>1?m.l.t+m.l.q:m.l.t);
        const dL=m.d.t==='off'?'-':(m.d.q>1?m.d.t+m.d.q:m.d.t);
        html+=`<tr style="background:${ri%2===0?'#f4f7f5':'#fff'}">
          <td style="padding:6px 8px;font-weight:600">${esc(u.name)}</td>
          <td style="padding:6px;text-align:center">${bL}</td>
          <td style="padding:6px;text-align:center">${lL}</td>
          <td style="padding:6px;text-align:center">${dL}</td>
          <td style="padding:6px 8px;text-align:right;font-weight:700;color:#1a6b3c">${(bv+lv+dv).toFixed(2)}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    }

    html += '</div>';

    // ── Overlay-এ দেখাও ──
    const overlay = document.getElementById('print-overlay');
    const content = document.getElementById('print-overlay-content');
    const titleEl = document.getElementById('print-overlay-title');
    if(!overlay||!content){ toast('❌ Overlay পাওয়া যায়নি!'); return; }
    if(titleEl) titleEl.textContent = type==='daily' ? '📅 দৈনিক রিপোর্ট' : '📊 মাসিক রিপোর্ট';
    content.innerHTML = `<style>
      *{box-sizing:border-box}
      table{border-collapse:collapse;width:100%}
      th,td{padding:5px 6px;border:1px solid #d0e4d8}
      th{background:#1a6b3c!important;color:#fff!important}
      tr:nth-child(even) td{background:#f0f7f3}
    
/* ── Custom date display: force DD-MM-YYYY via wrapper ── */
.date-display-wrap{position:relative;display:flex;align-items:center;}
.date-display-wrap input[type="date"]{position:relative;color:transparent;width:100%;}
.date-display-wrap input[type="date"]:focus{color:var(--text);}
.date-display-label{
  position:absolute;left:14px;top:50%;transform:translateY(-50%);
  font-size:15px;color:var(--text);pointer-events:none;
  font-family:inherit;letter-spacing:.3px;
}
.date-display-wrap input[type="date"]:focus + .date-display-label,
.date-display-wrap input[type="date"]:active + .date-display-label{
  display:none;
}
</style>` + html;
    overlay.style.display = 'block';
    overlay.scrollTop = 0;
    document.body.style.overflow = 'hidden';

  } catch(err){
    toast('❌ Error: ' + (err.message||String(err)));
    console.error('makePDF error:', err);
  }
}

function closePrintOverlay(){
  const ov = document.getElementById('print-overlay');
  if(ov) ov.style.display = 'none';
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════
// মাসিক হিসাব বিবরণী SCREEN (Home "মিল রেট" click)
// ═══════════════════════════════════════════════
function showAllMembersBill(){
  const mmKey=messMonthKey();
  const {bazar,others,othersAll,cookBillsTotal,cookBillsAll,total,totalMeals,cookMeals,netMeals,pm,cookFoodCost}=calcMealRate(mmKey);
  const content=document.getElementById('mybill-content');

  // ── office meal summary ──
  const ofUsers=getOfficeMealUsers();
  const ofMls=ofUsers.reduce((s,u)=>s+messMonthMeals(u.u,mmKey),0);
  const ofRateMain=getOfficeMealRate(mmKey);
  const ofBill=ofMls*ofRateMain;

  // ── মেস ফান্ড ──
  let totalDeposited=0;
  DB.users.filter(u=>u.type!=='cook').forEach(u=>{
    const _fDep=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,mmKey)).reduce((s,tx)=>s+(tx.amount||0),0);
    const _fWith=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,mmKey)).reduce((s,tx)=>s+(tx.amount||0),0);
    totalDeposited+=getPreBal(u.u,mmKey)+(_fDep-_fWith);
  });
  const messBalance=totalDeposited-bazar-others;

  // ── Summary Hero Card (সবাই দেখবে) ──
  let html=`
  <div class="summary-hero-card" style="border-radius:14px;padding:16px;margin-bottom:14px;">
    <div style="font-size:11px;opacity:.75;letter-spacing:.5px;margin-bottom:8px">${messMonthLabel()}</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <div style="font-size:32px;font-weight:800;line-height:1;letter-spacing:-0.5px">৳ ${pm.toFixed(2)}</div>
        <div style="font-size:11px;opacity:.75;margin-top:4px">প্রতি মিল রেট</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:700">৳ ${total.toLocaleString()}</div>
        <div style="font-size:11px;opacity:.75;margin-top:2px">মোট খরচ</div>
      </div>
    </div>
    <div class="amb-grid">
      <div class="amb-cell"><div class="amb-lbl">বাজার</div><div class="amb-val amb-green">৳${bazar.toLocaleString()}</div></div>
      <div class="amb-cell amb-sep"><div class="amb-lbl">অন্যান্য</div><div class="amb-val amb-green">৳${others.toLocaleString()}</div></div>
      <div class="amb-cell amb-sep"><div class="amb-lbl">বাবুর্চি বিল</div><div class="amb-val amb-orange">৳${(cookFoodCost||0).toFixed(0)}</div></div>
    </div>
    <div class="amb-grid amb-grid2">
      <div class="amb-cell"><div class="amb-lbl">নেট মিল (সবার)</div><div class="amb-val">${parseFloat(netMeals.toFixed(2))}</div></div>
      <div class="amb-cell amb-sep"><div class="amb-lbl">বাবুর্চির মিল</div><div class="amb-val amb-orange">${parseFloat(cookMeals.toFixed(2))}</div></div>
      <div class="amb-cell amb-sep">
        <div class="amb-lbl">অফিস মিল<br><span style="font-size:9px;opacity:.7">MEPL+MPCL</span></div>
        <div class="amb-val amb-blue">${parseFloat(ofMls.toFixed(1))}মিল</div>
        <div class="amb-val amb-blue" style="font-size:12px">৳${ofBill.toFixed(0)}</div>
      </div>
    </div>
    <div class="amb-fund">
      <div style="font-size:12px;opacity:.85">🟢 মেস ফান্ড (ম্যানেজারের কাছে জমা)</div>
      <div style="font-size:20px;font-weight:800;color:${messBalance>=0?'#4ade80':'#f87171'};letter-spacing:-0.3px">${messBalance>=0?'+':'\u2212'}৳${Math.abs(Math.round(messBalance*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
    </div>
  </div>`;

  // ── নিজের হিসাব (current user only) ──
  if(!CU){ html+='<p class="muted tc" style="padding:16px">লগইন করুন</p>'; content.innerHTML=safeHTML(html); showSc('mybill'); return; }
  const cu=DB.users.find(u=>u.u===CU.u);
  if(!cu){ content.innerHTML=safeHTML(html); showSc('mybill'); return; }

  const isOff=isOfficeMealUser(cu);
  const ofRate=getOfficeMealRate(mmKey);
  const appliedRate=isOff?(ofRate||pm):pm;

  const myMeals=messMonthMeals(cu.u,mmKey);
  const myShortfall=getShortfallMeals(cu.u,mmKey);
  const myNetMeals=myMeals+myShortfall;
  const mealBill=myNetMeals*appliedRate;
  const {othersShare,cookBillShare,cookFoodShare}=isOff
    ?{othersShare:0,cookBillShare:0,cookFoodShare:0}
    :calcMemberOtherShares(cu,mmKey,othersAll,cookBillsAll,cookFoodCost);
  const totalBill=mealBill+othersShare+cookFoodShare;

  const prevBal=getPreBal(cu.u, mmKey);
  const monthDep=(DB.transactions||[])
    .filter(tx=>tx.uname===cu.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,mmKey))
    .reduce((s,tx)=>s+(tx.amount||0),0);
  const monthWith=(DB.transactions||[])
    .filter(tx=>tx.uname===cu.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,mmKey))
    .reduce((s,tx)=>s+(tx.amount||0),0);
  const depositBal=monthDep-monthWith;
  const totalBal=prevBal+depositBal;   // ✅ cycle-correct: prevBal + এই মাসের নেট জমা
  const netBal=totalBal-totalBill;

  const fmtTk=v=>{const r=Math.round(v*100)/100;return Number.isInteger(r)?r.toLocaleString('en-US'):r.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
  const colP='var(--success)',colN='var(--danger)',colPBg='var(--success-light)',colNBg='var(--danger-light)';

  html+=`
  <!-- ── নিজের হিসাব header ── -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <div style="font-size:14px;font-weight:700;color:var(--primary)">👤 আমার হিসাব</div>
    <div style="font-size:10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 8px;color:var(--text-light)">ID: ${esc(String(cu.job||cu.u))}</div>
    <div style="font-size:10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 8px;color:var(--text-light)">${isOff?'🏢 অফিস':cu.type==='inside'?'🏠 ইন':'🚪 আউট'}</div>
    <div style="font-size:11px;font-weight:600;color:var(--text);margin-left:auto">${esc(cu.name)}</div>
  </div>

  <!-- ── Balance Grid ── -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 6px;text-align:center">
      <div style="font-size:9px;color:var(--text-light);margin-bottom:4px">পূর্ববর্তী ব্যালেন্স</div>
      <div style="font-size:14px;font-weight:800;color:${prevBal>=0?colP:colN}">${prevBal>=0?'+':'−'}৳${Math.abs(prevBal).toFixed(0)}</div>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 6px;text-align:center">
      <div style="font-size:9px;color:var(--text-light);margin-bottom:4px">জমা</div>
      <div style="font-size:14px;font-weight:800;color:var(--info)">${depositBal>=0?'+':'−'}৳${Math.abs(depositBal).toFixed(0)}</div>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 6px;text-align:center">
      <div style="font-size:9px;color:var(--text-light);margin-bottom:4px">মোট ব্যালেন্স</div>
      <div style="font-size:14px;font-weight:800;color:${totalBal>=0?colP:colN}">${totalBal>=0?'+':'−'}৳${Math.abs(totalBal).toFixed(0)}</div>
    </div>
  </div>

  <!-- ── Bill Breakdown ── -->
  <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:10px">
    <div style="font-size:10px;font-weight:700;color:var(--text-light);letter-spacing:.6px;margin-bottom:10px;text-transform:uppercase">বিল বিবরণী</div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0">
      <div style="font-size:12px;color:var(--text-light)">
        মিল ${myShortfall>0?'('+myMeals.toFixed(2)+'+'+myShortfall.toFixed(2)+'SF)':'× '+myMeals.toFixed(2)}
        <span style="font-size:10px;color:var(--primary)"> × ৳${appliedRate.toFixed(2)}</span>
      </div>
      <div style="font-size:13px;font-weight:700">৳${fmtTk(mealBill)}</div>
    </div>
    ${!isOff&&othersShare>0?`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px dashed var(--border)">
      <div style="font-size:12px;color:var(--text-light)">অন্যান্য বিল</div>
      <div style="font-size:13px;font-weight:600;color:var(--info)">৳${fmtTk(othersShare)}</div>
    </div>`:''}
    ${!isOff&&cookFoodShare>0?`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px dashed var(--border)">
      <div style="font-size:12px;color:var(--text-light)">বাবুর্চি বিল</div>
      <div style="font-size:13px;font-weight:600;color:var(--accent)">৳${fmtTk(cookFoodShare)}</div>
    </div>`:''}
    <div style="height:1px;background:var(--border);margin:8px 0"></div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:13px;font-weight:700">মোট বিল</div>
      <div style="font-size:16px;font-weight:800;color:${colN}">৳${fmtTk(totalBill)}</div>
    </div>
  </div>

  <!-- ── Net Balance ── -->
  <div style="background:${netBal>=0?colPBg:colNBg};border:1.5px solid ${netBal>=0?colP:colN};border-radius:12px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:11px;color:${netBal>=0?colP:colN};font-weight:600;margin-bottom:2px">${netBal>=0?'✅ জমা আছে':'❌ বাকি আছে'}</div>
      <div style="font-size:10px;color:var(--text-light)">ব্যালেন্স − মোট বিল</div>
    </div>
    <div style="font-size:22px;font-weight:900;color:${netBal>=0?colP:colN};letter-spacing:-0.5px">${netBal>=0?'+':'−'}৳${fmtTk(Math.abs(netBal))}</div>
  </div>`;

  content.innerHTML=safeHTML(html);
  showSc('mybill');
}
function closeAllMembersBill(){ goHome(); }

// ═══════════════════════════════════════════════
// MESS MANAGER SCREEN
// ═══════════════════════════════════════════════
function newMessManagerScreen(){
  const mm=messMonthKey();
  document.getElementById('mm-screen-month').textContent=messMonthLabel();
  const mgrs=DB.managers[mm]||[];
  const list=document.getElementById('mm-list');
  if(!mgrs.length){ list.innerHTML='<div class="card tc"><p class="muted">এই মাসে কোনো ম্যানেজার নির্ধারিত নেই।</p></div>'; }
  else{
    list.innerHTML = safeHTML(mgrs.map((uname)=>{
      const u=DB.users.find(x=>x.u===uname);
      if(!u) return '';
      return`<div class="mgr-card">
        <div style="display:flex;align-items:center;gap:14px">
          <div class="mgr-av">${esc(u.name[0])}</div>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700">${esc(u.name)}</div>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px">📱 ${esc(u.mob||'নম্বর নেই')}</div>
            <div style="font-size:12px;color:var(--text-light)">🏠 রুম ${esc(u.room||'-')} &nbsp;·&nbsp; 🪪 ${esc(u.job||'-')}</div>
          </div>
          <span style="font-size:22px">👑</span>
        </div>
      </div>`;
    }).join(''));
  }
  showSc('messmanager');
}

// ═══════════════════════════════════════════════
// EDIT CONTROLLER (Admin Panel)
// ═══════════════════════════════════════════════
function editController(uname){
  const u=DB.users.find(x=>x.u===uname); if(!u) return;
  // Pre-fill edit-mem form and open it
  tog('card-edit-mem');
  document.getElementById('edit-mem-sel').value=uname;
  loadEditMem();
  // Scroll to the card
  document.getElementById('card-edit-mem').scrollIntoView({behavior:'smooth'});
  toast('✏️ '+u.name+' এর তথ্য এডিট করুন');
}

// ═══════════════════════════════════════════════
// SITE NOTE
// ═══════════════════════════════════════════════
function saveSiteNote(){
  if(!isOnline()){ noNetPopup(); return; }
  const val=sanitizeInput(document.getElementById('site-note-input').value).slice(0,80);
  DB.siteNote=val;
  // ✅ FIX: siteNote = global data only — saveGlobal() যথেষ্ট
  saveGlobal();
  document.getElementById('home-mgr').textContent=val||'Midland East Power Limited';
  toast('✅ ঠিকানা/নোট সেভ হয়েছে!'); closeAdmPopup();
}
function initSiteNoteCard(){
  const el=document.getElementById('site-note-input');
  if(el) el.value=DB.siteNote||'';
}

// ═══════════════════════════════════════════════
// MEMBER APPROVAL PANEL (Controller only)
// ═══════════════════════════════════════════════
function initApprovalPanel(){
  if(!isController()){ toast('❌ শুধুমাত্র Controller এক্সেস করতে পারবেন!'); return; }
  const list=document.getElementById('approval-list');
  if(!list) return;
  list.innerHTML='<div style="text-align:center;padding:16px;opacity:.6">⏳ লোড হচ্ছে...</div>';
  firebase.database().ref('pendingApprovals').once('value').then(snap=>{
    const data=snap.val();
    const pending=data ? Object.entries(data).filter(([,v])=>v&&v.status==='pending') : [];
    _updateApprovalBadge(pending.length);
    if(!pending.length){
      list.innerHTML='<div style="text-align:center;padding:16px;opacity:.6">✅ কোনো অপেক্ষমাণ আবেদন নেই।</div>';
      return;
    }
    list.innerHTML=pending.map(([uid,p])=>`
      <div class="approval-item" id="apv-${esc(uid)}">
        <div class="apv-info">
          <div class="apv-name">${esc(p.name)}</div>
          <div class="apv-meta">📱 ${esc(p.mobile||'-')} &nbsp;|&nbsp; 🪪 ID: ${esc(p.jobId||'-')}</div>
          <div class="apv-meta">🏠 ${esc(p.room||'-')} &nbsp;|&nbsp; 📅 ${esc(p.requestedAt||'-')}</div>
        </div>
        <div class="apv-btns">
          <button class="btn btn-success btn-sm" onclick="doApproveUser('${esc(uid)}')">✅ Approve</button>
          <button class="btn btn-danger btn-sm" onclick="doRejectUser('${esc(uid)}')">❌ Reject</button>
        </div>
      </div>`).join('');
  }).catch(()=>{ if(list) list.innerHTML='<div style="color:var(--danger);padding:12px">❌ লোড ব্যর্থ। ইন্টারনেট চেক করুন।</div>'; });
}
function _updateApprovalBadge(cnt){
  const b=document.getElementById('approval-badge');
  if(!b) return;
  b.textContent=cnt||''; b.style.display=cnt?'inline-flex':'none';
}
function doApproveUser(uid){
  if(!isController()){ toast('❌ শুধুমাত্র Controller পারবেন!'); return; }
  showModal('সদস্য অনুমোদন','এই সদস্যকে মেসে যোগ দেওয়ার অনুমতি দেবেন?',()=>{
    firebase.database().ref('pendingApprovals/'+uid).once('value').then(snap=>{
      const p=snap.val();
      if(!p){ toast('❌ আবেদন পাওয়া যায়নি!'); return; }
      if(DB.users.find(x=>x.u===p.u||x.u===('u_'+(p.mobile||'')))){
        toast('❌ এই মোবাইল নম্বরে ইতিমধ্যে সদস্য আছে!');
        firebase.database().ref('pendingApprovals/'+uid).remove();
        initApprovalPanel(); return;
      }
      return approvePendingUser(uid, p);
    }).then(()=>{
      toast('✅ সদস্য অনুমোদিত হয়েছে!');
      const el=document.getElementById('apv-'+uid); if(el) el.remove();
      const rem=document.querySelectorAll('[id^="apv-"]').length;
      _updateApprovalBadge(rem);
      if(!rem){ const l=document.getElementById('approval-list'); if(l) l.innerHTML='<div style="text-align:center;padding:16px;opacity:.6">✅ কোনো অপেক্ষমাণ আবেদন নেই।</div>'; }
      initAdmin(); // dropdown list আপডেট
    }).catch(e=>{ console.error(e); toast('❌ অনুমোদনে সমস্যা!'); });
  });
}
function doRejectUser(uid){
  if(!isController()){ toast('❌ শুধুমাত্র Controller পারবেন!'); return; }
  showModal('আবেদন প্রত্যাখ্যান','এই সদস্যের আবেদন প্রত্যাখ্যান করবেন?',()=>{
    rejectPendingUser(uid).then(()=>{
      toast('✅ আবেদন প্রত্যাখ্যান করা হয়েছে।');
      const el=document.getElementById('apv-'+uid); if(el) el.remove();
      const rem=document.querySelectorAll('[id^="apv-"]').length;
      _updateApprovalBadge(rem);
      if(!rem){ const l=document.getElementById('approval-list'); if(l) l.innerHTML='<div style="text-align:center;padding:16px;opacity:.6">✅ কোনো অপেক্ষমাণ আবেদন নেই।</div>'; }
    }).catch(()=>toast('❌ প্রত্যাখ্যানে সমস্যা!'));
  });
}

// ═══════════════════════════════════════════════
// NOTICE BOARD — moved to js/notice.js
// Extracted: 2026-05-20 | Original lines: 1152–1201
// Functions: initNotice(), updatePopupToggleBtn(),
//            toggleNoticePopup(), saveNotice(), clearNotice()
// ═══════════════════════════════════════════════
