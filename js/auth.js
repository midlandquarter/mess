// ═══════════════════════════════════════════════
// js/auth.js
// Auth observer, login, register, logout, roles,
// save-ID helpers, password toggle
//
// Load order: AFTER db.js  BEFORE ui.js
// Depends on (all global):
//   config.js  → auth, DB, CU, LS_USER, globalRef
//   utils.js   → V(), esc(), validEmail(), validName(),
//                validMobile(), validPass(), sanitizeInput(),
//                toast(), messMonthKey(), tod()
//   db.js      → hideSplash(), _waitUntilReady()
// Calls into (async only — loaded after auth.js):
//   ui.js      → showSc(), showModal()
//   home.js    → refreshHome()
//   notice.js  → showNoticePopup()
//
// NOTE: loadDB() is intentionally NOT here.
//       It lives in app.js and fires at parse time
//       in parallel with this observer registration.
// ═══════════════════════════════════════════════


// ── onAuthStateChanged — Session Management ──────
// ═══════════════════════════════════════════════

// Guard flag: prevents onAuthStateChanged from force-signing-out
// the newly created user before sendEmailVerification() completes.
let _registrationInProgress = false;
let _loginInProgress = false; // doLogin() চলাকালীন onAuthStateChanged suppress করো

auth.onAuthStateChanged(fbUser=>{
  // doLogin() নিজেই সব handle করে — duplicate processing বন্ধ করো
  if(_loginInProgress) return;
  if(!fbUser){
    // Not logged in
    hideSplash();
    CU = null;
    showSc('login');
    return;
  }
  if(!fbUser.emailVerified){
    // If registration is actively in progress, do NOT sign out —
    // the doRegister() function controls sign-out itself after
    // sendEmailVerification() has completed successfully.
    if(_registrationInProgress) return;
    // Logged in but email not verified
    hideSplash();
    auth.signOut();
    CU = null;
    showSc('login');
    const al = document.getElementById('login-alert');
    if(al){ al.innerHTML='⚠️ ইমেইল যাচাই করা হয়নি। <b>'+esc(fbUser.email)+'</b> ইনবক্স চেক করুন।'; al.className='alert alert-danger show'; }
    return;
  }
  // Verified user — load their RTDB profile
  const uid = fbUser.uid;
  firebase.database().ref('users/' + uid).once('value').then(snap=>{
    const userData = snap.val();
    if(!userData){
      // ✅ pendingApprovals চেক — pending/rejected user এখানেই থামবে
      firebase.database().ref('pendingApprovals/'+uid).once('value').then(pendSnap=>{
        hideSplash();
        auth.signOut(); CU=null; localStorage.removeItem('mq_authed'); showSc('login');
        const al=document.getElementById('login-alert');
        if(!al) return;
        const pend=pendSnap.val();
        if(pend && pend.status==='pending'){
          al.innerHTML='⏳ <b>আপনার একাউন্ট পর্যালোচনা করা হচ্ছে।</b><br>মেস পরিচালকের সাথে যোগাযোগ করুন। Approval/অনুমোদন নিন।';
          al.className='alert alert-warning show';
        } else if(pend && pend.status==='rejected'){
          al.innerHTML='❌ আপনার আবেদন প্রত্যাখ্যান করা হয়েছে।<br><small>মেস পরিচালকের সাথে যোগাযোগ করুন।</small>';
          al.className='alert alert-danger show';
        } else {
          al.textContent='❌ প্রোফাইল পাওয়া যায়নি। Admin-এর সাথে যোগাযোগ করুন।';
          al.className='alert alert-danger show';
        }
      }).catch(()=>{
        hideSplash();
        auth.signOut(); CU=null; localStorage.removeItem('mq_authed'); showSc('login');
      });
      return;
    }
    if(userData.blocked){
      hideSplash();
      auth.signOut(); CU=null; localStorage.removeItem('mq_authed'); showSc('login');
      const al = document.getElementById('login-alert');
      if(al){ al.textContent='❌ আপনার অ্যাকাউন্ট ব্লক করা হয়েছে। Manager এর সাথে যোগাযোগ করুন।'; al.className='alert alert-danger show'; }
      return;
    }
    // Check role from RTDB roles/{uid}
    firebase.database().ref('roles/' + uid).once('value').then(rsnap=>{
      const roleData = rsnap.val();
      // Sanitize: remove any extra quotes Firebase Console might have added
      let role = roleData?.role || userData.role || 'member';
      role = String(role).replace(/^\"+|\"+$/g,'').trim().toLowerCase();
      if(!['controller','manager','member'].includes(role)) role='member';

      CU = { uid, u: userData.u||uid, name: userData.name||fbUser.email, mob: userData.mobile||userData.mob||'', email: fbUser.email, job: userData.jobId||userData.job||'', room: userData.room||'', role, type: userData.type||'inside', joined: userData.createdAt||userData.joined||tod(), emailVerified: true };

      // Sync CU into DB.users array so role checks & meal data work correctly
      if(DB.users){
        const idx = DB.users.findIndex(x=>x.uid===uid||x.u===CU.u);
        if(idx>=0){
          // ✅ FIX: users/{uid} থেকে শুধু auth fields নাও।
          // name, room, job, mob, balance সবসময় messData/users থেকে রাখো।
          // না হলে profile edit বা deposit refresh-এ পুরনো হয়ে যায়।
          DB.users[idx].uid           = uid;
          DB.users[idx].role          = role;
          DB.users[idx].emailVerified = true;
          // CU-তে messData-এর সঠিক data রাখো
          CU.name       = DB.users[idx].name       || CU.name;
          CU.mob        = DB.users[idx].mob        || CU.mob;
          CU.room       = DB.users[idx].room       || CU.room;
          CU.job        = DB.users[idx].job        || CU.job;
          CU.address    = DB.users[idx].address    || '';
          CU.prevBalance= DB.users[idx].prevBalance!== undefined ? DB.users[idx].prevBalance : 0;
          CU.type       = DB.users[idx].type       || CU.type;
          CU.blocked    = DB.users[idx].blocked    || false;
        } else {
          // DB এখনো load হয়নি — _waitUntilReady-তে sync করা হবে
          // এখানে push করলে balance=0 দিয়ে overwrite হওয়ার risk আছে, তাই skip
        }
      }
      // Also fix role in RTDB if it had extra quotes
      if(roleData?.role !== role){
        firebase.database().ref('roles/'+uid).set({role}).catch(()=>{});
        firebase.database().ref('users/'+uid+'/role').set(role).catch(()=>{});
      }

      _waitUntilReady(()=>{
        // ✅ DB load হওয়ার পর CU সঠিকভাবে sync করো
        const syncIdx = DB.users.findIndex(x=>x.uid===uid||x.u===CU.u);
        // ── Deleted user guard ──────────────────────────────────────────────
        // global/users-এ নেই মানে deleteMember() করা হয়েছে।
        // users/{uid} RTDB-এ এখনো থাকলেও এখানে ধরা পড়বে।
        if(syncIdx<0){
          // ✅ FIX: সরাসরি "deleted" না দেখিয়ে pendingApprovals চেক করো।
          // Bug root cause: push.js, pending user-এর জন্যও users/{uid}/pushToken
          // save করে। এতে users/{uid} node তৈরি হয়। auth flow মনে করে user
          // approved — কিন্তু global/users-এ নেই → ভুলে "মুছে ফেলা" দেখাত।
          firebase.database().ref('pendingApprovals/'+uid).once('value').then(pendSnap=>{
            hideSplash();
            auth.signOut(); CU=null; localStorage.removeItem('mq_authed');
            showSc('login');
            const _kal=document.getElementById('login-alert');
            if(!_kal) return;
            const pend=pendSnap.val();
            if(pend && pend.status==='pending'){
              _kal.innerHTML='⏳ <b>আপনার একাউন্ট পর্যালোচনা করা হচ্ছে।</b><br>মেস পরিচালকের সাথে যোগাযোগ করুন।';
              _kal.className='alert alert-warning show';
            } else if(pend && pend.status==='rejected'){
              _kal.innerHTML='❌ আপনার আবেদন প্রত্যাখ্যান করা হয়েছে।<br><small>মেস পরিচালকের সাথে যোগাযোগ করুন।</small>';
              _kal.className='alert alert-danger show';
            } else {
              _kal.textContent='❌ আপনার অ্যাকাউন্টটি সাইট থেকে মুছে ফেলা হয়েছে।';
              _kal.className='alert alert-danger show';
            }
          }).catch(()=>{
            hideSplash();
            auth.signOut(); CU=null; localStorage.removeItem('mq_authed'); showSc('login');
          });
          return;
        }
        // ✅ FIX: users/{uid} থেকে শুধু auth fields নাও।
        // name, room, job, mob, balance সবসময় messData/users থেকে রাখো।
        DB.users[syncIdx].uid           = uid;
        DB.users[syncIdx].role          = role;
        DB.users[syncIdx].emailVerified = true;
        CU.name       = DB.users[syncIdx].name        || CU.name;
        CU.mob        = DB.users[syncIdx].mob         || CU.mob;
        CU.room       = DB.users[syncIdx].room        || CU.room;
        CU.job        = DB.users[syncIdx].job         || CU.job;
        CU.prevBalance= DB.users[syncIdx].prevBalance !== undefined ? DB.users[syncIdx].prevBalance : 0;
        CU.type       = DB.users[syncIdx].type        || CU.type;
        hideSplash();
        refreshHome(); showSc('home');
        localStorage.setItem('mq_authed','1'); // returning user flag
        setTimeout(()=>showNoticePopup(), 800);
      });
    });
  }).catch(err=>{
    hideSplash();
    console.error('RTDB profile load error:', err);
    auth.signOut(); CU=null; localStorage.removeItem('mq_authed'); showSc('login');
  });
});


// ═══════════════════════════════════════════════
// ROLE HELPERS
// ═══════════════════════════════════════════════
// Sync check — uses CU.role (already loaded from RTDB on login)
function isController(u){ u=u||CU; return u&&(u.role==='controller'||(DB.controllers&&DB.controllers.includes(u.u))); }
function isManager(u){ u=u||CU; return u&&(u.role==='manager'||u.role==='controller'||isController(u)||(DB.managers&&(DB.managers[messMonthKey()]||[]).includes(u.u))); }
function isManagerOrCtrl(u){ return isManager(u)||isController(u); }

// Async RTDB role check (use when real-time accuracy needed)
function checkRoleFromRTDB(uid){
  if(!uid) return Promise.resolve('member');
  return firebase.database().ref('roles/'+uid).once('value').then(snap=>{ const d=snap.val(); return d?.role||'member'; });
}

function roleLabel(r,u){
  if(u&&isController(u)) return '⭐ Controller';
  if(r==='controller') return '⭐ Controller';
  if(r==='manager') return '👑 Manager';
  if(u&&DB.managers&&(DB.managers[messMonthKey()]||[]).includes(u.u)) return '👑 Manager';
  return '👤 Member';
}


// ═══════════════════════════════════════════════
// SAVE ID — Email auto-save in login box
// ═══════════════════════════════════════════════
const LS_SAVED_EMAIL = 'mq_saved_email';

function initSaveId(){
  const saved = localStorage.getItem(LS_SAVED_EMAIL);
  if(saved){
    const inp = document.getElementById('login-user');
    if(inp) inp.value = saved;
    setSaveIdChecked(true);
  }
}

function setSaveIdChecked(checked){
  const box  = document.getElementById('save-id-box');
  const tick = document.getElementById('save-id-tick');
  const lbl  = document.getElementById('save-id-label');
  if(!box) return;
  if(checked){
    box.style.background      = 'var(--primary)';
    box.style.borderColor     = 'var(--primary)';
    lbl.style.borderColor     = 'var(--primary)';
    lbl.style.background      = 'rgba(var(--primary-rgb,33,150,243),.08)';
    if(tick) tick.style.display = 'block';
  } else {
    box.style.background      = '#fff';
    box.style.borderColor     = 'var(--border)';
    lbl.style.borderColor     = 'var(--border)';
    lbl.style.background      = 'var(--bg)';
    if(tick) tick.style.display = 'none';
  }
}

function toggleSaveId(){
  const saved = localStorage.getItem(LS_SAVED_EMAIL);
  const inp   = document.getElementById('login-user');
  if(saved){
    // Currently checked → uncheck: clear storage and clear input
    localStorage.removeItem(LS_SAVED_EMAIL);
    if(inp) inp.value = '';
    setSaveIdChecked(false);
  } else {
    // Currently unchecked → check: save current email
    const email = inp ? inp.value.trim() : '';
    if(email){
      localStorage.setItem(LS_SAVED_EMAIL, email);
      setSaveIdChecked(true);
    } else {
      // No email typed yet — just visually enable, will save on next login
      setSaveIdChecked(true);
    }
  }
}

function onLoginEmailInput(){
  // If Save ID is active, keep the stored value in sync as user types
  if(localStorage.getItem(LS_SAVED_EMAIL) !== null){
    const inp = document.getElementById('login-user');
    const val = inp ? inp.value.trim() : '';
    if(val){
      localStorage.setItem(LS_SAVED_EMAIL, val);
    } else {
      localStorage.removeItem(LS_SAVED_EMAIL);
      setSaveIdChecked(false);
    }
  }
}


// ═══════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════
function doLogin(){
  const email = V('login-user').trim().toLowerCase();
  const pass = V('login-pass');
  const al = document.getElementById('login-alert');
  al.className = 'alert';
  if(!email || !pass){ al.textContent='❌ Email এবং পাসওয়ার্ড দিন!'; al.className='alert alert-danger show'; return; }
  if(!validEmail(email)){ al.textContent='❌ সঠিক Email Address দিন!'; al.className='alert alert-danger show'; return; }
  const btn = document.querySelector('#sc-login .btn-primary');
  if(btn){ btn.disabled=true; btn.textContent='লগইন হচ্ছে...'; }

  // ── _loginInProgress: onAuthStateChanged কে suppress করো ──────────
  // auth.signInWithEmailAndPassword() call হলে onAuthStateChanged fire করে।
  // তখন doLogin() chain আর onAuthStateChanged — দুটো parallel-এ চলে।
  // _loginInProgress=true থাকলে onAuthStateChanged skip করে।
  // doLogin() সব handle করার পর flag clear হয়।
  _loginInProgress = true;

  // Firebase Persistence: LOCAL or SESSION
  const persistence = document.getElementById('remember-me').checked
    ? firebase.auth.Auth.Persistence.LOCAL
    : firebase.auth.Auth.Persistence.SESSION;

  auth.setPersistence(persistence).then(()=>{
    return auth.signInWithEmailAndPassword(email, pass);
  }).then(cred=>{
    const fbUser = cred.user;
    if(!fbUser.emailVerified){
      // Block unverified users — show resend button
      auth.signOut();
      al.innerHTML = `❌ ইমেইল যাচাই করা হয়নি! আপনার <b>${esc(email)}</b> ইনবক্স চেক করুন।<br>
        <button onclick="resendVerificationEmail('${esc(email)}','${esc(pass)}')" style="margin-top:10px;background:var(--primary);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;width:100%">
          📧 Verification Email পুনরায় পাঠান
        </button>`;
      al.className='alert alert-danger show';
      if(btn){ btn.disabled=false; btn.textContent='Login করুন'; }
      return;
    }
    // Find user in RTDB by uid
    const uid = fbUser.uid;
    const userRef = firebase.database().ref('users/' + uid);
    userRef.once('value').then(snap=>{
      const userData = snap.val();
      if(!userData){
        // ✅ pendingApprovals চেক — pending/rejected user-কে সঠিক বার্তা দাও
        firebase.database().ref('pendingApprovals/'+uid).once('value').then(pendSnap=>{
          const pend=pendSnap.val();
          auth.signOut();
          if(pend && pend.status==='pending'){
            al.innerHTML='⏳ <b>আপনার একাউন্ট পর্যালোচনা করা হচ্ছে।</b><br>মেস পরিচালকের সাথে যোগাযোগ করুন। Approval/অনুমোদন নিন।';
            al.className='alert alert-warning show';
          } else if(pend && pend.status==='rejected'){
            al.innerHTML='❌ আপনার আবেদন প্রত্যাখ্যান করা হয়েছে।<br><small>মেস পরিচালকের সাথে যোগাযোগ করুন।</small>';
            al.className='alert alert-danger show';
          } else {
            al.textContent='❌ RTDB-তে আপনার প্রোফাইল পাওয়া যায়নি। Admin এর সাথে যোগাযোগ করুন।';
            al.className='alert alert-danger show';
          }
          if(btn){ btn.disabled=false; btn.textContent='Login করুন'; }
        }).catch(()=>{
          auth.signOut();
          al.textContent='❌ প্রোফাইল পাওয়া যায়নি। Admin এর সাথে যোগাযোগ করুন।';
          al.className='alert alert-danger show';
          if(btn){ btn.disabled=false; btn.textContent='Login করুন'; }
        });
        return;
      }
      if(userData.blocked){ al.textContent='❌ আপনার অ্যাকাউন্ট ব্লক করা হয়েছে। Manager এর সাথে যোগাযোগ করুন।'; al.className='alert alert-danger show'; auth.signOut(); if(btn){ btn.disabled=false; btn.textContent='Login করুন'; } return; }
      // Load role from roles/{uid} and sanitize (remove any accidental extra quotes)
      firebase.database().ref('roles/'+uid).once('value').then(rsnap=>{
        const roleData = rsnap.val();
        let role = roleData?.role || userData.role || 'member';
        role = String(role).replace(/^\"+|\"+$/g,'').trim().toLowerCase();
        if(!['controller','manager','member'].includes(role)) role='member';
        CU = { uid, u: userData.u||uid, name: userData.name, mob: userData.mobile||userData.mob||'', email: fbUser.email, job: userData.jobId||userData.job||'', room: userData.room||'', role, type: userData.type||'inside', joined: userData.createdAt||userData.joined||tod(), emailVerified: true };
        // Sync into DB.users so meal/bazar/role checks work
        if(DB.users){
          const idx=DB.users.findIndex(x=>x.uid===uid||x.u===CU.u);
          if(idx>=0){
            // ✅ FIX: শুধু auth fields copy করো — profile ও balance messData থেকে নাও
            DB.users[idx].uid           = uid;
            DB.users[idx].role          = role;
            DB.users[idx].emailVerified = true;
            CU.name       = DB.users[idx].name        || CU.name;
            CU.mob        = DB.users[idx].mob         || CU.mob;
            CU.room       = DB.users[idx].room        || CU.room;
            CU.job        = DB.users[idx].job         || CU.job;
            CU.prevBalance= DB.users[idx].prevBalance !== undefined ? DB.users[idx].prevBalance : 0;
            CU.type       = DB.users[idx].type        || CU.type;
          } else {
            // ⚠️ DB এখনো সম্পূর্ণ load হয়নি — এখানে push+saveUsers করা বিপজ্জনক।
            // কারণ: activeFrom ছাড়া entry যাবে এবং পুরো users array overwrite হতে পারে।
            // সমাধান: _waitUntilReady()-তে sync হবে — সেখানে DB fully loaded থাকবে।
            console.warn('[auth] User not yet in DB.users at login, will sync in _waitUntilReady:', CU.u);
          }
        }
        // Auto-fix bad role value in RTDB if needed
        if(roleData?.role !== role){ firebase.database().ref('roles/'+uid).set({role}).catch(()=>{}); firebase.database().ref('users/'+uid+'/role').set(role).catch(()=>{}); }
        if(btn){ btn.disabled=false; btn.textContent='Login করুন'; }
        // ── login processing শেষ — এখন flag clear করো ──────────────
        // _waitUntilReady-এর আগে clear করা হচ্ছে কারণ DB load হতে সময় লাগতে পারে।
        // এই সময়ের মধ্যে অন্য auth event (token refresh) normal হওয়া দরকার।
        _loginInProgress = false;
        _waitUntilReady(()=>{
          // ✅ DB load হওয়ার পর CU আবার sync
          const si=DB.users.findIndex(x=>x.uid===uid||x.u===CU.u);
          // ── Deleted user guard ─────────────────────────────────────────
          // global/users-এ নেই → login block করো
          if(si<0){
            auth.signOut(); CU=null; localStorage.removeItem('mq_authed');
            if(btn){ btn.disabled=false; btn.textContent='Login করুন'; }
            al.textContent='❌ আপনার অ্যাকাউন্টটি সাইট থেকে মুছে ফেলা হয়েছে।'; al.className='alert alert-danger show';
            return;
          }
          DB.users[si].uid=uid; DB.users[si].role=role;
          CU.prevBalance= DB.users[si].prevBalance !== undefined ? DB.users[si].prevBalance : 0;
          CU.name = DB.users[si].name || CU.name;
          CU.room = DB.users[si].room || CU.room;
          CU.job  = DB.users[si].job  || CU.job;
          refreshHome(); showSc('home');
          setTimeout(()=>showNoticePopup(), 600);
        });
      });
    }).catch(err=>{ al.textContent='❌ ডেটা লোড ব্যর্থ: '+err.message; al.className='alert alert-danger show'; if(btn){ btn.disabled=false; btn.textContent='Login করুন'; } });
  }).catch(err=>{
    _loginInProgress = false; // error-এও flag reset করো
    let msg = '⚠️ Login failed. Please try again.';
    if(err.code==='auth/user-not-found'||err.code==='auth/wrong-password'||err.code==='auth/invalid-credential')
      msg='✗ Incorrect email or password.';
    else if(err.code==='auth/invalid-email')
      msg='✗ Invalid email address format.';
    else if(err.code==='auth/too-many-requests')
      msg='⚠️ Too many failed attempts. Please wait and try again.';
    else if(err.code==='auth/network-request-failed')
      msg='✗ No internet connection. Please check your network.';
    al.textContent = msg; al.className='alert alert-danger show';
    if(btn){ btn.disabled=false; btn.textContent='Login করুন'; }
  });
}

// Stored temporarily so doResendFromCard() can re-sign-in
let _verifyEmail = '', _verifyPass = '';

function showVerifyCard(email, pass){
  _verifyEmail = email;
  _verifyPass  = pass;
  // Switch to login screen first
  showSc('login');
  // Clear normal login-alert (we have a better card now)
  const la = document.getElementById('login-alert');
  if(la){ la.className='alert'; la.textContent=''; }
  // Pre-fill login email for convenience
  const lu = document.getElementById('login-user');
  if(lu) lu.value = email;
  // Show the card and populate email display
  const card = document.getElementById('verify-card');
  const disp = document.getElementById('verify-email-display');
  const msg  = document.getElementById('resend-msg');
  if(disp) disp.textContent = email;
  if(msg)  msg.textContent  = '';
  const resendBtn = document.getElementById('resend-btn');
  if(resendBtn){ resendBtn.disabled=false; resendBtn.textContent='🔄 পুনরায় Verification ইমেইল পাঠান'; }
  if(card) card.style.display='block';
}

function doResendFromCard(){
  if(!_verifyEmail || !_verifyPass){
    toast('❌ তথ্য পাওয়া যায়নি, আবার রেজিস্ট্রেশন পেজে চেষ্টা করুন।');
    return;
  }
  const btn = document.getElementById('resend-btn');
  const msg = document.getElementById('resend-msg');
  if(btn){ btn.disabled=true; btn.textContent='পাঠানো হচ্ছে...'; }
  if(msg){ msg.textContent=''; msg.style.color='#4CAF50'; }

  _registrationInProgress = true; // guard against onAuthStateChanged sign-out
  auth.signInWithEmailAndPassword(_verifyEmail, _verifyPass)
    .then(cred => cred.user.sendEmailVerification())
    .then(()=>{
      _registrationInProgress = false;
      return auth.signOut();
    })
    .then(()=>{
      if(btn){ btn.disabled=false; btn.textContent='🔄 পুনরায় Verification ইমেইল পাঠান'; }
      if(msg){ msg.textContent='✅ ইমেইল পাঠানো হয়েছে! ইনবক্স ও Spam ফোল্ডার চেক করুন।'; }
    })
    .catch(err=>{
      _registrationInProgress = false;
      auth.signOut().catch(()=>{});
      if(btn){ btn.disabled=false; btn.textContent='🔄 পুনরায় Verification ইমেইল পাঠান'; }
      let emsg = '❌ পাঠানো যায়নি।';
      if(err.code==='auth/too-many-requests') emsg='❌ অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
      if(err.code==='auth/wrong-password')    emsg='❌ পাসওয়ার্ড মিলছে না।';
      if(msg){ msg.textContent=emsg; msg.style.color='#e53935'; }
    });
}

function resendVerificationEmail(email, pass){
  // Sign in temporarily to get the user object for resend
  auth.signInWithEmailAndPassword(email, pass).then(cred=>{
    return cred.user.sendEmailVerification().then(()=>{ auth.signOut(); toast('✅ Verification email পাঠানো হয়েছে! ইনবক্স চেক করুন।'); });
  }).catch(err=>{ toast('❌ Email পাঠানো যায়নি: '+(err.message||'')); });
}

function doRegister(){
  const name    = sanitizeInput(V('reg-name')),
        mob     = sanitizeInput(V('reg-mobile')),
        email   = sanitizeInput(V('reg-email')).toLowerCase(),
        job     = sanitizeInput(V('reg-jobid')),
        pass    = V('reg-pass'),
        room    = sanitizeInput(V('reg-room')),
        type    = document.getElementById('reg-type').value;
  const al=document.getElementById('reg-alert'), ok=document.getElementById('reg-ok');
  al.className='alert'; ok.className='alert';
  if(!name||!mob||!email||!job||!pass){
    al.textContent='❌ * চিহ্নিত তথ্য পূরণ করুন!'; al.className='alert alert-danger show'; return;
  }
  if(!validName(name)){ al.textContent='❌ নাম কমপক্ষে ২ অক্ষর হতে হবে!'; al.className='alert alert-danger show'; return; }
  if(!validMobile(mob)){ al.textContent='❌ সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)!'; al.className='alert alert-danger show'; return; }
  if(!validEmail(email)){ al.textContent='❌ সঠিক Email Address দিন!'; al.className='alert alert-danger show'; return; }
  if(!validPass(pass)){ al.textContent='❌ পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার!'; al.className='alert alert-danger show'; return; }

  // Auto-generate unique internal key from mobile number
  const uname = 'u_' + mob;

  // Check duplicate
  if(DB.users && DB.users.find(x=>x.u===uname||x.mob===mob)){
    al.textContent='❌ এই মোবাইল নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে!'; al.className='alert alert-danger show'; return;
  }

  const btn = document.querySelector('#sc-register .btn-primary');
  if(btn){ btn.disabled=true; btn.textContent='যাচাই করা হচ্ছে...'; }

  (async ()=>{
    try {
      // ── Step 0: Firebase pendingApprovals-এ duplicate mobile check ──────────
      // সমস্যা: DB.users শুধু approved সদস্যদের রাখে। Pending সদস্যরা সেখানে নেই।
      // ফলে উপরের DB.users চেক কখনো pending user-কে ধরতে পারে না।
      // এর কারণে একই মোবাইল দিয়ে বারবার register করা যায় এবং Firebase Auth-এ
      // একাধিক duplicate account তৈরি হয়।
      // সমাধান: Firebase-এ pendingApprovals সরাসরি চেক করো।
      try {
        const pendSnap = await firebase.database().ref('pendingApprovals').once('value');
        const pendData = pendSnap.val() || {};
        const alreadyPending = Object.values(pendData).some(p =>
          p && p.mobile === mob && p.status !== 'rejected'
        );
        if(alreadyPending){
          al.innerHTML = '⏳ <b>এই মোবাইল নম্বর দিয়ে আগেই আবেদন করা হয়েছে।</b><br>অনুমোদনের অপেক্ষা করুন অথবা মেস পরিচালকের সাথে যোগাযোগ করুন।';
          al.className = 'alert alert-warning show';
          if(btn){ btn.disabled=false; btn.textContent='Register করুন'; }
          return;
        }
      } catch(checkErr) {
        // নেটওয়ার্ক সমস্যায় check ব্যর্থ হলে সতর্ক করো, কিন্তু আটকাবো না
        console.warn('[doRegister] pendingApprovals check failed (network?):', checkErr);
      }

      // ── এখানে এসে মানে duplicate নেই — registration চালু করো ──
      if(btn) btn.textContent='রেজিস্ট্রেশন হচ্ছে...';

      // Set guard flag BEFORE creating the user so that onAuthStateChanged
      // does not race us to signOut() before sendEmailVerification() fires.
      _registrationInProgress = true;

      // Step 1 — Create the Firebase Auth account
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const user = cred.user;
      const uid  = user.uid;

      // Step 2 — Send verification email IMMEDIATELY while the session
      // is fresh and the auth token is 100 % valid.
      // (RTDB writes come AFTER so nothing can race us here.)
      if(!user){ throw new Error('auth/no-current-user'); }
      await user.sendEmailVerification();

      // Step 3 — pendingApprovals-এ save করো। Approved হওয়ার আগে DB-তে যাবে না।
      // Controller অনুমোদন দিলে তখন users/{uid}, roles/{uid}, DB.users-এ যোগ হবে।
      const pendingData = {
        name, mobile: mob, jobId: job, u: uname, room, type,
        email, requestedAt: tod(), status: 'pending'
      };
      await firebase.database().ref('pendingApprovals/' + uid).set(pendingData);

      // Step 4 — Show success with approval note
      ok.innerHTML='✅ রেজিস্ট্রেশন সফল! আপনার Email চেক করুন।<br><small style="opacity:.85">Email যাচাইয়ের পর মেস পরিচালকের অনুমোদনের অপেক্ষা করুন।</small>';
      ok.className='alert alert-success show';
      al.className='alert';
      if(btn){ btn.disabled=false; btn.textContent='Register করুন'; }

      // Clear flag before signOut so onAuthStateChanged handles it normally
      _registrationInProgress = false;
      await auth.signOut();
      setTimeout(()=>showVerifyCard(email, pass), 2500);

    } catch(err){
      _registrationInProgress = false; // always reset on error
      // If account was created but email send failed, still sign out cleanly
      try{ await auth.signOut(); }catch(_){}

      let msg = '❌ রেজিস্ট্রেশন ব্যর্থ!';
      if(err.code==='auth/email-already-in-use')      msg='❌ এই Email দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে!';
      else if(err.code==='auth/weak-password')         msg='❌ পাসওয়ার্ড দুর্বল! কমপক্ষে ৬ ক্যারেক্টার দিন।';
      else if(err.code==='auth/network-request-failed')msg='❌ ইন্টারনেট সংযোগ চেক করুন!';
      else if(err.code==='auth/too-many-requests')     msg='❌ অনেক চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
      al.textContent=msg; al.className='alert alert-danger show';
      if(btn){ btn.disabled=false; btn.textContent='Register করুন'; }
    }
  })();
}

function doForgot(){
  const email=V('fgt-email').trim().toLowerCase();
  const al=document.getElementById('fgt-alert'),ok=document.getElementById('fgt-ok');
  al.className='alert'; ok.className='alert';
  if(!email){ al.textContent='❌ Email Address দিন!'; al.className='alert alert-danger show'; return; }
  if(!validEmail(email)){ al.textContent='❌ সঠিক Email দিন!'; al.className='alert alert-danger show'; return; }
  const btn=document.getElementById('fgt-btn');
  btn.disabled=true; btn.textContent='পাঠানো হচ্ছে...';
  auth.sendPasswordResetEmail(email)
    .then(()=>{
      ok.textContent='✅ Reset লিংক পাঠানো হয়েছে! আপনার Email চেক করুন।';
      ok.className='alert alert-success show';
      al.className='alert';
      btn.disabled=false; btn.textContent='📧 Reset Link পাঠান';
    })
    .catch(err=>{
      let msg='❌ Reset Email পাঠানো যায়নি।';
      if(err.code==='auth/user-not-found') msg='❌ এই Email দিয়ে কোনো অ্যাকাউন্ট নেই।';
      if(err.code==='auth/too-many-requests') msg='❌ অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
      al.textContent=msg; al.className='alert alert-danger show';
      btn.disabled=false; btn.textContent='📧 Reset Link পাঠান';
    });
}

function confirmLogout(){
  showModal('Logout','আপনি কি নিশ্চিতভাবে লগআউট করতে চান?',()=>{
    auth.signOut().then(()=>{
      CU=null;
      try{ localStorage.removeItem(LS_USER); }catch(e){}
      showSc('login');
      toast('Logout সফল');
    }).catch(()=>{ CU=null; showSc('login'); toast('Logout সফল'); });
  });
}


// ═══════════════════════════════════════════════
// PASSWORD VISIBILITY TOGGLE
// ═══════════════════════════════════════════════
function togglePassVis(inputId, eyeId){
  const inp=document.getElementById(inputId);
  const eye=document.getElementById(eyeId);
  if(!inp) return;
  const isHidden=inp.type==='password';
  inp.type=isHidden?'text':'password';
  if(eye){
    // Switch between open and closed eye SVG
    eye.innerHTML=isHidden
      ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
      : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}
