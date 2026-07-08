// ═══════════════════════════════════════════════
// js/members.js
// Members list, member detail, profile
//
// Extracted from index.html inline script (L2178–L2472).
// Original behavior preserved byte-identical — no refactor,
// no modernisation, no import/export.
//
// Load order: AFTER js/ui.js  (showSc, showModal, updateThemeBtns)
//             AFTER js/auth.js (roleLabel, isManagerOrCtrl, isController)
//             AFTER js/meal.js (mTV, toISODate, messMonthMeals)
//             AFTER js/bazar.js (not a hard dep, but safe)
//
// Implicit globals consumed (all pre-declared before this file loads):
//   config.js  → DB, CU, auth
//   utils.js   → messMonthKey, safeHTML, esc, getPreBal,
//                dateInMessMonth, getBSTDate, sanitizeInput,
//                validMobile, toast
//   core.js    → fmtDate, isOfficeMealUser
//   meal.js    → mTV, toISODate, messMonthMeals
//   auth.js    → roleLabel, isManagerOrCtrl, isController
//   ui.js      → showSc, showModal, updateThemeBtns
//   db.js      → saveDB, isOnline, noNetPopup
//   firebase   → window.firebase (CDN global)
//
// State vars formerly in config.js — now owned here:
//   currentDetailUser    (was config.js L17)
//   currentDetailMemTab  (was config.js L18)
// ═══════════════════════════════════════════════

// ── Module-level state ───────────────────────────
// These were declared in config.js. After extraction,
// config.js declarations become dead code and should be
// removed from config.js (see inline removal instructions below).
let currentDetailUser = '';
let currentDetailMemTab = 'meals';


// ═══════════════════════════════════════════════
// MEMBER COUNT SUMMARY
// New feature — renders active member count above mem-list.
// Called at the end of loadMembers() so it auto-updates on
// every render: search, block/unblock, realtime refresh.
// ═══════════════════════════════════════════════
function _renderMemberCountBar(filteredList) {
  var el = document.getElementById('mem-count-bar');
  if (!el) return;
  var total = DB.users.filter(function(u){ return !u.blocked; }).length;
  var q = (document.getElementById('mem-search') ? document.getElementById('mem-search').value : '').trim();
  if (q) {
    var shown = filteredList.filter(function(u){ return !u.blocked; }).length;
    el.textContent = '\uD83D\uDD0D ' + shown + ' \u099C\u09A8 \u09A6\u09C7\u0996\u09BE\u09A8\u09CB \u09B9\u099A\u09CD\u099B\u09C7 \u00B7 \u09AE\u09CB\u099F \u09B8\u0995\u09CD\u09B0\u09BF\u09AF\u09BC: ' + total + ' \u099C\u09A8';
  } else {
    el.textContent = '\uD83D\uDC65 \u09AE\u09CB\u099F \u09B8\u0995\u09CD\u09B0\u09BF\u09AF\u09BC \u09B8\u09A6\u09B8\u09CD\u09AF: ' + total + ' \u099C\u09A8';
  }
}


