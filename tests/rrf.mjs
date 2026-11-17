import assert from 'node:assert/strict';
import { fuseRRF } from '../hybrid-search.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const c = JSON.parse(input);
assert.deepEqual(fuseRRF(c.dense, c.lexical), c.expected);
