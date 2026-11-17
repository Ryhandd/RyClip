# RyClip

Pantau clipboard, lalu tulis blok kode dari LLM langsung ke repo berdasarkan tag `@file` di baris pertama.

```js
// @file: src/utils/format.js
export const x = 1;
```

## Pakai

```bash
npm install
node index.js --root /path/ke/RyCode      # atau: npm start (root = folder saat ini)
```

Salin kode dari AI → file langsung ditulis. Tanpa tag → prompt path tujuan (kosong = skip).

| Opsi | Fungsi |
|---|---|
| `--root <dir>` | Root repo target |
| `--dry-run` | Simulasi, tidak menulis |
| `--no-backup` | Tanpa backup ke `.ryclip-backup/` |
| `--keep-tag` | Pertahankan baris `@file` |
| `--yes` | Tanpa prompt (untagged di-skip) |
| `--min-lines <n>` | Abaikan clipboard tanpa tag < n baris (default 3) |
| `--interval <ms>` | Interval polling (default 500) |

## Pantau zip dari AI

```bash
ryclip --root D:\Rayhand\RyCode --zip                          # pantau ~/Downloads
ryclip --root D:\Rayhand\RyCode --watch-zip D:\Download        # folder lain
```

Zip baru yang masuk (setelah download selesai) dianalisis dulu: daftar file baru/diubah/sama ditampilkan, lalu diminta konfirmasi `[y/N]`. `--yes-zip` melewati konfirmasi, `--dry-run` hanya menampilkan rencana. Zip lama yang sudah ada saat start diabaikan (`--initial` untuk memproses).

Ekstraksi lewat `tar` (Windows 10+/macOS) atau `unzip`. Zip dengan entry `..`/absolut ditolak seluruhnya, folder pembungkus tunggal dibuang otomatis, dan semua file lewat aturan keamanan yang sama dengan clipboard (backup, atomic, dedupe, `.env`/`.git` diblok). Batas: 500 file, 50 MB.

## Atur lokasi permanen

```bat
ryclip --set-root D:\Rayhand\RyCode     :: repo target
ryclip --set-zip  D:\Download            :: folder hasil download
ryclip --show-config                      :: lihat
ryclip --reset-config                     :: hapus
```

Disimpan di `~/.ryclip.json` (Windows: `C:\Users\<lu>\.ryclip.json`). Prioritas: flag CLI > config > default (root = folder saat ini, zip = `~/Downloads`). Setelah diatur, cukup `ryclip --zip` dari folder mana pun.

## Keamanan

Path absolut, `..`, symlink keluar root, `.git/`, `node_modules/`, dan `.env*` ditolak. Penulisan atomic (tmp + rename), file lama dibackup, isi identik tidak ditulis ulang. Tambahkan `.ryclip-backup/` ke `.gitignore` repo target.

## Tes

```bash
npm test
```
