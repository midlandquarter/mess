// ═══════════════════════════════════════════════
// js/config.js
// Global DB state, Firebase config, init, refs
// Load order: FIRST — before utils.js, core.js, db.js
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════
let DB = {
  users:[],
  meals:{},
  bazar:[],
  others:[],      // NEW: অন্যান্য খরচ
  transactions:[], // NEW: জমা/উত্তোলন {id,date,uname,type:'deposit'/'withdraw',amount,note,by}
  managers:{},    // {"YYYY-MM": [uname,...]}
  mealRates:{},   // {"YYYY-MM": finalRate}
  cfg:{def:{b:0.75,l:1.5,d:0.75}, byDate:{}},
  controllers:[],
  siteNote: 'আশুগঞ্জ, ব্রাহ্মণবাড়িয়া',
  notice: {text:'', popupEnabled:false},
  officeMealRates:{},  // {"YYYY-MM": rate}  — আলাদা রেট
  officeMealNotes:[],  // [{id,date,text,by}]  — নোট ইতিহাস
};
let CU = null;
let admBuf = {};
let mealDate = '';

const LS_USER = 'mq7u';


// ═══════════════════════════════════════════════
// FIREBASE CONFIG & INIT
// ═══════════════════════════════════════════════
const firebaseConfig = {
  apiKey: 'AIzaSyDBR9Z3gnk0oHBRyqC5eOcGhu8ONa8Up-U',
  authDomain: 'midlandquarter-19623.firebaseapp.com',
  databaseURL: 'https://midlandquarter-19623-default-rtdb.firebaseio.com',
  projectId: 'midlandquarter-19623',
  storageBucket: 'midlandquarter-19623.firebasestorage.app',
  messagingSenderId: '370339958840',
  appId: '1:370339958840:web:dc81e43f4f584d1b1956cd',
  measurementId: 'G-VT2V2QEYQ6'
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const dbRef     = database.ref('messData');        // migration/fallback only
const globalRef  = database.ref('messData/global');  // users, cfg, controllers, notice, siteNote, rules, shortfall, prevBalances, handoverDone
const monthsRef  = database.ref('messData/months');  // per-mess-month: meals, bazar, others, transactions, managers, mealRates, officeMealRates, officeMealNotes, cookBills
let currentMonthRef = null;
let currentMonthKey = '';

// ── GLOBAL_FIELDS: saveGlobal() যা লেখে ────────────────────────────────────
// শুধু manager + controller উভয়েই লিখতে পারে এমন fields।
// controllers → saveControllers()  (controller-only Firebase path)
// prevBalances → saveHandover()    (controller-only Firebase path)
// handoverDone → saveHandover()    (controller-only Firebase path)
// rules        → feature বাদ দেওয়া হয়েছে
// উপরেরগুলো GLOBAL_FIELDS-এ থাকলে manager-এর saveGlobal() call fail করে → data হারায়।
const GLOBAL_FIELDS = ['users','cfg','siteNote','notice','shortfall'];
const MONTH_FIELDS  = ['meals','bazar','others','transactions','managers','mealRates','officeMealRates','officeMealNotes','cookBills'];

const auth = firebase.auth();
