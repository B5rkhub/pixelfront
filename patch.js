/* syncTbSheet'e template ekle */
(function(){
  const _orig=window.syncTbSheet;
  window.syncTbSheet=function(){
    if(typeof _orig==='function') _orig.apply(this,arguments);
    const tb=document.getElementById('template-btn');
    const ts=document.getElementById('ts-templatebtn');
    if(tb&&ts) ts.style.display=tb.style.display==='none'?'none':'';
  };
})();

/* ══════════════════════════════════════════════════════════
   BÖLGE SEÇİM SİSTEMİ v3
══════════════════════════════════════════════════════════ */
(function(){

let _rsx=0,_rsy=0,_rex=0,_rey=0;
let _rDragging=false, _rHasSel=false;
let _rPanning=false, _rPanLast={x:0,y:0};
/* Bekleyen bölge — confirm'den sonra openTemplateEditor içinde okunur */
let _pendingRegion=null;

/* ── client → IMG koordinat ── */
function _c2i(cx,cy){
  if(typeof ox==='undefined'||!canvas) return {x:0,y:0};
  const r=canvas.getBoundingClientRect(), dpr=canvas.width/r.width;
  return {
    x:Math.max(0,Math.min(IMG_W-1,Math.floor(((cx-r.left)*dpr-ox)/scale))),
    y:Math.max(0,Math.min(IMG_H-1,Math.floor(((cy-r.top )*dpr-oy)/scale)))
  };
}

/* ── Seçim kutusunu ekrana yansıt ── */
function _drawRect(){
  if(!canvas) return;
  const r=canvas.getBoundingClientRect(), dpr=canvas.width/r.width;
  const x0=Math.min(_rsx,_rex),y0=Math.min(_rsy,_rey);
  const x1=Math.max(_rsx,_rex),y1=Math.max(_rsy,_rey);
  const sl=r.left+(ox+x0*scale)/dpr, st=r.top+(oy+y0*scale)/dpr;
  const sw=(x1-x0)*scale/dpr,       sh=(y1-y0)*scale/dpr;
  const el=document.getElementById('tpl-region-rect');
  if(el){ el.style.cssText+=`;left:${sl}px;top:${st}px;width:${sw}px;height:${sh}px;display:${sw>2&&sh>2?'block':'none'}`; }
  const dim=document.getElementById('tpl-ri-dim-text');
  if(dim){ dim.style.display='block'; dim.textContent=(x1-x0)+'×'+(y1-y0)+' piksel'; }
  const act=document.getElementById('tpl-region-actions');
  if(act){ sw>8&&sh>8 ? act.classList.add('visible') : act.classList.remove('visible'); }
}

function _resetSel(){
  _rHasSel=false;
  const el=document.getElementById('tpl-region-rect'); if(el) el.style.display='none';
  const act=document.getElementById('tpl-region-actions'); if(act) act.classList.remove('visible');
  const dim=document.getElementById('tpl-ri-dim-text'); if(dim) dim.style.display='none';
}

/* ── Public: HTML onclick'lerden çağrılır ── */
window._tplRegionReset=function(){ _resetSel(); };

window._tplRegionCancel=function(){
  _regionClose();
};

window._tplRegionConfirm=function(){
  if(!_rHasSel) return;
  const x0=Math.min(_rsx,_rex),y0=Math.min(_rsy,_rey);
  const x1=Math.max(_rsx,_rex),y1=Math.max(_rsy,_rey);
  const rw=Math.max(4,x1-x0), rh=Math.max(4,y1-y0);
  _pendingRegion={x:x0,y:y0,w:rw,h:rh};
  _regionClose();
  /* DÜZELTME: _origOpen() bölge mantığını bilmiyordu, _pendingRegion hiç
     okunmuyordu. window.openTemplateEditor (aşağıdaki override) bölgeyi
     işleyen fonksiyon — doğrusu onu çağırmak. */
  window.openTemplateEditor();
};

/* ── Overlay kapat + event temizle ── */
function _regionClose(){
  _resetSel(); _rDragging=false; _rPanning=false;
  const ov=document.getElementById('tpl-region-overlay');
  if(ov){ ov.classList.remove('active'); }
  document.removeEventListener('keydown',_onKey);
  const ov2=document.getElementById('tpl-region-overlay');
  if(ov2){
    ov2.removeEventListener('pointerdown',_onPD);
    ov2.removeEventListener('pointermove',_onPM);
    ov2.removeEventListener('pointerup',_onPU);
    ov2.removeEventListener('pointercancel',_onPU);
    ov2.removeEventListener('wheel',_onWheel);
    ov2.removeEventListener('contextmenu',_noCtx);
  }
}

/* ── Pointer events ── */
function _onPD(e){
  /* Aksiyon barına tıklanmışsa overlay event'i yutma */
  if(e.target.closest('#tpl-region-actions')||e.target.closest('#tpl-region-info')) return;
  if(e.button===1||e.button===2){ e.preventDefault(); _rPanning=true; _rPanLast={x:e.clientX,y:e.clientY}; return; }
  if(e.button!==0) return;
  e.preventDefault();
  _rDragging=true; _rHasSel=false;
  const p=_c2i(e.clientX,e.clientY);
  _rsx=_rex=p.x; _rsy=_rey=p.y;
  _resetSel();
}
function _onPM(e){
  if(_rPanning){
    if(!canvas) return;
    const dpr=canvas.width/canvas.getBoundingClientRect().width;
    ox+=(e.clientX-_rPanLast.x)*dpr; oy+=(e.clientY-_rPanLast.y)*dpr;
    _rPanLast={x:e.clientX,y:e.clientY};
    if(typeof draw==='function') draw();
    if(_rHasSel) _drawRect();
    return;
  }
  if(!_rDragging) return;
  e.preventDefault();
  const p=_c2i(e.clientX,e.clientY); _rex=p.x; _rey=p.y; _drawRect();
}
function _onPU(e){
  if(_rPanning){ _rPanning=false; return; }
  if(!_rDragging) return;
  _rDragging=false;
  const p=_c2i(e.clientX,e.clientY); _rex=p.x; _rey=p.y;
  const rw=Math.abs(_rex-_rsx), rh=Math.abs(_rey-_rsy);
  if(rw>3&&rh>3){ _rHasSel=true; _drawRect(); } else { _resetSel(); }
}
function _onWheel(e){
  e.preventDefault();
  if(typeof scale==='undefined'||!canvas) return;
  const r=canvas.getBoundingClientRect(), dpr=canvas.width/r.width;
  const mx=(e.clientX-r.left)*dpr, my=(e.clientY-r.top)*dpr;
  const ns=Math.max(0.3,Math.min(40,scale*(e.deltaY<0?1.15:1/1.15)));
  ox=mx-(mx-ox)*(ns/scale); oy=my-(my-oy)*(ns/scale); scale=ns;
  if(typeof draw==='function') draw();
  if(_rHasSel) _drawRect();
}
function _noCtx(e){ e.preventDefault(); }
function _onKey(e){ if(e.key==='Escape'){ _regionClose(); } }

/* ── openTemplateEditor override ── */
const _origOpen=window.openTemplateEditor;
window.openTemplateEditor=function(){
  /* Eğer _pendingRegion varsa: orijinali çağır, sonra düzelt */
  if(_pendingRegion){
    const reg=_pendingRegion; _pendingRegion=null;
    /* Orijinal fonksiyonu çağır — kendi let scope'undaki değişkenleri set eder */
    if(typeof _origOpen==='function') _origOpen.call(this);
    /* Şimdi bölge boyutlarını ve bitmap'i düzelt */
    const rw=reg.w, rh=reg.h;
    _editorW=rw; _editorH=rh;
    window._tplRegion=reg;
    /* Bitmap'i yeniden oluştur — bölge boyutunda, harita piksellerini arka plan yap.
       DÜZELTME: sadece pixelCanvas (oyuncuların bastığı seyrek pikseller) kopyalanıyordu,
       haritanın asıl renkli zemini (baseCanvas) hiç kopyalanmıyordu — bu yüzden editör
       neredeyse tamamen boş/şeffaf görünüyordu. İkisini de _tplExportPNG ile aynı
       sırada çiziyoruz. */
    const nb=document.createElement('canvas'); nb.width=rw; nb.height=rh;
    const nctx=nb.getContext('2d'); nctx.imageSmoothingEnabled=false;
    if(typeof baseCanvas!=='undefined'&&baseCanvas){
      try{ nctx.drawImage(baseCanvas,reg.x,reg.y,rw,rh,0,0,rw,rh); }catch(e){}
    }
    if(typeof pixelCanvas!=='undefined'&&pixelCanvas){
      try{ nctx.drawImage(pixelCanvas,reg.x,reg.y,rw,rh,0,0,rw,rh); }catch(e){}
    }
    _tplBitmap=nb; _tplBitmapCtx=nctx; _tplData=new Map();
    /* Canvas'ı doğru boyuta yeniden init et */
    _editorW=rw; _editorH=rh;
    _editorInitCanvas();
    _editorSyncFromBitmap();
    _editorRender();
    _editorUpdateNavPreview();
    const sz=document.getElementById('tpl-stat-size');
    if(sz) sz.textContent=rw+'×'+rh;
    return;
  }
  /* Normal yol: bölge seçim overlay'ini aç */
  if(typeof username==='undefined'||!username){
    if(typeof showPopup==='function') showPopup('Şablon aracı için giriş yapman gerekiyor.');
    return;
  }
  if(typeof _tplActive!=='undefined'&&_tplActive) return;
  if(typeof IMG_W==='undefined'){
    if(typeof showPopup==='function') showPopup('Harita henüz yüklenmedi.');
    return;
  }
  const ov=document.getElementById('tpl-region-overlay');
  if(!ov){ if(typeof _origOpen==='function') _origOpen.call(this); return; }
  _resetSel(); _rDragging=false; _rPanning=false; _rHasSel=false;
  ov.classList.add('active');
  ov.addEventListener('pointerdown',_onPD);
  ov.addEventListener('pointermove',_onPM);
  ov.addEventListener('pointerup',_onPU);
  ov.addEventListener('pointercancel',_onPU);
  ov.addEventListener('wheel',_onWheel,{passive:false});
  ov.addEventListener('contextmenu',_noCtx);
  document.addEventListener('keydown',_onKey);
};

/* ── draw() hook: zoom/pan sonrası seçim kutusunu güncelle ── */
(function(){
  const _od=window.draw;
  if(typeof _od==='function'){
    window.draw=function(){
      _od.apply(this,arguments);
      if(_rHasSel){
        const ov=document.getElementById('tpl-region-overlay');
        if(ov&&ov.classList.contains('active')) _drawRect();
      }
    };
  }
})();

/* ── _tplRenderOverlay patch: şablon doğru bölgeye çizilsin ── */
(function(){
  const _or=window._tplRenderOverlay;
  window._tplRenderOverlay=function(){
    if(window._tplRegion&&typeof _tplBitmap!=='undefined'&&_tplBitmap&&typeof _tplData!=='undefined'&&_tplData.size>0){
      const tc=document.getElementById('template-canvas');
      if(!tc||!canvas) return;
      if(tc.width!==canvas.width||tc.height!==canvas.height){tc.width=canvas.width;tc.height=canvas.height;}
      const tctx=tc.getContext('2d');
      tctx.clearRect(0,0,tc.width,tc.height);
      if(typeof ox!=='undefined'){
        const reg=window._tplRegion;
        tctx.imageSmoothingEnabled=false;
        tctx.drawImage(_tplBitmap,ox+reg.x*scale,oy+reg.y*scale,reg.w*scale,reg.h*scale);
      }
    } else if(typeof _or==='function'){ _or.apply(this,arguments); }
  };
})();

})(); /* end bölge seçim sistemi v3 */
