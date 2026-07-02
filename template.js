/* ══════════════════════════════════════════════════════════
   ŞABLON ARACI — oyun haritasıyla TAM senkron piksel-grid sistemi
   Mantık: Harita IMG_W×IMG_H boyutunda flat-indexli grid kullanıyor.
   Şablon da AYNI flat-index sistemini kullanan _tplBitmap'e piksel basar.
   Yeni editör: kendi bağımsız canvas'ında render eder, bitince haritaya
   overlay olarak yazar (eski _tplRenderOverlay() zinciriyle).
══════════════════════════════════════════════════════════ */

/* ── STATE ── */
let _tplActive = false, _tplTool = 'brush', _tplLastBlob = null;
let _tplDrawingNow = false, _tplLastFlat = -1;

/* ── EDITOR-INTERNAL STATE ── */
let _editorZoom = 4;       // current zoom level (pixels per grid cell)
let _editorOffX = 0;       // pan offset x (canvas pixels)
let _editorOffY = 0;       // pan offset y (canvas pixels)
let _editorPanning = false;
let _editorPanStartX = 0, _editorPanStartY = 0;
let _editorPanOffX = 0, _editorPanOffY = 0;
let _editorLineStart = null; // for line tool
let _editorRectStart = null; // for rect tool
let _editorGridVisible = false;
let _editorW = 100, _editorH = 100; // grid dimensions (set from IMG_W/IMG_H)
let _editorPreviewDirty = true;

/* ── PALETTE (oyunla aynı) ── */
const TPL_PALETTE = [
  {c:'#ffffff',n:'Beyaz'},{c:'#e4e4e4',n:'Açık Gri'},{c:'#c4c4c4',n:'Gri'},
  {c:'#888888',n:'Koyu Gri'},{c:'#4e4e4e',n:'Çok Koyu Gri'},{c:'#000000',n:'Siyah'},
  {c:'#f4b3ae',n:'Açık Pembe'},{c:'#ffa7d1',n:'Pembe'},{c:'#ff54b2',n:'Fuşya'},
  {c:'#ff6565',n:'Açık Kırmızı'},{c:'#e50000',n:'Kırmızı'},{c:'#9a0000',n:'Koyu Kırmızı'},
  {c:'#fea460',n:'Şeftali'},{c:'#e59500',n:'Turuncu'},{c:'#a06a42',n:'Kahverengi'},
  {c:'#604028',n:'Koyu Kahverengi'},{c:'#f5dfb0',n:'Krem'},{c:'#fff889',n:'Açık Sarı'},
  {c:'#e5d900',n:'Sarı'},{c:'#94e044',n:'Açık Yeşil'},{c:'#02be01',n:'Yeşil'},
  {c:'#688338',n:'Çimen'},{c:'#006513',n:'Koyu Yeşil'},{c:'#cae3ff',n:'Açık Mavi'},
  {c:'#00d3dd',n:'Cyan'},{c:'#0083c7',n:'Mavi'},{c:'#0000ea',n:'Parlak Mavi'},
  {c:'#191973',n:'Lacivert'},{c:'#cf6ee4',n:'Lila'},{c:'#820080',n:'Mor'}
];
let _tplColor = TPL_PALETTE[10].c;

/* ── DATA ── */
let _tplData = new Map();      // flat-index → hex color
let _tplBitmap = null;
let _tplBitmapCtx = null;

/* ── UNDO/REDO ── */
const TPL_UNDO_LIMIT = 50;
let _tplUndoStack = [], _tplRedoStack = [];
let _tplStrokeActive = false;

/* ── MIRROR ── */
let _tplMirrorX = false, _tplMirrorY = false;

/* ── BRUSH ── */
let _tplBrushSize = 1;
let _tplOpacity   = 1.0;
let _tplRightClickErase = true;
let _tplRightClickDown  = false;

/* ══════════════════════════════════════════════════════════
   OPEN / CLOSE
══════════════════════════════════════════════════════════ */
function openTemplateEditor() {
  if (!username) { showPopup('Şablon aracı için giriş yapman gerekiyor.'); return; }
  if (_tplActive) return;
  if (typeof IMG_W === 'undefined' || !canvas) { showPopup('Harita henüz yüklenmedi.'); return; }

  _tplActive = true;
  _editorW = IMG_W;
  _editorH = IMG_H;

  _tplUndoStack = [];
  _tplRedoStack = [];
  _tplStrokeActive = false;
  _tplUpdateUndoButtons();

  /* Offscreen bitmap (harita grid çözünürlüğünde) */
  if (!_tplBitmap) {
    _tplBitmap = document.createElement('canvas');
    _tplBitmap.width = IMG_W;
    _tplBitmap.height = IMG_H;
    _tplBitmapCtx = _tplBitmap.getContext('2d');
    _tplBitmapCtx.imageSmoothingEnabled = false;
  }

  /* Modal aç */
  document.getElementById('tpl-editor-modal').classList.add('active');

  /* Editor canvas'ını hazırla */
  _editorInitCanvas();

  /* Palette oluştur */
  _editorBuildPalette();
  _editorSelectColor(_tplColor, false);

  /* Mevcut _tplData varsa geri yükle */
  _editorSyncFromBitmap();

  /* Boyut bilgisi */
  document.getElementById('tpl-stat-size').textContent = IMG_W + '×' + IMG_H;

  /* Mirror checkbox sync */
  document.getElementById('tpl-mirrorx-check').checked = _tplMirrorX;
  document.getElementById('tpl-mirrory-check').checked = _tplMirrorY;
  document.getElementById('tpl-rclick-check').checked = _tplRightClickErase;

  /* İlk render */
  _editorRender();
  _editorUpdateNavPreview();

  /* Esc tuşu */
  document.addEventListener('keydown', _tplKeyboardHandler);
}

