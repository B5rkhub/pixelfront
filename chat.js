// ── CHAT ──
let chatMessages=[];
let currentChatTab='global'; // 'global' | 'faction'

function switchChatTab(tab){
  currentChatTab=tab;
  document.getElementById('ch-tab-global').className='ch-tab'+(tab==='global'?' active':'');
  const fBtn=document.getElementById('ch-tab-faction');
  if(tab==='faction'){
    fBtn.className='ch-tab faction-active';
  } else {
    fBtn.className='ch-tab'+(factionData?'':' disabled');
  }
  const inp=document.getElementById('chat-input');
  if(tab==='faction'){
    if(!factionData){
      showPopup(t('msg.join_faction_first'));
      currentChatTab='global';
      document.getElementById('ch-tab-global').className='ch-tab active';
      fBtn.className='ch-tab';
      renderChatMessages();
      return;
    }
    inp.placeholder='Faction\'a mesaj yaz...';
  } else {
    inp.placeholder='Mesaj yaz...';
  }
  renderChatMessages();
  inp.focus();
}

function toggleChat(){
  const panel=document.getElementById('chat-panel');
  panel.classList.toggle('open');
  if(panel.classList.contains('open')){
    renderChatMessages();
    document.getElementById('chat-input').focus();
  }
}

function buildChatAvatar(entry, borderOverride){
  const av=document.createElement('div');
  av.className='cm-av';
  if(borderOverride){
    av.style.borderColor=borderOverride;
    av.style.background='transparent';
  } else {
    const borderCol=FRAME_BORDERS[entry.frame||'none']||'#7B61FF';
    const frame=FRAMES.find(f=>f.id===(entry.frame||'none'))||FRAMES[0];
    av.style.borderColor=borderCol;
    av.style.background=frame.style.replace('background:','');
  }
  if(entry.photo){
    const img=document.createElement('img');
    img.src=entry.photo;
    av.appendChild(img);
  } else {
    av.textContent=(entry.user||'?').slice(0,2).toUpperCase();
  }
  return av;
}

function buildChatBubble(entry, isMe){
  const wrap=document.createElement('div');
  wrap.className='cm-bubble';
  if(!isMe){
    const nm=document.createElement('div');
    nm.className='cm-name';
    nm.textContent=entry.user||'';
    wrap.appendChild(nm);
  }
  const txt=document.createElement('div');
  txt.className='cm-text';
  txt.textContent=entry.text;
  wrap.appendChild(txt);
  return wrap;
}

let _chatMsgCache=[];
let _chatRendering=false;

async function renderChatMessages(){
  if(_chatRendering) return;
  _chatRendering=true;
  const box=document.getElementById('chat-messages');
  const uname=typeof username!=='undefined'?username:'';

  if(currentChatTab==='global'){
    let log=[];
    try{
      const {data,error}=await supabase.from('chat_messages').select('*').eq('channel','global').order('created_at',{ascending:false}).limit(50);
      if(error) console.error('[chat] Mesajlar yüklenemedi:', error);
      if(data) data.reverse(); // en yeni 50'yi çektik, ekranda eskiden-yeniye göstermek için ters çeviriyoruz
      if(data&&!error){
        log=data.map(r=>({user:r.username,text:r.message,t:new Date(r.created_at).getTime(),photo:'',frame:'none'}));
        // DB'ye yazılamayıp localStorage'a düşmüş mesajlar varsa onları da ekle (kaybolmasınlar)
        try{
          const r=localStorage.getItem(CONFIG.storageKeys.chat);
          if(r){
            const pending=JSON.parse(r);
            const dbKeys=new Set(log.map(e=>e.user+'|'+e.text+'|'+Math.floor(e.t/1000)));
            pending.forEach(p=>{
              const k=p.user+'|'+p.text+'|'+Math.floor(p.t/1000);
              if(!dbKeys.has(k)) log.push(p);
            });
            log.sort((a,b)=>a.t-b.t);
          }
        }catch(e){}
      } else {
        if(error) console.error('[chat] Supabase select hatası, mesajlar DB\'den çekilemedi:', error);
        try{ const r=localStorage.getItem(CONFIG.storageKeys.chat); if(r) log=JSON.parse(r); }catch(e){}
      }
    }catch(e){
      console.error('[chat] Supabase select exception:', e);
      try{ const r=localStorage.getItem(CONFIG.storageKeys.chat); if(r) log=JSON.parse(r); }catch(e2){}
    } finally {
      _chatRendering=false;
    }
    // Sadece içerik değiştiyse DOM'u güncelle
    const newKeys=log.slice(-30).map(e=>e.t+'|'+e.user+'|'+e.text).join(',');
    if(newKeys===_chatMsgCache._globalKey) return;
    _chatMsgCache._globalKey=newKeys;
    const wasAtBottom=box.scrollHeight-box.scrollTop-box.clientHeight<40;
    box.innerHTML='';
    log.slice(-30).forEach(entry=>{
      const isMe=entry.user===uname;
      const el=document.createElement('div');
      el.className='cm '+(isMe?'user':'other');
      el.appendChild(buildChatAvatar(entry));
      el.appendChild(buildChatBubble(entry,isMe));
      box.appendChild(el);
    });
    if(wasAtBottom) box.scrollTop=box.scrollHeight;
    return;
  } else {
    _chatRendering=false;
    // Faction chat - localStorage'da kalsın
    if(!factionData){ box.innerHTML='<div style="text-align:center;padding:2rem;color:var(--muted);font-size:.75rem">⚑ Faction\'a katıl</div>'; return; }
    let log=[];
    try{ const r=localStorage.getItem(CONFIG.storageKeys.factionChat + factionData.tag); if(r) log=JSON.parse(r); }catch(e){}
    if(!log.length){ box.innerHTML=`<div style="text-align:center;padding:2rem;color:var(--muted);font-size:.75rem">💬 Henüz mesaj yok.<br><span style="font-size:.65rem;opacity:.6">[${factionData.tag}] kanalı</span></div>`; return; }
    log.slice(-40).forEach(entry=>{
      const isMe=entry.user===uname;
      let memberProf={};
      try{ memberProf=JSON.parse(localStorage.getItem(CONFIG.storageKeys.profile + entry.user)||'{}'); }catch(e){}
      const fEntry={...entry, photo:memberProf.photo||entry.photo||'', frame:entry.frame||'none'};
      const borderCol=factionData.color;
      const el=document.createElement('div');
      el.className='cm '+(isMe?'user':'other');
      el.appendChild(buildChatAvatar(fEntry, isMe?null:borderCol+'88'));
      el.appendChild(buildChatBubble(fEntry,isMe));
      box.appendChild(el);
    });
  }
  box.scrollTop=box.scrollHeight;
}

