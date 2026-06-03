// ═══════════════════════════════════════════════
// js/db.js
// Firebase persistence, save/load, migration,
// cache invalidation, screen refresh, online/offline
// Load order: AFTER config.js + utils.js + core.js
// loadDB() is called from app.js bootstrap — NOT here
// ═══════════════════════════════════════════════

let _dbLoaded = false; // Guard: Firebase load না হওয়া পর্যন্ত save block

// ── Collision-safe ID generator ──────────────────────────────────
// Date.now() এ একই millisecond-এ দুটো item → same ID → overwrite।
// Date.now() * 10000 + 4-digit random → collision practically impossible।
// Integer হওয়ায় sort (a,b)=>a.id-b.id সঠিকভাবে কাজ করে।
function genId(){
  return Date.now() * 10000 + Math.floor(Math.random() * 10000);
}

// ── Splash logic — simple ──
const _wasAuthed = localStorage.getItem('mq_authed') === '1';
const _isRefresh = sessionStorage.getItem('mq_session') === '1';
sessionStorage.setItem('mq_session','1');

const _splashStart = Date.now();
function hideSplash(){
  const el = document.getElementById('fb-loading');
  if(!el || el.style.display === 'none') return;
  const minWait = (_isRefresh || _wasAuthed) ? 0 : 1200;
  const wait = Math.max(0, minWait - (Date.now() - _splashStart));
  setTimeout(()=>{
    el.style.transition = 'opacity 0.5s ease';
    el.style.opacity = '0';
    setTimeout(()=>{ el.style.display = 'none'; }, 520);
  }, wait);
}

// DB সত্যিকারের ready কিনা — load হয়েছে এবং users array populated
function _isDBReady(){
  return _dbLoaded && Array.isArray(DB.users) && DB.users.length > 0;
}

// DB ready হওয়া পর্যন্ত অপেক্ষা করে callback চালায়
function _waitUntilReady(cb, timeoutMs=6000){
  if(_isDBReady()){ cb(); return; }
  let _done = false; // guard: cb() যেন দুইবার না চলে
  const t = setInterval(()=>{
    if(_isDBReady() && !_done){ _done=true; clearInterval(t); cb(); }
  }, 50);
  // timeout-এ যাই হোক চলে যাও — আটকে থাকা যাবে না
  setTimeout(()=>{ if(!_done){ _done=true; clearInterval(t); cb(); } }, timeoutMs);
}
// ── Internet Check ──
function isOnline(){ return navigator.onLine; }

function noNetPopup(){
  // Remove existing
  const ex=document.getElementById('no-net-popup');
  if(ex) ex.remove();

  const div=document.createElement('div');
  div.id='no-net-popup';
  div.style.cssText=`
    position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;
    background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;padding:24px;
  `;
  div.innerHTML=`
    <div style="background:var(--card);border-radius:18px;padding:28px 24px;max-width:320px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
      <div style="font-size:48px;margin-bottom:12px">📡</div>
      <div style="font-size:17px;font-weight:700;color:var(--danger);margin-bottom:8px">ইন্টারনেট সংযোগ নেই!</div>
      <div style="font-size:13px;color:var(--text-light);margin-bottom:20px;line-height:1.5">ডেটা এন্ট্রি করতে ইন্টারনেট সংযোগ চালু করুন।</div>
      <button onclick="document.getElementById('no-net-popup').remove()" style="background:var(--primary);color:#fff;border:none;border-radius:10px;padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">ঠিক আছে</button>
    </div>
  `;
  document.body.appendChild(div);
}

// ── Pull-to-refresh intercept: full reload এর বদলে in-app refresh ──
// শুধু PWA standalone mode-এ কাজ করবে
if(window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches){
  let _touchStartY = 0;
  document.addEventListener('touchstart', e=>{ _touchStartY = e.touches[0].clientY; }, {passive:true});
  document.addEventListener('touchmove', e=>{
    if(e.touches[0].clientY - _touchStartY > 80 && window.scrollY === 0){
      e.preventDefault(); // browser pull-to-refresh বন্ধ
    }
  }, {passive:false});
}

