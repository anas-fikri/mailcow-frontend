# Current Task

## Task: Terapkan pola cache yang sama ke storage lain di hot path (getRules/getRuleSummary)

**Status: SELESAI — cache rules engine, 50/50 test PASS, live build terverifikasi.**

## Konteks
Round sebelumnya: cache `getFlagColor` (hot path render MailPage) terbukti
memangkas 58–84% waktu + 98–99% baca localStorage (benchmark A/B). Pola yang
sama diterapkan ke **rules engine auto-archive**, yang dibaca di 3 tempat hot:
- `getRuleSummary(email)` — dipanggil **per-render MailPage** (baris 389)
- `getRules(email)` — dipanggil di **render RulesPage** (baris 635)
- `matchRules` per-message di `executeRules` — sebelumnya baca + parse +
  normalisasi SELURUH rules dari localStorage utk SETIAP pesan di setiap
  siklus polling/auto-archive

## Perubahan (`src/lib/autoArchive.js`)
- Cache in-memory `rulesCache` (Map email → normalized rules array).
- `getRules`: cache hit = 0 baca localStorage; miss = baca ≤2 (fallback v2+v1)
  sekali, lalu populate.
- Invalidate otomatis di SEMUA jalur tulis: `saveRules` (dipakai addRule /
  updateRule / deleteRule / toggleRule) + `clearAllRules`. `executeRules`
  bump runCount lewat `updateRule` → invalidate juga ikut. Tidak ada jalur
  tulis langsung lain (verified via grep).
- `__resetRulesCache()` (internal/test) — pola sama seperti
  `__resetFlagColorCache`.

## Test (`scripts/test-autoarchive.mjs`)
Assertion baru dengan spy `getItem` (hitung baca key rules):
- Baca pertama 1–2× (v2+v1 fallback), 20 panggilan beruntun = 0 baca tambahan
- `matchRules` + `getRuleSummary` ikut memakai cache (0 baca)
- Setelah tulis CRUD → cache invalidated → baca ulang ≤2×
- `__resetRulesCache()` dipasang di semua titik yang memutasi storage mentah
  (termasuk section korupsi JSON + snooze interaksi) — pola sama seperti
  test-flag-colors

## Validasi
- **50/50 node test + bash deploy-runtime-env PASS** · `vite build` OK
- Baseline sebelum perubahan: 50/50 (51 dgn bash script)

Status: COMPLETED
Updated At: 2026-08-26T03:15:00Z
