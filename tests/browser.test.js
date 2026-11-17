import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const data = JSON.parse(readFileSync('data/data.json'));
const vector = JSON.parse(readFileSync('data/embeddings.json')).embeddings[0];
const origin = 'http://127.0.0.1:8765';
let server, browser;
before(async () => {
  server = spawn('python', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); server?.kill(); });
async function pageFor(path = '/', fixture = null) {
  const page = await browser.newPage();
  // Keep model execution deterministic and offline; test the real browser integration,
  // lexical assets and UI. The unchanged 113 MB ONNX model is not downloaded in CI.
  const queryVector = fixture?.queryVector ?? vector;
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body:
    `export async function pipeline(task, model, options) {
      if (model !== 'Infojura/mmlw-retrieval-e5-small-onnx') throw Error('model changed');
      return async text => { if (!text.startsWith('query: ')) throw Error('prefix changed'); return {data: ${JSON.stringify(queryVector)}}; };
    }` }));
  if (fixture) {
    for (const [name, payload] of [['data', fixture.data], ['embeddings', fixture.embeddings], ['bm25', fixture.index]]) {
      await page.route(`**/data/${name}.json`, route => route.fulfill({ json: payload }));
    }
  }
  await page.goto(origin + path);
  await page.waitForFunction(() => document.querySelector('#result-count').textContent.includes('tez w bazie'));
  return page;
}
async function search(page) {
  await page.locator('#search-input').fill('dostęp do informacji publicznej');
  await page.locator('#mode-semantic').click();
  await page.waitForFunction(() => document.querySelector('#result-count').textContent.includes(' z ') && !document.querySelector('#search-button').disabled);
}
test('hybrid, pagination, toggle, type filter, exact phrase and browser loader', async () => {
  const page = await pageFor();
  try {
    await search(page);
    assert.equal(await page.locator('.similarity').count(), 0);
    assert.doesNotMatch(await page.locator('#results').textContent(), /RRF:/);
    const count = await page.locator('#result-count').textContent();
    assert.match(count, /^25 z (1\d\d|200) wyników$/);
    await page.getByRole('button', { name: 'POKAŻ KOLEJNE 25', exact: true }).click();
    assert.equal(await page.locator('.result-card').count(), 50);
    // Execute in-browser score/rank parity using the real stemmer binary, independent of the model mock.
    const hits = await page.evaluate(async () => {
      const module = await import('/hybrid-search.js');
      const data = await (await fetch('/data/data.json')).json();
      return (await module.loadHybrid(data)).rank('dokumentów dokumentów').slice(0, 10);
    });
    assert.equal(hits.length, 10);
    await page.locator('#hybrid-toggle').uncheck();
    await page.waitForFunction(() => document.querySelector('.similarity')?.textContent.includes('podobieństwo'));
    assert.equal(await page.locator('#result-count').textContent(), `25 z ${data.records.length} wyników`);
    const type = data.records[0].typ;
    await page.locator('#type-filter').selectOption(type);
    await page.waitForFunction(expected => document.querySelector('#result-count').textContent === expected,
      `25 z ${data.records.filter(r => r.typ === type).length} wyników`);
    await page.locator('#mode-exact').click();
    await page.locator('#type-filter').selectOption('');
    const phrase = data.records[0].podstawa_w_uzasadnieniu.slice(0, 90);
    await page.locator('#search-input').fill(phrase);
    await page.waitForFunction(() => document.querySelectorAll('.result-card').length > 0);
    assert.ok((await page.locator('.source-text').first().textContent()).includes(phrase));
  } finally { await page.close(); }
});
for (const failure of ['404', 'bad-version', 'corrupt-rules', 'broken-module', 'network', 'timeout']) {
  test(`MMLW fallback: ${failure}`, async () => {
    const page = await pageFor();
    try {
      if (failure === '404' || failure === 'network' || failure === 'bad-version' || failure === 'timeout') {
        await page.route('**/data/bm25.json', async route => {
          if (failure === 'network') return route.abort();
          if (failure === 'timeout') return; // leave fetch unresolved; app must recover
          if (failure === '404') return route.fulfill({ status: 404, body: '' });
          const index = JSON.parse(readFileSync('data/bm25.json'));
          index.version = 'stale';
          return route.fulfill({ json: index });
        });
      } else {
        await page.route(failure === 'corrupt-rules' ? '**/polimorf-rules.bin' : '**/hybrid-search.js',
          route => route.fulfill({ contentType: 'text/javascript', body: 'broken' }));
      }
      await search(page);
      assert.match(await page.locator('.similarity').first().textContent(), /podobieństwo:/);
      assert.match(await page.locator('#semantic-status').textContent(), /MMLW działa/);
      assert.equal(await page.locator('#result-count').textContent(), `25 z ${data.records.length} wyników`);
    } finally { await page.close(); }
  });
}
test('URL opt-out skips lexical loading', async () => {
  const page = await pageFor('/?hybrid=0');
  try {
    let lexicalRequests = 0;
    page.on('request', request => { if (/bm25|polimorf|hybrid-search/.test(request.url())) lexicalRequests++; });
    await search(page);
    assert.equal(lexicalRequests, 0);
    assert.match(await page.locator('.similarity').first().textContent(), /podobieństwo:/);
  } finally { await page.close(); }
});

