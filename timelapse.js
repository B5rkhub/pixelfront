// ══════════════════════════════════════════════════════════
// TİMELAPSE SİSTEMİ
// ══════════════════════════════════════════════════════════

const TL_DAILY_KEY = CONFIG.storageKeys.timelapseDay;
let tlSelectedHours = 1;
let tlSelectedFPS = 2;
let tlRecorder = null;
let tlChunks = [];

function openTimelapseModal() {
  const modal = document.getElementById('timelapse-modal');
  modal.style.display = 'flex';
  checkTLDailyLimit();
  updateTLPreviewInfo();
}

function closeTimelapseModal() {
  document.getElementById('timelapse-modal').style.display = 'none';
  if (tlRecorder && tlRecorder.state !== 'inactive') {
    tlRecorder.stop();
    tlRecorder = null;
  }
}

function checkTLDailyLimit() {
  const today = new Date().toISOString().slice(0, 10);
  let stored = null;
  try { stored = localStorage.getItem(TL_DAILY_KEY); } catch(e) {}
  const infoEl = document.getElementById('tl-daily-info');
  const startBtn = document.getElementById('tl-start-btn');
  if (stored === today) {
    infoEl.style.background = 'rgba(240,74,74,.1)';
    infoEl.style.borderColor = 'rgba(240,74,74,.35)';
    infoEl.innerHTML = '⛔ <b>Bugün zaten timelapse oluşturdun.</b> Yarın tekrar kullanabilirsin.<br><small style="color:var(--muted)">Bu özellik sunucuyu yoğun çalıştırdığı için günde 1 kez sınırlıdır.</small>';
    startBtn.disabled = true;
    startBtn.style.opacity = '0.4';
    startBtn.style.cursor = 'not-allowed';
  } else {
    infoEl.style.background = 'linear-gradient(135deg,rgba(59,130,246,.12),rgba(139,92,246,.08))';
    infoEl.style.borderColor = 'rgba(139,92,246,.3)';
    infoEl.innerHTML = '📅 Timelapse oluşturmak <b>günde 1 kez</b> kullanılabilir — haritanın yoğun hesaplama gerektiren bir özelliğidir.';
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
    startBtn.style.cursor = 'pointer';
  }
}

function selectTLRange(btn, hours) {
  document.querySelectorAll('.tl-range-btn').forEach(b => b.classList.remove('tl-sel'));
  btn.classList.add('tl-sel');
  tlSelectedHours = hours;
  updateTLPreviewInfo();
}

function selectTLSpeed(btn, fps) {
  document.querySelectorAll('.tl-speed-btn').forEach(b => b.classList.remove('tl-ssel'));
  btn.classList.add('tl-ssel');
  tlSelectedFPS = fps;
  updateTLPreviewInfo();
}

function updateTLPreviewInfo() {
  const preview = document.getElementById('tl-preview-info');
  if (!preview) return;
  const hours = tlSelectedHours;
  const fps = tlSelectedFPS;
  const totalMinutes = hours * 60;
  const frameCount = Math.min(totalMinutes, 300);
  const estSec = Math.ceil(frameCount / fps);
  const rangeLabels = {1:t('tl.range_1h_short'),6:t('tl.range_6h_short'),24:t('tl.range_24h'),72:t('tl.range_3d_short'),168:t('tl.range_7d_short')};
  const speedLabels = {2:t('tl.speed_slow'),5:t('tl.speed_normal'),12:t('tl.speed_fast')};
  preview.innerHTML = `${t('tl.preview_range')}<b style="color:var(--txt)">${rangeLabels[hours]||hours+'s'}</b><br>${t('tl.preview_speed')}<b style="color:var(--txt)">${speedLabels[fps]||fps} FPS</b><br>${t('tl.preview_frames')}${frameCount}<br>${t('tl.preview_duration',{s:estSec})}`;
}

