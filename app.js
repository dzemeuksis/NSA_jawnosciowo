const DATA_URL = './data/data.json';
const EMBEDDINGS_URL = './data/embeddings.json';
const MODEL_ID = 'Infojura/mmlw-retrieval-e5-small-onnx';
const MODEL_REVISION = '67f0e8cf52ff52b00ebe072ef94ae5a32ef47891';
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
const SEMANTIC_PAGE_SIZE = 25;
const EMBEDDING_BATCH_SIZE = 16;

const els = {
  exact: document.querySelector('#mode-exact'),
  semantic: document.querySelector('#mode-semantic'),
  input: document.querySelector('#search-input'),
  button: document.querySelector('#search-button'),
  type: document.querySelector('#type-filter'),
  hint: document.querySelector('#mode-hint'),
  count: document.querySelector('#result-count'),
  status: document.querySelector('#semantic-status'),
  results: document.querySelector('#results'),
  overlay: document.querySelector('#semantic-overlay'),
  overlayTitle: document.querySelector('#overlay-title'),
  overlayMessage: document.querySelector('#overlay-message'),
  overlayProgress: document.querySelector('#overlay-progress'),
  overlayDetail: document.querySelector('#overlay-detail'),
  overlayClose: document.querySelector('#overlay-close'),
};

let dataMeta = null;
let records = [];
let mode = 'exact';
let extractor = null;
let embeddings = null;
let semanticReady = false;
let semanticInitPromise = null;
let semanticResults = [];
let semanticVisibleCount = 0;
let loadMoreWrap = null;
let loadMoreButton = null;

init();