// ── SW update message: নতুন version deploy হলে toast দেখাও ──
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', e=>{
    if(e.data && e.data.type === 'SW_UPDATED'){
      // নতুন version cache হয়েছে — পরের বার থেকে নতুন version পাবে
      console.log('[App] SW updated, new version cached');
    }
  });
}
window.addEventListener('online', ()=>{
  const p=document.getElementById('no-net-popup');
  if(p) p.remove();
  if(_dbLoaded) toast('✅ ইন্টারনেট সংযোগ পুনরায় চালু হয়েছে!');
});
window.addEventListener('offline', ()=>{
  // ২ সেকেন্ড অপেক্ষা করো — page load-এর সময় false trigger এড়াতে
  setTimeout(()=>{
    if(!navigator.onLine && _dbLoaded) noNetPopup();
  }, 2000);
});

// ── Global save: users, cfg, controllers, notice, siteNote, rules, shortfall, prevBalances, handoverDone ──
let _globalSaveTimer = null;
let _minUserCount = 0; // Firebase থেকে আসা সর্বোচ্চ user count

function saveGlobal(){
  if(!_dbLoaded) return;
  if(_globalSaveTimer) clearTimeout(_globalSaveTimer);
  _globalSaveTimer = setTimeout(()=>{
    // Dedup
    const _sv=new Set();
    DB.users=DB.users.filter(u=>{ if(!u.u||_sv.has(u.u)) return false; _sv.add(u.u); return true; });
    // Guard: Firebase-এর চেয়ে কম user দিয়ে save করবো না
    if(_minUserCount>0 && DB.users.length<_minUserCount){
      console.error('[saveGlobal BLOCKED] users='+DB.users.length+' < expected='+_minUserCount+'. Recovering...');
      globalRef.child('users').once('value').then(snap=>{
        const fw=snap.val(); if(!Array.isArray(fw)) return;
        const fwU=new Set(fw.filter(u=>u&&u.u).map(u=>u.u)).size;
        if(fwU<_minUserCount) return;
        const merged=[...fw];
        DB.users.forEach(u=>{ if(u&&u.u&&!merged.find(x=>x.u===u.u)) merged.push(u); });
        DB.users=merged;
        _minUserCount=Math.max(_minUserCount,new Set(merged.filter(u=>u&&u.u).map(u=>u.u)).size);
        const d2={}; GLOBAL_FIELDS.forEach(f=>{ if(f!=='users'&&DB[f]!==undefined) d2[f]=DB[f]; });
        globalRef.update(d2).catch(()=>{});
        globalRef.child('users').set(merged).catch(()=>{});
        console.log('[saveGlobal RECOVERED] users='+merged.length);
      }).catch(()=>{});
      return;
    }
    if(DB.users.length>0) _minUserCount=Math.max(_minUserCount, DB.users.length);
    // ⚠️ users এখানে save করা হয় না — saveUsers() দিয়ে আলাদা করা হয়
    // যেন অন্য browser-এর users list overwrite না হয়
    const data={};
    GLOBAL_FIELDS.forEach(f=>{ if(f!=='users' && DB[f]!==undefined) data[f]=DB[f]; });
    globalRef.update(data).catch(e=>{ console.error('Global save error:',e); toast('⚠️ ডেটা সেভে সমস্যা!'); });
  }, 400);
}

// ── controllers আলাদা save — controller-only Firebase path ─────────────────
// Firebase Rule: global/controllers → শুধু controller লিখতে পারবে।
// GLOBAL_FIELDS-এ নেই কারণ saveGlobal() manager-ও call করে →
// manager permission denied → পুরো update fail → data হারায়।
// শুধু addController() / removeController() / deleteMember() call করবে।
function saveControllers(){
  if(!_dbLoaded||!globalRef) return;
  globalRef.child('controllers').set(DB.controllers||[]).catch(e=>{
    console.error('Controllers save:',e);
    toast('⚠️ Controllers সেভে সমস্যা!');
  });
}

