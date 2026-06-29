// ── PROFILE ──
const FRAMES=[
  {id:'none',   label:'Yok',    style:'background:linear-gradient(135deg,#7B61FF,#c4aaff)', unlockLevel:1},
  {id:'red',    label:'Kırmızı',style:'background:linear-gradient(135deg,#e50000,#ff6565)', unlockLevel:1},
  {id:'green',  label:'Yeşil',  style:'background:linear-gradient(135deg,#02be01,#94e044)', unlockLevel:1},
  {id:'cyan',   label:'Cyan',   style:'background:linear-gradient(135deg,#00d3dd,#0083c7)', unlockLevel:1},
  {id:'pink',   label:'Pembe',  style:'background:linear-gradient(135deg,#ff54b2,#ffa7d1)', unlockLevel:1},
  {id:'dark',   label:'Koyu',   style:'background:linear-gradient(135deg,#191928,#252538)', unlockLevel:1},
  {id:'gold',   label:'Altın',  style:'background:linear-gradient(135deg,#f5a623,#ffc53d)', unlockLevel:5},
  {id:'rainbow',label:'Gökkuşağı',style:'background:conic-gradient(#e50000,#e59500,#e5d900,#02be01,#0083c7,#820080,#e50000)', unlockLevel:20},
];
const FRAME_BORDERS={
  none:'#7B61FF',gold:'#f5a623',red:'#e50000',green:'#02be01',
  cyan:'#00d3dd',pink:'#ff54b2',dark:'#5a5a80',rainbow:'#e59500'
};
let profileData={name:'',photo:'',frame:'none',xp:0,level:1,streak:0,streakBest:0,lastLoginDate:'',loginDates:[]};

function loadProfile(){
  try{
    const d=localStorage.getItem(CONFIG.storageKeys.profileSelf);
    if(d){
      const parsed=JSON.parse(d);
      // xp ve level alanlarını koru — eski kayıtta yoksa mevcut değerleri sıfırlama
      const savedXP = profileData.xp || 0;
      const savedLevel = profileData.level || 1;
      const savedStreak = profileData.streak || 0;
      const savedStreakBest = profileData.streakBest || 0;
      const savedLastLogin = profileData.lastLoginDate || '';
      const savedLoginDates = profileData.loginDates || [];
      profileData = parsed;
      if(profileData.xp === undefined || profileData.xp === null) profileData.xp = savedXP;
      if(profileData.level === undefined || profileData.level === null) profileData.level = savedLevel;
      if(profileData.streak === undefined || profileData.streak === null) profileData.streak = savedStreak;
      if(profileData.streakBest === undefined || profileData.streakBest === null) profileData.streakBest = savedStreakBest;
      if(!Array.isArray(profileData.loginDates)) profileData.loginDates = savedLoginDates;
      if(profileData.lastLoginDate === undefined || profileData.lastLoginDate === null) profileData.lastLoginDate = savedLastLogin;
    }
  }catch(e){}
}
function saveProfile(){
  try{
    localStorage.setItem(CONFIG.storageKeys.profileSelf,JSON.stringify(profileData));
    // Also save under username key so faction members can see our avatar
    if(typeof username!=='undefined'&&username){
      localStorage.setItem(CONFIG.storageKeys.profile + username,JSON.stringify(profileData));
    }
  }catch(e){}
}
function applyProfileToBtn(){
  const uname=profileData.name||(typeof username!=='undefined'?username:'?');
  const pix=_getPixLeft();
  const frame=FRAMES.find(f=>f.id===profileData.frame)||FRAMES[0];
  const borderCol=FRAME_BORDERS[profileData.frame]||'#7B61FF';
  // Mini avatar in topbar button
  const avEl=document.getElementById('pb-av');
  const avTxtEl=document.getElementById('pb-av-txt');
  if(avEl){
    avEl.style.cssText=`width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:800;color:#fff;flex-shrink:0;overflow:hidden;border:2.5px solid ${borderCol};`;
    avEl.style.background=profileData.photo?'transparent':frame.style.replace(/background:/,'');
    // GÜVENLİK: innerHTML yerine createElement kullanılıyor — profileData.photo
    // ve kullanıcı adı (uname) doğrudan HTML olarak yorumlanmasın diye (XSS önleme).
    avEl.textContent='';
    if(profileData.photo){
      const img=document.createElement('img');
      img.src=profileData.photo;
      img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%';
      avEl.appendChild(img);
    } else {
      const span=document.createElement('span');
      span.textContent=uname.slice(0,2).toUpperCase();
      avEl.appendChild(span);
    }
  }
  document.getElementById('pb-name').textContent=uname;
  document.getElementById('pb-pix').textContent=pix+'/'+PIXEL_LIMIT+t('pixel.unit');
  updateStreakUI();
  // Faction göster
  const fDot=document.getElementById('pb-faction-dot');
  const fName=document.getElementById('pb-faction-name');
  if(fDot&&fName&&typeof selParty!=='undefined'&&PARTIES[selParty]){
    fDot.style.background=PARTIES[selParty].color;
    fDot.style.border=PARTIES[selParty].color==='#ffffff'?'1px solid #555':'none';
    fName.textContent=PARTIES[selParty].name;
    fName.style.color=PARTIES[selParty].color==='#ffffff'?'#aaa':PARTIES[selParty].color;
  }
}
function updateProfileBtn(){
  const pix=_getPixLeft();
  const el=document.getElementById('pb-pix');
  if(el) el.textContent=pix+'/'+PIXEL_LIMIT+t('pixel.unit');
  applyProfileToBtn();
}
let pcActiveTab = 'profil';

