/* ══════════════════════════════════════════════════════
   MASAÜSTÜ TOPBAR DROPDOWN MENÜ SİSTEMİ
   "☰ Menü" butonuna basınca aşağı açılan panel (logo yerine)
══════════════════════════════════════════════════════ */
function toggleTbDesktopMenu(){
  const dd = document.getElementById('tb-desktop-dropdown');
  const isOpen = dd.classList.contains('open');
  if(isOpen){ closeTbDesktopMenu(); } else { openTbDesktopMenu(); }
}
function openTbDesktopMenu(){
  const dd = document.getElementById('tb-desktop-dropdown');
  const btn = document.getElementById('pb-menu-btn');
  dd.classList.add('open');
  if(btn) btn.classList.add('open');
  document.addEventListener('click', _tbDesktopMenuOutsideClick, true);
  document.addEventListener('keydown', _tbDesktopMenuEsc);
}
function closeTbDesktopMenu(){
  const dd = document.getElementById('tb-desktop-dropdown');
  const btn = document.getElementById('pb-menu-btn');
  dd.classList.remove('open');
  if(btn) btn.classList.remove('open');
  document.removeEventListener('click', _tbDesktopMenuOutsideClick, true);
  document.removeEventListener('keydown', _tbDesktopMenuEsc);
}
function _tbDesktopMenuOutsideClick(e){
  const dd = document.getElementById('tb-desktop-dropdown');
  const btn = document.getElementById('pb-menu-btn');
  if(!dd || !btn) return;
  if(dd.contains(e.target) || btn.contains(e.target)) return;
  closeTbDesktopMenu();
}
function _tbDesktopMenuEsc(e){
  if(e.key === 'Escape') closeTbDesktopMenu();
}

/* ══════════════════════════════════════════════════════
   MOBİL TOPBAR HAMBURGER MENU SİSTEMİ
   Bottom sheet aç/kapa + admin durumu senkronizasyonu
══════════════════════════════════════════════════════ */
function toggleTbMenu(){
  const sheet = document.getElementById('tb-menu-sheet');
  const burger = document.getElementById('tb-hamburger');
  const isOpen = sheet.classList.contains('open');
  if(isOpen){ closeTbMenu(); } else { openTbMenu(); }
}
function openTbMenu(){
  const sheet = document.getElementById('tb-menu-sheet');
  const burger = document.getElementById('tb-hamburger');
  sheet.classList.add('open');
  burger.classList.add('open');
  // Admin durumunu sheet'e yansıt
  syncTbSheetAdminState();
  document.body.style.overflow = 'hidden';
}
function closeTbMenu(){
  const sheet = document.getElementById('tb-menu-sheet');
  const burger = document.getElementById('tb-hamburger');
  sheet.classList.remove('open');
  burger.classList.remove('open');
  document.body.style.overflow = '';
}

/* Sheet'teki öğelerin görünürlüğünü topbar butonlarıyla senkronize et */
function syncTbSheet(){
  const pairs = [
    ['timelapse-btn','ts-timelapse'],
    ['history-btn',  'ts-history'],
    ['adminbtn',     'ts-adminbtn'],
    ['ownerbtn',     'ts-ownerbtn'],
  ];
  pairs.forEach(([tbId, shId])=>{
    const tb = document.getElementById(tbId);
    const sh = document.getElementById(shId);
    if(!tb || !sh) return;
    // display:none ise sheet item de gizli
    const isVisible = tb.style.display !== 'none';
    sh.style.display = isVisible ? '' : 'none';
  });
  // En az bir öğe görünür mü kontrol et
  const anyVisible = ['ts-timelapse','ts-history','ts-adminbtn','ts-ownerbtn']
    .some(id=>{ const el=document.getElementById(id); return el && el.style.display!=='none'; });
  // Hamburger'ı sadece bir şey olduğunda göster
  const burger = document.getElementById('tb-hamburger');
  if(burger) burger.style.display = anyVisible ? '' : 'none';
}

/* Admin ON/OFF durumunu sheet kartına yansıt */
function syncTbSheetAdminState(){
  const sh = document.getElementById('ts-adminbtn');
  if(!sh) return;
  const isOn = (typeof adminMode !== 'undefined') && adminMode;
  sh.classList.toggle('active', isOn);
  const icon = sh.querySelector('.tb-sheet-item-icon');
  if(icon) icon.style.background = isOn ? '#16a34a' : '#dc2626';
  const name = sh.querySelector('.tb-sheet-item-name');
  if(name) name.textContent = isOn ? (window.t ? t('topbar.admin_on') : '⚙ Admin ON') : (window.t ? t('topbar.admin') : '⚙ Admin');
}

/* toggleAdmin her çağrıldığında sheet senkronize olsun */
(function patchToggleAdmin(){
  const _orig = window.toggleAdmin;
  if(!_orig) return;
  window.toggleAdmin = function(){
    _orig.apply(this, arguments);
    // Kısa gecikmeyle: orijinal fonksiyon adminMode'u değiştirdikten sonra
    setTimeout(syncTbSheetAdminState, 10);
  };
})();

/* display.style değişimlerini gözlemle (timelapse/history/admin/owner görünürlüğü) */
(function observeTbButtons(){
  const ids = ['timelapse-btn','history-btn','adminbtn','ownerbtn'];
  const config = { attributes: true, attributeFilter: ['style'] };
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    new MutationObserver(()=> syncTbSheet()).observe(el, config);
  });
  // İlk senkronizasyon
  syncTbSheet();
})();

/* ESC ile kapat */
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeTbMenu(); });