// ── Handover-only save — controller-only paths ──────────────────────────────
// Firebase Rule: global/prevBalances + global/handoverDone → শুধু controller।
// saveGlobal()-এ রাখা যাবে না — manager call করলে permission denied → fail।
// শুধু doMonthHandover() + deleteMonthCycle() call করবে।
function saveHandover(){
  if(!_dbLoaded||!globalRef) return;
  const updates={};
  if(DB.prevBalances!==undefined) updates['prevBalances']=DB.prevBalances;
  if(DB.handoverDone !==undefined) updates['handoverDone'] =DB.handoverDone;
  globalRef.update(updates).catch(e=>{
    console.error('Handover save:',e);
    toast('⚠️ Handover সেভে সমস্যা! ইন্টারনেট চেক করুন।');
  });
}

// ── users আলাদা save — শুধু user management-এ call হবে ──
function saveUsers(){
  if(!_dbLoaded) return;
  const seen=new Set();
  DB.users=DB.users.filter(u=>{ if(!u.u||seen.has(u.u)) return false; seen.add(u.u); return true; });
  const _uniq=DB.users.length;
  if(_minUserCount>0 && _uniq<_minUserCount){
    console.error('[saveUsers BLOCKED] '+_uniq+' < '+_minUserCount);
    return;
  }
  _minUserCount=Math.max(_minUserCount,_uniq);
  globalRef.child('users').set(DB.users).catch(e=>{ console.error('Users save error:',e); toast('⚠️ সদস্য সেভে সমস্যা!'); });
}

// ── Month save: meals, bazar, others, transactions, managers, mealRates, officeMealRates, officeMealNotes, cookBills ──
let _monthSaveTimer = null;
// ── array নিশ্চিত করো — Firebase object হলে convert করো ──
function _ensureArr(val){
  if(!val) return [];
  if(Array.isArray(val)) return val;
  // Firebase object {0:item, id:item} → array
  return Object.values(val).filter(Boolean);
}

function saveMonth(){
  if(!_dbLoaded || !currentMonthRef) return;
  if(_monthSaveTimer) clearTimeout(_monthSaveTimer);
  _monthSaveTimer = setTimeout(()=>{
    // ⚠️ RACE CONDITION FIX:
    // bazar, others, transactions, officeMealNotes, cookBills — এগুলো
    // saveBazarItem / saveOtherItem / saveTxItem দিয়ে individual path-এ save হয়।
    // এখানে bulk-overwrite করলে অন্য browser-এর concurrent save হারিয়ে যাবে।
    // শুধু object fields save করি — array fields কখনো নয়।
    const SAFE_MONTH_FIELDS = ['meals','managers','mealRates','officeMealRates'];
    const data={};
    SAFE_MONTH_FIELDS.forEach(f=>{ if(DB[f]!==undefined) data[f]=DB[f]; });
    currentMonthRef.update(data).catch(e=>{ console.error('Month save error:',e); toast('⚠️ ডেটা সেভে সমস্যা! ইন্টারনেট চেক করুন।'); });
  }, 400);
}
function saveMealEntry(k,v){ if(!_dbLoaded||!currentMonthRef) return; currentMonthRef.child('meals').child(k).set(v).catch(e=>console.error('Meal:',e)); }
function saveBazarItem(item){ if(!_dbLoaded||!currentMonthRef||!item?.id) return; currentMonthRef.child('bazar').child(String(item.id)).set(item).catch(e=>console.error('Bazar:',e)); }
function deleteBazarItem(id){ if(!_dbLoaded||!currentMonthRef) return; currentMonthRef.child('bazar').child(String(id)).remove().catch(e=>console.error('BazarDel:',e)); }
function saveOtherItem(item){ if(!_dbLoaded||!currentMonthRef||!item?.id) return; currentMonthRef.child('others').child(String(item.id)).set(item).catch(e=>console.error('Others:',e)); }
function deleteOtherItem(id){ if(!_dbLoaded||!currentMonthRef) return; currentMonthRef.child('others').child(String(id)).remove().catch(e=>console.error('OthersDel:',e)); }
function saveTxItem(item){ if(!_dbLoaded||!currentMonthRef||!item?.id) return; currentMonthRef.child('transactions').child(String(item.id)).set(item).catch(e=>console.error('Tx:',e)); }
function deleteTxItem(id){ if(!_dbLoaded||!currentMonthRef) return; currentMonthRef.child('transactions').child(String(id)).remove().catch(e=>console.error('TxDel:',e)); }

