// js/meal.js
// ─────────────────────────────────────────────────────────────────
// LOAD ORDER: AFTER js/db.js (inline <script> block) — BEFORE js/home.js
//
// DEPENDS ON (must be loaded/declared before this file):
//   config.js  → DB, CU, currentMonthKey, currentMonthRef, mealDate,
//                MONTH_FIELDS, monthsRef  (DB.feastMeals — ফিস্ট মিল এন্ট্রি)
//   utils.js   → messMonthKey(), dateInMessMonth(), _withMonthData(),
//                _histViewMode, safeHTML(), setHTML(), esc(), tod(),
//                getBSTDate(), getBSTHour(), sanitizeInput(), validAmount(),
//                _dimBounds()
//   core.js    → isActiveInMonth(), isOfficeMealUser(), getOfficeMealUsers(),
//                getOfficeMealRate(), fmtDate()
//                (also declares no-op stubs for invalidateMealIndex,
//                 invalidateMealRateCache, invalidateMemberCountsCache
//                 which are overridden below)
//   db.js      → saveMonth(), saveDB(), isOnline(), noNetPopup()
//   auth.js    → isManagerOrCtrl(), isController()
//   inline     → toast(), V(), showModal(), applyMessCycleBounds(),
//                updateDateLabel(), refreshHome()
//
// PROVIDES (callers depend on — must load AFTER this file):
//   home.js    → mTV(), calcMealRate(), messMonthMeals(), toISODate()
//   db.js      → loadMealDate(), invalidateMealIndex() [real impl],
//                invalidateMealRateCache() [real impl],
//                invalidateMemberCountsCache() [real impl]
//   utils.js   → invalidateMealIndex(), invalidateMealRateCache()
//   ui.js      → initMeal()
//   bill.js    → calcMealRate(), getNetMeals(), calcMemberOtherShares(),
//                getCookMeals(), getShortfallMeals(), getNetMemberMeals(),
//                getMemberFeastShare()
//   report.js  → calcMealRate(), getNetMeals(), calcMemberOtherShares()
//   admin.js   → calcMealRate(), getNetMeals(), getMemberFeastShare()
//   rules.js   → invalidateMealRateCache() (feast entry add/edit/delete-এ
//                calcMealRate() cache bাতিল করার জন্য — feastEntries/
//                feastTotal সেই cache-এরই অংশ)
// ─────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════
// MEAL
// ═══════════════════════════════════════════════
function initMeal(){
  // Default: tomorrow's date
  const tmr = nextDay(tod());
  mealDate = tmr;
  document.getElementById('meal-date').value=mealDate;
  // ✅ FIX: extendToNext=true — পরের মেস মাসের meal আগাম দেওয়া যাবে
  applyMessCycleBounds('meal-date', null, true);
  updateDateLabel('meal-date');
  appendDayToBNLabel('meal-date');
  loadMealDate();
}
function shiftDate(delta){
  const {minDate, maxDate} = getMessCycleBounds(null, true); // extendToNext
  const d=new Date(mealDate); d.setDate(d.getDate()+delta);
  const newDate=toISODate(d);
  // ✅ FIX: arrow দিয়ে navigate করলে extended bounds-এর বাইরে যাবে না
  if(newDate < minDate || newDate > maxDate) return;
  mealDate=newDate;
  document.getElementById('meal-date').value=mealDate;
  updateDateLabel('meal-date');
  appendDayToBNLabel('meal-date');
  loadMealDate();
}
function toISODate(d){ return d.toISOString().split('T')[0]; }
// fmtDate() moved to js/shared/core.js
function loadMealDate(){
  mealDate=document.getElementById('meal-date').value; if(!mealDate) return;
  document.getElementById('meal-sub').textContent=fmtDate(mealDate);
  const todStr=tod(), hour=getBSTHour();
  const tmr=nextDay(todStr);
  // Lock rules: past dates always locked for non-admin. Tomorrow after 9pm locked.
  const diff=dateDiff(todStr,mealDate);
  const locked=!isManagerOrCtrl()&&(diff<0||(diff===1&&hour>=21)||(diff===0));
  document.getElementById('meal-lock-notice').style.display=locked?'block':'none';
  const meal=DB.meals[CU.u+'_'+mealDate]||{b:{t:'off',q:1},l:{t:'off',q:1},d:{t:'off',q:1}};
  ['b','l','d'].forEach(t=>{
    const m=meal[t]||{t:'off',q:1};
    document.getElementById('qty-'+t).value=m.q||1;
    document.getElementById('qty-'+t).disabled=locked||(m.t==='off');
    hlPQO(t,m.t||'off',false);
    ['P','Q','off'].forEach(v=>{ const b=document.getElementById('btn-'+t+'-'+v); if(b) b.disabled=locked; });
    document.getElementById('lock-'+t).style.display=locked?'block':'none';
    document.getElementById('cfg-'+t).textContent='মিল মান: '+getCfg(t,mealDate,CU&&CU.type);
    calcMeal(t);
  });
  document.getElementById('save-meal-btn').disabled=locked;
}
function nextDay(d){ const dt=new Date(d); dt.setDate(dt.getDate()+1); return toISODate(dt); }
function dateDiff(from,to){ return Math.round((new Date(to)-new Date(from))/86400000); }
function setPQO(t,val){
  hlPQO(t,val,false);
  const qi=document.getElementById('qty-'+t);
  qi.disabled=(val==='off');
  if(val==='off') qi.value=1;
  calcMeal(t);
}
function hlPQO(t,val,adm){
  const px=adm?'adm-':'btn-';
  ['P','Q','off'].forEach(v=>{
    const b=document.getElementById(px+t+'-'+v);
    if(b) b.className='pqo-btn'+(val===v?' sel'+v:'');
  });
}
function calcMeal(t){
  const qty=parseInt(document.getElementById('qty-'+t).value)||1;
  const sel=getSel(t);
  const base=getCfg(t,mealDate,CU&&CU.type);
  let total=0,label='বন্ধ';
  if(sel==='P'){
    total=qty*base;
    const tag=qty>1?`P${qty}`:'P';
    label=`${tag} = ${qty}×${base} = ${total.toFixed(2)} মিল`;
  } else if(sel==='Q'){
    total=qty*base;
    const tag=qty>1?`Q${qty}`:'Q';
    label=`${tag} = ${qty}×${base} = ${total.toFixed(2)} মিল`;
  }
  document.getElementById('calc-'+t).textContent=label;
}
function getSel(t){
  for(const v of['P','Q','off']){
    const b=document.getElementById('btn-'+t+'-'+v);
    if(b && b.className.includes('sel'+v)) return v;
  }
  return 'off';
}
function saveMeal(){
  if(!isOnline()){ noNetPopup(); return; }
  const bT=getSel('b'),lT=getSel('l'),dT=getSel('d');
  const bQ=parseInt(document.getElementById('qty-b').value)||1;
  const lQ=parseInt(document.getElementById('qty-l').value)||1;
  const dQ=parseInt(document.getElementById('qty-d').value)||1;
  const bv=mealTypeValue('b',bT,bQ,mealDate,CU&&CU.type), lv=mealTypeValue('l',lT,lQ,mealDate,CU&&CU.type), dv=mealTypeValue('d',dT,dQ,mealDate,CU&&CU.type);
  const bLabel=bT==='off'?'off':(bQ>1?bT+bQ:bT);
  const lLabel=lT==='off'?'off':(lQ>1?lT+lQ:lT);
  const dLabel=dT==='off'?'off':(dQ>1?dT+dQ:dT);
  // ✅ FIX: raw ISO "YYYY-MM-DD" ভেঙে বাজেভাবে wrap হতো (toast/modal-এ)।
  // এখন "DD‑MM‑YYYY(বার)" ফরম্যাটে দেখানো হয় (app-এর বাকি জায়গার মতোই) —
  // আর সাধারণ '-' এর বদলে non-breaking hyphen (U+2011) ব্যবহার করা হয়েছে,
  // যাতে narrow toast card-এও তারিখটা মাঝখানে ভেঙে দুই লাইনে না যায়।
  const dispDate = fmtDate(mealDate).replace(/-/g,'\u2011')+'('+getBengaliDayAbbr(mealDate)+')';
  showModal('মিল সেভ করুন',
    `${dispDate} এর মিল:\n\n☀️ সকাল: ${bLabel} = ${bv.toFixed(2)} meals\n🌞 দুপুর: ${lLabel} = ${lv.toFixed(2)} meals\n🌙 রাত: ${dLabel} = ${dv.toFixed(2)} meals\n\nমোট: ${(bv+lv+dv).toFixed(2)} meals`,
    function(){ const _mk=CU.u+'_'+mealDate,_mv={b:{t:bT,q:bQ},l:{t:lT,q:lQ},d:{t:dT,q:dQ}};
    DB.meals[_mk]=_mv;
    // ✅ FIX: meal date যে মেস মাসে পড়ে, সেই bucket-এ save।
    // আগে সবসময় currentMonthRef-এ যেত — পরের মাসের meal ভুল bucket-এ পড়ত।
    const _mealMmKey = messMonthKey(new Date(mealDate));
    saveMealEntry(_mk,_mv,_mealMmKey);
    invalidateMealIndex(); invalidateMealRateCache(); invalidateMemberCountsCache();
    showMealSuccessAnim(dispDate); refreshHome(); }
  );
}
// বড় animated checkmark দিয়ে মিল সেভ কনফার্ম করে — সাধারণ toast()-এর চেয়ে
// বেশি gestural, যেহেতু এটা user-এর দিনের সবচেয়ে ঘন ঘন করা action।
let _mealSuccessTimer=null;
function showMealSuccessAnim(dispDate){
  const ov=document.getElementById('meal-success-ov');
  if(!ov) return;
  document.getElementById('meal-success-sub').textContent=dispDate+' এর মিল সফলভাবে সেভ হয়েছে';
  ov.classList.remove('show'); void ov.offsetWidth; // retrigger-safe animation reset
  ov.classList.add('show');
  clearTimeout(_mealSuccessTimer);
  _mealSuccessTimer=setTimeout(hideMealSuccessAnim,1900);
}
function hideMealSuccessAnim(){
  document.getElementById('meal-success-ov')?.classList.remove('show');
  clearTimeout(_mealSuccessTimer);
}
function fmtMealLine(t,q,v){
  if(t==='off') return 'off (বন্ধ)';
  const label=q>1?t+q:t;
  return `${label} = ${v.toFixed(2)} meals`;
}
function mealTypeValue(slot,type,qty,date,utype){
  if(type==='off') return 0;
  if(type==='P') return qty*getCfg(slot,date,utype);
  if(type==='Q') return qty*getCfg(slot,date,utype);
  return 0;
}

