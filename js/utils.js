// ═══════════════════════════════════════════════
// js/utils.js
// XSS protection, validators, BST date helpers,
// mess month logic, history cache, _withMonthData
// Load order: AFTER config.js, BEFORE core.js + db.js
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// XSS PROTECTION — safeHTML wrapper
// ═══════════════════════════════════════════════
function safeHTML(html){
  if(typeof DOMPurify !== 'undefined'){
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS:['div','span','b','br','small','table','thead','tbody','tfoot','tr','th','td','p','strong','em','button','input','textarea','a','select','option','label'],
      ALLOWED_ATTR:['id','style','class','colspan','rowspan','type','value','data-id','data-uname','data-action','data-card-id','disabled','placeholder','readonly','for','selected','checked']
    });
  }
  return html; // fallback if CDN fails
}
function setHTML(id, html){
  const el = document.getElementById(id);
  if(el) el.innerHTML = safeHTML(html);
}
// Escape plain text to prevent injection via textContent patterns
function esc(str){ return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }

// ═══════════════════════════════════════════════
// INPUT VALIDATION HELPERS
// ═══════════════════════════════════════════════
function validName(s){ return s && s.trim().length>=2 && s.trim().length<=60; }
function validMobile(s){ return /^01[3-9]\d{8}$/.test(s); }
function validEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length<=120; }
function validPass(s){ return s && s.length>=6 && s.length<=100; }
function validUsername(s){ return s && /^[a-zA-Z0-9_\-\.]{3,30}$/.test(s); }
function validAmount(v){ return !isNaN(v) && v > 0 && v < 10000000; }
function sanitizeInput(s){
  // ✅ FIX BUG-06: শুধু trim ও length-limit।
  // HTML encoding এখানে করলে render-এর সময় esc() দিয়ে double-encode হয়:
  // "&" → "&amp;" (storage) → "&amp;amp;" (display) → user দেখে "&amp;"
  // HTML encoding সম্পূর্ণভাবে render layer-এর দায়িত্ব: esc() বা safeHTML()।
  return String(s||'').trim().slice(0,200);
}


// ═══════════════════════════════════════════════
// BST TIME HELPERS (Asia/Dhaka = UTC+6)
// Bug fix: toLocaleString→new Date→toISOString was re-converting to UTC
// Correct approach: extract parts directly from Dhaka locale string
// ═══════════════════════════════════════════════
function getBSTDate(){
  // Returns a Date object whose local methods (getDate, getMonth etc.)
  // reflect Dhaka time — done by offsetting UTC by +6h
  const now = new Date();
  const dhaka = new Date(now.toLocaleString('en-US', {timeZone:'Asia/Dhaka'}));
  return dhaka;
}
function tod(){
  // Return YYYY-MM-DD in Dhaka timezone without UTC re-conversion
  const now = new Date();
  const parts = now.toLocaleDateString('en-CA', {timeZone:'Asia/Dhaka'}); // en-CA gives YYYY-MM-DD
  return parts; // Already YYYY-MM-DD
}
function getBSTHour(){
  const now = new Date();
  return parseInt(now.toLocaleString('en-US', {timeZone:'Asia/Dhaka', hour:'numeric', hour12:false}), 10);
}
function mk(d){
  if(d) return new Date(d).toISOString().slice(0,7);
  // Use Dhaka timezone for current month
  const now = new Date();
  return now.toLocaleDateString('en-CA', {timeZone:'Asia/Dhaka'}).slice(0,7);
}