// ── Pending Approval helpers ────────────────────────────────────────────────
// Approve: users/{uid} + roles/{uid} লেখো, DB.users-এ যোগ করো, pending মুছো
function approvePendingUser(uid, p){
  if(!uid||!p) return Promise.reject('invalid');
  const uObj={name:p.name, mobile:p.mobile, jobId:p.jobId||'', u:p.u||('u_'+p.mobile),
    room:p.room||'', type:p.type||'inside', role:'member', createdAt:tod()};
  return firebase.database().ref('users/'+uid).set(uObj)
    .then(()=>firebase.database().ref('roles/'+uid).set({role:'member'}))
    .then(()=>{
      if(!DB.users) DB.users=[];
      const newU={uid, u:uObj.u, name:uObj.name, mob:uObj.mobile, email:p.email||'',
        job:uObj.jobId, room:uObj.room, type:uObj.type, role:'member',
        joined:tod(), activeFrom:messMonthKey()};
      if(!DB.users.find(x=>x.u===newU.u)){ DB.users.push(newU); saveGlobal(); saveUsers(); }
      return firebase.database().ref('pendingApprovals/'+uid).remove();
    });
}
// Reject: status=rejected লেখো
function rejectPendingUser(uid){
  if(!uid) return Promise.reject('invalid');
  return firebase.database().ref('pendingApprovals/'+uid+'/status').set('rejected');
}

// ── saveDB() — সব পুরানো call-এর জন্য backward compatible ──
function saveDB(){
  if(!_dbLoaded){ console.warn('saveDB blocked: DB not yet loaded'); return; }
  invalidateMealIndex();
  invalidateMemberCountsCache();
  invalidateTxBalCache();
  invalidateMealRateCache();
  saveGlobal();
  saveMonth();
}