// ═══════════════════════════════════════════════
// CFG
// ═══════════════════════════════════════════════
function getCfg(t,dateStr,utype){
  const mmKey = dateStr ? messMonthKey(new Date(dateStr)) : messMonthKey();
  const grpKey = utype==='outside' ? 'outsider' : 'insider';

  // 1st: এই মেস মাসের specific config
  const mmCfg = DB.cfg[mmKey] && DB.cfg[mmKey][grpKey];
  if(mmCfg){
    if(mmCfg.byDate && mmCfg.byDate[dateStr] && mmCfg.byDate[dateStr][t]!==undefined)
      return mmCfg.byDate[dateStr][t];
    if(mmCfg.def && mmCfg.def[t]!=null) return mmCfg.def[t];
  }

  // 2nd: আগের মাসের config inherit করো (নতুন মাসে config set না হলে)
  // handoverDone list থেকে সবচেয়ে কাছের আগের মাস খোঁজো
  if(DB.handoverDone && DB.handoverDone.length > 0){
    const prevMonths = [...DB.handoverDone].sort().reverse()
      .filter(ho => ho < mmKey);
    for(const pm of prevMonths){
      const pmCfg = DB.cfg[pm] && DB.cfg[pm][grpKey];
      if(pmCfg && pmCfg.def && pmCfg.def[t]!=null) return pmCfg.def[t];
    }
  }

  // 3rd: পুরনো flat format fallback (migration-এর আগের data)
  const flatGrp = !mmCfg && DB.cfg[grpKey];
  if(flatGrp){
    if(flatGrp.byDate && flatGrp.byDate[dateStr] && flatGrp.byDate[dateStr][t]!==undefined)
      return flatGrp.byDate[dateStr][t];
    if(flatGrp.def && flatGrp.def[t]!=null) return flatGrp.def[t];
  }

  // 4th: hardcoded default
  return t==='l' ? 1.5 : 0.75;
}
function mTV(t,m,dateStr,utype){
  if(!m||m.t==='off') return 0;
  if(m.t==='P') return (m.q||1)*getCfg(t,dateStr,utype);
  if(m.t==='Q') return (m.q||1)*getCfg(t,dateStr,utype);
  return 0;
}
function dayMeals(uname,dateStr){
  const meal=DB.meals[uname+'_'+dateStr]; if(!meal) return 0;
  const u=DB.users.find(x=>x.u===uname);
  const utype=u?u.type:'inside';
  return ['b','l','d'].reduce((s,t)=>s+mTV(t,meal[t],dateStr,utype),0);
}