function addChatMsg(text, role){
  // Only used for global immediate render
  const uname=typeof username!=='undefined'?username:'Sen';
  const isMe=role==='user';
  const entry={user:uname, text, photo:profileData.photo||'', frame:profileData.frame||'none'};
  const box=document.getElementById('chat-messages');
  const el=document.createElement('div');
  el.className='cm '+(isMe?'user':'other');
  el.appendChild(buildChatAvatar(entry));
  el.appendChild(buildChatBubble(entry, isMe));
  box.appendChild(el);
  box.scrollTop=box.scrollHeight;
}

async function sendChatMsg(){
  const inp=document.getElementById('chat-input');
  const msg=inp.value.trim();
  if(!msg) return;
  inp.value='';
  const uname=typeof username!=='undefined'?username:'Anonim';

  if(currentChatTab==='faction'){
    if(!factionData){ showPopup(t('msg.join_faction_short')); return; }
    const entry={user:uname, text:msg, t:Date.now(), photo:profileData.photo||'', frame:profileData.frame||'none'};
    try{
      const key=CONFIG.storageKeys.factionChat + factionData.tag;
      const raw=localStorage.getItem(key);
      const log=raw?JSON.parse(raw):[];
      log.push(entry);
      if(log.length>100) log.splice(0,log.length-100);
      localStorage.setItem(key,JSON.stringify(log));
    }catch(e){}
  } else {
    // Global chat → Önce UI'a hemen ekle (optimistic update)
    const entry={user:uname, text:msg, t:Date.now(), photo:profileData&&profileData.photo||'', frame:profileData&&profileData.frame||'none'};
    addChatMsg(msg,'user');
    // Supabase'e kaydet (arka planda)
    supabase.from('chat_messages').insert({username:uname,message:msg,channel:'global'}).select()
      .then(({data,error})=>{
        if(error || !data || data.length===0){
          console.error('[chat] Mesaj DB\'ye yazılamadı:', error || 'boş yanıt (RLS reddi olabilir)');
          showPopup(t('msg.chat_send_failed') || '⚠ Mesaj gönderilemedi.');
          try{
            const raw=localStorage.getItem(CONFIG.storageKeys.chat);
            const log=raw?JSON.parse(raw):[];
            log.push(entry);
            if(log.length>100) log.splice(0,log.length-100);
            localStorage.setItem(CONFIG.storageKeys.chat,JSON.stringify(log));
          }catch(e2){}
        }
        // Cache'i temizle ki bir sonraki render yeniden çeksin
        if(_chatMsgCache) _chatMsgCache._globalKey='';
      })
      .catch(err=>{
        console.error('[chat] Ağ hatası, mesaj gönderilemedi:', err);
        showPopup(t('msg.conn_error'));
        try{
          const raw=localStorage.getItem(CONFIG.storageKeys.chat);
          const log=raw?JSON.parse(raw):[];
          log.push(entry);
          if(log.length>100) log.splice(0,log.length-100);
          localStorage.setItem(CONFIG.storageKeys.chat,JSON.stringify(log));
        }catch(e2){}
      });
  }
  inp.focus();
}

