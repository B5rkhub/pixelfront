/* ════════════════════════════════════════════════════════════════
   SAVAŞ OVERLAY SİSTEMİ
   ─ Harita zoom'una göre değişen iki modlu badge sistemi
   ─ Tıklanınca açılan detay popup
   ─ Savaş ilanı banner
   ─ Supabase realtime sync
   ─ Kullanıcı tercihi (ayarlarda toggle)
   ════════════════════════════════════════════════════════════════ */

// ── Kullanıcı tercihi: overlay açık mı? (localStorage'dan okunur)
let _warOverlayEnabled = true;
try {
  const saved = localStorage.getItem(CONFIG.storageKeys.warOverlay);
  if (saved !== null) _warOverlayEnabled = (saved === '1');
} catch(e) {}

// ── Aktif savaş verileri (Supabase'den çekilir)
let _wars = [];           // [{ id, name, factionA, factionB, region, centerX, centerY, startedAt, playersA, playersB }]
let _warPopupOpenId = null;

// ── Zoom eşiği: bu scale değerinin üzerinde badge kaybolur
const WAR_BADGE_HIDE_SCALE = CONFIG.ui.warBadgeHideScale;

// ── Badge DOM referansları
let _warBadgeEls = {}; // warId → DOM element

/* ── Veri yapısı normalize ─────────────────────────────────── */
function _normalizeWarRow(row, factions, players) {
  const fa = factions.find(f => f.id === row.faction_a_id) || { name: 'Faction A', color: '#f04a4a', tag: 'A' };
  const fb = factions.find(f => f.id === row.faction_b_id) || { name: 'Faction B', color: '#7B61FF', tag: 'B' };

  // Oyuncuları factionlarına göre ayır, piksel sayısına göre sırala
  const sortedA = players
    .filter(p => p.war_id === row.id && p.faction_id === row.faction_a_id)
    .sort((a, b) => (b.pixel_count || 0) - (a.pixel_count || 0));
  const sortedB = players
    .filter(p => p.war_id === row.id && p.faction_id === row.faction_b_id)
    .sort((a, b) => (b.pixel_count || 0) - (a.pixel_count || 0));

  const totalA = sortedA.reduce((s, p) => s + (p.pixel_count || 0), 0);
  const totalB = sortedB.reduce((s, p) => s + (p.pixel_count || 0), 0);

  return {
    id:        row.id,
    name:      row.name || `${fa.name} vs ${fb.name}`,
    region:    row.region || '—',
    centerX:   row.center_x || 0,
    centerY:   row.center_y || 0,
    startedAt: row.started_at,
    factionA:  { ...fa, total: totalA, players: sortedA },
    factionB:  { ...fb, total: totalB, players: sortedB },
  };
}

/* ── Supabase'den savaşları yükle ─────────────────────────── */
async function loadWars() {
  if (typeof supabase === 'undefined') return;
  try {
    // Aktif savaşları çek (ended_at IS NULL)
    const { data: warRows, error: we } = await supabase
      .from('wars')
      .select('*')
      .is('ended_at', null);
    if (we) { console.warn('wars fetch:', we); return; }
    if (!warRows || warRows.length === 0) { _wars = []; renderWarBadges(); return; }

    // Faction bilgilerini çek
    const factionIds = [...new Set(warRows.flatMap(r => [r.faction_a_id, r.faction_b_id]).filter(Boolean))];
    let factions = [];
    if (factionIds.length > 0) {
      const { data: fd } = await supabase
        .from('factions')
        .select('id, name, color, tag')
        .in('id', factionIds);
      factions = fd || [];
    }

    // Oyuncu sayaçlarını çek
    const warIds = warRows.map(r => r.id);
    let players = [];
    const { data: pd } = await supabase
      .from('war_pixels')
      .select('war_id, user_id, username, faction_id, pixel_count')
      .in('war_id', warIds);
    players = pd || [];

    _wars = warRows.map(row => _normalizeWarRow(row, factions, players));
    renderWarBadges();
    if (_warPopupOpenId) _refreshWarPopup(_warPopupOpenId);
  } catch(e) {
    console.error('loadWars:', e);
  }
}