// ── Meal key index: per-user এর key list একবার build করে cache করি
// DB.meals-এর সব key scan করার বদলে user-specific list ব্যবহার হয়
let _mealKeyIndex = null; // { uname: [dateStr, ...] }
let _mealKeyIndexVersion = 0; // DB.meals change হলে invalidate
let _mealKeyIndexEpoch = 0;   // epoch counter — length collision এড়াতে
function _getMealKeyIndex(){
  const currentKeys = Object.keys(DB.meals||{});
  // ✅ epoch দিয়ে check — দুই মাসে same length হলেও ভুল index দেয় না
  if(!_mealKeyIndex || _mealKeyIndexVersion !== _mealKeyIndexEpoch){
    _mealKeyIndex = {};
    _mealKeyIndexVersion = _mealKeyIndexEpoch;
    currentKeys.forEach(k=>{
      if(k.length < 11) return;
      const dateStr = k.slice(-10);
      const uname   = k.slice(0, k.length - 11);
      if(!uname) return;
      if(!_mealKeyIndex[uname]) _mealKeyIndex[uname]=[];
      _mealKeyIndex[uname].push(dateStr);
    });
  }
  return _mealKeyIndex;
}
// Real override of core.js stub — runs after cache vars above are declared
function invalidateMealIndex(){ _mealKeyIndex = null; _mealKeyIndexVersion = -1; _mealKeyIndexEpoch++; }