function switchProfileTab(tab){
  pcActiveTab = tab;
  document.querySelectorAll('.pc-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.pc-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('pctab-'+tab).classList.add('active');
  document.getElementById('pcpanel-'+tab).classList.add('active');
  if(tab==='stats') renderProfileStats();
  if(tab==='ayarlar') renderProfileSettings();
  if(tab==='seviye'){ renderLevelPanel(); renderStreakPanel(); }
}

function renderProfileStats(){
  const totalPlaced = profileData.totalPlaced||0;
  const sessionPix = profileData.sessionPix||0;
  const streak = profileData.streak||0;
  const bestDay = profileData.bestDay||0;
  const parties = profileData.partyBreakdown||{};
  const activityLog = profileData.activityLog||[];

  const cardsHTML = `
    <div class="pcs-card">
      <div class="pcs-card-icon">🟣</div>
      <div class="pcs-card-val">${totalPlaced}</div>
      <div class="pcs-card-lbl">${t('stats.total_pixel')}</div>
    </div>
    <div class="pcs-card">
      <div class="pcs-card-icon">⚡</div>
      <div class="pcs-card-val">${_getPixLeft()}</div>
      <div class="pcs-card-lbl">${t('stats.current_pixel')}</div>
    </div>
    <div class="pcs-card">
      <div class="pcs-card-icon">🔥</div>
      <div class="pcs-card-val">${streak}</div>
      <div class="pcs-card-lbl">${t('stats.day_streak')}</div>
    </div>
    <div class="pcs-card">
      <div class="pcs-card-icon">🏆</div>
      <div class="pcs-card-val">${bestDay}</div>
      <div class="pcs-card-lbl">${t('stats.best_day')}</div>
    </div>
  `;

  // Party breakdown bars
  const partyEntries = Object.entries(parties).sort((a,b)=>b[1]-a[1]).slice(0,6);
  let barsHTML;
  if(partyEntries.length===0){
    barsHTML = `<div style="font-size:.72rem;color:var(--muted);padding:.3rem 0">${t('stats.no_pixels')}</div>`;
  } else {
    const maxVal = partyEntries[0][1]||1;
    barsHTML = partyEntries.map(([pid,count])=>{
      const p = (typeof PARTIES!=='undefined'&&PARTIES[pid])||{name:pid,color:'#7B61FF'};
      const pct = Math.round((count/maxVal)*100);
      return `<div class="pcs-bar-row">
        <div class="pcs-bar-label" style="color:${p.color||'#7B61FF'}">${p.name||pid}</div>
        <div class="pcs-bar-track"><div class="pcs-bar-fill" style="width:${pct}%;background:${p.color||'#7B61FF'}"></div></div>
        <div class="pcs-bar-num">${count}</div>
      </div>`;
    }).join('');
  }

  // Activity cells (7 days)
  const now = Date.now();
  const cells = [];
  for(let i=6;i>=0;i--){
    const dayStart = now - i*86400000;
    const dayEnd = dayStart + 86400000;
    const dayCount = activityLog.filter(t=>t>=dayStart&&t<dayEnd).length;
    const intensity = dayCount===0?'':dayCount<=2?'mid':'active';
    const whenLabel = i===0 ? t('stats.today') : t('stats.days_ago', {n:i});
    cells.push(`<div class="pcs-activity-cell ${intensity}" title="${dayCount} ${t('stats.pixel_unit_short')} (${whenLabel})"></div>`);
  }
  const activityHTML = cells.join('')
    + `<div style="font-size:.58rem;color:var(--muted);margin-left:.4rem;align-self:center">${t('stats.last_7_days')}</div>`;

  // Profil modalı (masaüstü + mobil modal) içine yaz
  const grid = document.getElementById('pcs-grid');
  if(grid) grid.innerHTML = cardsHTML;
  const barsEl = document.getElementById('pcs-party-bars');
  if(barsEl) barsEl.innerHTML = barsHTML;
  const actEl = document.getElementById('pcs-activity');
  if(actEl) actEl.innerHTML = activityHTML;

  // Alt çekmece (sidebar) içindeki istatistik kartına da aynı veriyi yaz
  const sbGrid = document.getElementById('sb-pcs-grid');
  if(sbGrid) sbGrid.innerHTML = cardsHTML;
  const sbBars = document.getElementById('sb-pcs-party-bars');
  if(sbBars) sbBars.innerHTML = barsHTML;
  const sbAct = document.getElementById('sb-pcs-activity');
  if(sbAct) sbAct.innerHTML = activityHTML;
}

function renderProfileSettings(){
  // Load saved settings
  let s={};
  try{ s=JSON.parse(localStorage.getItem(CONFIG.storageKeys.settings)||'{}'); }catch(e){}
  const chk = (id,def)=>{
    const el=document.getElementById(id);
    if(el) el.checked = s[id]!==undefined ? s[id] : def;
  };
  chk('pca-pixel-counter',true);
  chk('pca-labels',true);
  chk('pca-animations',true);
  chk('pca-notif',false);

  // Joined date
  const joined = profileData.joinedAt
    ? new Date(profileData.joinedAt).toLocaleDateString(_currentLang==='tr'?'tr-TR':'en-US',{day:'numeric',month:'long',year:'numeric'})
    : t('settings.unknown');
  const jEl = document.getElementById('pca-joined-date');
  if(jEl) jEl.textContent = joined;
}

function saveSettings(){
  const s={};
  ['pca-pixel-counter','pca-labels','pca-animations','pca-notif'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) s[id]=el.checked;
  });
  try{ localStorage.setItem(CONFIG.storageKeys.settings,JSON.stringify(s)); }catch(e){}
  applySettings(s);
  showPopup(t('settings.saved'));
}

