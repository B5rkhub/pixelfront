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
  document.getElementById('wb-desc').innerHTML =
    `<b>${_esc(attackerName)}</b> fraksiyonu <b>${_esc(defenderName)}</b> fraksiyonuna savaş ilan etti!<br>Harita artık çok daha tehlikeli bir yer.`;

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
  document.getElementById('ab-names').innerHTML =
    `<span style="color:${f1Color}">${_esc(f1Name)}</span> &amp; <span style="color:${f2Color}">${_esc(f2Name)}</span><br><span style="font-size:.72rem;color:rgba(255,255,255,.5);font-weight:600;">Artık aynı taraftalar!</span>`;
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
    showWarBanner({
      attackerName: p.attackerName || '?',
      attackerColor: p.attackerColor || '#f04a4a',
      attackerEmoji: p.attackerEmoji || '⚑',
      defenderName: p.defenderName || '?',
      defenderColor: p.defenderColor || '#6366f1',
      defenderEmoji: p.defenderEmoji || '⚑'
    });
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
      defenderName: defender.name, defenderColor: defender.color, defenderEmoji: defender.emoji||'⚑'
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

/* ESC ile kapat */
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    closeWarBanner();
    closeAllyBanner();
  }
});
