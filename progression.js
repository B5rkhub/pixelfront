// ═══════════════════════════════════════════════════════
// XP / SEVİYE SİSTEMİ
// ═══════════════════════════════════════════════════════

const XP_LEVEL_TITLES = {
  tr: [
    'Acemi', 'Pikselci', 'Çizici', 'Sanatçı', 'Uzman',
    'Usta', 'Virtüöz', 'Şampiyon', 'Efsane', 'Titan',
    'İmparator', 'Tanrısal', 'Ölümsüz', 'Yaratıcı', 'Evrensel',
    'Kozmik', 'Sonsuz', 'Mutlak', 'Aşkın', 'Eşsiz',
    'Gizemli', 'Kadim', 'Ruhsal', 'Ateşli', 'Kristal',
    'Altın', 'Gümüş', 'Platin', 'Elmas', 'Kahraman'
  ],
  en: [
    'Novice', 'Pixelist', 'Sketcher', 'Artist', 'Expert',
    'Master', 'Virtuoso', 'Champion', 'Legend', 'Titan',
    'Emperor', 'Divine', 'Immortal', 'Creator', 'Universal',
    'Cosmic', 'Infinite', 'Absolute', 'Transcendent', 'Peerless',
    'Mystic', 'Ancient', 'Spiritual', 'Fiery', 'Crystal',
    'Golden', 'Silver', 'Platinum', 'Diamond', 'Hero'
  ]
};

// ═══════════════════════════════════════════════════════
// 🔥 GÜNLÜK SERİ (STREAK) SİSTEMİ
// Oyuncu üst üste her gün girdikçe seri sayacı artar; her gün
// farklı ve gittikçe büyüyen bir ödül verilir (XP + bonus piksel,
// 7. günde ekstra büyük ödül). Bir gün atlanırsa seri 1'e döner.
// Ödül deposu (PIXEL_LIMIT=49) doluysa taşan piksel otomatik
// XP'ye çevrilir, ödül asla "kaybolmaz".
// ═══════════════════════════════════════════════════════

// 7 günlük döngü — gün 7'den sonra tekrar 1'den başlar ama XP miktarları
// kademeli artmaya devam eder (STREAK_XP_BASE + gün*artış formülüyle).
const STREAK_REWARDS = {
  tr: {
    1: { icon:'🔥', xp:5,  pixels:2,  label:'Seriye başladın!' },
    2: { icon:'⚡', xp:8,  pixels:3,  label:'İkinci gün!' },
    3: { icon:'✨', xp:12, pixels:4,  label:'Üç gün üst üste!' },
    4: { icon:'💪', xp:16, pixels:5,  label:'Dört gün — harika gidiyorsun!' },
    5: { icon:'🌟', xp:22, pixels:6,  label:'Beş gün! Az kaldı...' },
    6: { icon:'🚀', xp:28, pixels:7,  label:'Altı gün — son düzlük!' },
    7: { icon:'👑', xp:50, pixels:12, label:'7 GÜN TAM SERİ! Büyük ödül!' }
  },
  en: {
    1: { icon:'🔥', xp:5,  pixels:2,  label:'Streak started!' },
    2: { icon:'⚡', xp:8,  pixels:3,  label:'Second day!' },
    3: { icon:'✨', xp:12, pixels:4,  label:'Three days in a row!' },
    4: { icon:'💪', xp:16, pixels:5,  label:"Four days — you're crushing it!" },
    5: { icon:'🌟', xp:22, pixels:6,  label:'Five days! Almost there...' },
    6: { icon:'🚀', xp:28, pixels:7,  label:'Six days — final stretch!' },
    7: { icon:'👑', xp:50, pixels:12, label:'FULL 7-DAY STREAK! Big reward!' }
  }
};
function getStreakRewardBase(cyclePos){
  const set = STREAK_REWARDS[_currentLang] || STREAK_REWARDS.tr;
  return set[cyclePos];
}
function getStreakReward(day){
  const cyclePos = ((day - 1) % 7) + 1; // 1..7 döngüsü
  const cycleNum = Math.floor((day - 1) / 7); // kaçıncı 7-gün turu (0,1,2...)
  const base = getStreakRewardBase(cyclePos);
  // Her tam 7-gün turundan sonra ödüller %25 büyür (uzun vadeli oyuncular için motivasyon)
  const mult = 1 + cycleNum * 0.25;
  return {
    icon: base.icon,
    label: base.label,
    xp: Math.round(base.xp * mult),
    pixels: Math.round(base.pixels * mult)
  };
}