// ═══════════════════════════════════════════════
// MESS MONTH: 11th to 10th
// ═══════════════════════════════════════════════
function getMessMonth(d){
  const dt = d || getBSTDate();
  const day = dt.getDate();
  let y = dt.getFullYear(), m = dt.getMonth(); // 0-indexed
  if(day < 11){ m -= 1; if(m<0){m=11;y--;} }
  return {y, m}; // start month
}
function messMonthLabel(d){
  const {y,m} = getMessMonth(d);
  const nm = (m+1)%12, ny = m===11?y+1:y;
  const mnames=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  return `${mnames[m]} ১১ – ${mnames[nm]} ১০, ${y}`;
}
function messMonthKey(d){
  const {y,m} = getMessMonth(d);
  return `${y}-${String(m+1).padStart(2,'0')}`;
}
// ── dateInMessMonth bounds cache (string compare — no Date objects) ──
const _dimCache = new Map();
function _dimBounds(mmKey){
  if(_dimCache.has(mmKey)) return _dimCache.get(mmKey);
  const [my,mm] = mmKey.split('-').map(Number);
  const nm = mm===12?1:mm+1, ny = mm===12?my+1:my;
  const startStr = my+'-'+String(mm).padStart(2,'0')+'-11';
  const endStr   = ny+'-'+String(nm).padStart(2,'0')+'-10';
  const bounds = {startStr, endStr};
  _dimCache.set(mmKey, bounds);
  return bounds;
}
function dateInMessMonth(dateStr, mmKey){
  if(!dateStr||!mmKey) return false;
  const {startStr, endStr} = _dimBounds(mmKey);
  return dateStr >= startStr && dateStr <= endStr;
}
// পরবর্তী মাসের key  e.g. "2026-04" → "2026-05"
function nextCycleKey(mmKey){
  const [y,m]=mmKey.split('-').map(Number);
  const nm=m===12?1:m+1, ny=m===12?y+1:y;
  return `${ny}-${String(nm).padStart(2,'0')}`;
}
// নির্দিষ্ট মাসের পূর্ববর্তী ব্যালেন্স
// DB.prevBalances[mmKey][uname] — প্রতি মাস আলাদা
function getPreBal(uname, mmKey){
  return (DB.prevBalances&&DB.prevBalances[mmKey]&&DB.prevBalances[mmKey][uname]!=null)
    ? DB.prevBalances[mmKey][uname] : 0;
}
function buildMessMonthOptions(){
  const sel = document.getElementById('rpt-month'); if(!sel) return;
  fillHistorySelect(sel, 24);
}
// যেকোনো <select> এ মেস চক্র options ভরো
function fillMessCycleSelect(sel, months=12, addBlank=false){
  if(!sel) return;
  const mnames=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  const now = getBSTDate();
  const currentKey = messMonthKey();
  sel.innerHTML='';
  if(addBlank){
    const blank=document.createElement('option');
    blank.value=''; blank.textContent='-- মাস সিলেক্ট করুন --';
    sel.appendChild(blank);
  }
  for(let i=0;i<months;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 15);
    const key = messMonthKey(d);
    const {y,m} = getMessMonth(d);
    const nm=(m+1)%12, ny=m===11?y+1:y;
    const opt=document.createElement('option');
    opt.value=key;
    opt.textContent=`${mnames[m]} ১১ – ${mnames[nm]} ১০, ${y}`;
    // addBlank=true হলে auto-select করবো না
    if(key===currentKey && !addBlank) opt.selected=true;
    sel.appendChild(opt);
  }
}

