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
  setChatUnread(tab,false);
  renderChatMessages();
  inp.focus();
}

function toggleChat(){
  const panel=document.getElementById('chat-panel');
  panel.classList.toggle('open');
  if(panel.classList.contains('open')){
    setChatUnread(currentChatTab,false);
    renderChatMessages();
    document.getElementById('chat-input').focus();
  }
}

// ── Unread badges ──
const _chatUnread={global:false, faction:false};
function setChatUnread(tab, val){
  _chatUnread[tab]=val;
  const tabBadge=document.getElementById(tab==='faction'?'chat-faction-badge':'chat-global-badge');
  if(tabBadge) tabBadge.style.display=val?'block':'none';
  const btnBadge=document.getElementById('chat-btn-badge');
  if(btnBadge) btnBadge.style.display=(_chatUnread.global||_chatUnread.faction)?'block':'none';
}

function chatChannelName(tab){
  return (tab==='faction' && factionData) ? ('faction:'+factionData.tag) : 'global';
}
function chatLocalKey(tab){
  return (tab==='faction' && factionData) ? (CONFIG.storageKeys.factionChat + factionData.tag) : CONFIG.storageKeys.chat;
}
function fmtChatTime(t){
  if(!t) return '';
  const d=new Date(t);
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
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
  if(entry.t){
    const tm=document.createElement('div');
    tm.className='cm-time';
    tm.textContent=fmtChatTime(entry.t);
    wrap.appendChild(tm);
  }
  return wrap;
}

let _chatMsgCache={};
let _chatRenderToken=0;