async function startTimelapse() {
  const today = new Date().toISOString().slice(0, 10);
  let stored = null;
  try { stored = localStorage.getItem(TL_DAILY_KEY); } catch(e) {}
  if (stored === today) {
    showPopup(t('tl.daily_limit'));
    return;
  }
  if (!window.MediaRecorder) {
    showPopup(t('tl.not_supported'));
    return;
  }
  try { localStorage.setItem(TL_DAILY_KEY, today); } catch(e) {}

  document.getElementById('tl-form').style.display = 'none';
  const prog = document.getElementById('tl-progress');
  prog.style.display = 'flex';
  document.getElementById('tl-download-wrap').style.display = 'none';

  const statusEl = document.getElementById('tl-status-text');
  const barEl = document.getElementById('tl-prog-bar');

  try {
    statusEl.textContent = t('tl.fetching');
    barEl.style.width = '5%';

    const sinceMs = Date.now() - (tlSelectedHours * 3600 * 1000);
    const sinceISO = new Date(sinceMs).toISOString();

    const { data: pixelHistory, error } = await supabase
      .from('pixels')
      .select('flat, province, party, updated_at')
      .gte('updated_at', sinceISO)
      .order('updated_at', { ascending: true });

    if (error) throw error;

    if (!pixelHistory || pixelHistory.length === 0) {
      statusEl.textContent = t('tl.no_pixels_found');
      barEl.style.width = '100%';
      barEl.style.background = '#f04a4a';
      try { localStorage.removeItem(TL_DAILY_KEY); } catch(e) {}
      return;
    }

    statusEl.textContent = t('tl.changes_found', {n: pixelHistory.length});
    barEl.style.width = '20%';

    // Fetch base state (pixels before the selected range)
    const { data: baseState } = await supabase
      .from('pixels')
      .select('flat, party')
      .lt('updated_at', sinceISO);

    barEl.style.width = '30%';

    // Build flat→party map from base state
    const flatMap = new Map();
    if (baseState) {
      for (const px of baseState) flatMap.set(px.flat, px.party);
    }

    // Group pixel events into time buckets → frames
    const startTime = new Date(pixelHistory[0].updated_at).getTime();
    const endTime = new Date(pixelHistory[pixelHistory.length - 1].updated_at).getTime();
    const totalDuration = Math.max(endTime - startTime, 1000);
    const MAX_FRAMES = 240;
    const bucketMs = Math.ceil(totalDuration / MAX_FRAMES);

    const buckets = [];
    let currentBucket = [];
    let currentBucketEnd = startTime + bucketMs;
    for (const px of pixelHistory) {
      const t = new Date(px.updated_at).getTime();
      if (t > currentBucketEnd && currentBucket.length > 0) {
        buckets.push([...currentBucket]);
        currentBucket = [];
        currentBucketEnd = t + bucketMs;
      }
      currentBucket.push(px);
    }
    if (currentBucket.length > 0) buckets.push(currentBucket);

    // Setup canvas
    const tlCanvas = document.getElementById('tl-canvas');
    tlCanvas.width = IMG_W;
    tlCanvas.height = IMG_H;
    tlCanvas.style.display = 'block';
    const tlCtx = tlCanvas.getContext('2d');
    tlCtx.imageSmoothingEnabled = false;

    function renderFrame() {
      if (_origBaseImageData) {
        tlCtx.putImageData(_origBaseImageData, 0, 0);
      } else if (baseCanvas) {
        tlCtx.drawImage(baseCanvas, 0, 0);
      }
      flatMap.forEach((party, flat) => {
        if (party >= 0 && party < PARTIES.length) {
          tlCtx.fillStyle = PARTIES[party].color;
          tlCtx.fillRect(flat % IMG_W, Math.floor(flat / IMG_W), 1, 1);
        }
      });
    }

    // Setup MediaRecorder
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

    const stream = tlCanvas.captureStream(tlSelectedFPS);
    tlRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
    tlChunks = [];
    tlRecorder.ondataavailable = e => { if (e.data.size > 0) tlChunks.push(e.data); };
    tlRecorder.start();

    // Draw initial state
    renderFrame();
    await new Promise(r => setTimeout(r, Math.round(1000 / tlSelectedFPS)));

    const totalBuckets = buckets.length;
    const frameDelay = Math.round(1000 / tlSelectedFPS);

    for (let i = 0; i < totalBuckets; i++) {
      const bucket = buckets[i];
      for (const px of bucket) flatMap.set(px.flat, px.party);
      renderFrame();

      // Timestamp overlay
      const ts = new Date(bucket[bucket.length - 1].updated_at);
      const label = ts.toLocaleString('tr-TR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      const lw = tlCtx.measureText(label).width + 14;
      tlCtx.fillStyle = 'rgba(6,6,15,0.7)';
      tlCtx.fillRect(6, IMG_H - 20, lw, 16);
      tlCtx.fillStyle = '#e8e8f4';
      tlCtx.font = 'bold 10px monospace';
      tlCtx.fillText(label, 13, IMG_H - 8);

      // Progress strip
      const progress = (i + 1) / totalBuckets;
      tlCtx.fillStyle = 'rgba(0,0,0,0.5)';
      tlCtx.fillRect(0, IMG_H - 4, IMG_W, 4);
      tlCtx.fillStyle = '#7B61FF';
      tlCtx.fillRect(0, IMG_H - 4, Math.floor(IMG_W * progress), 4);

      barEl.style.width = (35 + Math.floor(progress * 55)) + '%';
      statusEl.textContent = t('tl.frame_counter', {i: i + 1, total: totalBuckets});

      await new Promise(r => setTimeout(r, frameDelay));
    }

    // Stop recording
    statusEl.textContent = t('tl.building_video');
    barEl.style.width = '96%';
    tlRecorder.stop();
    await new Promise(r => { tlRecorder.onstop = r; });

    const blob = new Blob(tlChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.getElementById('tl-download-link');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `pixelfront_timelapse_${dateStr}_${tlSelectedHours}s.webm`;

    barEl.style.width = '100%';
    statusEl.textContent = t('tl.video_ready_full');
    document.getElementById('tl-download-wrap').style.display = 'flex';

  } catch(err) {
    console.error('Timelapse hatası:', err);
    statusEl.textContent = t('tl.error_prefix') + (err.message || t('msg.unknown_error'));
    barEl.style.background = '#f04a4a';
    try { localStorage.removeItem(TL_DAILY_KEY); } catch(e) {}
  }
}

function resetTimelapse() {
  document.getElementById('tl-form').style.display = 'flex';
  document.getElementById('tl-progress').style.display = 'none';
  document.getElementById('tl-prog-bar').style.width = '0%';
  document.getElementById('tl-prog-bar').style.background = 'linear-gradient(90deg,#3b82f6,#9b7fff)';
  document.getElementById('tl-canvas').style.display = 'none';
  checkTLDailyLimit();
}

// (timelapse button visibility is handled in afterLoad and startGame hooks above)