function messMonthMeals(uname, mmKey){
  const idx = _getMealKeyIndex();
  const dates = idx[uname];
  if(!dates||!dates.length) return 0;
  const u = DB.users.find(x=>x.u===uname);
  const utype = u?u.type:'inside';
  let total = 0;
  const {startStr, endStr} = _dimBounds(mmKey);
  dates.forEach(dateStr=>{
    if(dateStr < startStr || dateStr > endStr) return;
    const meal = DB.meals[uname+'_'+dateStr];
    if(!meal) return;
    total += ['b','l','d'].reduce((s,t)=>s+mTV(t,meal[t],dateStr,utype), 0);
  });
  return total;
}
// ── Shortfall helpers ──
function getShortfallMeals(uname, mmKey){
  if(!DB.shortfall) return 0;
  return parseFloat(DB.shortfall[uname+'_'+mmKey]||0);
}
function getNetMemberMeals(uname, mmKey){
  return messMonthMeals(uname, mmKey) + getShortfallMeals(uname, mmKey);
}

// ═══════════════════════════════════════════════
// MEAL RATE CALCULATION
// সূত্র: মিলরেট = (বাজার + অন্যান্য) / নেট মিল
// নেট মিল = সবার মোট মিল - বাবুর্চির মিল
// বাবুর্চি বিল (cookBills) মিলরেটে যোগ হয় না — আলাদা শেয়ার
// ═══════════════════════════════════════════════
function getCookMeals(mmKey){
  // বাবুর্চির (type='cook') মোট মিল
  let cookMeals=0;
  DB.users.filter(u=>u.type==='cook' && isActiveInMonth(u,mmKey)).forEach(u=>{ cookMeals+=messMonthMeals(u.u,mmKey); });
  return cookMeals;
}
function getNetMeals(mmKey){
  // নেট মিল = সবার মোট মিল (shortfall সহ) - বাবুর্চির মিল - অফিস মিলের মিল
  let totalMeals=0;
  DB.users.forEach(u=>{ totalMeals+=getNetMemberMeals(u.u,mmKey); });
  const cookMeals=getCookMeals(mmKey); // cook এর shortfall নেই, actual meals
  // অফিস মিল (MEPL/MPCL) বাদ দিতে হবে — আলাদা রেটে হিসাব হয়
  let officeMeals=0;
  DB.users.filter(u=>isOfficeMealUser(u)).forEach(u=>{ officeMeals+=getNetMemberMeals(u.u,mmKey); });
  // নেট মিল = সদস্যদের মিল (বাবুর্চি বাদ, অফিস মিল বাদ)
  return {totalMeals, cookMeals, officeMeals, netMeals: totalMeals-cookMeals-officeMeals};
}
// ── calcMealRate result cache — একই মাসে বারবার call হলে recalc নয় ──
let _mealRateCache = {};
// Real override of core.js stub — runs after _mealRateCache above is declared
function invalidateMealRateCache(){ _mealRateCache = {}; }