function applySettings(s){
  if(!s){ try{ s=JSON.parse(localStorage.getItem(CONFIG.storageKeys.settings)||'{}'); }catch(e){ s={}; } }
  // Label overlay
  const lo=document.getElementById('label-overlay');
  if(lo) lo.style.display=(s['pca-labels']===false)?'none':'';
  // Pixel widget
  const pw=document.getElementById('pixel-widget');
  if(pw) pw.style.display=(s['pca-pixel-counter']===false)?'none':'';
}

function confirmResetStats(){
  if(!confirm(t('settings.reset_confirm_title'))) return;
  profileData.totalPlaced=0;
  profileData.sessionPix=0;
  profileData.streak=0;
  profileData.bestDay=0;
  profileData.partyBreakdown={};
  profileData.activityLog=[];
  saveProfile();
  renderProfileStats();
  showPopup(t('settings.reset_done'));
}

function saveProfileBio(){
  const bio=(document.getElementById('pc-bio-input').value||'').trim();
  profileData.bio=bio;
  saveProfile();
  showPopup(t('msg.bio_saved'));
}

function openProfileModal(){
  loadProfile();
  const uname=profileData.name||(typeof username!=='undefined'?username:'');
  // Populate modal avatar
  const bigAv=document.getElementById('pc-av-big');
  const frame=FRAMES.find(f=>f.id===profileData.frame)||FRAMES[0];
  const borderCol=FRAME_BORDERS[profileData.frame]||'#7B61FF';
  bigAv.style.cssText=`width:88px;height:88px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:#fff;overflow:hidden;cursor:pointer;position:relative;border:3px solid ${borderCol};`;
  bigAv.style.background=profileData.photo?'transparent':frame.style.replace(/background:/,'');
  const txt=document.getElementById('pc-av-txt2');
  if(profileData.photo){
    txt.style.display='none';
    bigAv.querySelectorAll('img').forEach(i=>i.remove());
    const img=document.createElement('img');
    img.src=profileData.photo;
    img.style.cssText='width:100%;height:100%;object-fit:cover;position:absolute;inset:0;border-radius:50%;';
    bigAv.insertBefore(img,bigAv.firstChild);
  } else {
    bigAv.querySelectorAll('img').forEach(i=>i.remove());
    txt.style.display='';
    txt.textContent=uname.slice(0,2).toUpperCase()||'?';
  }
  // Username display
  const unameEl=document.getElementById('pc-username-display');
  if(unameEl) unameEl.textContent=uname||'—';
  // Stats
  document.getElementById('pc-pix-val').textContent=_getPixLeft();
  const totalPlaced=profileData.totalPlaced||0;
  document.getElementById('pc-total-val').textContent=totalPlaced;
  const cdEl=document.getElementById('cdtimer');
  document.getElementById('pc-cd-val').textContent=cdEl?cdEl.textContent:'—';
  // Name input
  document.getElementById('pc-name-input').value=uname;
  // Bio
  const bioEl=document.getElementById('pc-bio-input');
  if(bioEl) bioEl.value=profileData.bio||'';
  // Build frames
  const framesEl=document.getElementById('pc-frames');
  framesEl.innerHTML='';
  const curLvl=profileData.level||1;
  FRAMES.forEach(f=>{
    const isLocked = (f.unlockLevel||1) > curLvl;
    const el=document.createElement('div');
    el.className='pc-frame'+(profileData.frame===f.id?' active':'')+(isLocked?' locked':'');
    el.title=isLocked ? f.label+' — '+t('frame.locked_tip',{lvl:f.unlockLevel}) : f.label;
    el.setAttribute('style',f.style+';border:2.5px solid '+(profileData.frame===f.id?'#fff':'transparent')+';position:relative;');
    el.textContent=f.id==='none'?'✕':f.label.slice(0,1);
    if(isLocked){
      const lockSpan=document.createElement('span');
      lockSpan.className='pc-frame-lock-icon';
      lockSpan.textContent='🔒';
      el.appendChild(lockSpan);
      const lvSpan=document.createElement('span');
      lvSpan.className='pc-frame-lvreq';
      lvSpan.textContent='Lv'+f.unlockLevel;
      el.appendChild(lvSpan);
    }
    el.onclick=()=>selectFrame(f.id);
    framesEl.appendChild(el);
  });
  // Set to profil tab by default
  switchProfileTab('profil');
  updateXPUI();
  document.getElementById('profile-modal').classList.add('open');
}
function closeProfileModal(){
  document.getElementById('profile-modal').classList.remove('open');
}