function migrateDB(){
  if(!DB.meals) DB.meals={};
  if(!DB.others) DB.others=[];
  if(!DB.transactions) DB.transactions=[];
  if(!DB.mealRates) DB.mealRates={};
  if(!DB.cfg) DB.cfg={insider:{def:{b:0.75,l:1.5,d:0.75},byDate:{}},outsider:{def:{b:0.75,l:1.5,d:0.75},byDate:{}}};
  // Migrate old flat cfg structure to new insider/outsider structure
  if(DB.cfg.def && !DB.cfg.insider){
    const oldDef=DB.cfg.def, oldByDate=DB.cfg.byDate||{};
    DB.cfg={insider:{def:{...oldDef},byDate:{...oldByDate}},outsider:{def:{...oldDef},byDate:{...oldByDate}}};
  }
  if(!DB.cfg.insider) DB.cfg.insider={def:{b:0.75,l:1.5,d:0.75},byDate:{}};
  if(!DB.cfg.outsider) DB.cfg.outsider={def:{b:0.75,l:1.5,d:0.75},byDate:{}};
  if(!DB.cfg.insider.byDate) DB.cfg.insider.byDate={};
  if(!DB.cfg.outsider.byDate) DB.cfg.outsider.byDate={};
  if(DB.siteNote===undefined) DB.siteNote='আশুগঞ্জ, ব্রাহ্মণবাড়িয়া';
  if(!DB.notice) DB.notice={text:'',popupEnabled:false};
  if(!DB.rules) DB.rules={text:''};
  if(!DB.shortfall) DB.shortfall={};
  if(!DB.cookBills) DB.cookBills=[];
  if(!DB.officeMealRates) DB.officeMealRates={};
  if(!DB.officeMealNotes) DB.officeMealNotes=[];
  if(!DB.users) DB.users=[];
  if(!DB.bazar) DB.bazar=[];
  if(!DB.managers) DB.managers={};
  if(!DB.controllers) DB.controllers=[];
  // Migrate managers to array format
  Object.keys(DB.managers).forEach(k=>{
    if(typeof DB.managers[k]==='string') DB.managers[k]=[DB.managers[k]];
  });
  // Ensure balance on all users, email field defaults
  DB.users.forEach(u=>{ if(!u.type) u.type='inside'; if(!u.email) u.email=''; });
  // ── Auto-dedup: একই u (username) দুইবার থাকলে সরাও ──
  const _seen=new Set();
  DB.users=DB.users.filter(u=>{
    if(!u.u){ return true; } // u field নেই — রাখো
    if(_seen.has(u.u)) return false; // duplicate — বাদ দাও
    _seen.add(u.u); return true;
  });
  // Migrate meals
  Object.keys(DB.meals).forEach(k=>{
    const m=DB.meals[k];
    ['b','l','d'].forEach(t=>{
      if(typeof m[t]==='string') m[t]={t:m[t],q:1};
      else if(!m[t]) m[t]={t:'off',q:1};
    });
  });
  // Migrate old others entries
  DB.others.forEach(o=>{
    if(o.cat && !o._migrated){
      o.desc = o.cat + (o.desc ? ' - '+o.desc : '');
      delete o.cat; o._migrated=true;
    }
    if(!o.split) o.split='equal';
  });
  // ── cfg migration: flat format → mess month keyed ──────────────
  // guard flag দিয়ে একবারই চলবে, প্রতিবার load-এ না
  if(DB.cfg && DB.cfg.insider && DB.cfg.insider.def
     && !DB.cfg._mmMigrated
     && DB.handoverDone && DB.handoverDone.length > 0){
    const _sortedHO2 = [...DB.handoverDone].sort();
    _sortedHO2.forEach(ho=>{
      if(!DB.cfg[ho]){
        DB.cfg[ho] = {
          insider:  { def:{...DB.cfg.insider.def},  byDate:{...DB.cfg.insider.byDate||{}}  },
          outsider: { def:{...DB.cfg.outsider.def}, byDate:{...DB.cfg.outsider.byDate||{}} }
        };
      }
    });
    DB.cfg._mmMigrated = true; // একবারের বেশি চলবে না
    console.log('cfg migration: flat → month-keyed done for', _sortedHO2);
    setTimeout(saveGlobal, 800);
  }
  // ────────────────────────────────────────────────────────────────
  // joined date থেকে সঠিক মেস মাস (11-10 cycle) বের করে activeFrom set করো।
  // 11 তারিখের আগে joined → আগের মেস মাস। 11+ তারিখে → এই মেস মাস।
  // ভুল prevBalance entries ও auto-clean করো।
  if(DB.handoverDone && DB.handoverDone.length > 0 && DB.users && DB.users.length > 0){
    const _sortedHO = [...DB.handoverDone].sort();
    let _migNeeded = false;
    DB.users.forEach(u=>{
      if(u.activeFrom) return; // already set — skip
      _migNeeded = true;
      // joined date থেকে সঠিক মেস মাস key বের করো
      const _jDate = u.joined ? new Date(u.joined) : null;
      u.activeFrom = _jDate ? messMonthKey(_jDate) : _sortedHO[0];
      // ভুল prevBalance entries সাফ করো
      if(DB.prevBalances){
        _sortedHO.forEach(ho=>{
          if(u.activeFrom > ho){ // user এই handoverDone মাসে ছিল না
            const _nk = nextCycleKey(ho);
            if(DB.prevBalances[_nk] && DB.prevBalances[_nk][u.u] !== undefined){
              console.log('activeFrom fix: removing wrong prevBalance['+_nk+']['+u.u+']='+DB.prevBalances[_nk][u.u]);
              delete DB.prevBalances[_nk][u.u];
            }
          }
        });
      }
    });
    if(_migNeeded) setTimeout(saveGlobal, 600);
  }
  // ─────────────────────────────────────────────────────────────
}