test('global feature flag skips lexical loading and hides toggle', async () => {
  const page = await pageFor();
  try {
    await page.route('**/search-config.js', route => route.fulfill({
      contentType: 'text/javascript', body: 'export const HYBRID_ENABLED = false;'
    }));
    let lexicalRequests = 0;
    page.on('request', request => { if (/bm25|polimorf|hybrid-search/.test(request.url())) lexicalRequests++; });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#result-count').textContent.includes('tez w bazie'));
    await search(page);
    assert.equal(lexicalRequests, 0);
    assert.equal(await page.locator('#hybrid-controls').isVisible(), false);
    assert.match(await page.locator('.similarity').first().textContent(), /podobieństwo:/);
  } finally { await page.close(); }
});

test('type filter admits records below both global top-100 cutoffs and rebases RRF', async () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/type-filter.json'));
  const page = await pageFor('/', fixture);
  try {
    await page.locator('#search-input').fill(fixture.query);
    await page.locator('#mode-semantic').click();
    await page.waitForFunction(() => document.querySelector('#result-count').textContent === '25 z 100 wyników');
    assert.equal(await page.locator('.similarity').count(), 0);
    // Python oracle proves the rare records have positive BM25 scores but are
    // outside BOTH global pools. The UI must filter before truncation and fusion.
    const rareIndices = fixture.expected.map(h => h.record_index);
    for (const global of [fixture.dense, fixture.lexical]) {
      assert.ok(rareIndices.every(i => global.findIndex(h => h.record_index === i) >= 100));
    }
    const expectedSignatures = fixture.expected.map(h => fixture.data.records[h.record_index].sygnatura);
    await page.locator('#type-filter').selectOption('rzadki');
    await page.waitForFunction(() => document.querySelector('#result-count').textContent === '5 z 5 wyników');
    assert.deepEqual(await page.locator('.case-signature').allTextContents(), expectedSignatures);
    assert.equal(await page.locator('.similarity').count(), 0);
    assert.doesNotMatch(await page.locator('#results').textContent(), /RRF:/);
    const actual = await page.evaluate(async ({ query, dense, records }) => {
      const module = await import('/hybrid-search.js');
      const data = await (await fetch('/data/data.json')).json();
      const hybrid = await module.loadHybrid(data);
      const rare = hits => hits.filter(h => records[h.record_index].typ === 'rzadki');
      return hybrid.fuse(rare(dense), rare(hybrid.rank(query)));
    }, { query: fixture.query, dense: fixture.dense, records: fixture.data.records });
    assert.deepEqual(actual, fixture.expected);
    await page.locator('#hybrid-toggle').uncheck();
    await page.waitForFunction(() => document.querySelector('.similarity')?.textContent.includes('podobieństwo'));
    assert.deepEqual(await page.locator('.case-signature').allTextContents(), expectedSignatures);
    assert.equal(await page.locator('.similarity').count(), 5);
    await page.locator('#hybrid-toggle').check();
    await page.waitForFunction(() => !document.querySelector('#search-button').disabled && !document.querySelector('.similarity'));
    assert.deepEqual(await page.locator('.case-signature').allTextContents(), expectedSignatures);
    await page.locator('#type-filter').selectOption('');
    await page.waitForFunction(() => document.querySelector('#result-count').textContent === '25 z 100 wyników');
  } finally { await page.close(); }
});
