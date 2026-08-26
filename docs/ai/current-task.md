# Current Task

## Task: Audit aksesibilitas — kontras warna, target sentuh 44px, aria-label toolbar

**Status: SELESAI (44/44 test PASS, live)** → commit + push + deploy.

## Ringkasan
Audit aksesibilitas (WCAG 2.1 AA) dengan pengukuran kontras numerik + audit
target sentuh (44px) + label aria di toolbar MailPage/MessageReader/Sidebar.
Semua temuan diperbaiki dan di-lock dengan test regresi `test:a11y` (63
assertions: 18 kontras matematis + 45 assertion statis sumber).

## Temuan & Perbaikan

### Kontras warna (diukur, bukan perkiraan)
| Temuan | Rasio lama | Perbaikan | Rasio baru |
|---|---|---|---|
| `--muted-foreground` light di atas `--muted` | 4.34 ✗ | 46.9% → 45% lightness | 4.64 ✓ |
| `--destructive` light sebagai teks di atas putih | 3.76 ✗ | `0 84.2% 60.2%` → `0 72% 46%` | 5.61 ✓ |
| `--destructive` dark sebagai teks di atas bg gelap | 2.00 ✗ | `0 62.8% 30.6%` → `0 84% 58%` | 5.04 ✓ |
| Badge countdown sesi (light `text-amber-700` on amber-500/10) | 2.14 ✗ | → `text-amber-900 dark:text-amber-400` | 5.13 ✓ |
| Star "flagged" (`text-amber-500` on putih) | 1.53 ✗ | → `text-amber-600 dark:text-amber-400` | 3.15 ✓ |
| Ikon spam bulk (`text-orange-500` on putih) | 2.78 ✗ | → `text-orange-600 dark:text-orange-500` | 3.58 ✓ |
| Swipe-to-delete dark: putih di atas `bg-destructive` | 2.00 ✗ | `dark:bg-red-700` di SwipeableRow | 6.17 ✓ |

Token `--border`/`--input` (light 1.23:1) **tidak** diubah — mencapai 3:1
(WCAG 1.4.11) butuh border jauh lebih gelap (perubahan visual besar);
dibatasi dengan dokumentasi sebagai known limitation (input memakai
`bg-muted` + focus ring sebagai affordance).

### Target sentuh 44px (`min-w-11`/`min-h-11`)
- **MailPage toolbar**: 5 tombol icon + filter (sebelumnya 32px)
- **Bulk toolbar**: keluar seleksi, pilih semua, star, baca, belum-baca, spam, hapus, select folder (sebelumnya 28px) + aksi cepat "Tandai Semua Dibaca"/"Arsip"
- **MessageReader toolbar**: kembali, belum dibaca, star, hapus, spam, pindah, cetak, balas, teruskan (sebelumnya 34px)
- **Sidebar**: toggle tutup/ciutkan, tema, keluar (sebelumnya 30px)
- **Flag picker** dot warna: 28 → 36px; **snooze presets**: min-h-11
- Pengecualian inline yang didokumentasikan: X-clear di input pencarian (36px),
  aksi hover baris pesan (desktop-only) — target utamanya baris 44px

### Aria (toolbar + sekitarnya)
- 4 toggle toolbar + star reader: `aria-pressed`; filter/pindah: `aria-expanded`
- aria-label utk SEMUA tombol icon-only (toolbar MailPage, bulk, row hover,
  flag picker, MessageReader, Sidebar)
- Nama pengirim di baris pesan: `<span onClick>` → `<button type="button">`
  (sebelumnya tidak bisa diakses keyboard)
- **Focus-visible global** di index.css: outline 2px `hsl(var(--ring))` untuk
  button/a/select/input/textarea/[role=button]/[tabindex]

## Test
- **Baru `test:a11y`** (63 assertions): 18 pasang kontras WCAG (matematika
  luminance) + 45 assertion statis (aria-label, aria-pressed/expanded,
  min-w-11/min-h-11, token CSS, focus-visible, dark:bg-red-700)
- **44/44 test PASS** · `npm run build` OK

## Known limitations (dokumentasi)
- `--border` light 1.23:1 — lihat catatan di atas
- FLAG_COLORS (star berwarna: yellow-500/green-500) di bawah 3:1 di light —
  warna flag adalah coding pelengkap di atas state shape; perbaikan penuh =
  varian 600/700 per warna (perlu keputusan desain)

Status: COMPLETED
Updated At: 2026-08-26T01:07:44Z