function closeTemplateEditor() {
  if (!_tplActive) return;
  _tplActive = false;
  _tplDrawingNow = false;
  _tplRightClickDown = false;
  _tplLastFlat = -1;
  _editorPanning = false;
  _tplMirrorX = false;
  _tplMirrorY = false;
  _editorLineStart = null;
  _editorRectStart = null;

  document.getElementById('tpl-editor-modal').classList.remove('active');
  document.removeEventListener('keydown', _tplKeyboardHandler);

  /* Harita overlay canvas'ını senkronla (haritada görünmesi için) */
  const tc = document.getElementById('template-canvas');
  if (tc && canvas) {
    tc.width = canvas.width;
    tc.height = canvas.height;
  }
  if (typeof _tplRenderOverlay === 'function') _tplRenderOverlay();
}

/* ══════════════════════════════════════════════════════════
   EDITOR CANVAS SETUP
══════════════════════════════════════════════════════════ */
function _editorInitCanvas() {
  const area = document.getElementById('tpl-canvas-area');
  const dc = document.getElementById('tpl-draw-canvas');
  const gc = document.getElementById('tpl-grid-overlay');
  const wrap = document.getElementById('tpl-canvas-wrap');

  /* Auto-fit zoom */
  const areaW = area.clientWidth - 40;
  const areaH = area.clientHeight - 60;
  const fitX = Math.floor(areaW / _editorW);
  const fitY = Math.floor(areaH / _editorH);
  _editorZoom = Math.max(1, Math.min(16, Math.min(fitX, fitY)));

  const cw = _editorW * _editorZoom;
  const ch = _editorH * _editorZoom;

  dc.width = cw; dc.height = ch;
  gc.width = cw; gc.height = ch;

  wrap.style.width = cw + 'px';
  wrap.style.height = ch + 'px';
  document.getElementById('tpl-checkerboard').style.width = cw + 'px';
  document.getElementById('tpl-checkerboard').style.height = ch + 'px';

  _editorOffX = 0; _editorOffY = 0;
  _editorUpdateZoomLabel();
  _editorAttachEvents();

  /* Grid overlay */
  if (_editorGridVisible) _editorDrawGrid();
  else gc.getContext('2d').clearRect(0, 0, gc.width, gc.height);
}

/* ══════════════════════════════════════════════════════════
   RENDER
══════════════════════════════════════════════════════════ */
function _editorRender() {
  const dc = document.getElementById('tpl-draw-canvas');
  if (!dc) return;
  const ctx = dc.getContext('2d');
  ctx.clearRect(0, 0, dc.width, dc.height);
  ctx.imageSmoothingEnabled = false;

  if (_tplBitmap) {
    ctx.drawImage(_tplBitmap, 0, 0, _editorW * _editorZoom, _editorH * _editorZoom);
  }

  /* Grid */
  if (_editorGridVisible) _editorDrawGrid();

  _editorUpdateNavPreview();
  _editorUpdateStats();
}

function _editorDrawGrid() {
  const gc = document.getElementById('tpl-grid-overlay');
  if (!gc) return;
  const ctx = gc.getContext('2d');
  ctx.clearRect(0, 0, gc.width, gc.height);
  if (_editorZoom < 3) return; // too small to show grid

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  const z = _editorZoom;
  for (let x = 0; x <= _editorW; x++) {
    ctx.beginPath(); ctx.moveTo(x*z+.5, 0); ctx.lineTo(x*z+.5, gc.height); ctx.stroke();
  }
  for (let y = 0; y <= _editorH; y++) {
    ctx.beginPath(); ctx.moveTo(0, y*z+.5); ctx.lineTo(gc.width, y*z+.5); ctx.stroke();
  }
  document.getElementById('tpl-grid-overlay').classList.toggle('visible', _editorGridVisible);
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION PREVIEW
══════════════════════════════════════════════════════════ */
function _editorUpdateNavPreview() {
  const nc = document.getElementById('tpl-nav-canvas');
  if (!nc || !_tplBitmap) return;
  const wrap = document.getElementById('tpl-nav-preview-wrap');
  const pw = wrap.clientWidth || 188;
  nc.width = pw; nc.height = pw;
  const ctx = nc.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, pw, pw);
  ctx.drawImage(_tplBitmap, 0, 0, pw, pw);

  /* Layer thumb */
  const lt = document.getElementById('tpl-layer-thumb-1');
  if (lt) {
    const ltx = lt.getContext('2d');
    ltx.imageSmoothingEnabled = false;
    ltx.clearRect(0, 0, 24, 24);
    ltx.drawImage(_tplBitmap, 0, 0, 24, 24);
  }
}

/* ══════════════════════════════════════════════════════════
   STATS
══════════════════════════════════════════════════════════ */
function _editorUpdateStats() {
  const ps = document.getElementById('tpl-stat-pixels');
  const zs = document.getElementById('tpl-stat-zoom');
  if (ps) ps.textContent = _tplData.size;
  if (zs) zs.textContent = _editorZoom + '×';
}

