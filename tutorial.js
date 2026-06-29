// tutorial.js — Spotlight tutorial
// Belirli UI elementlerini aydınlatarak adım adım oyun tanıtımı yapar.
// İlk girişte otomatik gösterilir, localStorage bayrağıyla bir kez.

const TUTORIAL_STEPS = [
  {
    target: null,
    icon: '🗺️',
    title: 'PixelFront\'a Hoş Geldin!',
    desc: 'Herkesin gerçek zamanlı birlikte boyadığı bir Türkiye haritası. Toprak kazan, fraksiyona katıl, savaşlara gir.',
  },
  {
    target: 'c',
    icon: '🖱️',
    title: 'Haritaya Tıkla',
    desc: 'Haritada istediğin kareye tıkla ya da dokunup tut. Renk seçici açılır, pikselini bas. Kaydırmak için sürükle, yakınlaştırmak için scroll/pinch.',
  },
  {
    target: 'pixel-widget',
    icon: '🎨',
    title: 'Piksel Depon',
    desc: 'Elindeki piksel sayısı burada görünür. Maks 49 biriktirip tek seferde basabilirsin — sabırlı oyuncular avantajlıdır.',
  },
  {
    target: 'cdlabel',
    icon: '⏳',
    title: 'Cooldown',
    desc: 'Piksel bastıktan sonra kısa bir bekleme başlar. Sayaç sıfırlanınca yeni hakkın gelir.',
  },
  {
    target: 'profile-btn',
    icon: '⭐',
    title: 'Profil & XP',
    desc: 'Her piksel XP kazandırır. Seviye atlayınca yeni çerçeveler ve unvanlar açılır. Lider tablosunu da buradan takip edebilirsin.',
  },
  {
    target: 'faction-btn',
    icon: '🏴',
    title: 'Fraksiyonlar',
    desc: 'Fraksiyona katıl ya da kendi grubunu kur. Müttefikler edin, savaş ilan et, haritada toprak savun.',
  },
  {
    target: 'chat-btn',
    icon: '💬',
    title: 'Sohbet',
    desc: 'Global sohbette herkesle konuş ya da fraksiyonunla özel kanalda strateji belirle.',
  },
  {
    target: null,
    icon: '🚀',
    title: 'Hazırsın!',
    desc: 'İlk pikselini bas, topraklarını büyüt. İyi oyunlar!',
  },
];

let _tutStep = 0;

function maybeShowTutorial() {
  try { if (localStorage.getItem(CONFIG.storageKeys.tutorialSeen) === '1') return; } catch(e) {}
  _tutStep = 0;
  const ov = document.getElementById('tutorial-overlay');
  if (ov) ov.classList.add('show');
  _tutRender();
  document.addEventListener('keydown', _tutKey);
}

function _tutRender() {
  const s = TUTORIAL_STEPS[_tutStep];
  const isLast = _tutStep === TUTORIAL_STEPS.length - 1;

  document.getElementById('tut-icon').textContent = s.icon;
  document.getElementById('tut-title').textContent = s.title;
  document.getElementById('tut-desc').textContent = s.desc;
  document.getElementById('tut-next').textContent = isLast ? 'Anladım, Başla! 🎉' : 'İleri →';
  document.getElementById('tut-progress').textContent = `${_tutStep + 1} / ${TUTORIAL_STEPS.length}`;
  document.getElementById('tut-dots').innerHTML = TUTORIAL_STEPS.map((_, i) =>
    `<span class="tut-dot${i === _tutStep ? ' active' : ''}"></span>`).join('');

  _tutApplySpotlight(s.target);
}

function _tutApplySpotlight(targetId) {
  const ov = document.getElementById('tutorial-overlay');
  const spot = document.getElementById('tut-spotlight');
  const card = document.querySelector('.tut-card');

  if (!targetId) {
    ov.classList.remove('tut-has-spotlight');
    spot.removeAttribute('style');
    card.removeAttribute('style');
    return;
  }

  const el = document.getElementById(targetId);
  const r = el && el.getBoundingClientRect();
  if (!r || r.width === 0) {
    ov.classList.remove('tut-has-spotlight');
    spot.removeAttribute('style');
    card.removeAttribute('style');
    return;
  }

  const pad = 10;
  ov.classList.add('tut-has-spotlight');
  spot.style.cssText = `left:${r.left-pad}px;top:${r.top-pad}px;width:${r.width+pad*2}px;height:${r.height+pad*2}px;`;

  _tutPlaceCard(card, r);
}

function _tutPlaceCard(card, r) {
  const vW = window.innerWidth, vH = window.innerHeight;
  const cW = Math.min(vW * 0.88, 340);
  const cH = 210;
  const M = 14;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let l, t;

  if (r.right + M + cW <= vW - M) {
    // sağına yerleştir
    l = r.right + M;
    t = clamp(r.top + r.height / 2 - cH / 2, M, vH - cH - M);
  } else if (r.left - M - cW >= M) {
    // soluna yerleştir
    l = r.left - M - cW;
    t = clamp(r.top + r.height / 2 - cH / 2, M, vH - cH - M);
  } else if (r.bottom + M + cH <= vH) {
    // altına yerleştir
    l = clamp(r.left + r.width / 2 - cW / 2, M, vW - cW - M);
    t = r.bottom + M;
  } else {
    // üstüne yerleştir
    l = clamp(r.left + r.width / 2 - cW / 2, M, vW - cW - M);
    t = Math.max(M, r.top - cH - M);
  }

  card.style.cssText = `position:fixed;left:${l}px;top:${t}px;width:${cW}px;`;
}

function tutorialNext() {
  if (_tutStep >= TUTORIAL_STEPS.length - 1) { closeTutorial(); return; }
  _tutStep++;
  _tutRender();
}

function closeTutorial() {
  try { localStorage.setItem(CONFIG.storageKeys.tutorialSeen, '1'); } catch(e) {}
  const ov = document.getElementById('tutorial-overlay');
  if (ov) ov.classList.remove('show', 'tut-has-spotlight');
  document.getElementById('tut-spotlight').removeAttribute('style');
  document.querySelector('.tut-card').removeAttribute('style');
  document.removeEventListener('keydown', _tutKey);
}

function _tutKey(e) {
  if (e.key === 'ArrowRight' || e.key === 'Enter') tutorialNext();
  if (e.key === 'Escape') closeTutorial();
}

// compat — eski game.js çağrısı için
function renderTutorialStep() { _tutRender(); }
