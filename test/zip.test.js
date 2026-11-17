import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isUnsafeEntry, detectStrip, processZip, createZipWatcher } from '../src/zipwatch.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'ryclip-z-'));
const has = (cmd) => {
  try {
    execFileSync(cmd, ['-v'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return e.code !== 'ENOENT';
  }
};

test('isUnsafeEntry: ../, absolut, drive', () => {
  for (const e of ['../a.js', 'a/../../b', '/etc/x', 'C:\\x', 'a\\..\\b']) assert.equal(isUnsafeEntry(e), true, e);
  for (const e of ['src/a.js', 'a/b/c.txt', '.github/x.yml']) assert.equal(isUnsafeEntry(e), false, e);
});

test('detectStrip: folder pembungkus tunggal', () => {
  assert.equal(detectStrip(['RyCode/a.js', 'RyCode/b/c.js'], '/x/RyCode'), 'RyCode');
  assert.equal(detectStrip(['proj/a.js'], '/x/RyCode', () => false), 'proj');
  assert.equal(detectStrip(['src/a.js'], '/x/RyCode', () => true), ''); // src sudah ada di root
  assert.equal(detectStrip(['src/a.js', 'README.md'], '/x/RyCode'), ''); // ada file di level atas
});

test('processZip: ekstrak, strip folder, tolak .env, dedupe saat diulang', { skip: !has('zip') }, async () => {
  const work = await tmp();
  const root = await tmp();
  await fs.mkdir(path.join(work, 'pkg/src'), { recursive: true });
  await fs.writeFile(path.join(work, 'pkg/src/a.js'), 'a\n');
  await fs.writeFile(path.join(work, 'pkg/.env'), 'SECRET=1\n');
  execFileSync('zip', ['-qr', path.join(work, 'x.zip'), 'pkg'], { cwd: work });

  await processZip({ zip: path.join(work, 'x.zip'), root, confirm: async () => true });
  assert.equal(await fs.readFile(path.join(root, 'src/a.js'), 'utf8'), 'a\n');
  await assert.rejects(fs.access(path.join(root, '.env')));

  await fs.writeFile(path.join(root, 'src/a.js'), 'edited\n');
  await processZip({ zip: path.join(work, 'x.zip'), root, confirm: async () => false });
  assert.equal(await fs.readFile(path.join(root, 'src/a.js'), 'utf8'), 'edited\n'); // ditolak user → tidak menimpa
});

test('watcher: abaikan zip lama, proses zip baru setelah ukuran stabil, sekali saja', async () => {
  const dir = await tmp();
  await fs.writeFile(path.join(dir, 'lama.zip'), 'old');
  const got = [];
  const w = createZipWatcher({ dir, onZip: async (p) => got.push(path.basename(p)) });
  await w.scan();
  await fs.writeFile(path.join(dir, 'baru.zip'), 'data');
  await w.scan(); // ukuran pertama kali terlihat
  assert.deepEqual(got, []);
  await w.scan(); // stabil → proses
  await w.scan();
  assert.deepEqual(got, ['baru.zip']);

  // mtime berubah (disentuh antivirus/browser) dengan ukuran sama → tidak diproses ulang
  const later = new Date(Date.now() + 60_000);
  await fs.utimes(path.join(dir, 'baru.zip'), later, later);
  await w.scan();
  await w.scan();
  await w.scan();
  assert.deepEqual(got, ['baru.zip']);
});
