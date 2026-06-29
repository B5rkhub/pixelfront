// ══════════════════════════════════════════════════════
// 🔊 SFX — Merkezi Ses Efekti Motoru
// Oyundaki tüm butonlar ve önemli aksiyonlar (piksel atma,
// duyuru vb.) için kısa, dosya gerektirmeyen WebAudio sesleri.
// Tek bir AudioContext paylaşılır (her çalışta yeni context
// açıp kapatmak hem yavaş hem de bazı tarayıcılarda ardışık
// seslerin kesilmesine yol açabiliyordu).
// ══════════════════════════════════════════════════════
const SFX = (()=>{
  let ctx = null;
  let unlocked = false;
  let muted = false;

  function getCtx(){
    if(!ctx){
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return null;
      ctx = new Ctx();
    }
    return ctx;
  }

  // Tarayıcılar ilk kullanıcı etkileşiminden önce sesi engelleyebilir
  // (autoplay policy) — context'i "suspended" durumdaysa devam ettir.
  function ensureRunning(){
    const c = getCtx();
    if(!c) return null;
    if(c.state === 'suspended'){ c.resume().catch(()=>{}); }
    return c;
  }

  // notes: [{freq, start, dur, type, gain}]
  function tone(notes, masterGain){
    if(muted) return;
    const c = ensureRunning();
    if(!c) return;
    const now = c.currentTime;
    const mg = masterGain!=null ? masterGain : 0.18;
    notes.forEach(n=>{
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = n.type || 'sine';
      osc.frequency.value = n.freq;
      const peak = (n.gain!=null ? n.gain : mg);
      gain.gain.setValueAtTime(0.0001, now+n.start);
      gain.gain.exponentialRampToValueAtTime(peak, now+n.start+0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now+n.start+n.dur);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(now+n.start);
      osc.stop(now+n.start+n.dur+0.04);
    });
  }

  return {
    // Genel buton tıklaması — kısa, hafif "tık"
    click(){
      tone([{freq:740, start:0, dur:0.045, type:'sine', gain:0.10}]);
    },
    // Piksel atma — daha dolgun, tatmin edici bir "pop"
    pixel(){
      tone([
        {freq:520, start:0,    dur:0.05, type:'triangle', gain:0.16},
        {freq:980, start:0.03, dur:0.09, type:'sine',     gain:0.14}
      ]);
    },
    // Olumlu/onay sesi (ör. işlem başarılı)
    success(){
      tone([
        {freq:660, start:0,    dur:0.09, type:'sine', gain:0.14},
        {freq:990, start:0.07, dur:0.12, type:'sine', gain:0.13}
      ]);
    },
    // Hata/uyarı sesi
    error(){
      tone([{freq:220, start:0, dur:0.16, type:'sawtooth', gain:0.10}]);
    },
    // Duyuru — iki notalı "ding"
    announce(){
      tone([
        {freq:880,  start:0,    dur:0.16, type:'sine', gain:0.22},
        {freq:1318, start:0.12, dur:0.22, type:'sine', gain:0.22}
      ]);
    },
    // ⚔️ SAVAŞ İLANI — Derin, sert, adrenalin yükseltici fanfar
    war(){
      if(muted) return;
      const c = ensureRunning();
      if(!c) return;
      const now = c.currentTime;
      function drum(startT, vol){
        const buf = c.createBuffer(1, c.sampleRate * 0.18, c.sampleRate);
        const data = buf.getChannelData(0);
        for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * Math.pow(1-(i/data.length),2.5);
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        g.gain.setValueAtTime(vol, now+startT);
        g.gain.exponentialRampToValueAtTime(0.0001, now+startT+0.18);
        src.connect(g); g.connect(c.destination);
        src.start(now+startT);
      }
      function brass(freq, startT, dur, vol, slide){
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * (slide||1), now+startT);
        osc.frequency.linearRampToValueAtTime(freq, now+startT+0.06);
        g.gain.setValueAtTime(0.0001, now+startT);
        g.gain.linearRampToValueAtTime(vol, now+startT+0.04);
        g.gain.setValueAtTime(vol, now+startT+dur-0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, now+startT+dur);
        osc.connect(g); g.connect(c.destination);
        osc.start(now+startT); osc.stop(now+startT+dur+0.05);
      }
      function alarm(freq, startT, dur, vol){
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, now+startT);
        g.gain.linearRampToValueAtTime(vol, now+startT+0.02);
        g.gain.setValueAtTime(vol, now+startT+dur-0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, now+startT+dur);
        osc.connect(g); g.connect(c.destination);
        osc.start(now+startT); osc.stop(now+startT+dur+0.03);
      }
      drum(0,    0.55); drum(0.18, 0.40); drum(0.32, 0.60);
      brass(130, 0,    0.22, 0.28, 0.7);
      brass(196, 0.20, 0.18, 0.32, 0.8);
      brass(261, 0.35, 0.25, 0.36, 0.85);
      brass(329, 0.55, 0.20, 0.38, 0.9);
      brass(392, 0.72, 0.30, 0.42, 0.85);
      alarm(440, 0.85, 0.14, 0.18); alarm(880, 0.97, 0.10, 0.14);
      alarm(440, 1.05, 0.10, 0.16); alarm(880, 1.13, 0.10, 0.13);
      drum(0.90, 0.50); drum(1.00, 0.55); drum(1.08, 0.65);
      brass(523, 1.10, 0.45, 0.40, 0.9);
      brass(392, 1.50, 0.55, 0.30, 1.0);
      alarm(220, 1.55, 0.40, 0.12);
    },
    // 🤝 İTTİFAK sesi — sıcak, zafer notalı
    ally(){
      tone([
        {freq:392, start:0,    dur:0.12, type:'sine', gain:0.18},
        {freq:523, start:0.10, dur:0.14, type:'sine', gain:0.20},
        {freq:659, start:0.22, dur:0.20, type:'sine', gain:0.22},
        {freq:784, start:0.38, dur:0.28, type:'sine', gain:0.20}
      ]);
    },
    // ☮️ BARIŞ / nötr sesi
    peace(){
      tone([
        {freq:523, start:0,    dur:0.14, type:'sine', gain:0.14},
        {freq:392, start:0.12, dur:0.18, type:'sine', gain:0.12}
      ]);
    },
    setMuted(v){ muted = !!v; try{ localStorage.setItem(CONFIG.storageKeys.sfxMuted, muted?'1':'0'); }catch(e){} },
    isMuted(){ return muted; },
    unlock(){
      if(unlocked) return;
      unlocked = true;
      ensureRunning();
    }
  };
})();
// Kayıtlı sessize alma tercihini yükle
try{ SFX.setMuted(localStorage.getItem(CONFIG.storageKeys.sfxMuted)==='1'); }catch(e){}
// İlk kullanıcı etkileşiminde AudioContext'i kilidini aç (autoplay policy)
['pointerdown','keydown','touchstart'].forEach(ev=>{
  document.addEventListener(ev, ()=>SFX.unlock(), {once:true, passive:true});
});

// Geriye dönük uyumluluk: duyuru sistemi bu adı çağırıyordu.
function playAnnounceSound(){ SFX.announce(); }

// ── Genel buton tıklama sesi: olay delegasyonu ──
// Tek tek her butona dinleyici eklemek yerine, document üzerinde
// capture aşamasında dinleyip tıklanan elementin en yakın
// button/[onclick]/.btn atasını buluyoruz. Böylece sonradan
// eklenen butonlar da otomatik olarak ses alır.
document.addEventListener('click', function(e){
  const el = e.target.closest('button, [onclick], .btn, .ptbtn, .zb, .ch-tab, .pe-dur-btn, .tl-range-btn, .tl-speed-btn');
  if(!el) return;
  if(el.disabled) return;
  // Piksel kanvası (#c) tıklamaları ayrı, daha belirgin "pixel" sesi
  // alıyor (handleClick içinde) — burada tekrar genel tık sesi çalmayalım.
  if(el.id === 'c') return;
  SFX.click();
}, true);

