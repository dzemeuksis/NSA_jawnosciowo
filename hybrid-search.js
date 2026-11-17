// BM25Okapi and RRF compatible with porownaj_modele.py / rank_bm25 0.2.2.
export const POOL_SIZE = 100;
export const RRF_K = 60;
export const compareHits = (a, b) => b.score - a.score || a.record_index - b.record_index;

export function createTokenizer(stemmer, unicode) {
  function isAlnum(cp) {
    let low = 0, high = unicode.ranges.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1, [a, b] = unicode.ranges[mid];
      if (cp < a) high = mid - 1;
      else if (cp > b) low = mid + 1;
      else return true;
    }
    return false;
  }
  return text => {
    const folded = Array.from(String(text), c => unicode.folds[c] ?? c).join('');
    const words = [];
    let word = [], tokens = [];
    const flush = () => {
      if (word.length >= 2) words.push(word.join(''));
      word = [];
    };
    for (const c of folded) {
      if (isAlnum(c.codePointAt(0))) word.push(c);
      else flush();
    }
    flush();
    for (const w of words) tokens.push(stemmer.stem(w)?.toLowerCase() || w);
    return tokens;
  };
}

export function bm25Scores(index, tokens) {
  const scores = new Float64Array(index.lengths.length);
  const { k1, b } = index.params;
  // Preserve query order and repeated terms, as BM25Okapi.get_scores does.
  for (const token of tokens) {
    if (!Object.hasOwn(index.terms, token)) continue;
    const [idf, postings] = index.terms[token];
    for (const [i, tf] of postings) {
      scores[i] += idf * (tf * (k1 + 1) /
        (tf + k1 * (1 - b + b * index.lengths[i] / index.avgdl)));
    }
  }
  return scores;
}

export function rankBM25(index, tokens) {
  return Array.from(bm25Scores(index, tokens), (score, record_index) => ({ score, record_index }))
    .filter(hit => hit.score > 0).sort(compareHits);
}

export function fuseRRF(dense, lexical, limit = Infinity) {
  const scores = new Map();
  for (const ranking of [dense, lexical]) {
    ranking.slice(0, POOL_SIZE).forEach((hit, i) => {
      scores.set(hit.record_index, (scores.get(hit.record_index) ?? 0) + 1 / (RRF_K + i + 1));
    });
  }
  return Array.from(scores, ([record_index, score]) => ({ record_index, score }))
    .sort(compareHits).slice(0, limit);
}

export async function validateIndex(index, data) {
  const fail = () => { throw new Error('Nieprawidłowy lub nieaktualny indeks BM25'); };
  if (index.schema !== 1 || index.version !== data.version ||
      index.lengths?.length !== data.records.length ||
      index.params?.k1 !== 1.5 || index.params.b !== 0.75 || index.params.epsilon !== 0.25 ||
      !Number.isFinite(index.avgdl) || index.avgdl <= 0 || !index.terms ||
      index.lengths.some(n => !Number.isInteger(n) || n < 0)) fail();
  const entries = Object.values(index.terms);
  if (!entries.length) fail();
  const totals = new Float64Array(index.lengths.length);
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || !Number.isFinite(entry[0]) || !Array.isArray(entry[1])) fail();
    let previous = -1;
    for (const [i, tf] of entry[1]) {
      if (!Number.isInteger(i) || i <= previous || i >= index.lengths.length ||
          !Number.isInteger(tf) || tf <= 0 || tf > index.lengths[i]) fail();
      totals[i] += tf;
      previous = i;
    }
  }
  if (totals.some((n, i) => n !== index.lengths[i]) ||
      Math.abs(index.lengths.reduce((a, b) => a + b, 0) / index.lengths.length - index.avgdl) > 1e-12) fail();
  const texts = data.records.map(r => `${r.teza ?? ''}\n${r.znaczenie_projawnosciowe ?? ''}`);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(texts)));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== index.fingerprint) fail();
}

export async function loadHybrid(data, { indexURL = new URL('./data/bm25.json', import.meta.url),
  unicodeURL = new URL('./data/bm25-unicode.json', import.meta.url),
  rulesURL = new URL('./vendor/stempel-polimorf-js/data/polimorf-rules.bin', import.meta.url) } = {}) {
  async function json(url) {
    const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`BM25 HTTP ${response.status}`);
    return response.json();
  }
  const [{ loadPolimorfStemmer }, index, unicode] = await Promise.all([
    import('./vendor/stempel-polimorf-js/src/index.js'), json(indexURL), json(unicodeURL),
  ]);
  await validateIndex(index, data);
  const tokenize = createTokenizer(await loadPolimorfStemmer(rulesURL), unicode);
  return { rank: query => rankBM25(index, tokenize(query)), fuse: fuseRRF };
}