// ══════════════════════════════════════════════════════════
// MIGRATION — পুরানো single-node → মেস মাস-ভিত্তিক structure
// ══════════════════════════════════════════════════════════
function _runMigration(callback){
  console.log('🔄 Migration শুরু...');
  dbRef.once('value', snap=>{
    const old=snap.val(); if(!old){ callback(); return; }

    // ── Global data ──
    const globalData={
      users:       old.users       || [],
      cfg:         old.cfg         || {insider:{def:{b:0.75,l:1.5,d:0.75},byDate:{}},outsider:{def:{b:0.75,l:1.5,d:0.75},byDate:{}}},
      controllers: old.controllers || [],
      siteNote:    old.siteNote    || 'আশুগঞ্জ, ব্রাহ্মণবাড়িয়া',
      notice:      old.notice      || {text:'',popupEnabled:false},
      rules:       old.rules       || {text:''},
      shortfall:   old.shortfall   || {},
      prevBalances:old.prevBalances|| {},
      handoverDone:old.handoverDone|| [],
    };

    // ── Month buckets ──
    const buckets={};
    function bkt(mmKey){
      if(!buckets[mmKey]) buckets[mmKey]={meals:{},bazar:[],others:[],transactions:[],managers:{},mealRates:{},officeMealRates:{},officeMealNotes:[],cookBills:[]};
      return buckets[mmKey];
    }

    // meals: key = "userId_YYYY-MM-DD"
    Object.entries(old.meals||{}).forEach(([k,v])=>{
      try{ const d=k.split('_').pop(); bkt(messMonthKey(new Date(d))).meals[k]=v; }
      catch(e){ bkt(currentMonthKey).meals[k]=v; }
    });
    // bazar / others / transactions / officeMealNotes / cookBills
    [['bazar','bazar'],['others','others'],['transactions','transactions'],
     ['officeMealNotes','officeMealNotes'],['cookBills','cookBills']].forEach(([src,dst])=>{
      (old[src]||[]).forEach(item=>{
        try{ bkt(messMonthKey(new Date(item.date||new Date()))).bkt=undefined; bkt(messMonthKey(new Date(item.date||new Date())))[dst].push(item); }
        catch(e){ bkt(currentMonthKey)[dst].push(item); }
      });
    });
    // managers / mealRates / officeMealRates — keyed by mmKey already
    ['managers','mealRates','officeMealRates'].forEach(field=>{
      Object.entries(old[field]||{}).forEach(([mmKey,val])=>{ bkt(mmKey)[field][mmKey]=val; });
    });

    const writes=[globalRef.set(globalData)];
    Object.entries(buckets).forEach(([mmKey,data])=>{ writes.push(monthsRef.child(mmKey).set(data)); });

    Promise.all(writes)
      .then(()=>{
        const cleanups=['users','meals','bazar','others','transactions','managers',
          'mealRates','cfg','controllers','siteNote','notice','rules','shortfall',
          'prevBalances','handoverDone','officeMealRates','officeMealNotes','cookBills']
          .map(f=>dbRef.child(f).remove());
        return Promise.all(cleanups);
      })
      .then(()=>{ console.log('✅ Migration সম্পন্ন!'); callback(); })
      .catch(e=>{ console.error('Migration error:',e); callback(); });
  }).catch(e=>{ console.error('Migration read error:',e); callback(); });
}

// ── Screen refresh helper ──
function _refreshActiveScreen(){
  applyDark();
  if(!CU) return;
  const activeId = document.querySelector('.screen.active')?.id?.replace('sc-','');
  if(activeId==='home'||activeId==='login'||!activeId){ refreshHome(); showSc('home'); }
  else if(activeId==='meal') loadMealDate();
  else if(activeId==='bazar') renderBazar();
  else if(activeId==='others'){ renderOthers(); renderCookBills(); }
  else if(activeId==='deposit'){ renderDepMyBalance(); renderDepMyHistory(); if(isManagerOrCtrl()){ renderDepHistory(); showMemberBalance(); } }
  else if(activeId==='bill') loadBill();
  else if(activeId==='report') loadReport();
  else if(activeId==='members') loadMembers();
  else if(activeId==='profile') loadProfile();
  else if(activeId==='notice') initNotice();
  else if(activeId==='rules') initRules();
}