/* ── Realtime subscription ─────────────────────────────────── */
function startWarRealtimeSync() {
  if (typeof supabase === 'undefined') return;
  // Savaş değişikliklerini dinle
  supabase.channel('war-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wars' }, () => {
      loadWars();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'war_pixels' }, (payload) => {
      // war_pixels güncellemesi: sadece o savaşı güncelle
      const warId = payload.new?.war_id || payload.old?.war_id;
      if (warId) _refreshWarPixels(warId);
    })
    .subscribe();
}

async function _refreshWarPixels(warId) {
  if (typeof supabase === 'undefined') return;
  const war = _wars.find(w => w.id === warId);
  if (!war) return;

  const { data: pd } = await supabase
    .from('war_pixels')
    .select('user_id, username, faction_id, pixel_count')
    .eq('war_id', warId);
  if (!pd) return;

  const { data: fd } = await supabase
    .from('factions')
    .select('id, name, color, tag')
    .in('id', [war.factionA.id, war.factionB.id].filter(Boolean));
  const factions = fd || [];

  // İki tarafın oyuncularını yeniden hesapla
  const sortAndTotal = (fid) => {
    const arr = pd
      .filter(p => p.faction_id === fid)
      .sort((a, b) => (b.pixel_count || 0) - (a.pixel_count || 0));
    return { players: arr, total: arr.reduce((s, p) => s + (p.pixel_count || 0), 0) };
  };

  war.factionA = { ...war.factionA, ...sortAndTotal(war.factionA.id) };
  war.factionB = { ...war.factionB, ...sortAndTotal(war.factionB.id) };

  _updateBadge(war);
  if (_warPopupOpenId === warId) _refreshWarPopup(warId);
}

/* ── Badge render ──────────────────────────────────────────── */
function renderWarBadges() {
  const layer = document.getElementById('war-badges-layer');
  if (!layer) return;

  // Mevcut badge'lerin artık aktif olmayan savaşlara ait olanlarını sil
  const activeIds = new Set(_wars.map(w => w.id));
  Object.keys(_warBadgeEls).forEach(wid => {
    if (!activeIds.has(wid)) {
      _warBadgeEls[wid]?.remove();
      delete _warBadgeEls[wid];
    }
  });

  _wars.forEach(war => {
    if (!_warBadgeEls[war.id]) {
      // Yeni badge oluştur
      const el = document.createElement('div');
      el.className = 'war-badge';
      el.id = 'war-badge-' + war.id;
      el.addEventListener('click', () => openWarPopup(war.id));
      layer.appendChild(el);
      _warBadgeEls[war.id] = el;
    }
    _updateBadge(war);
  });

  positionWarBadges();
}

function _updateBadge(war) {
  const el = _warBadgeEls[war.id];
  if (!el) return;

  const totalA = war.factionA.total || 0;
  const totalB = war.factionB.total || 0;
  const total  = totalA + totalB || 1;
  const pctA   = Math.round(totalA / total * 100);
  const pctB   = 100 - pctA;
  const cntA   = war.factionA.players.length;
  const cntB   = war.factionB.players.length;

  el.innerHTML = `
    <div class="war-badge-inner">
      <div class="war-badge-header">
        <div class="war-live-dot"></div>
        <span class="war-badge-sword">⚔️</span>
        <span style="color:rgba(255,255,255,.5);font-size:.55rem;letter-spacing:.06em">SAVAŞ</span>
      </div>
      <div class="war-badge-title">
        <span style="color:${war.factionA.color || '#f04a4a'}">${_truncate(war.factionA.name, 10)}</span>
        <span class="wbt-sep">⚔</span>
        <span style="color:${war.factionB.color || '#7B61FF'}">${_truncate(war.factionB.name, 10)}</span>
      </div>
      <div class="war-badge-stats">
        <span style="color:${war.factionA.color || '#f04a4a'}">${totalA}px</span>
        <span style="opacity:.4">·</span>
        <span style="color:rgba(255,255,255,.4)">${cntA} vs ${cntB}</span>
        <span style="opacity:.4">·</span>
        <span style="color:${war.factionB.color || '#7B61FF'}">${totalB}px</span>
      </div>
      <div class="war-badge-bar-wrap">
        <div class="war-badge-bar-a" style="width:${pctA}%;background:${war.factionA.color || '#f04a4a'}"></div>
        <div class="war-badge-bar-b" style="width:${pctB}%;background:${war.factionB.color || '#7B61FF'}"></div>
      </div>
    </div>
  `;
}

