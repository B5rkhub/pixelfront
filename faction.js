// ═══════════════════════════════════════════════════════
// FACTION SİSTEMİ
// ═══════════════════════════════════════════════════════
let factionData = null;    // bu kullanıcının faction'ı
let allFactions = {};      // tüm factionlar: {tag: {name,tag,color,emoji,leader,members:[],diplomacy:{}}}
let _fcRenderLock = false; // createFaction/join sonrası arka plan render'ını engelle
let fcActiveTab = 'info';

const FC_COLORS = [
  '#f04a4a','#f97316','#f5a623','#eab308','#84cc16',
  '#22c55e','#00d4a0','#14b8a6','#06b6d4','#0ea5e9',
  '#3b82f6','#6366f1','#9b7fff','#a855f7','#ec4899',
  '#f43f5e','#ffffff','#94a3b8','#64748b','#1e293b',
];
const FC_EMOJIS = ['⚑','🏴','🔥','⚔️','🛡️','👑','🌙','⭐','🦅','🐉','🌊','🏔️','🎯','💎','🚀'];

// ── Supabase faction yükleyici (async) ──────────────────────────────────
// factions tablosu: id (uuid), name, color, tag, emoji, leader, invite,
//   members (jsonb), diplomacy (jsonb)  — eksik sütunlar data jsonb'de saklanır.
async function loadFactionsFromSupabase(){
  if(typeof supabase === 'undefined') return false;
  try{
    const { data, error } = await supabase.from('factions').select('*');
    if(error){ console.error('loadFactions supabase error:', error.code, error.message, error.details); return false; }
    if(!data) return false;
    allFactions = {};
    data.forEach(row => {
      // Ekstra alanları ya doğrudan sütunlardan ya da data/extra jsonb'den al
      const extra = row.data || row.extra || {};
      const f = {
        id:       row.id,
        name:     row.name,
        tag:      row.tag,
        color:    row.color || extra.color || '#7B61FF',
        emoji:    row.emoji || extra.emoji || '⚑',
        leader:   row.leader || extra.leader || '',
        invite:   row.invite || extra.invite || '',
        members:  row.members || extra.members || [],
        diplomacy:row.diplomacy || extra.diplomacy || {},
        totalPixels: row.total_pixels || extra.totalPixels || 0,
        createdAt: row.created_at || extra.createdAt || 0,
      };
      allFactions[f.tag] = f;
    });
    // localStorage'a da yaz (offline fallback)
    try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
    // Arama listesi açıksa güncelle
    const searchEl = document.getElementById('fc-search-in');
    if(searchEl && typeof filterFactionBrowse==='function') filterFactionBrowse();
    const searchEl2 = document.getElementById('fc-browse-home-search');
    if(searchEl2 && typeof filterFactionBrowseHome==='function') filterFactionBrowseHome();
    return true;
  }catch(e){ console.warn('loadFactions error:', e); return false; }
}

async function saveFactionsToSupabase(f){
  if(typeof supabase === 'undefined') return false;
  if(!f || !f.tag) return false;
  try{
    // Tam payload — tüm bilinen sütunlarla
    function _buildPayload(fat){
      const p = {
        name:     fat.name,
        tag:      fat.tag,
        color:    fat.color,
        emoji:    fat.emoji,
        leader:   fat.leader,
        invite:   fat.invite,
        members:  fat.members,
        diplomacy:fat.diplomacy,
      };
      if(fat.logo) p.logo = fat.logo;
      return p;
    }
    // Sütun hatası alınırsa data jsonb fallback
    async function _doSave(id, payload){
      if(id){
        const {error} = await supabase.from('factions').update(payload).eq('id', id);
        if(error && (error.code==='42703'||String(error.message).includes('column'))){
          // Bilinmeyen sütunları data jsonb'ye taşı
          const safePayload = { name:payload.name, tag:payload.tag, data: payload };
          const {error:e2} = await supabase.from('factions').update(safePayload).eq('id', id);
          if(e2) console.warn('saveFactions fallback update error:', e2);
        } else if(error){
          console.warn('saveFactions update error:', error);
        }
      } else {
        const {data:ins,error} = await supabase.from('factions').insert(payload).select('id').single();
        if(error && (error.code==='42703'||String(error.message).includes('column'))){
          const safePayload = { name:payload.name, tag:payload.tag, data: payload };
          const {data:ins2,error:e2} = await supabase.from('factions').insert(safePayload).select('id').single();
          if(e2){ console.warn('saveFactions fallback insert error:', e2); return null; }
          return ins2 && ins2.id;
        } else if(error){
          console.warn('saveFactions insert error:', error); return null;
        }
        return ins && ins.id;
      }
      return null;
    }
    const payload = _buildPayload(f);
    if(f.id){
      await _doSave(f.id, payload);
    } else {
      // Tag ile ara
      const { data: existing } = await supabase.from('factions').select('id').eq('tag', f.tag).maybeSingle();
      if(existing && existing.id){
        f.id = existing.id; allFactions[f.tag] = f;
        await _doSave(f.id, payload);
      } else {
        const newId = await _doSave(null, payload);
        if(newId){ f.id = newId; allFactions[f.tag] = f; }
      }
    }
    try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
    return true;
  }catch(e){ console.warn('saveFactions error:', e); return false; }
}

/* Supabase members listesine bakarak kullanıcının faction'ını bul,
   localStorage key eksikse de kurtarır */
function _detectMyFactionFromSupabase(){
  if(!username) return;
  try{
    const myTag = localStorage.getItem(CONFIG.storageKeys.myFaction + username);
    if(myTag && allFactions[myTag]){
      const inMembers = allFactions[myTag].members && allFactions[myTag].members.some(m=>m.name===username);
      if(inMembers){ factionData = allFactions[myTag]; return; }
      // Eski/yanlış key — temizle
      localStorage.removeItem(CONFIG.storageKeys.myFaction + username);
    }
  }catch(e){}
  // localStorage key yoksa tüm faction members'larını tara
  const found = Object.values(allFactions).find(f=>
    f.members && f.members.some(m=>m.name===username)
  );
  if(found){
    factionData = found;
    try{ localStorage.setItem(CONFIG.storageKeys.myFaction + username, found.tag); }catch(e){}
  } else {
    factionData = null;
  }
}

function loadFactions(){
  // Önce localStorage'dan hızlı yükle
  try{
    const raw = localStorage.getItem(CONFIG.storageKeys.factions);
    if(raw) allFactions = JSON.parse(raw);
  }catch(e){}
  _detectMyFactionFromSupabase();
  // Arka planda Supabase'den taze veri çek
  loadFactionsFromSupabase().then(ok=>{
    if(ok && !_fcRenderLock){
      _detectMyFactionFromSupabase();
      renderFactionModal();
    }
  });
}