/* ══════════════════════════════════════════════════════════
   ZOOM
══════════════════════════════════════════════════════════ */
function tplZoomIn() {
  /* DÜZELTME: eski formül "Math.floor(800 / min(W,H))" büyük bölge/harita
     boyutlarında (örn. 1036×917) 0'a yuvarlanıp zoom'u 1×'te tamamen
     kilitliyordu. Boyuttan bağımsız sabit, makul bir üst sınır kullanıyoruz. */
  const MAX_ZOOM = 32;
  _editorZoom = Math.min(MAX_ZOOM, _editorZoom + (_editorZoom < 4 ? 1 : _editorZoom < 8 ? 2 : 4));
  _editorResizeCanvasKeepCenter();
  _editorUpdateZoomLabel();
  _editorRender();
}
function tplZoomOut() {
  _editorZoom = Math.max(1, _editorZoom - (_editorZoom <= 4 ? 1 : _editorZoom <= 8 ? 2 : 4));
  _editorResizeCanvasKeepCenter();
  _editorUpdateZoomLabel();
  _editorRender();
}
/* Zoom değişiminde, bakılan noktayı (alan ortasını) sabit tutarak
   kaydırma konumunu yeniden hesaplar — aksi halde her zoom'da görünüm
   sol-üst köşeye sıçrar. */
function _editorResizeCanvasKeepCenter() {
  const area = document.getElementById('tpl-canvas-area');
  const wrap = document.getElementById('tpl-canvas-wrap');
  let cx = 0.5, cy = 0.5;
  if (area && wrap && wrap.offsetWidth > 0 && wrap.offsetHeight > 0) {
    cx = (area.scrollLeft + area.clientWidth / 2) / wrap.offsetWidth;
    cy = (area.scrollTop + area.clientHeight / 2) / wrap.offsetHeight;
  }
  _editorResizeCanvas();
  if (area && wrap) {
    area.scrollLeft = cx * wrap.offsetWidth - area.clientWidth / 2;
    area.scrollTop  = cy * wrap.offsetHeight - area.clientHeight / 2;
  }
}
function _editorResizeCanvas() {
  const dc = document.getElementById('tpl-draw-canvas');
  const gc = document.getElementById('tpl-grid-overlay');
  const wrap = document.getElementById('tpl-canvas-wrap');
  const cw = _editorW * _editorZoom;
  const ch = _editorH * _editorZoom;
  dc.width = cw; dc.height = ch;
  gc.width = cw; gc.height = ch;
  wrap.style.width = cw + 'px';
  wrap.style.height = ch + 'px';
  document.getElementById('tpl-checkerboard').style.width = cw + 'px';
  document.getElementById('tpl-checkerboard').style.height = ch + 'px';
}
function _editorUpdateZoomLabel() {
  document.getElementById('tpl-zoom-label').textContent = _editorZoom + '×';
  const ss = document.getElementById('tpl-stat-zoom');
  if (ss) ss.textContent = _editorZoom + '×';
}

/* ══════════════════════════════════════════════════════════
   PALETTE
══════════════════════════════════════════════════════════ */
function _editorBuildPalette() {
  const grid = document.getElementById('tpl-palette-grid');
  if (!grid) return;
  grid.innerHTML = '';
  TPL_PALETTE.forEach(({c, n}) => {
    const sw = document.createElement('div');
    sw.className = 'tpl-psw';
    sw.style.background = c;
    sw.title = n + '\n' + c;
    sw.dataset.color = c;
    sw.onclick = () => _editorSelectColor(c, true);
    grid.appendChild(sw);
  });
}

function _editorSelectColor(hex, updateTool) {
  _tplColor = hex;
  /* active color swatch (left panel) */
  const sw = document.getElementById('tpl-active-color-swatch');
  if (sw) sw.style.background = hex;
  /* palette selection ring */
  document.querySelectorAll('.tpl-psw').forEach(el => {
    el.classList.toggle('sel', el.dataset.color === hex);
  });
  /* brush info */
  const bi = document.getElementById('tpl-brush-info-color');
  if (bi) { bi.textContent = hex; bi.style.color = hex; }
  tplUpdateBrushPreview();

  if (updateTool && _tplTool !== 'brush') tplEditorSetTool('brush');
}