// ── ইতিহাস screen: মাস dropdown populate ──
function fillHistorySelect(sel, months=12){
  if(!sel) return;
  const mnames=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  const currentKey = messMonthKey();

  // options render helper — selection preserve করে
  function _renderOpts(keys){
    const prev = sel.value;
    sel.innerHTML = '<option value="">-- মাস সিলেক্ট করুন --</option>';
    keys.forEach(key => {
      const {y,m} = getMessMonth(new Date(key+'-15'));
      const nm = (m+1)%12;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${mnames[m]} ১১ – ${mnames[nm]} ১০, ${y}`;
      if(key === prev) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ── Step 1 (sync): handoverDone + current month সাথে সাথে দেখাও ──
  const fromHandover = [...new Set([...(DB.handoverDone||[]), currentKey])].sort().reverse();
  _renderOpts(fromHandover);

  // ── Step 2 (async): Firebase months bucket থেকে বাকি মাস নাও ──
  // FIX: handoverDone empty বা incomplete থাকলেও Firebase-এ যে মাসের
  // data আছে সেগুলো dropdown-এ দেখাবে।
  // Bug: DB.handoverDone === null হলে শুধু current month দেখাত —
  // আগের মাসের data থাকলেও select করার উপায় ছিল না।
  if(monthsRef){
    monthsRef.once('value').then(snap => {
      if(!snap.exists()) return;
      const fbKeys = Object.keys(snap.val() || {});
      const combined = [...new Set([...fbKeys, ...(DB.handoverDone||[]), currentKey])].sort().reverse();
      // নতুন মাস পাওয়া গেলেই re-render করো
      if(combined.length > fromHandover.length){
        _renderOpts(combined);
      }
    }).catch(() => {});
  }
}

// ── Session-level historical data cache — Firebase reads কমাতে ──
const _histCache = {};
function _cacheMonth(mmKey, data){ _histCache[mmKey] = data; }
function _getCached(mmKey){ return _histCache[mmKey] || null; }
// current month data পরিবর্তন হলে cache clear করো
function _clearHistCache(){ Object.keys(_histCache).forEach(k=>delete _histCache[k]); }

// ── DB temporary swap করে renderFn চালায়, তারপর restore করে ──
function _swapAndRender(hist, renderFn){
  const saved = {};
  MONTH_FIELDS.forEach(f=>{ saved[f]=DB[f]; });

  // ✅ FIX: Firebase array fields normalize করো
  // Bug: Firebase-এ bazar/others/transactions/cookBills object হিসেবে store হয়
  // (e.g. {"1780489892497": {id,desc,amount,...}})।
  // hist[f] সরাসরি DB[f]-এ রাখলে .filter()/.map() crash করে।
  // _ensureArr() → Array.isArray check করে, object হলে Object.values() দেয়।
  const _HIST_ARR = new Set(['bazar','others','transactions','cookBills']);
  MONTH_FIELDS.forEach(f=>{
    if(!hist[f]){
      // data নেই — সঠিক default দাও
      DB[f] = (f==='meals'||f==='managers'||f==='mealRates'||f==='officeMealRates'||f==='officeMealNotes') ? {} : [];
    } else if(_HIST_ARR.has(f)){
      // _ensureArr: db.js-এ defined (global)। inline fallback safety-র জন্য।
      DB[f] = (typeof _ensureArr==='function')
        ? _ensureArr(hist[f])
        : (Array.isArray(hist[f]) ? hist[f] : Object.values(hist[f]||{}).filter(Boolean));
    } else {
      DB[f] = hist[f];
    }
  });

  invalidateMealIndex(); invalidateMealRateCache();
  try{ renderFn(); } finally {
    MONTH_FIELDS.forEach(f=>{ DB[f]=saved[f]; });
    invalidateMealIndex(); invalidateMealRateCache();
  }
}

// ── Lazy load: placeholder → message, current → DB, past → Firebase (cached) ──
let _histViewMode = false; // ইতিহাস দেখার সময় edit/delete লুকাতে
function _withMonthData(mmKey, loadingEl, renderFn, forceRefresh=false){
  if(!mmKey){
    if(loadingEl) loadingEl.innerHTML='<p class="muted tc" style="padding:24px 0;font-size:13px">📅 উপরের dropdown থেকে মাস সিলেক্ট করুন</p>';
    return;
  }
  if(mmKey === currentMonthKey){
    _histViewMode = false;
    if(!forceRefresh){ renderFn(); return; }
    // forceRefresh: DB-তেই current data আছে — snapshot নিয়ে _swapAndRender চালাও
    // (past month এর মত লোড হচ্ছে দেখাও, তারপর render)
    if(loadingEl) loadingEl.innerHTML='<p class="muted tc" style="padding:24px 0">⏳ লোড হচ্ছে...</p>';
    const snap = {};
    MONTH_FIELDS.forEach(f=>{ snap[f]=DB[f]; });
    setTimeout(()=>{ _swapAndRender(snap, renderFn); }, 50);
    return;
  }
  // Past month — cache check (forceRefresh হলে cache bypass করো)
  const cached = !forceRefresh && _getCached(mmKey);
  if(cached){
    _histViewMode = true;
    _swapAndRender(cached, renderFn);
    _histViewMode = false;
    return;
  }
  // Firebase থেকে লোড করো
  if(loadingEl) loadingEl.innerHTML='<p class="muted tc" style="padding:24px 0">⏳ লোড হচ্ছে...</p>';
  monthsRef.child(mmKey).once('value').then(snap=>{
    const hist = snap.val()||{};
    const isCurrent = (mmKey === currentMonthKey);
    if(!isCurrent) _cacheMonth(mmKey, hist); // current month cache করবো না
    _histViewMode = !isCurrent;
    _swapAndRender(hist, renderFn);
    _histViewMode = false;
  }).catch(e=>{
    console.error('_withMonthData error:',e);
    // ✅ FIX: _histViewMode reset করো
    // Bug: error হলে _histViewMode = true রয়ে যেত।
    // ফলে current month-এ ফিরে গেলেও edit/delete buttons দেখা যেত না।
    _histViewMode = false;
    if(loadingEl) loadingEl.innerHTML='<p class="muted tc">❌ লোড ব্যর্থ। পুনরায় চেষ্টা করুন।</p>';
  });
}

// ═══════════════════════════════════════════════
// BENGALI DAY NAME HELPERS
// বাংলা বার সংক্ষেপ: রবি / সোম / মঙ্গল / বুধ / বৃহঃ / শুক্র / শনি
// ═══════════════════════════════════════════════
const BANGLA_DAYS_SHORT = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];

function getBengaliDayAbbr(dateStr){
  if(!dateStr) return '';
  // T12:00:00 দিয়ে timezone edge case এড়ানো হচ্ছে
  const d = new Date(dateStr + 'T12:00:00');
  return BANGLA_DAYS_SHORT[d.getDay()] || '';
}

// date-display-label স্প্যানে বার যোগ করে — যেমন: 04-06-2026(বৃহঃ)
// inputId: date input এর id (e.g. 'meal-date')
// labelId: optional custom label id, না দিলে inputId+'-lbl' ধরা হয়
function appendDayToBNLabel(inputId, labelId){
  const input = document.getElementById(inputId);
  const lbl   = document.getElementById(labelId || (inputId + '-lbl'));
  if(!input || !lbl || !input.value) return;
  const day = getBengaliDayAbbr(input.value);
  if(!day) return;
  // আগের (বার) অংশ সরিয়ে নতুন করে জুড়ি
  const baseText = lbl.textContent.replace(/\s*\([^)]*\)\s*$/, '').trim();
  lbl.textContent = baseText + '(' + day + ')';
}

