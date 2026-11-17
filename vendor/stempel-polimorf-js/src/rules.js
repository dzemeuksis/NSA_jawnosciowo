import { MultiTrie2, Trie } from './trie.js';

export function decodeRules(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Rules must be an ArrayBuffer or Uint8Array');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = 0;
  const invalid = () => { throw new Error('Invalid PoliMorf rules file'); };
  const requireBytes = (count) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > bytes.length - position) invalid();
  };
  const u32 = () => {
    requireBytes(4);
    const value = view.getUint32(position, true);
    position += 4;
    return value;
  };
  const boolean = () => { const n = u32(); if (n > 1) invalid(); return Boolean(n); };
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  requireBytes(8);
  if (decoder.decode(bytes.subarray(0, 8)) !== 'SPOL0001') invalid();
  position = 8;
  const forward = boolean();
  const count = u32();
  if (!count || count > (bytes.length - position) / 20) invalid();
  const tries = [];
  const column = (length, signed = false) => {
    requireBytes(length * 4);
    const array = signed ? new Int32Array(length) : new Uint32Array(length);
    for (let i = 0; i < length; i++) {
      array[i] = signed ? view.getInt32(position, true) : view.getUint32(position, true);
      position += 4;
    }
    return array;
  };
  for (let t = 0; t < count; t++) {
    const direction = boolean();
    const root = u32();
    const cmdCount = u32();
    const rowCount = u32();
    const cellCount = u32();
    if (!rowCount || root >= rowCount) invalid();
    requireBytes(cmdCount * 4 + (rowCount + 1) * 4 + cellCount * 12);
    const commands = [];
    for (let c = 0; c < cmdCount; c++) {
      const size = u32();
      requireBytes(size);
      const command = decoder.decode(bytes.subarray(position, position + size));
      if (command !== '*' && (!command.length || command.length % 2 || !/^(?:[-D][a-z]|[IR][\s\S])+$/.test(command))) invalid();
      commands.push(command);
      position += size;
    }
    const offsets = column(rowCount + 1);
    const chars = column(cellCount);
    const cmds = column(cellCount, true);
    const refs = column(cellCount, true);
    if (offsets[0] !== 0 || offsets[rowCount] !== cellCount) invalid();
    for (let r = 0; r < rowCount; r++) {
      if (offsets[r] > offsets[r + 1] || offsets[r + 1] > cellCount) invalid();
      for (let c = offsets[r]; c < offsets[r + 1]; c++) {
        if (chars[c] > 0xffff || (c > offsets[r] && chars[c - 1] >= chars[c]) ||
            cmds[c] < -1 || cmds[c] >= cmdCount || refs[c] < -1 || refs[c] >= rowCount) invalid();
      }
    }
    tries.push(new Trie(direction, root, commands, offsets, chars, cmds, refs));
  }
  if (position !== bytes.length) invalid();
  return new MultiTrie2(forward, tries);
}