function tplOpenColorPicker() {
  /* Palette popout yoksa paleti göster */
  const grid = document.getElementById('tpl-palette-grid');
  if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ══════════════════════════════════════════════════════════
   TOOL SELECTION
══════════════════════════════════════════════════════════ */
const TPL_TOOL_LABELS = {
  brush: 'PİKSEL', eraser: 'SİLGİ', fill: 'DOLDUR',
  line: 'ÇİZGİ', rect: 'DİKDÖRTGEN', rectfill: 'DOLU',
  picker: 'DAMLALIK'
};

function tplEditorSetTool(t) {
  _tplTool = t;
  document.querySelectorAll('.tpl-tool').forEach(el => el.classList.remove('active'));
  const btn = document.getElementById('tplb-' + t);
  if (btn) btn.classList.add('active');
  const lbl = document.getElementById('tpl-current-tool-label');
  if (lbl) lbl.textContent = TPL_TOOL_LABELS[t] || t.toUpperCase();
  _editorLineStart = null;
  _editorRectStart = null;

  /* cursor */
  const dc = document.getElementById('tpl-draw-canvas');
  if (dc) {
    dc.style.cursor = t === 'picker' ? 'crosshair' :
                      t === 'fill'   ? 'cell' :
                      t === 'eraser' ? 'cell' : 'crosshair';
  }
}

/* ══════════════════════════════════════════════════════════
   BRUSH PREVIEW
══════════════════════════════════════════════════════════ */
function tplUpdateBrushPreview() {
  const dot = document.getElementById('tpl-brush-preview-dot');
  if (!dot) return;
  const sz = Math.min(28, _tplBrushSize * 5 + 3);
  dot.style.width = sz + 'px';
  dot.style.height = sz + 'px';
  dot.style.background = _tplColor;
  dot.style.opacity = _tplOpacity;
  dot.style.borderRadius = '1px';
  const bi = document.getElementById('tpl-brush-info-size');
  const bo = document.getElementById('tpl-brush-info-opacity');
  if (bi) bi.textContent = t('tpl.size_label') + ': ' + _tplBrushSize + 'px';
  if (bo) bo.textContent = t('tpl.opacity_label') + ': ' + Math.round(_tplOpacity * 100) + '%';
}

/* ══════════════════════════════════════════════════════════
   GRID TOGGLE
══════════════════════════════════════════════════════════ */
function tplToggleGrid() {
  _editorGridVisible = !_editorGridVisible;
  _editorRender();
  if (!_editorGridVisible) {
    const gc = document.getElementById('tpl-grid-overlay');
    if (gc) gc.getContext('2d').clearRect(0, 0, gc.width, gc.height);
    document.getElementById('tpl-grid-overlay').classList.remove('visible');
  }
}

/* ══════════════════════════════════════════════════════════
   SECTION COLLAPSE
══════════════════════════════════════════════════════════ */
function tplToggleSection(id) {
  const body = document.getElementById('tpl-section-' + id);
  const arrow = document.getElementById('tpl-' + id + '-arrow');
  if (!body) return;
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  if (arrow) arrow.classList.toggle('open', hidden);
}

/* ══════════════════════════════════════════════════════════
   COORDS HELPER
══════════════════════════════════════════════════════════ */
function _editorEventToGrid(e) {
  const dc = document.getElementById('tpl-draw-canvas');
  if (!dc) return [-1, -1];
  const r = dc.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / _editorZoom);
  const y = Math.floor((e.clientY - r.top) / _editorZoom);
  return [x, y];
}
function _editorXYToFlat(x, y) {
  if (x < 0 || x >= _editorW || y < 0 || y >= _editorH) return -1;
  return x + y * _editorW;
}