/* ── Badge konumlandırma (zoom/pan ile senkron) ─────────────── */
function positionWarBadges() {
  if (!_warOverlayEnabled) {
    Object.values(_warBadgeEls).forEach(el => { if(el) el.style.opacity = '0'; el.style.pointerEvents = 'none'; });
    return;
  }

  // scale, ox, oy — haritanın kendi global değişkenleri
  const s  = (typeof scale !== 'undefined') ? scale : 1;
  const sx = (typeof ox    !== 'undefined') ? ox    : 0;
  const sy = (typeof oy    !== 'undefined') ? oy    : 0;

  // Zoom eşiği: yakında badge gizlenir
  const tooClose = s >= WAR_BADGE_HIDE_SCALE;

  _wars.forEach(war => {
    const el = _warBadgeEls[war.id];
    if (!el) return;

    // Harita koordinatından ekran koordinatına çevir
    const screenX = war.centerX * s + sx;
    const screenY = war.centerY * s + sy;

    el.style.left = screenX + 'px';
    el.style.top  = screenY + 'px';

    if (tooClose) {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    } else {
      // 1.5–3.5 arası: smooth fade
      const fadePct = Math.max(0, Math.min(1, (WAR_BADGE_HIDE_SCALE - s) / 1.5));
      el.style.opacity = fadePct.toFixed(3);
      el.style.pointerEvents = fadePct > 0.2 ? 'auto' : 'none';
    }
  });
}

/* ── draw() hook: her zoom/pan/resize sonrası badge pozisyonları güncellenir */
(function() {
  const _origDraw = window.draw;
  if (typeof _origDraw === 'function') {
    window.draw = function() {
      _origDraw.apply(this, arguments);
      positionWarBadges();
    };
  } else {
    // draw() henüz tanımlanmamışsa biraz bekle
    setTimeout(() => {
      const _d = window.draw;
      if (typeof _d === 'function') {
        window.draw = function() {
          _d.apply(this, arguments);
          positionWarBadges();
        };
      }
    }, 2000);
  }
})();

window.addEventListener('resize', positionWarBadges);

/* ── Popup aç/kapat ──────────────────────────────────────────── */
function openWarPopup(warId) {
  const war = _wars.find(w => w.id === warId);
  if (!war) return;
  _warPopupOpenId = warId;

  const pop = document.getElementById('war-popup');
  const inner = document.getElementById('war-popup-inner');
  inner.innerHTML = _buildWarPopupHTML(war);
  pop.style.display = 'flex';

  // Popup kapama (overlay tıklama)
  pop.onclick = (e) => { if (e.target === pop) closeWarPopup(); };
}

function closeWarPopup() {
  document.getElementById('war-popup').style.display = 'none';
  _warPopupOpenId = null;
}

function _refreshWarPopup(warId) {
  if (_warPopupOpenId !== warId) return;
  const war = _wars.find(w => w.id === warId);
  if (!war) { closeWarPopup(); return; }
  document.getElementById('war-popup-inner').innerHTML = _buildWarPopupHTML(war);
}

