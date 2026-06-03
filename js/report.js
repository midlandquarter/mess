// ═══════════════════════════════════════════════
// js/report.js
// Monthly mess report renderer
//
// Load order: AFTER meal.js
//             BEFORE final inline bootstrap <script>
//
// Depends on (all global):
//   config.js  → DB
//   utils.js   → _withMonthData(), safeHTML()
//   core.js    → getOfficeMealRate(), getOfficeMealUsers()
//   meal.js    → calcMealRate(), messMonthMeals()
//
// Exposes (global, used by inline onclick):
//   loadReport()       ← onchange / onclick in sc-report HTML
//   _doLoadReport()    ← internal, called by loadReport via _withMonthData
//
// HTML DOM targets:
//   #rpt-month  (read)   — month selector <select>
//   #rpt-rows   (write)  — report output container
// ═══════════════════════════════════════════════

function loadReport(forceRefresh=false){
  const mmKey=document.getElementById('rpt-month').value; if(!mmKey) return;
  const rptEl=document.getElementById('rpt-rows'); // ✅ সঠিক element (rpt-content নেই)
  // current month-এ _withMonthData forceRefresh ignore করে, তাই আগেই সব cache clear করো
  if(forceRefresh){ invalidateMealIndex(); invalidateMealRateCache(); invalidateMemberCountsCache(); }
  _withMonthData(mmKey, rptEl, ()=>_doLoadReport(mmKey), forceRefresh);
}

function _doLoadReport(mmKey){
  const {bazar,others,othersAll,cookBillsTotal,cookBillsAll,total,totalMeals,cookMeals,officeMeals,netMeals,M,C,R,X,r1,pm,cookFoodCost}=calcMealRate(mmKey);

  const [my,mm]=mmKey.split('-').map(Number);
  const nm=mm===12?1:mm+1;
  const mnames=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  const monthRangeLabel=`${mnames[mm-1]} ১১ – ${mnames[nm-1]} ১০, ${my}`;

  const officeRate=getOfficeMealRate(mmKey);
  const officeMealBill=getOfficeMealUsers().reduce((s,u)=>s+messMonthMeals(u.u,mmKey)*officeRate,0);

  const html=`
  <div class="summary-hero-card" style="border-radius:14px;padding:18px 18px 14px;">
    <div style="font-size:12px;opacity:.8;margin-bottom:6px">${monthRangeLabel}</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <div style="font-size:36px;font-weight:800;line-height:1">৳ ${pm.toFixed(2)}</div>
        <div style="font-size:12px;opacity:.8;margin-top:3px">প্রতি মিল রেট</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700">৳ ${total.toLocaleString()}</div>
        <div style="font-size:12px;opacity:.8;margin-top:2px">মোট খরচ</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:rgba(255,255,255,0.2);border-radius:10px;overflow:hidden;margin-bottom:8px">
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