function saveFactions(explicitFaction){
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  // Kaydedilecek faction: açıkça verilmişse onu, yoksa factionData'yı kullan
  const toSave = explicitFaction || factionData;
  if(toSave) saveFactionsToSupabase(toSave);
}
function generateCode(){
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

function openFactionModal(){
  fcActiveTab = 'info';
  document.getElementById('faction-modal').classList.add('open');
  // localStorage'dan anlık render
  try{
    const raw = localStorage.getItem(CONFIG.storageKeys.factions);
    if(raw) allFactions = JSON.parse(raw);
  }catch(e){}
  _detectMyFactionFromSupabase();
  renderFactionModal();
  // Supabase'den taze veri çek — ama sadece factionData yoksa ya da kilitsizse
  if(!_fcRenderLock){
    loadFactionsFromSupabase().then(ok=>{
      if(ok && !_fcRenderLock){
        _detectMyFactionFromSupabase();
        renderFactionModal();
      }
    });
  }
}
function closeFactionModal(){
  document.getElementById('faction-modal').classList.remove('open');
}

function renderFactionModal(){
  const body = document.getElementById('fc-body');
  if(!factionData){
    renderFactionCreate(body);
  } else {
    renderFactionHome(body);
  }
}

// ── Faction yok: Oluştur / Ara / Sıralama ──
function renderFactionCreate(body){
  document.getElementById('fc-title').textContent = t('faction.title');

  // Build sorted faction list
  const sorted = Object.values(allFactions).sort((a,b)=>{
    // Sort by member count desc, then by total pixels desc
    if(b.members.length !== a.members.length) return b.members.length - a.members.length;
    return (b.totalPixels||0) - (a.totalPixels||0);
  });

  function renderFactionList(list){
    if(!list.length) return `<div class="fc-empty" style="padding:.8rem"><strong>🔍</strong>${t('faction.no_results')}</div>`;
    return list.map((f,idx)=>{
      // GÜVENLİK: faction adı, tag'i ve logo URL'i kullanıcı tarafından
      // belirleniyor; bu liste herkesin göreceği bir tarama ekranı olduğu
      // için HTML'e gömülmeden önce kaçışlanmalı (stored XSS önleme).
      const safeName = _esc(f.name);
      const safeTag = _esc(f.tag);
      const safeLogo = _safeImgSrc(f.logo);
      const logoEl = safeLogo
        ? `<img src="${safeLogo}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0;">`
        : `<div style="width:36px;height:36px;border-radius:8px;background:${f.color}33;color:${f.color};display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">${f.emoji}</div>`;
      const medal = idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':'';
      return `<div class="fc-browse-row" onclick="joinFactionByTag('${safeTag}')">
        ${logoEl}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:.3rem;">
            ${medal?`<span style="font-size:.8rem">${medal}</span>`:`<span style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--muted);min-width:1.2rem">#${idx+1}</span>`}
            <span style="font-size:.8rem;font-weight:800;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName}</span>
            <span style="font-family:'Space Mono',monospace;font-size:.58rem;color:${f.color}">[${safeTag}]</span>
          </div>
          <div style="display:flex;gap:.6rem;margin-top:2px;">
            <span style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--muted)">👥 ${f.members.length}${t('faction.members_unit')}</span>
            ${(f.totalPixels||0)>0?`<span style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--accent)">🟣 ${f.totalPixels||0} px</span>`:''}
          </div>
        </div>
        <button class="fc-small-btn" style="font-size:.62rem;padding:.22rem .5rem;flex-shrink:0">${t('faction.join_btn')}</button>
      </div>`;
    }).join('');
  }

  body.innerHTML = `
    <div class="fc-empty"><strong>⚑</strong>${t('faction.no_faction_yet')}</div>

    <!-- Create -->
    <div style="display:flex;flex-direction:column;gap:.7rem;">
      <div class="pc-label">${t('faction.create_section')}</div>
      <div style="display:flex;gap:.5rem;">
        <div id="fc-emoji-pick" style="font-size:1.4rem;cursor:pointer;background:var(--surf2);border:1px solid var(--bdr);border-radius:8px;padding:.4rem .6rem;flex-shrink:0;" onclick="cycleEmoji()" title="${t('faction.emoji_pick_title')}">${FC_EMOJIS[0]}</div>
        <input class="pc-input" id="fc-name-in" placeholder="${t('faction.name_ph')}" maxlength="24" style="flex:1" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"/>
      </div>
      <input class="pc-input" id="fc-tag-in" placeholder="[${t('faction.tag_ph')}]" maxlength="5" style="text-transform:uppercase" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"/>
      <div>
        <div class="pc-label" style="margin-bottom:.4rem;">${t('faction.color_section')}</div>
        <div class="fc-color-grid" id="fc-color-grid">${FC_COLORS.map((c,i)=>`<div class="fc-color-swatch${i===0?' sel':''}" style="background:${c}" onclick="pickFcColor(this,'${c}')"></div>`).join('')}</div>
      </div>
      <button class="fc-btn" onclick="createFaction()">${t('faction.create_btn')}</button>
    </div>

    <!-- Browse & Search -->
    <div style="border-top:1px solid var(--bdr);padding-top:.7rem;display:flex;flex-direction:column;gap:.55rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="pc-label">${t('faction.ranking_title')}</div>
        <span id="fc-browse-count" style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--muted)">${sorted.length} faction</span>
      </div>
      <div style="position:relative;">
        <input class="pc-input" id="fc-search-in" placeholder="🔍 ${t('faction.search_ph')}" maxlength="30"
          oninput="filterFactionBrowse()" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search"
          style="padding-left:1.8rem"/>
        <span style="position:absolute;left:.6rem;top:50%;transform:translateY(-50%);font-size:.75rem;pointer-events:none">🔍</span>
      </div>
      <div id="fc-browse-list" style="display:flex;flex-direction:column;gap:.4rem;max-height:220px;overflow-y:auto;padding-right:2px;">
        ${sorted.length===0
          ? `<div class="fc-empty" style="padding:.8rem"><strong>🌐</strong>${t('faction.none_exist')}<br>${t('faction.be_first')}</div>`
          : renderFactionList(sorted)
        }
      </div>
    </div>

    <!-- Invite code fallback -->
    <div style="border-top:1px solid var(--bdr);padding-top:.6rem;display:flex;flex-direction:column;gap:.4rem;">
      <div class="pc-label">${t('faction.join_code_section')}</div>
      <div style="display:flex;gap:.5rem;">
        <input class="pc-input" id="fc-join-in" placeholder="${t('faction.invite_code_ph')}" maxlength="6" style="text-transform:uppercase;flex:1" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go"/>
        <button class="fc-small-btn" onclick="joinFactionByCode()">${t('faction.join_btn')}</button>
      </div>
    </div>
  `;

  window._fcSelectedColor = FC_COLORS[0];
  window._fcEmojiIdx = 0;

  // Store sorted list for filtering
  window._fcSortedList = sorted;
  window._fcRenderFactionList = renderFactionList;
}

function filterFactionBrowse(){
  const q = (document.getElementById('fc-search-in').value||'').trim().toLowerCase();
  // Her zaman güncel allFactions'tan yeniden sırala
  const sorted = Object.values(allFactions).sort((a,b)=>{
    if(b.members.length !== a.members.length) return b.members.length - a.members.length;
    return (b.totalPixels||0) - (a.totalPixels||0);
  });
  window._fcSortedList = sorted;
  const filtered = q ? sorted.filter(f=>
    f.name.toLowerCase().includes(q) ||
    f.tag.toLowerCase().includes(q)
  ) : sorted;
  const listEl = document.getElementById('fc-browse-list');
  const cntEl = document.getElementById('fc-browse-count');
  if(listEl && window._fcRenderFactionList) listEl.innerHTML = window._fcRenderFactionList(filtered);
  if(cntEl) cntEl.textContent = sorted.length + ' faction';
}

async function createFaction(){
  const name = (document.getElementById('fc-name-in').value||'').trim();
  const tag = (document.getElementById('fc-tag-in').value||'').trim().toUpperCase().replace(/[^A-ZÇĞİÖŞÜ0-9]/gi,'');
  const color = window._fcSelectedColor || '#7B61FF';
  const emoji = FC_EMOJIS[window._fcEmojiIdx||0];
  if(!name){ showPopup(t('msg.faction_name_required')); return; }
  if(tag.length<2){ showPopup(t('msg.faction_tag_short')); return; }
  // Supabase'de tag kontrolü
  if(typeof supabase !== 'undefined'){
    const { data: ex } = await supabase.from('factions').select('id').eq('tag', tag).maybeSingle();
    if(ex){ showPopup(t('msg.faction_tag_taken')); return; }
  } else {
    if(allFactions[tag]){ showPopup(t('msg.faction_tag_taken')); return; }
  }
  const invite = generateCode();
  const newFaction = {name, tag, color, emoji, leader: username, invite,
    members:[{name:username,role:'Lider',joined:Date.now()}],
    diplomacy:{}, createdAt:Date.now(), totalPixels:0};
  allFactions[tag] = newFaction;
  // Supabase'e kaydet
  if(typeof supabase !== 'undefined'){
    try{
      // Temel payload — tüm sütunlarla dene
      const basePayload = {
        name, tag, color, emoji, leader: username, invite,
        members: newFaction.members, diplomacy: {},
        created_at: new Date().toISOString()
      };
      let { data: ins, error: ie } = await supabase.from('factions').insert(basePayload).select('id').single();
      // members/diplomacy sütunu yoksa data jsonb'ye göm
      if(ie && (ie.code==='42703'||ie.message&&ie.message.includes('column'))){
        console.warn('Sütun hatası, data jsonb ile tekrar deneyin:', ie.message);
        const { data: ins2, error: ie2 } = await supabase.from('factions').insert({
          name, tag, color, emoji, leader: username, invite,
          data: { members: newFaction.members, diplomacy: {}, createdAt: Date.now(), totalPixels: 0 }
        }).select('id').single();
        ie = ie2; ins = ins2;
      }
      if(ie){
        console.error('createFaction supabase error:', ie);
        showPopup('⚠️ Fraksiyon kaydedilemedi: '+(ie.message||ie.code||JSON.stringify(ie)));
      } else if(ins && ins.id){
        allFactions[tag].id = ins.id;
        newFaction.id = ins.id;
      }
    }catch(e){
      console.error('createFaction supabase exception:', e);
      showPopup('⚠️ Fraksiyon kaydedilirken beklenmedik hata: '+(e.message||e));
    }
  }
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  try{ localStorage.setItem(CONFIG.storageKeys.myFaction + username, tag); }catch(e){}
  factionData = allFactions[tag];
  _fcRenderLock = true;  // arka plan Supabase render'ını engelle
  updateFactionBtn();
  if(typeof updateChatFactionTab==='function') updateChatFactionTab();
  showPopup(t('msg.faction_created', {name: name}));
  renderFactionModal();
  setTimeout(()=>{ _fcRenderLock = false; }, 3000); // 3s sonra kilidi aç
}

async function joinFactionByTag(tag){
  await loadFactionsFromSupabase();
  const found = allFactions[tag];
  if(!found){ showPopup(t('msg.faction_not_found')); return; }
  if(found.members.find(m=>m.name===username)){ showPopup(t('msg.faction_already_in')); return; }
  found.members.push({name:username,role:'Üye',joined:Date.now()});
  allFactions[found.tag] = found;
  try{ localStorage.setItem(CONFIG.storageKeys.myFaction + username, found.tag); }catch(e){}
  factionData = found;
  // factionData set edildikten SONRA kaydet
  await saveFactionsToSupabase(found);
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  _fcRenderLock = true;
  updateFactionBtn();
  if(typeof updateChatFactionTab==='function') updateChatFactionTab();
  showPopup(t('msg.faction_joined', {name: found.name}));
  renderFactionModal();
  setTimeout(()=>{ _fcRenderLock = false; }, 3000);
}

async function joinFactionByCode(){
  const code = (document.getElementById('fc-join-in').value||'').trim().toUpperCase();
  if(!code){ showPopup(t('msg.invite_code_required')); return; }
  // Supabase'den taze veri çek
  await loadFactionsFromSupabase();
  const found = Object.values(allFactions).find(f=>f.invite===code);
  if(!found){ showPopup(t('msg.invite_code_invalid')); return; }
  if(found.members.find(m=>m.name===username)){ showPopup(t('msg.faction_already_in')); return; }
  found.members.push({name:username,role:'Üye',joined:Date.now()});
  allFactions[found.tag] = found;
  try{ localStorage.setItem(CONFIG.storageKeys.myFaction + username, found.tag); }catch(e){}
  factionData = found;
  // factionData set edildikten SONRA kaydet
  await saveFactionsToSupabase(found);
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  _fcRenderLock = true;
  updateFactionBtn();
  if(typeof updateChatFactionTab==='function') updateChatFactionTab();
  showPopup(t('msg.faction_joined', {name: found.name}));
  renderFactionModal();
  setTimeout(()=>{ _fcRenderLock = false; }, 3000);
}

function joinFaction(){
  joinFactionByCode();
}

function cycleEmoji(){
  window._fcEmojiIdx = ((window._fcEmojiIdx||0)+1) % FC_EMOJIS.length;
  document.getElementById('fc-emoji-pick').textContent = FC_EMOJIS[window._fcEmojiIdx];
}
function pickFcColor(el, col){
  document.querySelectorAll('.fc-color-swatch').forEach(s=>s.classList.remove('sel'));
  el.classList.add('sel');
  window._fcSelectedColor = col;
}

// ── Faction var: Ana panel ──
// Faction "Sıralama" (stats) paneli — üyelerin piksel katkısına göre sıralı liste
function renderFactionStatsPanel(f){
  const sortedMembers = (f.members||[]).slice().sort((a,b)=>(b.contributed||0)-(a.contributed||0));
  if(sortedMembers.length===0){
    return `<div class="fc-empty"><strong>📊</strong>${t('stats.no_pixels')}</div>`;
  }
  return sortedMembers.map((m,idx)=>{
    const medal = idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':('#'+(idx+1));
    const safeName = _esc(m.name);
    const contributed = m.contributed||0;
    return `<div class="fc-member">
      <div class="fc-member-av" style="background:${f.color}">${_esc(m.name.slice(0,2).toUpperCase())}</div>
      <div class="fc-member-name">${medal} ${safeName}</div>
      <div style="font-family:'Space Mono',monospace;font-size:.65rem;color:var(--accent);font-weight:700">${contributed} px</div>
    </div>`;
  }).join('');
}

function renderFactionHome(body){
  const f = factionData;
  const isLeader = f.leader === username;
  document.getElementById('fc-title').textContent = f.emoji+' '+f.name;

  const myRole = (f.members.find(m=>m.name===username)||{}).role || 'Üye';
  const roleColor = myRole==='Lider'?'#f5a623':myRole==='Yönetici'?'#9b7fff':'#5a5a80';
  const roleBg = myRole==='Lider'?'#f5a62322':myRole==='Yönetici'?'#9b7fff22':'#ffffff11';
  const roleLabel = myRole==='Lider'?t('faction.leader'):myRole==='Yönetici'?t('faction.officer'):t('faction.member');

  // Diplomasi özeti (ittifak/savaş sayısı)
  const allies = Object.entries(f.diplomacy||{}).filter(([,v])=>v==='ally').length;
  const wars   = Object.entries(f.diplomacy||{}).filter(([,v])=>v==='war').length;

  // GÜVENLİK: faction adı, tag'i ve logo URL'i kullanıcı tarafından
  // belirleniyor (faction oluşturma/düzenleme ekranında) — başka bir
  // kullanıcının ekranına HTML olarak gömülmeden önce kaçışlanmalı.
  const safeFactionName = _esc(f.name);
  const safeFactionTag = _esc(f.tag);
  const safeLogo = _safeImgSrc(f.logo);

  // Logo HTML
  const logoHTML = safeLogo
    ? `<img src="${safeLogo}" style="width:54px;height:54px;border-radius:12px;object-fit:cover;">`
    : `<div class="fc-logo-inner" style="background:${f.color}33;color:${f.color};">${f.emoji}</div>`;

  body.innerHTML = `
    <!-- Banner -->
    <div class="fc-banner" style="background:${f.color}18;border-color:${f.color}44;">
      <div class="fc-logo-wrap" onclick="${isLeader?'uploadFactionLogo()':''}" title="${isLeader?t('faction.logo_upload_title'):''}">
        ${logoHTML}
        ${isLeader?`<div class="fc-logo-overlay">📷</div>`:''}
      </div>
      <input type="file" id="fc-logo-input" accept="image/*" style="display:none" onchange="handleFactionLogo(event)"/>
      <div class="fc-banner-info">
        <div class="fc-banner-name">${safeFactionName}</div>
        <div class="fc-banner-tag" style="color:${f.color}">[${safeFactionTag}]  •  ${f.members.length}${t('faction.members_unit')}</div>
        <div class="fc-banner-role" style="background:${roleBg};color:${roleColor}">${roleLabel}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;font-family:'Space Mono',monospace;font-size:.6rem;color:var(--muted);text-align:center;">
        <div style="color:#00d4a0;font-weight:700;">${allies}🤝</div>
        <div style="color:#f04a4a;font-weight:700;">${wars}⚔️</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="fc-tabs" style="flex-wrap:wrap;">
      <button class="fc-tab${fcActiveTab==='info'?' active':''}" onclick="switchFcTab('info')">📋 ${t('faction.tabs_info')}</button>
      <button class="fc-tab${fcActiveTab==='members'?' active':''}" onclick="switchFcTab('members')">👥 ${t('faction.members_title')}</button>
      <button class="fc-tab${fcActiveTab==='chat'?' active':''}" onclick="switchFcTab('chat')">💬 ${t('faction.tabs_chat')}</button>
      <button class="fc-tab${fcActiveTab==='diplomacy'?' active':''}" onclick="switchFcTab('diplomacy')">🤝 ${t('faction.tabs_diplomacy')}</button>
      <button class="fc-tab${fcActiveTab==='stats'?' active':''}" onclick="switchFcTab('stats')">📊 ${t('faction.tabs_stats')}</button>
      <button class="fc-tab${fcActiveTab==='browse'?' active':''}" onclick="switchFcTab('browse')">🔍 Keşfet</button>
      ${isLeader?`<button class="fc-tab${fcActiveTab==='settings'?' active':''}" onclick="switchFcTab('settings')">⚙ ${t('faction.tabs_settings')}</button>`:''}
    </div>

    <!-- INFO PANEL -->
    <div class="fc-panel${fcActiveTab==='info'?' active':''}" id="fc-panel-info">
      <div>
        <div class="pc-label" style="margin-bottom:.4rem">${t('faction.invite_label')}</div>
        <div class="fc-invite-box">
          <div class="fc-invite-code">${f.invite}</div>
          <button class="fc-copy-btn" onclick="navigator.clipboard.writeText('${f.invite}').then(()=>showPopup(t('msg.code_copied')))">${t('faction.copy')}</button>
        </div>
        <div style="font-size:.62rem;color:var(--muted);margin-top:.35rem;">${t('faction.invite_share_hint')}</div>
      </div>
      <div style="background:var(--surf2);border-radius:10px;padding:.75rem;display:flex;flex-direction:column;gap:.35rem;">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;"><span style="color:var(--muted)">${t('faction.member_count_label')}</span><span style="font-weight:700">${f.members.length}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.72rem;"><span style="color:var(--muted)">${t('faction.allies_label')}</span><span style="color:#00d4a0;font-weight:700">${allies}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.72rem;"><span style="color:var(--muted)">${t('faction.wars_label')}</span><span style="color:#f04a4a;font-weight:700">${wars}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.72rem;"><span style="color:var(--muted)">${t('faction.founded_label')}</span><span>${new Date(f.createdAt).toLocaleDateString(_currentLang==='tr'?'tr-TR':'en-US')}</span></div>
      </div>
      <button class="fc-btn danger" onclick="leaveFaction()" style="font-size:.75rem;">${isLeader?t('faction.disband_btn'):t('faction.leave_btn')}</button>
    </div>

    <!-- MEMBERS PANEL -->
    <div class="fc-panel${fcActiveTab==='members'?' active':''}" id="fc-panel-members">
      ${f.members.map(m=>{
        const mRole = m.role||'Üye';
        const mRoleCol = mRole==='Lider'?'#f5a623':mRole==='Yönetici'?'#9b7fff':'#5a5a80';
        const mRoleBg = mRole==='Lider'?'#f5a62322':mRole==='Yönetici'?'#9b7fff22':'#ffffff11';
        const mRoleLabel = mRole==='Lider'?t('faction.leader'):mRole==='Yönetici'?t('faction.officer'):t('faction.member');
        const isMe = m.name===username;
        const canKick = isLeader && !isMe;
        const canPromote = isLeader && !isMe && mRole==='Üye';
        const canDemote = isLeader && !isMe && mRole==='Yönetici';
        // Get member photo from localStorage
        let memberProf = {};
        try{ memberProf = JSON.parse(localStorage.getItem(CONFIG.storageKeys.profile + m.name)||'{}'); }catch(e){}
        // GÜVENLİK: kullanıcı adı (m.name) ve fotoğraf URL'i (memberProf.photo)
        // başka bir kullanıcının cihazına HTML olarak gömülmeden önce
        // kaçışlanıyor/doğrulanıyor (stored XSS önleme).
        const safePhoto = _safeImgSrc(memberProf.photo);
        const safeName = _esc(m.name);
        const memberAv = safePhoto
          ? `<div class="fc-member-av" style="border-color:${f.color}55"><img src="${safePhoto}"></div>`
          : `<div class="fc-member-av" style="background:${f.color};border-color:${f.color}55">${_esc(m.name.slice(0,2).toUpperCase())}</div>`;
        return `<div class="fc-member">
          ${memberAv}
          <div class="fc-member-name">${safeName}${isMe?` <span style="font-size:.55rem;color:var(--muted)">(${t('faction.you_suffix')})</span>`:''}</div>
          <div class="fc-member-role" style="background:${mRoleBg};color:${mRoleCol}">${mRoleLabel}</div>
          ${canPromote?`<button class="fc-member-kick" style="color:#9b7fff" onclick="promoteMember('${safeName}')" title="${t('faction.promote')}">▲</button>`:''}
          ${canDemote?`<button class="fc-member-kick" style="color:#f5a623" onclick="demoteMember('${safeName}')" title="${t('faction.demote')}">▼</button>`:''}
          ${canKick?`<button class="fc-member-kick" onclick="kickMember('${safeName}')" title="${t('faction.kick')}">✕</button>`:''}
        </div>`;
      }).join('')}
    </div>

    <!-- CHAT PANEL -->
    <div class="fc-panel${fcActiveTab==='chat'?' active':''}" id="fc-panel-chat">
      <div class="fc-chat-msgs" id="fc-chat-msgs"></div>
      <div class="fc-chat-footer">
        <input class="fc-chat-input" id="fc-chat-input" placeholder="${t('faction.chat_ph')}" maxlength="200" enterkeyhint="send"
          onkeydown="if(event.key==='Enter')sendFactionMsg()"/>
        <button class="fc-chat-send" onclick="sendFactionMsg()">→</button>
      </div>
    </div>

    <!-- DIPLOMACY PANEL -->
    <div class="fc-panel${fcActiveTab==='diplomacy'?' active':''}" id="fc-panel-diplomacy">
      ${Object.keys(allFactions).filter(tg=>tg!==f.tag).length===0
        ? `<div class="fc-empty"><strong>🤝</strong>${t('faction.no_other_factions')}</div>`
        : Object.entries(allFactions).filter(([tg])=>tg!==f.tag).map(([tag,of])=>{
          const status = (f.diplomacy||{})[tag] || 'neutral';
          const statusLabel = status==='ally'?'🤝 İttifak':status==='war'?'⚔️ Savaş':'☮️ Nötr';
          const statusGlow = status==='war'
            ? 'box-shadow:0 0 0 2px rgba(240,74,74,.5),0 0 12px rgba(240,74,74,.25);border-color:rgba(240,74,74,.4);'
            : status==='ally'
            ? 'box-shadow:0 0 0 2px rgba(0,212,160,.4),0 0 12px rgba(0,212,160,.18);border-color:rgba(0,212,160,.35);'
            : '';
          const cardBg = status==='war'
            ? 'background:linear-gradient(135deg,rgba(240,74,74,.07),rgba(185,28,28,.04));'
            : status==='ally'
            ? 'background:linear-gradient(135deg,rgba(0,212,160,.07),rgba(0,184,136,.04));'
            : '';
          // Bekleyen davet var mı?
          const pendingInvite = hasPendingAllyInvite(f.tag, tag);
          return `<div class="fc-diplo-item" style="${cardBg}${statusGlow}transition:all .2s;">
            <div class="fc-diplo-icon" style="width:36px;height:36px;border-radius:10px;background:${of.color}22;border:1px solid ${of.color}44;display:flex;align-items:center;justify-content:center;font-size:1.1rem;">
              ${of.logo?`<img src="${of.logo}" style="width:28px;height:28px;border-radius:6px;object-fit:cover">`:of.emoji||'⚑'}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:.78rem;font-weight:800;color:${of.color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(of.name)}</div>
              <div style="font-size:.58rem;color:var(--muted);font-family:'Space Mono',monospace;">[${_esc(of.tag)}] · ${of.members.length} üye</div>
            </div>
            <div class="fc-diplo-status ${status}" style="white-space:nowrap;">${statusLabel}</div>
            ${isLeader?`<div class="fc-diplo-actions" style="display:flex;gap:.25rem;flex-shrink:0;">
              ${status==='ally'
                ? `<button class="fc-diplo-btn" onclick="setDiplomacy('${tag}','neutral')" title="İttifakı Boz" style="border-color:var(--muted);color:var(--muted);">☮️</button>`
                : pendingInvite
                ? `<button class="fc-diplo-btn" disabled title="Davet gönderildi" style="opacity:.5;cursor:not-allowed;">⏳</button>`
                : `<button class="fc-diplo-btn ally-btn" onclick="sendAllyInvite('${tag}')" title="İttifak Daveti Gönder">🤝</button>`
              }
              <button class="fc-diplo-btn" onclick="setDiplomacy('${tag}','neutral')" title="Nötr" style="${status==='neutral'?'border-color:var(--accent);color:var(--accent);':''}">☮️</button>
              <button class="fc-diplo-btn war-btn" onclick="declareWarChecked('${tag}')" title="Savaş İlan Et" style="${status==='war'?'border-color:#f04a4a;color:#f04a4a;background:rgba(240,74,74,.12);':''}">⚔️</button>
            </div>`:''}
          </div>`;
        }).join('')
      }
      ${!isLeader?`<div style="text-align:center;font-size:.65rem;color:var(--muted);padding:.5rem;border-top:1px solid var(--bdr);margin-top:.3rem;">Diplomasi değişikliği yapmak için lider olman gerekiyor.</div>`:''}
    </div>

    <!-- STATS PANEL -->
    <div class="fc-panel${fcActiveTab==='stats'?' active':''}" id="fc-panel-stats">
      ${renderFactionStatsPanel(f)}
    </div>

    <!-- BROWSE (KEŞFET) PANEL -->
    <div class="fc-panel${fcActiveTab==='browse'?' active':''}" id="fc-panel-browse">
      <div style="display:flex;flex-direction:column;gap:.55rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="pc-label">Tüm Fraksiyonlar</div>
          <span style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--muted)" id="fc-browse-home-count">${Object.keys(allFactions).length} faction</span>
        </div>
        <div style="position:relative;">
          <input class="pc-input" id="fc-browse-home-search" placeholder="🔍 Fraksiyon ara..." maxlength="30"
            oninput="filterFactionBrowseHome()" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search"
            style="padding-left:1.8rem"/>
          <span style="position:absolute;left:.6rem;top:50%;transform:translateY(-50%);font-size:.75rem;pointer-events:none">🔍</span>
        </div>
        <div id="fc-browse-home-list" style="display:flex;flex-direction:column;gap:.4rem;max-height:320px;overflow-y:auto;padding-right:2px;">
          ${(()=>{
            const sorted2 = Object.values(allFactions).sort((a,b)=>{
              if(b.members.length!==a.members.length) return b.members.length-a.members.length;
              return (b.totalPixels||0)-(a.totalPixels||0);
            });
            if(!sorted2.length) return `<div class="fc-empty" style="padding:.8rem"><strong>🌐</strong>Henüz başka fraksiyon yok.</div>`;
            return sorted2.map((of,idx)=>{
              const safeName2=_esc(of.name);
              const safeTag2=_esc(of.tag);
              const safeLogo2=_safeImgSrc(of.logo);
              const logoEl2=safeLogo2
                ?`<img src="${safeLogo2}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0;">`
                :`<div style="width:36px;height:36px;border-radius:8px;background:${of.color}33;color:${of.color};display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">${of.emoji}</div>`;
              const medal2=idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':'';
              const isOwn=of.tag===f.tag;
              const dipStatus=(f.diplomacy||{})[of.tag]||'neutral';
              const dipBadge=dipStatus==='ally'
                ?`<span style="font-size:.55rem;background:#00d4a022;color:#00d4a0;border-radius:4px;padding:1px 4px;border:1px solid #00d4a055">🤝 İttifak</span>`
                :dipStatus==='war'
                ?`<span style="font-size:.55rem;background:#f04a4a22;color:#f04a4a;border-radius:4px;padding:1px 4px;border:1px solid #f04a4a55">⚔️ Savaş</span>`
                :'';
              return `<div class="fc-browse-row" style="${isOwn?'opacity:.5;pointer-events:none;':''}">
                ${logoEl2}
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:.3rem;flex-wrap:wrap;">
                    ${medal2?`<span style="font-size:.8rem">${medal2}</span>`:`<span style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--muted);min-width:1.2rem">#${idx+1}</span>`}
                    <span style="font-size:.8rem;font-weight:800;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName2}</span>
                    <span style="font-family:'Space Mono',monospace;font-size:.58rem;color:${of.color}">[${safeTag2}]</span>
                    ${isOwn?`<span style="font-size:.55rem;background:#ffffff11;color:var(--muted);border-radius:4px;padding:1px 4px;">Senin</span>`:''}
                    ${dipBadge}
                  </div>
                  <div style="display:flex;gap:.6rem;margin-top:2px;">
                    <span style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--muted)">👥 ${of.members.length}${t('faction.members_unit')}</span>
                    ${(of.totalPixels||0)>0?`<span style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--accent)">🟣 ${of.totalPixels||0} px</span>`:''}
                  </div>
                </div>
                ${!isOwn?`<button class="fc-small-btn" style="font-size:.62rem;padding:.22rem .5rem;flex-shrink:0" onclick="openDiplomacyFor('${safeTag2}')">İncele</button>`:''}
              </div>`;
            }).join('');
          })()}
        </div>
      </div>
    </div>

    <!-- SETTINGS PANEL -->
    ${isLeader?`<div class="fc-panel${fcActiveTab==='settings'?' active':''}" id="fc-panel-settings">
      <div>
        <div class="pc-label" style="margin-bottom:.4rem">${t('faction.new_invite_section')}</div>
        <button class="fc-btn secondary" onclick="regenerateInvite()" style="font-size:.75rem;">🔄 ${t('faction.new_code')}</button>
      </div>
      <div>
        <div class="pc-label" style="margin-bottom:.4rem">${t('faction.change_color_section')}</div>
        <div class="fc-color-grid" id="fc-settings-colors">${FC_COLORS.map((c)=>`<div class="fc-color-swatch${c===f.color?' sel':''}" style="background:${c}" onclick="changeFactionColor('${c}',this)"></div>`).join('')}</div>
      </div>
    </div>`:''}
  `;

  // Load chat messages if chat tab is active
  if(fcActiveTab==='chat') loadFactionChat();
}

function switchFcTab(tab){
  fcActiveTab = tab;
  renderFactionModal();
}

function filterFactionBrowseHome(){
  const q=(document.getElementById('fc-browse-home-search').value||'').trim().toLowerCase();
  const sorted=Object.values(allFactions).sort((a,b)=>{
    if(b.members.length!==a.members.length) return b.members.length-a.members.length;
    return (b.totalPixels||0)-(a.totalPixels||0);
  });
  const f=factionData;
  const filtered=q?sorted.filter(of=>of.name.toLowerCase().includes(q)||of.tag.toLowerCase().includes(q)):sorted;
  const list=document.getElementById('fc-browse-home-list');
  const cnt=document.getElementById('fc-browse-home-count');
  if(cnt) cnt.textContent=filtered.length+' faction';
  if(!list) return;
  if(!filtered.length){ list.innerHTML=`<div class="fc-empty" style="padding:.8rem"><strong>🔍</strong>Sonuç bulunamadı.</div>`; return; }
  list.innerHTML=filtered.map((of,idx)=>{
    const safeName2=_esc(of.name);
    const safeTag2=_esc(of.tag);
    const safeLogo2=_safeImgSrc(of.logo);
    const logoEl2=safeLogo2
      ?`<img src="${safeLogo2}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0;">`
      :`<div style="width:36px;height:36px;border-radius:8px;background:${of.color}33;color:${of.color};display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">${of.emoji}</div>`;
    const medal2=idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':'';
    const isOwn=of.tag===f.tag;
    const dipStatus=(f.diplomacy||{})[of.tag]||'neutral';
    const dipBadge=dipStatus==='ally'
      ?`<span style="font-size:.55rem;background:#00d4a022;color:#00d4a0;border-radius:4px;padding:1px 4px;border:1px solid #00d4a055">🤝 İttifak</span>`
      :dipStatus==='war'
      ?`<span style="font-size:.55rem;background:#f04a4a22;color:#f04a4a;border-radius:4px;padding:1px 4px;border:1px solid #f04a4a55">⚔️ Savaş</span>`
      :'';
    return `<div class="fc-browse-row" style="${isOwn?'opacity:.5;pointer-events:none;':''}">
      ${logoEl2}
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:.3rem;flex-wrap:wrap;">
          ${medal2?`<span style="font-size:.8rem">${medal2}</span>`:`<span style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--muted);min-width:1.2rem">#${idx+1}</span>`}
          <span style="font-size:.8rem;font-weight:800;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName2}</span>
          <span style="font-family:'Space Mono',monospace;font-size:.58rem;color:${of.color}">[${safeTag2}]</span>
          ${isOwn?`<span style="font-size:.55rem;background:#ffffff11;color:var(--muted);border-radius:4px;padding:1px 4px;">Senin</span>`:''}
          ${dipBadge}
        </div>
        <div style="display:flex;gap:.6rem;margin-top:2px;">
          <span style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--muted)">👥 ${of.members.length}${t('faction.members_unit')}</span>
          ${(of.totalPixels||0)>0?`<span style="font-family:'Space Mono',monospace;font-size:.6rem;color:var(--accent)">🟣 ${of.totalPixels||0} px</span>`:''}
        </div>
      </div>
      ${!isOwn?`<button class="fc-small-btn" style="font-size:.62rem;padding:.22rem .5rem;flex-shrink:0" onclick="openDiplomacyFor('${safeTag2}')">İncele</button>`:''}
    </div>`;
  }).join('');
}

/* Keşfet panelinden "İncele" tıklanınca diplomasi sekmesine geç */
function openDiplomacyFor(tag){
  fcActiveTab='diplomacy';
  renderFactionModal();
  setTimeout(()=>{
    const rows=document.querySelectorAll('#fc-panel-diplomacy .fc-diplo-item');
    rows.forEach(row=>{
      const tagEl=row.querySelector('[data-tag]');
      if(tagEl&&tagEl.dataset.tag===tag){
        row.style.outline='2px solid var(--accent)';
        row.scrollIntoView({behavior:'smooth',block:'nearest'});
        setTimeout(()=>row.style.outline='',1800);
      }
    });
  },120);
}

async function leaveFaction(){
  const f = factionData;
  const isLeader = f.leader === username;
  if(isLeader){
    if(!confirm(t('faction.disband_confirm'))) return;
    // Supabase'den sil
    if(typeof supabase !== 'undefined' && f.id){
      try{ await supabase.from('factions').delete().eq('id', f.id); }catch(e){}
    } else if(typeof supabase !== 'undefined'){
      try{ await supabase.from('factions').delete().eq('tag', f.tag); }catch(e){}
    }
    delete allFactions[f.tag];
    f.members.forEach(m=>{
      try{ localStorage.removeItem(CONFIG.storageKeys.myFaction + m.name); }catch(e){}
    });
  } else {
    // Önce üye listesini güncelle
    allFactions[f.tag].members = allFactions[f.tag].members.filter(m=>m.name!==username);
    try{ localStorage.removeItem(CONFIG.storageKeys.myFaction + username); }catch(e){}
    // Supabase'e güncel üye listesini kaydet (factionData henüz null olmadan)
    await saveFactionsToSupabase(allFactions[f.tag]);
    try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  }
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  factionData = null;
  updateFactionBtn();
  showPopup(isLeader?t('msg.faction_disbanded'):t('msg.faction_left'));
  renderFactionModal();
}

function kickMember(memberName){
  if(!factionData) return;
  factionData.members = factionData.members.filter(m=>m.name!==memberName);
  allFactions[factionData.tag] = factionData;
  try{ localStorage.removeItem(CONFIG.storageKeys.myFaction + memberName); }catch(e){}
  saveFactionsToSupabase(factionData);
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  showPopup(t('msg.member_kicked', {name: memberName}));
  renderFactionModal();
}
function promoteMember(memberName){
  if(!factionData) return;
  const m = factionData.members.find(x=>x.name===memberName);
  if(m) m.role='Yönetici';
  allFactions[factionData.tag]=factionData;
  saveFactionsToSupabase(factionData);
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  showPopup(t('msg.member_promoted', {name: memberName}));
  renderFactionModal();
}
function demoteMember(memberName){
  if(!factionData) return;
  const m = factionData.members.find(x=>x.name===memberName);
  if(m) m.role='Üye';
  allFactions[factionData.tag]=factionData;
  saveFactionsToSupabase(factionData);
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  showPopup(t('msg.member_demoted', {name: memberName}));
  renderFactionModal();
}

// ── POSTA KUTUSU SİSTEMİ ──────────────────────────────────────────────────
// Mailler localStorage'da tutulur: [{id, type, from, fromTag, fromColor, fromEmoji,
//   to, toTag, msg, ts, read, pending}]
// type: 'ally_invite' | 'ally_accept' | 'ally_reject' | 'war_declared' | 'war_info'

function getMails(){
  try{ return JSON.parse(localStorage.getItem(CONFIG.storageKeys.mailbox + username)||'[]'); }catch(e){ return []; }
}
function saveMails(mails){
  try{ localStorage.setItem(CONFIG.storageKeys.mailbox + username, JSON.stringify(mails)); }catch(e){}
}
function addMail(mail){
  const mails = getMails();
  mails.unshift({...mail, id: Date.now()+'_'+Math.random().toString(36).slice(2), ts: Date.now(), read: false});
  // Maksimum 50 mail tut
  if(mails.length > 50) mails.splice(50);
  saveMails(mails);
  updateMailboxBadge();
}
function updateMailboxBadge(){
  const badge = document.getElementById('mailbox-badge');
  if(!badge) return;
  const unread = getMails().filter(m=>!m.read).length;
  if(unread > 0){
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display='flex';
  } else {
    badge.style.display='none';
  }
}
function openMailbox(){
  renderMailbox();
  document.getElementById('mailbox-modal').classList.add('open');
  // Hepsini okundu işaretle
  const mails = getMails().map(m=>({...m, read:true}));
  saveMails(mails);
  updateMailboxBadge();
}
function closeMailbox(){
  document.getElementById('mailbox-modal').classList.remove('open');
}
function clearReadMails(){
  const mails = getMails().filter(m=>!m.read);
  saveMails(mails);
  renderMailbox();
}
function renderMailbox(){
  const list = document.getElementById('mailbox-list');
  if(!list) return;
  const mails = getMails();
  if(mails.length===0){
    list.innerHTML='<div class="mail-empty">📭 Posta kutunuz boş.</div>';
    return;
  }
  list.innerHTML = mails.map(m=>{
    const time = new Date(m.ts).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    let icon='📩', title='', body='', actions='';
    if(m.type==='ally_invite'){
      icon='🤝'; title=`<b>${_esc(m.from)}</b> [${_esc(m.fromTag)}] İttifak Daveti`;
      body=`<b>${_esc(m.from)}</b> fraksiyonu sizi ittifaka davet ediyor.`;
      if(m.pending!==false){
        actions=`<button class="mail-accept-btn" onclick="acceptAllyInvite('${m.id}','${m.fromTag}')">✅ Kabul Et</button>
                 <button class="mail-reject-btn" onclick="rejectAllyInvite('${m.id}','${m.fromTag}')">❌ Reddet</button>`;
      } else {
        actions=`<span style="font-size:.62rem;color:var(--muted);">${m.resolved==='accepted'?'✅ Kabul edildi':'❌ Reddedildi'}</span>`;
      }
    } else if(m.type==='ally_accept'){
      icon='🎉'; title=`<b>${_esc(m.from)}</b> İttifak Davetini Kabul Etti`;
      body=`<b>${_esc(m.from)}</b> fraksiyonu ittifak davetinizi kabul etti! Artık müttefiksiniz.`;
    } else if(m.type==='ally_reject'){
      icon='💔'; title=`<b>${_esc(m.from)}</b> İttifak Davetini Reddetti`;
      body=`<b>${_esc(m.from)}</b> fraksiyonu ittifak davetinizi reddetti.`;
    } else if(m.type==='war_declared'){
      icon='⚔️'; title=`<b>${_esc(m.from)}</b> Size Savaş İlan Etti!`;
      body=`<b>${_esc(m.from)}</b> [${_esc(m.fromTag)}] fraksiyonunuza savaş ilan etti!`;
    } else if(m.type==='war_info'){
      icon='📢'; title=m.subject||'Savaş Bildirimi';
      body=m.body||'';
    } else {
      icon='📩'; title=m.subject||'Bildirim'; body=m.body||'';
    }
    return `<div class="mail-item${m.read?'':' unread'}">
      <div class="mail-item-top">${icon} ${title} <span style="margin-left:auto;font-size:.55rem;color:var(--muted);font-weight:400;">${time}</span></div>
      <div class="mail-item-body">${body}</div>
      ${actions?`<div class="mail-item-actions">${actions}</div>`:''}
    </div>`;
  }).join('');
}

// ── İTTİFAK DAVETİ SİSTEMİ ──────────────────────────────────────────────
// Bekleyen davetler localStorage'da: pv_ally_invites = [{from, fromTag, to, toTag, ts}]
function getAllyInvites(){
  try{ return JSON.parse(localStorage.getItem(CONFIG.storageKeys.allyInvites)||'[]'); }catch(e){ return []; }
}
function saveAllyInvites(inv){ try{ localStorage.setItem(CONFIG.storageKeys.allyInvites, JSON.stringify(inv)); }catch(e){} }

function hasPendingAllyInvite(fromTag, toTag){
  return getAllyInvites().some(i=>i.fromTag===fromTag && i.toTag===toTag);
}

function sendAllyInvite(targetTag){
  if(!factionData) return;
  if(hasPendingAllyInvite(factionData.tag, targetTag)){
    showPopup('⏳ Bu fraksiyona zaten davet gönderildi.');
    return;
  }
  const targetFaction = allFactions[targetTag];
  if(!targetFaction){ showPopup('Fraksiyon bulunamadı.'); return; }
  // Davet kaydı
  const invites = getAllyInvites();
  invites.push({from: factionData.name, fromTag: factionData.tag,
                to: targetFaction.name, toTag: targetTag, ts: Date.now()});
  saveAllyInvites(invites);
  // Broadcast ile karşı tarafa gönder
  try{
    getWarChannel().send({ type:'broadcast', event:'ally_invite', payload:{
      from: factionData.name, fromTag: factionData.tag,
      fromColor: factionData.color, fromEmoji: factionData.emoji||'⚑',
      to: targetFaction.name, toTag: targetTag,
      ts: Date.now()
    }});
  }catch(e){}
  showPopup(`🤝 ${targetFaction.name} fraksiyonuna ittifak daveti gönderildi!`);
  renderFactionModal();
}

function acceptAllyInvite(mailId, fromTag){
  if(!factionData) return;
  // Davet mailini "kabul edildi" olarak işaretle
  const mails = getMails().map(m=>{
    if(m.id===mailId) return {...m, pending:false, resolved:'accepted', read:true};
    return m;
  });
  saveMails(mails);
  // Kendi diplomasisini güncelle
  if(!factionData.diplomacy) factionData.diplomacy={};
  factionData.diplomacy[fromTag] = 'ally';
  allFactions[factionData.tag] = factionData;
  saveFactionsToSupabase(factionData);
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  // Bekleyen daveti sil
  const invites = getAllyInvites().filter(i=>!(i.toTag===factionData.tag && i.fromTag===fromTag));
  saveAllyInvites(invites);
  // Karşı tarafa kabul bildirimi gönder (broadcast)
  const fromFaction = allFactions[fromTag];
  try{
    getWarChannel().send({ type:'broadcast', event:'ally_accept', payload:{
      from: factionData.name, fromTag: factionData.tag,
      fromColor: factionData.color,
      toTag: fromTag, ts: Date.now()
    }});
  }catch(e){}
  showAllyBanner({
    f1Name: factionData.name, f1Color: factionData.color, f1Emoji: factionData.emoji||'⚑',
    f2Name: fromFaction?fromFaction.name:fromTag, f2Color: fromFaction?fromFaction.color:'#6c5ce7'
  });
  if(typeof SFX!=='undefined') SFX.ally();
  renderMailbox();
  renderFactionModal();
  showPopup('✅ İttifak kuruldu!');
}

function rejectAllyInvite(mailId, fromTag){
  if(!factionData) return;
  const mails = getMails().map(m=>{
    if(m.id===mailId) return {...m, pending:false, resolved:'rejected', read:true};
    return m;
  });
  saveMails(mails);
  // Bekleyen daveti sil
  const invites = getAllyInvites().filter(i=>!(i.toTag===factionData.tag && i.fromTag===fromTag));
  saveAllyInvites(invites);
  // Karşı tarafa red bildirimi
  try{
    getWarChannel().send({ type:'broadcast', event:'ally_reject', payload:{
      from: factionData.name, fromTag: factionData.tag,
      toTag: fromTag, ts: Date.now()
    }});
  }catch(e){}
  renderMailbox();
  showPopup('❌ Davet reddedildi.');
}

// ── SAVAŞ LİMİTİ KONTROLÜ ──────────────────────────────────────────────
const MAX_WARS = CONFIG.game.maxActiveWars;

function getActiveWarCount(){
  if(!factionData) return 0;
  return Object.values(factionData.diplomacy||{}).filter(v=>v==='war').length;
}

function declareWarChecked(targetTag){
  if(!factionData) return;
  const currentStatus = (factionData.diplomacy||{})[targetTag] || 'neutral';
  if(currentStatus === 'war'){
    // Zaten savaştalar, nötre çek
    setDiplomacy(targetTag, 'neutral');
    return;
  }
  const warCount = getActiveWarCount();
  if(warCount >= MAX_WARS){
    showPopup(`⚠️ Maksimum ${MAX_WARS} fraksiyona aynı anda savaş açabilirsiniz!`);
    return;
  }
  if(!confirm(`⚔️ ${allFactions[targetTag]?.name||targetTag} fraksiyonuna savaş ilan etmek istiyor musunuz?`)) return;
  setDiplomacy(targetTag, 'war');
}

function initMailboxChannel(){
  getWarChannel(); // Kanalı başlat, listener'lar aşağıda ekleniyor
}

function setupMailboxListeners(){
  const ch = getWarChannel();
  ch.on('broadcast', { event:'ally_invite' }, (payload)=>{
    const p = payload && payload.payload;
    if(!p) return;
    // Bize mi geldi?
    if(!factionData || factionData.tag !== p.toTag) return;
    addMail({
      type:'ally_invite',
      from: p.from, fromTag: p.fromTag,
      fromColor: p.fromColor, fromEmoji: p.fromEmoji,
      pending: true
    });
    showPopup(`🤝 ${p.from} fraksiyonundan ittifak daveti aldınız!`);
  });
  ch.on('broadcast', { event:'ally_accept' }, (payload)=>{
    const p = payload && payload.payload;
    if(!p) return;
    if(!factionData || factionData.tag !== p.toTag) return;
    // Karşı taraf da artık ally — kendi verimizi güncelle
    if(!factionData.diplomacy) factionData.diplomacy={};
    factionData.diplomacy[p.fromTag] = 'ally';
    allFactions[factionData.tag] = factionData;
    saveFactionsToSupabase(factionData);
    try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
    // Bekleyen daveti sil
    const invites = getAllyInvites().filter(i=>!(i.fromTag===factionData.tag && i.toTag===p.fromTag));
    saveAllyInvites(invites);
    addMail({ type:'ally_accept', from: p.from, fromTag: p.fromTag });
    showPopup(`🎉 ${p.from} ittifak davetinizi kabul etti!`);
    renderFactionModal();
  });
  ch.on('broadcast', { event:'ally_reject' }, (payload)=>{
    const p = payload && payload.payload;
    if(!p) return;
    if(!factionData || factionData.tag !== p.toTag) return;
    // Bekleyen daveti sil
    const invites = getAllyInvites().filter(i=>!(i.fromTag===factionData.tag && i.toTag===p.fromTag));
    saveAllyInvites(invites);
    addMail({ type:'ally_reject', from: p.from, fromTag: p.fromTag });
    showPopup(`💔 ${p.from} ittifak davetinizi reddetti.`);
    renderFactionModal();
  });
}

// Sayfa yüklenince mail badge güncelle ve listener'ları kur
setTimeout(()=>{
  updateMailboxBadge();
  setupMailboxListeners();
}, 1500);

function setDiplomacy(targetTag, status){
  if(!factionData) return;
  if(!factionData.diplomacy) factionData.diplomacy={};
  const prevStatus = factionData.diplomacy[targetTag] || 'neutral';
  factionData.diplomacy[targetTag] = status;
  allFactions[factionData.tag] = factionData;
  // Kendi faction'ımızı kaydet
  saveFactionsToSupabase(factionData);
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  const label = status==='ally'?t('diplomacy.ally'):status==='war'?t('diplomacy.war'):t('diplomacy.neutral');
  showPopup(t('msg.relation_set', {tag: targetTag, label: label}));

  const targetFaction = allFactions[targetTag];
  const targetName = targetFaction ? targetFaction.name : targetTag;
  const targetColor = targetFaction ? targetFaction.color : '#f04a4a';
  const targetEmoji = targetFaction ? (targetFaction.emoji || '⚑') : '⚑';

  if(status === 'war'){
    // Savaş bildirimi banner'ı
    showWarBanner({
      attackerName: factionData.name,
      attackerColor: factionData.color,
      attackerEmoji: factionData.emoji || '⚑',
      defenderName: targetName,
      defenderColor: targetColor,
      defenderEmoji: targetEmoji
    });

    // Karşı faction'ın diplomacy'sini de otomatik "war" yap
    // (Karşı tarafın tekrar savaş açmasına gerek kalmasın)
    (async function() {
      if (typeof supabase === 'undefined') return;
      try {
        const { data: tf } = await supabase.from('factions').select('id,diplomacy').eq('tag', targetTag).single();
        if (tf) {
          const newDiplo = Object.assign({}, tf.diplomacy || {});
          newDiplo[factionData.tag] = 'war';
          await supabase.from('factions').update({ diplomacy: newDiplo }).eq('id', tf.id);
        }
      } catch(e) { console.warn('auto-war diplo update failed:', e); }
    })();

    // Supabase broadcast ile ilet — faction tag bilgilerini de ekle
    broadcastWarDeclaration(
      Object.assign({}, factionData, { tag: factionData.tag }),
      Object.assign({}, targetFaction || {name:targetTag, color:targetColor, emoji:targetEmoji}, { tag: targetTag })
    );
  } else if(status === 'ally'){
    if(typeof SFX !== 'undefined') SFX.ally();
    showAllyBanner({
      f1Name: factionData.name, f1Color: factionData.color, f1Emoji: factionData.emoji || '⚑',
      f2Name: targetName, f2Color: targetColor, f2Emoji: targetEmoji
    });
    broadcastAllyDeclaration(factionData, targetFaction || {name:targetTag, color:targetColor, emoji:targetEmoji, tag:targetTag});
  } else {
    if(typeof SFX !== 'undefined') SFX.peace();
  }

  renderFactionModal();
}

function regenerateInvite(){
  if(!factionData) return;
  factionData.invite = generateCode();
  allFactions[factionData.tag] = factionData;
  saveFactionsToSupabase(factionData);
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  showPopup(t('msg.new_invite_code', {code: factionData.invite}));
  renderFactionModal();
}

// ── Faction Logo Upload ──
function uploadFactionLogo(){
  const inp = document.getElementById('fc-logo-input');
  if(inp) inp.click();
}
function handleFactionLogo(event){
  const file = event.target.files[0];
  if(!file||!factionData) return;
  const reader = new FileReader();
  reader.onload = e => {
    factionData.logo = e.target.result;
    allFactions[factionData.tag] = factionData;
    saveFactionsToSupabase(factionData);
    try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
    showPopup(t('msg.logo_updated'));
    renderFactionModal();
  };
  reader.readAsDataURL(file);
}

// ── Faction Chat ──
function getFactionChatKey(){
  return factionData ? CONFIG.storageKeys.factionChat + factionData.tag : null;
}
function loadFactionChat(){
  const box = document.getElementById('fc-chat-msgs');
  if(!box||!factionData) return;
  let log = [];
  try{
    const raw = localStorage.getItem(getFactionChatKey());
    if(raw) log = JSON.parse(raw);
  }catch(e){}
  box.innerHTML = '';
  log.slice(-40).forEach(entry => {
    const isMe = entry.user === username;
    let memberProf = {};
    try{ memberProf = JSON.parse(localStorage.getItem(CONFIG.storageKeys.profile + entry.user)||'{}'); }catch(e){}
    // GÜVENLİK: faction sohbetindeki kullanıcı adı, fotoğraf URL'i ve mesaj
    // metni — hepsi kullanıcı tarafından belirleniyor, başka bir üyenin
    // ekranına HTML olarak gömülmeden önce kaçışlanmalı (stored XSS önleme).
    const safeEntryUser = _esc(entry.user||'?');
    const safePhoto = _safeImgSrc(memberProf.photo);
    const avHTML = safePhoto
      ? `<div class="fc-cav" style="border-color:${factionData.color}55"><img src="${safePhoto}"></div>`
      : `<div class="fc-cav" style="background:${factionData.color};border-color:${factionData.color}55">${_esc((entry.user||'?').slice(0,2).toUpperCase())}</div>`;
    const el = document.createElement('div');
    el.className = 'fc-cmsg'+(isMe?' me':'');
    el.innerHTML = `
      ${avHTML}
      <div class="fc-cbubble">
        ${!isMe?`<div class="fc-cname">${safeEntryUser}</div>`:''}
        <div class="fc-ctext">${_esc(entry.text)}</div>
      </div>`;
    box.appendChild(el);
  });
  box.scrollTop = box.scrollHeight;
  const inp = document.getElementById('fc-chat-input');
  if(inp && document.activeElement!==inp) inp.focus();
}
function sendFactionMsg(){
  const inp = document.getElementById('fc-chat-input');
  if(!inp||!factionData) return;
  const msg = inp.value.trim();
  if(!msg) return;
  inp.value = '';
  const entry = {user: username, text: msg, t: Date.now()};
  try{
    const key = getFactionChatKey();
    const raw = localStorage.getItem(key);
    const log = raw ? JSON.parse(raw) : [];
    log.push(entry);
    if(log.length>100) log.splice(0, log.length-100);
    localStorage.setItem(key, JSON.stringify(log));
  }catch(e){}
  loadFactionChat();
}
setInterval(()=>{
  const chatPanel = document.getElementById('fc-panel-chat');
  if(chatPanel && chatPanel.classList.contains('active')) loadFactionChat();
}, 3000);

function changeFactionColor(col, el){
  if(!factionData) return;
  factionData.color = col;
  allFactions[factionData.tag] = factionData;
  saveFactionsToSupabase(factionData);
  try{ localStorage.setItem(CONFIG.storageKeys.factions, JSON.stringify(allFactions)); }catch(e){}
  document.querySelectorAll('#fc-settings-colors .fc-color-swatch').forEach(s=>s.classList.remove('sel'));
  el.classList.add('sel');
  updateFactionBtn();
  showPopup(t('msg.color_updated'));
  renderFactionModal();
}

function updateFactionBtn(){
  // Sadece localStorage'dan senkron oku — async Supabase çekimi tetikleme
  if(!factionData){
    try{
      const raw = localStorage.getItem(CONFIG.storageKeys.factions);
      if(raw) allFactions = JSON.parse(raw);
    }catch(e){}
    _detectMyFactionFromSupabase();
  }
  const btn = document.getElementById('faction-sub-btn');
  const dot = document.getElementById('fsb-dot');
  const lbl = document.getElementById('fsb-label');
  if(!btn) return;
  if(factionData){
    dot.style.background = factionData.color;
    dot.style.border = factionData.color==='#ffffff'?'1px solid #555':'none';
    lbl.textContent = factionData.emoji+' '+factionData.name+' ['+factionData.tag+']';
    btn.style.borderColor = factionData.color+'66';
    btn.style.color = 'var(--txt)';
  } else {
    dot.style.background = '#5a5a80';
    dot.style.border = 'none';
    lbl.textContent = t('faction.label');
    btn.style.borderColor = '';
    btn.style.color = '';
  }
  // Sync chat tab label
  if(typeof updateChatFactionTab==='function') updateChatFactionTab();
}
// ═══════════════════════════════════════════════════════
