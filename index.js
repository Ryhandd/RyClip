#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createMonitor } from './src/monitor.js';
import { parseClipboard } from './src/parser.js';
import { writeTarget } from './src/writer.js';
import { log, color } from './src/utils.js';

const HELP = `RyClip — clipboard → file injector

  ryclip [opsi]

  --root <dir>       root repo target (default: folder saat ini)
  --interval <ms>    interval polling (default: 500)
  --min-lines <n>    clipboard tanpa @file lebih pendek dari n baris diabaikan (default: 3)
  --dry-run          tampilkan aksi tanpa menulis file
  --no-backup        jangan backup file lama ke .ryclip-backup/
  --keep-tag         pertahankan baris // @file: di dalam file hasil
  --yes              clipboard tanpa @file di-skip otomatis (tanpa prompt)
  --initial          proses juga isi clipboard saat start
  -h, --help         bantuan

Tag (baris pertama): // @file: src/app.js   |   # @file: scripts/x.sh   |   /* @file: a.css */`;

const { values: o } = parseArgs({
  options: {
    root: { type: 'string', default: process.cwd() },
    interval: { type: 'string', default: '500' },
    'min-lines': { type: 'string', default: '3' },
    'dry-run': { type: 'boolean', default: false },
    'no-backup': { type: 'boolean', default: false },
    'keep-tag': { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
    initial: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (o.help) {
  console.log(HELP);
  process.exit(0);
}

const root = path.resolve(o.root);
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

async function askTarget(lines) {
  if (o.yes || !process.stdin.isTTY) return null;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = await rl.question(
      `${color.cyan('?')} Clipboard ${lines} baris tanpa @file. Path tujuan (kosong = skip): `,
    );
    return ans.trim() || null;
  } finally {
    rl.close();
  }
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
  onChange: handle,
  onError: (e) => log.err(`Clipboard: ${e.message}`),
  interval,
  includeInitial: o.initial,
});

if (!fs.existsSync(path.join(root, '.git'))) log.skip('Peringatan: root bukan repo git (.git tidak ada).');
log.info(`RyClip aktif → ${color.bold(root)}${o['dry-run'] ? color.yellow(' [dry-run]') : ''}  (Ctrl+C untuk berhenti)`);
monitor.start();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    monitor.stop();
    log.info('Berhenti.');
    process.exit(0);
  });
}