// ═══════════════════════════════════════════════
// FEAST MEAL (ফিস্ট মিল) — বাজার/মিল রেট হিসাব থেকে সম্পূর্ণ আলাদা
// ভাগ হয় মিল-ইউনিট অনুপাতে (headcount না), শুধু সেই date+slot-এ যাদের
// মিল 'off' ছিল না তাদের মধ্যে।
// ✅ FIX (2026-08-05): রেট এখন বাবুর্চি সহ সবার মোট ইউনিট দিয়ে বের হয়
// (আগে বাবুর্চি বাদ দিয়ে হতো, ফলে বাবুর্চির অংশটা বাকিদের রেটে চুপচাপ
// মিশে যেত)। বাবুর্চির নিজের ইউনিট আলাদা রাখা হয় যাতে তার সমমূল্যের
// টাকাটা (rate×cookUnits) সরাসরি cookFoodCost-এ যোগ করে, নিয়মিত মিলের
// বাবুর্চি-খরচের মতোই Inside/Outside ওজন অনুযায়ী পুনর্বণ্টন করা যায় —
// বাবুর্চি নিজে এখনও কিছু বিল পায় না (getMemberFeastShare-এ অপরিবর্তিত)।
// ═══════════════════════════════════════════════
function _feastSlotUnits(dateStr, slot){
  // সেই তারিখ+বেলায় (b/l/d) সবার মোট মিল-ইউনিট (বাবুর্চি সহ), আর
  // বাবুর্চির নিজের ইউনিট আলাদা করে — দুটোই লাগবে rate আর cookShare বের করতে
  let units=0, cookUnits=0;
  DB.users.forEach(u=>{
    const meal=DB.meals[u.u+'_'+dateStr];
    const m=meal&&meal[slot];
    if(!m||m.t==='off') return;
    const q=(m.q||1);
    units += q;
    if(u.type==='cook') cookUnits += q;
  });
  return {units, cookUnits};
}

function calcMealRate(mmKey){
  if(_mealRateCache[mmKey]) return _mealRateCache[mmKey];
  const bazar      = DB.bazar.filter(b=>dateInMessMonth(b.date,mmKey)).reduce((s,b)=>s+b.amount,0);
  const othersAll  = DB.others.filter(o=>dateInMessMonth(o.date,mmKey));
  const others     = othersAll.reduce((s,o)=>s+o.amount,0);
  const cookBillsAll  = []; // বাবুর্চির আলাদা বিল নেই — বাজারের সাথেই খায়
  const cookBillsTotal = 0;

  // ফিস্ট মিল — আলাদা হিসাব, `total`-এ যোগ হয় না (spec অনুযায়ী)
  // ✅ FIX (2026-08-05): rate = amount ÷ (বাবুর্চি সহ মোট ইউনিট)। বাবুর্চির
  // ভাগ (rate×cookUnits) সরাসরি বিল করা হয় না — cookShare হিসেবে জমা রেখে
  // নিচে cookFoodCost-এ যোগ করা হয়।
  const feastEntries = (DB.feastMeals||[]).filter(f=>dateInMessMonth(f.date,mmKey)).map(f=>{
    const {units, cookUnits} = _feastSlotUnits(f.date, f.slot);
    const rate  = units>0 ? f.amount/units : 0;
    const cookShare = rate * cookUnits; // বাবুর্চির ফিস্ট-মিলের সমমূল্য (তাকে বিল হয় না)
    return {...f, units, cookUnits, rate, cookShare};
  });
  const feastTotal = feastEntries.reduce((s,f)=>s+f.amount,0);
  const feastCookTotal = feastEntries.reduce((s,f)=>s+(f.cookShare||0),0); // সব entry মিলিয়ে বাবুর্চির অংশ

  const total = bazar + others; // cookBills আর নেই, feast-ও নেই

  const {totalMeals, cookMeals, officeMeals, netMeals} = getNetMeals(mmKey);

  // ════════════════════════════════════════════════
  // সঠিক মিল রেট সূত্র:
  //   B  = বাজার খরচ
  //   O  = অফিস মিল বিল (MEPL+MPCL)
  //   M  = মোট মিল (অফিস বাদে, বাবুর্চি সহ)
  //   C  = বাবুর্চির মিল
  //   R  = রেগুলার মিল (M − C)
  //
  //   X   = B − O
  //   r₁  = X ÷ M
  //   CB  = r₁ × C   (বাবুর্চির খাবার খরচ)
  //   FR  = (X − CB) ÷ R  =  X ÷ M  (গাণিতিকভাবে সমান)
  // ════════════════════════════════════════════════

  // অফিস মিল বিল O = officeMeals × officeRate
  const officeRate = DB.officeMealRates[mmKey] || 0;
  const officeBil  = officeMeals * officeRate;

  // M = totalMeals − officeMeals (বাবুর্চি সহ, কিন্তু অফিস বাদ)
  const M = totalMeals - officeMeals;
  const C = cookMeals;
  const R = M - C; // রেগুলার সদস্যদের মিল

  const X  = bazar - officeBil;          // বাকি বাজার
  const r1 = M > 0 ? X / M : 0;         // প্রাথমিক রেট
  const CB = r1 * C;                     // বাবুর্চির খাবার খরচ (rateBase থেকে)
  const FR = R > 0 ? (X - CB) / R : r1; // ফাইনাল মিল রেট (= X/M)

  const rateBase = X; // UI-তে "বাকি বাজার" দেখানোর জন্য
  // ✅ FIX (2026-08-05): cookFoodCost এখন নিয়মিত মিলের CB + ফিস্ট-মিলে
  // বাবুর্চির অংশ (feastCookTotal) — দুটো মিলিয়েই Inside/Outside ওজন
  // অনুযায়ী calcMemberOtherShares()-এ পুনর্বণ্টন হবে, আগের নিয়মেই।
  const cookFoodCost = CB + feastCookTotal;

  // Override দিয়ে manual rate সেট থাকলে সেটা ব্যবহার হবে
  const pm = DB.mealRates[mmKey] || FR;

  const result = {bazar, others, othersAll, cookBillsTotal, cookBillsAll,
          total, rateBase, officeBil,
          totalMeals, cookMeals, officeMeals, netMeals, M, C, R,
          X, r1, cookFoodCost, pm,
          feastEntries, feastTotal, feastCookTotal};
  _mealRateCache[mmKey] = result; // cache করো
  return result;
}

