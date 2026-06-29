const SUPABASE_URL = CONFIG.supabase.url;
const SUPABASE_KEY = CONFIG.supabase.key;
// ÖNEMLİ: <script src="...supabase-js@2"> zaten global bir "supabase" değişkeni
// oluşturuyor (window.supabase = { createClient, ... }). Burada "let/const supabase"
// ile YENİDEN tanımlamak "Identifier 'supabase' has already been declared" SyntaxError'ı
// fırlatır ve bu YÜZÜNDEN TÜM <script> bloğu (startGame dahil) hiç çalışmaz.
// Bu yüzden var olan global'i declare etmiyoruz, sadece üzerine yazıyoruz.
const _pvSupabaseLib = window.supabase; // kütüphane referansını saklayalım
let _pvOfflineMode = false;
try{
  if(!_pvSupabaseLib || typeof _pvSupabaseLib.createClient !== 'function'){
    throw new Error('Supabase kütüphanesi (cdn.jsdelivr.net) yüklenemedi.');
  }
  supabase = _pvSupabaseLib.createClient(SUPABASE_URL, SUPABASE_KEY);
}catch(e){
  // CDN engellenmiş/yavaş olsa bile aşağıdaki tüm const/let tanımları (username dahil)
  // çalışsın diye burada asla throw etmiyoruz — bunun yerine sahte (no-op) bir
  // supabase istemcisi kullanıyoruz, oyun çevrimdışı/yerel modda çalışmaya devam eder.
  console.error('[PixelFront] Supabase başlatılamadı, çevrimdışı moda geçiliyor:', e);
  _pvOfflineMode = true;
  const _pvStubBuilder = (()=>{
    const b = {};
    ['select','eq','order','limit','insert','upsert'].forEach(m=>{ b[m] = ()=> b; });
    b.then = (resolve)=> resolve({data:null, error:{message:'offline'}});
    b.catch = ()=> b;
    return b;
  });
  const _pvStubChannel = (()=>{
    const c = {};
    c.on = ()=> c;
    c.subscribe = ()=> c;
    c.send = async ()=> ({error:{message:'offline'}});
    return c;
  });
  supabase = {
    rpc: async ()=> ({data:null, error:{message:'offline'}}),
    from: ()=> _pvStubBuilder(),
    channel: ()=> _pvStubChannel()
  };
  setTimeout(()=>{ try{ showPopup(t('msg.offline')); }catch(e2){} }, 800);
}

let PROV_IDS = [];

const PARTIES=[
  {name:'Beyaz',color:'#ffffff'},
  {name:'Açık Gri',color:'#e4e4e4'},
  {name:'Gri',color:'#c4c4c4'},
  {name:'Koyu Gri',color:'#888888'},
  {name:'Çok Koyu Gri',color:'#4e4e4e'},
  {name:'Siyah',color:'#000000'},
  {name:'Açık Pembe',color:'#f4b3ae'},
  {name:'Pembe',color:'#ffa7d1'},
  {name:'Fuşya',color:'#ff54b2'},
  {name:'Açık Kırmızı',color:'#ff6565'},
  {name:'Kırmızı',color:'#e50000'},
  {name:'Koyu Kırmızı',color:'#9a0000'},
  {name:'Şeftali',color:'#fea460'},
  {name:'Turuncu',color:'#e59500'},
  {name:'Kahverengi',color:'#a06a42'},
  {name:'Koyu Kahverengi',color:'#604028'},
  {name:'Krem',color:'#f5dfb0'},
  {name:'Açık Sarı',color:'#fff889'},
  {name:'Sarı',color:'#e5d900'},
  {name:'Açık Yeşil',color:'#94e044'},
  {name:'Yeşil',color:'#02be01'},
  {name:'Çimen',color:'#688338'},
  {name:'Koyu Yeşil',color:'#006513'},
  {name:'Açık Mavi',color:'#cae3ff'},
  {name:'Cyan',color:'#00d3dd'},
  {name:'Mavi',color:'#0083c7'},
  {name:'Parlak Mavi',color:'#0000ea'},
  {name:'Lacivert',color:'#191973'},
  {name:'Lila',color:'#cf6ee4'},
  {name:'Mor',color:'#820080'},
];
const REGIONS={
  marmara:      {label:'Marmara',           color:'#6366f1'},
  aegean:       {label:'Ege',               color:'#06b6d4'},
  mediterranean:{label:'Akdeniz',           color:'#f5a623'},
  central:      {label:'İç Anadolu',        color:'#9b7fff'},
  blacksea:     {label:'Karadeniz',         color:'#00d4a0'},
  eastern:      {label:'Doğu Anadolu',      color:'#f04a4a'},
  southeastern: {label:'Güneydoğu Anadolu', color:'#f97316'},
};
const REGION_ORDER=['marmara','aegean','mediterranean','central','blacksea','eastern','southeastern'];
const PIXEL_LIMIT             = CONFIG.game.pixelStockpileLimit;
const DEFAULT_PIXELS_PER_BATCH = CONFIG.game.defaultPixelsPerBatch;
const DEFAULT_COOLDOWN_MS      = CONFIG.game.defaultCooldownMs;
let PIXELS_PER_BATCH = DEFAULT_PIXELS_PER_BATCH;
let COOLDOWN_MS      = DEFAULT_COOLDOWN_MS;

// ── HİLE ÖNLEME (Anti-Cheat) ──────────────────────────────────────────
// pixLeft değeri artık Object.defineProperty ile korunuyor.
// Konsol'dan pixLeft=999 yazmak artık işe yaramaz.
// Tüm değişiklikler _setPixLeft() üzerinden geçmek zorunda.
let _pixLeftInternal = PIXEL_LIMIT;
let _pixLeftToken = _generateToken(PIXEL_LIMIT); // integrity token
let _lastPixelTime = 0; // rate limiting için
const _MIN_PIXEL_INTERVAL_MS = CONFIG.game.minPixelIntervalMs;

// istemci tarafı pixLeft koruma — RLS asıl güvence, bu sadece konsol manipülasyonunu zorlaştırır
function _generateToken(val) {
  const SALT = 'pv_' + navigator.userAgent.length + '_salt_9f2k';
  const slot = Math.floor(Date.now() / 60000); // her dakika yenilenir
  return btoa(SALT + '|' + val + '|' + slot).replace(/=/g,'');
}
function _validateToken(val, token) { // 2 dakika toleransı: sınırda false-positive önler
  const SALT = 'pv_' + navigator.userAgent.length + '_salt_9f2k';
  const slot = Math.floor(Date.now() / 60000);
  for (let d = 0; d <= 2; d++) {
    const expected = btoa(SALT + '|' + val + '|' + (slot - d)).replace(/=/g,'');
    if (expected === token) return true;
  }
  return false;
}

function _setPixLeft(newVal, skipValidation) {
  // Değer her zaman 0-PIXEL_LIMIT arasında olmalı
  const clamped = Math.max(0, Math.min(PIXEL_LIMIT, Math.floor(newVal)));
  _pixLeftInternal = clamped;
  _pixLeftToken = _generateToken(clamped);
}

function _getPixLeft() {
  if (!_validateToken(_pixLeftInternal, _pixLeftToken)) {
    // Token süresi dolmuş olabilir — yenile ama gerçek manipülasyon değilse sıfırlama
    const currentVal = _pixLeftInternal;
    _pixLeftToken = _generateToken(currentVal);
    if (currentVal < 0 || currentVal > PIXEL_LIMIT || !Number.isInteger(currentVal)) {
      console.warn('[AntiCheat] pixLeft token geçersiz, sıfırlanıyor.');
      _pixLeftInternal = 0;
      _pixLeftToken = _generateToken(0);
    }
  }
  return _pixLeftInternal;
}

// pixLeft'i global property olarak tanımla — konsol'dan yazmak engellenir
Object.defineProperty(window, 'pixLeft', {
  get() { return _getPixLeft(); },
  set(v) {
    // Sadece dahili çağrılara izin ver — dışarıdan yazma sessizce görmezden gelinir
    if (typeof v !== 'number' || v > PIXEL_LIMIT || v < 0) {
      console.warn('[AntiCheat] Geçersiz pixLeft ataması engellendi:', v);
      return;
    }
    // Dışarıdan atama yapılıyorsa token kontrolü yap
    console.warn('[AntiCheat] Dışarıdan pixLeft ataması engellendi.');
  },
  configurable: false
});

// Token her 30 saniyede bir yenilenir — dakika sınırında sıfırlanma önlenir
setInterval(() => {
  const cur = _pixLeftInternal;
  if (cur >= 0 && cur <= PIXEL_LIMIT && Number.isInteger(cur)) {
    _pixLeftToken = _generateToken(cur);
  }
}, 30000);
// ─────────────────────────────────────────────────────────────────────

