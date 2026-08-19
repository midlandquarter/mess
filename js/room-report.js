// ═══════════════════════════════════════════════
// ROOM / SEAT REPORT — কে কোন রুমে আছে, রুম নম্বর অনুযায়ী
// সাজানো তালিকা। শুধুমাত্র Controller-দের জন্য।
//
// এই ফিচারটা সম্পূর্ণ আলাদা — Admin Panel বা সদস্য তালিকায়
// কোনো পরিবর্তন করা হয়নি। Home screen-এ একটা নতুন hidden আইকন
// (শুধু controller দেখবে) থেকে sc-roomreport screen-এ যাওয়া যায়,
// আর সেখান থেকে বাটনে চাপলে এই ফাইলের openRoomReport() ফাংশন
// existing print-overlay-তে (report.js যেটা ব্যবহার করে) রিপোর্ট
// বসিয়ে দেয় — নতুন কোনো overlay বা library লাগেনি।
//
// Note: blocked member-ও এখানে দেখাবে (blocked মানে শুধু app
// access আটকানো, রুম থেকে চলে যাওয়া না)। শুধু কাউকে সত্যিকারভাবে
// delete করলেই সে DB.users থেকে বাদ যাবে, তাই রিপোর্ট থেকেও বাদ
// যাবে — এখানে আলাদা করে কোনো "বাদ" লজিক লাগে না।
//
// Dependencies (আগে থেকেই লোড থাকতে হবে — script tag order
// অনুযায়ী db.js/utils.js/auth.js/helpers.js/report.js-এর পরে
// এই ফাইল লোড হয়):
//   db.js      → DB.users
//   auth.js    → isController()
//   utils.js   → esc(), tod()
//   shared/core.js → fmtDate()
//   helpers.js → toast()
//   ui.js      → showSc()
// ═══════════════════════════════════════════════

function initRoomReport(){
  const sel=document.getElementById('rr-type-filter');
  if(sel) sel.value='all';
}

