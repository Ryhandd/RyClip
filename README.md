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

## Keamanan

Path absolut, `..`, symlink keluar root, `.git/`, `node_modules/`, dan `.env*` ditolak. Penulisan atomic (tmp + rename), file lama dibackup, isi identik tidak ditulis ulang. Tambahkan `.ryclip-backup/` ke `.gitignore` repo target.

## Tes

```bash
npm test
```