// kullanıcı verisi innerHTML'e girmeden önce buradan geçmeli (stored XSS önleme)
function _esc(str){
  if(str===null || str===undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
// javascript: gibi tehlikeli şemaları reddeder, yalnızca http(s) ve data:image/ geçer
function _safeImgSrc(url){
  if(!url || typeof url!=='string') return '';
  const u=url.trim();
  if(/^https?:\/\//i.test(u) || /^data:image\//i.test(u)) return _esc(u);
  return '';
}

let username='',selParty=0,cdEnd=0,cdTick=null;
_setPixLeft(PIXEL_LIMIT); // pixLeft başlangıç değeri
let pixData={},actLog=[];

// Data decompressed asynchronously on load - see initMapData()

const canvas=document.getElementById('c'),ctx=canvas.getContext('2d');
let scale=1,ox=0,oy=0,panning=false,panSt={x:0,y:0};

const mapImg=new Image();
mapImg.crossOrigin='anonymous';
mapImg.src='https://files.catbox.moe/bkbbmq.png';

let baseCanvas=null,pixelCanvas=null;
let labelEls=[];

let _origBaseImageData=null; // snapshot of clean map before any paint edits

function buildOffscreens(){
  baseCanvas=document.createElement('canvas');
  baseCanvas.width=IMG_W;baseCanvas.height=IMG_H;
  const bctx0=baseCanvas.getContext('2d');
  bctx0.imageSmoothingEnabled=false;
  bctx0.drawImage(mapImg,0,0,IMG_W,IMG_H);
  // Save clean snapshot BEFORE applying paint edits
  _origBaseImageData=baseCanvas.getContext('2d').getImageData(0,0,IMG_W,IMG_H);
  pixelCanvas=document.createElement('canvas');
  pixelCanvas.width=IMG_W;pixelCanvas.height=IMG_H;
  buildLabels();
  redrawPixelCanvas();
  buildLOD();
  draw();
}

function buildLabels(){
  const overlay=document.getElementById('label-overlay');
  if(overlay) overlay.innerHTML='';
  labelEls=[];
  PROV_IDS.forEach(pid=>{
    const center=PROV_CENTERS[pid];
    if(!center) return;
    const [cx,cy]=center;
    const pxCount=(PROV_PIXELS[pid]||[]).length;
    // Yazı boyutu il büyüklüğüne göre — daha büyük değerler daha okunabilir
    const basePx=pxCount>400?12:pxCount>200?10:pxCount>80?8.5:pxCount>30?7:6;
    const el=document.createElement('span');
    el.textContent=PROV_NAMES[pid]||pid;
    el.dataset.cx=cx;
    el.dataset.cy=cy;
    el.dataset.base=basePx;
    overlay.appendChild(el);
    labelEls.push(el);
  });
  positionLabels();
}

function positionLabels(){
  // Uzaklaştırınca görünür, yakınlaştırınca kaybolur
  const SHOW_MAX = 1.5;   // bu scale üzerinde etiketler solar
  const FADE_MIN = 1.0;   // bu scale altında tamamen opak
  labelEls.forEach(el=>{
    const cx=+el.dataset.cx, cy=+el.dataset.cy;
    el.style.left=(ox+cx*scale)+'px';
    el.style.top=(oy+cy*scale)+'px';
    if(scale > SHOW_MAX){
      el.style.opacity='0';
    } else {
      const opacity = scale < FADE_MIN ? 1 : 1 - (scale - FADE_MIN) / (SHOW_MAX - FADE_MIN);
      el.style.opacity=opacity.toFixed(2);
      // basePx zaten ekran px cinsinden (scale=1'de) — clamp 7-14px
      const fs = Math.min(14, Math.max(7, +el.dataset.base));
      el.style.fontSize=fs+'px';
    }
  });
}

function redrawPixelCanvas(){
  const pctx=pixelCanvas.getContext('2d');
  pctx.clearRect(0,0,IMG_W,IMG_H);
  PROV_IDS.forEach(pid=>{
    const votes=pixData[pid];
    if(!votes||!votes.length) return;
    votes.forEach(v=>{
      // party her zaman integer olmalı — string geldiyse zorla dönüştür
      const p=parseInt(v.party,10);
      if(isNaN(p)||p<0||p>=PARTIES.length) return;
      pctx.fillStyle=PARTIES[p].color;
      pctx.fillRect(v.flat%IMG_W,Math.floor(v.flat/IMG_W),1,1);
    });
  });
}

// LOD canvas for fast rendering when zoomed out
let lodCanvas=null;
function buildLOD(){
  if(!baseCanvas) return;
  lodCanvas=document.createElement('canvas');
  lodCanvas.width=Math.round(IMG_W/4);
  lodCanvas.height=Math.round(IMG_H/4);
  const lctx=lodCanvas.getContext('2d');
  lctx.imageSmoothingEnabled=false;
  lctx.drawImage(baseCanvas,0,0,lodCanvas.width,lodCanvas.height);
}

function draw(){
  if(!baseCanvas) return;
  const cw=canvas.width,ch=canvas.height;
  ctx.clearRect(0,0,cw,ch);
  ctx.fillStyle='#06060f';
  ctx.fillRect(0,0,cw,ch);
  const iw=IMG_W*scale,ih=IMG_H*scale;
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  // LOD: use 1/4 scale canvas when zoomed out for performance
  if(scale<0.3 && lodCanvas){
    ctx.drawImage(lodCanvas,ox,oy,iw,ih);
  } else {
    ctx.drawImage(baseCanvas,ox,oy,iw,ih);
  }
  ctx.drawImage(pixelCanvas,ox,oy,iw,ih);
  ctx.restore();
  positionLabels();
}

function canvasToFlat(mx,my){
  const ix=Math.floor((mx-ox)/scale),iy=Math.floor((my-oy)/scale);
  if(ix<0||ix>=IMG_W||iy<0||iy>=IMG_H) return -1;
  return ix+iy*IMG_W;
}

// ── FIRÇA MODU: Shift basılıyken sol tık sürükleyince kalem gibi pixel bas ──
// Fırçayla sürüklerken geçilen her hücre bir KUYRUĞA ekleniyor ve bu kuyruk
// SIRAYLA (bir önceki sunucu cevabı gelmeden bir sonraki başlamadan) işleniyor.
// Böylece hem hiçbir piksel atlanmıyor (kuyruğa giren her şey eninde sonunda
// işlenir) hem de sunucuya asla aynı anda onlarca paralel istek gitmiyor
// (ki bu, cooldown hesaplamasını yanıltıp "fazladan piksel" hatasına yol açıyordu).
let _brushActive = false; // shift+mousedown İLE YA DA _penMode AÇIKKEN mousedown ile aktif olur
let _brushLastFlat = -1; // fırçanın en son KUYRUĞA EKLEDİĞİ hücre — aynı hücreyi art arda kuyruğa eklemeyi önler
let _brushQueue = []; // [{mx,my}, ...] — sırayla işlenecek bekleyen tıklamalar
let _brushQueueRunning = false;

// ── KALEM MODU: Shift'e basmaya gerek kalmadan, paletin yanındaki kalem
// butonuyla açılıp kapanan sürekli "fırça" modu. Açıkken mantık tamamen
// Shift+sürükle ile birebir aynı kuyruk/RPC/sayaç sistemini kullanır —
// sadece tetikleyici Shift tuşu değil bu flag'tir. Mobilde de aynı flag
// touch sürüklemesinin pan değil piksel basma anlamına gelmesini sağlar.
let _penMode = false;
function togglePenMode(){
  _penMode = !_penMode;
  const btn=document.getElementById('pen-toggle');
  if(btn) btn.classList.toggle('active', _penMode);
  canvas.style.cursor = _penMode ? 'cell' : 'crosshair';
  if(!_penMode){ _brushActive=false; _brushLastFlat=-1; }
}

// ── Mouse/Touch çakışma koruması ─────────────────────────────────────────
// Dokunmatik masaüstü/laptoplarda (Surface, 2-in-1, dokunmatik monitör) bir
// dokunuş hem touchstart/touchmove hem de (tarayıcıya/cihaza bağlı olarak)
// "hayalet" mouse event'leri üretebiliyordu. touch* handler'lar zaten
// preventDefault() çağırıyor, ama bu garanti değil; bazı tarayıcı/cihaz
// kombinasyonlarında mouse event'leri yine sıraya giriyor ve aynı jesti
// ikinci kez işleyip ox/oy/scale'i bozuyordu (harita zıplaması, yanlış
// piksel basımı vb). Aşağıdaki bayrak SADECE bunu önlüyor; mobil dokunma
// akışının kendisine hiç dokunulmuyor.
let _lastTouchTS = 0;
const _TOUCH_GUARD_MS = CONFIG.game.touchGuardMs;
function _recentTouch(){ return (Date.now() - _lastTouchTS) < _TOUCH_GUARD_MS; }

// ── Sağ/orta tık ile pan sırasında context menüsünü engelleme ──────────────
// canvas.addEventListener('contextmenu', preventDefault) SADECE fare hâlâ
// canvas üzerindeyken işe yarar. Sürükleyerek pan yaparken fare çok kolay
// canvas'ın dışına (sidebar/topbar/boş alan) çıkabiliyor; sağ tuş orada
// bırakılırsa contextmenu olayı canvas'ta değil o elementte tetiklenir ve
// canvas'a bağlı engelleme hiç devreye girmez. Bu yüzden engellemeyi ayrıca
// document seviyesinde, bu bayrak true olduğu sürece tekrarlıyoruz.
let _suppressContextMenu = false;
document.addEventListener('contextmenu', e=>{
  if(_suppressContextMenu){ e.preventDefault(); _suppressContextMenu=false; }
});
// Güvenlik ağı: contextmenu hiç tetiklenmezse (örn. orta tıkla pan) veya
// sağ tuş canvas dışında bırakılırsa bayrak sonsuza kadar takılı kalmasın.
// setTimeout(0) ile, henüz sıraya girmiş olabilecek contextmenu olayının
// önce işlenmesine izin veriyoruz.
window.addEventListener('mouseup', ()=>{ setTimeout(()=>{ _suppressContextMenu=false; },0); }, true);

function _brushEnqueue(mx,my){
  _brushQueue.push({mx,my});
  _runBrushQueue();
}

async function _runBrushQueue(){
  if(_brushQueueRunning) return; // zaten bir kuyruk-tüketici çalışıyor
  _brushQueueRunning = true;
  try{
    while(_brushQueue.length){
      const next = _brushQueue.shift();
      // handleClick kendi içinde await ile sunucu cevabını bekliyor;
      // burada da onu bekleyerek bir sonraki kuyruk elemanına geçiyoruz.
      await window.handleClick(next.mx, next.my);
    }
  } finally {
    _brushQueueRunning = false;
  }
}

/* ════════════════════════════════════════════════════════════════
   MASAÜSTÜ (MOUSE) KONTROL BLOĞU — BAŞLANGIÇ
   Bu blok sadece fare olaylarını dinler (mousedown/mousemove/mouseup/
   wheel/contextmenu). Her handler en üstte _recentTouch() kontrolü
   yapar; bir dokunma jesti az önce işlendiyse bu handler'lar sessizce
   çıkar (return) — böylece dokunmatik ekranlı laptop/tabletlerde aynı
   jest iki kez işlenmez. Mobilde bu blok fiilen devre dışı kalır.
════════════════════════════════════════════════════════════════ */
canvas.addEventListener('mousedown',e=>{
  if(_recentTouch()) return; // bu jest zaten touch handler tarafından işleniyor/işlendi
  if(e.button===1||e.button===2){
    panning=true;panSt={x:e.clientX-ox,y:e.clientY-oy};canvas.style.cursor='grabbing';
    _suppressContextMenu=true; // sürükleme bitene kadar — fare canvas dışına çıksa bile menüyü engelle
    return;
  }
  const r=canvas.getBoundingClientRect();
  if(e.shiftKey||_penMode){
    _brushActive = true;
    canvas.style.cursor = 'cell';
    _brushLastFlat = canvasToFlat(e.clientX-r.left,e.clientY-r.top);
    _brushEnqueue(e.clientX-r.left,e.clientY-r.top);
    return;
  }
  window.handleClick(e.clientX-r.left,e.clientY-r.top);
});
canvas.addEventListener('mouseleave',()=>{ _brushActive = false; _brushLastFlat = -1; });
canvas.addEventListener('mousemove',e=>{
  if(_recentTouch()) return; // bu jest zaten touch handler tarafından işleniyor/işlendi
  if(panning){ox=e.clientX-panSt.x;oy=e.clientY-panSt.y;clampView();draw();return;}
  // Shift basılı (ya da kalem modu açık) + sol tuş sürükleme = fırça modu
  if(_brushActive && (e.shiftKey||_penMode) && e.buttons===1){
    const r=canvas.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    const flat=canvasToFlat(mx,my);
    // Mouse hâlâ aynı pikselin üzerindeyse kuyruğa tekrar ekleme —
    // ufak titreşim hareketleri aynı hücreyi onlarca kez kuyruğa
    // ekleyip gereksiz yere büyütmesin diye.
    if(flat===_brushLastFlat) return;
    _brushLastFlat = flat;
    _brushEnqueue(mx,my);
    return;
  } else if(_brushActive && (!(e.shiftKey||_penMode) || e.buttons!==1)){
    _brushActive = false;
    _brushLastFlat = -1;
    canvas.style.cursor = _penMode ? 'cell' : 'crosshair';
  }
  // Shift tuşuna basılıyken (ya da kalem modu açıkken) cursor'u değiştir
  if((e.shiftKey||_penMode) && !panning){
    canvas.style.cursor = 'cell';
  } else if(!panning && !_brushActive){
    canvas.style.cursor = 'crosshair';
  }
  const r=canvas.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  const flat=canvasToFlat(mx,my);
  const tip=document.getElementById('tip');
  const preview=document.getElementById('hover-preview');

  if(flat>=0 && !adminMode && FLAT_TO_PROV){
    const pi=FLAT_TO_PROV[flat];
    const isOnProvince=pi>=0 && !WHITE_SET.has(flat);

    // Show/hide/move preview pixel
    if(isOnProvince && pixLeft>0){
      // Check if same colour already placed here
      const pid=PROV_IDS[pi];
      const existing=(pixData[pid]||[]).find(v=>v.flat===flat);
      const sameColour=existing && existing.party===selParty;
      preview.style.display='block';
      // Position at exact pixel boundary on screen
      const imgX=flat%IMG_W, imgY=Math.floor(flat/IMG_W);
      // Center of this pixel on screen
      const pixSize=Math.max(2, scale); // exact size of 1 map pixel on screen
      const screenCX=ox+imgX*scale+scale*0.5; // pixel center x
      const screenCY=oy+imgY*scale+scale*0.5; // pixel center y
      preview.style.left=screenCX+'px';
      preview.style.top=screenCY+'px';
      preview.style.width=pixSize+'px';
      preview.style.height=pixSize+'px';
      preview.style.background=sameColour
        ? 'rgba(255,255,255,0.15)'
        : PARTIES[selParty].color+'cc';
      preview.style.borderColor=sameColour
        ? 'rgba(255,255,255,0.3)'
        : 'rgba(255,255,255,0.9)';
    } else {
      preview.style.display='none';
    }

    if(pi>=0){
      const pid=PROV_IDS[pi];
      const reg=REGIONS[PROV_REGIONS[pid]];
      const w=winner(pid);
      tip.style.opacity='1';
      tip.style.left=(mx+14)+'px';
      tip.style.top=(my-10)+'px';
      tip.innerHTML=(WHITE_SET.has(flat)?'<span style="color:var(--muted)">Sınır — </span>':'')+
        `<b>${PROV_NAMES[pid]}</b> <span style="color:${reg.color};font-size:.62rem">${reg.label}</span>`+
        (w?` · <span style="color:${PARTIES[w.p].color}">${PARTIES[w.p].name} ${w.pct}%</span>`:'');
    }else tip.style.opacity='0';
  } else {
    preview.style.display='none';
    tip.style.opacity='0';
  }
});
canvas.addEventListener('mouseup',()=>{ if(_recentTouch()) return; panning=false;_brushActive=false;_brushLastFlat=-1;canvas.style.cursor='crosshair';});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
  const ns=Math.min(20,Math.max(0.5,scale*(e.deltaY<0?1.15:0.87)));
  ox=mx-(mx-ox)*(ns/scale);oy=my-(my-oy)*(ns/scale);scale=ns;clampView();draw();
},{passive:false});
/* ════════════════════════════════════════════════════════════════
   MASAÜSTÜ (MOUSE) KONTROL BLOĞU — SON
════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════
   MOBİL (TOUCH) KONTROL BLOĞU — BAŞLANGIÇ
   Tek parmak = pan + tap-to-place, iki parmak = pinch-zoom.
   ox/oy/scale değişkenleri masaüstü bloğuyla PAYLAŞILIR (aynı harita
   state'i) — bu kasıtlı: mobil ve masaüstü aynı görünümü kontrol
   etmeli. Bu bloktaki her şey _lastTouchTS'i güncelleyerek yukarıdaki
   mouse handler'larını bir süreliğine devre dışı bırakır.
════════════════════════════════════════════════════════════════ */
let lastT=null;
let touchMoved=false;
let pinchStartDist=null;
let pinchStartScale=null;
let pinchMid=null;
let pinchStartOx=null; // pinch jesti başladığı andaki sabit ox/oy referansı —
let pinchStartOy=null; // her touchmove'da DEĞİL, sadece pinch başlarken/yeniden temellendiğinde güncellenir.
function _touchDist(t0,t1){
  const dx=t0.clientX-t1.clientX, dy=t0.clientY-t1.clientY;
  return Math.sqrt(dx*dx+dy*dy);
}
function _touchMid(t0,t1,r){
  return {x:(t0.clientX+t1.clientX)/2-r.left, y:(t0.clientY+t1.clientY)/2-r.top};
}
// ÖNEMLİ: e.touches DEĞİL e.targetTouches kullanıyoruz.
// e.touches ekrandaki TÜM dokunuşları sayar — örn. bir elinle haritayı
// tutarken diğer elinle chat/profil butonuna dokunsan bile o ikinci dokunuş
// e.touches'a dahil olur ve yanlışlıkla pinch-zoom'u tetikleyebilirdi.
// e.targetTouches sadece BU canvas üzerinde başlayan dokunuşları sayar,
// böylece başka elemanlardaki dokunuşlar haritayı asla etkilemez.
canvas.addEventListener('touchstart',e=>{
  _lastTouchTS = Date.now();
  const tt=e.targetTouches;
  if(tt.length===1){
    e.preventDefault(); // sentetik mouse/click olaylarının ikinci kez piksel basmasını da önler
    lastT={x:tt[0].clientX,y:tt[0].clientY};
    touchMoved=false;
    pinchStartDist=null;
    if(_penMode){
      // Kalem modu: parmak henüz hareket etmeden de ucun bastığı ilk hücreyi boya.
      const r=canvas.getBoundingClientRect();
      const mx=tt[0].clientX-r.left, my=tt[0].clientY-r.top;
      _brushLastFlat=canvasToFlat(mx,my);
      _brushEnqueue(mx,my);
    }
  } else if(tt.length>=2){
    e.preventDefault();
    const r=canvas.getBoundingClientRect();
    pinchStartDist=Math.max(1,_touchDist(tt[0],tt[1])); // 0'a bölünmeyi önle
    pinchStartScale=scale;
    pinchMid=_touchMid(tt[0],tt[1],r);
    pinchStartOx=ox; // bu pinch jesti boyunca SABİT kalacak referans —
    pinchStartOy=oy; // her hesaplama bu noktadan yapılır, kayma/sürünme önlenir.
    lastT=null;
    touchMoved=true; // iki (veya daha fazla) parmakla başlayan jest tıklama sayılmasın
  }
},{passive:false});
canvas.addEventListener('touchmove',e=>{
  _lastTouchTS = Date.now();
  e.preventDefault();
  const tt=e.targetTouches;
  if(tt.length>=2&&pinchStartDist){
    // ── İki (3. bir parmak daha dokunsa bile her zaman ilk ikisi kullanılır) parmakla yakınlaştırma/uzaklaştırma (pinch-to-zoom) ──
    // ÖNEMLİ: ölçek değişimi her zaman pinch BAŞLANGICINDAKİ sabit referans
    // noktasına (pinchStartOx/Oy, pinchMid) göre hesaplanır. Eğer bunun yerine
    // her karede güncel (hareket eden) ox/oy kullanılsaydı, formül kendi
    // kendini besleyip harita parmakların ortasından kayar / "sürünür" ve
    // clampView devreye girdiğinde de zıplama hissi oluştururdu.
    const r=canvas.getBoundingClientRect();
    const dist=Math.max(1,_touchDist(tt[0],tt[1]));
    const mid=_touchMid(tt[0],tt[1],r);
    const ns=Math.min(20,Math.max(0.5,pinchStartScale*(dist/pinchStartDist)));
    const ratio=ns/pinchStartScale;
    // Parmakların o anki ortası (mid), pinch başlangıcındaki harita noktasının
    // (pinchMid'in pinchStartOx/Oy'a göre temsil ettiği image-space nokta)
    // tam üzerinde kalacak şekilde ox/oy hesaplanır — hem zoom hem pan (iki
    // parmağın ortası kayarsa) tek formülde birleşir, zıplama olmaz.
    ox=mid.x-(pinchMid.x-pinchStartOx)*ratio;
    oy=mid.y-(pinchMid.y-pinchStartOy)*ratio;
    scale=ns;
    // ── BUG FIX: harita zıplaması düzeltmesi ──
    // clampView() ox/oy'u sınırlara göre kırpabilir. Kırpma olduğunda
    // pinch referans noktaları (pinchStartOx/Oy, pinchMid, pinchStartDist/Scale)
    // hâlâ kırpılmamış pozisyona göre hesaplanmış durumda kalıyordu; bir
    // sonraki touchmove karesi bu eski referanstan devam edince harita
    // aniden (kırpılan kadar) zıplıyordu. Çözüm: kırpma gerçekleştiyse,
    // referansı o anki (kırpılmış) duruma göre SESSİZCE yeniden temellendir
    // — touchend'de parmak sayısı değiştiğinde yapılan yeniden temellendirmeyle
    // aynı mantık, sadece burada her karede kontrol ediliyor.
    const _preClampOx=ox, _preClampOy=oy;
    clampView();
    if(ox!==_preClampOx || oy!==_preClampOy){
      pinchStartDist=dist;
      pinchStartScale=scale;
      pinchMid=mid;
      pinchStartOx=ox;
      pinchStartOy=oy;
    }
    draw();
  } else if(tt.length===1&&lastT){
    const dx=tt[0].clientX-lastT.x, dy=tt[0].clientY-lastT.y;
    if(Math.abs(dx)>4||Math.abs(dy)>4) touchMoved=true;
    if(_penMode){
      // Kalem modu: tek parmak sürüklemesi haritayı KAYDIRMAZ, piksel basar.
      const r=canvas.getBoundingClientRect();
      const mx=tt[0].clientX-r.left, my=tt[0].clientY-r.top;
      const flat=canvasToFlat(mx,my);
      lastT={x:tt[0].clientX,y:tt[0].clientY};
      if(flat!==_brushLastFlat){
        _brushLastFlat=flat;
        _brushEnqueue(mx,my);
      }
      return;
    }
    ox+=dx;oy+=dy;
    lastT={x:tt[0].clientX,y:tt[0].clientY};
    clampView();draw();
  }
},{passive:false});
canvas.addEventListener('touchend',e=>{
  _lastTouchTS = Date.now();
  e.preventDefault(); // tap sonrası tarayıcının ürettiği sentetik click/mousedown'ı bastırır (çift piksel basma riskini sıfırlar)
  const tt=e.targetTouches; // bu canvas'ı hâlâ "hedefleyen", kalkmamış dokunuşlar
  if(tt.length===0){
    // Sadece sürükleme/pinch yoksa (tek dokunuş, hareketsiz) piksel koy.
    // Kalem modunda touchstart'ta zaten basıldı (bkz. yukarı) — burada tekrar basma.
    if(!touchMoved&&e.changedTouches.length===1&&!_penMode){
      const t=e.changedTouches[0];const r=canvas.getBoundingClientRect();
      window.handleClick(t.clientX-r.left,t.clientY-r.top);
    }
    lastT=null;
    pinchStartDist=null;
    touchMoved=false;
  } else if(tt.length===1){
    // İki (veya daha fazla) parmaktan biri kalktı — kalan parmakla sürüklemeye devam et, tap sayma
    lastT={x:tt[0].clientX,y:tt[0].clientY};
    pinchStartDist=null;
    touchMoved=true;
  } else if(tt.length>=2){
    // 3+ parmaktan biri kalktı, hâlâ 2+ parmak var — pinch'i kalan ilk iki
    // parmağı yeni temel alarak SIÇRAMA yapmadan sürdür.
    const r=canvas.getBoundingClientRect();
    pinchStartDist=Math.max(1,_touchDist(tt[0],tt[1]));
    pinchStartScale=scale;
    pinchMid=_touchMid(tt[0],tt[1],r);
    pinchStartOx=ox; // yeni referans noktası — mevcut konumdan kayma olmadan devam
    pinchStartOy=oy;
    lastT=null;
    touchMoved=true;
  }
},{passive:false});
canvas.addEventListener('touchcancel',()=>{
  // Sistem jesti (bildirim çekme, kontrol merkezi, uygulama geçişi, telefon
  // araması vb.) dokunuşu iptal ederse durumu sıfırla — aksi halde eski
  // "sürüklendi" bayrağı yüzünden bir sonraki dokunuşta piksel basılamaz
  // ya da pinch hesaplaması bozuk kalabilirdi.
  lastT=null;
  pinchStartDist=null;
  pinchMid=null;
  pinchStartOx=null;
  pinchStartOy=null;
  touchMoved=false;
},{passive:true});
/* ════════════════════════════════════════════════════════════════
   MOBİL (TOUCH) KONTROL BLOĞU — SON
════════════════════════════════════════════════════════════════ */

// ── FIRÇA/SPAM ÖNLEME: bir RPC isteği sunucudan cevap dönene kadar
// yeni bir handleClick çağrısının sunucuya gitmesini engeller.
// Fırça modunda mousemove saniyede onlarca kez tetiklendiği için
// (await edilmeden çağrıldığından) bu kilit olmadan paralel onlarca
// place_pixel isteği aynı anda sunucuya gidip kuyrukta gecikerek
// cooldown hesaplamasını yanıltabiliyordu.
let _placePixelInFlight = false;

async function handleClick(mx,my){
  // Kayıt olmadan piksel basılamaz — kayıt ekranını göster
  if(!username){
    showRegisterPrompt(mx,my);
    return;
  }
  const flat=canvasToFlat(mx,my);
  if(flat<0) return;
  if(!FLAT_TO_PROV){ showPopup(t('msg.map_loading')); return; }
  if(WHITE_SET.has(flat)){showPopup(t('msg.click_border'));return;}
  const pi=FLAT_TO_PROV[flat];
  if(pi<0){showPopup(t('msg.click_province'));return;}

  const now = Date.now();

  // ── HİLE ÖNLEME: Yerel hızlı kontrol (tarayıcıya güvenmiyoruz, ama anında geri bildirim için bakıyoruz) ──
  const currentPix = _getPixLeft();
  if(currentPix <= 0){showPopup(t('msg.no_pixels_left'));return;}

  // Önceki istek hâlâ sunucudan cevap bekliyorsa bu çağrıyı sessizce
  // yok say (fırça sürüklerken aynı anda onlarca RPC fırlatılmasını önler).
  if(_placePixelInFlight) return;

  const pid=PROV_IDS[pi];
  if(!pixData[pid]) pixData[pid]=[];
  const existing=pixData[pid].find(v=>v.flat===flat);
  if(existing && existing.party===selParty){
    showPopup(t('msg.already_this_color'));
    return;
  }

  // ── Önce ekranda anında göster (optimistic update), gerçek karar sunucudan gelecek ──
  const prevState = existing ? {flat:existing.flat,party:existing.party} : null;
  if(existing){
    existing.party=selParty;
  } else {
    pixData[pid].push({flat,party:selParty});
  }
  _lastPixelTime = now;
  const pctx=pixelCanvas.getContext('2d');
  pctx.fillStyle=PARTIES[selParty].color;
  pctx.fillRect(flat%IMG_W,Math.floor(flat/IMG_W),1,1);
  draw();updateSidebar();
  if(typeof SFX!=='undefined') SFX.pixel();

  // ── ASIL HAK KONTROLÜ VE KAYIT: sunucudaki place_pixel fonksiyonu üzerinden ──
  _placePixelInFlight = true;
  try{
    const {data,error} = await supabase.rpc('place_pixel',{
      p_flat: flat,
      p_party: selParty,
      p_province: pid
    });

    if(error || !data || data.success !== true){
      // Sunucu reddetti (hak yok ya da başka bir hata) — ekrandaki değişikliği geri al
      if(prevState){
        existing.party = prevState.party;
      } else {
        const idx=pixData[pid].findIndex(v=>v.flat===flat);
        if(idx>-1) pixData[pid].splice(idx,1);
      }
      draw();updateSidebar();
      if(data && data.error==='no_pixels_left'){
        _setPixLeft(0);
        showPopup(t('msg.no_pixels_left'));
      } else if(data && data.error==='not_authenticated'){
        showPopup(t('msg.session_expired'));
        username='';
        document.getElementById('ubadge').textContent=t('topbar.guest');
      } else {
        showPopup(t('msg.action_failed'));
        if(error) console.error('place_pixel RPC hatası:', error);
      }
      return;
    }

    // Sunucu onayladı — gerçek kalan hakkı sunucudan al (tarayıcı tahmini değil)
    _setPixLeft(data.pix_left);
    try{localStorage.setItem(CONFIG.storageKeys.pixels + username,_getPixLeft());}catch(e){}
    profileData.totalPlaced=(profileData.totalPlaced||0)+1;
    // ── XP KAZANMA (saveProfile ve saveXPData gainXP içinde çağrılıyor) ──
    gainXP(1);
    actLog.unshift({user:username,party:selParty,prov:PROV_NAMES[pid],t:now});
    updateDots();
    showPopup(t('msg.you_voted', {party: PARTIES[selParty].name, province: PROV_NAMES[pid]}));
    if(!cdTick) startCooldown();
  }catch(e){
    console.error('place_pixel hata:',e);
    if(prevState){
      existing.party = prevState.party;
    } else {
      const idx=pixData[pid].findIndex(v=>v.flat===flat);
      if(idx>-1) pixData[pid].splice(idx,1);
    }
    draw();updateSidebar();
    showPopup(t('msg.conn_error'));
  }finally{
    // İstek ne şekilde sonuçlanırsa sonuçlansın (başarı/red/hata) kilidi aç,
    // ki bir sonraki tıklama/fırça hareketi sunucuya gidebilsin.
    _placePixelInFlight = false;
  }
}

function doZoom(f){
  const cw=canvas.width/2,ch=canvas.height/2;
  const ns=Math.min(20,Math.max(0.5,scale*f));
  ox=cw-(cw-ox)*(ns/scale);oy=ch-(ch-oy)*(ns/scale);scale=ns;clampView();draw();
}
function clampView(){
  const cw=canvas.width, ch=canvas.height;
  const iw=IMG_W*scale, ih=IMG_H*scale;
  // ── BUG FIX: zoom-out'ta haritanın ekrandan kaybolması düzeltmesi ──
  // ESKİ MANTIK: marginX/Y sabit bir kenar boşluğuydu (cw*0.2), ve harita
  // ekrandan KÜÇÜK olduğunda (uzaklaştırıldığında) bile ox/oy geniş bir
  // aralıkta serbest kalıyordu. Sonuç: kullanıcı uzaklaştırıp sürükleyince
  // küçülmüş harita ekranın bir köşesine/kenarına sıkışıp "kaybolabiliyordu".
  // YENİ MANTIK: harita bir eksende ekrandan küçükse (iw<cw veya ih<ch),
  // o eksende SERBEST KAYDIRMA YOK — harita o eksende ekrana ORTALANIR.
  // Harita ekrandan büyükse eskisi gibi %20'lik taşma payı bırakılır.
  if(iw<=cw){
    ox=(cw-iw)/2;
  } else {
    const marginX=cw*0.2;
    ox=Math.min(cw-marginX, Math.max(marginX-iw, ox));
  }
  if(ih<=ch){
    oy=(ch-ih)/2;
  } else {
    const marginY=ch*0.2;
    oy=Math.min(ch-marginY, Math.max(marginY-ih, oy));
  }
}
function resetView(){
  const sx=canvas.width/IMG_W,sy=canvas.height/IMG_H;
  scale=Math.min(sx,sy)*0.95;
  ox=(canvas.width-IMG_W*scale)/2;oy=(canvas.height-IMG_H*scale)/2;draw();
}

function startCooldown(){
  if(cdTick) return;
  cdEnd=Date.now()+COOLDOWN_MS;
  try{localStorage.setItem(CONFIG.storageKeys.cooldown + username,cdEnd);}catch(e){}
  tickCD();
  cdTick=setInterval(tickCD,1000);
}
function tickCD(){
  const rem=cdEnd-Date.now();
  const cdEl=document.getElementById('cdlabel');
  if(rem<=0){
    clearInterval(cdTick);cdTick=null;
    const gained=Math.min(PIXELS_PER_BATCH,PIXEL_LIMIT-_getPixLeft());
    _setPixLeft(_getPixLeft()+gained);
    try{localStorage.setItem(CONFIG.storageKeys.pixels + username,_getPixLeft());}catch(e){}
    updateDots();
    if(_getPixLeft()<PIXEL_LIMIT){
      showPopup(t('msg.gained_pixels', {n: gained, total: _getPixLeft()}));
      startCooldown();
    } else {
      if(cdEl){cdEl.style.display='block';}
      const cdTimer=document.getElementById('cdtimer');
      if(cdTimer) cdTimer.textContent=t('cd.max_short');
      showPopup(t('msg.max_pixels', {n: PIXEL_LIMIT}));
    }
    return;
  }
  if(cdEl) cdEl.style.display='block';
  const m=Math.floor(rem/60000),s=Math.floor((rem%60000)/1000);
  const cdTimer=document.getElementById('cdtimer');
  if(cdTimer) cdTimer.textContent=m+'dk '+s+'sn';
}
async function loadCD(){
  // Önce sunucudan gerçek hakkı çek (asıl doğru kaynak burası)
  try{
    const {data,error} = await supabase.rpc('get_pix_left');
    if(!error && data && typeof data.pix_left === 'number'){
      _setPixLeft(data.pix_left);
      try{localStorage.setItem(CONFIG.storageKeys.pixels + username,_getPixLeft());}catch(e){}
      if(data.next_refill_ms && data.next_refill_ms > 0){
        cdEnd = Date.now() + data.next_refill_ms;
        try{localStorage.setItem(CONFIG.storageKeys.cooldown + username,cdEnd);}catch(e){}
        tickCD();cdTick=setInterval(tickCD,1000);
      } else if(_getPixLeft() < PIXEL_LIMIT){
        startCooldown();
      }
      return;
    }
  }catch(e){console.error('get_pix_left hata:',e);}

  // Sunucuya erişilemezse eski localStorage tahminine geri dön (yedek davranış)
  try{
    const savedPx=localStorage.getItem(CONFIG.storageKeys.pixels + username);
    if(savedPx) _setPixLeft(Math.min(+savedPx,PIXEL_LIMIT));
    const v=localStorage.getItem(CONFIG.storageKeys.cooldown + username);
    if(v){
      const cdEndSaved=+v;
      if(Date.now()<cdEndSaved){
        cdEnd=cdEndSaved;tickCD();cdTick=setInterval(tickCD,1000);
      } else {
        const elapsed=Date.now()-cdEndSaved;
        const extra=Math.floor(elapsed/COOLDOWN_MS)+1;
        _setPixLeft(_getPixLeft()+extra*PIXELS_PER_BATCH);
        try{localStorage.setItem(CONFIG.storageKeys.pixels + username,_getPixLeft());}catch(e){}
        if(_getPixLeft()<PIXEL_LIMIT) startCooldown();
      }
    } else if(_getPixLeft()<PIXEL_LIMIT){
      startCooldown();
    }
  }catch(e){}
}
function updateDots(){
  const wrap=document.getElementById('pixel-dots-wrap');
  if(!wrap) return;
  wrap.innerHTML='';
  const currentPix=_getPixLeft();
  for(let i=0;i<PIXEL_LIMIT;i++){
    const d=document.createElement('span');
    d.className='pdot'+(i>=currentPix?' used':'');
    wrap.appendChild(d);
  }
  document.getElementById('pnum').textContent=currentPix;
}
// NOT: Eski saveData() fonksiyonu (tüm pixData'yı supabase.from('pixels').upsert
// ile toplu kaydeden) kaldırıldı — artık hiçbir yerden çağrılmıyordu (paintPixel
// artık admin_delete_pixels RPC'sini kullanıyor) ve zaten RLS tarafından
// reddediliyordu. localStorage yedeği loadData() içinde ayrıca korunuyor.
async function loadData(){
  try{
    const {data,error}=await supabase.from('pixels').select('*');
    if(data&&!error){
      pixData={};
      data.forEach(row=>{
        if(!pixData[row.province])pixData[row.province]=[];
        // party'yi her zaman integer'a zorla — Supabase bazen string döner
        const partyInt=parseInt(row.party,10);
        if(isNaN(partyInt)||partyInt<0||partyInt>=PARTIES.length) return;
        pixData[row.province].push({flat:Number(row.flat),party:partyInt});
      });
    } else {
      // Hata varsa localStorage'dan yükle
      try{const d=localStorage.getItem('pv3_data');if(d)pixData=JSON.parse(d);}catch(e){}
    }
  }catch(e){
    try{const d=localStorage.getItem('pv3_data');if(d)pixData=JSON.parse(d);}catch(e2){}
  }
  try{const a=localStorage.getItem('pv3_act');if(a)actLog=JSON.parse(a);}catch(e){}
}
function startRealtimeSync(){
  supabase.channel('pixels-changes').on(
    'postgres_changes',
    {event:'*',schema:'public',table:'pixels'},
    (payload)=>{
      const row=payload.new;
      if(!row||!row.province)return;
      // party'yi her zaman integer'a zorla — Supabase realtime bazen string döner
      const partyInt=parseInt(row.party,10);
      if(isNaN(partyInt)||partyInt<0||partyInt>=PARTIES.length) return;
      // Geçmiş modunda canlı güncellemeleri geçmiş pixData'ya yazma
      if(typeof _historyMode !== 'undefined' && _historyMode){
        // Canlı yedek varsa onu güncelle ki çıkınca güncel kalsın
        if(_historySavedPixData){
          const pid=row.province;
          if(!_historySavedPixData[pid])_historySavedPixData[pid]=[];
          const ex=_historySavedPixData[pid].find(v=>v.flat===Number(row.flat));
          if(ex){ex.party=partyInt;}else{_historySavedPixData[pid].push({flat:Number(row.flat),party:partyInt});}
        }
        // Scrub ileri gidebilsin diye yeni olayı kayıt listesine ekle
        if(typeof _historyAllRows !== 'undefined' && _historyAllRows){
          _historyAllRows.push({flat:Number(row.flat),province:row.province,party:partyInt,t:Date.now()});
        }
        return; // canvas'a yansıtma
      }
      if(!pixData[row.province])pixData[row.province]=[];
      const existing=pixData[row.province].find(v=>v.flat===row.flat);
      if(existing){existing.party=partyInt;}
      else{pixData[row.province].push({flat:Number(row.flat),party:partyInt});}
      // Piksel canvas'ı güncelle
      if(pixelCanvas){
        const pctx=pixelCanvas.getContext('2d');
        pctx.fillStyle=PARTIES[partyInt].color;
        pctx.fillRect(row.flat%IMG_W,Math.floor(row.flat/IMG_W),1,1);
      }
      draw();updateSidebar();
    }
  ).subscribe();
  // Global chat gerçek zamanlı
  supabase.channel('chat-changes').on(
    'postgres_changes',
    {event:'INSERT',schema:'public',table:'chat_messages',filter:'channel=eq.global'},
    (payload)=>{
      if(document.getElementById('chat-panel').classList.contains('open')&&currentChatTab==='global'){
        const row=payload.new;
        if(!row) return;
        const uname=typeof username!=='undefined'?username:'';
        // Kendi mesajımızı optimistic olarak zaten ekledik, tekrar ekleme
        if(row.username===uname && Date.now()-new Date(row.created_at).getTime()<5000) return;
        const entry={user:row.username,text:row.message,t:new Date(row.created_at).getTime(),photo:'',frame:'none'};
        const isMe=entry.user===uname;
        const box=document.getElementById('chat-messages');
        const el=document.createElement('div');
        el.className='cm '+(isMe?'user':'other');
        el.appendChild(buildChatAvatar(entry));
        el.appendChild(buildChatBubble(entry,isMe));
        box.appendChild(el);
        box.scrollTop=box.scrollHeight;
        if(_chatMsgCache) _chatMsgCache._globalKey='';
      }
    }
  ).subscribe();
}
function winner(pid){
  const v=pixData[pid];if(!v||!v.length)return null;
  const c=new Array(PARTIES.length).fill(0);
  v.forEach(x=>{ const p=parseInt(x.party,10); if(!isNaN(p)&&p>=0&&p<PARTIES.length) c[p]++; });
  const mx=Math.max(...c),mi=c.indexOf(mx);
  if(mx===0) return null;
  return {p:mi,pct:Math.round(mx/v.length*100)};
}
function globalCounts(){
  const c=new Array(PARTIES.length).fill(0);
  PROV_IDS.forEach(pid=>(pixData[pid]||[]).forEach(x=>{ const p=parseInt(x.party,10); if(!isNaN(p)&&p>=0&&p<PARTIES.length) c[p]++; }));
  return c;
}
function tsince(t){const s=Math.floor((Date.now()-t)/1000);return s<60?s+'sn':s<3600?Math.floor(s/60)+'dk':Math.floor(s/3600)+'sa';}
function updateSidebar(){
  const rlistEl=document.getElementById('rlist');
  const afeedEl=document.getElementById('afeed');
  if(!rlistEl && !afeedEl) return; // sidebar kaldırıldıysa hesaplama yapmaya gerek yok
  const seen=new Set();
  const rlistHTML=REGION_ORDER.map(rid=>{
    const reg=REGIONS[rid];
    const provs=PROV_IDS.filter(pid=>PROV_REGIONS[pid]===rid&&!seen.has(pid));
    provs.forEach(p=>seen.add(p));
    const items=provs.map(pid=>{
      const w=winner(pid);
      const badge=w?`<span class="pbadge" style="background:${PARTIES[w.p].color}">${PARTIES[w.p].name.replace('Parti ','')} ${w.pct}%</span>`
        :`<span class="pbadge" style="background:#252538">—</span>`;
      return `<div class="pi"><span>${PROV_NAMES[pid]}</span>${badge}</div>`;
    }).join('');
    return `<div class="rblock"><div class="rhdr" style="background:${reg.color}22;color:${reg.color}"><span>${reg.label}</span><span style="opacity:.6;font-size:.58rem">${provs.length} il</span></div>${items}</div>`;
  }).join('');
  if(rlistEl) rlistEl.innerHTML=rlistHTML;
  if(afeedEl) afeedEl.innerHTML=actLog.length
    ?actLog.slice(0,12).map(a=>`<div class="af"><span>${a.user}</span> → <span style="color:${PARTIES[a.party].color}">${PARTIES[a.party].name}</span> / ${a.prov} <span style="opacity:.4">${tsince(a.t)}</span></div>`).join('')
    :`<div class="af" style="color:var(--muted)">Henüz hamle yok...</div>`;
}
let ptmo;
function showPopup(msg){const el=document.getElementById('popup');el.textContent=msg;el.classList.add('show');clearTimeout(ptmo);ptmo=setTimeout(()=>el.classList.remove('show'),2800);}
let _lastCwrapW=null, _lastCwrapH=null;
function resizeCanvas(){
  const wrap=document.getElementById('cwrap');
  const newW=wrap.clientWidth, newH=wrap.clientHeight;
  const widthChanged=_lastCwrapW!==null && Math.abs(newW-_lastCwrapW)>1;
  const isFirstRun=_lastCwrapW===null;
  canvas.width=newW;canvas.height=newH;
  if(isFirstRun||widthChanged){
    // Gerçek boyut değişimi (ilk yükleme, döndürme, masaüstü pencere boyutu) — görünümü sıfırla
    resetView();
  } else {
    // Mobilde adres çubuğu açılıp kapanınca SADECE yükseklik değişir —
    // kullanıcının pan/zoom konumunu koru, sadece sınırları güncelle
    clampView();draw();
  }
  _lastCwrapW=newW;_lastCwrapH=newH;
}
// Decompress map data on load
async function initMapData(){
  // Decompress flat_to_prov (Int16, zlib compressed, base64 encoded)
  const b64ToBytes = b64 => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    return bytes;
  };
  const decompress = async (b64) => {
    const compressed = b64ToBytes(b64);
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(compressed);
    writer.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    while(true){
      const {done,value} = await reader.read();
      if(done) break;
      chunks.push(value);
    }
    let total = chunks.reduce((a,b)=>a+b.length,0);
    const out = new Uint8Array(total);
    let off=0; chunks.forEach(c=>{out.set(c,off);off+=c.length;});
    return out;
  };

  showPopup(t('msg.map_loading'));

  // Decompress FLAT_TO_PROV (Int16Array)
  const fpRaw = await decompress(FLAT_PROV_B64);
  FLAT_TO_PROV = new Int16Array(fpRaw.buffer);

  // Decompress WHITE_SET (Int32Array of flat indices)
  const wRaw = await decompress(WHITE_B64);
  const wArr = new Int32Array(wRaw.buffer);
  WHITE_SET = new Set(wArr);

  // Build PROV_IDS and PROV_PIXELS from FLAT_TO_PROV
  PROV_IDS = PROV_IDS_LIST.slice();
  PROV_IDS.forEach(pid => { PROV_PIXELS[pid] = []; });
  for(let i=0;i<FLAT_TO_PROV.length;i++){
    const pi = FLAT_TO_PROV[i];
    // Sınır (WHITE_SET) piksellerini il alanına dahil etme —
    // etiket/merkez hesabı ve tıklama mantığı PROV_PIXELS'i temel
    // aldığı için, buradaki sızıntı doğrudan "komşu ilden parça
    // seçiliyor" hatasına yol açıyordu.
    if(pi>=0 && !WHITE_SET.has(i)) PROV_PIXELS[PROV_IDS[pi]].push(i);
  }

  showPopup(t('msg.map_ready'));
}

