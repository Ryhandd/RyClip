#!/usr/bin/env node
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createMonitor } from './src/monitor.js';
import { parseClipboard } from './src/parser.js';
import { writeTarget } from './src/writer.js';
import { createZipWatcher, processZip } from './src/zipwatch.js';
import { loadConfig, saveConfig, resetConfig, configPath } from './src/config.js';
import { log, color } from './src/utils.js';

const HELP = `RyClip — clipboard → file injector

  ryclip [opsi]

  --root <dir>       root repo target (default: config, lalu folder saat ini)
  --set-root <dir>   simpan root repo permanen, lalu keluar
  --set-zip <dir>    simpan folder download permanen (dipakai --zip), lalu keluar
  --show-config      tampilkan config   --reset-config  hapus config
  --interval <ms>    interval polling (default: 500)
  --min-lines <n>    clipboard tanpa @file lebih pendek dari n baris diabaikan (default: 3)
  --dry-run          tampilkan aksi tanpa menulis file
  --no-backup        jangan backup file lama ke .ryclip-backup/
  --keep-tag         pertahankan baris // @file: di dalam file hasil
  --yes              clipboard tanpa @file di-skip otomatis (tanpa prompt)
  --initial          proses juga isi clipboard / zip yang sudah ada saat start
  --watch-zip <dir>  pantau folder untuk .zip baru, ekstrak ke root (dengan konfirmasi)
  --zip              pantau zip di folder dari --set-zip (default: ~/Downloads)
  --yes-zip          terapkan zip tanpa konfirmasi (backup tetap dibuat)
  -h, --help         bantuan

Tag (baris pertama): // @file: src/app.js   |   # @file: scripts/x.sh   |   /* @file: a.css */`;

const { values: o } = parseArgs({
  options: {
    root: { type: 'string' },
    'set-root': { type: 'string' },
    'set-zip': { type: 'string' },
    'show-config': { type: 'boolean', default: false },
    'reset-config': { type: 'boolean', default: false },
    interval: { type: 'string', default: '500' },
    'min-lines': { type: 'string', default: '3' },
    'dry-run': { type: 'boolean', default: false },
    'no-backup': { type: 'boolean', default: false },
    'keep-tag': { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
    initial: { type: 'boolean', default: false },
    'watch-zip': { type: 'string' },
    zip: { type: 'boolean', default: false },
    'yes-zip': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (o.help) {
  console.log(HELP);
  process.exit(0);
}

const cfg = loadConfig();

const dirOrDie = (d) => {
  const p = path.resolve(d);
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
    log.err(`Folder tidak ditemukan: ${p}`);
    process.exit(1);
  }
  return p;
};
const showConfig = (c) => {
  console.log(`config : ${configPath()}`);
  console.log(`root   : ${c.root ?? color.dim('(belum diatur → folder saat ini)')}`);
  console.log(`zipDir : ${c.zipDir ?? color.dim(`(belum diatur → ${path.join(os.homedir(), 'Downloads')})`)}`);
};

if (o['reset-config']) {
  resetConfig();
  log.ok('Config dihapus.');
  process.exit(0);
}
if (o['set-root'] || o['set-zip']) {
  const next = { ...cfg };
  if (o['set-root']) next.root = dirOrDie(o['set-root']);
  if (o['set-zip']) next.zipDir = dirOrDie(o['set-zip']);
  saveConfig(next);
  log.ok('Config disimpan.');
  showConfig(next);
  process.exit(0);
}
if (o['show-config']) {
  showConfig(cfg);
  process.exit(0);
}

const root = path.resolve(o.root ?? cfg.root ?? process.cwd());
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  log.err(`Root tidak ditemukan: ${root}`);
  process.exit(1);
}
const interval = Math.max(100, Number(o.interval) || 500);
const minLines = Math.max(1, Number(o['min-lines']) || 3);

const { default: clipboard } = await import('clipboardy').catch(() => {
  log.err('clipboardy belum terpasang. Jalankan: npm install');
  process.exit(1);
});

// Semua aksi (clipboard & zip) berjalan berurutan agar prompt tidak tabrakan.
let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn));

async function ask(question) {
  if (!process.stdin.isTTY) return null;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`${color.cyan('?')} ${question}`)).trim() || null;
  } finally {
    rl.close();
  }
}

const askTarget = (lines) => (o.yes ? null : ask(`Clipboard ${lines} baris tanpa @file. Path tujuan (kosong = skip): `));

async function confirm(question) {
  if (o['yes-zip']) return true;
  return /^y(a|es)?$/i.test((await ask(`${question} [y/N] `)) || '');
}

async function handle(raw) {
  const parsed = parseClipboard(raw, { keepTag: o['keep-tag'] });
  if (parsed.empty) return;

  let target = parsed.target;
  if (!target) {
    if (parsed.lines < minLines) return; // bukan kode (URL, kalimat pendek, dsb.)
    target = await askTarget(parsed.lines);
    if (!target) return log.skip('Dilewati (tanpa target).');
  }

  try {
    const r = await writeTarget({
      root,
      target,
      content: parsed.content,
      dryRun: o['dry-run'],
      backup: !o['no-backup'],
    });
    const msg = {
      created: () => log.ok(`${color.bold('dibuat')}   ${r.rel} (${parsed.lines} baris)`),
      updated: () => log.ok(`${color.bold('diupdate')} ${r.rel} (${parsed.lines} baris)${r.backup ? color.dim(`  backup: ${r.backup}`) : ''}`),
      unchanged: () => log.skip(`${r.rel} identik, tidak ditulis ulang.`),
      'dry-run': () => log.info(`[dry-run] akan menulis ${r.rel} (${parsed.lines} baris)`),
    };
    msg[r.status]();
  } catch (e) {
    log.err(e.message);
  }
}

const monitor = createMonitor({
  read: () => clipboard.read(),
  onChange: (raw) => serial(() => handle(raw)),
  onError: (e) => log.err(`Clipboard: ${e.message}`),
  interval,
  includeInitial: o.initial,
});

if (!fs.existsSync(path.join(root, '.git'))) log.skip('Peringatan: root bukan repo git (.git tidak ada).');
log.info(`RyClip aktif → ${color.bold(root)}${o['dry-run'] ? color.yellow(' [dry-run]') : ''}  (Ctrl+C untuk berhenti)`);
monitor.start();

let zipWatcher = null;
const zipDir = o['watch-zip'] ? path.resolve(o['watch-zip']) : o.zip ? path.resolve(cfg.zipDir ?? path.join(os.homedir(), 'Downloads')) : null;
if (zipDir) {
  if (!fs.existsSync(zipDir)) {
    log.err(`Folder zip tidak ditemukan: ${zipDir}`);
    process.exit(1);
  }
  zipWatcher = createZipWatcher({
    dir: zipDir,
    includeExisting: o.initial,
    onZip: (zip) =>
      serial(() => processZip({ zip, root, dryRun: o['dry-run'], backup: !o['no-backup'], confirm })).catch((e) => log.err(`${path.basename(zip)}: ${e.message}`)),
    onError: (e) => log.err(`Zip watcher: ${e.message}`),
  });
  log.info(`Pantau zip → ${color.bold(zipDir)}`);
  zipWatcher.start();
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    monitor.stop();
    zipWatcher?.stop();
    log.info('Berhenti.');
    process.exit(0);
  });
}