function loadChat(){
  // Update faction tab label if in faction
  updateChatFactionTab();
  if(document.getElementById('chat-panel').classList.contains('open')){
    renderChatMessages();
  }
}

function updateChatFactionTab(){
  const fBtn=document.getElementById('ch-tab-faction');
  if(!fBtn) return;
  if(factionData){
    fBtn.textContent='⚑ '+factionData.name;
    fBtn.style.opacity='1';
    fBtn.style.cursor='pointer';
  } else {
    fBtn.textContent='⚑ Faction';
    fBtn.style.opacity='.4';
    fBtn.style.cursor='default';
  }
}

// Realtime subscription mesajları anlık getiriyor, polling kaldırıldı

// Show chat+sidebar buttons after login
const _origStartGame2=window.startGame;
window.startGame=async function(){
  await _origStartGame2.apply(this,arguments);
  document.getElementById('chat-btn').style.display='flex';
  const btn=document.getElementById('sidebar-toggle');
  if(btn){ btn.style.display='flex'; initSidebarToggle(); }
  loadProfile();
  // Register this session's profile under username key
  try{
    if(username){
      localStorage.setItem(CONFIG.storageKeys.profile + username,JSON.stringify(profileData));
    }
  }catch(e){}
  updateProfileBtn();
  loadFactions();
  updateChatFactionTab();
  loadChat();
};

// Override toggleAdmin to also show/hide paint toolbar
const _origToggleAdmin=toggleAdmin;
window.toggleAdmin=function(){
  _origToggleAdmin();
  const toolbar=document.getElementById('paint-toolbar');
  toolbar.style.display=adminMode?'flex':'none';
};

// Paint on mouse events (oy pikseli silme)
canvas.addEventListener('mousedown',e=>{
  if(!adminMode) return;
  if(_recentTouch()) return; // bu jest zaten touch handler tarafından işleniyor/işlendi
  if(e.button!==0) return;
  isPainting=true;
  const r=canvas.getBoundingClientRect();
  paintPixel(e.clientX-r.left,e.clientY-r.top);
},true);
canvas.addEventListener('mousemove',e=>{
  if(!isPainting||!adminMode) return;
  if(_recentTouch()) return;
  const r=canvas.getBoundingClientRect();
  paintPixel(e.clientX-r.left,e.clientY-r.top);
},true);
// Also allow pixel erase on right-click drag for convenience
canvas.addEventListener('contextmenu',e=>{
  if(!adminMode) return;
  e.preventDefault();
});
canvas.addEventListener('mouseup',()=>{ isPainting=false; });
// ── Dokunmatik (mobil/tablet) eşdeğerleri — admin silme fırçası ──
// Not: rollback aracı açıkken bu dokunuş, aşağıdaki rollback dokunuş
// dinleyicisi (capture aşamasında daha sonra eklenmiş ve stopPropagation
// kullanan) tarafından engellenir; masaüstü mouse davranışıyla bire bir aynı.
// e.targetTouches kullanılıyor (e.touches değil) — sadece bu canvas'ta
// başlayan dokunuşları sayar, başka bir butona basılan ikinci el bunu etkilemez.
canvas.addEventListener('touchstart',e=>{
  _lastTouchTS = Date.now();
  if(!adminMode) return;
  if(e.targetTouches.length!==1) return;
  isPainting=true;
  const r=canvas.getBoundingClientRect();
  const t=e.targetTouches[0];
  paintPixel(t.clientX-r.left,t.clientY-r.top);
},{capture:true,passive:true});
canvas.addEventListener('touchmove',e=>{
  _lastTouchTS = Date.now();
  if(!isPainting||!adminMode) return;
  if(e.targetTouches.length!==1) return;
  const r=canvas.getBoundingClientRect();
  const t=e.targetTouches[0];
  paintPixel(t.clientX-r.left,t.clientY-r.top);
},{capture:true,passive:true});
canvas.addEventListener('touchend',()=>{ isPainting=false; },true);
canvas.addEventListener('touchcancel',()=>{ isPainting=false; },true);
canvas.addEventListener('mouseleave',()=>{
  isPainting=false;
  const preview=document.getElementById('hover-preview');
  if(preview) preview.style.display='none';
  document.getElementById('tip').style.opacity='0';
});

