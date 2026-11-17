import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTokenizer, bm25Scores, rankBM25, fuseRRF, validateIndex } from '../hybrid-search.js';
import { loadPolimorfStemmer } from '../vendor/stempel-polimorf-js/src/index.js';
const tokenize = createTokenizer(await loadPolimorfStemmer(), JSON.parse(readFileSync('data/bm25-unicode.json')));
let input = '';
for await (const chunk of process.stdin) input += chunk;
function close(a, b) { assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${a} != ${b}`); }
for (const c of JSON.parse(input)) {
  assert.deepEqual(tokenize(c.query), c.tokens, c.query);
  const actual = bm25Scores(c.index, tokenize(c.query));
  actual.forEach((s, i) => close(s, c.scores[i]));
  const lexical = rankBM25(c.index, tokenize(c.query));
  assert.deepEqual(lexical.map(h => h.record_index), c.lexical.map(h => h.record_index), c.query);
  const fused = fuseRRF(c.dense, lexical);
  assert.deepEqual(fused.map(h => h.record_index), c.fused.map(h => h.record_index), c.query);
  fused.forEach((h, i) => close(h.score, c.fused[i].score));
}
const data = JSON.parse(readFileSync('data/data.json'));
const index = JSON.parse(readFileSync('data/bm25.json'));
await validateIndex(index, data);
for (const bad of [{ ...index, version: 'bad' }, { ...index, lengths: [] },
  { ...index, params: { ...index.params, k1: 1 } }, { ...index, fingerprint: 'bad' },
  { ...index, terms: {} }, { ...index, avgdl: index.avgdl + 1 },
  { ...index, terms: { broken: [NaN, [[0, 1]]] } }]) {
  await assert.rejects(validateIndex(bad, data));
}
await assert.rejects(validateIndex(index, { ...data, records: data.records.toReversed() }));