// Kayıt modalını aç (pixel basmaya çalışınca)
let _pendingClickMx=null, _pendingClickMy=null;
function showRegisterPrompt(mx, my){
  _pendingClickMx=mx; _pendingClickMy=my;
  document.getElementById('login-title').textContent='✏ Hesabına Giriş Yap';
  document.getElementById('login-desc').innerHTML='Piksel basmak için email ile kayıt ol veya giriş yap.';
  document.getElementById('login-err').textContent='';
  document.getElementById('login').style.display='flex';
  setTimeout(()=>document.getElementById('uname').focus(), 80);
}

function _activateUser(v){
  username=v;
  document.getElementById('login').style.display='none';
  document.getElementById('ubadge').textContent='👤 '+username;
  startRealtimeSync();
  loadCD(); updateDots();
  loadProfile();
  loadXPFromSupabase().then(()=>{ updateXPUI(); renderLevelLeaderboard(); checkDailyStreak(); });
  if(typeof maybeShowTutorial==='function') setTimeout(maybeShowTutorial, 400);
}

// tutorial.js dosyasında — maybeShowTutorial, tutorialNext, closeTutorial

// ── AUTH SEKME GEÇİŞİ (Kayıt Ol / Giriş Yap) ──────────────────────────
let _authMode = 'signup'; // 'signup' | 'signin'
function switchAuthTab(mode){
  _authMode = mode;
  const su = document.getElementById('auth-tab-signup');
  const si = document.getElementById('auth-tab-signin');
  const unameEl = document.getElementById('uname');
  const btn = document.getElementById('login-btn');
  document.getElementById('login-err').textContent = '';
  if(mode === 'signup'){
    su.classList.add('active'); su.style.background='#ffffff14'; su.style.color='#fff';
    si.classList.remove('active'); si.style.background='transparent'; si.style.color='#aaa';
    unameEl.style.display = '';
    btn.textContent = t('login.submit_signup');
  } else {
    si.classList.add('active'); si.style.background='#ffffff14'; si.style.color='#fff';
    su.classList.remove('active'); su.style.background='transparent'; su.style.color='#aaa';
    unameEl.style.display = 'none';
    btn.textContent = t('login.submit_signin');
  }
}

