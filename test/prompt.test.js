import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Dijalankan sebagai proses terpisah dengan stdin pipe, memakai modul prompt.js yang sama dengan index.js.
const mod = fileURLToPath(new URL('../src/prompt.js', import.meta.url));
const run = (input) =>
  spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `import {ask,isStdinClosed} from ${JSON.stringify('file://' + mod.replace(/\\/g, '/'))};
const a = await ask('? ');
const b = await ask('? ');
console.log('RES=' + JSON.stringify([a, b, isStdinClosed()]));`],
    { input, encoding: 'utf8', timeout: 8000 },
  );
const res = (r) => JSON.parse(r.stdout.match(/RES=(.*)/)[1]);

test('prompt: jawaban "y" sampai ke pemanggil (bug callback readline/promises)', () => {
  const r = run('y\n');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(res(r).slice(0, 1), ['y']);
});

test('prompt: stdin kosong → null, tidak menggantung, ditandai closed', () => {
  const r = run('');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(res(r), [null, null, true]);
});
