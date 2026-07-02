// ══════════════════════════════════════════════════════
// 📢 DUYURU (ANNOUNCEMENT) SİSTEMİ
// Admin "Duyuru Yaz" panelinden bir metin yazıp yayınlar.
// Supabase Realtime Broadcast ile TÜM bağlı oyunculara anında
// iletilir (kalıcı tablo gerekmez — geçici/duyuru amaçlı bir
// olay olduğu için broadcast yeterli ve daha hafiftir).
// Şerit ekranın üst ortasında 2 kez "iniş-bekleme-çıkış"
// animasyonuyla gösterilip kaybolur; aynı anda bir ses efekti çalar.
// ══════════════════════════════════════════════════════

function openAnnounceModal(){
  if(!_isAdmin){ showPopup(t('msg.no_admin')); return; }
  document.getElementById('announce-modal').style.display='flex';
  document.getElementById('announce-text-input').value='';
  document.getElementById('announce-char-count').textContent='0/180';
  document.getElementById('announce-form-msg').textContent='';
  document.getElementById('announce-text-input').focus();
}
function closeAnnounceModal(){
  document.getElementById('announce-modal').style.display='none';
}

let _announceChannel = null;
function getAnnounceChannel(){
  if(_announceChannel) return _announceChannel;
  _announceChannel = supabase.channel('announcements', { config: { broadcast: { self: true } } });
  _announceChannel.on('broadcast', { event: 'announce' }, (payload)=>{
    const text = payload && payload.payload && payload.payload.text;
    if(text) displayAnnouncement(text);
  });
  _announceChannel.subscribe();
  return _announceChannel;
}
// Sayfa açılır açılmaz dinlemeye başla (yetki gerekmez — sadece dinleme)
getAnnounceChannel();

async function sendAnnouncement(){
  if(!_isAdmin){ showPopup(t('msg.no_admin')); return; }
  const inp = document.getElementById('announce-text-input');
  const msgEl = document.getElementById('announce-form-msg');
  const text = inp.value.trim();
  if(!text){ msgEl.style.color='#f04a4a'; msgEl.textContent=t('am.empty_error'); return; }
  const btn = document.getElementById('announce-send-btn');
  btn.disabled = true; btn.style.opacity='.6';
  msgEl.style.color='var(--muted)'; msgEl.textContent=t('am.publishing');
  try{
    const ch = getAnnounceChannel();
    await ch.send({ type:'broadcast', event:'announce', payload:{ text: text.slice(0,180) } });
    msgEl.style.color='#00d4a0'; msgEl.textContent=t('am.published');
    setTimeout(()=>{ closeAnnounceModal(); }, 600);
  }catch(e){
    console.error('Duyuru yayınlama hatası:', e);
    msgEl.style.color='#f04a4a'; msgEl.textContent=t('am.publish_failed');
  }finally{
    btn.disabled = false; btn.style.opacity='1';
  }
}

// ── Şeridi göster: 2 kez göster-bekle-gizle döngüsü, sonra tamamen kaybol ──
let _announceQueue = [];
let _announceShowing = false;
function displayAnnouncement(text){
  _announceQueue.push(text);
  if(!_announceShowing) processAnnounceQueue();
}
function processAnnounceQueue(){
  if(_announceQueue.length===0){ _announceShowing=false; return; }
  _announceShowing = true;
  const raw = _announceQueue.shift();
  const banner = document.getElementById('announce-banner');
  const textEl = document.getElementById('announce-banner-text');
  textEl.textContent = raw; // textContent kullanıldığı için XSS riski yok
  playAnnounceSound();

  const SHOW_MS = 3200;   // her gösterimde ekranda kalma süresi
  const HIDE_MS = 500;    // iki gösterim arası gizli kalma süresi
  let cycle = 0;
  const REPEAT = 2; // toplam gösterim sayısı

  function showOnce(){
    banner.classList.add('show');
    setTimeout(()=>{
      banner.classList.remove('show');
      cycle++;
      if(cycle < REPEAT){
        setTimeout(showOnce, HIDE_MS);
      } else {
        setTimeout(processAnnounceQueue, HIDE_MS);
      }
    }, SHOW_MS);
  }
  showOnce();
}

// Sayfa ilk açıldığında kayıtlı (ya da tarayıcıdan tahmin edilen) dili uygula
applyI18n();
