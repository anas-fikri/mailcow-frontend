# Current Task

## Task: Perbaiki posisi ikon fitur di segala kondisi (dynamic sizing)

**Status: SELESAI — 3 area posisi ikon diperbaiki, 53/53 test PASS, live build terverifikasi.**

## Konteks
Audit posisi ikon saat lebar panel berubah-ubah (dynamic sizing: sidebar/list
resizable, mobile, nama panjang). Ditemukan 3 masalah konkret di MailPage.

## Fix (semua di src/pages/MailPage.jsx)

### 1 — Tombol ✕ pencarian menimpa teks yang diketik
Input search `pr-4` (16px) padahal tombol bersihkan `w-9` (36px) di `right-1.5`
→ query panjang berjalan di bawah tombol. **Fix:** `pr-10` — teks berhenti
sebelum tombol.

### 2 — Header list overflow saat panel list menyempit
Header `flex justify-between` tanpa min-w-0: judul folder (text-lg) + badge
hitung + 5 tombol ikon (min-w-11 ≈ 220px). Di lebar list minimum (240px)
konten meluber → tombol kanan (refresh) terpotong / judul terjepit.
**Fix:** wrapper kiri `min-w-0 flex-1`, label folder di-wrap span `truncate`,
badge + Loader + cluster kanan `shrink-0` — judul menyusut duluan, tombol
aksi tetap utuh.

### 3 — Cluster ikon baris pesan tidak sejajar vertikal
Header baris `items-baseline` + tombol ikon tinggi (p-1.5 = 38px, tanpa teks)
→ ikon mengambang jauh di atas baris teks pengirim (baseline tombol = tepi
bawah, bukan baseline teks). **Fix:** `items-center` — cluster ikon
(snooze/arsip/star/date) sejajar vertikal dengan baris pengirim di semua lebar.

## Diverifikasi aman (tidak diubah)
- PreferencesPage/LoginPage input password sudah `pr-10`/`pr-20` (tidak overlap)
- Chip lampiran compose: nama truncate + ikon shrink-0 (sudah benar)
- Folder row: actions invisibel tetap reserve ruang (tanpa shift saat hover —
  keputusan desain, bukan bug)
- BottomNav mobile: flex-1 items-center (sudah benar)

## Test
- `test:a11y` +6 assertion statis (pr-10 search, header min-w-0/truncate/shrink-0,
  items-center baris) → **73 assertions** · **53/53 PASS** · build OK

Status: COMPLETED
Updated At: 2026-08-26T04:25:00Z