function _buildWarPopupHTML(war) {
  const totalA = war.factionA.total || 0;
  const totalB = war.factionB.total || 0;
  const total  = totalA + totalB || 1;
  const pctA   = Math.round(totalA / total * 100);
  const pctB   = 100 - pctA;

  const startedStr = war.startedAt
    ? new Date(war.startedAt).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : '—';

  const me = (typeof username !== 'undefined') ? username : '';

  const renderPlayers = (players, color) => {
    if (!players || players.length === 0) {
      return `<div class="wp-empty-list">Henüz katılımcı yok</div>`;
    }
    return players.slice(0, 15).map((p, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const rankLabel = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1)+'';
      const isMe = p.username === me;
      const topBadge = i === 0
        ? `<span class="wp-top-badge">⭐ TOP</span>`
        : '';
      return `
        <div class="wp-player-row">
          <span class="wp-player-rank ${rankClass}">${rankLabel}</span>
          <span class="wp-player-name${isMe ? ' is-me' : ''}">${_esc(p.username || 'Bilinmiyor')}</span>
          ${topBadge}
          <span class="wp-player-pix" style="color:${color}">${p.pixel_count || 0}px</span>
        </div>
      `;
    }).join('');
  };

  return `
    <button class="wp-close" onclick="closeWarPopup()" title="Kapat">✕</button>

    <div class="wp-header">
      <div class="wp-icon">⚔️</div>
      <div class="wp-header-text">
        <div class="wp-war-name">${_esc(war.name)}</div>
        <div class="wp-war-meta">
          📍 ${_esc(war.region)} &nbsp;·&nbsp;
          <span>🕐 ${startedStr}</span>
        </div>
      </div>
    </div>

    <div class="wp-progress-section">
      <div class="wp-progress-labels">
        <div class="wp-faction-label">
          <span class="wp-faction-color-name" style="color:${war.factionA.color || '#f04a4a'}">${_esc(war.factionA.name)}</span>
          <span class="wp-faction-pix">${totalA} piksel · ${war.factionA.players.length} oyuncu</span>
        </div>
        <div class="wp-vs-center">VS</div>
        <div class="wp-faction-label right">
          <span class="wp-faction-color-name" style="color:${war.factionB.color || '#7B61FF'}">${_esc(war.factionB.name)}</span>
          <span class="wp-faction-pix">${totalB} piksel · ${war.factionB.players.length} oyuncu</span>
        </div>
      </div>
      <div class="wp-progress-bar-wrap">
        <div class="wp-bar-a" style="width:${pctA}%;background:${war.factionA.color || '#f04a4a'}"></div>
        <div class="wp-bar-b" style="width:${pctB}%;background:${war.factionB.color || '#7B61FF'}"></div>
      </div>
    </div>

    <div class="wp-players-grid">
      <div>
        <div class="wp-player-col-title" style="color:${war.factionA.color || '#f04a4a'}">${_esc(war.factionA.name)} — ${pctA}%</div>
        ${renderPlayers(war.factionA.players, war.factionA.color || '#f04a4a')}
      </div>
      <div>
        <div class="wp-player-col-title" style="color:${war.factionB.color || '#7B61FF'}">${_esc(war.factionB.name)} — ${pctB}%</div>
        ${renderPlayers(war.factionB.players, war.factionB.color || '#7B61FF')}
      </div>
    </div>
  `;
}

