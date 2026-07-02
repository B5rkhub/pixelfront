// ══════════════════════════════════════════════════════════
// 📋 GÖREV (QUEST) SİSTEMİ
// Günlük, Haftalık ve Kilometre Taşı görevleri.
// Veriler localStorage'da tutulur. Piksel basıldığında,
// streak kazanıldığında ve fraksiyon kurulduğunda güncellenir.
// ══════════════════════════════════════════════════════════

/* ── Görev Tanımları ── */
// NOT: name/desc alanları i18n ANAHTARI tutuyor (metin değil) — render
// anında t() ile çözülüyor (bkz. renderQuestList/quest bildirimleri),
// TUTORIAL_STEPS'teki aynı desen için bkz. tutorial.js.
const QUEST_DEFS = {
  daily: [
    { id:'d_place5',    icon:'🎯', name:'quest.d_place5_name',    desc:'quest.d_place5_desc',    type:'place',  target:5,  xp:8,   pixels:2 },
    { id:'d_place20',   icon:'🖌',  name:'quest.d_place20_name',   desc:'quest.d_place20_desc',   type:'place',  target:20, xp:18,  pixels:4 },
    { id:'d_place50',   icon:'⚡',  name:'quest.d_place50_name',   desc:'quest.d_place50_desc',   type:'place',  target:50, xp:35,  pixels:7 },
    { id:'d_login',     icon:'🔥',  name:'quest.d_login_name',     desc:'quest.d_login_desc',     type:'login',  target:1,  xp:5,   pixels:1 },
    { id:'d_3prov',     icon:'🗺', name:'quest.d_3prov_name',      desc:'quest.d_3prov_desc',     type:'provinces', target:3, xp:12, pixels:3 },
  ],
  weekly: [
    { id:'w_place100',  icon:'🌟', name:'quest.w_place100_name',  desc:'quest.w_place100_desc',  type:'place',  target:100, xp:40,  pixels:8  },
    { id:'w_place300',  icon:'💎', name:'quest.w_place300_name',  desc:'quest.w_place300_desc',  type:'place',  target:300, xp:90,  pixels:18 },
    { id:'w_streak3',   icon:'🔥', name:'quest.w_streak3_name',   desc:'quest.w_streak3_desc',   type:'streak', target:3,  xp:30,  pixels:6  },
    { id:'w_streak7',   icon:'👑', name:'quest.w_streak7_name',   desc:'quest.w_streak7_desc',   type:'streak', target:7,  xp:70,  pixels:14 },
    { id:'w_5prov',     icon:'🗺', name:'quest.w_5prov_name',      desc:'quest.w_5prov_desc',     type:'provinces', target:5, xp:25, pixels:5 },
    { id:'w_faction',   icon:'🏴', name:'quest.w_faction_name',   desc:'quest.w_faction_desc',   type:'faction', target:1, xp:20,  pixels:4  },
  ],
  milestone: [
    { id:'m_place10',   icon:'🌱', name:'quest.m_place10_name',   desc:'quest.m_place10_desc',   type:'total_place', target:10,   xp:15,  pixels:3  },
    { id:'m_place50',   icon:'🌿', name:'quest.m_place50_name',   desc:'quest.m_place50_desc',   type:'total_place', target:50,   xp:30,  pixels:6  },
    { id:'m_place200',  icon:'🌳', name:'quest.m_place200_name',  desc:'quest.m_place200_desc',  type:'total_place', target:200,  xp:60,  pixels:12 },
    { id:'m_place500',  icon:'🏅', name:'quest.m_place500_name',  desc:'quest.m_place500_desc',  type:'total_place', target:500,  xp:100, pixels:20 },
    { id:'m_place1000', icon:'🥇', name:'quest.m_place1000_name', desc:'quest.m_place1000_desc', type:'total_place', target:1000, xp:200, pixels:35 },
    { id:'m_place5000', icon:'👑', name:'quest.m_place5000_name', desc:'quest.m_place5000_desc', type:'total_place', target:5000, xp:500, pixels:80 },
    { id:'m_lv5',       icon:'⭐', name:'quest.m_lv5_name',       desc:'quest.m_lv5_desc',       type:'level',  target:5,   xp:25,  pixels:5  },
    { id:'m_lv10',      icon:'💫', name:'quest.m_lv10_name',      desc:'quest.m_lv10_desc',      type:'level',  target:10,  xp:50,  pixels:10 },
    { id:'m_streak7',   icon:'🔥', name:'quest.m_streak7_name',   desc:'quest.m_streak7_desc',   type:'streak', target:7,   xp:40,  pixels:8  },
  ]
};