async function init() {
  try {
    const response = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Nie udało się pobrać danych (${response.status}).`);
    dataMeta = await response.json();
    records = dataMeta.records ?? [];
    populateTypeFilter();
    renderResults(records);
    els.count.textContent = `${records.length} tez w bazie`;
  } catch (error) {
    els.count.textContent = 'Błąd ładowania danych';
    els.results.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }

  createLoadMoreControls();

  els.exact.addEventListener('click', () => setMode('exact'));
  els.semantic.addEventListener('click', async () => {
    if (!semanticReady) {
      try {
        await ensureSemanticReady();
      } catch (error) {
        showSemanticError(error);
        return;
      }
    }
    setMode('semantic');
  });

  els.button.addEventListener('click', runSearch);
  els.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSearch();
  });
  els.input.addEventListener('input', () => {
    if (mode === 'exact') runExactSearch();
  });
  els.type.addEventListener('change', runSearch);
  els.overlayClose.addEventListener('click', () => {
    hideOverlay();
    setMode('exact');
  });

  loadMoreButton.addEventListener('click', () => {
    semanticVisibleCount += SEMANTIC_PAGE_SIZE;
    renderSemanticPage();
  });
}

function populateTypeFilter() {
  const types = [...new Set(records.map(r => r.typ).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pl'));
  for (const type of types) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = prettyType(type);
    els.type.append(option);
  }
}

function setMode(nextMode) {
  mode = nextMode;
  const exact = mode === 'exact';
  if (exact) hideLoadMore();
  els.exact.classList.toggle('active', exact);
  els.semantic.classList.toggle('active', !exact);
  els.exact.setAttribute('aria-selected', String(exact));
  els.semantic.setAttribute('aria-selected', String(!exact));
  els.hint.textContent = exact
    ? 'Wyniki zawierają dokładnie wpisany ciąg znaków; wielkość liter jest ignorowana.'
    : 'Wyniki są sortowane według podobieństwa znaczeniowego do wpisanego pytania lub opisu.';
  els.input.placeholder = exact ? 'Np. przetworzo' : 'Np. rażąca bezczynność';
  runSearch();
  els.input.focus();
}

async function runSearch() {
  if (mode === 'exact') return runExactSearch();
  if (!semanticReady) {
    try { await ensureSemanticReady(); }
    catch (error) { showSemanticError(error); return; }
  }
  return runSemanticSearch();
}

function runExactSearch() {
  hideLoadMore();
  const query = normalize(els.input.value);
  const type = els.type.value;
  const filtered = records.filter(record => {
    if (type && record.typ !== type) return false;
    if (!query) return true;
    return [record.teza, record.znaczenie_projawnosciowe, record.podstawa_w_uzasadnieniu]
      .some(value => normalize(value).includes(query));
  });
  renderResults(filtered, { highlight: els.input.value.trim() });
  els.count.textContent = query || type ? `${filtered.length} wyników` : `${records.length} tez w bazie`;
}

async function runSemanticSearch() {
  const query = els.input.value.trim();
  const type = els.type.value;
  if (!query) {
    hideLoadMore();
    semanticResults = [];
    semanticVisibleCount = 0;
    const filtered = type ? records.filter(r => r.typ === type) : records;
    renderResults(filtered);
    els.count.textContent = type ? `${filtered.length} wyników` : `${records.length} tez w bazie`;
    return;
  }

  els.button.disabled = true;
  els.button.textContent = 'SZUKAM…';
  try {
    const out = await extractor(`query: ${query}`, { pooling: 'mean', normalize: true });
    const queryVector = Array.from(out.data);
    const scored = [];
    for (let i = 0; i < records.length; i++) {
      if (type && records[i].typ !== type) continue;
      scored.push({ record: records[i], score: dot(queryVector, embeddings[i]) });
    }
    scored.sort((a,b) => b.score - a.score);
    semanticResults = scored;
    semanticVisibleCount = SEMANTIC_PAGE_SIZE;
    renderSemanticPage();
  } finally {
    els.button.disabled = false;
    els.button.innerHTML = 'SZUKAJ <span aria-hidden="true">→</span>';
  }
}


function createLoadMoreControls() {
  loadMoreWrap = document.createElement('div');
  loadMoreWrap.style.display = 'none';
  loadMoreWrap.style.justifyContent = 'center';
  loadMoreWrap.style.padding = '22px 0 8px';

  loadMoreButton = document.createElement('button');
  loadMoreButton.type = 'button';
  loadMoreButton.className = 'secondary-button';
  loadMoreButton.style.marginTop = '0';
  loadMoreButton.textContent = `POKAŻ KOLEJNE ${SEMANTIC_PAGE_SIZE}`;

  loadMoreWrap.append(loadMoreButton);
  els.results.insertAdjacentElement('afterend', loadMoreWrap);
}

function hideLoadMore() {
  if (loadMoreWrap) loadMoreWrap.style.display = 'none';
}

function renderSemanticPage() {
  const visible = semanticResults.slice(0, semanticVisibleCount);

  renderResults(
    visible.map(x => x.record),
    {
      scores: new Map(
        visible.map(x => [x.record.id, x.score])
      )
    }
  );

  els.count.textContent = `${visible.length} z ${semanticResults.length} wyników`;

  const remaining = semanticResults.length - visible.length;
  if (remaining > 0) {
    const nextCount = Math.min(SEMANTIC_PAGE_SIZE, remaining);
    loadMoreButton.textContent = `POKAŻ KOLEJNE ${nextCount}`;
    loadMoreWrap.style.display = 'flex';
  } else {
    hideLoadMore();
  }
}

async function ensureSemanticReady() {
  if (semanticReady) return;
  if (semanticInitPromise) return semanticInitPromise;
  semanticInitPromise = initializeSemantic();
  try { await semanticInitPromise; }
  finally { semanticInitPromise = null; }
}

async function initializeSemantic() {
  showOverlay();
  setOverlay(2, 'Pierwsze uruchomienie wyszukiwania znaczeniowego',
    'Przeglądarka musi pobrać polski model wyszukiwania znaczeniowego (około 113 MB modelu ONNX plus niewielkie pliki pomocnicze). Czas zależy od szybkości łącza.',
    'W czasie pobierania interfejs jest zablokowany. Nie zamykaj tej karty.');

  const { pipeline } = await import(TRANSFORMERS_URL);

  extractor = await pipeline('feature-extraction', MODEL_ID, {
    // Repo Infojura zawiera już dynamicznie kwantyzowany plik model.onnx.
    // Przypinamy konkretną rewizję, żeby zmiana układu repozytorium
    // w przyszłości nie zepsuła działającej strony.
    subfolder: '',
    model_file_name: 'model',
    dtype: 'fp32',
    device: 'wasm',
    revision: MODEL_REVISION,
    progress_callback: (info) => {
      if (info?.status === 'progress_total' && Number.isFinite(info.progress)) {
        const p = Math.max(3, Math.min(86, info.progress * 0.83));
        setProgress(p);
        els.overlayDetail.textContent = `Pobieranie i ładowanie modelu: ${Math.round(info.progress)}%`;
      } else if (info?.status === 'progress' && Number.isFinite(info.progress)) {
        const p = Math.max(3, Math.min(82, info.progress * 0.78));
        setProgress(p);
      }
    },
  });

  setOverlay(87, 'Model został pobrany', 'Sprawdzam indeks znaczeniowy dla tez…', 'To zwykle trwa tylko chwilę.');
  embeddings = await loadPrecomputedEmbeddings();

  if (!embeddings) {
    embeddings = await loadCachedEmbeddings();
  }

  if (!embeddings) {
    setOverlay(88, 'Pierwsze przygotowanie indeksu',
      'Dla tej wersji danych nie ma jeszcze gotowego indeksu. Przeglądarka policzy go jednorazowo i zapisze lokalnie.',
      'To może potrwać dłużej niż samo pobranie modelu. Kolejne wizyty będą szybsze.');
    embeddings = await computeCorpusEmbeddings();
    await saveCachedEmbeddings(embeddings);
  }

  if (embeddings.length !== records.length) {
    throw new Error('Liczba embeddingów nie zgadza się z liczbą tez. Wygeneruj indeks ponownie.');
  }

  semanticReady = true;
  els.status.hidden = false;
  setOverlay(100, 'Gotowe', 'Wyszukiwanie znaczeniowe jest gotowe.', 'Interfejs za moment zostanie odblokowany.');
  await sleep(250);
  hideOverlay();
}

async function loadPrecomputedEmbeddings() {
  try {
    const response = await fetch(EMBEDDINGS_URL, { cache: 'no-cache' });
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload.version !== dataMeta.version || payload.model !== MODEL_ID || !Array.isArray(payload.embeddings)) return null;
    return payload.embeddings;
  } catch { return null; }
}

async function computeCorpusEmbeddings() {
  const result = [];
  const total = records.length;
  for (let start = 0; start < total; start += EMBEDDING_BATCH_SIZE) {
    const batch = records.slice(start, start + EMBEDDING_BATCH_SIZE)
      .map(r => `passage: ${r.teza}\n${r.znaczenie_projawnosciowe}`.trim());
    const out = await extractor(batch, { pooling: 'mean', normalize: true });
    const vectors = out.tolist();
    for (const vector of vectors) result.push(vector);
    const done = Math.min(total, start + batch.length);
    const pct = 88 + (done / total) * 11;
    setProgress(pct);
    els.overlayDetail.textContent = `Przygotowanie indeksu: ${done} z ${total} tez`;
    await sleep(0);
  }
  return result;
}

function cacheKey() { return `embeddings:${dataMeta.version}:${MODEL_ID}:${MODEL_REVISION}`; }

async function loadCachedEmbeddings() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('vectors', 'readonly');
      const req = tx.objectStore('vectors').get(cacheKey());
      req.onsuccess = () => resolve(req.result?.embeddings ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

async function saveCachedEmbeddings(value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('vectors', 'readwrite');
      tx.objectStore('vectors').put({ key: cacheKey(), embeddings: value, savedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Nie udało się zapisać indeksu w IndexedDB:', error);
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('nsa-jawnosc-search', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('vectors')) db.createObjectStore('vectors', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function renderResults(items, options = {}) {
  if (!items.length) {
    els.results.innerHTML = '<div class="empty-state">Brak wyników dla podanych kryteriów.</div>';
    return;
  }
  const scores = options.scores ?? new Map();
  const highlight = options.highlight ?? '';
  els.results.innerHTML = items.map(record => {
    const score = scores.get(record.id);
    return `<article class="result-card">
      <div class="result-topline">
        <span class="type-chip">${escapeHtml(prettyType(record.typ))}</span>
        ${Number.isFinite(score) ? `<span class="similarity">podobieństwo: ${Math.round(score * 100)}%</span>` : ''}
      </div>
      <h2>${highlightText(record.teza, highlight)}</h2>
      <div class="field"><span class="field-label">Znaczenie projawnościowe</span><p>${highlightText(record.znaczenie_projawnosciowe, highlight)}</p></div>
      <div class="field"><span class="field-label">Podstawa w uzasadnieniu</span><p class="source-text">${highlightText(record.podstawa_w_uzasadnieniu, highlight)}</p></div>
      <div class="card-footer"><a href="${escapeAttr(record.link)}" target="_blank" rel="noopener noreferrer">Otwórz orzeczenie NSA ↗</a></div>
    </article>`;
  }).join('');
}

function showOverlay() {
  els.overlay.hidden = false;
  els.overlay.setAttribute('aria-hidden', 'false');
  els.overlayClose.hidden = true;
  document.body.classList.add('is-busy');
}
function hideOverlay() {
  els.overlay.hidden = true;
  els.overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-busy');
}
function setOverlay(progress, title, message, detail) {
  setProgress(progress);
  els.overlayTitle.textContent = title;
  els.overlayMessage.textContent = message;
  els.overlayDetail.textContent = detail;
}
function setProgress(value) { els.overlayProgress.style.width = `${Math.max(1, Math.min(100, value))}%`; }
function showSemanticError(error) {
  showOverlay();
  setProgress(100);
  els.overlayTitle.textContent = 'Nie udało się uruchomić wyszukiwania znaczeniowego';
  els.overlayMessage.textContent = error?.message || 'Wystąpił nieoczekiwany błąd podczas ładowania modelu.';
  els.overlayDetail.textContent = 'Wyszukiwanie dokładnej frazy nadal działa normalnie.';
  els.overlayClose.hidden = false;
}

function dot(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}
function normalize(value) { return String(value ?? '').toLocaleLowerCase('pl-PL').replace(/\s+/g, ' ').trim(); }
function prettyType(value) { return String(value || 'inne').replaceAll('_', ' '); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }
function escapeAttr(value) { return escapeHtml(value); }
function highlightText(value, phrase) {
  const safe = escapeHtml(value);
  const needle = String(phrase || '').trim();
  if (!needle) return safe;
  const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try { return safe.replace(new RegExp(escapedNeedle, 'gi'), match => `<mark>${match}</mark>`); }
  catch { return safe; }
}
