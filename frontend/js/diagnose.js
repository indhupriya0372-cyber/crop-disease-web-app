/* ============================================================
   AgriCare AI — Diagnose page logic
   Upload/preview + run prediction via the Node backend
   (/api/predict on port 5001) with an in-browser fallback so the
   tool always works, even opened statically.
   ============================================================ */

(function () {
  'use strict';

  const Auth = window.AgriCareAuth;
  const API_BASE = (Auth && Auth.API_BASE) || 'http://127.0.0.1:5001';
  const getToken = () => (Auth ? Auth.getToken() : null);

  // Turn a server-relative path such as /uploads/x.png into a full URL,
  // and attach the JWT so the protected photo endpoint accepts it.
  function assetUrl(path) {
    if (!path) return path;
    const base = path.startsWith('http') ? path : API_BASE + path;
    const token = getToken();
    if (!token) return base;
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(token);
  }

  const dropZone = document.getElementById('dropZone');
  const dropContent = document.getElementById('dropContent');
  const previewWrap = document.getElementById('previewWrap');
  const previewImg = document.getElementById('previewImg');
  const fileInput = document.getElementById('fileInput');
  const resetBtn = document.getElementById('resetBtn');
  const predictBtn = document.getElementById('predictBtn');

  const resultEmpty = document.getElementById('resultEmpty');
  const resultData = document.getElementById('resultData');
  const resultLoading = document.getElementById('resultLoading');
  const resultBadge = document.getElementById('resultBadge');
  const resultDisease = document.getElementById('resultDisease');
  const resultScientific = document.getElementById('resultScientific');
  const barLabel1 = document.getElementById('barLabel1');
  const barLabel2 = document.getElementById('barLabel2');
  const barLabel3 = document.getElementById('barLabel3');
  const barFill1 = document.getElementById('barFill1');
  const barFill2 = document.getElementById('barFill2');
  const barFill3 = document.getElementById('barFill3');
  const barPct1 = document.getElementById('barPct1');
  const barPct2 = document.getElementById('barPct2');
  const barPct3 = document.getElementById('barPct3');
  const treatmentList = document.getElementById('treatmentList');
  const resultSavedNote = document.getElementById('resultSavedNote');
  const sampleGallery = document.getElementById('sampleGallery');
  const sampleFilters = document.getElementById('sampleFilters');
  const sampleCount = document.getElementById('sampleCount');

  let currentImage = null;
  let currentFile = null;
  let samples = [];
  let activeCrop = 'all';
  let serverSaved = false;

  /* ---------- Upload handlers ---------- */
  function setDemoImage(img) {
    currentImage = img;
    previewImg.src = img.src || img.toDataURL();
    dropContent.classList.add('hidden');
    previewWrap.classList.remove('hidden');
    resultEmpty.classList.remove('hidden');
    resultData.classList.add('hidden');
    resultLoading.classList.add('hidden');
    resultEmpty.querySelector('.empty-icon').textContent = '✅';
    resultEmpty.querySelector('p').textContent = 'Image ready. Click “Analyze Leaf” to run the classifier.';
    window.scrollTo({ top: dropZone.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
  }

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG or WEBP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10 MB.');
      return;
    }
    currentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => setDemoImage(img);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  resetBtn.addEventListener('click', () => {
    currentImage = null;
    currentFile = null;
    fileInput.value = '';
    previewImg.src = '';
    dropContent.classList.remove('hidden');
    previewWrap.classList.add('hidden');
    resultEmpty.classList.remove('hidden');
    resultData.classList.add('hidden');
    resultLoading.classList.add('hidden');
    resultEmpty.querySelector('.empty-icon').textContent = '🔬';
    resultEmpty.querySelector('p').textContent = 'Upload a leaf image to see the diagnosis appear here.';
  });

  /* ---------- Labelled sample gallery (from /api/samples) ---------- */
  function cropOf(s) {
    return (s.crop || (s.key || '').split('_')[0] || 'other');
  }

  function loadSamples() {
    if (!sampleGallery) return;
    Auth.api('/api/samples')
      .then((result) => {
        const data = result.json;
        samples = (data && data.samples) || [];
        samples = samples.map((s) => ({ ...s, url: assetUrl(s.url) }));
        if (sampleCount) {
          const crops = new Set(samples.map(cropOf));
          sampleCount.textContent = samples.length
            ? `(${samples.length} images · ${crops.size} crops)`
            : '(none generated yet)';
        }
        renderFilters();
        renderSamples();
      })
      .catch(() => {
        sampleGallery.innerHTML =
          '<p class="sample-hint">Samples unavailable — run <code>python generate_samples.py</code> to create them.</p>';
      });
  }

  function renderFilters() {
    if (!sampleFilters) return;
    const crops = Array.from(new Set(samples.map(cropOf))).sort();
    const chips = [{ key: 'all', label: 'All', n: samples.length }].concat(
      crops.map((c) => ({ key: c, label: c, n: samples.filter((s) => cropOf(s) === c).length }))
    );
    sampleFilters.innerHTML = chips
      .map((c) => `<button class="sample-chip${c.key === activeCrop ? ' active' : ''}" data-crop="${c.key}">${c.label} <span>${c.n}</span></button>`)
      .join('');
    sampleFilters.querySelectorAll('.sample-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCrop = btn.getAttribute('data-crop');
        shown = PAGE_SIZE;
        renderFilters();
        renderSamples();
      });
    });
  }

  const PAGE_SIZE = 24;
  let shown = PAGE_SIZE;

  function renderSamples() {
    if (!sampleGallery) return;
    const list = activeCrop === 'all' ? samples : samples.filter((s) => cropOf(s) === activeCrop);
    const slice = list.slice(0, shown);
    if (!list.length) {
      sampleGallery.innerHTML = '<p class="sample-hint">No samples in this group.</p>';
      return;
    }
    sampleGallery.innerHTML = slice
      .map((s, i) => {
        const level = s.level || 'warning';
        const label = String(s.label || s.file).replace(/[&<>"']/g, '');
        return `<button class="sample-item" data-i="${i}" title="${label}">
          <img src="${s.url}" alt="${label}" loading="lazy" decoding="async" width="120" height="120" />
          <span class="sample-item-label">${label}</span>
          <span class="sample-tag ${level}">${level}</span>
        </button>`;
      })
      .join('');

    if (list.length > shown) {
      const more = document.createElement('button');
      more.className = 'sample-more';
      more.textContent = `Show ${Math.min(PAGE_SIZE, list.length - shown)} more of ${list.length}`;
      more.addEventListener('click', () => { shown += PAGE_SIZE; renderSamples(); });
      sampleGallery.appendChild(more);
    }

    sampleGallery.querySelectorAll('.sample-item').forEach((btn) => {
      btn.addEventListener('click', () => chooseSample(slice[Number(btn.getAttribute('data-i'))]));
    });
  }

  async function chooseSample(sample) {
    if (!sample) return;
    try {
      const res = await fetch(sample.url, { credentials: 'same-origin' });
      const blob = await res.blob();
      const name = sample.file || 'sample.png';
      currentFile = new File([blob], name, { type: blob.type || 'image/png' });

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        // Decode first, then analyse — otherwise currentImage is still null.
        img.onload = () => { setDemoImage(img); runPrediction(); };
        img.src = e.target.result;
      };
      reader.readAsDataURL(currentFile);
    } catch (err) {
      alert('Could not load that sample image.');
    }
  }

  /* ---------- Prediction ---------- */
  async function predictViaServer() {
    if (!currentFile) return null;
    const form = new FormData();
    form.append('image', currentFile);
    try {
      const result = await Auth.api('/api/predict', { method: 'POST', body: form });
      if (result.status === 401) {
        window.location.href = 'login.html?next=diagnose.html';
        return null;
      }
      if (!result.ok) return null;
      const data = result.json;
      const list = Array.isArray(data.predictions) && data.predictions.length ? data.predictions : null;
      if (list) serverSaved = !!(data.record);
      return list;
    } catch (err) {
      return null; // backend not running -> local demo fallback
    }
  }

  async function runPrediction() {
    if (!currentImage) { alert('Upload or choose a leaf image first.'); return; }
    resultEmpty.classList.add('hidden');
    resultData.classList.add('hidden');
    resultLoading.classList.remove('hidden');
    serverSaved = false;

    let results;
    let fromServer = false;
    try {
      results = await predictViaServer();
      fromServer = !!results;
      if (!results) results = await window.AgriCare.demoPredict(currentImage);
      if (!results || !results.length) throw new Error('No results returned');
    } catch (err) {
      // Always clear the spinner, otherwise it spins forever.
      resultLoading.classList.add('hidden');
      resultEmpty.classList.remove('hidden');
      if (resultSavedNote) {
        resultSavedNote.textContent = 'Could not analyse that image. Try a different photo, or open the browser console (F12) to see the error.';
        resultSavedNote.classList.add('is-error');
      }
      return;
    }

    resultLoading.classList.add('hidden');
    resultData.classList.remove('hidden');

    const [top, second, third] = results;
    resultBadge.textContent = `${top.emoji} ${top.level === 'healthy' ? 'Healthy' : 'Suspected Condition'}`;
    resultBadge.className = 'result-badge ' + (top.level === 'healthy' ? 'healthy' : top.level === 'severe' ? 'severe' : 'warning');
    resultDisease.textContent = top.name;
    resultScientific.textContent = top.scientific;

    setBar(barLabel1, barFill1, barPct1, top);
    setBar(barLabel2, barFill2, barPct2, second);
    setBar(barLabel3, barFill3, barPct3, third);

    treatmentList.innerHTML = '';
    (top.treatment || []).forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      treatmentList.appendChild(li);
    });

    if (resultSavedNote) {
      if (!fromServer) {
        resultSavedNote.textContent = 'Offline demo classifier (browser fallback) — start the Node backend to use the CNN and save this result.';
      } else if (serverSaved) {
        resultSavedNote.textContent = '💾 Saved to My Recent Scans.';
      } else {
        resultSavedNote.textContent = 'Diagnosis runs on the backend CNN when available; a built-in browser demo guarantees the app always works.';
      }
    }

    loadMyScans();
    resultData.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- My Recent Scans (this farmer only) ---------- */
  async function loadMyScans() {
    const strip = document.getElementById('myScansStrip');
    if (!strip) return;
    try {
      const result = await Auth.api('/api/history');
      if (result.status === 401) { window.location.href = 'login.html?next=diagnose.html'; return; }
      if (!result.ok) return;
      const data = result.json;
      const items = (data && data.history) || [];
      if (!items.length) {
        strip.innerHTML = '<p class="table-empty">No scans yet — upload a leaf above to get your first result.</p>';
        return;
      }
      strip.innerHTML = items.slice(0, 12).map((h) => {
        const thumb = h.image_url
          ? '<img src="' + assetUrl(h.image_url) + '" alt="leaf photo" loading="lazy">'
          : '<span class="my-scan-thumb-empty">no photo</span>';
        const pct = Math.round((h.confidence || 0) * 100);
        return '<div class="my-scan-card">' + thumb +
          '<div class="my-scan-body">' +
            '<strong>' + (h.disease || 'Unknown') + '</strong>' +
            '<span class="my-scan-meta">' + (h.crop || '—') + ' · ' + pct + '% · ' + new Date(h.created_at).toLocaleDateString() + '</span>' +
          '</div>' +
          '<span class="pill ' + (h.level === 'healthy' ? 'healthy' : h.level === 'severe' ? 'severe' : 'warning') + '">' + (h.level || '') + '</span>' +
        '</div>';
      }).join('');
    } catch (err) { /* server offline */ }
  }

  function setBar(labelEl, fillEl, pctEl, item) {
    if (!item) { labelEl.textContent = '—'; fillEl.style.width = '0%'; pctEl.textContent = '0%'; return; }
    labelEl.textContent = item.name.split(' — ')[1] || item.name;
    const pct = Math.round(item.confidence * 100);
    fillEl.style.width = pct + '%';
    pctEl.textContent = pct + '%';
  }

  /* ---------- Backend connection check (no redirects, no flashing) ---------- */
  function checkConnection() {
    const banner = document.getElementById('connBanner');
    if (!banner) return;
    Auth.api('/api/health')
      .then((result) => {
        if (result.ok) { banner.hidden = true; return; }
        throw new Error(result.status);
      })
      .catch(() => {
        banner.hidden = false;
        banner.className = 'conn-banner warn';
        banner.textContent =
          'Backend not connected — this page is running without the server. ' +
          'Start the Node backend (cd backend && npm start) and the Python AI service (ai-service), ' +
          'then open http://127.0.0.1:5001. The offline demo classifier still works.';
      });
  }

  predictBtn.addEventListener('click', runPrediction);
  checkConnection();
  loadSamples();
  loadMyScans();
})();