// ── Background: global-এ missing fields পুরানো top-level থেকে copy করা ──
let _supplementDone = false;
function _supplementGlobalFields(){
  if(_supplementDone) return;
  _supplementDone = true;
  const toCheck = [];
  if(!DB.rules || !DB.rules.text) toCheck.push('rules');
  if(!DB.shortfall || !Object.keys(DB.shortfall).length) toCheck.push('shortfall');
  if(!DB.prevBalances) toCheck.push('prevBalances');
  if(!DB.handoverDone || !DB.handoverDone.length) toCheck.push('handoverDone');
  // পুরানো top-level fields — missing supplement + cleanup একসাথে
  const OLD_FIELDS = ['cfg','users','notice','siteNote','controllers','rules','shortfall',
    'prevBalances','handoverDone','meals','bazar','others','transactions','managers',
    'mealRates','officeMealRates','officeMealNotes','cookBills'];
  const reads = OLD_FIELDS.map(f=>
    dbRef.child(f).once('value').then(s=>({f,v:s.val()})).catch(()=>({f,v:null}))
  );
  Promise.all(reads).then(results=>{
    const gUpdates={};
    const cleanups=[];
    results.forEach(({f,v})=>{
      if(v===null) return;
      if(toCheck.includes(f)){ DB[f]=v; gUpdates[f]=v; }
      cleanups.push(dbRef.child(f).remove().catch(()=>{}));
    });
    if(Object.keys(gUpdates).length) globalRef.update(gUpdates).catch(()=>{});
    Promise.all(cleanups).then(()=>console.log('✅ Firebase cleanup done'));
  });
}

