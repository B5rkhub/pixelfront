// ── TEMA RENGİ ──
// Uygulama genelinde "mor" vurgu rengi tamamen CSS değişkenlerinden
// (--accent, --accent-rgb, --accent2, --accent2-rgb) besleniyor — bkz.
// css/02-variables.css ve diğer css/*.css dosyalarındaki rgba(var(--accent-rgb),X)
// / var(--accent) kullanımları. Burada bu değişkenleri runtime'da document
// üzerinde ezerek tüm butonlar/sekmeler/glow efektleri/odak halkaları vb.
// tek noktadan yeniden renklendiriliyor. Harita üzerindeki parti/piksel
// renkleri (PARTIES) ve faction renkleri bu sistemden tamamen bağımsızdır —
// bunlar oyun verisidir, kullanıcının kişisel tema tercihinden etkilenmez.
const THEME_PRESETS=[
  {id:'purple', hex:'#7B61FF'},
  {id:'red',    hex:'#ef4444'},
  {id:'gold',   hex:'#f5a623'},
  {id:'green',  hex:'#22c55e'},
  {id:'cyan',   hex:'#06b6d4'},
  {id:'blue',   hex:'#3b82f6'},
  {id:'pink',   hex:'#ec4899'},
];
const THEME_DEFAULT_HEX='#7B61FF';
// Varsayılan accent2 (#b8acff), accent'i (#7B61FF) beyaza doğru ~%46 karıştırarak
// elde edilmiş — herhangi bir tema rengi için aynı oranı uygulayınca orijinal
// tasarımla tutarlı bir "açık ton" üretiyoruz. accent-mid (buton gradyanlarının
// orta durağı, örn. .pc-tab.active) ise ~%18 karıştırarak elde edilen daha
// hafif bir ara tondur.
const THEME_LIGHTEN_RATIO=.46;
const THEME_MID_LIGHTEN_RATIO=.18;

function _themeHexToRgb(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec((hex||'').trim());
  if(!m) return null;
  const n=parseInt(m[1],16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}
function _themeRgbToHex(rgb){
  return '#'+rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function _themeLighten(rgb,ratio){
  return rgb.map(v=>v+(255-v)*ratio);
}

function applyThemeColor(hex,persist){
  const rgb=_themeHexToRgb(hex);
  if(!rgb) return;
  hex=_themeRgbToHex(rgb); // normalize (örn. kısa/hatalı girişleri ele)
  const light=_themeLighten(rgb,THEME_LIGHTEN_RATIO);
  const mid=_themeLighten(rgb,THEME_MID_LIGHTEN_RATIO);
  const root=document.documentElement.style;
  root.setProperty('--accent',hex);
  root.setProperty('--accent-rgb',rgb.join(','));
  root.setProperty('--accent-mid',_themeRgbToHex(mid));
  root.setProperty('--accent2',_themeRgbToHex(light));
  root.setProperty('--accent2-rgb',light.map(v=>Math.round(v)).join(','));
  if(persist!==false){
    try{ localStorage.setItem(CONFIG.storageKeys.themeColor,hex); }catch(e){}
  }
  // "Yok" (none) avatar çerçevesi profile.js'de eskiden hep #7B61FF idi — FRAMES/
  // FRAME_BORDERS paylaşılan (mutable) global objeler olduğu için burada içeriklerini
  // güncellemek yeterli, profile.js/chat.js her render'da bunları taze okuyor.
  // Diğer çerçeveler (kırmızı/yeşil/altın vb.) kullanıcının kendi seçimidir, temaya
  // bağlı değildir — sadece 'none' (temayı temsil eden varsayılan) güncelleniyor.
  try{
    if(typeof FRAMES!=='undefined'){
      const noneFrame=FRAMES.find(f=>f.id==='none');
      if(noneFrame) noneFrame.style='background:linear-gradient(135deg,'+hex+','+_themeRgbToHex(light)+')';
    }
    if(typeof FRAME_BORDERS!=='undefined') FRAME_BORDERS.none=hex;
    if(typeof applyProfileToBtn==='function') applyProfileToBtn();
  }catch(e){}
  _themeSyncUI(hex);
}

function loadThemeColor(){
  let hex=THEME_DEFAULT_HEX;
  try{ hex=localStorage.getItem(CONFIG.storageKeys.themeColor)||THEME_DEFAULT_HEX; }catch(e){}
  applyThemeColor(hex,false);
}

function _themeSyncUI(hex){
  const norm=hex.toLowerCase();
  const isPreset=THEME_PRESETS.some(p=>p.hex.toLowerCase()===norm);
  document.querySelectorAll('.pca-theme-swatch').forEach(el=>{
    el.classList.toggle('active',(el.dataset.hex||'').toLowerCase()===norm);
  });
  const customSwatch=document.getElementById('pca-theme-custom-swatch');
  if(customSwatch) customSwatch.classList.toggle('active',!isPreset);
  const customInput=document.getElementById('pca-theme-custom-input');
  if(customInput && document.activeElement!==customInput) customInput.value=hex;
}

function renderThemeSettings(){
  const wrap=document.getElementById('pca-theme-swatches');
  if(!wrap) return;
  let currentHex=THEME_DEFAULT_HEX;
  try{ currentHex=localStorage.getItem(CONFIG.storageKeys.themeColor)||THEME_DEFAULT_HEX; }catch(e){}
  wrap.innerHTML='';
  THEME_PRESETS.forEach(p=>{
    const el=document.createElement('button');
    el.type='button';
    el.className='pca-theme-swatch';
    el.dataset.hex=p.hex;
    el.style.background=p.hex;
    el.title=t('settings.theme_'+p.id)||p.id;
    el.onclick=()=>applyThemeColor(p.hex,true);
    wrap.appendChild(el);
  });
  // Özel renk seçici (native <input type=color> üstte görünmez şekilde durur)
  const customWrap=document.createElement('div');
  customWrap.className='pca-theme-custom-wrap';
  customWrap.title=t('settings.theme_custom')||'';
  const customSwatch=document.createElement('div');
  customSwatch.className='pca-theme-swatch pca-theme-custom-swatch';
  customSwatch.id='pca-theme-custom-swatch';
  customWrap.appendChild(customSwatch);
  const customInput=document.createElement('input');
  customInput.type='color';
  customInput.id='pca-theme-custom-input';
  customInput.value=currentHex;
  customInput.oninput=()=>applyThemeColor(customInput.value,false); // sürüklerken canlı önizleme
  customInput.onchange=()=>applyThemeColor(customInput.value,true); // seçim kesinleşince kaydet
  customWrap.appendChild(customInput);
  wrap.appendChild(customWrap);
  _themeSyncUI(currentHex);
}

// Sayfa ilk yüklendiğinde (login ekranından önce) kaydedilmiş temayı uygula
loadThemeColor();

// Ayarlar sekmesi her açıldığında/render edildiğinde tema seçicisini de doldur
const _origRenderProfileSettings=window.renderProfileSettings;
window.renderProfileSettings=function(){
  if(typeof _origRenderProfileSettings==='function') _origRenderProfileSettings();
  renderThemeSettings();
};