const XP_REWARDS = {
  tr: {
    5:  { icon: '🖼️', name: 'Özel Avatar Çerçevesi (Altın Halkası)', frame: 'gold' },
    10: { icon: '🏅', name: 'Yeni Profil Rozeti (Piksel Madalyası)', badge: 'pixel_medal' },
    15: { icon: '✨', name: 'Özel İsim Rengi (Mor Gradyan)', nameColor: 'purple' },
    20: { icon: '💎', name: 'Nadir Avatar Çerçevesi (Gökkuşağı)', frame: 'rainbow' },
    25: { icon: '👑', name: 'Özel Unvan: "Piksel Efendisi"', title: 'Piksel Efendisi' }
  },
  en: {
    5:  { icon: '🖼️', name: 'Exclusive Avatar Frame (Golden Ring)', frame: 'gold' },
    10: { icon: '🏅', name: 'New Profile Badge (Pixel Medal)', badge: 'pixel_medal' },
    15: { icon: '✨', name: 'Custom Name Color (Purple Gradient)', nameColor: 'purple' },
    20: { icon: '💎', name: 'Rare Avatar Frame (Rainbow)', frame: 'rainbow' },
    25: { icon: '👑', name: 'Exclusive Title: "Pixel Master"', title: 'Pixel Master' }
  }
};
function getXPReward(lvl){
  const rewards = XP_REWARDS[_currentLang] || XP_REWARDS.tr;
  return rewards[lvl];
}

// Σ floor(10 × 1.5^i) for i=0..lvl-2 — LV2=10, LV3=25, LV4=47, LV5=80
function xpForLevel(lvl){
  if(lvl <= 1) return 0;
  let total = 0;
  for(let i = 1; i < lvl; i++){
    total += Math.floor(10 * Math.pow(1.5, i - 1));
  }
  return total;
}
function xpNeededForNextLevel(lvl){
  return xpForLevel(lvl + 1) - xpForLevel(lvl);
}
function getLevelFromXP(xp){
  let lvl = 1;
  while(xpForLevel(lvl + 1) <= xp) lvl++;
  return lvl;
}

function getLevelTitle(lvl){
  const titles = XP_LEVEL_TITLES[_currentLang] || XP_LEVEL_TITLES.tr;
  return titles[Math.min(lvl - 1, titles.length - 1)] || t('level.legendary_title');
}

function saveXPData(){
  try{
    localStorage.setItem(CONFIG.storageKeys.xp + username, JSON.stringify({
      xp: profileData.xp || 0,
      level: profileData.level || 1
    }));
  }catch(e){}
}

async function syncXPToSupabase(){
  try{
    await supabase.from('user_levels').upsert({
      username: username,
      xp: profileData.xp || 0,
      level: profileData.level || 1,
      updated_at: new Date().toISOString()
    }, { onConflict: 'username' });
  }catch(e){ /* sessiz hata */ }
}

// Seri verisini ayrı bir upsert ile gönderiyoruz — eğer user_levels tablosunda
// streak/streak_best/last_login_date kolonları yoksa bu istek sessizce
// başarısız olur ve ana XP senkronizasyonunu (syncXPToSupabase) ETKİLEMEZ.
// Seri ilerleyişi her durumda localStorage'da (pv_streak_<kullanıcı>) güvende kalır.
async function syncStreakToSupabase(){
  try{
    await supabase.from('user_levels').upsert({
      username: username,
      streak: profileData.streak || 0,
      streak_best: profileData.streakBest || 0,
      last_login_date: profileData.lastLoginDate || '',
      updated_at: new Date().toISOString()
    }, { onConflict: 'username' });
  }catch(e){ /* sessiz hata — tablo şemasında streak kolonları olmayabilir */ }
}

