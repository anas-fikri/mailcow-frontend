# Current Task

Status: COMPLETED
Task ID: 20260820-125059-377940
Started At: 2026-08-20T12:50:59Z
Updated At: 2026-08-20T12:51:05Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: indikator jumlah email yang sedang dimuat saat auto-load

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-008 (mailbox usability)

## Files Involved
- src/pages/MailPage.jsx — sentinel area + header pill: tampilkan loading progress

## Summary
Saat auto-load server-side (setelah lewat 100 email), user butuh indikator yang
jelas bukan hanya spinner polos:
- **Header pill** sekarang "100 / 5.000" selama auto-load aktif, kembali ke "5.000"
  saat folder termuat penuh; plus spinner mini ketika loadingMore=true.
- **Sentinel bawah list** menampilkan "Memuat 50 email…" (sesuai batch yang sedang
  diambil via Math.min(PAGE_SIZE, remainingUids.length)) saat loadingMore=true;
  "Scroll untuk memuat lagi…" saat hasMore tapi tidak ada fetch aktif.

## Risks
- toLocaleString('id') ribuan pakai locale id-ID — browser harus mendukung ICU id.

## Validation
- 14/14 test PASS · npm run build OK
