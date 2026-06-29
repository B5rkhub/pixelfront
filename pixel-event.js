// ══════════════════════════════════════════════════════
// ⚡ PIXEL EVENT SYSTEM (süreli, hız artıran etkinlik)
// ══════════════════════════════════════════════════════
let pixelEventActive = false;
let pixelEventEndTime = 0; // ms epoch — etkinliğin biteceği an
let _peSelectedMinutes = 5; // admin modalında seçilen süre
let _peTickInterval = null;

const PE_RATE_PIXELS = CONFIG.game.pixelEventRatePixels;
const PE_RATE_MS     = CONFIG.game.pixelEventCooldownMs;
const PE_STATE_KEY   = CONFIG.storageKeys.pixelEventEnd;

// Ripple animation state
const rippleCanvas = document.getElementById('ripple-canvas');
const rctx = rippleCanvas.getContext('2d');
let activeRipples = []; // [{x, y, color, r, maxR, alpha, startTime}]
let rippleAnimFrame = null;

function resizeRippleCanvas(){
  const wrap = document.getElementById('cwrap');
  rippleCanvas.width = wrap.clientWidth;
  rippleCanvas.height = wrap.clientHeight;
}

// Load event state from localStorage (so all "players" on same device see it)
function loadPixelEventState(){
  try{
    const v = localStorage.getItem(PE_STATE_KEY);
    const endTime = v ? parseInt(v, 10) : 0;
    if (endTime && endTime > Date.now()) {
      pixelEventEndTime = endTime;
      pixelEventActive = true;
    } else {
      pixelEventEndTime = 0;
      pixelEventActive = false;
      if (endTime) try{ localStorage.removeItem(PE_STATE_KEY); }catch(e){}
    }
  }catch(e){}
  applyPixelEventState();
  if (pixelEventActive) startPETick();
}

function savePixelEventState(){
  try{
    if (pixelEventActive && pixelEventEndTime > Date.now()) {
      localStorage.setItem(PE_STATE_KEY, String(pixelEventEndTime));
    } else {
      localStorage.removeItem(PE_STATE_KEY);
    }
  }catch(e){}
}

// Etkinlik aktif/pasif olduğunda piksel kazanma hızını ayarlar.
// Aktifken cooldown'u yeniden başlatmaz — yeni hız bir sonraki dolumda devreye girer,
// ama daha doğal hissettirmesi için anında de yeniden başlatıyoruz.
function applyPixelEventRate(){
  if (pixelEventActive) {
    PIXELS_PER_BATCH = PE_RATE_PIXELS;
    COOLDOWN_MS = PE_RATE_MS;
  } else {
    PIXELS_PER_BATCH = DEFAULT_PIXELS_PER_BATCH;
    COOLDOWN_MS = DEFAULT_COOLDOWN_MS;
  }
  // Eğer şu anda bir geri sayım çalışıyorsa, kalan süreyi yeni hıza göre
  // yeniden ölçekle (aniden çok uzun/kısa kalmasın diye orantısal ayar).
  if (cdTick && cdEnd) {
    const remaining = cdEnd - Date.now();
    if (remaining > 0) {
      const cappedRemaining = Math.min(remaining, COOLDOWN_MS);
      cdEnd = Date.now() + cappedRemaining;
      try{localStorage.setItem('pv_cd_'+username, cdEnd);}catch(e){}
    }
  }
}

function applyPixelEventState(){
  const banner = document.getElementById('pixel-event-banner');
  const rc = document.getElementById('ripple-canvas');
  const btn = document.getElementById('pt-event-toggle');
  applyPixelEventRate();
  if(pixelEventActive){
    banner.classList.add('active');
    rc.classList.add('active');
    if(btn){ btn.textContent='⚡ Pixel Event: ON'; btn.classList.add('event-on'); }
  } else {
    banner.classList.remove('active');
    rc.classList.remove('active');
    activeRipples = [];
    if(rctx) rctx.clearRect(0,0,rippleCanvas.width,rippleCanvas.height);
    if(btn){ btn.textContent='⚡ Pixel Event: OFF'; btn.classList.remove('event-on'); }
  }
  updatePixelEventModalView();
}