// ── GÜVENLİK NOTU: Eski IP-binding sistemi (bir IP'nin tek bir kullanıcı
// adına bağlanması) tamamen kaldırıldı. Artık kimlik doğrulama gerçek bir
// email+şifre hesabına (Supabase Auth) dayanıyor; bu hem daha güvenli hem
// de VPN/farklı ağ ile sınırsız yeni "kullanıcı adı" açıp pixel limitini
// sıfırlama açığını kapatıyor (bir email = bir hesap = bir pixel kotası).

// ── Google ile Giriş Yap ──────────────────────────────────────────────
// supabase.auth.signInWithOAuth, kullanıcıyı Google'ın kendi giriş
// ekranına yönlendirir; orada hesabını seçip onayladıktan sonra Supabase'in
// callback URL'i üzerinden bu sayfaya geri döner ve oturum otomatik açılır
// (sayfa açılışındaki initMapWithoutLogin içindeki getSession() kontrolü
// bunu yakalayıp kullanıcıyı otomatik giriş yapmış gösterir).
// Kullanıcı adı (display_name), Google hesabından gelen isimle dolduruluyor;
// kullanıcı isterse daha sonra profil ekranından değiştirebilir.
async function signInWithGoogle(){
  const errEl=document.getElementById('login-err');
  errEl.textContent='';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });
  if(error){
    errEl.textContent='⚠ Google ile giriş başlatılamadı: '+error.message;
  }
  // Hata yoksa tarayıcı Google'a yönlendirilir, bu fonksiyonun devamı çalışmaz.
}