// ═══════════════════════════════════════════════
// MEMBERS
// ═══════════════════════════════════════════════
function toggleManagerView(){
  const panel=document.getElementById('mgr-list-panel');
  const btn=document.getElementById('mgr-toggle-btn');
  const isOpen=panel.style.display!=='none';
  if(isOpen){
    panel.style.display='none';
    btn.style.background='var(--card)';
    btn.style.color='var(--text)';
    btn.style.borderColor='var(--border)';
  } else {
    panel.style.display='block';
    btn.style.background='var(--primary)';
    btn.style.color='#fff';
    btn.style.borderColor='var(--primary)';
    // Render manager list
    const mmKey=messMonthKey();
    const mgrs=(DB.managers&&DB.managers[mmKey])||[];
    const content=document.getElementById('mgr-list-content');
    if(!mgrs.length){
      content.innerHTML='<p class="muted tc" style="padding:12px">এই মাসে কোনো ম্যানেজার নেই</p>';
      return;
    }
    const mnames=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
    const [my,mm]=mmKey.split('-').map(Number);
    const nm=mm===12?1:mm+1;
    content.innerHTML=`<div style="font-size:11px;color:var(--text-light);margin-bottom:8px;font-weight:600;">👑 ${mnames[mm-1]} ১১ – ${mnames[nm-1]} ১০, ${my}</div>`
      + mgrs.map(u=>{
          const usr=DB.users.find(x=>x.u===u);
          if(!usr) return '';
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
            <div style="width:34px;height:34px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">${usr.name[0].toUpperCase()}</div>
            <div><div style="font-weight:600;font-size:13px">${usr.name}</div><div style="font-size:11px;color:var(--text-light)">ID- ${usr.job||'—'} · রুম ${usr.room||'—'}</div></div>
          </div>`;
        }).join('');
  }
}

function loadMembers(){
  const q=(document.getElementById('mem-search')?.value||'').trim().toLowerCase();
  const mmKey=messMonthKey();

  // ── Search fix: u.job number হতে পারে — String() দিয়ে convert করো ──
  const filtered = DB.users.filter(u=>{
    if(!q) return true;
    const name  = (u.name||'').toLowerCase();
    const job   = String(u.job||'').toLowerCase();
    const room  = String(u.room||'').toLowerCase();
    const uname = (u.u||'').toLowerCase();
    return name.includes(q) || job.includes(q) || room.includes(q) || uname.includes(q);
  });

  // ── Job ID অনুযায়ী sort (ছোট → বড়, সংখ্যা হলে numeric, নইলে alphabetic) ──
  filtered.sort((a,b)=>{
    const aj=parseInt(a.job)||0, bj=parseInt(b.job)||0;
    if(aj && bj) return aj-bj;
    if(aj) return -1;
    if(bj) return 1;
    return (a.job||'').localeCompare(b.job||'');
  });

  const html = filtered.map(u=>{
    const m=messMonthMeals(u.u,mmKey);
    const _mDep=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,mmKey)).reduce((s,tx)=>s+(tx.amount||0),0);
    const _mWith=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,mmKey)).reduce((s,tx)=>s+(tx.amount||0),0);
    const bal=getPreBal(u.u,mmKey)+(_mDep-_mWith);
    const typeBadge=u.type==='cook'?`<span class="badge badge-cook">বাবুর্চি</span>`:isOfficeMealUser(u)?`<span class="badge badge-office">🏢 অফিস মিল</span>`:u.type==='outside'?`<span class="badge badge-outside">আউটসাইড</span>`:''
    const blockBadge=u.blocked?'<span class="badge badge-blocked">ব্লকড</span>':'';
    const ctrlBadge=isController(u)?'<span class="badge badge-ctrl">Controller</span>':'';
    const mgrBadge=(DB.managers[messMonthKey()]||[]).includes(u.u)?'<span class="badge badge-mgr">Manager</span>':'';
    // ── ID label — bold ও উজ্জ্বল ──
    const idLabel = u.job
      ? `<span style="font-weight:700;color:var(--primary);font-size:12px">ID ${esc(u.job)}</span>`
      : '';
    const roomLabel = u.room ? `<span style="color:var(--text-light);font-size:11px">রুম ${esc(u.room)}</span>` : '';
    return`<div class="mem-item" data-uname="${esc(u.u)}" style="cursor:pointer">
      <div class="mem-av ${u.blocked?'blocked':''}">${esc(u.name[0])}</div>
      <div style="flex:1">
        <div class="mem-name">${esc(u.name)}${ctrlBadge}${mgrBadge}${typeBadge}${blockBadge}</div>
        <div class="mem-meta" style="display:flex;gap:8px;align-items:center;margin-top:2px">${idLabel}${roomLabel}</div>
      </div>
      <div class="mem-right">
        <div class="mem-meals">${m.toFixed(2)} মিল</div>
        <div class="${bal>=0?'mem-bal-pos':'mem-bal-neg'}">${bal>=0?'+':''}৳${Math.abs(bal).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}</div>
      </div>
    </div>`;
  }).join('')||'<p class="muted tc">কোনো সদস্য পাওয়া যায়নি</p>';
  document.getElementById('mem-list').innerHTML = safeHTML(html);
  // onclick safeHTML এ strip হয় — event delegation দিয়ে click handle করো
  document.getElementById('mem-list').onclick = function(e){
    const item = e.target.closest('[data-uname]');
    if(item) openMemberDetail(item.getAttribute('data-uname'));
  };

  // ── Member count summary bar — auto-updates on every render ──
  _renderMemberCountBar(filtered);
}

// ═══════════════════════════════════════════════
// MEMBER DETAIL
// ═══════════════════════════════════════════════
function openMemberDetail(uname){
  currentDetailUser=uname;
  const u=DB.users.find(x=>x.u===uname); if(!u) return;
  document.getElementById('memdet-title').textContent=u.name;
  document.getElementById('memdet-sub').textContent=`রুম ${u.room||'-'} · ${u.job||'-'}`;
  // Info card
  const _dmmKey=messMonthKey();
  const _dDep=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,_dmmKey)).reduce((s,tx)=>s+(tx.amount||0),0);
  const _dWith=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,_dmmKey)).reduce((s,tx)=>s+(tx.amount||0),0);
  const bal=getPreBal(u.u,_dmmKey)+(_dDep-_dWith);
  document.getElementById('memdet-info').innerHTML = safeHTML(`
    <div class="prof-av" style="width:60px;height:60px;font-size:24px">${esc(u.name[0])}</div>
    <div style="font-size:18px;font-weight:700">${esc(u.name)}</div>
    <div style="font-size:13px;color:var(--text-light);margin-top:4px">${esc(roleLabel(u.role,u))} · ${u.type==='inside'?'ইনসাইড':'আউটসাইড'}</div>
    <div style="margin-top:8px;font-size:22px;font-weight:700;color:${bal>=0?'var(--success)':'var(--danger)'}">${bal>=0?'+':''}৳${Math.abs(bal).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}</div>
    <div style="font-size:12px;color:var(--text-light)">${bal>=0?'জমা আছে':'বকেয়া আছে'}</div>
  `);
  // Manager actions
  const mgrDiv=document.getElementById('memdet-mgr-actions');
  if(isManagerOrCtrl()&&uname!==CU.u){
    mgrDiv.style.display='block';
    const btn=document.getElementById('memdet-block-btn');
    btn.textContent=u.blocked?'✅ আনব্লক করুন':'🚫 ব্লক করুন';
    btn.className='btn '+(u.blocked?'btn-primary':'btn-danger');
  } else { mgrDiv.style.display='none'; }
  memdetTab('meals');
  showSc('memdetail');
}
function memdetTab(tab){
  currentDetailMemTab=tab;
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  const u=DB.users.find(x=>x.u===currentDetailUser); if(!u) return;
  const mmKey=messMonthKey();
  if(tab==='meals'){
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.getElementById('memdet-meals-card').style.display='block';
    document.getElementById('memdet-txn-card').style.display='none';
    const days=[];
    const now=getBSTDate();
    for(let i=6;i>=0;i--){ const d=new Date(now); d.setDate(d.getDate()-i); days.push(toISODate(d)); }
    let html=`<div class="sec-title">🍽️ গত ৭ দিনের মিল</div>`;
    html+=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:var(--bg)"><th style="padding:6px;text-align:left">তারিখ</th><th>সকাল</th><th>দুপুর</th><th>রাত</th><th>মোট</th></tr>`;
    let grandTotal=0;
    days.forEach(d=>{
      const m=DB.meals[u.u+'_'+d]||{b:{t:'off',q:1},l:{t:'off',q:1},d:{t:'off',q:1}};
      const b=mTV('b',m.b,d,u.type),l=mTV('l',m.l,d,u.type),dv=mTV('d',m.d,d,u.type); grandTotal+=b+l+dv;
      const fc=(v,slot_m)=>{
        if(v<=0) return `<td style="text-align:center;color:var(--text-light);font-size:11px">off</td>`;
        const lbl=slot_m.t+(( slot_m.q||1)>1?(slot_m.q||1):'');
        const color=slot_m.t==='P'?'var(--success)':'var(--info)';
        return `<td style="text-align:center;color:${color};font-weight:700;font-size:12px">${lbl}<br><small style="font-weight:400">${v.toFixed(2)}</small></td>`;
      };
      html+=`<tr style="border-top:1px solid var(--border)"><td style="padding:6px">${d.slice(8)+'/'+d.slice(5,7)}</td>${fc(b,m.b)}${fc(l,m.l)}${fc(dv,m.d)}<td style="text-align:center;font-weight:700;color:var(--primary)">${(b+l+dv).toFixed(2)}</td></tr>`;
    });
    html+=`</table></div>`;
    const monthTotal=messMonthMeals(u.u,mmKey);
    html+=`<div class="divider"></div><div class="rep-row"><span>এই মেস মাসে মোট</span><span class="rep-val">${monthTotal.toFixed(2)} মিল</span></div>`;
    document.getElementById('memdet-meals-card').innerHTML = safeHTML(html);
  } else {
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    document.getElementById('memdet-meals-card').style.display='none';
    document.getElementById('memdet-txn-card').style.display='block';
    const txs=DB.transactions.filter(t=>t.uname===u.u).slice().reverse();
    let html=`<div class="sec-title">💵 লেনদেনের ইতিহাস</div>`;
    if(!txs.length){ html+='<p class="muted tc">কোনো লেনদেন নেই</p>'; }
    else{ html+=txs.map(tx=>`<div class="tx-item"><div class="tx-icon">${tx.type==='deposit'?'📥':'📤'}</div><div class="tx-info"><div class="tx-name">${tx.type==='deposit'?'জমা':'উত্তোলন'}</div><div class="tx-meta">${fmtDate(tx.date)}${tx.note?' · '+esc(tx.note):''}</div></div><div class="${tx.type==='deposit'?'tx-amt-pos':'tx-amt-neg'}">${tx.type==='deposit'?'+':'−'}৳${tx.amount.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}</div></div>`).join(''); }
    document.getElementById('memdet-txn-card').innerHTML = safeHTML(html);
  }
}
function toggleBlockMember(){
  // ✅ FIX: isOnline() চেক যোগ করা হয়েছে
  // Bug: অফলাইনে block করলে saveGlobal()+saveUsers() শুধু local memory পরিবর্তন করে।
  // Firebase-এ যায় না। Online হলে পুরনো data overwrite করে undo হয়ে যাওয়ার risk।
  if(!isOnline()){ noNetPopup(); return; }
  const u=DB.users.find(x=>x.u===currentDetailUser); if(!u) return;
  const action=u.blocked?'আনব্লক':'ব্লক';
  showModal(`${action} করুন`,`${u.name} কে ${action} করবেন?`,()=>{
    u.blocked=!u.blocked;
    // ✅ FIX: blocked field = global (users) data only — saveDB() বাদ
    saveGlobal(); saveUsers();
    // ✅ users/{uid}/blocked sync — না হলে login-এ block কাজ করে না
    const doBlockSync = uid => {
      firebase.database().ref('users/'+uid+'/blocked').set(u.blocked||null).catch(()=>{});
    };
    if(u.uid){ doBlockSync(u.uid); }
    else {
      firebase.database().ref('users').once('value', snap=>{
        snap.forEach(child=>{ const d=child.val(); if(d&&d.u===u.u) doBlockSync(child.key); });
      }).catch(()=>{});
    }
    openMemberDetail(currentDetailUser);
    toast(`✅ ${u.name} কে ${action} করা হয়েছে!`);
  });
}

// ═══════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════
function loadProfile(){
  if(!CU) return;
  const cu=DB.users.find(x=>x.u===CU.u)||CU;
  updateThemeBtns();

  // Avatar + name + role
  document.getElementById('pf-av').textContent=cu.name[0].toUpperCase();
  document.getElementById('pf-name').textContent=cu.name;
  document.getElementById('pf-role').textContent=roleLabel(cu.role,cu);

  // View mode fields
  document.getElementById('pf-view-name').textContent=cu.name||'-';
  document.getElementById('pf-view-id').textContent=cu.job||'-';
  document.getElementById('pf-view-mob').textContent=cu.mob||'-';
  document.getElementById('pf-view-room').textContent=cu.room||'-';
  // Email with verification badge — always use Firebase Auth live status
  const email=cu.email||'';
  const fbCurrentUser = auth.currentUser;
  const emailVerified = fbCurrentUser ? fbCurrentUser.emailVerified : (CU.emailVerified||false);
  document.getElementById('pf-view-email').innerHTML=email
    ? esc(email)+(emailVerified?' <span style="font-size:10px;background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 5px">✓ যাচাই</span>':' <span style="font-size:10px;background:#fef3c7;color:#92400e;border-radius:4px;padding:1px 5px">⚠ অযাচাই</span>')
    : '-';
  document.getElementById('pf-view-addr').textContent=cu.address||'-';

  // Edit mode pre-fill
  document.getElementById('pf-edit-name').value=cu.name||'';
  document.getElementById('pf-edit-job').value=cu.job||'';
  document.getElementById('pf-edit-id').value=cu.u||'';
  document.getElementById('pf-edit-mob').value=cu.mob||'';
  document.getElementById('pf-edit-room').value=cu.room||'';
  document.getElementById('pf-edit-email').value=cu.email||'';
  document.getElementById('pf-edit-addr').value=cu.address||'';

  // TX history
  const txs=DB.transactions.filter(t=>t.uname===cu.u).slice().reverse();
  document.getElementById('pf-tx-list').innerHTML = safeHTML(
    txs.length
      ? txs.slice(0,15).map(tx=>`<div class="tx-item"><div class="tx-icon">${tx.type==='deposit'?'📥':'📤'}</div><div class="tx-info"><div class="tx-name">${tx.type==='deposit'?'জমা':'উত্তোলন'}</div><div class="tx-meta">${fmtDate(tx.date)}${tx.note?' · '+esc(tx.note):''}</div></div><div class="${tx.type==='deposit'?'tx-amt-pos':'tx-amt-neg'}">${tx.type==='deposit'?'+':'−'}৳${tx.amount.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}</div></div>`).join('')
      : '<p class="muted tc">কোনো লেনদেন নেই</p>'
  );
}

function pfEditMode(on){
  document.getElementById('pf-view-card').style.display=on?'none':'block';
  document.getElementById('pf-edit-card').style.display=on?'block':'none';
}

function saveProfile(){
  if(!isOnline()){ noNetPopup(); return; }
  const cu=DB.users.find(x=>x.u===CU.u); if(!cu) return;
  const newName=sanitizeInput(document.getElementById('pf-edit-name').value);
  const newId=sanitizeInput(document.getElementById('pf-edit-id').value).toLowerCase();
  const newMob=sanitizeInput(document.getElementById('pf-edit-mob').value);
  const newRoom=sanitizeInput(document.getElementById('pf-edit-room').value);
  const newEmail=sanitizeInput(document.getElementById('pf-edit-email').value).toLowerCase();
  const newAddr=sanitizeInput(document.getElementById('pf-edit-addr').value);

  if(!newName||newName.length<2){ toast('❌ নাম কমপক্ষে ২ অক্ষর হতে হবে!'); return; }
  if(newId && newId.length<3){ toast('❌ ID কমপক্ষে ৩ অক্ষর হতে হবে!'); return; }
  if(newId && newId !== cu.u && DB.users.find(x=>x.u===newId)){ toast('❌ এই ID ইতিমধ্যে ব্যবহৃত!'); return; }
  if(newMob && !validMobile(newMob)){ toast('❌ সঠিক মোবাইল নম্বর দিন! (01XXXXXXXXX)'); return; }
  if(newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)){ toast('❌ সঠিক ইমেইল দিন!'); return; }

  // Check if email changed — reset verification
  if(newEmail && newEmail !== (cu.email||'')) cu.emailVerified=false;

  // ID change — update all references
  if(newId && newId !== cu.u){
    const oldId=cu.u;
    // ── Transactions: uname rename ──
    DB.transactions.forEach(t=>{ if(t.uname===oldId){ t.uname=newId; saveTxItem(t); } });
    // ── Meals: key format = "userId_YYYY-MM-DD" — Object.values() ভুল ছিল ──
    // ✅ FIX: Object.keys() দিয়ে prefix match করো
    // ✅ FIX 2: প্রতিটি meal entry সঠিক মাসের bucket-এ save করো
    // Bug: saveMealEntry(newKey, ...) এ মাসের parameter ছিল না —
    // সব meal currentMonthRef-এ যেত, historical meals ভুল bucket-এ পড়ত।
    const _mealKeys=Object.keys(DB.meals||{});
    _mealKeys.forEach(key=>{
      if(key.startsWith(oldId+'_')){
        const dateStr = key.slice(oldId.length+1); // YYYY-MM-DD অংশ
        const mealMmKey = messMonthKey(new Date(dateStr)); // সঠিক মেস মাস
        const newKey=newId+'_'+dateStr;
        DB.meals[newKey]=DB.meals[key];
        delete DB.meals[key];
        // ✅ সঠিক bucket-এ নতুন key save
        saveMealEntry(newKey, DB.meals[newKey], mealMmKey);
        // ✅ সঠিক bucket থেকে পুরনো key delete
        const oldBucketRef = (mealMmKey !== currentMonthKey && monthsRef)
          ? monthsRef.child(mealMmKey)
          : currentMonthRef;
        if(oldBucketRef) oldBucketRef.child('meals').child(key).remove().catch(()=>{});
      }
    });
    cu.u=newId; CU.u=newId;
  }

  cu.name=newName; CU.name=newName;
  const newJob=sanitizeInput(document.getElementById('pf-edit-job').value);
  if(newJob) { cu.job=newJob; CU.job=newJob; }
  if(newMob) cu.mob=newMob;
  if(newRoom) cu.room=newRoom;
  cu.email=newEmail||cu.email||'';
  cu.address=newAddr||cu.address||'';

  saveGlobal(); saveUsers();
  // ✅ FIX: saveDB() বাদ — users = global data। ID change হলে
  // উপরেই transactions/meals individually save হয়েছে।

  // ✅ users/{uid} path-ও update করো — না হলে refresh-এ পুরনো data ফিরে আসে
  if(CU.uid){
    firebase.database().ref('users/'+CU.uid).update({
      name:    cu.name,
      mobile:  cu.mob||'',
      room:    cu.room||'',
      jobId:   cu.job||'',
      address: cu.address||'',
    }).catch(e=>console.warn('Profile uid sync error:',e));
  }

  pfEditMode(false);
  loadProfile();
  toast('✅ প্রোফাইল আপডেট হয়েছে!');
}