function selectFrame(fid){
  const f=FRAMES.find(x=>x.id===fid);
  const curLvl=profileData.level||1;
  if(f && (f.unlockLevel||1) > curLvl){
    showPopup(t('frame.locked_popup',{lvl:f.unlockLevel,cur:curLvl}));
    return;
  }
  profileData.frame=fid;
  saveProfile();
  // Re-open to refresh
  document.getElementById('profile-modal').classList.remove('open');
  setTimeout(openProfileModal,10);
  applyProfileToBtn();
}
async function saveProfileName(){
  const val=document.getElementById('pc-name-input').value.trim();
  if(!val) return;
  // ── GÜVENLİK: isim değişikliği de kayıt anındaki ile aynı kısıtlamadan
  // geçmeli (HTML/JS karakteri içermesin) — aksi halde stored XSS açığı
  // profil üzerinden isim değiştirilerek yeniden açılabilirdi.
  const NAME_RE = /^[\p{L}\p{N} _\-]{2,20}$/u;
  if(!NAME_RE.test(val)){
    showPopup(t('msg.invalid_username'));
    return;
  }
  profileData.name=val;
  username=val;
  // İsim artık Supabase Auth'taki gerçek hesabın metadata'sında tutuluyor
  // (localStorage'da tutulan, kolayca sahteleştirilebilen eski yöntem yerine).
  try{
    await supabase.auth.updateUser({ data: { display_name: val } });
  }catch(e){ console.error('İsim güncellenemedi:', e); }
  saveProfile();
  applyProfileToBtn();
  showPopup(t('msg.username_updated', {name: val}));
  closeProfileModal();
}
function handlePhotoUpload(e){
  const file=e.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    profileData.photo=ev.target.result;
    saveProfile();
    applyProfileToBtn();
    // Refresh modal avatar
    closeProfileModal();
    setTimeout(openProfileModal,10);
  };
  reader.readAsDataURL(file);
}
// Close modal on backdrop click
document.getElementById('profile-modal').addEventListener('click',function(e){
  if(e.target===this) closeProfileModal();
});
setInterval(updateProfileBtn,2000);

// ── SIDEBAR TOGGLE ──
