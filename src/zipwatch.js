import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeTarget } from './writer.js';
import { log, color } from './utils.js';

const run = promisify(execFile);
const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/;
const LIMITS = { files: 500, bytes: 50 * 1024 * 1024 };

// bsdtar (Windows 10+, macOS) membaca zip; GNU tar tidak → fallback ke unzip.
const TOOLS = [
  { name: 'tar', list: (z) => ['-tf', z], extract: (z, d) => ['-xf', z, '-C', d] },
  { name: 'unzip', list: (z) => ['-Z1', z], extract: (z, d) => ['-q', '-o', z, '-d', d] },
];

const exec = (cmd, args) => run(cmd, args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true });

async function detectTool(zip) {
  for (const t of TOOLS) {
    try {
      const { stdout } = await exec(t.name, t.list(zip));
      return { tool: t, entries: stdout.split(/\r?\n/).filter(Boolean) };
    } catch {
      /* coba tool berikutnya */
    }
  }
  throw new Error('Tidak bisa membaca zip (butuh tar bsdtar/Windows 10+ atau unzip)');
}

export function isUnsafeEntry(entry) {
  const e = entry.replace(/\\/g, '/');
  return e.startsWith('/') || /^[a-zA-Z]:/.test(e) || e.split('/').includes('..') || e.includes('\0');
}

// Satu folder pembungkus (mis. "RyCode/") dibuang bila belum ada di root atau namanya sama dengan root.
export function detectStrip(rels, root, rootExists = () => false) {
  const tops = new Set(rels.map((r) => r.split('/')[0]));
  if (tops.size !== 1 || rels.some((r) => !r.includes('/'))) return '';
  const [top] = tops;
  return top.toLowerCase() === path.basename(root).toLowerCase() || !rootExists(top) ? top : '';
}

async function walk(dir, base = '') {
  const out = [];
  for (const d of await fs.readdir(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...(await walk(dir, rel)));
    else if (d.isFile()) out.push({ abs: path.join(dir, rel), rel }); // symlink dilewati
  }
  return out;
}

const dirExists = (p) => fs.stat(p).then((s) => s.isDirectory(), () => false);

export async function processZip({ zip, root, dryRun = false, backup = true, confirm }) {
  const name = path.basename(zip);
  const { tool, entries } = await detectTool(zip);

  const bad = entries.find(isUnsafeEntry);
  if (bad) return log.err(`${name}: entry mencurigakan "${bad}", zip diabaikan seluruhnya.`);

  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'ryclip-zip-'));
  try {
    await exec(tool.name, tool.extract(zip, stage));
    const files = (await walk(stage)).filter((f) => !JUNK.test(f.rel));
    if (!files.length) return log.skip(`${name}: tidak ada file.`);
    if (files.length > LIMITS.files) return log.err(`${name}: ${files.length} file melebihi batas ${LIMITS.files}.`);

    // strip folder pembungkus
    const rootDirs = new Set();
    for (const top of new Set(files.map((f) => f.rel.split('/')[0]))) {
      if (await dirExists(path.join(root, top))) rootDirs.add(top);
    }
    const strip = detectStrip(files.map((f) => f.rel), root, (t) => rootDirs.has(t));

    // rencana (dry-run per file; tidak ada yang ditulis)
    let total = 0;
    const plan = [];
    for (const f of files) {
      const rel = strip ? f.rel.slice(strip.length + 1) : f.rel;
      const data = await fs.readFile(f.abs);
      total += data.length;
      if (total > LIMITS.bytes) return log.err(`${name}: total ukuran melebihi ${LIMITS.bytes / 1024 / 1024} MB.`);
      try {
        const r = await writeTarget({ root, target: rel, content: data, dryRun: true });
        plan.push({ rel, data, status: r.status === 'dry-run' ? r.would : r.status });
      } catch (e) {
        plan.push({ rel, error: e.message });
      }
    }

    const by = (s) => plan.filter((p) => p.status === s);
    const todo = [...by('created'), ...by('updated')];
    const rejected = plan.filter((p) => p.error);

    log.info(`${color.bold(name)}${strip ? color.dim(`  (folder "${strip}/" dibuang)`) : ''}`);
    const shown = [...todo.map((p) => [p.status === 'created' ? color.green('+') : color.yellow('~'), p.rel]), ...rejected.map((p) => [color.red('!'), `${p.rel}  ${color.dim(p.error)}`])];
    for (const [m, r] of shown.slice(0, 20)) console.log(`    ${m} ${r}`);
    if (shown.length > 20) console.log(`    ${color.dim(`… +${shown.length - 20} lainnya`)}`);
    log.info(`baru ${by('created').length} · diubah ${by('updated').length} · sama ${by('unchanged').length} · ditolak ${rejected.length}`);

    if (!todo.length) return log.skip('Tidak ada perubahan.');
    if (dryRun) return log.info('[dry-run] tidak ada file ditulis.');
    if (!(await confirm(`Terapkan ${todo.length} file ke ${root}?`))) return log.skip('Dibatalkan.');

    let ok = 0;
    for (const p of todo) {
      try {
        await writeTarget({ root, target: p.rel, content: p.data, backup });
        ok++;
      } catch (e) {
        log.err(`${p.rel}: ${e.message}`);
      }
    }
    log.ok(`${ok}/${todo.length} file ditulis${backup && by('updated').length ? color.dim('  (lama dibackup di .ryclip-backup/)') : ''}`);
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

/**
 * Polling folder untuk .zip baru. File diproses setelah ukurannya stabil
 * di dua poll berturut-turut (download browser belum selesai = ukuran masih naik).
 */
export function createZipWatcher({ dir, onZip, onError = () => {}, interval = 1000, includeExisting = false }) {
  const seen = new Set();
  const pending = new Map();
  let timer = null;
  let busy = false;
  let first = true;

  async function scan() {
    if (busy) return;
    busy = true;
    try {
      for (const n of (await fs.readdir(dir)).filter((x) => x.toLowerCase().endsWith('.zip'))) {
        const p = path.join(dir, n);
        const st = await fs.stat(p).catch(() => null);
        if (!st || !st.isFile() || st.size === 0) continue;
        const key = `${p}|${st.size}|${st.mtimeMs}`;
        if (seen.has(key)) continue;
        if (first && !includeExisting) {
          seen.add(key);
          continue;
        }
        if (pending.get(p) !== st.size) {
          pending.set(p, st.size);
          continue;
        }
        pending.delete(p);
        seen.add(key);
        try {
          await onZip(p);
        } catch (e) {
          onError(e);
        }
      }
      first = false;
    } catch (e) {
      onError(e);
    } finally {
      busy = false;
    }
  }

  return {
    start() {
      if (!timer) {
        timer = setInterval(scan, interval);
        scan();
      }
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    scan,
  };
}
