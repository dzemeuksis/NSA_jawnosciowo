// Derived from PyStempel egothor.py, Copyright 1997–2004 Leo Galambos
// and 2002–2004 Egothor developers. See licenses/EGOTHOR.txt.
import { patchLength } from './patch.js';

export class IndexError extends Error {
  constructor() {
    super('string index out of range');
    this.name = 'IndexError';
  }
}

export class Trie {
  constructor(forward, root, commands, offsets, chars, cmds, refs) {
    Object.assign(this, { forward, root, commands, offsets, chars, cmds, refs });
  }

  getLastOnPath(key) {
    if (!key.length) throw new IndexError();
    let row = this.root;
    let last = null;
    for (let i = 0; i < key.length; i++) {
      const code = key[this.forward ? i : key.length - 1 - i].codePointAt(0);
      let lo = this.offsets[row];
      let hi = this.offsets[row + 1];
      const end = hi;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (this.chars[mid] < code) lo = mid + 1;
        else hi = mid;
      }
      if (lo === end || this.chars[lo] !== code) return last;
      if (this.cmds[lo] >= 0) last = this.commands[this.cmds[lo]];
      if (i === key.length - 1 || this.refs[lo] < 0) return last;
      row = this.refs[lo];
    }
    return last;
  }
}

export class MultiTrie2 {
  constructor(forward, tries) {
    Object.assign(this, { forward, tries });
  }

  getLastOnPath(key) {
    let result = '';
    let lastKey = key;
    let previous = null;
    let lastOp = ' ';
    for (const trie of this.tries) {
      const part = trie.getLastOnPath(lastKey);
      if (part === null || part === '*') return result;
      if ((part[0] === '-' || part[0] === 'D') && part[0] === lastOp) return result;
      lastOp = part[part.length - 2];
      if (part[0] === '-') {
        const lengths = previous === null ? [patchLength(part)] : [patchLength(previous), patchLength(part)];
        for (const count of lengths) {
          if (!this.forward && count > key.length) return result;
          key = this.forward ? key.slice(count) : key.slice(0, key.length - count);
        }
      }
      result += part;
      previous = part;
      if (key.length) lastKey = key;
    }
    return result;
  }
}
