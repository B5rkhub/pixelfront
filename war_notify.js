// ══════════════════════════════════════════════════════════
// ⚔️ SAVAŞ & İTTİFAK BİLDİRİM SİSTEMİ
// setDiplomacy'den tetiklenir; Supabase broadcast ile tüm
// oyunculara iletilir. Ekran titrer, kıvılcımlar uçar,
// savaş müziği çalar.
// ══════════════════════════════════════════════════════════

/* ── Kıvılcım efekti ── */
function spawnWarSparks(count){
  const colors = ['#f04a4a','#f97316','#ffc53d','#fff'];
  for(let i=0; i<(count||20); i++){
    const spark = document.createElement('div');
    spark.className = 'war-spark';
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 200;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const dur = 0.7 + Math.random() * 0.8;
    spark.style.cssText = `
      left:${30+Math.random()*40}vw;
      top:${20+Math.random()*60}vh;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      --tx:${tx}px;--ty:${ty}px;--dur:${dur}s;
      box-shadow:0 0 4px currentColor;
    `;
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), dur * 1000 + 50);
  }
}

/* ── Savaş banner'ını göster ── */
function showWarBanner({attackerName, attackerColor, attackerEmoji, defenderName, defenderColor, defenderEmoji}){
  const card = document.getElementById('war-banner-card');
  const overlay = document.getElementById('war-banner-overlay');

  document.getElementById('wb-att-emoji').textContent = attackerEmoji;
  document.getElementById('wb-att-name').textContent = attackerName;
  document.getElementById('wb-att-name').style.color = attackerColor;
  document.getElementById('wb-att-tag').textContent = '';
  document.getElementById('wb-def-emoji').textContent = defenderEmoji;
  document.getElementById('wb-def-name').textContent = defenderName;
  document.getElementById('wb-def-name').style.color = defenderColor;
  document.getElementById('wb-def-tag').textContent = '';
  document.getElementById('wb-attacker').style.borderColor = attackerColor + '55';
  document.getElementById('wb-defender').style.borderColor = defenderColor + '55';
  document.getElementById('wb-desc').innerHTML = t('war.declared_html', {
    attacker: `<b>${_esc(attackerName)}</b>`,
    defender: `<b>${_esc(defenderName)}</b>`
  });

  overlay.classList.add('show');
  card.classList.add('show');

  // Savaş ilan sesi
  try {
    const snd = document.getElementById('war-declare-sound');
    if(snd){ snd.currentTime = 0; snd.volume = 0.85; snd.play().catch(()=>{}); }
  } catch(e){}

  // Ekran titremesi
  document.body.classList.add('war-shake');
  setTimeout(() => document.body.classList.remove('war-shake'), 520);

  // Kıvılcımlar — üç dalga
  spawnWarSparks(18);
  setTimeout(() => spawnWarSparks(14), 400);
  setTimeout(() => spawnWarSparks(12), 900);
}

function closeWarBanner(){
  document.getElementById('war-banner-card').classList.remove('show');
  document.getElementById('war-banner-overlay').classList.remove('show');
}

/* ── İttifak banner'ını göster ── */
function showAllyBanner({f1Name, f1Color, f2Name, f2Color}){
  const card = document.getElementById('ally-banner-card');
  const overlay = document.getElementById('war-banner-overlay');
  document.getElementById('ab-names').innerHTML = t('ally.formed_html', {
    f1: `<span style="color:${f1Color}">${_esc(f1Name)}</span>`,
    f2: `<span style="color:${f2Color}">${_esc(f2Name)}</span>`
  });
  overlay.classList.add('show');
  card.classList.add('show');
}

function closeAllyBanner(){
  document.getElementById('ally-banner-card').classList.remove('show');
  document.getElementById('war-banner-overlay').classList.remove('show');
}