/* ══════════════════════════════════════════════════════════
   DRAWING PRIMITIVES (operate on _tplBitmap + _tplData)
══════════════════════════════════════════════════════════ */
function _tplColorWithOpacity(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function _tplBrushOffsets(size) {
  const half = Math.floor(size / 2);
  const offsets = [];
  for (let dx = -half; dx <= half; dx++)
    for (let dy = -half; dy <= half; dy++)
      offsets.push([dx, dy]);
  return offsets;
}

function _tplMirrorFlats(flat) {
  const x = flat % _editorW, y = Math.floor(flat / _editorW);
  const pts = [[x, y]];
  if (_tplMirrorX) pts.push([_editorW - 1 - x, y]);
  if (_tplMirrorY) pts.push([x, _editorH - 1 - y]);
  if (_tplMirrorX && _tplMirrorY) pts.push([_editorW - 1 - x, _editorH - 1 - y]);
  return pts.map(([px, py]) => px + py * _editorW);
}

function _tplPaintAt(flat, forceErase) {
  if (flat < 0) return;
  if (!_tplStrokeActive) { _tplStrokeActive = true; _tplPushUndo(); }
  const erasing = forceErase || _tplTool === 'eraser';
  const fillColor = _tplColorWithOpacity(_tplColor, _tplOpacity);
  const offsets = _tplBrushOffsets(_tplBrushSize);
  const cix = flat % _editorW, ciy = Math.floor(flat / _editorW);
  for (const [dx, dy] of offsets) {
    const bx = cix + dx, by = ciy + dy;
    if (bx < 0 || bx >= _editorW || by < 0 || by >= _editorH) continue;
    const baseFlat = bx + by * _editorW;
    const targets = _tplMirrorFlats(baseFlat);
    for (const f of targets) {
      if (f < 0 || f >= _editorW * _editorH) continue;
      const ix = f % _editorW, iy = Math.floor(f / _editorW);
      if (erasing) {
        _tplData.delete(f);
        _tplBitmapCtx.clearRect(ix, iy, 1, 1);
      } else {
        _tplData.set(f, fillColor);
        _tplBitmapCtx.clearRect(ix, iy, 1, 1);
        _tplBitmapCtx.fillStyle = fillColor;
        _tplBitmapCtx.fillRect(ix, iy, 1, 1);
      }
    }
  }
}

function _tplPaintLine(fromFlat, toFlat, forceErase) {
  if (toFlat < 0) return;
  if (fromFlat < 0 || fromFlat === toFlat) { _tplPaintAt(toFlat, forceErase); return; }
  let x0 = fromFlat % _editorW, y0 = Math.floor(fromFlat / _editorW);
  const x1 = toFlat % _editorW, y1 = Math.floor(toFlat / _editorW);
  const dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
  const sx = x1 >= x0 ? 1 : -1, sy = y1 >= y0 ? 1 : -1;
  let err = dx - dy, steps = 0;
  const maxSteps = _editorW + _editorH;
  while (true) {
    _tplPaintAt(y0 * _editorW + x0, forceErase);
    if (x0 === x1 && y0 === y1) break;
    if (++steps > maxSteps) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
}

/* Rectangle outline */
function _tplPaintRect(x0, y0, x1, y1, filled) {
  _tplPushUndo();
  const mx = Math.min(x0, x1), MX = Math.max(x0, x1);
  const my = Math.min(y0, y1), MY = Math.max(y0, y1);
  const fillColor = _tplColorWithOpacity(_tplColor, _tplOpacity);
  for (let x = mx; x <= MX; x++) {
    for (let y = my; y <= MY; y++) {
      if (filled || x === mx || x === MX || y === my || y === MY) {
        const flat = x + y * _editorW;
        if (flat < 0 || flat >= _editorW * _editorH) continue;
        _tplData.set(flat, fillColor);
        _tplBitmapCtx.clearRect(x, y, 1, 1);
        _tplBitmapCtx.fillStyle = fillColor;
        _tplBitmapCtx.fillRect(x, y, 1, 1);
      }
    }
  }
}

/* ── Flood fill (bucket) ── */
let _tplFillVisited = null, _tplFillStack = null;
function _tplFloodFillFrom(startFlat, fillColor) {
  if (startFlat < 0 || startFlat >= _editorW * _editorH) return;
  const targetColor = _tplData.get(startFlat) ?? null;
  if (targetColor === fillColor) return;
  const total = _editorW * _editorH;
  if (!_tplFillVisited || _tplFillVisited.length !== total) {
    _tplFillVisited = new Uint8Array(total);
    _tplFillStack   = new Int32Array(total);
  } else { _tplFillVisited.fill(0); }
  const v = _tplFillVisited, st = _tplFillStack;
  const sameAsTarget = f => (_tplData.get(f) ?? null) === targetColor;
  let sp = 0;
  st[sp++] = startFlat; v[startFlat] = 1;
  while (sp > 0) {
    const f = st[--sp];
    const ix = f % _editorW, iy = Math.floor(f / _editorW);
    if (fillColor === null) { _tplData.delete(f); _tplBitmapCtx.clearRect(ix, iy, 1, 1); }
    else {
      _tplData.set(f, fillColor);
      _tplBitmapCtx.clearRect(ix, iy, 1, 1);
      _tplBitmapCtx.fillStyle = fillColor;
      _tplBitmapCtx.fillRect(ix, iy, 1, 1);
    }
    if (ix > 0)          { const n=f-1;        if(!v[n]&&sameAsTarget(n)){v[n]=1;st[sp++]=n;} }
    if (ix < _editorW-1) { const n=f+1;        if(!v[n]&&sameAsTarget(n)){v[n]=1;st[sp++]=n;} }
    if (iy > 0)          { const n=f-_editorW; if(!v[n]&&sameAsTarget(n)){v[n]=1;st[sp++]=n;} }
    if (iy < _editorH-1) { const n=f+_editorW; if(!v[n]&&sameAsTarget(n)){v[n]=1;st[sp++]=n;} }
  }
}

/* ── Eyedropper ── */
function _tplPickColor(flat) {
  if (flat < 0) return;
  const c = _tplData.get(flat);
  if (!c) return;
  /* rgba → hex */
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return;
  const hex = '#' + [m[1],m[2],m[3]].map(v=>parseInt(v).toString(16).padStart(2,'0')).join('');
  _editorSelectColor(hex, false);
  tplEditorSetTool('brush');
}

/* ══════════════════════════════════════════════════════════
   UNDO / REDO
══════════════════════════════════════════════════════════ */
function _tplPushUndo() {
  _tplUndoStack.push(new Map(_tplData));
  if (_tplUndoStack.length > TPL_UNDO_LIMIT) _tplUndoStack.shift();
  _tplRedoStack = [];
  _tplUpdateUndoButtons();
}
function tplUndo() {
  if (!_tplUndoStack.length) return;
  _tplRedoStack.push(new Map(_tplData));
  _tplData = _tplUndoStack.pop();
  _tplRebuildBitmap();
  _tplUpdateUndoButtons();
  _editorRender();
}
function tplRedo() {
  if (!_tplRedoStack.length) return;
  _tplUndoStack.push(new Map(_tplData));
  _tplData = _tplRedoStack.pop();
  _tplRebuildBitmap();
  _tplUpdateUndoButtons();
  _editorRender();
}
function _tplRebuildBitmap() {
  if (!_tplBitmap) return;
  _tplBitmapCtx.clearRect(0, 0, _editorW, _editorH);
  for (const [f, color] of _tplData) {
    const ix = f % _editorW, iy = Math.floor(f / _editorW);
    _tplBitmapCtx.fillStyle = color;
    _tplBitmapCtx.fillRect(ix, iy, 1, 1);
  }
}
function _tplUpdateUndoButtons() {
  const u = document.getElementById('tpl-undo-btn');
  const r = document.getElementById('tpl-redo-btn');
  if (u) u.disabled = !_tplUndoStack.length;
  if (r) r.disabled = !_tplRedoStack.length;
}

/* Sync from existing bitmap (editing session restore) */
function _editorSyncFromBitmap() {
  if (!_tplBitmap || _tplData.size > 0) return;
  const imgData = _tplBitmapCtx.getImageData(0, 0, _editorW, _editorH);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const a = imgData.data[i+3];
    if (a > 0) {
      const flat = i / 4;
      const r = imgData.data[i], g = imgData.data[i+1], b = imgData.data[i+2];
      _tplData.set(flat, `rgba(${r},${g},${b},${(a/255).toFixed(2)})`);
    }
  }
}

/* ══════════════════════════════════════════════════════════
   MIRROR
══════════════════════════════════════════════════════════ */
function tplToggleMirror(axis) {
  if (axis === 'x') {
    _tplMirrorX = !_tplMirrorX;
    document.getElementById('tpl-mirrorx-check').checked = _tplMirrorX;
  } else {
    _tplMirrorY = !_tplMirrorY;
    document.getElementById('tpl-mirrory-check').checked = _tplMirrorY;
  }
}

/* ══════════════════════════════════════════════════════════
   BRUSH SIZE / OPACITY / RIGHT CLICK
══════════════════════════════════════════════════════════ */
function tplSetBrushSize(v) {
  _tplBrushSize = Math.max(1, Math.min(9, v));
  const val = document.getElementById('tpl-size-val');
  if (val) val.textContent = _tplBrushSize + 'px';
}
function tplSetOpacity(v) {
  _tplOpacity = Math.round(v) / 100;
  const val = document.getElementById('tpl-opacity-val');
  if (val) val.textContent = Math.round(v) + '%';
}
function tplToggleRightClickErase() {
  _tplRightClickErase = document.getElementById('tpl-rclick-check')?.checked ?? !_tplRightClickErase;
  const dc = document.getElementById('tpl-draw-canvas');
  if (dc) dc.classList.toggle('rclick-erase', _tplRightClickErase);
}

/* ══════════════════════════════════════════════════════════
   MENU ACTIONS
══════════════════════════════════════════════════════════ */
function tplMenuNew() {
  if (_tplData.size > 0) {
    if (!confirm('Şablonu sıfırlamak istiyor musun?')) return;
  }
  _tplPushUndo();
  _tplData.clear();
  if (_tplBitmapCtx) _tplBitmapCtx.clearRect(0, 0, _editorW, _editorH);
  _editorRender();
}

function tplEditorClear() { tplMenuNew(); }

function tplMenuImport() {
  document.getElementById('tpl-file-input')?.click();
}

function tplHandleImport(input) {
  const file = input.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    _tplPushUndo();
    _tplBitmapCtx.clearRect(0, 0, _editorW, _editorH);
    _tplBitmapCtx.drawImage(img, 0, 0, _editorW, _editorH);
    URL.revokeObjectURL(url);
    /* Rebuild _tplData from bitmap */
    _tplData.clear();
    const imgData = _tplBitmapCtx.getImageData(0, 0, _editorW, _editorH);
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i+3] > 0) {
        const r=imgData.data[i],g=imgData.data[i+1],b=imgData.data[i+2],a=imgData.data[i+3];
        _tplData.set(i/4, `rgba(${r},${g},${b},${(a/255).toFixed(2)})`);
      }
    }
    _editorRender();
    input.value = '';
  };
  img.onerror = () => { showPopup('Resim yüklenemedi.'); URL.revokeObjectURL(url); };
  img.src = url;
}

