// ── AÇIK / KOYU MOD (LIGHT / DARK) ──
// document.documentElement üzerine data-theme="light"|"dark" yazar;
// css/02-variables.css'teki :root[data-theme="light"] bloğu zemin/metin/
// kenarlık değişkenlerini (--bg, --surf, --surf2, --txt, --muted, vb.) ezer.
// Tema rengi (--accent ailesi, theme.js) bu sistemden bağımsız — kullanıcının
// seçtiği vurgu rengi açık/koyu modda aynı kalır. Savaş banner'ları, taslak
// editörü ve haritanın üstünde yüzen zoom/palet gibi kontroller de bilinçli
// olarak bu değişkenlere hiç bağlı değil, her zaman kendi sabit renklerini
// kullanır (bkz. ilgili CSS dosyalarındaki notlar).
const COLOR_MODE_DEFAULT = 'dark';

function applyColorMode(mode, persist){
  mode = (mode === 'light') ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', mode);
  if(persist !== false){
    try{ localStorage.setItem(CONFIG.storageKeys.colorMode, mode); }catch(e){}
  }
  // Harita canvas'ının boş alan dolgusu CSS değil, Canvas 2D çizimi —
  // --bg değişkenini otomatik takip etmiyor, elle senkronluyoruz (bkz. game.js draw()).
  // NOT: game.js'teki "let _canvasBgColor" script-scope bağlaması — window.
  // öneki KULLANMA, aksi halde draw() içindeki çıplak referans bunu hiç görmez.
  if(typeof _canvasBgColor !== 'undefined'){
    _canvasBgColor = (mode === 'light') ? '#eef0f6' : '#05060e';
    if(typeof draw === 'function' && typeof baseCanvas !== 'undefined' && baseCanvas) draw();
  }
  _colorModeSyncUI(mode);
}

function loadColorMode(){
  let mode = null;
  try{ mode = localStorage.getItem(CONFIG.storageKeys.colorMode); }catch(e){}
  if(!mode){
    // Kayıtlı tercih yoksa işletim sistemi/tarayıcı tercihini kullan
    // (ama bunu henüz localStorage'a YAZMA — kullanıcı hiç seçim yapmamışsa
    // OS teması değiştiğinde otomatik takip etmeye devam etsin).
    try{
      mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
        ? 'light' : COLOR_MODE_DEFAULT;
    }catch(e){ mode = COLOR_MODE_DEFAULT; }
    applyColorMode(mode, false);
  } else {
    applyColorMode(mode, false);
  }
}

function _colorModeSyncUI(mode){
  const darkBtn = document.getElementById('pca-mode-dark');
  const lightBtn = document.getElementById('pca-mode-light');
  if(darkBtn) darkBtn.classList.toggle('active', mode !== 'light');
  if(lightBtn) lightBtn.classList.toggle('active', mode === 'light');
}

// Sayfa ilk yüklendiğinde (login ekranından önce) kaydedilmiş/algılanan modu uygula
loadColorMode();

// Ayarlar sekmesi her açıldığında buton durumunu güncel modla senkronla
// (theme.js zaten renderProfileSettings'i sarmalamıştı, üstüne ekliyoruz)
const _origRenderProfileSettings3 = window.renderProfileSettings;
window.renderProfileSettings = function(){
  if(typeof _origRenderProfileSettings3 === 'function') _origRenderProfileSettings3();
  let mode = 'dark';
  try{ mode = document.documentElement.getAttribute('data-theme') || 'dark'; }catch(e){}
  _colorModeSyncUI(mode);
};
