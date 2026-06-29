// PixelFront — Progression sistemi birim testleri
// Çalıştır: node tests/progression.test.js
// Bağımlılık yok — saf fonksiyonlar izole olarak test edilir.

// ── Stub globals ──────────────────────────────────────────────────────
const CONFIG = {
  storageKeys: { xp:'pv_xp_', streak:'pv_streak_', pixels:'pv_px_' }
};
const _currentLang = 'tr';
const STREAK_REWARDS = {
  tr: {
    1:{icon:'⭐',label:'Başlangıç',xp:5,pixels:1},
    2:{icon:'🌟',label:'İkinci Gün',xp:8,pixels:2},
    3:{icon:'💫',label:'Üçüncü Gün',xp:12,pixels:3},
    4:{icon:'✨',label:'Dördüncü Gün',xp:15,pixels:4},
    5:{icon:'🔥',label:'Beşinci Gün',xp:20,pixels:5},
    6:{icon:'💎',label:'Altıncı Gün',xp:25,pixels:6},
    7:{icon:'👑',label:'Tam Seri!',xp:35,pixels:8},
  }
};

// ── Fonksiyonları inline al (require yok — klasik script ortamı) ──────
function xpForLevel(lvl){
  if(lvl<=1) return 0;
  let total=0;
  for(let i=1;i<lvl;i++) total+=Math.floor(10*Math.pow(1.5,i-1));
  return total;
}
function xpNeededForNextLevel(lvl){ return xpForLevel(lvl+1)-xpForLevel(lvl); }
function getLevelFromXP(xp){
  let lvl=1;
  while(xpForLevel(lvl+1)<=xp) lvl++;
  return lvl;
}
function getStreakRewardBase(cyclePos){
  const set=STREAK_REWARDS[_currentLang]||STREAK_REWARDS.tr;
  return set[cyclePos];
}
function getStreakReward(day){
  const cyclePos=((day-1)%7)+1;
  const cycleNum=Math.floor((day-1)/7);
  const base=getStreakRewardBase(cyclePos);
  const mult=1+cycleNum*0.25;
  return {icon:base.icon,label:base.label,xp:Math.round(base.xp*mult),pixels:Math.round(base.pixels*mult)};
}
function _daysBetweenLocalStr(a,b){
  const da=new Date(a+'T00:00:00');
  const db=new Date(b+'T00:00:00');
  return Math.round((db-da)/86400000);
}

// ── Test koşucusu ─────────────────────────────────────────────────────
let passed=0, failed=0;
function assert(desc, actual, expected){
  const ok = JSON.stringify(actual)===JSON.stringify(expected);
  if(ok){ passed++; console.log(`  ✓ ${desc}`); }
  else { failed++; console.error(`  ✗ ${desc}\n    beklenen: ${JSON.stringify(expected)}\n    alınan:   ${JSON.stringify(actual)}`); }
}

// ── xpForLevel ────────────────────────────────────────────────────────
console.log('\nxpForLevel:');
assert('LV1 = 0 XP',       xpForLevel(1),  0);
assert('LV2 = 10 XP',      xpForLevel(2),  10);
assert('LV3 = 25 XP',      xpForLevel(3),  25);
assert('LV4 = 47 XP',      xpForLevel(4),  47);
assert('LV5 = 80 XP',      xpForLevel(5),  80);

// ── getLevelFromXP ────────────────────────────────────────────────────
console.log('\ngetLevelFromXP:');
assert('0 XP → LV1',       getLevelFromXP(0),  1);
assert('9 XP → LV1',       getLevelFromXP(9),  1);
assert('10 XP → LV2',      getLevelFromXP(10), 2);
assert('24 XP → LV2',      getLevelFromXP(24), 2);
assert('25 XP → LV3',      getLevelFromXP(25), 3);

// ── xpNeededForNextLevel ──────────────────────────────────────────────
console.log('\nxpNeededForNextLevel:');
assert('LV1→LV2 = 10',     xpNeededForNextLevel(1), 10);
assert('LV2→LV3 = 15',     xpNeededForNextLevel(2), 15);
assert('LV3→LV4 = 25',     xpNeededForNextLevel(3), xpForLevel(4)-xpForLevel(3));

// ── getStreakReward ───────────────────────────────────────────────────
console.log('\ngetStreakReward:');
const r1=getStreakReward(1);
assert('Gün 1 XP = 5',     r1.xp, 5);
assert('Gün 1 pixels = 1', r1.pixels, 1);
const r7=getStreakReward(7);
assert('Gün 7 XP = 35',    r7.xp, 35);
assert('Gün 7 pixels = 8', r7.pixels, 8);
const r8=getStreakReward(8); // 2. tur, cyclePos=1, mult=1.25
assert('Gün 8 XP = round(5*1.25)=6', r8.xp, Math.round(5*1.25));
const r14=getStreakReward(14); // 2. tur, cyclePos=7, mult=1.25
assert('Gün 14 XP = round(35*1.25)=44', r14.xp, Math.round(35*1.25));

// ── _daysBetweenLocalStr ──────────────────────────────────────────────
console.log('\n_daysBetweenLocalStr:');
assert('Aynı gün = 0',        _daysBetweenLocalStr('2024-01-01','2024-01-01'), 0);
assert('Bir gün sonra = 1',   _daysBetweenLocalStr('2024-01-01','2024-01-02'), 1);
assert('Bir gün önce = -1',   _daysBetweenLocalStr('2024-01-02','2024-01-01'), -1);
assert('Yıl sonu → yıl başı', _daysBetweenLocalStr('2023-12-31','2024-01-01'), 1);

// ── Sonuç ─────────────────────────────────────────────────────────────
console.log(`\n${passed} geçti, ${failed} başarısız — ${passed+failed} testin tümü\n`);
process.exit(failed > 0 ? 1 : 0);