// Calculate a single member's share of others + cook food cost
// ── nonCookMembers counts cache — bill calc-এ ২০০ বার filter চলত ──
let _memberCountsCache = null;
// ── কোনো user নির্দিষ্ট মাসে active ছিল কিনা ──
// isActiveInMonth() moved to js/shared/core.js

function _getMemberCounts(mmKey=null){
  // mmKey দিলে সেই মাসের active members ফিল্টার করো (cache bypass)
  if(!mmKey && _memberCountsCache) return _memberCountsCache;
  let nonCookMembers = DB.users.filter(x=>
    x.type!=='cook' &&
    !isOfficeMealUser(x) &&
    (!mmKey || isActiveInMonth(x, mmKey))
  );
  // ✅ FIX (2026-07-30): calcMemberOtherShares()-এ outside সদস্য netMeals===0
  // হলে তার others/cookFood বিল বাদ যায় (ইচ্ছাকৃত) — কিন্তু সে headcount-এ
  // থেকে যেত বলে বাকিদের ভাগের হর (denominator) অপরিবর্তিত থেকে যেত, ফলে
  // তার ভাগের টাকাটা কারো নামেই না উঠে হারিয়ে যেত (real data-তে ৳221.65/
  // মাস ধরা পড়েছে, 2026-07 cycle — ৫ জন শূন্য-মিল outside সদস্যের কারণে)।
  // এখন mmKey থাকলে তাদের headcount থেকেই বাদ, যাতে তাদের ভাগ বাকি
  // (মিল-খাওয়া) সদস্যদের মধ্যে একই outside50/equal নিয়মেই পুনর্বণ্টন হয় —
  // মেসের কোনো ক্ষতি হিসেবে না গিয়ে।
  if(mmKey){
    nonCookMembers = nonCookMembers.filter(x=>{
      if(x.type!=='outside') return true;
      const net = messMonthMeals(x.u, mmKey) + getShortfallMeals(x.u, mmKey);
      return net > 0;
    });
  }
  const insideCount  = nonCookMembers.filter(x=>x.type==='inside').length;
  const outsideCount = nonCookMembers.filter(x=>x.type==='outside').length;
  const result = {nonCookMembers, insideCount, outsideCount};
  if(!mmKey) _memberCountsCache = result; // current month → cache
  return result;
}
// Real override of core.js stub — runs after _memberCountsCache above is declared
function invalidateMemberCountsCache(){ _memberCountsCache = null; }

