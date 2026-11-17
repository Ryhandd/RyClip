import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Lokasi config bisa di-override lewat env RYCLIP_CONFIG (dipakai tes).
export const configPath = () => process.env.RYCLIP_CONFIG || path.join(os.homedir(), '.ryclip.json');

const KEYS = ['root', 'zipDir'];

export function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return Object.fromEntries(KEYS.filter((k) => typeof raw[k] === 'string' && raw[k]).map((k) => [k, raw[k]]));
  } catch {
    return {}; // belum ada / rusak → anggap kosong
  }
}

export function saveConfig(cfg) {
  const p = configPath();
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}

export function resetConfig() {
  fs.rmSync(configPath(), { force: true });
}
