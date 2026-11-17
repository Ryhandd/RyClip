import { sha1 } from './utils.js';

/**
 * Polling clipboard. `read` diinjeksi (clipboardy.read) supaya mudah dites.
 * Dedupe level 1: hash isi clipboard — event hanya terbit saat isi benar-benar berubah.
 * onChange yang masih berjalan (mis. prompt interaktif) menahan tick berikutnya.
 */
export function createMonitor({ read, onChange, onError = () => {}, interval = 500, includeInitial = false }) {
  let last = null;
  let timer = null;
  let busy = false;
  let failing = false;

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const text = await read();
      failing = false;
      const hash = sha1(text);
      if (last === null && !includeInitial) {
        last = hash; // abaikan isi clipboard yang sudah ada saat start
        return;
      }
      if (hash === last) return;
      last = hash;
      if (!text.trim()) return;
      await onChange(text, hash);
    } catch (e) {
      // Clipboard bisa gagal dibaca sesaat (isi bukan teks, dikunci app lain). Lapor sekali per rentetan gagal.
      if (!failing) {
        failing = true;
        onError(e);
      }
    } finally {
      busy = false;
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, interval);
      tick();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    tick, // diekspos untuk tes
  };
}