function openRoomReport(){
  try{
    const filterEl=document.getElementById('rr-type-filter');
    const filter=filterEl?filterEl.value:'all';

    // ── ডেটা তৈরি: DB.users-এ যা আছে তাই দেখাবে (blocked বাদ যাবে না) ──
    // ✅ FIX: cook-দেরও রুম থাকে, তাই রুম-রিপোর্টের জন্য cook=ইনসাইড ধরা
    // হচ্ছে — শুধু outside আলাদা। filter dropdown-এও তাই আর "বাবুর্চি"
    // অপশন নেই, "ইনসাইড" চাপলে cook-রাও দেখা যাবে।
    let users=(DB.users||[]).filter(u=>u&&u.u);
    if(filter==='outside') users=users.filter(u=>u.type==='outside');
    else if(filter==='inside') users=users.filter(u=>u.type!=='outside');

    // ── রুম অনুযায়ী group করা ──
    // ✅ FIX: রুম নেই এমন সদস্যও (বেশিরভাগ real আউটসাইড মানুষ) তালিকায়
    // থাকবে — নাহলে "আউটসাইড" ফিল্টার করলে তাদের দেখা যেত না। শুধু
    // কোনো ব্যানার/বাড়তি মন্তব্য ছাড়াই, তালিকার শেষে, রুম ঘর ফাঁকা
    // রেখে দেখানো হচ্ছে — এটাই স্বাভাবিক, আলাদা করে হাইলাইট করার
    // কিছু নেই।
    const groups={};
    users.forEach(u=>{
      const r=String(u.room||'').trim();
      if(!groups[r]) groups[r]=[];
      groups[r].push(u);
    });

    // ── রুম নম্বর অনুযায়ী sort (numeric রুম আগে, রুম-নেই সবার শেষে) ──
    const roomKeys=Object.keys(groups).sort((a,b)=>{
      if(a===''&&b==='') return 0;
      if(a==='') return 1;
      if(b==='') return -1;
      const na=parseInt(a,10), nb=parseInt(b,10);
      if(!isNaN(na)&&!isNaN(nb)) return na-nb;
      if(!isNaN(na)) return -1;
      if(!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });

    const typeLabel=u=>u.type==='outside'?'আউটসাইড':'ইনসাইড';
    const typeColor=u=>u.type==='outside'?'#e65100':'#1a6b3c';
    const blockedTag=u=>u.blocked?' <span style="font-size:9px;background:#fdecea;color:#c62828;border-radius:4px;padding:1px 5px;">ব্লকড</span>':'';

    let rows='';
    let count=0;

    function rowFor(u, roomCell){
      count++;
      return `<tr style="background:${count%2===0?'#f0f7f3':'#fff'}">
        <td style="padding:6px 4px;text-align:center;font-weight:700;">${roomCell}</td>
        <td style="padding:6px 4px;text-align:center;font-size:10px;color:#555;">${esc(u.job||'-')}</td>
        <td style="padding:6px 6px;font-weight:600;">${esc(u.name||'-')}${blockedTag(u)}</td>
        <td style="padding:6px 4px;text-align:center;font-size:10px;color:${typeColor(u)};font-weight:700;">${typeLabel(u)}</td>
        <td style="padding:6px 6px;font-size:10px;color:#444;">${esc(u.remarks||'')}</td>
      </tr>`;
    }

    roomKeys.forEach(room=>{
      const members=groups[room].slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
      members.forEach((u,i)=>{
        rows += rowFor(u, i===0?(room?esc(room):'-'):'');
      });
    });

    const filterLabel=filter==='outside'?'আউটসাইড':filter==='inside'?'ইনসাইড':'সব';

    let html = `<div style="font-family:Arial,sans-serif;background:#fff;color:#1a2e22;padding:16px;">`;
    html += `<div style="background:linear-gradient(135deg,#0f4526,#1a6b3c);color:#fff;border-radius:10px;padding:14px 6px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:18px;font-weight:700;">Midland Quarter</div>
        <div style="font-size:10px;opacity:.8;margin-top:2px;">Room / Seat Report | ${fmtDate(tod())}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:600;">${esc(filterLabel)}</div>
        <div style="font-size:10px;opacity:.8">মোট ${count} জন</div>
      </div>
    </div>`;

    html += `<table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#1a6b3c;color:#fff;">
        <th style="padding:7px 4px;text-align:center;">রুম</th>
        <th style="padding:7px 4px;text-align:center;">ID</th>
        <th style="padding:7px 6px;text-align:left;">নাম</th>
        <th style="padding:7px 4px;text-align:center;">ধরন</th>
        <th style="padding:7px 6px;text-align:left;">মন্তব্য</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="padding:20px;text-align:center;color:#888;">কোনো সদস্য পাওয়া যায়নি</td></tr>'}</tbody>
    </table>`;
    html += `</div>`;

    // ── Overlay-এ দেখাও (report.js-এর makePDF যেভাবে করে ঠিক সেভাবেই) ──
    const overlay=document.getElementById('print-overlay');
    const content=document.getElementById('print-overlay-content');
    const titleEl=document.getElementById('print-overlay-title');
    if(!overlay||!content){ toast('❌ Overlay পাওয়া যায়নি!'); return; }
    if(titleEl) titleEl.textContent='🏠 Room Report';
    content.innerHTML = `<style>
      *{box-sizing:border-box}
      table{border-collapse:collapse;width:100%}
      th,td{padding:5px 6px;border:1px solid #d0e4d8}
      th{background:#1a6b3c!important;color:#fff!important}
    </style>` + html;
    overlay.style.display='block';
    overlay.scrollTop=0;
    document.body.style.overflow='hidden';

  }catch(err){
    toast('❌ Error: '+(err.message||String(err)));
    console.error('openRoomReport error:', err);
  }
}