// Faction sohbeti de artık aynı chat_messages tablosunu kullanıyor
// (channel='faction:TAG'), global sohbetle aynı DB+realtime altyapısı üzerinden.
// Not: her çağrı kendi token'ını alır ve en son çağrı geçerli sayılır — böylece
// bir sekme geçişi, önceki sekmenin hâlâ süren fetch'i tarafından iptal edilmez.
async function renderChatMessages(){
  const tab=currentChatTab;
  const myToken=++_chatRenderToken;
  const box=document.getElementById('chat-messages');
  const uname=typeof username!=='undefined'?username:'';

  if(tab==='faction' && !factionData){
    box.innerHTML='<div style="text-align:center;padding:2rem;color:var(--muted);font-size:.75rem">⚑ '+t('chat.join_faction_empty')+'</div>';
    return;
  }

  const channel=chatChannelName(tab);
  const localKey=chatLocalKey(tab);
  let log=[];
  try{
    const {data,error}=await supabase.from('chat_messages').select('*').eq('channel',channel).order('created_at',{ascending:false}).limit(50);
    if(error) console.error('[chat] Mesajlar yüklenemedi:', error);
    if(data) data.reverse(); // en yeni 50'yi çektik, ekranda eskiden-yeniye göstermek için ters çeviriyoruz
    if(data&&!error){
      log=data.map(r=>({user:r.username,text:r.message,t:new Date(r.created_at).getTime(),photo:'',frame:'none'}));
      // DB'ye yazılamayıp localStorage'a düşmüş mesajlar varsa onları da ekle (kaybolmasınlar)
      try{
        const r=localStorage.getItem(localKey);
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
      try{ const r=localStorage.getItem(localKey); if(r) log=JSON.parse(r); }catch(e){}
    }
  }catch(e){
    console.error('[chat] Supabase select exception:', e);
    try{ const r=localStorage.getItem(localKey); if(r) log=JSON.parse(r); }catch(e2){}
  }
  if(myToken!==_chatRenderToken) return; // beklerken daha yeni bir render isteği başladı

  if(tab==='faction'){
    log=log.map(entry=>{
      let memberProf={};
      try{ memberProf=JSON.parse(localStorage.getItem(CONFIG.storageKeys.profile + entry.user)||'{}'); }catch(e){}
      return {...entry, photo:memberProf.photo||entry.photo||'', frame:entry.frame||'none'};
    });
  }

  // Sadece içerik değiştiyse VE zaten bu sekme ekranda duruyorsa DOM'u atla
  // (sekme değiştiğinde kutuda hâlâ diğer sekmenin mesajları görünüyor olabilir,
  // içerik aynı diye onu atlarsak yanlış sekme ekranda kalır)
  const cacheKey=tab==='faction'?'_factionKey':'_globalKey';
  const newKeys=channel+'|'+log.slice(-30).map(e=>e.t+'|'+e.user+'|'+e.text).join(',');
  if(newKeys===_chatMsgCache[cacheKey] && _chatMsgCache._paintedTab===tab) return;
  _chatMsgCache[cacheKey]=newKeys;
  _chatMsgCache._paintedTab=tab;

  if(!log.length){
    box.innerHTML=tab==='faction'
      ? `<div style="text-align:center;padding:2rem;color:var(--muted);font-size:.75rem">💬 ${t('chat.no_messages_yet')}<br><span style="font-size:.65rem;opacity:.6">[${factionData.tag}] ${t('chat.channel_suffix')}</span></div>`
      : '';
    return;
  }

  const wasAtBottom=box.scrollHeight-box.scrollTop-box.clientHeight<40;
  box.innerHTML='';
  const borderCol=tab==='faction'?factionData.color:null;
  log.slice(-30).forEach(entry=>{
    const isMe=entry.user===uname;
    const el=document.createElement('div');
    el.className='cm '+(isMe?'user':'other');
    el.appendChild(buildChatAvatar(entry, (tab==='faction'&&!isMe)?borderCol+'88':null));
    el.appendChild(buildChatBubble(entry,isMe));
    box.appendChild(el);
  });
  if(wasAtBottom) box.scrollTop=box.scrollHeight;
}

function addChatMsg(text, role, tab){
  tab=tab||currentChatTab;
  const uname=typeof username!=='undefined'?username:'Sen';
  const isMe=role==='user';
  const entry={user:uname, text, t:Date.now(), photo:profileData.photo||'', frame:profileData.frame||'none'};
  const box=document.getElementById('chat-messages');
  const el=document.createElement('div');
  el.className='cm '+(isMe?'user':'other');
  el.appendChild(buildChatAvatar(entry));
  el.appendChild(buildChatBubble(entry, isMe));
  box.appendChild(el);
  box.scrollTop=box.scrollHeight;
}

function _persistChatFallback(key, entry){
  try{
    const raw=localStorage.getItem(key);
    const log=raw?JSON.parse(raw):[];
    log.push(entry);
    if(log.length>100) log.splice(0,log.length-100);
    localStorage.setItem(key,JSON.stringify(log));
  }catch(e){}
}

let _chatSending=false;
async function sendChatMsg(){
  const inp=document.getElementById('chat-input');
  const msg=inp.value.trim();
  if(!msg || _chatSending) return;
  const tab=currentChatTab;
  if(tab==='faction' && !factionData){ showPopup(t('msg.join_faction_short')); return; }
  _chatSending=true;
  inp.value='';
  const uname=typeof username!=='undefined'?username:'Anonim';
  const channel=chatChannelName(tab);
  const localKey=chatLocalKey(tab);

  // Önce UI'a hemen ekle (optimistic update)
  const entry={user:uname, text:msg, t:Date.now(), photo:profileData&&profileData.photo||'', frame:profileData&&profileData.frame||'none'};
  addChatMsg(msg,'user',tab);
  const cacheKey=tab==='faction'?'_factionKey':'_globalKey';
  // Supabase'e kaydet (arka planda)
  supabase.from('chat_messages').insert({username:uname,message:msg,channel}).select()
    .then(({data,error})=>{
      if(error || !data || data.length===0){
        console.error('[chat] Mesaj DB\'ye yazılamadı:', error || 'boş yanıt (RLS reddi olabilir)');
        showPopup(t('msg.chat_send_failed'));
        _persistChatFallback(localKey, entry);
      }
      if(_chatMsgCache) _chatMsgCache[cacheKey]='';
    })
    .catch(err=>{
      console.error('[chat] Ağ hatası, mesaj gönderilemedi:', err);
      showPopup(t('msg.conn_error'));
      _persistChatFallback(localKey, entry);
    })
    .finally(()=>{ _chatSending=false; });
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
  if(fBtn){
    const label=document.getElementById('ch-tab-faction-label');
    if(factionData){
      if(label) label.textContent=factionData.name;
      fBtn.style.opacity='1';
      fBtn.style.cursor='pointer';
    } else {
      if(label) label.textContent=t('chat.tab_faction');
      fBtn.style.opacity='.4';
      fBtn.style.cursor='default';
    }
  }
  ensureFactionChatRealtime();
}

// ── Realtime: global sohbet her zaman, faction sohbeti dinamik olarak
// aktif faction'ın kanalına abone olur (faction değişince yeniden abone olunur) ──
let _globalChatChannel=null;
let _factionChatChannel=null;
let _subscribedFactionTag=null;

function startChatRealtimeSync(){
  if(_globalChatChannel) return; // bu oturumda zaten abone
  _globalChatChannel=supabase.channel('chat-changes-global').on(
    'postgres_changes',
    {event:'INSERT',schema:'public',table:'chat_messages',filter:'channel=eq.global'},
    payload=>handleIncomingChatRow(payload,'global')
  ).subscribe();
  ensureFactionChatRealtime();
}

function ensureFactionChatRealtime(){
  const tag=factionData?factionData.tag:null;
  if(tag===_subscribedFactionTag) return;
  if(_factionChatChannel){ supabase.removeChannel(_factionChatChannel); _factionChatChannel=null; }
  _subscribedFactionTag=tag;
  if(!tag) return;
  _factionChatChannel=supabase.channel('chat-changes-faction-'+tag).on(
    'postgres_changes',
    {event:'INSERT',schema:'public',table:'chat_messages',filter:'channel=eq.faction:'+tag},
    payload=>handleIncomingChatRow(payload,'faction')
  ).subscribe();
}

function handleIncomingChatRow(payload, tab){
  const row=payload.new;
  if(!row) return;
  const uname=typeof username!=='undefined'?username:'';
  // Kendi mesajımızı optimistic olarak zaten ekledik, tekrar ekleme
  if(row.username===uname && Date.now()-new Date(row.created_at).getTime()<5000){
    if(_chatMsgCache) _chatMsgCache[tab==='faction'?'_factionKey':'_globalKey']='';
    return;
  }
  const cacheKey=tab==='faction'?'_factionKey':'_globalKey';
  const panelOpen=document.getElementById('chat-panel').classList.contains('open');
  if(panelOpen && currentChatTab===tab){
    let entry={user:row.username,text:row.message,t:new Date(row.created_at).getTime(),photo:'',frame:'none'};
    if(tab==='faction'){
      let memberProf={};
      try{ memberProf=JSON.parse(localStorage.getItem(CONFIG.storageKeys.profile+entry.user)||'{}'); }catch(e){}
      entry={...entry, photo:memberProf.photo||'', frame:'none'};
    }
    const isMe=entry.user===uname;
    const box=document.getElementById('chat-messages');
    const borderOverride=(tab==='faction'&&!isMe&&factionData)?factionData.color+'88':null;
    const el=document.createElement('div');
    el.className='cm '+(isMe?'user':'other');
    el.appendChild(buildChatAvatar(entry, borderOverride));
    el.appendChild(buildChatBubble(entry,isMe));
    box.appendChild(el);
    box.scrollTop=box.scrollHeight;
    if(_chatMsgCache) _chatMsgCache[cacheKey]='';
  } else {
    if(_chatMsgCache) _chatMsgCache[cacheKey]='';
    setChatUnread(tab,true);
  }
}

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

