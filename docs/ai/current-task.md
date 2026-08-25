# Current Task

## Task: Bug hunt menyeluruh — flow, UI/UX (PC + mobile), fitur, vulnerability

**Status: SELESAI (43/43 test PASS, live)** → commit + push + deploy.

## Ringkasan
Audit sistematis (rotasi fokus: flow logic → edge case → UI/UX mobile+desktop →
security) menemukan **6 bug nyata**, semuanya diperbaiki + diuji.

## Temuan & Perbaikan

| # | Jenis | Bug | Fix |
|---|---|---|---|
| 1 | Crash | `formatAddresses` (MessageReader) crash TypeError saat item array `null`/string (data SOGo) | Pindah ke `src/lib/format.js` + normalisasi: null dilewati, string apa adanya, objek `Nama <email>` |
| 2 | Flow | Keyboard `s` (star) double-fire: MailPage + MessageReader dua-duanya listen keydown global saat reader terbuka → flag toggle 2x (net nol) + 2 request; `r`/`f` buka compose 2x | Guard `isReaderOwnedShortcut(selectedMsgId, key)` di constants.js; MailPage skip `s/r/f` saat reader terbuka. Bonus: MessageReader skip saat target `contentEditable` (RichEditor compose) |
| 3 | Mobile UX | ContactsPage: panel detail `hidden md:block` → di HP tap kontak tidak menampilkan apa-apa | Detail sheet mobile (fixed overlay + backdrop) |
| 4 | Security (minor) | `warmUpSogoSession` log `sogoToken` (session token) ke console via `console.warn` di produksi | Ganti ke `debugLog`/`debugWarn` (DEV-only) — token tidak pernah di-log produksi |
| 5 | Flow | CalendarPage `handleDrop`: drag event menghilangkan `attendees` + pola `repeat` (recurring hilang diam-diam) | Ekstrak `buildDroppedEventData` ke `src/lib/calendarDrop.js` — pertahankan attendees/repeat/classification |
| 6 | Mobile UX | Toast `bottom-4` tertutup BottomNav mobile | Posisi responsif: `bottom-20 left-3 right-3` (mobile) / `md:bottom-4 md:right-4` |

## Test (3 baru)
- `test:format` — formatAddresses 14 kasus (null item, string item, objek, non-array)
- `test:calendar-drop` — drag pertahankan attendees/repeat/classification + durasi + default 09:00
- `test:keyboard-ownership` — isReaderOwnedShortcut 14 kasus (kontrak s/r/f)

## Validasi
- **43/43 test PASS** · `npm run build` OK · baseline sebelum audit 40/40 → 43 setelah fix.

Status: COMPLETED
Updated At: 2026-08-25T15:49:02Z
