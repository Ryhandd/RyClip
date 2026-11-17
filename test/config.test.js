import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, saveConfig, resetConfig } from '../src/config.js';

test('config: simpan, muat, reset, toleran file rusak', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryclip-c-'));
  process.env.RYCLIP_CONFIG = path.join(dir, 'cfg.json');
  assert.deepEqual(loadConfig(), {});
  saveConfig({ root: 'D:\\Rayhand\\RyCode', zipDir: 'D:\\Dl', junk: 1 });
  assert.deepEqual(loadConfig(), { root: 'D:\\Rayhand\\RyCode', zipDir: 'D:\\Dl' });
  fs.writeFileSync(process.env.RYCLIP_CONFIG, '{rusak');
  assert.deepEqual(loadConfig(), {});
  resetConfig();
  assert.equal(fs.existsSync(process.env.RYCLIP_CONFIG), false);
});
