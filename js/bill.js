// ═══════════════════════════════════════════════
// js/bill.js
// Bill screen — meal rate & personal bill summary
//
// Load order: AFTER meal.js
//             BEFORE final inline bootstrap <script>
//
// Depends on (all global):
//   config.js  → DB, CU
//   utils.js   → messMonthKey(), messMonthLabel(), getPreBal(), dateInMessMonth()
//   core.js    → isOfficeMealUser(), getOfficeMealRate()
//   meal.js    → calcMealRate(), messMonthMeals(), getNetMemberMeals(),
//                calcMemberOtherShares(), getShortfallMeals()
//
// Exposes (global, called from ui.js + db.js):
//   loadBill()
//
// HTML DOM targets (sc-bill screen):
//   #bill-month-label, #bill-month-sub
//   #bl-rate-big, #bl-total-exp, #bl-bazar-s, #bl-others-s, #bl-meals-s
//   #bl-my-meals, #bl-meal-bill, #bl-other-share, #bl-cook-food-share
//   #bl-cook-share, #bl-my-bill, #bl-balance, #bl-net
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// BILL / MEAL RATE & HISTORY
// ═══════════════════════════════════════════════
function loadBill(){
  const mmKey=messMonthKey();
  const lbl=document.getElementById('bill-month-label');
  const sub=document.getElementById('bill-month-sub');
  if(lbl) lbl.textContent='মিল রেট — '+messMonthLabel();
  if(sub) sub.textContent=messMonthLabel();
  const {bazar,others,othersAll,cookBillsTotal,cookBillsAll,total,totalMeals,cookMeals,officeMeals,netMeals,M,C,R,X,r1,pm,cookFoodCost}=calcMealRate(mmKey);
  const cu=DB.users.find(x=>x.u===CU.u)||CU;
  const myMeals=messMonthMeals(CU.u,mmKey);
  const myNetMeals=getNetMemberMeals(CU.u,mmKey);
  const mealBill=myNetMeals*pm;

  // Use new split-aware calculation
  const {othersShare,cookBillShare,cookFoodShare}=calcMemberOtherShares(cu,mmKey,othersAll,cookBillsAll,cookFoodCost);

  let netPayable, mealBillDisplay=mealBill;
  if(isOfficeMealUser(cu)){
    const ofRate=getOfficeMealRate(mmKey);
    mealBillDisplay=myNetMeals*ofRate;
    netPayable=mealBillDisplay; // no misc for office
  } else {
    netPayable=mealBill+othersShare+cookBillShare+cookFoodShare;
  }
  const bal=getPreBal(cu.u,mmKey)+(()=>{const d=(DB.transactions||[]).filter(tx=>tx.uname===CU.u&&tx.type==='deposit'&&dateInMessMonth(tx.date,mmKey)).reduce((s,tx)=>s+(tx.amount||0),0);const w=(DB.transactions||[]).filter(tx=>tx.uname===CU.u&&tx.type==='withdraw'&&dateInMessMonth(tx.date,mmKey)).reduce((s,tx)=>s+(tx.amount||0),0);return d-w;})();
  const net=bal-netPayable;

  const displayRate=isOfficeMealUser(cu)?getOfficeMealRate(mmKey):pm;
  document.getElementById('bl-rate-big').textContent='৳ '+displayRate.toFixed(2);
  document.getElementById('bl-total-exp').textContent='৳ '+total.toLocaleString();
  document.getElementById('bl-bazar-s').textContent='৳ '+bazar.toLocaleString();
  document.getElementById('bl-others-s').textContent='৳ '+(others+cookBillsTotal).toLocaleString();
  // নেট মিল দেখাও (বাবুর্চি বাদে)
  document.getElementById('bl-meals-s').textContent=isOfficeMealUser(cu)?'অফিস মিল':netMeals.toFixed(2);
  document.getElementById('bl-my-meals').textContent=myNetMeals.toFixed(2)+' মিল'+(myMeals!==myNetMeals?' ('+myMeals.toFixed(2)+'+'+getShortfallMeals(CU.u,mmKey).toFixed(2)+')':'');
  document.getElementById('bl-meal-bill').textContent='৳ '+mealBillDisplay.toFixed(2);
  document.getElementById('bl-other-share').textContent='৳ '+othersShare.toFixed(2);
  document.getElementById('bl-cook-food-share').textContent='৳ '+(cookFoodShare||0).toFixed(2);
  document.getElementById('bl-cook-food-share').textContent='৳ '+(cookFoodShare||0).toFixed(2);
  document.getElementById('bl-cook-share').textContent='৳ '+cookBillShare.toFixed(2);
  document.getElementById('bl-my-bill').textContent='৳ '+netPayable.toFixed(2);
  document.getElementById('bl-balance').textContent='৳ '+bal.toLocaleString();
  const netEl=document.getElementById('bl-net');
  netEl.textContent=(net>=0?'+':'')+' ৳ '+net.toFixed(2);
  netEl.style.color=net>=0?'var(--success)':'var(--danger)';
}