function tplMenuExportPng() { tplHandleDone(); }

/* ══════════════════════════════════════════════════════════
   CANVAS EVENT HANDLING
══════════════════════════════════════════════════════════ */
function _editorAttachEvents() {
  const dc = document.getElementById('tpl-draw-canvas');
  if (!dc || dc._tplEventsAttached) return;
  dc._tplEventsAttached = true;

  dc.addEventListener('pointerdown', _editorPointerDown);
  dc.addEventListener('pointermove', _editorPointerMove);
  dc.addEventListener('pointerup',   _editorPointerUp);
  dc.addEventListener('contextmenu', e => e.preventDefault());

  /* Wheel zoom */
  document.getElementById('tpl-canvas-area').addEventListener('wheel', e => {
    e.preventDefault();
    if (e.deltaY < 0) tplZoomIn(); else tplZoomOut();
  }, { passive: false });
}

function _editorPointerDown(e) {
  e.preventDefault();
  _tplStrokeActive = false;

  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    /* Middle button or alt+left = pan */
    _editorPanning = true;
    _editorPanStartX = e.clientX;
    _editorPanStartY = e.clientY;
    return;
  }

  const [gx, gy] = _editorEventToGrid(e);
  const flat = _editorXYToFlat(gx, gy);

  if (e.button === 2) {
    /* Sağ tık: silgi açıksa sil, kapalıysa haritada gezin (pan) */
    if (_tplRightClickErase) {
      _tplRightClickDown = true;
      _tplPaintAt(flat, true);
      _editorRender();
    } else {
      _editorPanning = true;
      _editorPanStartX = e.clientX;
      _editorPanStartY = e.clientY;
    }
    return;
  }

  /* Left click */
  _tplDrawingNow = true;
  _tplLastFlat = flat;

  if (_tplTool === 'picker') { _tplPickColor(flat); return; }
  if (_tplTool === 'fill') { _tplPushUndo(); _tplFloodFillFrom(flat, _tplColorWithOpacity(_tplColor, _tplOpacity)); _editorRender(); return; }
  if (_tplTool === 'line') { _editorLineStart = [gx, gy]; return; }
  if (_tplTool === 'rect' || _tplTool === 'rectfill') { _editorRectStart = [gx, gy]; return; }

  _tplPaintAt(flat);
  _editorRender();
}