function saveStreakData(){
  try{
    localStorage.setItem(CONFIG.storageKeys.streak + username, JSON.stringify({
      streak: profileData.streak || 0,
      streakBest: profileData.streakBest || 0,
      lastLoginDate: profileData.lastLoginDate || ''
    }));
  }catch(e){}
}

async function loadXPFromSupabase(){
  try{
    const {data, error} = await supabase.from('user_levels')
      .select('xp,level,streak,streak_best,last_login_date').eq('username', username).limit(1);
    if(!error && data && data.length > 0){
      profileData.xp = data[0].xp || 0;
      profileData.level = data[0].level || 1;
      // Sunucuda streak kolonları varsa kullan; yoksa (undefined) localStorage yedeğine düş
      if(data[0].streak !== undefined && data[0].streak !== null) profileData.streak = data[0].streak;
      if(data[0].streak_best !== undefined && data[0].streak_best !== null) profileData.streakBest = data[0].streak_best;
      if(data[0].last_login_date !== undefined && data[0].last_login_date !== null) profileData.lastLoginDate = data[0].last_login_date;
      saveProfile();
      saveXPData();
      saveStreakData();
      return;
    }
  }catch(e){}
  // localStorage yedek
  try{
    const raw = localStorage.getItem(CONFIG.storageKeys.xp + username);
    if(raw){
      const d = JSON.parse(raw);
      profileData.xp = d.xp || 0;
      profileData.level = d.level || 1;
    }
  }catch(e){}
  try{
    const rawS = localStorage.getItem(CONFIG.storageKeys.streak + username);
    if(rawS){
      const ds = JSON.parse(rawS);
      profileData.streak = ds.streak || 0;
      profileData.streakBest = ds.streakBest || 0;
      profileData.lastLoginDate = ds.lastLoginDate || '';
    }
  }catch(e){}
}

function gainXP(amount){
  const prevLevel = profileData.level || 1;
  profileData.xp = (profileData.xp || 0) + amount;
  const newLevel = getLevelFromXP(profileData.xp);
  profileData.level = newLevel;

  // Her iki storage'a da kaydet (pv_xp_ ve pv_profile ikisi de güncel kalsın)
  saveXPData();
  saveProfile();
  // Supabase'e async gönder (bloklamaz)
  syncXPToSupabase();

  // Seviye atladıysa bildirim
  if(newLevel > prevLevel){
    for(let lv = prevLevel + 1; lv <= newLevel; lv++){
      showLevelUpNotification(lv);
    }
  }

  // UI güncelle
  updateXPUI();
}

