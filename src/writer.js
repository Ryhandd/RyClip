import fs from 'node:fs/promises';
import path from 'node:path';
import { sha1 } from './utils.js';

const BLOCKED_DIRS = new Set(['.git', 'node_modules', '.ryclip-backup']);

const inside = (root, p) => {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// Real path dari ancestor terdalam yang sudah ada (cegah escape lewat symlink).
async function realExistingAncestor(p) {
  let cur = p;
  for (;;) {
    try {
      return await fs.realpath(cur);
    } catch {
      const up = path.dirname(cur);
      if (up === cur) return cur;
      cur = up;
    }
  }
}

export async function resolveTarget(root, target) {
  if (!target || target.includes('\0')) throw new Error('Path kosong/invalid');
  const clean = target.replace(/\\/g, '/');
  if (clean.startsWith('/') || /^[a-zA-Z]:/.test(clean) || clean.startsWith('~')) {
    throw new Error(`Path absolut ditolak: ${target}`);
  }
  const abs = path.resolve(root, clean);
  if (!inside(root, abs) || abs === root) throw new Error(`Path keluar dari root ditolak: ${target}`);

  const rel = path.relative(root, abs).split(path.sep);
  if (rel.some((s) => BLOCKED_DIRS.has(s)) || /^\.env(\.|$)/.test(rel[rel.length - 1])) {
    throw new Error(`Path dilindungi: ${target}`);
  }

  const realRoot = await fs.realpath(root);
  if (!inside(realRoot, await realExistingAncestor(path.dirname(abs)))) {
    throw new Error(`Symlink keluar dari root ditolak: ${target}`);
  }
  return { abs, rel: rel.join('/') };
}

/**
 * @returns {Promise<{ status: 'created'|'updated'|'unchanged'|'dry-run', rel: string, backup?: string }>}
 */
export async function writeTarget({ root, target, content, dryRun = false, backup = true }) {
  const { abs, rel } = await resolveTarget(root, target);

  let existing = null;
  try {
    existing = await fs.readFile(abs, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  // Deteksi duplikasi: isi identik dengan yang ada di disk → jangan tulis ulang.
  if (existing !== null && sha1(existing) === sha1(content)) return { status: 'unchanged', rel };
  if (dryRun) return { status: 'dry-run', rel };

  let backupPath;
  if (existing !== null && backup) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(root, '.ryclip-backup', stamp, rel);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, existing);
  }

  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.ryclip.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, abs); // atomic: tidak ada file setengah-tertulis

  return {
    status: existing === null ? 'created' : 'updated',
    rel,
    backup: backupPath && path.relative(root, backupPath).split(path.sep).join('/'),
  };
}