// ── Admin modal kontrolleri ──
function openPixelEventModal(){
  const modal = document.getElementById('pixel-event-modal');
  modal.style.display = 'flex';
  updatePixelEventModalView();
}
function closePixelEventModal(){
  document.getElementById('pixel-event-modal').style.display = 'none';
}
function selectPEDuration(btn, minutes){
  document.querySelectorAll('.pe-dur-btn').forEach(b=>b.classList.remove('pe-dur-sel'));
  btn.classList.add('pe-dur-sel');
  _peSelectedMinutes = minutes;
  // Yenile butonundaki etiketi güncelle
  const rl = document.getElementById('pe-refresh-label');
  if(rl) rl.textContent = '(+'+minutes+'dk)';
}

// Aktif etkinliğin süresini sıfırlayıp seçili süre kadar yeniden başlatır
function refreshPixelEvent(){
  if(!pixelEventActive){
    // Etkinlik kapalıysa başlat
    startPixelEvent();
    return;
  }
  pixelEventEndTime = Date.now() + _peSelectedMinutes * 60 * 1000;
  savePixelEventState();
  showPopup(t('msg.event_refreshed', {n: _peSelectedMinutes}));
  updatePixelEventModalView();
}
function updatePixelEventModalView(){
  const setup = document.getElementById('pe-setup');
  const active = document.getElementById('pe-active');
  if (!setup || !active) return;
  if (pixelEventActive) {
    setup.style.display = 'none';
    active.style.display = 'flex';
    // Yenile butonundaki etiketi güncelle
    const rl = document.getElementById('pe-refresh-label');
    if(rl) rl.textContent = '(+'+_peSelectedMinutes+'dk)';
  } else {
    setup.style.display = 'flex';
    active.style.display = 'none';
  }
}

function startPixelEvent(){
  pixelEventEndTime = Date.now() + _peSelectedMinutes * 60 * 1000;
  pixelEventActive = true;
  savePixelEventState();
  applyPixelEventState();
  startPETick();
  showPopup(t('msg.event_started', {n: _peSelectedMinutes}));
  closePixelEventModal();
}

function stopPixelEvent(){
  pixelEventActive = false;
  pixelEventEndTime = 0;
  savePixelEventState();
  applyPixelEventState();
  stopPETick();
  showPopup(t('msg.event_stopped'));
  closePixelEventModal();
}

function startPETick(){
  if (_peTickInterval) return;
  tickPE();
  _peTickInterval = setInterval(tickPE, 1000);
}
function stopPETick(){
  if (_peTickInterval) { clearInterval(_peTickInterval); _peTickInterval = null; }
  const t = document.getElementById('pe-banner-timer');
  if (t) t.textContent = '—';
}
function tickPE(){
  if (!pixelEventActive) { stopPETick(); return; }
  const rem = pixelEventEndTime - Date.now();
  if (rem <= 0) {
    pixelEventActive = false;
    pixelEventEndTime = 0;
    savePixelEventState();
    applyPixelEventState();
    stopPETick();
    showPopup(t('msg.event_ended'));
    return;
  }
  const m = Math.floor(rem/60000), s = Math.floor((rem%60000)/1000);
  const label = m+':' + String(s).padStart(2,'0');
  const bannerT = document.getElementById('pe-banner-timer');
  if (bannerT) bannerT.textContent = label;
  const modalT = document.getElementById('pe-modal-timer');
  if (modalT) modalT.textContent = label;
}

// Call this when a pixel is placed (pass screen coordinates and hex color)
function triggerPixelRipple(screenX, screenY, hexColor){
  if(!pixelEventActive) return;
  // Clamp max ripple radius to cover a meaningful area
  const maxR = Math.min(rippleCanvas.width, rippleCanvas.height) * 0.28;
  activeRipples.push({
    x: screenX,
    y: screenY,
    color: hexColor,
    r: 0,
    maxR,
    alpha: 1,
    startTime: Date.now()
  });
  if(!rippleAnimFrame) animateRipples();
}

function animateRipples(){
  rctx.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);
  const now = Date.now();
  activeRipples = activeRipples.filter(rp => rp.alpha > 0.01);

  activeRipples.forEach(rp => {
    const elapsed = now - rp.startTime;
    const duration = 1400; // ms for full expansion
    const t = Math.min(elapsed / duration, 1);

    rp.r = rp.maxR * easeOutCubic(t);
    rp.alpha = 1 - t;

    // Draw expanding ring
    rctx.save();
    rctx.beginPath();
    rctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
    rctx.strokeStyle = hexToRgba(rp.color, rp.alpha * 0.85);
    rctx.lineWidth = Math.max(1.5, 4 * (1 - t));
    rctx.stroke();

    // Inner glow fill (fades fast)
    if(t < 0.35){
      rctx.beginPath();
      rctx.arc(rp.x, rp.y, rp.r * 0.6, 0, Math.PI * 2);
      rctx.fillStyle = hexToRgba(rp.color, rp.alpha * 0.12);
      rctx.fill();
    }
    rctx.restore();
  });

  if(activeRipples.length > 0){
    rippleAnimFrame = requestAnimationFrame(animateRipples);
  } else {
    rippleAnimFrame = null;
    rctx.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);
  }
}