// ═══════════════════════════════════════════════════════
// 🔥 GÜNLÜK SERİ (STREAK) KONTROLÜ
// Oturum açılışında (her gerçek girişte, sayfa yenilemede değil)
// bir kez çağrılır. Kullanıcının yerel tarihine göre:
//  - Bugün zaten sayıldıysa  → hiçbir şey yapma
//  - Dün giriş yapılmışsa    → seri +1, ödül ver
//  - Daha eski / hiç yoksa   → seri 1'e sıfırlanır (yeniden başlar), ödül ver
// "Bugün" ve "dün" kullanıcının kendi saat dilimine göre hesaplanır
// (UTC değil) ki gece yarısı sınırı oyuncu için doğal hissettirsin.
// ═══════════════════════════════════════════════════════
function _todayLocalStr(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function _daysBetweenLocalStr(a, b){ // 'YYYY-MM-DD' formatında iki tarih arası gün farkı (b - a)
  const da = new Date(a+'T00:00:00');
  const db = new Date(b+'T00:00:00');
  return Math.round((db - da) / 86400000);
}

function checkDailyStreak(){
  if(!username) return;
  const today = _todayLocalStr();
  const last = profileData.lastLoginDate || '';

  if(last === today){
    // Bugün zaten sayıldı — sadece UI'ı güncel tut
    updateStreakUI();
    return;
  }

  let newStreak;
  if(last && _daysBetweenLocalStr(last, today) === 1){
    // Tam olarak dün giriş yapılmış → seri devam ediyor
    newStreak = (profileData.streak || 0) + 1;
  } else {
    // Hiç giriş yok ya da bir gün atlanmış → seri yeniden başlar
    newStreak = 1;
  }

  profileData.streak = newStreak;
  profileData.streakBest = Math.max(profileData.streakBest || 0, newStreak);
  profileData.lastLoginDate = today;

  // 30 günlük takvim görünümü için giriş tarihlerini logla (son 45 günü tutuyoruz, yeter)
  profileData.loginDates = profileData.loginDates || [];
  profileData.loginDates.push(today);
  if(profileData.loginDates.length > 45) profileData.loginDates = profileData.loginDates.slice(-45);

  saveStreakData();
  saveProfile();
  syncStreakToSupabase();
  updateStreakUI();

  // ── Ödülü uygula ──
  const reward = getStreakReward(newStreak);
  // Bonus piksel: depo (PIXEL_LIMIT) doluysa taşan kısmı XP'ye çevir, kayıp olmasın
  const room = PIXEL_LIMIT - _getPixLeft();
  const grantedPixels = Math.max(0, Math.min(reward.pixels, room));
  const overflowPixels = reward.pixels - grantedPixels;
  if(grantedPixels > 0){
    _setPixLeft(_getPixLeft() + grantedPixels);
    try{ localStorage.setItem(CONFIG.storageKeys.pixels + username, _getPixLeft()); }catch(e){}
  }
  const totalXP = reward.xp + overflowPixels; // taşan piksel başına 1 XP telafi
  gainXP(totalXP);

  showStreakNotification(newStreak, reward, grantedPixels, overflowPixels);
}

function updateStreakUI(){
  const badge = document.getElementById('pb-streak-badge');
  const streak = profileData.streak || 0;
  if(badge){
    if(streak > 0){
      badge.style.display = 'inline-flex';
      badge.textContent = '🔥 ' + streak;
    } else {
      badge.style.display = 'none';
    }
  }
}

let _streakNotifQueue = [];
let _streakNotifShowing = false;
function showStreakNotification(day, reward, grantedPixels, overflowPixels){
  _streakNotifQueue.push({day, reward, grantedPixels, overflowPixels});
  if(!_streakNotifShowing) processStreakNotifQueue();
}
function processStreakNotifQueue(){
  if(_streakNotifQueue.length === 0){ _streakNotifShowing = false; return; }
  _streakNotifShowing = true;
  const {day, reward, grantedPixels, overflowPixels} = _streakNotifQueue.shift();

  const notif = document.getElementById('streak-notif');
  const daysEl = document.getElementById('streak-days');
  const subEl = document.getElementById('streak-sub');
  const rewardEl = document.getElementById('streak-reward');

  daysEl.textContent = day + t('streak.days_unit');
  subEl.textContent = reward.label;
  let rewardParts = [];
  if(grantedPixels > 0) rewardParts.push('+' + grantedPixels + ' 🧱' + t('pixel.unit'));
  rewardParts.push('+' + reward.xp + (overflowPixels>0 ? '' : '') + ' ' + t('xp.unit'));
  rewardEl.textContent = reward.icon + ' ' + rewardParts.join('   ');

  if(typeof SFX !== 'undefined') SFX.success();

  notif.classList.remove('show');
  void notif.offsetWidth; // reflow
  notif.classList.add('show');

  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(processStreakNotifQueue, 300);
  }, 4000);
}