async function startGame(){
  const errEl=document.getElementById('login-err');
  const btn=document.getElementById('login-btn');
  const email=document.getElementById('auth-email').value.trim();
  const password=document.getElementById('auth-password').value;
  errEl.textContent='';

  if(!email || !password){
    errEl.textContent='⚠ Email ve şifre gerekli.';
    return;
  }
  if(password.length < 6){
    errEl.textContent='⚠ Şifre en az 6 karakter olmalı.';
    return;
  }

  if(_authMode === 'signup'){
    const v=document.getElementById('uname').value.trim();
    if(!v){document.getElementById('uname').style.borderColor='#e63946';errEl.textContent='⚠ Kullanıcı adı gerekli.';return;}

    // ── GÜVENLİK: kullanıcı adı validasyonu ──────────────────────────
    // Daha sonra faction üye listesi, liderlik tablosu, sohbet gibi pek
    // çok yerde diğer kullanıcıların ekranına basılan bu isim, HTML/JS
    // karakteri içeremesin diye (stored XSS önleme) kısıtlanıyor.
    const NAME_RE = /^[\p{L}\p{N} _\-]{2,20}$/u;
    if(!NAME_RE.test(v)){
      errEl.textContent='⚠ Kullanıcı adı sadece harf, rakam, boşluk, "-" ve "_" içerebilir (2-20 karakter).';
      document.getElementById('uname').style.borderColor='#e63946';
      return;
    }

    btn.disabled=true; btn.textContent='Kayıt olunuyor...';
    const {data,error} = await supabase.auth.signUp({
      email, password,
      options:{ data:{ display_name: v } }
    });
    btn.disabled=false; btn.textContent='Kayıt Ol ve Haritaya Gir →';

    if(error){
      errEl.textContent='⚠ '+(error.message==='User already registered' ? 'Bu email zaten kayıtlı, "Giriş Yap" sekmesini kullan.' : error.message);
      return;
    }
    if(!data.session){
      errEl.textContent='✓ Kayıt başarılı! Email adresine gelen onay linkine tıkla, sonra giriş yap.';
      return;
    }
    _activateUser(v);
  } else {
    btn.disabled=true; btn.textContent='Giriş yapılıyor...';
    const {data,error} = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled=false; btn.textContent='Giriş Yap →';

    if(error){
      errEl.textContent='⚠ Email veya şifre hatalı.';
      return;
    }
    const displayName = data.user?.user_metadata?.display_name || data.user?.user_metadata?.full_name || data.user?.email || 'Oyuncu';
    _activateUser(displayName);
  }

  if(_pendingClickMx!==null){
    setTimeout(()=>{ window.handleClick(_pendingClickMx,_pendingClickMy); _pendingClickMx=_pendingClickMy=null; },200);
  }
}
document.getElementById('uname').addEventListener('keydown',e=>{if(e.key==='Enter')startGame();});
document.getElementById('auth-email').addEventListener('keydown',e=>{if(e.key==='Enter')startGame();});
document.getElementById('auth-password').addEventListener('keydown',e=>{if(e.key==='Enter')startGame();});
// ── Shift tuşu: canvas üzerinde fırça modu ipucu ──
document.addEventListener('keydown',e=>{if(e.key==='Shift'&&!panning&&!_brushActive)canvas.style.cursor='cell';});
document.addEventListener('keyup',e=>{if(e.key==='Shift'&&!_brushActive)canvas.style.cursor=_penMode?'cell':'crosshair';});