/* ── Görev State Yönetimi ── */
let _questState = null; // { date:str, week:str, daily:{id:progress}, weekly:{id:progress}, claimed:{id:true} }
let _questTab = 'daily';

function _weekStr(){ // Bu haftanın ISO yıl+hafta kodu
  const d = new Date();
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7; // Pzt=0
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(((tmp - firstThursday) / 86400000 - 3 + (firstThursday.getUTCDay() + 6) % 7) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2,'0')}`;
}
function _todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadQuestState(){
  const key = CONFIG.storageKeys.quests + (typeof username !== 'undefined' ? username : '_guest');
  let s = {};
  try{ s = JSON.parse(localStorage.getItem(key) || '{}'); }catch(e){}
  const today = _todayStr();
  const week = _weekStr();
  // Günlük sıfırlama
  if(s.date !== today){ s.date = today; s.daily = {}; }
  // Haftalık sıfırlama
  if(s.week !== week){ s.week = week; s.weekly = {}; s.wkClaimed = {}; }
  if(!s.daily) s.daily = {};
  if(!s.weekly) s.weekly = {};
  if(!s.claimed) s.claimed = {}; // milestone'lar hiç sıfırlanmaz
  if(!s.wkClaimed) s.wkClaimed = {};
  if(!s.totalXP) s.totalXP = 0;
  _questState = s;
}

function saveQuestState(){
  if(!_questState) return;
  const key = CONFIG.storageKeys.quests + (typeof username !== 'undefined' ? username : '_guest');
  try{ localStorage.setItem(key, JSON.stringify(_questState)); }catch(e){}
}

/* ── Görev İlerleme Güncelleyici ── */
function questProgress(type, value, extra){
  if(!_questState) return;
  const today = _todayStr();
  const week = _weekStr();
  if(_questState.date !== today){ _questState.date = today; _questState.daily = {}; }
  if(_questState.week !== week){ _questState.week = week; _questState.weekly = {}; _questState.wkClaimed = {}; }

  const update = (bucket, defs) => {
    defs.forEach(q => {
      if(q.type !== type) return;
      const cur = bucket[q.id] || 0;
      if(cur >= q.target) return; // zaten tamamlandı
      let next = cur;
      if(type === 'place' || type === 'total_place'){ next = Math.min(cur + (value||1), q.target); }
      else if(type === 'login'){ next = 1; }
      else if(type === 'streak'){ next = value || 0; }
      else if(type === 'level'){ next = value || 0; }
      else if(type === 'provinces'){
        const provId = extra;
        if(provId){
          const setKey = q.id + '_provs';
          if(!bucket[setKey]) bucket[setKey] = [];
          if(!bucket[setKey].includes(provId)){
            bucket[setKey].push(provId);
            next = bucket[setKey].length;
          } else { next = (bucket[setKey]||[]).length; }
        }
      }
      else if(type === 'faction'){ next = 1; }
      bucket[q.id] = Math.min(next, q.target);
    });
  };

  update(_questState.daily, QUEST_DEFS.daily);
  update(_questState.weekly, QUEST_DEFS.weekly);
  // Milestone her zaman totalPlaced ya da global değerle beslenir
  if(type === 'total_place' || type === 'level' || type === 'streak' || type === 'faction'){
    update(_questState, QUEST_DEFS.milestone); // milestone doğrudan _questState'te
  }
  saveQuestState();
  updateQuestBadge();
}

/* Topbar/hamburger rozeti (!) */
function updateQuestBadge(){
  if(!_questState) return;
  const hasClaimable = checkAnyClaimable();
  const badge = document.getElementById('quest-badge');
  if(badge) badge.style.display = hasClaimable ? 'flex' : 'none';
  // Sheet'teki öğeyi de güncelle
  const shBadge = document.getElementById('ts-quest-badge');
  if(shBadge) shBadge.style.display = hasClaimable ? 'flex' : 'none';
}

function checkAnyClaimable(){
  if(!_questState) return false;
  const check = (bucket, claimBucket, defs) => defs.some(q => {
    const prog = bucket[q.id] || 0;
    return prog >= q.target && !claimBucket[q.id];
  });
  return check(_questState.daily, _questState.daily, QUEST_DEFS.daily) ||
         check(_questState.weekly, _questState.wkClaimed, QUEST_DEFS.weekly) ||
         check(_questState, _questState.claimed, QUEST_DEFS.milestone);
}

/* ── UI ── */
function openQuestPanel(){
  if(!_questState) loadQuestState();
  // Günlük giriş görevini tetikle
  questProgress('login');
  // Total placed'ı milestone'lara yaz
  const total = (typeof profileData !== 'undefined' && profileData.totalPlaced) || 0;
  QUEST_DEFS.milestone.forEach(q => {
    if(q.type === 'total_place'){
      if(!_questState[q.id] || _questState[q.id] < total){
        _questState[q.id] = Math.min(total, q.target);
      }
    }
    if(q.type === 'level'){
      const lv = (typeof profileData !== 'undefined' && profileData.level) || 1;
      if(!_questState[q.id] || _questState[q.id] < lv) _questState[q.id] = lv;
    }
    if(q.type === 'streak'){
      const str = (typeof profileData !== 'undefined' && profileData.streak) || 0;
      if(!_questState[q.id] || _questState[q.id] < str) _questState[q.id] = str;
    }
  });
  saveQuestState();
  renderQuestPanel();
  document.getElementById('quest-panel').classList.add('open');
}

function closeQuestPanel(){
  document.getElementById('quest-panel').classList.remove('open');
}

function switchQuestTab(tab){
  _questTab = tab;
  ['daily','weekly','milestone'].forEach(t => {
    document.getElementById('qtab-'+t).classList.toggle('active', t===tab);
  });
  renderQuestList();
}

function renderQuestPanel(){
  renderQuestSummary();
  renderQuestList();
}

function renderQuestSummary(){
  if(!_questState) return;
  let done = 0, xpEarned = 0;
  const countDone = (bucket, claimBucket, defs) => defs.forEach(q => {
    if(claimBucket[q.id]){ done++; xpEarned += q.xp; }
  });
  countDone(_questState.daily, _questState.daily, QUEST_DEFS.daily);
  countDone(_questState.weekly, _questState.wkClaimed, QUEST_DEFS.weekly);
  countDone(_questState, _questState.claimed, QUEST_DEFS.milestone);
  const total = QUEST_DEFS.daily.length + QUEST_DEFS.weekly.length + QUEST_DEFS.milestone.length;
  document.getElementById('q-sum-done').textContent = done;
  document.getElementById('q-sum-total').textContent = total;
  document.getElementById('q-sum-xp').textContent = (_questState.totalXP || 0);
}

function renderQuestList(){
  if(!_questState) return;
  const container = document.getElementById('quest-list');
  if(!container) return;

  let defs, bucket, claimBucket;
  if(_questTab === 'daily'){
    defs = QUEST_DEFS.daily; bucket = _questState.daily; claimBucket = _questState.daily;
  } else if(_questTab === 'weekly'){
    defs = QUEST_DEFS.weekly; bucket = _questState.weekly; claimBucket = _questState.wkClaimed;
  } else {
    defs = QUEST_DEFS.milestone; bucket = _questState; claimBucket = _questState.claimed;
  }

  container.innerHTML = defs.map(q => {
    const prog = Math.min(bucket[q.id] || 0, q.target);
    const pct = Math.round(prog / q.target * 100);
    const isDone = prog >= q.target;
    const isClaimed = claimBucket[q.id] && (isDone); // claimed sadece done iken geçerli

    const claimLabel = isClaimed ? t('quest.claimed') : isDone ? t('quest.claim_btn') : `${prog}/${q.target}`;
    const claimClass = isClaimed ? 'claimed-lbl' : isDone ? 'ready' : 'not-ready';

    return `<div class="qcard${isDone?' done':''}${isClaimed?' claimed':''}">
      ${isClaimed ? '<div class="qcard-done-badge">✓</div>' : ''}
      <div class="qcard-icon">${q.icon}</div>
      <div class="qcard-body">
        <div class="qcard-name">${t(q.name)}</div>
        <div class="qcard-desc">${t(q.desc)}</div>
        <div class="qcard-reward">+${q.xp} XP · +${q.pixels}${t('pixel.unit')}</div>
        <div class="qcard-bar-wrap">
          <div class="qcard-bar" style="width:${pct}%"></div>
        </div>
        <div class="qcard-prog-label">${prog} / ${q.target}</div>
      </div>
      <button class="qcard-claim ${claimClass}" onclick="claimQuest('${q.id}','${_questTab}')">
        ${claimLabel}
      </button>
    </div>`;
  }).join('');
}

function claimQuest(qid, tab){
  if(!_questState) return;
  let defs, bucket, claimBucket;
  if(tab === 'daily'){
    defs = QUEST_DEFS.daily; bucket = _questState.daily; claimBucket = _questState.daily;
  } else if(tab === 'weekly'){
    defs = QUEST_DEFS.weekly; bucket = _questState.weekly; claimBucket = _questState.wkClaimed;
  } else {
    defs = QUEST_DEFS.milestone; bucket = _questState; claimBucket = _questState.claimed;
  }

  const q = defs.find(x => x.id === qid);
  if(!q) return;
  const prog = bucket[q.id] || 0;
  if(prog < q.target || claimBucket[q.id]) return;

  // Ödülü ver
  claimBucket[q.id] = true;
  _questState.totalXP = (_questState.totalXP || 0) + q.xp;
  saveQuestState();

  // XP + Piksel ver
  if(typeof gainXP === 'function') gainXP(q.xp);
  if(typeof _setPixLeft === 'function' && typeof _getPixLeft === 'function'){
    const LIMIT = (typeof PIXEL_LIMIT !== 'undefined') ? PIXEL_LIMIT : 49;
    _setPixLeft(Math.min(_getPixLeft() + q.pixels, LIMIT));
    if(typeof updateDots === 'function') updateDots();
    try{ localStorage.setItem(CONFIG.storageKeys.pixels + (typeof username !== 'undefined' ? username : ''), _getPixLeft()); }catch(e){}
  }

  // SFX
  if(typeof SFX !== 'undefined') SFX.success();

  // Bildirim
  showQuestComplete(q);
  updateQuestBadge();
  renderQuestPanel();
}

let _qcnTimer = null;
function showQuestComplete(q){
  const el = document.getElementById('quest-complete-notif');
  if(!el) return;
  document.getElementById('qcn-name').textContent = t(q.name);
  document.getElementById('qcn-reward').textContent = `+${q.xp} XP · +${q.pixels}${t('pixel.unit')}`;
  el.classList.add('show');
  clearTimeout(_qcnTimer);
  _qcnTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ── Piksel basıldığında tetikle ── */
// gainXP her piksel basıldığında çağrılıyor — onu hook'luyoruz
const _origGainXPForQuests = window.gainXP;
window.gainXP = function(amount){
  if(typeof _origGainXPForQuests === 'function') _origGainXPForQuests.apply(this, arguments);
  // Quest ilerlemesi zaten handleClick'te ayrıca yapılıyor
};

// handleClick'i hook'la — piksel basımını yakala
const _qOrigHandleClick = window.handleClick;
window.handleClick = async function(mx, my){
  const prePix = (typeof _getPixLeft === 'function') ? _getPixLeft() : 0;
  await _qOrigHandleClick.apply(this, arguments);
  const postPix = (typeof _getPixLeft === 'function') ? _getPixLeft() : 0;
  if(postPix < prePix){ // gerçekten piksel harcandı (sunucu onayladı)
    if(!_questState) loadQuestState();
    // İl adını bul
    const flat = typeof canvasToFlat === 'function' ? canvasToFlat(mx, my) : -1;
    const provId = flat >= 0 && typeof FLAT_TO_PROV !== 'undefined' && typeof PROV_IDS !== 'undefined'
      ? PROV_IDS[FLAT_TO_PROV[flat]] : null;
    questProgress('place', 1);
    const total = (typeof profileData !== 'undefined' && profileData.totalPlaced) || 0;
    questProgress('total_place', total);
    if(provId) questProgress('provinces', 1, provId);
  }
};

// Streak değişince güncelle
const _origCheckDailyStreakForQuests = window.checkDailyStreak;
window.checkDailyStreak = function(){
  if(typeof _origCheckDailyStreakForQuests === 'function') _origCheckDailyStreakForQuests.apply(this, arguments);
  setTimeout(() => {
    if(!_questState) loadQuestState();
    const str = (typeof profileData !== 'undefined' && profileData.streak) || 0;
    questProgress('streak', str);
  }, 200);
};

// Fraksiyon kurma/katılma hook
const _origLoadFactions = window.loadFactions;
window.loadFactions = function(){
  if(typeof _origLoadFactions === 'function') _origLoadFactions.apply(this, arguments);
  setTimeout(() => {
    if(!_questState) loadQuestState();
    if(typeof factionData !== 'undefined' && factionData) questProgress('faction');
  }, 300);
};

// Sayfa açılışında state'i yükle (kullanıcı giriş yaptıktan sonra)
const _origActivateUserForQuests = window._activateUser;
// _activateUser inline tanımlandığı için direkt initMapWithoutLogin sonrasını yakalıyoruz
document.addEventListener('DOMContentLoaded', () => {
  // Quest panelini giriş yapınca göster
  const origActivate = window._activateUser;
  if(origActivate){
    window._activateUser = function(v){
      origActivate.apply(this, arguments);
      loadQuestState();
      questProgress('login');
      // Quest butonunu göster
      const qb = document.getElementById('quest-btn');
      if(qb) qb.style.display = '';
      const tsQb = document.getElementById('ts-questbtn');
      if(tsQb) tsQb.style.display = '';
      updateQuestBadge();
    };
  }
});

// Topbar hamburger sheet senkronizasyonuna quest'i ekle
const _origSyncTbSheet = window.syncTbSheet;
window.syncTbSheet = function(){
  if(typeof _origSyncTbSheet === 'function') _origSyncTbSheet.apply(this, arguments);
  // Quest butonunu da eşle
  const qb = document.getElementById('quest-btn');
  const tsQb = document.getElementById('ts-questbtn');
  if(qb && tsQb){
    tsQb.style.display = qb.style.display === 'none' ? 'none' : '';
  }
};

// Otomatik giriş (session var) için de quest'i aç
(function patchAutoLogin(){
  const origInitMap = window.initMapWithoutLogin;
  // initMapWithoutLogin async IIFE — hook'layamayız direkt.
  // Bunun yerine afterLoad benzeri bir gözlem yapalım.
  // checkAdminStatus çağrısı afterLoad'da oluyor; onu hook'larız.
  const _origCheckAdmin = window.checkAdminStatus;
  window.checkAdminStatus = async function(){
    if(typeof _origCheckAdmin === 'function') await _origCheckAdmin.apply(this, arguments);
    if(typeof username !== 'undefined' && username){
      loadQuestState();
      questProgress('login');
      // Quest butonunu göster
      const qb = document.getElementById('quest-btn');
      if(qb) qb.style.display = '';
      const tsQb = document.getElementById('ts-questbtn');
      if(tsQb) tsQb.style.display = '';
      updateQuestBadge();
    }
  };
})();
