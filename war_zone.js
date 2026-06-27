/* ════════════════════════════════════════════════════════════════
   ⚔️ SAVAŞ BÖLGESİ SİSTEMİ v3
   ─ #paint-toolbar içindeki "⚔️ Savaş Bölgesi" butonuna bağlı
   ─ Savaş seçim modali → haritada bölge çiz → broadcast
   ─ Tüm oyunculara borozoanlı şerit + tıklayınca ışınlan
════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     1. SAVAŞ SEÇİM MODALI
  ══════════════════════════════════════════════════════════════ */

  function _injectPickModal() {
    if (document.getElementById('wz-modal')) return;
    const el = document.createElement('div');
    el.id = 'wz-modal';
    el.style.cssText = `
      display:none;position:fixed;inset:0;z-index:9300;
      background:rgba(0,0,0,.82);backdrop-filter:blur(6px);
      align-items:center;justify-content:center;
    `;
    el.innerHTML = `
      <div style="background:#18080a;border:1.5px solid rgba(240,74,74,.4);border-radius:16px;
                  padding:24px;width:min(420px,92vw);box-shadow:0 8px 48px rgba(0,0,0,.8),0 0 40px rgba(240,74,74,.15);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <span style="font-size:1.4rem">⚔️</span>
          <span style="font-weight:800;font-size:1rem;color:#f04a4a;letter-spacing:.04em">SAVAŞ BÖLGESİ BELİRLE</span>
          <button onclick="wzClosePickModal()" style="margin-left:auto;background:none;border:none;
            color:rgba(255,255,255,.4);font-size:1.1rem;cursor:pointer;padding:2px 6px;">✕</button>
        </div>
        <div style="font-size:.75rem;color:rgba(255,255,255,.45);margin-bottom:14px;line-height:1.6">
          Hangi savaş için bölge belirleyeceğini seç, ardından haritada sürükleyerek çiz.
          Tüm oyunculara borozoanlı bildirim gider ve bölgeye ışınlanabilirler.
        </div>
        <div id="wz-modal-war-list" style="margin-bottom:14px;max-height:220px;overflow-y:auto;">
          <div style="color:rgba(255,255,255,.35);font-size:.75rem;padding:8px 0;">Yükleniyor…</div>
        </div>
        <button id="wz-modal-start-btn" onclick="wzStartZonePick()" disabled style="
          width:100%;padding:10px 0;border:none;border-radius:10px;
          background:linear-gradient(135deg,#f04a4a,#f97316);color:#fff;
          font-weight:800;font-size:.85rem;cursor:pointer;letter-spacing:.04em;
          opacity:.4;transition:opacity .2s;box-shadow:0 0 18px rgba(240,74,74,.3);">
          🗺️ Haritada Bölge Çiz
        </button>
        <div id="wz-modal-msg" style="font-size:.7rem;color:rgba(255,255,255,.35);margin-top:8px;min-height:14px;text-align:center;"></div>
      </div>
    `;
    el.addEventListener('click', e => { if (e.target === el) wzClosePickModal(); });
    document.body.appendChild(el);
  }

  window.wzOpenPickModal = function () {
    _injectPickModal();
    document.getElementById('wz-modal').style.display = 'flex';
    _loadWzWarList();
  };

  window.wzClosePickModal = function () {
    const m = document.getElementById('wz-modal');
    if (m) m.style.display = 'none';
  };

  async function _loadWzWarList() {
    const listEl   = document.getElementById('wz-modal-war-list');
    const startBtn = document.getElementById('wz-modal-start-btn');
    if (!listEl) return;

    const wars = (typeof _wars !== 'undefined' && Array.isArray(_wars) && _wars.length > 0)
      ? _wars
      : await _fetchWarsFromDB();

    if (!wars || wars.length === 0) {
      listEl.innerHTML = `<div style="color:rgba(255,255,255,.3);font-size:.78rem;padding:10px 0;text-align:center;">Şu an aktif savaş yok.</div>`;
      if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = '.4'; }
      return;
    }

    window._wzSelectedWarId = null;
    window._wzWarsCache = wars;

    listEl.innerHTML = wars.map(w => `
      <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;
                    border-radius:9px;cursor:pointer;border:1px solid rgba(255,255,255,.07);
                    margin-bottom:7px;background:rgba(255,255,255,.03);transition:background .15s;"
             onmouseover="this.style.background='rgba(240,74,74,.09)'"
             onmouseout="this.style.background='rgba(255,255,255,.03)'">
        <input type="radio" name="wz-war-radio" value="${w.id}"
               onchange="wzSelectWar('${w.id}')"
               style="accent-color:#f04a4a;width:15px;height:15px;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            <span style="color:${w.factionA?.color||'#f04a4a'}">${_wzEsc(w.factionA?.name||'A')}</span>
            <span style="color:rgba(255,255,255,.3)"> ⚔ </span>
            <span style="color:${w.factionB?.color||'#7B61FF'}">${_wzEsc(w.factionB?.name||'B')}</span>
          </div>
          <div style="font-size:.66rem;color:rgba(255,255,255,.3);margin-top:2px;">
            ${w.region ? '📍 ' + _wzEsc(w.region) : 'Bölge belirtilmemiş'}
          </div>
        </div>
      </label>
    `).join('');

    if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = '.4'; }
  }

  async function _fetchWarsFromDB() {
    if (typeof supabase === 'undefined') return [];
    try {
      const { data: warRows } = await supabase.from('wars').select('*').is('ended_at', null);
      if (!warRows || warRows.length === 0) return [];
      const factionIds = [...new Set(warRows.flatMap(r => [r.faction_a_id, r.faction_b_id]).filter(Boolean))];
      let factions = [];
      if (factionIds.length > 0) {
        const { data: fd } = await supabase.from('factions').select('id,name,color,tag').in('id', factionIds);
        factions = fd || [];
      }
      return warRows.map(r => ({
        id: r.id, name: r.name||'', region: r.region||'',
        centerX: r.center_x||0, centerY: r.center_y||0,
        factionA: factions.find(f => f.id === r.faction_a_id) || { name:'A', color:'#f04a4a' },
        factionB: factions.find(f => f.id === r.faction_b_id) || { name:'B', color:'#7B61FF' },
      }));
    } catch(e) { return []; }
  }

  window.wzSelectWar = function (warId) {
    window._wzSelectedWarId = warId;
    const btn = document.getElementById('wz-modal-start-btn');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    const msg = document.getElementById('wz-modal-msg');
    if (msg) msg.textContent = '✓ Savaş seçildi. Butona bas ve haritada çiz.';
  };

  /* ══════════════════════════════════════════════════════════════
     2. HARİTA ÜZERİNDE BÖLGE SEÇİM OVERLAY'İ
  ══════════════════════════════════════════════════════════════ */

  function _injectOverlay() {
    if (document.getElementById('wz-pick-overlay')) return;
    const el = document.createElement('div');
    el.id = 'wz-pick-overlay';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9400;cursor:crosshair;';
    el.innerHTML = `
      <div id="wz-pick-rect" style="position:fixed;border:2.5px dashed #f04a4a;border-radius:4px;
        background:rgba(240,74,74,.12);pointer-events:none;display:none;
        box-shadow:0 0 0 1px rgba(240,74,74,.25);"></div>

      <div style="position:fixed;top:16px;left:50%;transform:translateX(-50%);
        background:rgba(16,4,4,.96);border:1.5px solid rgba(240,74,74,.55);
        border-radius:10px;padding:10px 22px;color:#fff;font-size:.8rem;font-weight:600;
        display:flex;align-items:center;gap:12px;pointer-events:none;
        box-shadow:0 4px 24px rgba(0,0,0,.7),0 0 20px rgba(240,74,74,.2);">
        <span style="font-size:1.1rem">⚔️</span>
        <span>Savaş bölgesini <b>sürükleyerek</b> çizin</span>
        <span id="wz-pick-dim" style="color:#f97316;font-size:.7rem;font-family:'Space Mono',monospace;min-width:80px;"></span>
        <span style="color:rgba(255,255,255,.35);font-size:.68rem;">ESC = iptal</span>
      </div>

      <div id="wz-pick-actions" style="position:fixed;display:none;
        background:rgba(16,4,4,.97);border:1.5px solid rgba(240,74,74,.55);
        border-radius:10px;padding:8px 12px;gap:8px;align-items:center;
        box-shadow:0 4px 20px rgba(0,0,0,.7);">
        <button onclick="wzConfirmZone()" style="padding:8px 18px;border:none;border-radius:8px;
          background:linear-gradient(135deg,#f04a4a,#f97316);color:#fff;
          font-weight:800;font-size:.8rem;cursor:pointer;">✓ Yayınla</button>
        <button onclick="wzResetZone()" style="padding:8px 12px;border:1px solid rgba(255,255,255,.15);
          border-radius:8px;background:transparent;color:rgba(255,255,255,.6);font-size:.75rem;cursor:pointer;">↺ Yeniden</button>
        <button onclick="wzCancelZonePick()" style="padding:8px 12px;border:1px solid rgba(255,255,255,.1);
          border-radius:8px;background:transparent;color:rgba(255,255,255,.35);font-size:.75rem;cursor:pointer;">✕ Vazgeç</button>
      </div>
    `;
    document.body.appendChild(el);
  }

  let _wz = { dragging:false, hasSel:false, sx:0, sy:0, ex:0, ey:0, panning:false, panLast:{x:0,y:0} };

  function _wzC2I(cx, cy) {
    if (typeof canvas === 'undefined' || !canvas) return {x:0,y:0};
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    const s  = (typeof scale !== 'undefined') ? scale : 1;
    const _ox = (typeof ox !== 'undefined') ? ox : 0;
    const _oy = (typeof oy !== 'undefined') ? oy : 0;
    const IW = (typeof IMG_W !== 'undefined') ? IMG_W : 99999;
    const IH = (typeof IMG_H !== 'undefined') ? IMG_H : 99999;
    return {
      x: Math.max(0, Math.min(IW-1, Math.floor(((cx-r.left)*dpr - _ox) / s))),
      y: Math.max(0, Math.min(IH-1, Math.floor(((cy-r.top )*dpr - _oy) / s)))
    };
  }

  function _wzDrawRect() {
    const rect = document.getElementById('wz-pick-rect');
    const act  = document.getElementById('wz-pick-actions');
    const dim  = document.getElementById('wz-pick-dim');
    if (!rect || typeof canvas === 'undefined' || !canvas) return;
    const x0=Math.min(_wz.sx,_wz.ex), y0=Math.min(_wz.sy,_wz.ey);
    const x1=Math.max(_wz.sx,_wz.ex), y1=Math.max(_wz.sy,_wz.ey);
    const r = canvas.getBoundingClientRect();
    const s = (typeof scale!=='undefined') ? scale : 1;
    const dpr = canvas.width / r.width;
    const _ox = (typeof ox!=='undefined') ? ox : 0;
    const _oy = (typeof oy!=='undefined') ? oy : 0;
    const sl = r.left + (_ox + x0*s)/dpr;
    const st = r.top  + (_oy + y0*s)/dpr;
    const sw = (x1-x0)*s/dpr, sh = (y1-y0)*s/dpr;
    rect.style.left=sl+'px'; rect.style.top=st+'px';
    rect.style.width=sw+'px'; rect.style.height=sh+'px';
    rect.style.display = (sw>3&&sh>3) ? 'block' : 'none';
    if (dim) dim.textContent = (x1-x0)+'×'+(y1-y0)+' px';
    if (act) {
      if (sw>30 && sh>30) {
        act.style.display = 'flex';
        act.style.left = Math.min(sl, window.innerWidth-320)+'px';
        act.style.top  = Math.min(st+sh+8, window.innerHeight-60)+'px';
      } else { act.style.display = 'none'; }
    }
  }

  function _wzResetSel() {
    _wz.hasSel = false;
    const r=document.getElementById('wz-pick-rect'); if(r) r.style.display='none';
    const a=document.getElementById('wz-pick-actions'); if(a) a.style.display='none';
  }

  function _wzPD(e) {
    if (e.target.closest('#wz-pick-actions')) return;
    if (e.button===1||e.button===2) { e.preventDefault(); _wz.panning=true; _wz.panLast={x:e.clientX,y:e.clientY}; return; }
    if (e.button!==0) return;
    e.preventDefault();
    _wz.dragging=true; _wz.hasSel=false;
    const p=_wzC2I(e.clientX,e.clientY); _wz.sx=_wz.ex=p.x; _wz.sy=_wz.ey=p.y;
    _wzResetSel();
  }
  function _wzPM(e) {
    if (_wz.panning) {
      if(typeof canvas==='undefined') return;
      const dpr=canvas.width/canvas.getBoundingClientRect().width;
      if(typeof ox!=='undefined'){ox+=(e.clientX-_wz.panLast.x)*dpr; oy+=(e.clientY-_wz.panLast.y)*dpr;}
      _wz.panLast={x:e.clientX,y:e.clientY};
      if(typeof draw==='function') draw();
      if(_wz.hasSel) _wzDrawRect();
      return;
    }
    if (!_wz.dragging) return;
    e.preventDefault();
    const p=_wzC2I(e.clientX,e.clientY); _wz.ex=p.x; _wz.ey=p.y; _wzDrawRect();
  }
  function _wzPU(e) {
    if (_wz.panning) { _wz.panning=false; return; }
    if (!_wz.dragging) return;
    _wz.dragging=false;
    const p=_wzC2I(e.clientX,e.clientY); _wz.ex=p.x; _wz.ey=p.y;
    if(Math.abs(_wz.ex-_wz.sx)>4 && Math.abs(_wz.ey-_wz.sy)>4){ _wz.hasSel=true; _wzDrawRect(); }
    else { _wzResetSel(); }
  }
  function _wzWheel(e) {
    e.preventDefault();
    if(typeof scale==='undefined'||!canvas) return;
    const r=canvas.getBoundingClientRect(), dpr=canvas.width/r.width;
    const mx=(e.clientX-r.left)*dpr, my=(e.clientY-r.top)*dpr;
    const ns=Math.max(0.3,Math.min(40,scale*(e.deltaY<0?1.15:1/1.15)));
    ox=mx-(mx-ox)*(ns/scale); oy=my-(my-oy)*(ns/scale); scale=ns;
    if(typeof draw==='function') draw();
    if(_wz.hasSel) _wzDrawRect();
  }
  function _wzKey(e) { if(e.key==='Escape') wzCancelZonePick(); }

  function _wzAddListeners() {
    const ov=document.getElementById('wz-pick-overlay'); if(!ov) return;
    ov.addEventListener('pointerdown',_wzPD);
    ov.addEventListener('pointermove',_wzPM);
    ov.addEventListener('pointerup',_wzPU);
    ov.addEventListener('pointercancel',_wzPU);
    ov.addEventListener('wheel',_wzWheel,{passive:false});
    ov.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('keydown',_wzKey);
  }
  function _wzRemoveListeners() {
    const ov=document.getElementById('wz-pick-overlay'); if(!ov) return;
    ov.removeEventListener('pointerdown',_wzPD);
    ov.removeEventListener('pointermove',_wzPM);
    ov.removeEventListener('pointerup',_wzPU);
    ov.removeEventListener('pointercancel',_wzPU);
    ov.removeEventListener('wheel',_wzWheel);
    document.removeEventListener('keydown',_wzKey);
  }

  window.wzStartZonePick = function () {
    if (!window._wzSelectedWarId) return;
    wzClosePickModal();
    _injectOverlay();
    _wzResetSel();
    const ov = document.getElementById('wz-pick-overlay');
    if (ov) ov.style.display = 'block';
    _wzAddListeners();
  };

  window.wzResetZone = function () { _wzResetSel(); };

  window.wzCancelZonePick = function () {
    _wzRemoveListeners(); _wzResetSel();
    const ov=document.getElementById('wz-pick-overlay'); if(ov) ov.style.display='none';
    _wz.dragging=false; _wz.panning=false;
  };

  window.wzConfirmZone = async function () {
    if (!_wz.hasSel) return;
    const x0=Math.min(_wz.sx,_wz.ex), y0=Math.min(_wz.sy,_wz.ey);
    const x1=Math.max(_wz.sx,_wz.ex), y1=Math.max(_wz.sy,_wz.ey);
    const region = { x:x0, y:y0, w:Math.max(4,x1-x0), h:Math.max(4,y1-y0), cx:Math.round((x0+x1)/2), cy:Math.round((y0+y1)/2) };
    wzCancelZonePick();
    const warId = window._wzSelectedWarId;
    const wars  = window._wzWarsCache || (typeof _wars!=='undefined' ? _wars : []);
    const war   = wars.find(w => w.id === warId);
    if (typeof supabase !== 'undefined' && warId) {
      try { await supabase.from('wars').update({ center_x:region.cx, center_y:region.cy }).eq('id', warId); }
      catch(e) { console.warn('wz update:', e); }
    }
    _wzBroadcast({ war, region });
    showWarZoneBanner({ war, region });
  };

  /* ══════════════════════════════════════════════════════════════
     3. BROADCAST
  ══════════════════════════════════════════════════════════════ */
  let _wzCh = null;
  function _getWzCh() {
    if (_wzCh) return _wzCh;
    if (typeof supabase === 'undefined') return null;
    _wzCh = supabase.channel('war-zone-v2', { config:{ broadcast:{ self:false } } });
    _wzCh.on('broadcast', { event:'war-zone' }, payload => {
      const p = payload && payload.payload;
      if (p) showWarZoneBanner(p);
    });
    _wzCh.subscribe();
    return _wzCh;
  }
  setTimeout(() => _getWzCh(), 1500);

  function _wzBroadcast(data) {
    try { const ch=_getWzCh(); if(ch) ch.send({ type:'broadcast', event:'war-zone', payload:data }); }
    catch(e) {}
  }

  /* ══════════════════════════════════════════════════════════════
     4. ŞERİT BİLDİRİM
  ══════════════════════════════════════════════════════════════ */
  function _injectBanner() {
    if (document.getElementById('wz-banner')) return;
    const el = document.createElement('div');
    el.id = 'wz-banner';
    el.style.cssText = `
      position:fixed;top:-80px;left:0;right:0;z-index:9500;
      height:58px;display:flex;align-items:center;justify-content:center;gap:14px;padding:0 20px;
      background:linear-gradient(90deg,#1a0202 0%,#6b0a0a 20%,#c01e1e 50%,#6b0a0a 80%,#1a0202 100%);
      border-bottom:2px solid rgba(240,74,74,.7);
      box-shadow:0 4px 32px rgba(240,74,74,.5);
      cursor:pointer;transition:top .45s cubic-bezier(.22,1,.36,1);overflow:hidden;user-select:none;
    `;
    el.onclick = wzJumpToZone;
    el.innerHTML = `
      <div style="position:absolute;inset:0;background:repeating-linear-gradient(
        90deg,transparent,transparent 4px,rgba(255,255,255,.015) 4px,rgba(255,255,255,.015) 8px);
        pointer-events:none;"></div>
      <span style="font-size:1.3rem;animation:wzSw .65s ease-in-out infinite alternate;position:relative;">⚔️</span>
      <div style="text-align:center;position:relative;z-index:1;">
        <div id="wz-banner-title" style="font-size:.9rem;font-weight:800;color:#fff;letter-spacing:.07em;
          text-shadow:0 0 16px rgba(240,74,74,.9);animation:wzGl 1.3s ease-in-out infinite alternate;">
          ⚔️ SAVAŞ BAŞLADI! ⚔️
        </div>
        <div id="wz-banner-sub" style="font-size:.66rem;font-weight:600;color:rgba(255,210,170,.8);
          letter-spacing:.03em;margin-top:2px;">Tıkla → Savaş bölgesine ışınlan</div>
      </div>
      <span style="font-size:1.3rem;animation:wzSw .65s ease-in-out infinite alternate-reverse;position:relative;">⚔️</span>
      <button onclick="event.stopPropagation();wzCloseBanner()" style="position:absolute;right:10px;top:6px;
        background:none;border:none;color:rgba(255,255,255,.35);font-size:.72rem;cursor:pointer;padding:2px 5px;border-radius:4px;">✕</button>
    `;
    document.body.appendChild(el);
    const style = document.createElement('style');
    style.textContent = `
      @keyframes wzGl { from{text-shadow:0 0 10px rgba(240,74,74,.7);} to{text-shadow:0 0 24px rgba(255,120,60,1),0 0 8px rgba(255,220,80,.5);} }
      @keyframes wzSw { from{transform:rotate(-18deg) scale(1);} to{transform:rotate(18deg) scale(1.18);} }
    `;
    document.head.appendChild(style);
  }

  window._wzActiveBanner = null;
  let _wzBannerTimer = null;

  window.showWarZoneBanner = function (data) {
    _injectBanner();
    window._wzActiveBanner = data;
    const war = data && data.war;
    const region = data && data.region;
    const title = document.getElementById('wz-banner-title');
    const sub   = document.getElementById('wz-banner-sub');
    if (title && war) {
      const cA=war.factionA?.color||'#f04a4a', cB=war.factionB?.color||'#7B61FF';
      title.innerHTML = `⚔️ <span style="color:${cA}">${_wzEsc(war.factionA?.name||'A')}</span>`
        +` <span style="color:rgba(255,255,255,.4)">VS</span>`
        +` <span style="color:${cB}">${_wzEsc(war.factionB?.name||'B')}</span> ⚔️`;
    }
    if (sub && region) sub.textContent = `SAVAŞ BÖLGESİ (${region.cx}, ${region.cy}) — Tıkla → Işınlan!`;
    if (typeof SFX !== 'undefined' && typeof SFX.war === 'function') SFX.war();
    document.body.classList.add('war-shake');
    setTimeout(() => document.body.classList.remove('war-shake'), 600);
    if (typeof spawnWarSparks === 'function') {
      spawnWarSparks(20);
      setTimeout(() => spawnWarSparks(16), 500);
      setTimeout(() => spawnWarSparks(12), 1000);
    }
    const banner = document.getElementById('wz-banner');
    if (banner) banner.style.top = '0px';
    if (_wzBannerTimer) clearTimeout(_wzBannerTimer);
    _wzBannerTimer = setTimeout(() => wzCloseBanner(), 12000);
  };

  window.wzCloseBanner = function () {
    const b=document.getElementById('wz-banner'); if(b) b.style.top='-80px';
    if (_wzBannerTimer) { clearTimeout(_wzBannerTimer); _wzBannerTimer=null; }
  };

  /* ══════════════════════════════════════════════════════════════
     5. BÖLGEYE IŞINLAN
  ══════════════════════════════════════════════════════════════ */
  window.wzJumpToZone = function () {
    wzCloseBanner();
    const data = window._wzActiveBanner;
    if (!data || !data.region) return;
    const region = data.region;
    if (typeof canvas === 'undefined' || !canvas) return;
    const targetScale = Math.min(
      (canvas.width  * 0.72) / Math.max(region.w, 1),
      (canvas.height * 0.72) / Math.max(region.h, 1),
      20
    );
    scale = targetScale;
    ox = canvas.width  / 2 - region.cx * scale;
    oy = canvas.height / 2 - region.cy * scale;
    if (typeof draw === 'function') draw();
    if (typeof positionWarBadges === 'function') positionWarBadges();
    canvas.style.transition = 'filter .18s';
    canvas.style.filter = 'brightness(1.6) saturate(1.4)';
    setTimeout(() => { canvas.style.filter=''; }, 220);
  };

  /* ══════════════════════════════════════════════════════════════
     6. YARDIMCI
  ══════════════════════════════════════════════════════════════ */
  function _wzEsc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  (function () {
    const _od = window.draw;
    if (typeof _od === 'function') {
      window.draw = function () { _od.apply(this,arguments); if(_wz.hasSel) _wzDrawRect(); };
    }
  })();

  console.log('⚔️ War Zone System v3 loaded');
})();
