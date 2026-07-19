// ═══════════════════════════════════════════════
// js/report.js
// Monthly mess report renderer + Monthly Report/Bill PDF generation
//
// Load order: AFTER meal.js
//             BEFORE final inline bootstrap <script>
//
// Depends on (all global):
//   config.js  → DB
//   utils.js   → _withMonthData(), safeHTML(), esc(), messMonthKey(),
//                messMonthLabel(), dateInMessMonth(), tod(), getPreBal()
//   core.js    → isActiveInMonth(), isOfficeMealUser(), getOfficeMealRate(),
//                fmtDate()
//   meal.js    → calcMealRate(), calcMemberOtherShares(), messMonthMeals(),
//                getShortfallMeals(), getMemberFeastShare(), mTV()
//   db.js      → toast()
//   Third-party (CDN, loaded in index.html) → jsPDF, html2canvas
//
// Exposes (global, used by inline onclick):
//   loadReport()          ← onchange / onclick in sc-report HTML
//   _doLoadReport()        ← internal, called by loadReport via _withMonthData
//   makePDF(type)          ← onclick in sc-report ('report') and sc-mybill
//                            ('bill') screens (admin.js)
//   _doMakePDF(type)       ← internal, called by makePDF via _withMonthData
//   closePrintOverlay()    ← onclick "✕ বন্ধ করুন" on the print overlay
//
// HTML DOM targets:
//   #rpt-month  (read)   — month selector <select>
//   #rpt-rows   (write)  — report output container
//   #print-overlay, #print-overlay-title, #print-overlay-content (write)
//                         — full-screen PDF preview overlay
//
// Moved in: 2026-07-18 — makePDF()/_doMakePDF()/closePrintOverlay() moved
// here from js/admin.js (was getting too large to maintain). Daily PDF
// (downloadDayPDF()/toASCII()) stayed in admin.js — separate, independent
// implementation, doesn't call into this file.
// ═══════════════════════════════════════════════

function loadReport(forceRefresh=false){
  const mmKey=document.getElementById('rpt-month').value; if(!mmKey) return;
  const rptEl=document.getElementById('rpt-rows'); // ✅ সঠিক element (rpt-content নেই)
  // current month-এ _withMonthData forceRefresh ignore করে, তাই আগেই সব cache clear করো
  if(forceRefresh){ invalidateMealIndex(); invalidateMealRateCache(); invalidateMemberCountsCache(); }
  _withMonthData(mmKey, rptEl, ()=>_doLoadReport(mmKey), forceRefresh);
}

function _doLoadReport(mmKey){
  const {bazar,others,othersAll,cookBillsTotal,cookBillsAll,total,totalMeals,cookMeals,officeMeals,netMeals,M,C,R,X,r1,pm,cookFoodCost,officeBil,feastTotal}=calcMealRate(mmKey);

  const [my,mm]=mmKey.split('-').map(Number);
  const nm=mm===12?1:mm+1;
  const mnames=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  const monthRangeLabel=`${mnames[mm-1]} ১১ – ${mnames[nm-1]} ১০, ${my}`;

  // ✅ FIX: officeMealBill আলাদাভাবে recompute করা হতো (getOfficeMealUsers()+
  // messMonthMeals() দিয়ে), যা calcMealRate()-এর officeBil-এর সাথে duplicate
  // ছিল কিন্তু shortfall যোগ করত না — ফলে meal count (officeMeals, শর্টফল সহ)
  // আর bill amount (officeMealBill, শর্টফল ছাড়া) ভবিষ্যতে অসামঞ্জস্যপূর্ণ হতে
  // পারত। calcMealRate()-এর officeBil সরাসরি ব্যবহার করাই সঠিক ও সামঞ্জস্যপূর্ণ।
  const officeMealBill=officeBil;

  const html=`
  <div class="summary-hero-card" style="border-radius:14px;padding:18px 18px 14px;">
    <div style="font-size:12px;opacity:.8;margin-bottom:6px">${monthRangeLabel}</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <div style="font-size:36px;font-weight:800;line-height:1">৳ ${pm.toFixed(2)}</div>
        <div style="font-size:12px;opacity:.8;margin-top:3px">প্রতি মিল রেট</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700">৳ ${(total+(feastTotal||0)).toLocaleString()}</div>
        <div style="font-size:12px;opacity:.8;margin-top:2px">মোট খরচ</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1px;background:rgba(255,255,255,0.2);border-radius:10px;overflow:hidden;margin-bottom:8px">
      <div class="hero-cell" style="padding:10px;text-align:center">
        <div style="font-size:15px;font-weight:700">৳${bazar.toLocaleString()}</div>
        <div style="font-size:10px;opacity:.8;margin-top:2px">বাজার</div>
      </div>
      <div class="hero-cell" style="padding:10px;text-align:center">
        <div style="font-size:15px;font-weight:700">৳${others.toLocaleString()}</div>
        <div style="font-size:10px;opacity:.8;margin-top:2px">অন্যান্য</div>
      </div>
      <div class="hero-cell" style="padding:10px;text-align:center">
        <div style="font-size:15px;font-weight:700">৳${(cookFoodCost||0).toFixed(0)}</div>
        <div style="font-size:10px;opacity:.8;margin-top:2px">বাবুর্চি বিল</div>
      </div>
      <div class="hero-cell" style="padding:10px;text-align:center">
        <div style="font-size:15px;font-weight:700">৳${(feastTotal||0).toLocaleString()}</div>
        <div style="font-size:10px;opacity:.8;margin-top:2px">Feast Meal বিল</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:rgba(255,255,255,0.2);border-radius:10px;overflow:hidden">
      <div class="hero-cell" style="padding:10px;text-align:center">
        <div style="font-size:16px;font-weight:700">${(R||netMeals).toFixed(2)}</div>
        <div style="font-size:10px;opacity:.8;margin-top:2px">নেট মিল (সবার)</div>
      </div>
      <div class="hero-cell" style="padding:10px;text-align:center">
        <div style="font-size:16px;font-weight:700;color:#fcd34d">${cookMeals.toFixed(2)}</div>
        <div style="font-size:10px;opacity:.8;margin-top:2px">বাবুর্চির মিল</div>
      </div>
      <div class="hero-cell" style="padding:10px;text-align:center">
        <div style="font-size:12px;font-weight:700;color:#7dd3fc">MEPL+MPCL</div>
        <div style="font-size:13px;font-weight:700;color:#7dd3fc">${officeMeals.toFixed(1)}মিল</div>
        <div style="font-size:12px;font-weight:700;color:#7dd3fc">৳${officeMealBill.toFixed(0)}</div>
      </div>
    </div>
  </div>`;

  document.getElementById('rpt-rows').innerHTML = safeHTML(html);
}