// Haritayı hemen başlat — login gerekmez (misafir olarak harita görünür,
// pixel basmak için Supabase Auth oturumu gerekir)
(async function initMapWithoutLogin(){
  document.getElementById('topbar').style.display='flex';
  document.getElementById('main').style.display='grid';

  // ── GÜVENLİK: Daha önce "kayıtlı kullanıcı adı" kontrolü localStorage'daki
  // basit bir 'pv_uname' anahtarına bakıyordu — bu, herkesin konsoldan
  // localStorage.setItem('pv_uname','BaşkasınınAdı') yazarak başka birinin
  // kimliğine bürünebilmesi anlamına geliyordu. Artık gerçek oturum durumu
  // Supabase Auth'tan (güvenli, sahteleştirilemeyen bir JWT token ile)
  // soruluyor: supabase.auth.getSession().
  const { data: { session } } = await supabase.auth.getSession();

  if(session && session.user){
    // Gerçek bir oturum var — otomatik giriş yap
    const displayName = session.user.user_metadata?.display_name || session.user.user_metadata?.full_name || session.user.email || 'Oyuncu';
    username=displayName;
    document.getElementById('ubadge').textContent='👤 '+username;
    document.getElementById('uname').value=displayName;
    (async()=>{
      await loadData(); updateSidebar();
      await initMapData();
      recalcAutoCenters();
      resizeCanvas();
      const afterLoad=()=>{
        buildOffscreens();
        startRealtimeSync();
        loadCD(); updateDots();
        loadProfile();
        loadXPFromSupabase().then(()=>{ updateXPUI(); renderLevelLeaderboard(); checkDailyStreak(); });
        // Otomatik girişte de startGame() ile aynı arayüz elemanlarını göster
        // (sohbet butonu, kenar panel butonu vb.) — normalde bunlar sadece
        // startGame() çağrıldığında görünür hale geliyordu, ama otomatik
        // giriş akışı startGame()'i hiç çağırmıyordu.
        // GÜVENLİK: adminbtn/ownerbtn artık körlemesine gösterilmiyor —
        // checkAdminStatus() sunucudan gerçek yetkiyi sorup ona göre gösteriyor.
        checkAdminStatus();
        document.getElementById('timelapse-btn').style.display='';
        document.getElementById('history-btn').style.display='';
        document.getElementById('mailbox-btn').style.display='';
        document.getElementById('chat-btn').style.display='flex';
        const _stBtn1=document.getElementById('sidebar-toggle');
        if(_stBtn1) _stBtn1.style.display='flex';
        if(typeof initSidebarToggle==='function') initSidebarToggle();
        if(typeof updateProfileBtn==='function') updateProfileBtn();
        if(typeof loadFactions==='function') loadFactions();
        if(typeof updateChatFactionTab==='function') updateChatFactionTab();
        if(typeof loadChat==='function') loadChat();
        if(typeof maybeShowTutorial==='function') setTimeout(maybeShowTutorial, 500);
        try{
          if(username){
            localStorage.setItem(CONFIG.storageKeys.profile + username,JSON.stringify(profileData));
          }
        }catch(e){}
      };
      if(mapImg.complete) afterLoad();
      else mapImg.onload=afterLoad;
    })();
  } else {
    // Misafir olarak haritayı göster
    document.getElementById('ubadge').textContent='👤 Misafir';
    (async()=>{
      await loadData(); updateSidebar();
      await initMapData();
      recalcAutoCenters();
      resizeCanvas();
      if(mapImg.complete) buildOffscreens();
      else mapImg.onload=()=>{ buildOffscreens(); };
    })();
  }

  // Oturum durumu değişirse (başka sekmede çıkış yapıldıysa vb.) arayüzü güncelle
  supabase.auth.onAuthStateChange((event, newSession) => {
    if(event === 'SIGNED_OUT'){
      username = '';
      document.getElementById('ubadge').textContent='👤 Misafir';
      // GÜVENLİK: çıkış yapınca admin/owner durumunu ve butonlarını da sıfırla
      _isAdmin = false; _isOwner = false; adminMode = false;
      document.getElementById('adminbtn').style.display='none';
      document.getElementById('ownerbtn').style.display='none';
    }
  });
})();
let _resizeDebounce=null;
window.addEventListener('resize',()=>{
  clearTimeout(_resizeDebounce);
  _resizeDebounce=setTimeout(()=>{resizeCanvas();if(baseCanvas)draw();},80);
});
setInterval(()=>{if(baseCanvas)updateSidebar();},5000);
// Seviye sıralamasını her dakika güncelle
setInterval(()=>{ if(typeof username!=='undefined'&&username) renderLevelLeaderboard(); },60000);