/* ── Savaş ilanı banner (savaş başlayınca) ──────────────────── */
function showWarDeclaration(war) {
  if (!war) return;
  document.getElementById('wdb-faction-a').textContent = war.factionA?.name || '—';
  document.getElementById('wdb-faction-b').textContent = war.factionB?.name || '—';
  document.getElementById('wdb-region').textContent    = '📍 ' + (war.region || '—');

  document.getElementById('wdb-faction-a').style.color = war.factionA?.color || '#f04a4a';
  document.getElementById('wdb-faction-b').style.color = war.factionB?.color || '#7B61FF';

  document.getElementById('war-declaration-banner').style.display = 'flex';

  // Ses + sarsıntı + kıvılcımlar
  try {
    const snd = document.getElementById('war-declare-sound');
    if(snd){ snd.currentTime = 0; snd.volume = 0.85; snd.play().catch(()=>{}); }
  } catch(e){}
  document.body.classList.add('war-shake');
  setTimeout(() => document.body.classList.remove('war-shake'), 520);
  if (typeof spawnWarSparks === 'function') {
    spawnWarSparks(18);
    setTimeout(() => spawnWarSparks(14), 400);
    setTimeout(() => spawnWarSparks(12), 900);
  }
}

function closeWarDeclaration() {
  document.getElementById('war-declaration-banner').style.display = 'none';
}

/* ── Realtime'da yeni savaş gelince banner göster ─────────────
   (startWarRealtimeSync içinde zaten wars değişikliği dinleniyor;
    burada yeni INSERT'leri ayırt edip banner açıyoruz) */
function _handleNewWarInsert(row) {
  // Zaten bilinen bir savaş mı?
  if (_wars.find(w => w.id === row.id)) return;
  // Yeni savaş → veriyi yükle → bildirim göster
  loadWars().then(() => {
    const war = _wars.find(w => w.id === row.id);
    if (!war) return;

    // Kullanıcının faction'ı savaşa dahil mi?
    const myTag = (typeof factionData !== 'undefined' && factionData) ? factionData.tag : null;
    const aTag = war.factionA && war.factionA.tag ? war.factionA.tag : '';
    const bTag = war.factionB && war.factionB.tag ? war.factionB.tag : '';
    const isInvolved = myTag && (myTag === aTag || myTag === bTag);

    if (isInvolved) {
      // Tam banner göster
      showWarDeclaration(war);
    } else {
      // Küçük toast
      if (typeof showWarToast === 'function') {
        // Savaş sesi (düşük volume)
        try {
          const snd = document.getElementById('war-declare-sound');
          if(snd){ snd.currentTime = 0; snd.volume = 0.45; snd.play().catch(()=>{}); }
        } catch(e){}
        showWarToast(
          war.factionA && war.factionA.name ? war.factionA.name : 'A',
          war.factionA && war.factionA.color ? war.factionA.color : '#f04a4a',
          war.factionB && war.factionB.name ? war.factionB.name : 'B',
          war.factionB && war.factionB.color ? war.factionB.color : '#7B61FF'
        );
      }
    }
  });
}

/* Realtime override: INSERT event'lerini yakala */
(function() {
  const _origStart = window.startWarRealtimeSync || startWarRealtimeSync;
  window.startWarRealtimeSync = function() {
    if (typeof supabase === 'undefined') return;
    supabase.channel('war-changes-v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wars' }, (payload) => {
        _handleNewWarInsert(payload.new);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wars' }, () => {
        loadWars();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'wars' }, () => {
        loadWars();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'war_pixels' }, (payload) => {
        const warId = payload.new?.war_id || payload.old?.war_id;
        if (warId) _refreshWarPixels(warId);
      })
      .subscribe();
  };
})();

/* ── Kullanıcı tercihi: overlay toggle ──────────────────────── */
function setWarOverlay(enabled) {
  _warOverlayEnabled = enabled;
  try { localStorage.setItem(CONFIG.storageKeys.warOverlay, enabled ? '1' : '0'); } catch(e) {}
  positionWarBadges();
  if (!enabled) {
    Object.values(_warBadgeEls).forEach(el => {
      if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
    });
  }
}