function renderStreakPanel(){
  const streak = profileData.streak || 0;
  const best = profileData.streakBest || 0;
  const cyclePos = streak > 0 ? ((streak - 1) % 7) + 1 : 0;

  const dayIcons = [1,2,3,4,5,6,7].map(d=>{
    const r = getStreakRewardBase(d);
    const isDone = d <= cyclePos;
    const isToday = d === cyclePos && streak > 0;
    return `<div class="pc-streak-day${isDone?' done':''}${isToday?' today':''}">
      <div class="pc-streak-day-icon">${r.icon}</div>
      <div class="pc-streak-day-label">${d}${t('streak.day_short')}</div>
    </div>`;
  }).join('');

  const nextReward = getStreakReward(streak + 1);

  // 30 günlük geçmiş takvimi (gerçek giriş tarihlerinden, loginDates üzerinden)
  const loginSet = new Set(profileData.loginDates || []);
  const calCells = [];
  for(let i=29;i>=0;i--){
    const d = new Date();
    d.setDate(d.getDate()-i);
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    const ds = `${y}-${m}-${day}`;
    const isHit = loginSet.has(ds);
    const isToday = i===0;
    const dayNum = d.getDate();
    calCells.push(`<div class="pc-streak-cal-cell${isHit?' hit':''}${isToday?' today':''}" title="${ds}${isHit?' — '+t('streak.cal_active'):' — '+t('streak.cal_missed')}">${dayNum}</div>`);
  }
  const calHTML = calCells.join('');

  document.getElementById('pc-streak-card').innerHTML = `
    <div class="pc-streak-header">
      <div>
        <div class="pc-streak-num">🔥 ${streak}</div>
        <div class="pc-streak-title">${t('streak.title')}</div>
      </div>
      <div style="text-align:right">
        <div class="pc-streak-best">${t('streak.best_label')}${best}${t('streak.days_unit')}</div>
      </div>
    </div>
    <div class="pc-streak-week">${dayIcons}</div>
    <div class="pc-streak-note">${t('streak.tomorrow_note', {icon: nextReward.icon, pixels: nextReward.pixels, xp: nextReward.xp})}</div>
    <div class="pc-streak-cal-head">
      <div class="pc-streak-cal-title">${t('streak.cal_title')}</div>
    </div>
    <div class="pc-streak-cal-grid">${calHTML}</div>
    <div class="pc-streak-cal-legend">
      <span><span class="pc-streak-cal-swatch" style="background:rgba(245,166,35,.45)"></span>${t('streak.cal_active')}</span>
      <span><span class="pc-streak-cal-swatch" style="background:var(--surf2);border:1px solid var(--bdr)"></span>${t('streak.cal_missed')}</span>
    </div>
  `;
}

let _lvlUpQueue = [];
let _lvlUpShowing = false;

function showLevelUpNotification(lv){
  _lvlUpQueue.push(lv);
  if(!_lvlUpShowing) processLevelUpQueue();
}

function processLevelUpQueue(){
  if(_lvlUpQueue.length === 0){ _lvlUpShowing = false; return; }
  _lvlUpShowing = true;
  const lv = _lvlUpQueue.shift();
  const reward = getXPReward(lv);
  const title = getLevelTitle(lv);

  const notif = document.getElementById('levelup-notif');
  const lvEl = document.getElementById('levelup-lv');
  const titleEl = document.getElementById('levelup-title');
  const rewardEl = document.getElementById('levelup-reward');

  lvEl.textContent = t('leaderboard.level_short').toUpperCase() + ' ' + lv;
  titleEl.textContent = title;
  rewardEl.textContent = reward ? reward.icon + ' ' + reward.name : '';

  notif.classList.remove('show');
  void notif.offsetWidth; // reflow
  notif.classList.add('show');

  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(processLevelUpQueue, 300);
  }, 4000);
}

function updateXPUI(){
  const xp = profileData.xp || 0;
  const lvl = profileData.level || 1;
  const curLvlXP = xpForLevel(lvl);
  const nextLvlXP = xpForLevel(lvl + 1);
  const needed = nextLvlXP - curLvlXP;
  const progress = needed > 0 ? Math.min(100, Math.round(((xp - curLvlXP) / needed) * 100)) : 100;

  // Profile button badge
  const badge = document.getElementById('pb-level-badge');
  if(badge) badge.textContent = t('leaderboard.level_short') + ' ' + lvl;
  const bar = document.getElementById('pb-xp-bar');
  if(bar) bar.style.width = progress + '%';
}

