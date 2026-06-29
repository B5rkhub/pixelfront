// ═══════════════════════════════════════════════════
// GEÇMİŞ GÖRÜNÜM SİSTEMİ
// ═══════════════════════════════════════════════════

let _historyMode = false;
let _historySavedPixData = null; // canlı verinin yedeği
let _historyAllRows = null;      // [{flat,province,party,t(ms)}, ...] zaman sıralı tüm geçmiş
let _historyBaseState = null;    // seçilen aralık başlamadan ÖNCEKİ flat→{party,province} state'i
let _historyCurrentTime = null;  // şu an gösterilen anın ms cinsinden zamanı
let _historyMinTime = null;      // scrub edilebilecek en eski an (seçilen tarih)
let _historyStepMin = 60;        // scrub adımı (dakika)

function openHistoryModal() {
  const modal = document.getElementById('history-modal');
  modal.style.display = 'flex';

  // Varsayılan: 24 saat önce
  const dt = document.getElementById('history-datetime');
  const d = new Date(Date.now() - 24 * 3600 * 1000);
  // datetime-local formatı: YYYY-MM-DDTHH:MM
  dt.value = d.toISOString().slice(0, 16);
  dt.max = new Date().toISOString().slice(0, 16);

  document.getElementById('history-modal-err').style.display = 'none';
  const btn = document.getElementById('history-go-btn');
  btn.disabled = false;
  btn.style.opacity = '1';
  btn.textContent = t('hm.go_btn');

  // Scrub adım seçiciyi varsayılana al
  const stepSel = document.getElementById('hist-scrub-step');
  if (stepSel) { stepSel.value = '60'; _historyStepMin = 60; }
}

function closeHistoryModal() {
  document.getElementById('history-modal').style.display = 'none';
}

function historyQuick(hoursAgo) {
  const d = new Date(Date.now() - hoursAgo * 3600 * 1000);
  document.getElementById('history-datetime').value = d.toISOString().slice(0, 16);
}

