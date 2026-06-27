/* ════════════════════════════════════════════════════════════════
   ⚔️ SAVAŞ BÖLGESİ SİSTEMİ
   ─ Admin: aktif savaşlar listesi → "Savaş Bölgesi Belirle" butonu
   ─ Bölge belirleme: harita üzerinde sürükle-bırak seçim
   ─ Broadcast: tüm oyunculara borozoanlı şerit + tıklayınca bölgeye git
   ════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     1. ADMIN PANELİ ENTEGRASYONU
     Admin paneli render edilince "Savaş Bölgesi" kartı inject et
  ══════════════════════════════════════════════════════════════ */

  /* Admin panelinin render edildiğini anlamak için:
     openAdminPanel / renderAdminPanel / switchAdminTab gibi fonksiyonlar
     var olabilir — hepsini hook'la, en geç MutationObserver ile yakala */

  function _injectWarZoneAdminCard() {
    if (document.getElementById('wz-admin-card')) return; // zaten var

    /* "Savaş" başlıklı section'ı ya da genel admin içeriği bul */
    const adminContent = document.getElementById('admin-content')
      || document.getElementById('admin-panel-inner')
      || document.getElementById('owner-panel-inner')
      || document.querySelector('.admin-section, .ap-section');
    if (!adminContent) return;

    const card = document.createElement('div');
    card.id = 'wz-admin-card';
    card.className = 'ap-card'; /* mevcut admin panel kart stili */
    card.style.cssText = `
      background: rgba(240,74,74,.08);
      border: 1.5px solid rgba(240,74,74,.28);
      border-radius: 12px;
      padding: 14px 16px 16px;
      margin-bottom: 14px;
    `;
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:1.2rem">⚔️</span>
        <span style="font-weight:700;font-size:.9rem;color:#f04a4a;letter-spacing:.03em">SAVAŞ BÖLGESİ YÖNETİMİ</span>
      </div>
      <div style="font-size:.75rem;color:rgba(255,255,255,.5);margin-bottom:12px;line-height:1.5">
        Aktif bir savaş seçip harita üzerinde savaş bölgesi çizin.<br>
        Tüm oyunculara borozoanlı bildirim gönderilir ve o bölgeye ışınlanabilirler.
      </div>
      <div id="wz-war-list" style="margin-bottom:12px;">
        <div style="color:rgba(255,255,255,.4);font-size:.75rem">Aktif savaşlar yükleniyor…</div>
      </div>
      <button id="wz-pick-btn" onclick="wzStartZonePick()"
        style="display:none;width:100%;padding:9px 0;border:none;border-radius:8px;
               background:linear-gradient(135deg,#f04a4a,#f97316);color:#fff;
               font-weight:700;font-size:.82rem;cursor:pointer;letter-spacing:.04em;
               box-shadow:0 0 14px rgba(240,74,74,.35);">
        🗺️ Savaş Bölgesini Haritada Çiz
      </button>
      <div id="wz-status" style="font-size:.72rem;color:rgba(255,255,255,.4);margin-top:8px;min-height:16px;"></div>
    `;
    adminContent.prepend(card);

    /* Savaş listesini yükle */
    _refreshWzWarList();
  }

  /* Aktif savaşları listele */
  async function _refreshWzWarList() {
    const listEl = document.getElementById('wz-war-list');
    if (!listEl) return;

    /* _wars global dizisini kullan (war_overlay.js'den) */
    const wars = (typeof _wars !== 'undefined' && Array.isArray(_wars)) ? _wars : [];
    if (wars.length === 0) {
      listEl.innerHTML = `<div style="color:rgba(255,255,255,.35);font-size:.75rem">Şu an aktif savaş yok.</div>`;
      const btn = document.getElementById('wz-pick-btn');
      if (btn) btn.style.display = 'none';
      window._wzSelectedWarId = null;
      return;
    }

    listEl.innerHTML = wars.map(w => `
      <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;
                    border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,.08);
                    margin-bottom:6px;background:rgba(255,255,255,.04);">
        <input type="radio" name="wz-war-radio" value="${w.id}"
               onchange="wzSelectWar('${w.id}')"
               style="accent-color:#f04a4a;">
        <span style="font-size:.82rem;flex:1">
          <span style="color:${w.factionA?.color||'#f04a4a'}">${_wzEsc(w.factionA?.name||'A')}</span>
          <span style="color:rgba(255,255,255,.4)"> ⚔ </span>
          <span style="color:${w.factionB?.color||'#7B61FF'}">${_wzEsc(w.factionB?.name||'B')}</span>
        </span>
        <span style="font-size:.68rem;color:rgba(255,255,255,.35)">${_wzEsc(w.region||'')}</span>
      </label>
    `).join('');

    /* Önceki seçim hâlâ geçerliyse işaretle */
    if (window._wzSelectedWarId) {
      const radio = listEl.querySelector(`input[value="${window._wzSelectedWarId}"]`);
      if (radio) { radio.checked = true; }
      else { window._wzSelectedWarId = null; }
    }
    const btn = document.getElementById('wz-pick-btn');
    if (btn) btn.style.display = window._wzSelectedWarId ? 'block' : 'none';
  }

  window.wzSelectWar = function (warId) {
    window._wzSelectedWarId = warId;
    const btn = document.getElementById('wz-pick-btn');
    if (btn) btn.style.display = 'block';
    const st = document.getElementById('wz-status');
    if (st) st.textContent = 'Savaşı seçtiniz. Şimdi haritada bölge çizebilirsiniz.';
  };

  /* loadWars her çağrıldığında listeyi de güncelle */
  (function () {
    const _origLoad = window.loadWars;
    if (typeof _origLoad === 'function') {
      window.loadWars = async function () {
        const res = await _origLoad.apply(this, arguments);
        _refreshWzWarList();
        return res;
      };
    }
  })();

  /* Admin panel hook'ları */
  ['openAdminPanel', 'renderAdminPanel', 'switchAdminTab', 'openOwnerPanel'].forEach(fn => {
    const _orig = window[fn];
    if (typeof _orig === 'function') {
      window[fn] = function () {
        const r = _orig.apply(this, arguments);
        setTimeout(_injectWarZoneAdminCard, 120);
        return r;
      };
    }
  });

  /* MutationObserver yedek: admin paneli render edilirse yakala */
  const _adminObs = new MutationObserver(() => {
    const panel = document.getElementById('admin-content')
      || document.getElementById('admin-panel-inner')
      || document.getElementById('owner-panel-inner');
    if (panel && panel.offsetParent !== null) {
      _injectWarZoneAdminCard();
    }
  });
  _adminObs.observe(document.body, { childList: true, subtree: true });

  /* ══════════════════════════════════════════════════════════════
     2. HARİTA ÜZERİNDE BÖLGE SEÇİM OVERLAY'İ
  ══════════════════════════════════════════════════════════════ */

  /* Overlay HTML'ini sayfa yüklenince ekle */
  function _injectWzOverlayHTML() {
    if (document.getElementById('wz-pick-overlay')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <!-- Savaş bölgesi seçim overlay -->
      <div id="wz-pick-overlay" style="
        display:none;position:fixed;inset:0;z-index:9400;
        background:rgba(0,0,0,.55);cursor:crosshair;">

        <div id="wz-pick-rect" style="
          position:fixed;border:2.5px dashed #f04a4a;
          border-radius:4px;background:rgba(240,74,74,.12);
          pointer-events:none;display:none;box-shadow:0 0 0 1px rgba(240,74,74,.3);"></div>

        <div id="wz-pick-hud" style="
          position:fixed;top:18px;left:50%;transform:translateX(-50%);
          background:#1a0a0a;border:1.5px solid rgba(240,74,74,.45);
          border-radius:10px;padding:10px 20px;
          color:#fff;font-size:.8rem;font-weight:600;
          display:flex;align-items:center;gap:12px;
          box-shadow:0 4px 24px rgba(0,0,0,.6),0 0 20px rgba(240,74,74,.2);
          pointer-events:none;z-index:9401;">
          <span style="font-size:1.1rem">⚔️</span>
          <span>Savaş bölgesini <b>sürükleyerek</b> çizin</span>
          <span id="wz-pick-dim" style="color:#f97316;font-size:.72rem"></span>
          <span style="color:rgba(255,255,255,.4);font-size:.7rem">ESC = iptal</span>
        </div>

        <div id="wz-pick-actions" style="
          position:fixed;display:none;
          background:#1a0a0a;border:1.5px solid rgba(240,74,74,.5);
          border-radius:10px;padding:8px 12px;
          gap:8px;align-items:center;
          box-shadow:0 4px 20px rgba(0,0,0,.7);z-index:9402;">
          <button onclick="wzConfirmZone()" style="
            padding:7px 16px;border:none;border-radius:7px;
            background:linear-gradient(135deg,#f04a4a,#f97316);
            color:#fff;font-weight:700;font-size:.78rem;cursor:pointer;">
            ✓ Bölgeyi Yayınla
          </button>
          <button onclick="wzResetZone()" style="
            padding:7px 12px;border:1px solid rgba(255,255,255,.15);
            border-radius:7px;background:transparent;
            color:rgba(255,255,255,.6);font-size:.75rem;cursor:pointer;">
            ↺ Yeniden Çiz
          </button>
          <button onclick="wzCancelZonePick()" style="
            padding:7px 12px;border:1px solid rgba(255,255,255,.1);
            border-radius:7px;background:transparent;
            color:rgba(255,255,255,.4);font-size:.75rem;cursor:pointer;">
            ✕ Vazgeç
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(div.firstElementChild);
  }

  /* Seçim durumu */
  let _wz = {
    dragging: false, hasSel: false,
    sx: 0, sy: 0, ex: 0, ey: 0,
    panning: false, panLast: { x: 0, y: 0 }
  };

  function _wzC2I(cx, cy) {
    if (typeof canvas === 'undefined' || !canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    const s = (typeof scale !== 'undefined') ? scale : 1;
    const _ox = (typeof ox !== 'undefined') ? ox : 0;
    const _oy = (typeof oy !== 'undefined') ? oy : 0;
    const IW = (typeof IMG_W !== 'undefined') ? IMG_W : 9999;
    const IH = (typeof IMG_H !== 'undefined') ? IMG_H : 9999;
    return {
      x: Math.max(0, Math.min(IW - 1, Math.floor(((cx - r.left) * dpr - _ox) / s))),
      y: Math.max(0, Math.min(IH - 1, Math.floor(((cy - r.top)  * dpr - _oy) / s)))
    };
  }

  function _wzDrawRect() {
    const rect = document.getElementById('wz-pick-rect');
    const act  = document.getElementById('wz-pick-actions');
    const dim  = document.getElementById('wz-pick-dim');
    if (!rect || !canvas) return;

    const x0 = Math.min(_wz.sx, _wz.ex), y0 = Math.min(_wz.sy, _wz.ey);
    const x1 = Math.max(_wz.sx, _wz.ex), y1 = Math.max(_wz.sy, _wz.ey);
    const r  = canvas.getBoundingClientRect();
    const s  = (typeof scale !== 'undefined') ? scale : 1;
    const dpr = canvas.width / r.width;
    const _ox = (typeof ox !== 'undefined') ? ox : 0;
    const _oy = (typeof oy !== 'undefined') ? oy : 0;

    const sl = r.left + (_ox + x0 * s) / dpr;
    const st = r.top  + (_oy + y0 * s) / dpr;
    const sw = (x1 - x0) * s / dpr;
    const sh = (y1 - y0) * s / dpr;

    rect.style.left   = sl + 'px';
    rect.style.top    = st + 'px';
    rect.style.width  = sw + 'px';
    rect.style.height = sh + 'px';
    rect.style.display = (sw > 3 && sh > 3) ? 'block' : 'none';

    if (dim) dim.textContent = (x1 - x0) + '×' + (y1 - y0) + ' px';

    /* Aksiyon butonlarını seçimin altına sabitle */
    if (act) {
      if (sw > 30 && sh > 30) {
        act.style.display = 'flex';
        act.style.left = Math.min(sl, window.innerWidth - 320) + 'px';
        act.style.top  = Math.min(st + sh + 8, window.innerHeight - 60) + 'px';
      } else {
        act.style.display = 'none';
      }
    }
  }

  function _wzReset() {
    _wz.hasSel = false;
    const rect = document.getElementById('wz-pick-rect');
    if (rect) rect.style.display = 'none';
    const act = document.getElementById('wz-pick-actions');
    if (act) act.style.display = 'none';
  }

  /* Pointer olayları */
  function _wzPD(e) {
    if (e.target.closest('#wz-pick-actions') || e.target.closest('#wz-pick-hud')) return;
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      _wz.panning = true;
      _wz.panLast = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    _wz.dragging = true; _wz.hasSel = false;
    const p = _wzC2I(e.clientX, e.clientY);
    _wz.sx = _wz.ex = p.x; _wz.sy = _wz.ey = p.y;
    _wzReset();
  }
  function _wzPM(e) {
    if (_wz.panning) {
      if (typeof canvas === 'undefined') return;
      const dpr = canvas.width / canvas.getBoundingClientRect().width;
      if (typeof ox !== 'undefined') { ox += (e.clientX - _wz.panLast.x) * dpr; oy += (e.clientY - _wz.panLast.y) * dpr; }
      _wz.panLast = { x: e.clientX, y: e.clientY };
      if (typeof draw === 'function') draw();
      if (_wz.hasSel) _wzDrawRect();
      return;
    }
    if (!_wz.dragging) return;
    e.preventDefault();
    const p = _wzC2I(e.clientX, e.clientY);
    _wz.ex = p.x; _wz.ey = p.y;
    _wzDrawRect();
  }
  function _wzPU(e) {
    if (_wz.panning) { _wz.panning = false; return; }
    if (!_wz.dragging) return;
    _wz.dragging = false;
    const p = _wzC2I(e.clientX, e.clientY);
    _wz.ex = p.x; _wz.ey = p.y;
    const rw = Math.abs(_wz.ex - _wz.sx), rh = Math.abs(_wz.ey - _wz.sy);
    if (rw > 4 && rh > 4) { _wz.hasSel = true; _wzDrawRect(); }
    else { _wzReset(); }
  }
  function _wzWheel(e) {
    e.preventDefault();
    if (typeof scale === 'undefined' || !canvas) return;
    const r = canvas.getBoundingClientRect(), dpr = canvas.width / r.width;
    const mx = (e.clientX - r.left) * dpr, my = (e.clientY - r.top) * dpr;
    const ns = Math.max(0.3, Math.min(40, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    ox = mx - (mx - ox) * (ns / scale); oy = my - (my - oy) * (ns / scale); scale = ns;
    if (typeof draw === 'function') draw();
    if (_wz.hasSel) _wzDrawRect();
  }
  function _wzKey(e) { if (e.key === 'Escape') wzCancelZonePick(); }

  function _wzAddListeners() {
    const ov = document.getElementById('wz-pick-overlay');
    if (!ov) return;
    ov.addEventListener('pointerdown',   _wzPD);
    ov.addEventListener('pointermove',   _wzPM);
    ov.addEventListener('pointerup',     _wzPU);
    ov.addEventListener('pointercancel', _wzPU);
    ov.addEventListener('wheel',         _wzWheel, { passive: false });
    ov.addEventListener('contextmenu',   e => e.preventDefault());
    document.addEventListener('keydown', _wzKey);
  }
  function _wzRemoveListeners() {
    const ov = document.getElementById('wz-pick-overlay');
    if (!ov) return;
    ov.removeEventListener('pointerdown',   _wzPD);
    ov.removeEventListener('pointermove',   _wzPM);
    ov.removeEventListener('pointerup',     _wzPU);
    ov.removeEventListener('pointercancel', _wzPU);
    ov.removeEventListener('wheel',         _wzWheel);
    document.removeEventListener('keydown', _wzKey);
  }

  /* Public: Admin "Savaş Bölgesini Haritada Çiz" butonuna basınca */
  window.wzStartZonePick = function () {
    if (!window._wzSelectedWarId) {
      if (typeof showPopup === 'function') showPopup('Önce bir savaş seçin.');
      return;
    }
    _injectWzOverlayHTML();
    _wzReset();
    const ov = document.getElementById('wz-pick-overlay');
    if (ov) ov.style.display = 'block';
    _wzAddListeners();

    /* Admin panelini kapat, haritayı göster */
    ['closeAdminPanel', 'closeOwnerPanel', 'closeTbDesktopMenu', 'closeTbMenu'].forEach(fn => {
      if (typeof window[fn] === 'function') window[fn]();
    });
  };

  window.wzResetZone   = function () { _wzReset(); };
  window.wzCancelZonePick = function () {
    _wzRemoveListeners();
    _wzReset();
    const ov = document.getElementById('wz-pick-overlay');
    if (ov) ov.style.display = 'none';
    _wz.dragging = false; _wz.panning = false;
  };

  /* Bölgeyi onayla → broadcast */
  window.wzConfirmZone = async function () {
    if (!_wz.hasSel) return;
    const x0 = Math.min(_wz.sx, _wz.ex), y0 = Math.min(_wz.sy, _wz.ey);
    const x1 = Math.max(_wz.sx, _wz.ex), y1 = Math.max(_wz.sy, _wz.ey);
    const region = {
      x: x0, y: y0,
      w: Math.max(4, x1 - x0),
      h: Math.max(4, y1 - y0),
      cx: Math.round((x0 + x1) / 2),
      cy: Math.round((y0 + y1) / 2)
    };

    wzCancelZonePick();

    const warId = window._wzSelectedWarId;
    const war   = (typeof _wars !== 'undefined') ? _wars.find(w => w.id === warId) : null;

    /* Supabase'de savaşın center_x/center_y'sini güncelle */
    if (typeof supabase !== 'undefined' && warId) {
      try {
        await supabase.from('wars').update({
          center_x: region.cx,
          center_y: region.cy,
          region: war ? war.region : ''
        }).eq('id', warId);
      } catch (e) { console.warn('wars güncelleme:', e); }
    }

    /* Broadcast */
    broadcastWarZone({ war, region });

    /* Kendi ekranında da göster */
    showWarZoneBanner({ war, region });

    const st = document.getElementById('wz-status');
    if (st) st.textContent = '✓ Savaş bölgesi tüm oyunculara yayınlandı!';
  };

  /* ══════════════════════════════════════════════════════════════
     3. BROADCAST — Supabase channel
  ══════════════════════════════════════════════════════════════ */

  let _wzChannel = null;

  function _getWzChannel() {
    if (_wzChannel) return _wzChannel;
    if (typeof supabase === 'undefined') return null;
    _wzChannel = supabase.channel('war-zone-broadcast', {
      config: { broadcast: { self: false } }
    });
    _wzChannel.on('broadcast', { event: 'war-zone' }, payload => {
      const p = payload && payload.payload;
      if (!p) return;
      showWarZoneBanner(p);
    });
    _wzChannel.subscribe();
    return _wzChannel;
  }
  /* Dinlemeye hemen başla */
  setTimeout(() => _getWzChannel(), 1200);

  function broadcastWarZone(data) {
    try {
      const ch = _getWzChannel();
      if (!ch) return;
      ch.send({
        type: 'broadcast',
        event: 'war-zone',
        payload: data
      });
    } catch (e) { console.warn('broadcastWarZone:', e); }
  }

  /* ══════════════════════════════════════════════════════════════
     4. ŞERIT BİLDİRİM (WAR ZONE BANNER)
     Ekranın üstünden kayarak giren, tıklayınca bölgeye götüren şerit
  ══════════════════════════════════════════════════════════════ */

  function _injectWzBannerHTML() {
    if (document.getElementById('wz-banner')) return;
    const el = document.createElement('div');
    el.innerHTML = `
      <div id="wz-banner" onclick="wzJumpToZone()" style="
        position: fixed;
        top: -90px;
        left: 0; right: 0;
        z-index: 9500;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        padding: 0 24px;
        height: 62px;
        background: linear-gradient(90deg,
          rgba(30,5,5,.97) 0%,
          rgba(120,10,10,.97) 18%,
          rgba(200,30,30,.97) 45%,
          rgba(120,10,10,.97) 72%,
          rgba(30,5,5,.97) 100%);
        border-bottom: 2px solid rgba(240,74,74,.7);
        box-shadow: 0 4px 32px rgba(240,74,74,.45), 0 0 60px rgba(240,74,74,.15);
        cursor: pointer;
        transition: top .48s cubic-bezier(.22,1,.36,1);
        overflow: hidden;
        user-select: none;
      ">
        <!-- Tarama çizgileri efekti -->
        <div style="position:absolute;inset:0;background:repeating-linear-gradient(
          90deg,transparent,transparent 3px,rgba(255,255,255,.02) 3px,rgba(255,255,255,.02) 6px);
          pointer-events:none;"></div>

        <!-- Sol kıvılcım grubu -->
        <div id="wz-banner-sparks-l" style="position:absolute;left:16px;top:50%;transform:translateY(-50%);
          font-size:1.3rem;letter-spacing:-2px;pointer-events:none;animation:wzBannerSpark 1.2s infinite;">
          ⚡⚔️⚡
        </div>

        <!-- Merkez içerik -->
        <div style="display:flex;align-items:center;gap:12px;position:relative;z-index:1;">
          <span style="font-size:1.35rem;animation:wzSword 0.7s ease-in-out infinite alternate;">⚔️</span>
          <div style="text-align:center;">
            <div id="wz-banner-title" style="
              font-size:.95rem;font-weight:800;
              color:#fff;letter-spacing:.08em;
              text-shadow:0 0 14px rgba(240,74,74,.9),0 0 4px rgba(255,200,0,.4);
              animation:wzGlow 1.4s ease-in-out infinite alternate;">
              ⚔️ SAVAŞ BAŞLADI! ⚔️
            </div>
            <div id="wz-banner-sub" style="
              font-size:.7rem;font-weight:600;
              color:rgba(255,220,180,.85);letter-spacing:.04em;margin-top:2px;">
              Tıkla → Savaş bölgesine git
            </div>
          </div>
          <span style="font-size:1.35rem;animation:wzSword 0.7s ease-in-out infinite alternate-reverse;">⚔️</span>
        </div>

        <!-- Sağ kıvılcım grubu -->
        <div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);
          font-size:1.3rem;letter-spacing:-2px;pointer-events:none;animation:wzBannerSpark 1.2s infinite .6s;">
          ⚡⚔️⚡
        </div>

        <!-- Kapatma butonu -->
        <button onclick="event.stopPropagation();wzCloseBanner()" style="
          position:absolute;right:10px;top:6px;
          background:none;border:none;color:rgba(255,255,255,.4);
          font-size:.75rem;cursor:pointer;padding:2px 5px;
          border-radius:4px;line-height:1;">✕</button>
      </div>

      <style>
        @keyframes wzGlow {
          from { text-shadow: 0 0 10px rgba(240,74,74,.7), 0 0 3px rgba(255,200,0,.3); }
          to   { text-shadow: 0 0 22px rgba(255,120,60,1), 0 0 8px rgba(255,220,80,.6); }
        }
        @keyframes wzSword {
          from { transform: rotate(-15deg) scale(1); }
          to   { transform: rotate(15deg) scale(1.15); }
        }
        @keyframes wzBannerSpark {
          0%,100% { opacity:.6; transform:translateY(-50%) scale(.9); }
          50%      { opacity:1; transform:translateY(-56%) scale(1.1); }
        }
      </style>
    `;
    document.body.appendChild(el.firstElementChild);
    document.body.appendChild(el.querySelector('style'));
  }

  /* Aktif banner verisi (göz atma için sakla) */
  window._wzActiveBanner = null;
  let _wzBannerTimer = null;

  window.showWarZoneBanner = function (data) {
    _injectWzBannerHTML();
    window._wzActiveBanner = data;

    /* Metin güncelle */
    const war    = data.war;
    const region = data.region;
    const title  = document.getElementById('wz-banner-title');
    const sub    = document.getElementById('wz-banner-sub');
    if (title && war) {
      const nameA = war.factionA?.name || 'A';
      const nameB = war.factionB?.name || 'B';
      const colorA = war.factionA?.color || '#f04a4a';
      const colorB = war.factionB?.color || '#7B61FF';
      title.innerHTML =
        `⚔️ <span style="color:${colorA}">${_wzEsc(nameA)}</span>` +
        ` <span style="color:rgba(255,255,255,.5)">VS</span>` +
        ` <span style="color:${colorB}">${_wzEsc(nameB)}</span> ⚔️`;
    }
    if (sub) {
      sub.textContent = region
        ? `SAVAŞ BÖLGESİ: (${region.cx}, ${region.cy}) — Tıkla → Bölgeye ışınlan!`
        : 'Tıkla → Savaş bölgesine git';
    }

    /* Borozanı çal */
    if (typeof SFX !== 'undefined' && typeof SFX.war === 'function') {
      SFX.war();
    }

    /* Ekran sarsıntısı */
    document.body.classList.add('war-shake');
    setTimeout(() => document.body.classList.remove('war-shake'), 600);

    /* Kıvılcımlar */
    if (typeof spawnWarSparks === 'function') {
      spawnWarSparks(22);
      setTimeout(() => spawnWarSparks(16), 500);
      setTimeout(() => spawnWarSparks(14), 1100);
    }

    /* Şeridi aşağı indir */
    const banner = document.getElementById('wz-banner');
    if (banner) {
      banner.style.top = '0px';
    }

    /* 12 saniye sonra otomatik kaldır */
    if (_wzBannerTimer) clearTimeout(_wzBannerTimer);
    _wzBannerTimer = setTimeout(() => wzCloseBanner(), 12000);
  };

  window.wzCloseBanner = function () {
    const banner = document.getElementById('wz-banner');
    if (banner) banner.style.top = '-90px';
    if (_wzBannerTimer) { clearTimeout(_wzBannerTimer); _wzBannerTimer = null; }
  };

  /* ══════════════════════════════════════════════════════════════
     5. BÖLGEYE IŞINLAN — tıklayınca haritayı bölgeye zoom'la
  ══════════════════════════════════════════════════════════════ */

  window.wzJumpToZone = function () {
    wzCloseBanner();
    const data = window._wzActiveBanner;
    if (!data) return;

    const region = data.region;
    if (!region || typeof canvas === 'undefined' || !canvas) return;

    const r   = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;

    /* Bölgeyi ekrana sığdıracak scale hesapla (hafif padding ile) */
    const padFactor = 0.75;
    const targetScale = Math.min(
      (canvas.width  * padFactor) / Math.max(region.w, 1),
      (canvas.height * padFactor) / Math.max(region.h, 1),
      20  /* max zoom */
    );

    /* Merkezi ekrana ortala */
    scale = targetScale;
    ox = canvas.width  / 2 - region.cx * scale;
    oy = canvas.height / 2 - region.cy * scale;

    if (typeof draw === 'function') draw();

    /* Kısa titreşim efekti "ışınlandın" hissi */
    if (typeof canvas !== 'undefined' && canvas) {
      canvas.style.transition = 'filter .15s';
      canvas.style.filter = 'brightness(1.5) saturate(1.5)';
      setTimeout(() => { canvas.style.filter = ''; }, 200);
    }

    /* Savaş badge'leri varsa yenile */
    if (typeof positionWarBadges === 'function') positionWarBadges();
  };

  /* ══════════════════════════════════════════════════════════════
     6. YARDIMCI
  ══════════════════════════════════════════════════════════════ */

  function _wzEsc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* draw() hook: zoom/pan sonrası aktif seçim kutusunu güncelle */
  (function () {
    const _od = window.draw;
    if (typeof _od === 'function') {
      window.draw = function () {
        _od.apply(this, arguments);
        if (_wz.hasSel) _wzDrawRect();
      };
    }
  })();

  console.log('⚔️ War Zone System loaded');

})();
