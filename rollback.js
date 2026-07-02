// ═══════════════════════════════════════════════════
// 🕰 ROLLBACK SİSTEMİ (admin — belirli alanı geçmişe döndür)
// ═══════════════════════════════════════════════════
// Mantık: admin haritada bir dikdörtgen alan seçer, o alanın
// ortasına denk gelen saat/tarihi belirler. Tarihi seçip "Rollback At"
// dediğinde önce bir ÖNİZLEME/ONAY adımı gösterilir (kaç piksel
// değişecek, kaç piksellik alan). Admin "Onayla ve Uygula" dedikten
// SONRA işlem gerçekleşir. Bu işlem KALICIDIR — SADECE seçili
// dikdörtgendeki pikseller için Supabase 'pixels' tablosuna doğrudan
// yazılır, TÜM kullanıcılar bu değişikliği görür ve sayfa yenilenince
// (F5) de kalır. Alan dışındaki hiçbir piksele dokunulmaz.
//
// VERİ KAYNAĞI: 'pixels' tablosu her flat için TEK satır tutar (en son
// oy üzerine yazılır), yani GEÇMİŞİ SAKLAMAZ. Hangi tarihte hangi renk
// vardı bilgisi için ayrı, asla üzerine yazılmayan 'pixel_log' tablosu
// kullanılır (pixels'a her yazıldığında — admin rollback'i de dahil —
// bir trigger otomatik oraya da ekler, bkz. pixel_log_migration.sql).
// get_pixel_state_at(flats, p_at) RPC'si, seçili alandaki her flat'in
// p_at anındaki gerçek son halini bu log'dan hesaplar.


let rollbackToolActive = false;     // rollback seçim aracı açık mı
let rbSelecting = false;            // şu an sürükleyerek seçim yapılıyor mu
let rbStartCanvasXY = null;         // {x,y} canvas-pixel cinsinden seçim başlangıcı
let rbCurCanvasXY = null;           // {x,y} canvas-pixel cinsinden anlık sürükleme noktası
let rbSelectedRect = null;          // {minFx,minFy,maxFx,maxFy} flat-grid (IMG_W/IMG_H) koordinatlarında, seçim tamamlanınca
let rbAppliedFlats = null;          // şu an rollback uygulanmış flat listesi (geri al / temizle için)
let rbAppliedPrevState = null;      // Map(flat -> {pid, party|null}) — rollback öncesi local durumun yedeği
let rbPendingPlan = null;           // {flats, stateAtTime, targetDate, label} — onay bekleyen, henüz uygulanmamış rollback hesabı

const rbCanvas = document.getElementById('rollback-select-canvas');
const rbCtx = rbCanvas ? rbCanvas.getContext('2d') : null;

function resizeRollbackCanvas(){
  if(!rbCanvas) return;
  const wrap = document.getElementById('cwrap');
  rbCanvas.width = wrap.clientWidth;
  rbCanvas.height = wrap.clientHeight;
  drawRollbackOverlay();
}
window.addEventListener('resize', resizeRollbackCanvas);

function toggleRollbackTool(){
  if(!adminMode) return;
  rollbackToolActive = !rollbackToolActive;
  const btn = document.getElementById('pt-rollback-toggle');
  const btnLabel = document.getElementById('pt-rollback-toggle-label');
  if(rollbackToolActive){
    if(btnLabel) btnLabel.textContent = t('rb.toggle_on');
    btn.classList.add('event-on');
    rbCanvas.classList.add('active');
    resizeRollbackCanvas();
    showPopup(t('msg.rollback_tool_on'));
  } else {
    if(btnLabel) btnLabel.textContent = t('rb.toggle_off');
    btn.classList.remove('event-on');
    rbCanvas.classList.remove('active');
    rbSelecting = false;
    rbStartCanvasXY = null;
    rbCurCanvasXY = null;
    drawRollbackOverlay();
  }
}

