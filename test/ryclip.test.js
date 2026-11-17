import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseClipboard } from '../src/parser.js';
import { writeTarget } from '../src/writer.js';
import { createMonitor } from '../src/monitor.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'ryclip-'));

test('parser: tag // @file di baris pertama, tag dibuang', () => {
  const r = parseClipboard('// @file: src/a.js\nconsole.log(1)\n');
  assert.equal(r.target, 'src/a.js');
  assert.equal(r.content, 'console.log(1)\n');
});

test('parser: varian komentar, CRLF, dan code fence', () => {
  assert.equal(parseClipboard('# @file: s/x.sh\r\necho hi').target, 's/x.sh');
  assert.equal(parseClipboard('/* @file: a.css */\na{}').target, 'a.css');
  assert.equal(parseClipboard('<!-- @file: i.html -->\n<p/>').target, 'i.html');
  assert.equal(parseClipboard('```js\n// @file: z.js\nlet a\n```').target, 'z.js');
});

test('parser: tanpa tag → target null; kosong → empty', () => {
  assert.equal(parseClipboard('let a = 1;').target, null);
  assert.equal(parseClipboard('  \n ').empty, true);
});

test('writer: create → unchanged (dedupe) → update + backup', async () => {
  const root = await tmp();
  const a = await writeTarget({ root, target: 'src/x.js', content: 'v1\n' });
  assert.equal(a.status, 'created');
  const b = await writeTarget({ root, target: 'src/x.js', content: 'v1\n' });
  assert.equal(b.status, 'unchanged');
  const c = await writeTarget({ root, target: 'src/x.js', content: 'v2\n' });
  assert.equal(c.status, 'updated');
  assert.equal(await fs.readFile(path.join(root, c.backup), 'utf8'), 'v1\n');
  assert.equal(await fs.readFile(path.join(root, 'src/x.js'), 'utf8'), 'v2\n');
});

test('writer: tolak traversal, absolut, .git, .env', async () => {
  const root = await tmp();
  for (const target of ['../evil.js', '/etc/passwd', 'a/../../b.js', '.git/config', '.env', 'node_modules/x.js']) {
    await assert.rejects(writeTarget({ root, target, content: 'x\n' }), undefined, target);
  }
});

test('writer: dry-run tidak menulis', async () => {
  const root = await tmp();
  const r = await writeTarget({ root, target: 'n.js', content: 'x\n', dryRun: true });
  assert.equal(r.status, 'dry-run');
  await assert.rejects(fs.access(path.join(root, 'n.js')));
});

test('monitor: abaikan isi awal, emit hanya saat berubah', async () => {
  let clip = 'awal';
  const seen = [];
  const m = createMonitor({ read: async () => clip, onChange: async (t) => seen.push(t) });
  await m.tick();
  await m.tick();
  assert.deepEqual(seen, []);
  clip = 'baru';
  await m.tick();
  await m.tick();
  assert.deepEqual(seen, ['baru']);
});
