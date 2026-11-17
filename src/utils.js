import { createHash } from 'node:crypto';

export const sha1 = (text) => createHash('sha1').update(text).digest('hex');

const c = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
export const color = { dim: c(2), red: c(31), green: c(32), yellow: c(33), cyan: c(36), bold: c(1) };

const time = () => new Date().toTimeString().slice(0, 8);
export const log = {
  info: (m) => console.log(`${color.dim(time())} ${m}`),
  ok: (m) => console.log(`${color.dim(time())} ${color.green('✔')} ${m}`),
  skip: (m) => console.log(`${color.dim(time())} ${color.yellow('•')} ${m}`),
  err: (m) => console.error(`${color.dim(time())} ${color.red('✖')} ${m}`),
};