/* ── Supabase Broadcast — diğer oyunculara ilet ── */
let _warChannel = null;
function getWarChannel(){
  if(_warChannel) return _warChannel;
  _warChannel = supabase.channel('war-declarations', { config:{ broadcast:{ self:false } } });
  _warChannel.on('broadcast', { event:'war' }, (payload)=>{
    const p = payload && payload.payload;
    if(!p) return;

    // Bu kullanıcının faction tag'i
    const myTag = (typeof factionData !== 'undefined' && factionData) ? factionData.tag : null;
    const isInvolved = myTag && (myTag === p.attackerTag || myTag === p.defenderTag);

    if (isInvolved) {
      // Savaşan faction üyesi → tam banner + ses + sarsıntı
      showWarBanner({
        attackerName: p.attackerName || '?',
        attackerColor: p.attackerColor || '#f04a4a',
        attackerEmoji: p.attackerEmoji || '⚑',
        defenderName: p.defenderName || '?',
        defenderColor: p.defenderColor || '#6366f1',
        defenderEmoji: p.defenderEmoji || '⚑'
      });
    } else {
      // Dışarıdaki oyuncu → sadece üstten küçük toast bildirimi + savaş sesi
      try {
        const snd = document.getElementById('war-declare-sound');
        if(snd){ snd.currentTime = 0; snd.volume = 0.45; snd.play().catch(()=>{}); }
      } catch(e){}
      showWarToast(p.attackerName || '?', p.attackerColor || '#f04a4a', p.defenderName || '?', p.defenderColor || '#6366f1');
    }
  });
  _warChannel.on('broadcast', { event:'ally' }, (payload)=>{
    const p = payload && payload.payload;
    if(!p) return;
    if(typeof SFX !== 'undefined') SFX.ally();
    showAllyBanner({
      f1Name: p.f1Name||'?', f1Color: p.f1Color||'#00d4a0',
      f2Name: p.f2Name||'?', f2Color: p.f2Color||'#6366f1'
    });
  });
  _warChannel.subscribe();
  return _warChannel;
}
// Sayfa açılır açılmaz dinle
getWarChannel();

function broadcastWarDeclaration(attacker, defender){
  try{
    getWarChannel().send({ type:'broadcast', event:'war', payload:{
      attackerName: attacker.name, attackerColor: attacker.color, attackerEmoji: attacker.emoji||'⚑',
      attackerTag: attacker.tag || '',
      defenderName: defender.name, defenderColor: defender.color, defenderEmoji: defender.emoji||'⚑',
      defenderTag: defender.tag || ''
    }});
  }catch(e){}
}

function broadcastAllyDeclaration(f1, f2){
  try{
    getWarChannel().send({ type:'broadcast', event:'ally', payload:{
      f1Name: f1.name, f1Color: f1.color,
      f2Name: f2.name, f2Color: f2.color
    }});
  }catch(e){}
}



/* ── Dışarıdaki oyuncular için küçük üst bildirim (toast) ── */
function showWarToast(attackerName, attackerColor, defenderName, defenderColor) {
  // Varsa eski toast'u kaldır
  const old = document.getElementById('war-toast-notif');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.id = 'war-toast-notif';
  toast.style.cssText = [
    'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:800;',
    'background:rgba(15,10,25,.92);backdrop-filter:blur(10px);',
    'border:1px solid rgba(240,74,74,.4);border-radius:12px;',
    'padding:.55rem 1rem;display:flex;align-items:center;gap:.55rem;',
    'font-family:"Outfit",sans-serif;font-size:.8rem;color:#fff;',
    'box-shadow:0 4px 20px rgba(0,0,0,.6);',
    'animation:warToastIn .3s ease;pointer-events:none;white-space:nowrap;'
  ].join('');

  toast.innerHTML = `
    <span style="font-size:1rem;">⚔️</span>
    <span>
      <b style="color:${attackerColor}">${attackerName}</b>
      <span style="color:rgba(255,255,255,.5)"> vs </span>
      <b style="color:${defenderColor}">${defenderName}</b>
      <span style="color:rgba(255,255,255,.4)"> — ${t('war.toast_started')}</span>
    </span>
  `;

  // CSS animasyonu yoksa ekle
  if (!document.getElementById('war-toast-style')) {
    const style = document.createElement('style');
    style.id = 'war-toast-style';
    style.textContent = `
      @keyframes warToastIn {
        from { opacity:0; transform:translateX(-50%) translateY(-10px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  // 5 saniye sonra kaldır
  setTimeout(() => toast && toast.remove(), 5000);
}
/* ESC ile kapat */
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    closeWarBanner();
    closeAllyBanner();
  }
});