// Seçim sürükleme — admin modunda paint mousedown'ından önce yakalanır.
// capture:true ile mevcut admin paint dinleyicilerinden önce devreye girer.
canvas.addEventListener('mousedown', e => {
  if(!adminMode || !rollbackToolActive) return;
  if(_recentTouch()) return; // bu jest zaten touch handler tarafından işleniyor/işlendi
  if(e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  rbSelecting = true;
  rbStartCanvasXY = {x: e.clientX - r.left, y: e.clientY - r.top};
  rbCurCanvasXY = {...rbStartCanvasXY};
  drawRollbackOverlay();
}, true);

canvas.addEventListener('mousemove', e => {
  if(!adminMode || !rollbackToolActive || !rbSelecting) return;
  if(_recentTouch()) return;
  e.stopPropagation();
  const r = canvas.getBoundingClientRect();
  rbCurCanvasXY = {x: e.clientX - r.left, y: e.clientY - r.top};
  drawRollbackOverlay();
}, true);

canvas.addEventListener('mouseup', e => {
  if(!adminMode || !rollbackToolActive || !rbSelecting) return;
  e.stopPropagation();
  rbSelecting = false;
  finalizeRollbackSelection();
}, true);

// ── Dokunmatik (mobil/tablet) eşdeğerleri — rollback alan seçimi ──
// capture:true + stopPropagation ile aynı önceliği korur; mouse mantığıyla bire bir aynı.
// e.targetTouches kullanılıyor — başka bir elemana basılan ikinci dokunuş seçimi bozmaz.
canvas.addEventListener('touchstart', e => {
  _lastTouchTS = Date.now();
  if(!adminMode || !rollbackToolActive) return;
  if(e.targetTouches.length !== 1) return;
  e.stopPropagation();
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const t = e.targetTouches[0];
  rbSelecting = true;
  rbStartCanvasXY = {x: t.clientX - r.left, y: t.clientY - r.top};
  rbCurCanvasXY = {...rbStartCanvasXY};
  drawRollbackOverlay();
}, {capture:true, passive:false});

canvas.addEventListener('touchmove', e => {
  _lastTouchTS = Date.now();
  if(!adminMode || !rollbackToolActive || !rbSelecting) return;
  if(e.targetTouches.length < 1) return;
  e.stopPropagation();
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const t = e.targetTouches[0];
  rbCurCanvasXY = {x: t.clientX - r.left, y: t.clientY - r.top};
  drawRollbackOverlay();
}, {capture:true, passive:false});

canvas.addEventListener('touchcancel', e => {
  // Sistem jesti seçimi iptal ederse yarım kalmış seçim durumunu sıfırla.
  if(!rbSelecting) return;
  rbSelecting = false;
  rbStartCanvasXY = null;
  rbCurCanvasXY = null;
  drawRollbackOverlay();
}, true);

canvas.addEventListener('touchend', e => {
  if(!adminMode || !rollbackToolActive || !rbSelecting) return;
  e.stopPropagation();
  rbSelecting = false;
  finalizeRollbackSelection();
}, true);

function drawRollbackOverlay(){
  if(!rbCtx) return;
  rbCtx.clearRect(0,0,rbCanvas.width,rbCanvas.height);
  if(!rbStartCanvasXY || !rbCurCanvasXY) return;
  const x1 = Math.min(rbStartCanvasXY.x, rbCurCanvasXY.x);
  const y1 = Math.min(rbStartCanvasXY.y, rbCurCanvasXY.y);
  const w = Math.abs(rbCurCanvasXY.x - rbStartCanvasXY.x);
  const h = Math.abs(rbCurCanvasXY.y - rbStartCanvasXY.y);
  rbCtx.fillStyle = 'rgba(20,184,166,0.18)';
  rbCtx.fillRect(x1,y1,w,h);
  rbCtx.strokeStyle = '#14b8a6';
  rbCtx.lineWidth = 2;
  rbCtx.setLineDash([6,4]);
  rbCtx.strokeRect(x1,y1,w,h);
  rbCtx.setLineDash([]);
}

// Seçim bittiğinde canvas pikselini flat-grid (harita) koordinatına çevirip
// modalı açar. Çok küçük (tıklama gibi) seçimler bir uyarı ile reddedilir.
function finalizeRollbackSelection(){
  if(!rbStartCanvasXY || !rbCurCanvasXY) return;
  const x1c = Math.min(rbStartCanvasXY.x, rbCurCanvasXY.x);
  const y1c = Math.min(rbStartCanvasXY.y, rbCurCanvasXY.y);
  const x2c = Math.max(rbStartCanvasXY.x, rbCurCanvasXY.x);
  const y2c = Math.max(rbStartCanvasXY.y, rbCurCanvasXY.y);

  if((x2c-x1c) < 4 || (y2c-y1c) < 4){
    showPopup(t('msg.area_too_small'));
    rbStartCanvasXY = null; rbCurCanvasXY = null;
    drawRollbackOverlay();
    return;
  }

  // Canvas-pixel → flat-grid koordinatına çevir (canvasToFlat'in aynı dönüşümü)
  const fx1 = Math.max(0, Math.floor((x1c-ox)/scale));
  const fy1 = Math.max(0, Math.floor((y1c-oy)/scale));
  const fx2 = Math.min(IMG_W-1, Math.floor((x2c-ox)/scale));
  const fy2 = Math.min(IMG_H-1, Math.floor((y2c-oy)/scale));

  if(fx2 < 0 || fy2 < 0 || fx1 > IMG_W-1 || fy1 > IMG_H-1 || fx2 < fx1 || fy2 < fy1){
    showPopup(t('msg.selection_outside'));
    rbStartCanvasXY = null; rbCurCanvasXY = null;
    drawRollbackOverlay();
    return;
  }

  rbSelectedRect = {minFx:fx1, minFy:fy1, maxFx:fx2, maxFy:fy2};
  openRollbackModal();
}

function openRollbackModal(){
  if(!rbSelectedRect) return;
  const modal = document.getElementById('rollback-modal');
  modal.style.display = 'flex';

  const {minFx,minFy,maxFx,maxFy} = rbSelectedRect;
  const w = maxFx-minFx+1, h = maxFy-minFy+1;
  const cx = Math.round((minFx+maxFx)/2), cy = Math.round((minFy+maxFy)/2);
  document.getElementById('rb-area-info').textContent =
    `📐 Alan: ${w}×${h} px — merkez: (${cx}, ${cy}) — toplam ${(w*h).toLocaleString('tr-TR')} piksel`;

  // Varsayılan: 1 saat önce
  const dt = document.getElementById('rollback-datetime');
  const d = new Date(Date.now() - 3600*1000);
  dt.value = d.toISOString().slice(0,16);
  dt.max = new Date().toISOString().slice(0,16);

  document.getElementById('rollback-modal-err').style.display = 'none';
  const btn = document.getElementById('rollback-go-btn');
  btn.disabled = false;
  btn.style.opacity = '1';
  btn.textContent = t('rb.go_btn');

  // Her açılışta önizleme/onay adımını sıfırla, kurulum adımına dön
  rbPendingPlan = null;
  document.getElementById('rb-setup-step').style.display = 'flex';
  document.getElementById('rb-confirm-step').style.display = 'none';

  // Eğer bu alanda zaten aktif bir rollback varsa "geri al" butonunu göster
  const undoBtn = document.getElementById('rollback-undo-btn');
  undoBtn.style.display = rbAppliedFlats ? 'flex' : 'none';
}

function closeRollbackModal(){
  document.getElementById('rollback-modal').style.display = 'none';
  // Seçim çerçevesini temizle (uygulanmadıysa)
  rbStartCanvasXY = null; rbCurCanvasXY = null;
  rbPendingPlan = null;
  drawRollbackOverlay();
}

function rollbackQuick(hoursAgo){
  const d = new Date(Date.now() - hoursAgo*3600*1000);
  document.getElementById('rollback-datetime').value = d.toISOString().slice(0,16);
}

// Seçili dikdörtgendeki tüm flat indeksleri üretir (yalnızca harita üzerindeki
// gerçek il piksellerini, yani FLAT_TO_PROV'da geçerli bir ile sahip olanları).
function getFlatsInRect(rect){
  const out = [];
  for(let y=rect.minFy; y<=rect.maxFy; y++){
    const rowBase = y*IMG_W;
    for(let x=rect.minFx; x<=rect.maxFx; x++){
      const flat = rowBase + x;
      if(FLAT_TO_PROV[flat] >= 0 && !WHITE_SET.has(flat)) out.push(flat);
    }
  }
  return out;
}

// 1) ADIM 1: Tarihi doğrula, get_pixel_state_at ile hedef durumu hesapla,
//    canlı durumla kıyaslayıp kaç pikselin GERÇEKTEN değişeceğini önizle.
//    Bu adımda HİÇBİR ŞEY uygulanmaz / sunucuya yazılmaz — sadece plan
//    çıkarılıp onay adımı gösterilir.
async function runRollback(){
  if(!rbSelectedRect) return;
  const dtVal = document.getElementById('rollback-datetime').value;
  const errEl = document.getElementById('rollback-modal-err');
  const btn = document.getElementById('rollback-go-btn');

  if(!dtVal){
    errEl.textContent = t('rb.err_no_date');
    errEl.style.display = 'block';
    return;
  }
  const targetDate = new Date(dtVal);
  if(isNaN(targetDate.getTime())){
    errEl.textContent = t('rb.err_invalid');
    errEl.style.display = 'block';
    return;
  }
  if(targetDate > new Date()){
    errEl.textContent = t('rb.err_future');
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.textContent = t('rb.calculating');

  try{
    const isoStr = targetDate.toISOString();
    const flats = getFlatsInRect(rbSelectedRect);

    if(flats.length === 0){
      errEl.textContent = t('rb.err_no_pixels');
      errEl.style.display = 'block';
      btn.disabled = false; btn.style.opacity = '1'; btn.textContent = t('rb.go_btn');
      return;
    }

    // ÖNEMLİ: 'pixels' tablosu her flat için TEK satır tutar (upsert ile
    // sürekli üzerine yazılır) — geçmiş orada YOKTUR. Bu yüzden gerçek
    // geçmiş için her oyu kalıcı olarak kaydeden 'pixel_log' tablosunu ve
    // onun üzerinde çalışan get_pixel_state_at() RPC'sini kullanıyoruz.
    // Bu fonksiyon, sadece seçili alandaki flat'lerin p_at anındaki SON
    // (gerçek) durumunu veritabanı tarafında hesaplar.
    const { data: rows, error } = await supabase
      .rpc('get_pixel_state_at', { p_flats: flats, p_at: isoStr });

    if(error) throw error;

    const stateAtTime = new Map(); // flat -> {party, province} | o flat'in p_at anındaki gerçek son hali

    (rows||[]).forEach(row=>{
      const f = Number(row.flat);
      const p = parseInt(row.party,10);
      if(isNaN(p) || p<0 || p>=PARTIES.length){
        stateAtTime.set(f, null); // o anda piksel boştu / geçersizdi
      } else {
        stateAtTime.set(f, {party:p, province:row.province});
      }
    });
    // Not: get_pixel_state_at, p_at'tan önce hiç oy almamış flat'leri hiç
    // döndürmez — bu durumda stateAtTime.has(f) false olur ve aşağıdaki
    // "target===null" dalı doğru şekilde devreye girer (o piksel o anda
    // gerçekten boştu). pixel_log artık TÜM geçmişi tuttuğu için, sonradan
    // tekrar oylanmış ama p_at anında dolu olan pikseller artık YANLIŞLIKLA
    // silinmiyor — gerçek geçmiş parti değerleriyle geri geliyor.

    // Canlı (şu anki) durumla kıyaslayıp kaç piksel GERÇEKTEN değişecek hesapla
    let willChange = 0;
    flats.forEach(f=>{
      const pi = FLAT_TO_PROV[f];
      const pid = PROV_IDS[pi];
      if(!pid) return;
      const cur = (pixData[pid]||[]).find(v=>v.flat===f);
      const target = stateAtTime.has(f) ? stateAtTime.get(f) : null;
      const curParty = cur ? cur.party : null;
      const targetParty = target ? target.party : null;
      if(curParty !== targetParty) willChange++;
    });

    const label = targetDate.toLocaleString(_currentLang==='tr'?'tr-TR':'en-US', {day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
    rbPendingPlan = { flats, stateAtTime, targetDate, label };

    btn.disabled = false; btn.style.opacity = '1'; btn.textContent = t('rb.go_btn');
    showRollbackConfirmStep(willChange, flats.length, label);

  } catch(err){
    console.error('Rollback hesaplama hatası:', err);
    errEl.textContent = '⚠ Hata: ' + (err.message || 'Bilinmeyen hata');
    errEl.style.display = 'block';
    btn.disabled = false; btn.style.opacity = '1'; btn.textContent = t('rb.go_btn');
  }
}

// ADIM 2: Hesaplanan planı gösterip net onay ister.
function showRollbackConfirmStep(willChange, totalFlats, label){
  document.getElementById('rb-setup-step').style.display = 'none';
  const step = document.getElementById('rb-confirm-step');
  step.style.display = 'flex';
  const _loc = _currentLang==='tr'?'tr-TR':'en-US';
  document.getElementById('rb-confirm-text').innerHTML = t('rb.confirm_msg', {
    label: label,
    changed: willChange.toLocaleString(_loc),
    total: totalFlats.toLocaleString(_loc)
  });
  const yesBtn = document.getElementById('rb-confirm-yes-btn');
  yesBtn.disabled = false;
  yesBtn.style.opacity = '1';
  yesBtn.textContent = t('rb.confirm_yes');
}

// "Vazgeç" — onay adımından kurulum adımına geri döner, hiçbir şey uygulanmaz.
function cancelRollbackConfirm(){
  rbPendingPlan = null;
  document.getElementById('rb-confirm-step').style.display = 'none';
  document.getElementById('rb-setup-step').style.display = 'flex';
}

// Bir Supabase isteğini en fazla `size` öğelik parçalara bölerek çalıştırır.
// "Failed to fetch" / payload-too-large gibi hatalara karşı koruma sağlar —
// tek seferde binlerce satır göndermek yerine küçük parçalar halinde gönderir.
async function runInChunks(items, size, fn){
  for(let i=0; i<items.length; i+=size){
    const chunk = items.slice(i, i+size);
    await fn(chunk);
  }
}

// Seçili flat'leri ve hedef durumlarını sunucuya KALICI olarak yazar
// (target!==null → upsert, target===null → delete). pixels'a her
// yazıldığında pixel_log trigger'ı bunu otomatik olarak da loglar.
//
// GÜVENLİK: Daha önce bu fonksiyon supabase.from('pixels').upsert()/.delete()
// ile DOĞRUDAN tabloya yazıyordu. pixels tablosunda RLS açık olduğu ve
// INSERT/UPDATE/DELETE için hiçbir politika tanımlı olmadığı için bu yazma
// sessizce reddediliyordu — rollback aracı "uygulandı" diyordu ama sunucuda
// hiçbir şey değişmiyordu. Artık admin_set_pixel_states() RPC'si üzerinden
// yazılıyor; bu fonksiyon sunucu tarafında is_admin() ile yetkiyi doğruluyor
// ve RLS'i SECURITY DEFINER ile güvenli şekilde bypass ediyor.
//
// ÖNEMLİ: Sadece GERÇEKTEN DEĞİŞECEK flat'ler sunucuya gönderilir — seçili
// alanın tamamı değil. Önizleme adımında "X piksel değişecek" diye hesaplanan
// sayı neyse, sunucuya da tam olarak o kadarı yazılır. Bu hem network isteğini
// küçük tutar (büyük seçimlerde "Failed to fetch" hatasını önler) hem de
// pixel_log'a gereksiz / değişmeyen satırlar eklenmesini engeller.
async function persistPixelStatesToServer(flats, stateAtTime, actingUsername){
  const fFlats=[], fProvinces=[], fParties=[];

  flats.forEach(f=>{
    const pi = FLAT_TO_PROV[f];
    const pid = PROV_IDS[pi];
    if(!pid) return;
    const target = stateAtTime.has(f) ? stateAtTime.get(f) : null;

    // Canlı (şu anki) durumla kıyasla — değişmeyenleri hiç gönderme
    const cur = (pixData[pid]||[]).find(v=>v.flat===f);
    const curParty = cur ? cur.party : null;
    const targetParty = target ? target.party : null;
    if(curParty === targetParty) return; // değişiklik yok, atla

    fFlats.push(f);
    fProvinces.push(pid);
    fParties.push(target===null ? null : target.party); // null → RPC tarafında silinecek
  });

  if(fFlats.length===0) return;

  const CHUNK_SIZE = 500; // tek istekte gönderilecek azami satır sayısı
  await runInChunks(fFlats.map((f,i)=>i), CHUNK_SIZE, async (idxChunk)=>{
    const { data, error } = await supabase.rpc('admin_set_pixel_states', {
      p_flats: idxChunk.map(i=>fFlats[i]),
      p_provinces: idxChunk.map(i=>fProvinces[i]),
      p_parties: idxChunk.map(i=>fParties[i]),
      p_username: actingUsername
    });
    if(error) throw error;
    if(!data || data.success!==true){
      throw new Error((data && data.error) || t('rb.err_set_pixel_states'));
    }
  });
}

// ADIM 3: Onay verildikten SONRA gerçekten uygulanır — hem sunucuya
// (kalıcı) hem de local pixData/canvas'a.
async function confirmRollbackApply(){
  if(!rbPendingPlan) return;
  const { flats, stateAtTime, label } = rbPendingPlan;
  const errEl = document.getElementById('rollback-modal-err');
  const yesBtn = document.getElementById('rb-confirm-yes-btn');

  errEl.style.display = 'none';
  yesBtn.disabled = true;
  yesBtn.style.opacity = '0.6';
  yesBtn.textContent = t('rb.applying');

  try{
    // 1) Sunucuya kalıcı olarak yaz
    await persistPixelStatesToServer(flats, stateAtTime, (typeof username!=='undefined' && username) ? username : 'admin-rollback');

    // 2) Local pixData + canvas'ı güncelle (geri alabilmek için önceki hali yedekle)
    if(!rbAppliedPrevState) rbAppliedPrevState = new Map();
    let changedCount = 0;

    flats.forEach(f=>{
      const pi = FLAT_TO_PROV[f];
      const pid = PROV_IDS[pi];
      if(!pid) return;

      if(!rbAppliedPrevState.has(f)){
        const cur = (pixData[pid]||[]).find(v=>v.flat===f);
        rbAppliedPrevState.set(f, {pid, party: cur ? cur.party : null});
      }

      const target = stateAtTime.has(f) ? stateAtTime.get(f) : null;

      if(!pixData[pid]) pixData[pid] = [];
      const idx = pixData[pid].findIndex(v=>v.flat===f);

      if(target === null){
        if(idx > -1){ pixData[pid].splice(idx,1); changedCount++; }
      } else {
        if(idx > -1){
          if(pixData[pid][idx].party !== target.party){ pixData[pid][idx].party = target.party; changedCount++; }
        } else {
          pixData[pid].push({flat:f, party:target.party}); changedCount++;
        }
      }
    });

    rbAppliedFlats = flats;

    redrawPixelCanvas();
    draw();
    updateSidebar();

    showPopup(t('msg.rollback_done', {label: label, n: changedCount.toLocaleString(_currentLang==='tr'?'tr-TR':'en-US')}));
    showRollbackBanner(label);

    rbPendingPlan = null;
    closeRollbackModal();
    rollbackToolActive = false;
    const tbtn = document.getElementById('pt-rollback-toggle');
    const tbtnLabel = document.getElementById('pt-rollback-toggle-label');
    if(tbtnLabel) tbtnLabel.textContent = t('rb.toggle_off');
    tbtn.classList.remove('event-on');
    rbCanvas.classList.remove('active');

  } catch(err){
    console.error('Rollback uygulama hatası:', err);
    errEl.textContent = t('rb.err_write') + (err.message || t('msg.unknown_error'));
    errEl.style.display = 'block';
    yesBtn.disabled = false; yesBtn.style.opacity = '1'; yesBtn.textContent = t('rb.confirm_yes');
  }
}

// Uygulanmış rollback'i geri alır — ÖNCE sunucuya (kalıcı), sonra local
// pixData/canvas'a. Sunucuya yazma başarısız olursa local state'e
// dokunmaz (sunucu ile tutarsız kalmasın diye).
async function undoRollback(){
  if(!rbAppliedPrevState){ closeRollbackModal(); return; }

  // GÜVENLİK: Daha önce burada da doğrudan supabase.from('pixels').upsert()/
  // .delete() çağrıları vardı — RLS tarafından sessizce reddediliyordu.
  // Artık aynı admin_set_pixel_states() RPC'si kullanılıyor (is_admin()
  // doğrulamalı, SECURITY DEFINER).
  const uFlats=[], uProvinces=[], uParties=[];
  rbAppliedPrevState.forEach((prev, f)=>{
    uFlats.push(f);
    uProvinces.push(prev.pid);
    uParties.push(prev.party); // null ise RPC tarafında silinecek
  });

  try{
    const CHUNK_SIZE = 500;
    await runInChunks(uFlats.map((f,i)=>i), CHUNK_SIZE, async (idxChunk)=>{
      const { data, error } = await supabase.rpc('admin_set_pixel_states', {
        p_flats: idxChunk.map(i=>uFlats[i]),
        p_provinces: idxChunk.map(i=>uProvinces[i]),
        p_parties: idxChunk.map(i=>uParties[i]),
        p_username: (typeof username!=='undefined' && username) ? username : 'admin-rollback-undo'
      });
      if(error) throw error;
      if(!data || data.success!==true){
        throw new Error((data && data.error) || t('rb.err_set_pixel_states'));
      }
    });
  } catch(err){
    console.error('Rollback geri alma (sunucu) hatası:', err);
    showPopup(t('msg.rollback_save_failed', {err: err.message || t('msg.unknown_error')}));
    return;
  }

  rbAppliedPrevState.forEach((prev, f)=>{
    const pid = prev.pid;
    if(!pixData[pid]) pixData[pid] = [];
    const idx = pixData[pid].findIndex(v=>v.flat===f);
    if(prev.party === null){
      if(idx > -1) pixData[pid].splice(idx,1);
    } else {
      if(idx > -1) pixData[pid][idx].party = prev.party;
      else pixData[pid].push({flat:f, party:prev.party});
    }
  });
  rbAppliedPrevState = null;
  rbAppliedFlats = null;
  redrawPixelCanvas();
  draw();
  updateSidebar();
  hideRollbackBanner();
  showPopup(t('msg.rollback_reverted'));
  closeRollbackModal();
}

function showRollbackBanner(label){
  let banner = document.getElementById('rollback-banner');
  if(!banner) return;
  banner.style.display = 'flex';
  document.getElementById('rollback-banner-label').textContent = t('rb.banner_label', {label: label});
}
function hideRollbackBanner(){
  const banner = document.getElementById('rollback-banner');
  if(banner) banner.style.display = 'none';
}

// Admin modu kapatılırsa rollback aracını da kapat (ama uygulanmış rollback
// görünümü canlı oylar üzerinde kalır, çünkü kalıcı olması istenmiyor demekse
// admin tekrar açıp "Geri Al" ile temizleyebilir).
const _origToggleAdminForRollback = window.toggleAdmin;
window.toggleAdmin = function(){
  _origToggleAdminForRollback();
  if(!adminMode && rollbackToolActive){
    rollbackToolActive = false;
    rbSelecting = false;
    rbStartCanvasXY = null; rbCurCanvasXY = null;
    if(rbCanvas) rbCanvas.classList.remove('active');
    const btn = document.getElementById('pt-rollback-toggle');
    const btnLabel = document.getElementById('pt-rollback-toggle-label');
    if(btn){ if(btnLabel) btnLabel.textContent = t('rb.toggle_off'); btn.classList.remove('event-on'); }
  }
};