async function loadHistoryView() {
  const dtVal = document.getElementById('history-datetime').value;
  const errEl = document.getElementById('history-modal-err');
  const btn = document.getElementById('history-go-btn');

  if (!dtVal) {
    errEl.textContent = t('hm.err_no_date');
    errEl.style.display = 'block';
    return;
  }

  const targetDate = new Date(dtVal);
  if (isNaN(targetDate.getTime())) {
    errEl.textContent = t('hm.err_invalid');
    errEl.style.display = 'block';
    return;
  }
  if (targetDate > new Date()) {
    errEl.textContent = '⚠ Gelecek bir tarih seçemezsin.';
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.textContent = t('hm.loading');

  try {
    const isoStr = targetDate.toISOString();

    // ÖNEMLİ: 'pixels' tek satır/flat tuttuğu için geçmişi saklamaz.
    // 1) Seçilen ândan ÖNCEKİ taban durumu artık 'pixel_log' tabanlı
    //    get_full_pixel_state_at() RPC'sinden hesaplanıyor — bu, sonradan
    //    tekrar oylanmış pikselleri YANLIŞLIKLA boş göstermek yerine
    //    gerçek geçmiş değerlerini döndürür.
    const { data: dataSorted, error: e2 } = await supabase
      .rpc('get_full_pixel_state_at', { p_at: isoStr });

    if (e2) throw e2;

    if (!dataSorted || dataSorted.length === 0) {
      errEl.textContent = t('hm.err_no_data');
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.textContent = t('hm.go_btn');
      return;
    }

    const baseState = new Map();
    for (const row of dataSorted) {
      const p = parseInt(row.party, 10);
      if (!isNaN(p) && p >= 0 && p < PARTIES.length) {
        baseState.set(Number(row.flat), { party: p, province: row.province });
      }
    }

    // 2) Seçilen ândan ŞU ANA kadarki tüm OYLARI (her tekil oy, son hal
    //    değil) 'pixel_log'dan çekiyoruz — artık scrub ileri sarınca
    //    pikseller gerçekten o sıradaki ara renklerden geçerek değişiyor,
    //    öncesinde olduğu gibi doğrudan en son rengine atlamıyor.
    const { data: forwardRows, error: e3 } = await supabase
      .from('pixel_log')
      .select('flat, province, party, created_at')
      .gt('created_at', isoStr)
      .order('created_at', { ascending: true });

    if (e3) throw e3;

    const allRows = (forwardRows || []).map(row => {
      const p = parseInt(row.party, 10);
      if (isNaN(p) || p < 0 || p >= PARTIES.length) return null;
      return { flat: Number(row.flat), province: row.province, party: p, t: new Date(row.created_at).getTime() };
    }).filter(Boolean);

    // Canlı pixData'yı yedekle (ilk kez giriliyorsa)
    if (!_historyMode) {
      _historySavedPixData = JSON.parse(JSON.stringify(pixData));
    }

    _historyBaseState = baseState;
    _historyAllRows = allRows;
    _historyMinTime = targetDate.getTime();
    _historyCurrentTime = targetDate.getTime();

    applyHistoryState(_historyCurrentTime);

    // Geçmiş modunu aktifleştir
    _historyMode = true;

    // Banner göster
    const banner = document.getElementById('history-banner');
    banner.classList.add('active');
    updateHistoryBannerLabel();

    // Modali kapat
    closeHistoryModal();

    const label = targetDate.toLocaleString(_currentLang==='tr'?'tr-TR':'en-US', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    showPopup(t('msg.went_to_moment', {label: label}));

  } catch(err) {
    console.error('Geçmiş yükleme hatası:', err);
    errEl.textContent = '⚠ Hata: ' + (err.message || 'Bilinmeyen hata');
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.textContent = t('hm.go_btn');
  }
}

// Belirli bir ana kadarki (targetTime, ms) state'i hesaplayıp çizer.
// _historyBaseState taban alınır, sonra _historyAllRows içinde
// t <= targetTime olan olaylar sırayla üzerine uygulanır.
function applyHistoryState(targetTime) {
  if (!_historyBaseState || !_historyAllRows) return;

  const flatMap = new Map(_historyBaseState);
  for (const row of _historyAllRows) {
    if (row.t > targetTime) break; // sıralı olduğundan devamını gezmeye gerek yok
    flatMap.set(row.flat, { party: row.party, province: row.province });
  }

  const histPixData = {};
  flatMap.forEach((v, flat) => {
    const pid = v.province;
    if (!histPixData[pid]) histPixData[pid] = [];
    histPixData[pid].push({ flat, party: v.party });
  });
  pixData = histPixData;

  if (pixelCanvas) {
    redrawPixelCanvas();
    draw();
    updateSidebar();
  }
}

function updateHistoryBannerLabel() {
  const labelEl = document.getElementById('history-banner-label');
  if (!labelEl || _historyCurrentTime == null) return;
  const d = new Date(_historyCurrentTime);
  const label = d.toLocaleString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  let count = 0;
  if (_historyBaseState) {
    count = _historyBaseState.size;
    if (_historyAllRows) {
      const seen = new Set(_historyBaseState.keys());
      for (const row of _historyAllRows) {
        if (row.t > _historyCurrentTime) break;
        if (!seen.has(row.flat)) { seen.add(row.flat); count++; }
      }
    }
  }
  labelEl.textContent = `📍 ${label} · ${count.toLocaleString('tr-TR')} piksel`;

  // İleri/geri butonlarının sınırlarını güncelle
  const now = Date.now();
  const backBtn = document.getElementById('hist-scrub-back');
  const fwdBtn = document.getElementById('hist-scrub-fwd');
  if (backBtn) {
    const atMin = _historyCurrentTime <= _historyMinTime;
    backBtn.disabled = atMin;
    backBtn.style.opacity = atMin ? '0.35' : '1';
    backBtn.style.cursor = atMin ? 'not-allowed' : 'pointer';
  }
  if (fwdBtn) {
    const atNow = _historyCurrentTime >= now;
    fwdBtn.disabled = atNow;
    fwdBtn.style.opacity = atNow ? '0.35' : '1';
    fwdBtn.style.cursor = atNow ? 'not-allowed' : 'pointer';
  }
}

function updateHistScrubStep() {
  const sel = document.getElementById('hist-scrub-step');
  if (sel) _historyStepMin = parseInt(sel.value, 10) || 60;
}

// direction: -1 (geri) veya 1 (ileri)
function scrubHistory(direction) {
  if (!_historyMode || _historyCurrentTime == null) return;
  const stepMs = _historyStepMin * 60 * 1000;
  let next = _historyCurrentTime + direction * stepMs;
  const now = Date.now();
  if (next < _historyMinTime) next = _historyMinTime;
  if (next > now) next = now;
  if (next === _historyCurrentTime) return;
  _historyCurrentTime = next;
  applyHistoryState(_historyCurrentTime);
  updateHistoryBannerLabel();
}

function exitHistoryMode() {
  if (!_historyMode) return;

  // Canlı veriyi geri yükle
  if (_historySavedPixData !== null) {
    pixData = _historySavedPixData;
    _historySavedPixData = null;
  }

  _historyMode = false;
  _historyAllRows = null;
  _historyBaseState = null;
  _historyCurrentTime = null;
  _historyMinTime = null;

  // Banner gizle
  const banner = document.getElementById('history-banner');
  banner.classList.remove('active');

  // Canvas'ı yeniden çiz
  if (pixelCanvas) {
    redrawPixelCanvas();
    draw();
    updateSidebar();
  }

  showPopup(t('msg.back_to_live'));
}

// Geçmiş modunda piksel koyulmasını engelle
const _origHandleClickHistory = window.handleClick;
window.handleClick = function(mx, my) {
  if (_historyMode) {
    showPopup(t('msg.in_history_mode'));
    return;
  }
  _origHandleClickHistory.apply(this, arguments);
};

// Geçmiş modunda realtime güncellemeleri engelle (canlı verinin üzerine yazmasın)
const _origStartRealtimeSync = window.startRealtimeSync;
// startRealtimeSync zaten çalışıyor, ama channel callback'inde history kontrolü yapıyoruz
// Bunun için redrawPixelCanvas ve draw hookunu ekleyelim:
const _origDraw = window.draw;
window.draw = function() {
  // History modunda canlı draw normal çalışır, çünkü pixData zaten geçmişe ayarlı
  if (typeof _origDraw === 'function') _origDraw.apply(this, arguments);
};

// History butonunu afterLoad'da da göster (zaten yukarıda eklendi, burada güvence)
document.addEventListener('DOMContentLoaded', () => {
  const hBtn = document.getElementById('history-btn');
  if (hBtn) hBtn.style.display = 'none'; // başlangıçta gizli, login'de açılır
});

