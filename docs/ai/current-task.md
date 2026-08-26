# Current Task — Preferensi tampilan kini benar-benar dipakai webmail

## Status
Selesai ✅ — audit PreferencesPage menemukan bug UX serius: **4 dari 5 preferensi tampilan disimpan tapi tidak pernah dikonsumsi webmail** (setting diam-diam tanpa efek). Semua kini di-wire ke perilaku nyata. 56/56 test PASS, build OK, live di produksi, ter-push.

## Temuan (audit 2026-08-26)
DisplaySection menyimpan ke SOGo: SOGoMailComposeMessageType, SOGoMailReplyPlacement, SOGoFirstDayOfWeek, SOGoConfirmDelete, SOGoDateFormat. `grep` membuktikan TIDAK SATU PUN dikonsumsi app — ComposeModal hardcode 'rich', quote balasan selalu di bawah, kalender selalu Minggu-awal, hapus selalu pakai undo toast.

## Perbaikan (wiring ke perilaku nyata)
1. **composeMode** (ComposeModal): pref 'text' → compose dibuka Plain Text SEKALI per bukaan; perubahan mode manual dihormati (modeTouchedRef). Signature di-strip tag saat mode plain.
2. **replyPlacement** (ComposeModal/RichEditor): balasan 'below' → caret ditaruh DI BAWAH quote (quote selalu di akhir body), 'above' → di atas + focus editor (pola Gmail).
3. **weekStart** (CalendarPage): getWeekDays(date, weekStartsOn) + rotasi label hari + startPad bulan; pref SOGoFirstDayOfWeek dibaca via query preferences (cache shared).
4. **confirmDelete** (MailPage): pref '0' → hapus LANGSUNG tanpa toast undo; '1' (default) → konfirmasi undo 6 dtk (tidak berubah).

Ditinggalkan (sengaja): SOGoDateFormat & bahasa — webmail punya format id-ID sendiri (renderDate); keduanya tetap disinkronkan untuk klien SOGo native.

## Next
- Verifikasi browser: ubah Mode Tulis → Teks Biasa + simpan → buka compose baru (harus Plain); Posisi Balasan → bawah → balas email (caret di bawah quote); Awal Minggu → Senin → kalender bulan/minggu mulai Senin; Konfirmasi Hapus → langsung → hapus pesan (langsung pindah, tanpa undo).
Status: COMPLETED
Updated At: 2026-08-26T18:15:00Z