/* ── Profil ayarları paneline toggle ekleme ─────────────────── */
// Mevcut renderProfileSettings() fonksiyonu ya da switchProfileTab() hook'lanarak
// "Savaş Overlay" toggleı ayarlar paneline inject edilir.
(function() {
  const _origSwitch = window.switchProfileTab;
  if (typeof _origSwitch === 'function') {
    window.switchProfileTab = function(tab) {
      _origSwitch.apply(this, arguments);
      if (tab === 'ayarlar') {
        // Mevcut "Görünüm" section'ına war toggle'ı ekle (henüz yoksa)
        setTimeout(() => _injectWarOverlayToggle(), 80);
      }
    };
  }
})();

function _injectWarOverlayToggle() {
  if (document.getElementById('war-overlay-toggle-row')) return; // Zaten var

  // "Görünüm" başlığını bul ve altına ekle
  const panels = document.querySelectorAll('.pca-section-title');
  let targetSection = null;
  panels.forEach(el => {
    if (el.textContent.includes('Görünüm') || el.textContent.includes('Appearance')) {
      targetSection = el.parentElement;
    }
  });

  if (!targetSection) return; // Panel henüz yok

  const row = document.createElement('div');
  row.id = 'war-overlay-toggle-row';
  row.className = 'pca-row';
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:.75rem;min-height:40px;';
  row.innerHTML = `
    <div>
      <div class="pca-row-title">Savaş Overlay</div>
      <div class="pca-row-desc">Haritada aktif savaş badge'lerini göster</div>
    </div>
    <label class="pca-toggle">
      <input type="checkbox" id="war-overlay-cb" onchange="setWarOverlay(this.checked)" ${_warOverlayEnabled ? 'checked' : ''}>
      <span class="pca-toggle-slider"></span>
    </label>
  `;
  targetSection.appendChild(row);
}

/* ── Yardımcı fonksiyonlar ──────────────────────────────────── */
function _truncate(str, n) {
  if (!str) return '';
  return str.length <= n ? str : str.slice(0, n-1) + '…';
}

function _esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Init: kullanıcı giriş yapınca başlat ─────────────────── */
(function() {
  const _origActivate = window._activateUser;
  if (typeof _origActivate === 'function') {
    window._activateUser = function(v) {
      _origActivate.apply(this, arguments);
      // Kısa bir gecikme ile: supabase bağlantısı oturumu açsın
      setTimeout(() => {
        loadWars();
        startWarRealtimeSync();
      }, 600);
    };
  } else {
    // _activateUser henüz tanımlanmamışsa sayfa yüklendikten sonra dene
    window.addEventListener('load', () => {
      const _orig2 = window._activateUser;
      if (typeof _orig2 === 'function') {
        window._activateUser = function(v) {
          _orig2.apply(this, arguments);
          setTimeout(() => {
            loadWars();
            startWarRealtimeSync();
          }, 600);
        };
      }
    });
  }
})();

/* ── Admin: savaş başlatma fonksiyonu (opsiyonel, admin panelinden çağrılır) ──
   Kullanım: await declareWar('faction-uuid-a', 'faction-uuid-b', 'Ankara', 512, 400);
   center_x, center_y: haritadaki IMG koordinatları (ox/oy/scale bağımsız) */
window.declareWar = async function(factionAId, factionBId, region, centerX, centerY, warName) {
  if (typeof supabase === 'undefined') { console.error('Supabase yok'); return null; }
  const { data, error } = await supabase.from('wars').insert({
    faction_a_id: factionAId,
    faction_b_id: factionBId,
    region: region || '',
    center_x: centerX || 0,
    center_y: centerY || 0,
    name: warName || null,
    started_at: new Date().toISOString(),
  }).select().single();
  if (error) { console.error('declareWar error:', error); return null; }
  return data;
};

/* ── Admin: savaşı bitir ── */
window.endWar = async function(warId, winner) {
  if (typeof supabase === 'undefined') return;
  await supabase.from('wars').update({
    ended_at: new Date().toISOString(),
    winner: winner || null,
  }).eq('id', warId);
};

console.log('⚔️ War Overlay System loaded');