function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

function hexToRgba(hex, alpha){
  hex = hex.replace('#','');
  if(hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
  const r = parseInt(hex.substring(0,2),16);
  const g = parseInt(hex.substring(2,4),16);
  const b = parseInt(hex.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

// Hook into resizeCanvas to also resize ripple canvas
const _origResizeCanvas = window.resizeCanvas || function(){};
window.resizeCanvas = function(){
  _origResizeCanvas.apply(this, arguments);
  resizeRippleCanvas();
};

// Also intercept handleClick to trigger ripple when pixel is placed
const _origHandleClickForEvent = window.handleClick;
window.handleClick = function(mx, my){
  // Store position and selected color before calling original
  const prePixLeft = _getPixLeft();
  _origHandleClickForEvent.apply(this, arguments);
  // If a pixel was consumed and event is active, fire ripple
  if(pixelEventActive && _getPixLeft() < prePixLeft){
    const color = PARTIES[selParty].color;
    // Convert canvas coords to screen coords within cwrap
    triggerPixelRipple(mx, my, color);
  }
};

// Poll for pixel event state changes from other "players" every 2s
setInterval(()=>{
  try{
    const v = localStorage.getItem(PE_STATE_KEY);
    const endTime = v ? parseInt(v, 10) : 0;
    const nowActive = !!(endTime && endTime > Date.now());
    if(nowActive !== pixelEventActive){
      pixelEventActive = nowActive;
      pixelEventEndTime = nowActive ? endTime : 0;
      applyPixelEventState();
      if (nowActive) startPETick(); else stopPETick();
    } else if (nowActive && endTime !== pixelEventEndTime) {
      pixelEventEndTime = endTime; // admin süreyi değiştirmiş olabilir (ileride)
    }
  }catch(e){}
}, 2000);

// Store pixel placement events for other players to see ripples
// We write to localStorage when placing, and poll to replay ripples from others
const RIPPLE_LOG_KEY = CONFIG.storageKeys.rippleLog;
let lastRippleSeen = 0;

function broadcastRipple(screenX, screenY, color){
  if(!pixelEventActive) return;
  try{
    const raw = localStorage.getItem(RIPPLE_LOG_KEY);
    const log = raw ? JSON.parse(raw) : [];
    // Store ripple with canvas-space coords (map coords relative to image)
    // We store image pixel coords so other clients can translate to their view
    log.push({t: Date.now(), color});
    // Keep only last 30 ripples
    if(log.length > 30) log.splice(0, log.length - 30);
    localStorage.setItem(RIPPLE_LOG_KEY, JSON.stringify(log));
  }catch(e){}
}

// Override triggerPixelRipple to also broadcast
const _origTriggerPixelRipple = triggerPixelRipple;
window.triggerPixelRipple = function(screenX, screenY, hexColor){
  _origTriggerPixelRipple(screenX, screenY, hexColor);
  broadcastRipple(screenX, screenY, hexColor);
};

// Poll for remote ripples from other players
setInterval(()=>{
  if(!pixelEventActive) return;
  try{
    const raw = localStorage.getItem(RIPPLE_LOG_KEY);
    if(!raw) return;
    const log = JSON.parse(raw);
    const newOnes = log.filter(r => r.t > lastRippleSeen);
    if(newOnes.length){
      lastRippleSeen = Math.max(...newOnes.map(r=>r.t));
      newOnes.forEach(r => {
        if(r.flat !== undefined && FLAT_TO_PROV !== null){
          // Convert map flat coord to current screen position
          const imgX = r.flat % IMG_W;
          const imgY = Math.floor(r.flat / IMG_W);
          const screenX = ox + imgX * scale + scale * 0.5;
          const screenY = oy + imgY * scale + scale * 0.5;
          // Only show if on screen
          if(screenX >= -50 && screenX <= rippleCanvas.width + 50 &&
             screenY >= -50 && screenY <= rippleCanvas.height + 50){
            _origTriggerPixelRipple(screenX, screenY, r.color);
          }
        }
      });
    }
  }catch(e){}
}, 800);

// Initialize on load
loadPixelEventState();
resizeRippleCanvas();