// ═══════════════════════════════════════════════
// MONTHLY REPORT / BILL PDF — moved from js/admin.js
// Moved in: 2026-07-18 | Original admin.js lines: 891–1180
// Functions: makePDF(), _doMakePDF(), closePrintOverlay()
// ═══════════════════════════════════════════════

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
    const {bazar,others,othersAll,cookBillsAll,total,totalMeals,cookMeals,pm,cookFoodCost,feastEntries,feastTotal} = calc;
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
      html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
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
        <div style="background:#fce4ec;border-radius:8px;padding:10px 12px;border-left:3px solid #c2185b;">
          <div style="font-size:10px;color:#5a7a65;">Feast Meal</div>
          <div style="font-size:16px;font-weight:700;color:#c2185b;">Tk ${(feastTotal||0).toLocaleString()}</div>
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

      // ── TOTAL ── ✅ FIX: এখন feast-ও যোগ হয়ে দেখাচ্ছে (মিল রেট/pm-এর হিসাবে
      // feast এখনো ঢোকে না — এটা শুধু এই হেডলাইন সংখ্যার DISPLAY-এর জন্য)
      html += `<div style="background:#1a2e22;color:#fff;border-radius:8px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;">Total Monthly Expense</span>
        <span style="font-size:18px;font-weight:700;color:#fcd34d;">Tk ${(total+(feastTotal||0)).toLocaleString()}</span>
      </div>`;

      // ── FUND SUMMARY (PDF) ──
      const _activeU=DB.users.filter(u=>u.type!=='cook'&&isActiveInMonth(u,mmKey));
      const _handover=_activeU.reduce((s,u)=>s+getPreBal(u.u,mmKey),0);
      const _thisDep=_activeU.reduce((s,u)=>{
        const dep=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,mmKey)).reduce((a,tx)=>a+(tx.amount||0),0);
        const wd=(DB.transactions||[]).filter(tx=>tx.uname===u.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,mmKey)).reduce((a,tx)=>a+(tx.amount||0),0);
        return s+(dep-wd);
      },0);
      // ✅ FIX: ফিস্ট মিলও real টাকা যা মেস ফান্ড থেকে খরচ হয়েছে — যদিও Total Monthly
      // Expense (`total`)-এ feast যোগ হয় না (meal rate হিসাবের সাথে সম্পর্কিত নয় বলে,
      // spec অনুযায়ী), কিন্তু ফান্ড ব্যালেন্স (cash in − cash out) থেকে অবশ্যই বাদ যাবে।
      const _messFund=_handover+_thisDep-total-(feastTotal||0);
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
          <th style="padding:7px 4px;text-align:right;">Feast M.</th>
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
                          : calcMemberOtherShares(u,mmKey,othersAll,cookBillsAll,cookFoodCost,myNetMeals);
        // ফিস্ট মিল: office সদস্যও ঢোকে (others/cookFood-এর মতো isOffU skip নেই)
        const feastShare = getMemberFeastShare(u, feastEntries);
        const totalBill = mealBill + sh.othersShare + sh.cookFoodShare + feastShare;
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
          <td style="padding:6px 4px;text-align:right;color:#7b1fa2">${feastShare>0?fN(feastShare):'-'}</td>
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