function calcMemberOtherShares(u, mmKey, othersAll, cookBillsAll, cookFoodCost=0, netMeals=null){
  // ✅ FIX: বাবুর্চির নিজের কোনো share নেই
  // তাদের খাবার খরচ ইতিমধ্যে অন্য সদস্যদের cookFoodShare-এ যোগ হয়ে যায়
  if(u.type==='cook') return {othersShare:0, cookBillShare:0, cookFoodShare:0};
  // অফিস মিল ইউজারদের বাবুর্চি ও অন্যান্য খরচ বহন করতে হয় না
  if(isOfficeMealUser(u)) return {othersShare:0, cookBillShare:0, cookFoodShare:0};
  // ✅ NEW FIX: Outsider সদস্য এই মাসে একটাও মিল না খেলে (netMeals===0)
  // তার নামে others/cook বিল আসবে না।
  // netMeals===null মানে caller এখনো পুরনো (parameter ছাড়া) — তখন এই skip
  // চালু হবে না, আগের আচরণ অক্ষত থাকবে (backward-compatible)।
  if(u.type==='outside' && netMeals===0) return {othersShare:0, cookBillShare:0, cookFoodShare:0};
  // ✅ mmKey দিয়ে — historical month-এ শুধু সেই সময়ের active members গণনা
  const {nonCookMembers, insideCount, outsideCount} = _getMemberCounts(mmKey);

  // অন্যান্য খরচ — প্রতি entry-র split rule অনুযায়ী
  let othersShare = 0;
  othersAll.forEach(o=>{
    const split = o.split||'equal';
    if(split==='equal'){
      othersShare += o.amount / (nonCookMembers.length||1);
    } else {
      // outside50: inside = full unit, outside = 0.5 unit
      const denom = insideCount + outsideCount*0.5;
      if(denom>0){
        const unit = o.amount / denom;
        othersShare += u.type==='inside' ? unit : unit*0.5;
      }
    }
  });

  // বাবুর্চির খাবার খরচ (CB) — Inside=পূর্ণ, Outside=৫০%
  let cookFoodShare = 0;
  if(cookFoodCost > 0){
    const denom = insideCount + outsideCount*0.5;
    if(denom > 0){
      const unit = cookFoodCost / denom;
      cookFoodShare = u.type==='inside' ? unit : unit*0.5;
    }
  }

  return {othersShare, cookBillShare: 0, cookFoodShare};
}

// ═══════════════════════════════════════════════
// FEAST MEAL — সদস্যের ভাগ
// calcMealRate()-এর feastEntries (প্রতি entry-তে units+rate সহ) ব্যবহার করে
// প্রতিটা entry-তে ওই সদস্যের সেই date+slot-এর মিল qty অনুযায়ী ভাগ যোগ করে।
// বাবুর্চি এখানে বাদ (সরাসরি বিল পায় না) — কিন্তু rate নিজেই বাবুর্চির
// ইউনিট ধরে বের করা, আর তার ভাগ ইতিমধ্যে cookFoodCost-এ (calcMealRate) যোগ
// হয়ে গেছে — তাই এখানে বাদ দেওয়া মানেই টাকাটা হারিয়ে যাওয়া না।
// ⚠️ calcMemberOtherShares()-এর মতো office/zero-net-meal skip এখানে ইচ্ছাকৃতভাবে
// নেই — ফিস্টে সবাই (Inside/Outside/Office) ঢোকে, শুধু বাবুর্চি বাদ, আর প্রতিটা
// entry স্বাধীনভাবে সেই date+slot-এ 'off' কিনা তার উপর নির্ভর করে, মাসের মোট
// মিলের উপর না।
// ═══════════════════════════════════════════════
function getMemberFeastShare(u, feastEntries){
  if(!u || u.type==='cook' || !feastEntries || !feastEntries.length) return 0;
  let share=0;
  feastEntries.forEach(f=>{
    if(f.rate<=0) return;
    const meal=DB.meals[u.u+'_'+f.date];
    const m=meal&&meal[f.slot];
    if(!m||m.t==='off') return;
    share += f.rate*(m.q||1);
  });
  return share;
}