function _editorPointerMove(e) {
  const [gx, gy] = _editorEventToGrid(e);

  /* Update coords */
  const cl = document.getElementById('tpl-coords-label');
  const sc = document.getElementById('tpl-stat-cursor');
  if (cl) cl.textContent = `x:${gx} y:${gy}`;
  if (sc) sc.textContent = `${gx}, ${gy}`;

  if (_editorPanning) {
    const wrap = document.getElementById('tpl-canvas-wrap');
    if (!wrap) return;
    /* Pan the canvas-area scroll */
    const area = document.getElementById('tpl-canvas-area');
    area.scrollLeft -= (e.clientX - _editorPanStartX);
    area.scrollTop  -= (e.clientY - _editorPanStartY);
    _editorPanStartX = e.clientX;
    _editorPanStartY = e.clientY;
    return;
  }

  if (!_tplDrawingNow && !_tplRightClickDown) return;

  const flat = _editorXYToFlat(gx, gy);
  if (flat < 0) return;

  /* Right drag erase */
  if (_tplRightClickDown && _tplRightClickErase) {
    _tplPaintLine(_tplLastFlat, flat, true);
    _tplLastFlat = flat;
    _editorRender();
    return;
  }

  if (!_tplDrawingNow) return;

  if (_tplTool === 'brush' || _tplTool === 'eraser') {
    if (flat !== _tplLastFlat) {
      _tplPaintLine(_tplLastFlat, flat);
      _tplLastFlat = flat;
      _editorRender();
    }
  }
}

function _editorPointerUp(e) {
  const [gx, gy] = _editorEventToGrid(e);
  const flat = _editorXYToFlat(gx, gy);

  if (_editorPanning) { _editorPanning = false; return; }

  if (_tplTool === 'line' && _editorLineStart) {
    const [sx, sy] = _editorLineStart;
    const fromFlat = _editorXYToFlat(sx, sy);
    _tplPaintLine(fromFlat, flat);
    _editorLineStart = null;
    _editorRender();
  }

  if ((_tplTool === 'rect' || _tplTool === 'rectfill') && _editorRectStart) {
    const [sx, sy] = _editorRectStart;
    _tplPaintRect(sx, sy, gx, gy, _tplTool === 'rectfill');
    _editorRectStart = null;
    _editorRender();
  }

  _tplDrawingNow = false;
  _tplRightClickDown = false;
  _tplStrokeActive = false;
  _tplLastFlat = -1;
}

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════ */
function _tplKeyboardHandler(e) {
  if (!_tplActive) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 'Escape') { closeTemplateEditor(); return; }
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); tplUndo(); return; }
    if (e.key === 'y' || (e.shiftKey && e.key === 'z')) { e.preventDefault(); tplRedo(); return; }
  }
  switch(e.key.toLowerCase()) {
    case 'b': tplEditorSetTool('brush'); break;
    case 'e': tplEditorSetTool('eraser'); break;
    case 'g': tplEditorSetTool('fill'); break;
    case 'l': tplEditorSetTool('line'); break;
    case 'r': tplEditorSetTool('rect'); break;
    case 'i': tplEditorSetTool('picker'); break;
    case '+': case '=': tplZoomIn(); break;
    case '-': tplZoomOut(); break;
  }
}