function renderLevelPanel(){
  const xp = profileData.xp || 0;
  const lvl = profileData.level || 1;
  const title = getLevelTitle(lvl);
  const curLvlXP = xpForLevel(lvl);
  const nextLvlXP = xpForLevel(lvl + 1);
  const needed = nextLvlXP - curLvlXP;
  const earned = xp - curLvlXP;
  const progress = needed > 0 ? Math.min(100, Math.round((earned / needed) * 100)) : 100;

  // Ödüller listesi (tüm 5'in katlarını göster, max lv 25)
  const rewardKeys = [5, 10, 15, 20, 25];
  const rewardsHTML = rewardKeys.map(rlv => {
    const r = getXPReward(rlv);
    const isEarned = lvl >= rlv;
    return `<div class="pc-reward-item${isEarned ? ' earned' : ''}">
      <div class="pc-reward-lv">${t('leaderboard.level_short')}${rlv}</div>
      <div class="pc-reward-icon">${r.icon}</div>
      <div class="pc-reward-name">${r.name}</div>
      ${isEarned ? '<div class="pc-reward-check">✓</div>' : ''}
    </div>`;
  }).join('');

  const _loc = _currentLang==='tr'?'tr-TR':'en-US';
  document.getElementById('pc-level-card').innerHTML = `
    <div class="pc-lv-header">
      <div>
        <div class="pc-lv-num">${t('leaderboard.level_short').toUpperCase()} ${lvl}</div>
        <div class="pc-lv-title">${title}</div>
      </div>
      <div style="text-align:right">
        <div class="pc-lv-xp">${xp.toLocaleString(_loc)} ${t('xp.unit')}</div>
        <div style="font-size:.58rem;color:var(--muted);margin-top:.1rem">${t('level.next_label')}${nextLvlXP.toLocaleString(_loc)} ${t('xp.unit')}</div>
      </div>
    </div>
    <div class="pc-lv-bar-wrap"><div class="pc-lv-bar" style="width:${progress}%"></div></div>
    <div class="pc-lv-legend">
      <span>${earned.toLocaleString(_loc)} / ${needed.toLocaleString(_loc)} ${t('xp.unit')}</span>
      <span>${progress}%</span>
    </div>
    <div style="font-size:.62rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:.1rem">${t('level.rewards_title')}</div>
    <div class="pc-lv-rewards">${rewardsHTML}</div>
  `;
}

async function renderLevelLeaderboard(){
  const el = document.getElementById('level-leaderboard');
  if(!el) return;
  try{
    const {data, error} = await supabase.from('user_levels')
      .select('username,xp,level')
      .order('xp', { ascending: false })
      .limit(10);
    if(error || !data || data.length === 0){
      el.innerHTML = `<div style="font-size:.68rem;color:var(--muted);text-align:center;padding:.4rem 0">${t('owner.none_yet')}</div>`;
      return;
    }
    el.innerHTML = data.map((row, i) => {
      const pos = i + 1;
      const posIcon = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
      // GÜVENLİK: row.username Supabase'den geliyor ama yine de kullanıcı
      // tarafından kayıt sırasında serbestçe belirlenmiş bir alan — herkesin
      // gördüğü liderlik tablosuna gömülmeden önce kaçışlanmalı (stored XSS önleme).
      const safeUsername = _esc(row.username || '?');
      const initials = _esc((row.username || '?').slice(0, 2).toUpperCase());
      const isMe = row.username === username;
      return `<div class="lvl-rank-row" ${isMe ? 'style="background:rgba(123,97,255,.12);border-radius:8px;"' : ''}>
        <div class="lvl-rank-pos">${posIcon}</div>
        <div class="lvl-rank-av">${initials}</div>
        <div class="lvl-rank-name">${safeUsername}${isMe ? ` <span style="font-size:.55rem;color:var(--accent)">(${t('leaderboard.you')})</span>` : ''}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
          <div class="lvl-rank-lv">${t('leaderboard.level_short')} ${row.level || 1}</div>
          <div class="lvl-rank-xp">${(row.xp || 0).toLocaleString(_currentLang==='tr'?'tr-TR':'en-US')} ${t('xp.unit')}</div>
        </div>
      </div>`;
    }).join('');
  }catch(e){
    el.innerHTML = `<div style="font-size:.68rem;color:var(--muted);text-align:center;padding:.4rem 0">${t('owner.load_failed')}</div>`;
  }
}