// ── ADMIN MODE (sadece oy pikseli silme aracı için) ──
// GÜVENLİK: Eski client-side şifre kontrolü (ADMIN_PASS='admin123') tamamen
// kaldırıldı — şifre sayfa kaynağında düz metin olarak duruyordu ve gerçek
// bir yetkilendirme sağlamıyordu (herkes view-source ile görebilir, ya da
// konsoldan adminMode=true yazıp admin moduna "girebilirdi"; gerçek silme
// işlemi zaten RLS tarafından engelleniyordu ama bu yine de yanıltıcıydı).
// Artık admin/owner durumu SADECE sunucudaki admin_users tablosundan,
// is_admin()/is_owner() RPC'leri üzerinden belirleniyor.
let adminMode=false;
let _isAdmin=false;
let _isOwner=false;

// Sayfa açılışında (oturum varsa) admin/owner durumunu sunucudan sor ve
// butonların görünürlüğünü ona göre ayarla. Şifre sormaya gerek yok —
// zaten admin/owner olan kişi giriş yapınca otomatik yetkili görünür.
async function checkAdminStatus(){
  if(!username) return;
  try{
    const [{data:isAdminData},{data:isOwnerData}] = await Promise.all([
      supabase.rpc('is_admin'),
      supabase.rpc('is_owner')
    ]);
    _isAdmin = isAdminData === true;
    _isOwner = isOwnerData === true;
    document.getElementById('adminbtn').style.display = _isAdmin ? '' : 'none';
    document.getElementById('ownerbtn').style.display = _isOwner ? '' : 'none';
  }catch(e){
    console.error('checkAdminStatus hatası:', e);
  }
}

function toggleAdmin(){
  if(!_isAdmin){
    showPopup(t('msg.no_admin'));
    return;
  }
  if(!adminMode){
    adminMode=true;
    document.getElementById('adminbtn').style.background='#16a34a';
    document.getElementById('adminbtn').textContent=t('topbar.admin_on');
    showPopup(t('msg.admin_mode_on'));
  } else {
    adminMode=false;
    document.getElementById('adminbtn').style.background='#dc2626';
    document.getElementById('adminbtn').textContent=t('topbar.admin');
    showPopup(t('msg.admin_mode_off'));
  }
}