// Real-time listener — দুটো listener: global + current mess month
function loadDB(){
  

  currentMonthKey = messMonthKey();
  currentMonthRef = monthsRef.child(currentMonthKey);

  const offlineTimer = setTimeout(()=>{
    if(_dbLoaded) return; // ইতিমধ্যে load হয়ে গেছে — popup দেখাব না
    hideSplash();
    // navigator.onLine মিথ্যা বলতে পারে — Firebase RTDB-তে ping দিয়ে নিশ্চিত হও
    const connRef = firebase.database().ref('.info/connected');
    connRef.once('value').then(snap=>{
      if(!snap.val() && !_dbLoaded){
        noNetPopup();
      }
      // connected কিন্তু data দেরি করছে — popup দেখাব না, আরো অপেক্ষা করব
    }).catch(()=>{
      if(!_dbLoaded) noNetPopup();
    });
  }, 12000); // 7s → 12s: slow connection-এও Firebase SDK load + init + auth + data আসার জন্য

  // global/users আছে → নতুন structure, সরাসরি listeners শুরু
  // না থাকলে → পুরানো structure check → migration
  globalRef.child('users').once('value')
    .then(gSnap=>{
      if(gSnap.val()!==null){
        _startListeners(offlineTimer);
      } else {
        dbRef.child('users').once('value').then(uSnap=>{
          if(uSnap.val()!==null){
            const msgEl=document.querySelector('#fb-loading .mq-load-sub');
            if(msgEl) msgEl.textContent='ডেটা আপগ্রেড হচ্ছে...';
            _runMigration(()=>_startListeners(offlineTimer));
          } else {
            _startListeners(offlineTimer);
          }
        }).catch(()=>_startListeners(offlineTimer));
      }
    }).catch(()=>_startListeners(offlineTimer));

  function _startListeners(timer){
    let globalReady=false, monthReady=false;

    function _checkReady(){
      if(!globalReady||!monthReady) return;
      clearTimeout(timer);
      migrateDB();
      invalidateMealIndex(); invalidateMemberCountsCache(); invalidateTxBalCache(); invalidateMealRateCache();
      _dbLoaded=true;
      _refreshActiveScreen();
    }

    // ── Global listener (real-time) ──
    globalRef.on('value', snap=>{
      const data=snap.val();
      if(data){
        GLOBAL_FIELDS.forEach(f=>{ if(data[f]!==undefined) DB[f]=data[f]; });
        // ✅ GLOBAL_FIELDS-এ নেই — manually load করো
        if(data.controllers !==undefined) DB.controllers  = data.controllers;
        if(data.prevBalances!==undefined) DB.prevBalances = data.prevBalances;
        if(data.handoverDone!==undefined) DB.handoverDone = data.handoverDone;
        // Firebase-এর user count track করো
        if(Array.isArray(data.users)){
          const _u=new Set(data.users.filter(u=>u&&u.u).map(u=>u.u)).size;
          if(_u>_minUserCount) _minUserCount=_u;
        }
        _supplementGlobalFields();
      } else {
        migrateDB();
        const initG={}; GLOBAL_FIELDS.forEach(f=>{ initG[f]=DB[f]; });
        // ✅ নতুন DB — সব fields initialize করো
        initG.controllers  = DB.controllers  || [];
        initG.prevBalances = DB.prevBalances || {};
        initG.handoverDone = DB.handoverDone || [];
        globalRef.set(initG);
      }
      globalReady=true; _checkReady();
    }, err=>{
      console.error('Global load error:',err);
      globalReady=true; _checkReady();
    });

    // ── Current month: ONCE initial load (full data) ──
    // Login-এ একবার সব নামায় — bandwidth: 1× per login
    currentMonthRef.once('value').then(snap=>{
      const data=snap.val();
      if(data){
        const ARR=['bazar','others','transactions','officeMealNotes','cookBills'];
        MONTH_FIELDS.forEach(f=>{
          if(data[f]===undefined) return;
          if(ARR.includes(f)){
            DB[f]=_ensureArr(data[f]).sort((a,b)=>(a.id||0)-(b.id||0));
          } else { DB[f]=data[f]; }
        });
      }
      _clearHistCache();
      monthReady=true; _checkReady();
      // initial load শেষ হলে real-time listeners চালু করো
      _startMealListeners();
    }).catch(err=>{
      console.error('Month load error:',err);
      monthReady=true; _checkReady();
    });

    // ── mealRates: real-time (tiny, critical for home screen) ──
    currentMonthRef.child('mealRates').on('value', snap=>{
      const v=snap.val(); if(v!==null) DB.mealRates=v;
      invalidateMealRateCache();
      if(_dbLoaded) refreshHome();
    });

    // ── Meal real-time: child_added + child_changed ──
    // একটা meal entry ~43 bytes — পুরো month-এর বদলে শুধু changed entry আসে
    function _startMealListeners(){
      const _handleMeal=(snap)=>{
        const key=snap.key, val=snap.val();
        if(key && val){ DB.meals[key]=val; }
        invalidateMealIndex(); invalidateMealRateCache(); invalidateMemberCountsCache();
        if(_dbLoaded) refreshHome();
      };
      currentMonthRef.child('meals').on('child_added',   _handleMeal);
      currentMonthRef.child('meals').on('child_changed', _handleMeal);
      currentMonthRef.child('meals').on('child_removed', snap=>{
        if(snap.key) delete DB.meals[snap.key];
        invalidateMealIndex(); invalidateMealRateCache();
        if(_dbLoaded) refreshHome();
      });
    }

    // ── Page hide/show: connection manage ──
    document.addEventListener('visibilitychange', ()=>{
      if(document.hidden){
        firebase.database().goOffline();
      } else {
        // ✅ Jitter delay: সবাই একসাথে reconnect করলে Firebase-এ spike হয়।
        // 0–1200ms random delay — 150 user ছড়িয়ে পড়বে, connection spike কমবে।
        const jitter = Math.floor(Math.random() * 1200);
        setTimeout(()=>{
          firebase.database().goOnline();
          // meals: child_changed listener নিজেই delta ধরবে (Firebase auto-sync)
          // bazar/others/transactions: tab active হলে fresh load
          _reloadNonMealData();
          _refreshActiveScreen();
        }, jitter);
      }
    });

    // ── Non-meal data reload (tab active হলে) ──
    function _reloadNonMealData(){
      if(!_dbLoaded || !currentMonthRef) return;
      currentMonthRef.once('value').then(snap=>{
        const data=snap.val(); if(!data) return;
        const ARR=['bazar','others','transactions','officeMealNotes','cookBills'];
        ARR.forEach(f=>{
          if(data[f]!==undefined) DB[f]=_ensureArr(data[f]).sort((a,b)=>(a.id||0)-(b.id||0));
        });
        // mealRates, managers etc (non-meal fields, excluding meals)
        ['managers','officeMealRates'].forEach(f=>{
          if(data[f]!==undefined) DB[f]=data[f];
        });
        _clearHistCache();
      }).catch(()=>{});
    }

    // ১০s fallback — blank screen ঠেকাতে
    setTimeout(()=>{
      if(!_dbLoaded){
        _dbLoaded=true;
        hideSplash();
        if(CU){ refreshHome(); showSc('home'); } else { showSc('login'); }
        toast('⚠️ সংযোগ ধীর। পুনরায় চেষ্টা করুন।');
      }
    }, 10000);
  }
}