/* ══════════════════════════════════════════════════════════
   EXPORT / SAVE
   Harita canvası + oy pikselleri + şablon → PNG
══════════════════════════════════════════════════════════ */
async function tplHandleDone() {
  const btn = document.getElementById('tpl-done-btn');
  btn.disabled = true; btn.textContent = '⏳ Hazırlanıyor...';
  try {
    const blob = await _tplExportPNG();
    _tplLastBlob = blob;
    const url = URL.createObjectURL(blob);
    document.getElementById('tpl-result-preview').src = url;
    document.getElementById('tpl-dl-link').href = url;
    document.getElementById('tpl-dl-link').download = 'sablon_' + Date.now() + '.png';
    document.getElementById('tpl-upload-status').textContent = '';
    document.getElementById('tpl-upload-status').className = '';
    document.getElementById('tpl-result-popup').classList.add('show');
  } catch(err) {
    showPopup('Export hatası: ' + (err.message || 'bilinmiyor'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-.1em"><polyline points="20 6 9 17 4 12"/></svg> Bitti & İndir';
  }
}

async function _tplExportPNG() {
  /* Try to merge with game map if available */
  const merged = document.createElement('canvas');
  merged.width = _editorW; merged.height = _editorH;
  const ctx2 = merged.getContext('2d');
  ctx2.imageSmoothingEnabled = false;
  /* DÜZELTME: bir bölge (region) seçiliyse, harita canvas'larından SADECE
     o bölgeyi kırpıp çizmemiz gerekiyor; aksi halde tam haritanın sol-üst
     köşesi yanlışlıkla küçük şablon canvas'ına gerilerek çiziliyordu. */
  const reg = window._tplRegion;
  if (reg) {
    if (typeof baseCanvas !== 'undefined' && baseCanvas) {
      ctx2.drawImage(baseCanvas, reg.x, reg.y, reg.w, reg.h, 0, 0, _editorW, _editorH);
    }
    if (typeof pixelCanvas !== 'undefined' && pixelCanvas) {
      ctx2.drawImage(pixelCanvas, reg.x, reg.y, reg.w, reg.h, 0, 0, _editorW, _editorH);
    }
  } else {
    if (typeof baseCanvas !== 'undefined' && baseCanvas) ctx2.drawImage(baseCanvas, 0, 0);
    if (typeof pixelCanvas !== 'undefined' && pixelCanvas) ctx2.drawImage(pixelCanvas, 0, 0);
  }
  if (_tplBitmap) ctx2.drawImage(_tplBitmap, 0, 0);
  return new Promise((resolve, reject) => {
    merged.toBlob(b => b ? resolve(b) : reject(new Error('toBlob başarısız')), 'image/png');
  });
}

async function tplUploadToSupabase() {
  if (!_tplLastBlob) { showPopup('Önce "Bitti & İndir"e bas.'); return; }
  if (typeof supabase === 'undefined') { showPopup('Supabase bağlantısı yok.'); return; }
  const statusEl  = document.getElementById('tpl-upload-status');
  const uploadBtn = document.getElementById('tpl-upload-btn');
  statusEl.className = ''; statusEl.textContent = '⏳ Yükleniyor...';
  uploadBtn.disabled = true;
  try {
    const {data:{user}, error:authErr} = await supabase.auth.getUser();
    if (authErr || !user) throw new Error('Oturum bulunamadı, tekrar giriş yap.');
    const uid = user.id, fileName = crypto.randomUUID() + '.png', path = uid + '/' + fileName;
    const {error:upErr} = await supabase.storage.from('player-templates').upload(path, _tplLastBlob, {contentType:'image/png', upsert:false});
    if (upErr) throw upErr;
    const {data:sd, error:signErr} = await supabase.storage.from('player-templates').createSignedUrl(path, 3600);
    if (signErr) throw signErr;
    statusEl.className = 'ok'; statusEl.textContent = '✓ Yüklendi! Signed URL (1 saat geçerli):';
    const a = document.createElement('a');
    a.href = sd.signedUrl; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = '🔗 Şablonumu Aç';
    a.style.cssText = 'display:block;margin-top:.35rem;color:#a78bfa;font-size:.68rem;word-break:break-all;';
    statusEl.appendChild(a);
  } catch(err) {
    statusEl.className = 'err'; statusEl.textContent = '✗ Yükleme başarısız: ' + (err.message || 'bilinmiyor');
  } finally { uploadBtn.disabled = false; }
}

function closeTplResultPopup() {
  document.getElementById('tpl-result-popup').classList.remove('show');
  const prev = document.getElementById('tpl-result-preview');
  if (prev.src) URL.revokeObjectURL(prev.src);
}

/* ══════════════════════════════════════════════════════════
   HARITA OVERLAY SYNC
   Editör kapatıldıktan sonra haritadaki template-canvas'ı güncelle
══════════════════════════════════════════════════════════ */
function _tplRenderOverlay() {
  const tc = document.getElementById('template-canvas');
  if (!tc || !canvas) return;
  if (tc.width !== canvas.width || tc.height !== canvas.height) {
    tc.width = canvas.width; tc.height = canvas.height;
  }
  const tctx = tc.getContext('2d');
  tctx.clearRect(0, 0, tc.width, tc.height);
  if (!_tplBitmap || _tplData.size === 0) return;
  tctx.imageSmoothingEnabled = false;
  if (typeof ox !== 'undefined' && typeof scale !== 'undefined') {
    tctx.drawImage(_tplBitmap, ox, oy, IMG_W * scale, IMG_H * scale);
  }
}

/* draw() hook: harita her render edildiğinde overlay güncelle */
(function() {
  const _origDraw = window.draw;
  if (typeof _origDraw === 'function') {
    window.draw = function() {
      _origDraw.apply(this, arguments);
      if (!_tplActive && _tplData.size > 0) _tplRenderOverlay();
    };
  }
})();
window.addEventListener('resize', () => { if (!_tplActive && _tplData.size > 0) _tplRenderOverlay(); });

/* ══════════════════════════════════════════════════════════
   "Şablon Yap" butonunu giriş yapılınca göster
══════════════════════════════════════════════════════════ */
(function() {
  const origActivate = window._activateUser;
  if (typeof origActivate === 'function') {
    window._activateUser = function(v) {
      origActivate.apply(this, arguments);
      const tb = document.getElementById('template-btn'); if (tb) tb.style.display = '';
      const ts = document.getElementById('ts-templatebtn'); if (ts) ts.style.display = '';
    };
  }
  const origCheck = window.checkAdminStatus;
  if (typeof origCheck === 'function') {
    window.checkAdminStatus = async function() {
      await origCheck.apply(this, arguments);
      if (typeof username !== 'undefined' && username) {
        const tb = document.getElementById('template-btn'); if (tb) tb.style.display = '';
        const ts = document.getElementById('ts-templatebtn'); if (ts) ts.style.display = '';
      }
    };
  }
})();

