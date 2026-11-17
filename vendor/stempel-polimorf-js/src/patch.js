// Derived from PyStempel egothor.py, Copyright 1997–2004 Leo Galambos
// and 2002–2004 Egothor developers. See licenses/EGOTHOR.txt.

/** Mutate a list of Unicode code points, preserving partial patches on failure. */
export function applyPatch(buffer, patch) {
  if (patch === null || !buffer.length) return;
  const commands = Array.from(patch);
  let position = buffer.length - 1;
  for (let i = 0; i + 1 < commands.length; i += 2) {
    const op = commands[i];
    const value = commands[i + 1];
    const offset = value.codePointAt(0) - 97;
    if (op === '-') {
      position -= offset;
    } else if (op === 'R') {
      if (position < 0 || position >= buffer.length) return;
      buffer[position] = value;
    } else if (op === 'D') {
      const original = position;
      position -= offset;
      if (position < 0 || position >= buffer.length) return;
      buffer.splice(position, Math.max(0, original + 1 - position));
    } else if (op === 'I') {
      position += 1;
      if (position < 0 || position > buffer.length) return;
      buffer.splice(position, 0, value);
    }
    position -= 1;
  }
}

export function patchLength(patch) {
  let length = 0;
  const chars = Array.from(patch);
  for (let i = 0; i + 1 < chars.length; i += 2) {
    if (chars[i] === '-' || chars[i] === 'D') length += chars[i + 1].codePointAt(0) - 96;
    else if (chars[i] === 'R') length += 1;
    else if (chars[i] === 'R') length += 1;
  }
  return length;
}
