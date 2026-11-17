// Stemmer wrapper derived from PyStempel stemmer.py (Apache-2.0).
// See licenses/APACHE-2.0.txt and NOTICE.
import { applyPatch } from './patch.js';
import { decodeRules } from './rules.js';

/** Decode a converted rule table already in memory. No I/O or Python needed. */
export function createPolimorfStemmer(bytes) {
  const trie = decodeRules(bytes);
  return Object.freeze({
    stem(word) {
      if (typeof word !== 'string') throw new TypeError('word must be a string');
      const buffer = Array.from(word);
      const patch = trie.getLastOnPath(buffer);
      if (patch === null) return null;
      applyPatch(buffer, patch);
      return buffer.length ? buffer.join('') : null;
    },
  });
}

/** Load from a Node path/file URL, or an HTTP(S) URL in Node or a browser. */
export async function loadPolimorfStemmer(source = new URL('../data/polimorf-rules.bin', import.meta.url)) {
  const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
  const url = source instanceof URL ? source : null;
  const text = String(source);
  if (isNode && (url?.protocol === 'file:' || !/^[a-z][a-z\d+.-]*:/i.test(text) || /^[a-z]:[\\/]/i.test(text))) {
    const { readFile } = await import('node:fs/promises');
    return createPolimorfStemmer(await readFile(source));
  }
  if (isNode && text.startsWith('file:')) {
    const { readFile } = await import('node:fs/promises');
    return createPolimorfStemmer(await readFile(new URL(text)));
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Failed to load PoliMorf rules: HTTP ${response.status}`);
  return createPolimorfStemmer(await response.arrayBuffer());
}
