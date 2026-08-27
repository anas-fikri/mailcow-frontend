# Current Task

## 2026-08-27 — Batch fitur: Undo Send (2-3 mnt) + Jadwal Kirim + Dark mode auto + PWA + Shortcuts + .eml

**Status:** kode selesai, 59/59 test PASS, build OK. Commit + push + deploy menyusul.

## Yang dikerjakan

### 1. Undo Send (2–3 menit) + Kirim Terjadwal (server-side queue)
- **Kenapa server-side:** window 2-3 mnt TIDAK aman ditangani frontend (tab bisa ditutup). Email ditahan di queue persist.
- **`src/lib/sendQueue.js` (baru):** queue file-backed (atomic write tmp+rename, survive restart), kredensial SMTP dienkripsi AES-256-GCM (kunci = `SEND_QUEUE_SECRET` fallback `API_KEY`), `dueEntries`/`pendingForUser`/`canCancel`/`buildQueueEntry`/`maxScheduleMs` pure & testable.
- **server.js:** schema `sendAt` (ISO) opsional; tanpa sendAt & `SMTP_SEND_UNDO_SECONDS>0` (default 180 dtk = 3 mnt) → semua kirim ditahan utk undo; `POST /api/send/undo` (cancel, hanya utk entry pending belum due); `GET /api/send/pending` (per-user); flush loop tiap 5 dtk kirim entry due (retry 3x → failed); pruneStale failed >24 jam.
- **api.js:** `sendMessage` dukung `sendAt` (jadwal → wajib lewat SMTP proxy, bukan draft SOGo), `undoScheduledSend`, `getPendingSends`.
- **ComposeModal:** dropdown "Jadwalkan" (Sekarang / Hari ini 18:00 / Besok 08:00 / datetime-local khusus), toast undo dgn **countdown dinamis tiap detik** (updateToast baru di toast.js) + tombol Urungkan/Batalkan.

### 2. MailPage — badge & panel "Terjadwal"
- Polling `getPendingSends` tiap 60 dtk → badge "Terjadwal (n)" di aksi cepat; modal daftar kiriman terjadwal dgn tombol Batalkan.

### 3. Dark mode penuh (auto)
- **Ternyata sudah ada** `.dark` CSS + store `theme` + toggle di Sidebar — yang kurang: mode **auto** (ikuti sistem).
- authStore: `cycleTheme` (dark→light→auto), `theme='auto'` didukung.
- AppLayout: resolve efektif `auto` → `prefers-color-scheme` + listener perubahan (tanpa reload).
- Sidebar: toggle siklus + ikon Monitor utk auto.
- PreferencesPage: 3 kartu pilihan Mode Tampilan (Gelap/Terang/Otomatis).
- index.html: **anti-FOUC** via `public/theme-init.js` eksternal (CSP `script-src 'self'` memblokir inline!) — file non-hash, nginx no-cache.

### 4. PWA installable
- `public/manifest.webmanifest` (name/start_url/scope/display standalone/icon SVG).
- `public/sw.js` (baru): network-first utk navigasi (fallback cache offline shell), stale-while-revalidate utk asset ber-hash, **TIDAK pernah cache /api*** & `/SOGo` (data sensitif), version bump + cleanup cache lama.
- main.jsx: register SW hanya di PROD.
- nginx: lokasi khusus no-cache utk `sw.js`/`theme-init.js`/`manifest.webmanifest` (jangan kena rule immutable asset!).

### 5. Keyboard shortcuts
- **Ternyata sudah lengkap** (j/k/o/c/a/s/u/x/d/#/!/m/r/f//?/esc + help modal + guard input) — ditambah **`e` = Arsipkan** (Gmail-style) + entri di help.

### 6. Drag & drop .eml + Export .eml
- **`src/lib/emlUtils.js` (baru):** `parseEmlContent` (RFC 5322 + MIME: header decode =?UTF-8?B/Q?, multipart/alternative + mixed, base64/quoted-printable) & `buildEml` (rekonstruksi .eml valid, multipart utk lampiran) & `htmlToText`.
- ComposeModal: drop file .eml → isi form (to/cc/bcc/subject/body + mode editor).
- MessageReader: tombol **Unduh .eml** (FileDown) — rekonstruksi header+body+lampiran base64 via `buildEml`.

### 7. Notifikasi email baru + badge tab
- **Sudah ada** (MailPage: title badge `(n)` + Notification API) — diverifikasi, tidak diubah.

## Test
- `scripts/test-eml-sendqueue.mjs` (baru, 51 assertion: crypto roundtrip, queue lifecycle, route/UI wiring, parse/build .eml).
- **59/59 PASS** · build OK · deploy.sh `BACKEND_LIB_FILES` + `SMTP_SEND_UNDO_SECONDS=180` idempotent.
Status: COMPLETED
Updated At: 2026-08-27T03:30:48Z