// ── OWNER PANEL: admin ata / kaldır, mevcut yetkilileri listele ──
async function openOwnerPanel(){
  if(!_isOwner){
    showPopup(t('msg.no_owner'));
    return;
  }
  document.getElementById('owner-modal').style.display='flex';
  document.getElementById('owner-form-msg').textContent='';
  document.getElementById('owner-add-email').value='';
  await refreshOwnerAdminList();
}
function closeOwnerPanel(){
  document.getElementById('owner-modal').style.display='none';
}
async function refreshOwnerAdminList(){
  const listEl = document.getElementById('owner-admin-list');
  listEl.innerHTML = '<div style="font-size:.72rem;color:var(--muted);text-align:center;padding:.6rem 0;">Yükleniyor...</div>';
  try{
    const {data,error} = await supabase.rpc('list_admins');
    if(error || !data){
      listEl.innerHTML = '<div style="font-size:.72rem;color:var(--muted);text-align:center;padding:.6rem 0;">Yüklenemedi.</div>';
      return;
    }
    if(data.length===0){
      listEl.innerHTML = '<div style="font-size:.72rem;color:var(--muted);text-align:center;padding:.6rem 0;">Henüz kimse yok.</div>';
      return;
    }
    listEl.innerHTML = data.map(row=>{
      const safeName = _esc(row.display_name||'?');
      const roleColor = row.role==='owner' ? '#f5a623' : 'var(--accent)';
      const roleLabel = row.role==='owner' ? '👑 Owner' : '🛡 Admin';
      return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--surf2);border:1px solid var(--bdr);border-radius:8px;padding:.5rem .7rem;">
        <span style="font-size:.78rem;font-weight:600;">${safeName}</span>
        <span style="font-size:.62rem;font-weight:700;color:${roleColor};font-family:'Space Mono',monospace;">${roleLabel}</span>
      </div>`;
    }).join('');
  }catch(e){
    console.error('list_admins hatası:', e);
    listEl.innerHTML = '<div style="font-size:.72rem;color:var(--muted);text-align:center;padding:.6rem 0;">Yüklenemedi.</div>';
  }
}
async function ownerAssignRole(role){
  const emailEl = document.getElementById('owner-add-email');
  const msgEl = document.getElementById('owner-form-msg');
  const email = emailEl.value.trim();
  if(!email){ msgEl.style.color='#f04a4a'; msgEl.textContent='⚠ Email gerekli.'; return; }
  msgEl.style.color='var(--muted)'; msgEl.textContent='İşleniyor...';
  try{
    const {data,error} = await supabase.rpc('make_admin_by_email',{p_email:email,p_role:role});
    if(error || !data || data.success!==true){
      const errMsg = data && data.error==='user_not_found' ? 'Bu email ile kayıtlı kullanıcı bulunamadı.'
        : data && data.error==='not_owner' ? 'Bu işlem için owner yetkisi gerekli.'
        : 'İşlem başarısız.';
      msgEl.style.color='#f04a4a'; msgEl.textContent='⚠ '+errMsg;
      return;
    }
    msgEl.style.color='#00d4a0'; msgEl.textContent='✓ Yetki verildi: '+(role==='owner'?'Owner':'Admin');
    emailEl.value='';
    await refreshOwnerAdminList();
  }catch(e){
    console.error('make_admin_by_email hatası:', e);
    msgEl.style.color='#f04a4a'; msgEl.textContent='⚠ Bağlantı hatası.';
  }
}
async function ownerRevoke(){
  const emailEl = document.getElementById('owner-add-email');
  const msgEl = document.getElementById('owner-form-msg');
  const email = emailEl.value.trim();
  if(!email){ msgEl.style.color='#f04a4a'; msgEl.textContent='⚠ Email gerekli.'; return; }
  msgEl.style.color='var(--muted)'; msgEl.textContent='İşleniyor...';
  try{
    const {data,error} = await supabase.rpc('revoke_admin_by_email',{p_email:email});
    if(error || !data || data.success!==true){
      const errMsg = data && data.error==='cannot_revoke_self' ? 'Kendi owner yetkini kaldıramazsın.'
        : data && data.error==='user_not_found' ? 'Bu email ile kayıtlı kullanıcı bulunamadı.'
        : data && data.error==='not_owner' ? 'Bu işlem için owner yetkisi gerekli.'
        : 'İşlem başarısız.';
      msgEl.style.color='#f04a4a'; msgEl.textContent='⚠ '+errMsg;
      return;
    }
    msgEl.style.color='#00d4a0'; msgEl.textContent='✓ Yetki kaldırıldı.';
    emailEl.value='';
    await refreshOwnerAdminList();
  }catch(e){
    console.error('revoke_admin_by_email hatası:', e);
    msgEl.style.color='#f04a4a'; msgEl.textContent='⚠ Bağlantı hatası.';
  }
}

// Admin modundayken normal oy tıklamasını engelle (piksel silme ayrı bir
// mousedown dinleyicisiyle ele alınıyor — burada sadece oy verilmesini önlüyoruz).
const _ohc=handleClick;
window.handleClick=function(mx,my){
  if(!adminMode){_ohc(mx,my);return;}
};
// Giriş yapınca admin/owner durumunu sunucudan kontrol et (buton görünürlüğü buna bağlı)
const _osg=startGame;
window.startGame=async function(){
  _osg();
  document.getElementById('timelapse-btn').style.display='';
  document.getElementById('history-btn').style.display='';
  document.getElementById('mailbox-btn').style.display='';
  await checkAdminStatus();
};

// ── PAINT MODE (sadece oy pikseli silme) ──
let isPainting=false;

// GÜVENLİK + GERÇEK SİLME: Daha önce bu fonksiyon SADECE local pixData'dan
// çıkarıp saveData() çağırıyordu; saveData() ise yalnızca KALAN satırları
// upsert ediyordu, silineni sunucudan hiç DELETE etmiyordu. Üstelik pixels
// tablosunda RLS açık olduğu ve client'tan doğrudan upsert/delete için
// politika tanımlı olmadığı için bu yazma zaten sessizce reddediliyordu.
// Artık gerçek silme, admin yetkisini sunucu tarafında is_admin() ile
// doğrulayan admin_delete_pixels() RPC'si üzerinden yapılıyor. Sürükleyerek
// hızlı silinen pikseller bir kuyrukta birikip kısa bir debounce sonunda
// TEK istekte sunucuya gönderiliyor (her piksel için ayrı RPC atmamak için).
let _pendingDeleteFlats = new Set();
let _deleteDebounceTimer = null;

function paintPixel(mx,my){
  if(!_isAdmin){ showPopup(t('msg.no_admin')); return; }
  const flat=canvasToFlat(mx,my);
  if(flat<0||flat>=IMG_W*IMG_H) return;
  if(!FLAT_TO_PROV) return;
  const px=flat%IMG_W, py=Math.floor(flat/IMG_W);
  // Find which province owns this flat pixel and remove votes at this exact pixel
  const pi=FLAT_TO_PROV[flat];
  if(pi<0) return;
  const pid=PROV_IDS[pi];
  if(!pixData[pid]) return;
  const before=pixData[pid].length;
  pixData[pid]=pixData[pid].filter(v=>v.flat!==flat);
  if(pixData[pid].length!==before){
    // Optimistic: ekranda anında temizle, sunucuya gönderilecek kuyruğa ekle
    _pendingDeleteFlats.add(flat);
    scheduleServerDelete();
    const pctx=pixelCanvas.getContext('2d');
    pctx.clearRect(px,py,1,1);
    draw();
  }
}

function scheduleServerDelete(){
  clearTimeout(_deleteDebounceTimer);
  _deleteDebounceTimer = setTimeout(flushServerDelete, 500);
}

async function flushServerDelete(){
  if(_pendingDeleteFlats.size===0) return;
  const flats = Array.from(_pendingDeleteFlats);
  _pendingDeleteFlats.clear();
  try{
    const {data,error} = await supabase.rpc('admin_delete_pixels',{p_flats:flats});
    if(error || !data || data.success!==true){
      console.error('admin_delete_pixels hatası:', error || data);
      showPopup(t('msg.delete_failed'));
      // Not: local canvas zaten temizlendi ama sunucu reddettiyse tutarsızlık
      // oluşabilir — bir sonraki realtime/loadData senkronizasyonunda düzelir.
      return;
    }
    showPopup(t('msg.deleted_n', {n: data.deleted}));
  }catch(e){
    console.error('admin_delete_pixels exception:', e);
    showPopup(t('msg.delete_conn_error'));
  }
}

// ── İl için en "derin" iç noktayı bulur (sınırdan en uzak piksel —
// "pole of inaccessibility" yaklaşımı). Basit centroid yerine bu
// kullanılır, çünkü centroid; tırnaklı/girintili (concave) il
// şekillerinde (örn. Bilecik, Osmaniye) kolayca komşu ile veya sınır
// şeridine denk gelebilir. Etiket/merkez bu noktaya konursa, il ne
// kadar küçük/eğri olursa olsun her zaman kendi GERÇEK iç alanında
// kalır. PROV_PIXELS halihazırda WHITE_SET'i dışladığı için burada
// ekstra sınır kontrolüne gerek yok. ──
function findInteriorAnchor(pid){
  const pixels=PROV_PIXELS[pid];
  if(!pixels||!pixels.length) return null;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,sx=0,sy=0;
  for(const f of pixels){
    const x=f%IMG_W,y=Math.floor(f/IMG_W);
    if(x<minX)minX=x; if(x>maxX)maxX=x;
    if(y<minY)minY=y; if(y>maxY)maxY=y;
    sx+=x; sy+=y;
  }
  const cx=sx/pixels.length, cy=sy/pixels.length;
  const w=maxX-minX+1, h=maxY-minY+1;
  // Performans güvenliği: bbox aşırı büyük/seyrekse (örn. çok parçalı
  // ada+anakara birleşimi) tam mesafe dönüşümü yerine centroid'e en
  // yakın geçerli piksele düş.
  if(w*h>3000000){
    let best=null,bestD=Infinity;
    for(const f of pixels){
      const x=f%IMG_W,y=Math.floor(f/IMG_W);
      const d=(x-cx)*(x-cx)+(y-cy)*(y-cy);
      if(d<bestD){bestD=d;best=f;}
    }
    return best!=null?[best%IMG_W,Math.floor(best/IMG_W)]:null;
  }
  const own=new Uint8Array(w*h);
  for(const f of pixels){
    const x=(f%IMG_W)-minX, y=Math.floor(f/IMG_W)-minY;
    own[y*w+x]=1;
  }
  // Sınıra bitişik (veya bbox kenarındaki) hücrelerden başlayan çok-
  // kaynaklı BFS ile her hücrenin "kendi ilinin dışındaki en yakın
  // hücreye" mesafesini hesapla (basit bir mesafe dönüşümü).
  const dist=new Int32Array(w*h).fill(-1);
  const queue=[];
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x;
      if(!own[i]) continue;
      const isEdge = x===0||y===0||x===w-1||y===h-1 ||
        !own[i-1]||!own[i+1]||!own[i-w]||!own[i+w];
      if(isEdge){dist[i]=0;queue.push(i);}
    }
  }
  let qi=0,bestI=queue.length?queue[0]:-1,bestDist=0,bestCDist=Infinity;
  const lcx=cx-minX, lcy=cy-minY;
  while(qi<queue.length){
    const i=queue[qi++];
    const d=dist[i];
    const x=i%w,y=Math.floor(i/w);
    const cDist=(x-lcx)*(x-lcx)+(y-lcy)*(y-lcy);
    if(d>bestDist || (d===bestDist&&cDist<bestCDist)){bestDist=d;bestI=i;bestCDist=cDist;}
    if(x>0&&own[i-1]&&dist[i-1]===-1){dist[i-1]=d+1;queue.push(i-1);}
    if(x<w-1&&own[i+1]&&dist[i+1]===-1){dist[i+1]=d+1;queue.push(i+1);}
    if(y>0&&own[i-w]&&dist[i-w]===-1){dist[i-w]=d+1;queue.push(i-w);}
    if(y<h-1&&own[i+w]&&dist[i+w]===-1){dist[i+w]=d+1;queue.push(i+w);}
  }
  if(bestI<0) return null;
  const bx=bestI%w, by=Math.floor(bestI/w);
  return [minX+bx, minY+by];
}

// ── Tüm illerin etiket/merkez noktasını findInteriorAnchor ile hesaplar. ──
function recalcAutoCenters(){
  PROV_IDS.forEach(pid=>{
    const anchor=findInteriorAnchor(pid);
    if(anchor) PROV_CENTERS[pid]=anchor;
  });
  if(typeof buildLabels==='function' && typeof labelEls!=='undefined') buildLabels();
}

// Sidebar genişliği artık tek kaynaktan (CSS --sidebar-w) okunur, hard-code
// edilmez. Böylece tablet media query'si CSS'te --sidebar-w'yi değiştirdiğinde
// JS tarafı (sidebar-toggle butonunun "right" konumu gibi) otomatik senkron kalır.
function getSidebarW(){
  const v = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 290;
}
function isMobile(){ return window.innerWidth<=768 && _isTouchCapableDevice(); }

function toggleSidebar(){
  const sidebar=document.getElementById('sidebar');
  const btn=document.getElementById('sidebar-toggle');
  const pt=document.getElementById('ptoolbar');
  if(!sidebar||!btn) return; // sidebar kaldırıldı — bu özellik artık yok
  if(isMobile()){
    const open=sidebar.classList.toggle('mobile-open');
    btn.textContent=open?'▼':'▲';
    if(open && typeof renderProfileStats==='function') renderProfileStats();
    // Drawer açıkken arka plana tıklayınca kapat
    if(open){
      const overlay=document.createElement('div');
      overlay.id='mob-sidebar-overlay';
      overlay.style.cssText='position:fixed;inset:0;z-index:59;background:rgba(0,0,0,.45);';
      overlay.addEventListener('click',()=>{ sidebar.classList.remove('mobile-open'); overlay.remove(); btn.textContent='▲'; });
      document.body.appendChild(overlay);
    } else {
      const ov=document.getElementById('mob-sidebar-overlay');
      if(ov) ov.remove();
    }
  } else {
    const hidden=sidebar.classList.toggle('hidden');
    btn.textContent=hidden?'❮':'❯';
    btn.style.right=hidden?'0':getSidebarW()+'px';
    if(hidden) pt.classList.add('sidebar-gone');
    else pt.classList.remove('sidebar-gone');
  }
}
function initSidebarToggle(){
  const btn=document.getElementById('sidebar-toggle');
  if(!btn) return; // sidebar kaldırıldı — bu özellik artık yok
  if(isMobile()){
    btn.textContent='▲';
    btn.style.right='';
    btn.style.transform='';
  } else {
    btn.style.right=getSidebarW()+'px';
    btn.textContent='❯';
  }
}

// Ekran yeniden boyutlandırılınca sidebar durumunu düzelt
window.addEventListener('resize',()=>{
  const sidebar=document.getElementById('sidebar');
  const btn=document.getElementById('sidebar-toggle');
  if(!sidebar||!btn) return; // sidebar kaldırıldı — bu özellik artık yok
  const ov=document.getElementById('mob-sidebar-overlay');
  if(!isMobile()){
    sidebar.classList.remove('mobile-open');
    if(ov) ov.remove();
    if(!sidebar.classList.contains('hidden')){
      btn.style.right=getSidebarW()+'px';
      btn.textContent='❯';
    }
  } else {
    btn.style.right='';
    btn.textContent=sidebar.classList.contains('mobile-open')?'▼':'▲';
  }
});

// ── PALETTE TOGGLE ──
let paletteOpen=false;
function togglePalette(){
  paletteOpen=!paletteOpen;
  document.getElementById('ptoolbar').classList.toggle('expanded',paletteOpen);
}
// Override selP to update palette-toggle color and close palette
const _origSelP=window.selP||function(){};
function selP(i){
  selParty=i;
  document.querySelectorAll('.psw').forEach((s,j)=>s.classList.toggle('sel',j===i));
  const col=PARTIES[i].color;
  document.getElementById('palette-toggle').style.background=col;
  const preview=document.getElementById('hover-preview');
  if(preview&&preview.style.display!=='none'){
    preview.style.background=col+'cc';
    preview.style.borderColor='rgba(255,255,255,0.9)';
  }
  // Close palette after picking
  paletteOpen=false;
  document.getElementById('ptoolbar').classList.remove('expanded');
  // Faction güncelle
  const fDot=document.getElementById('pb-faction-dot');
  const fName=document.getElementById('pb-faction-name');
  if(fDot&&fName){
    fDot.style.background=col;
    fDot.style.border=col==='#ffffff'?'1px solid #555':'none';
    fName.textContent=PARTIES[i].name;
    fName.style.color=col==='#ffffff'?'#aaa':col;
  }
}
// Close palette on outside click
document.addEventListener('click',e=>{
  const pt=document.getElementById('ptoolbar');
  if(pt&&!pt.contains(e.target)&&paletteOpen){
    paletteOpen=false;
    pt.classList.remove('expanded');
  }
});
