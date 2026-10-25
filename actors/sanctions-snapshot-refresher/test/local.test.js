// The refresher must parse the lists exactly like the screener does: its src/lists.js and src/match.js are copies.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
for (const f of ['lists.js', 'match.js']) {
    assert.equal(readFileSync(here(`../src/${f}`), 'utf8'), readFileSync(here(`../../sanctions-screener/src/${f}`), 'utf8'), `src/${f} differs from sanctions-screener/src/${f}`);
}
await import('../src/lists.js');
console.log('2 tests passed');
