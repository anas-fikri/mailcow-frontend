## 2026-08-27 — Bug Hunt Round 2 + Mobile UX + Quick Reply

### Selesai:
1. **theme-init.js data-theme** — `theme-init.js` sekarang set `data-theme="dark|light"` (sebelumnya hanya class → CSS selectors `[data-theme]` tidak work sebelum React mount)
2. **datetime-local min timezone** — Schedule picker `min` attribute sekarang pakai local time (sebelumnya UTC → jam min salah 7 jam untuk GMT+7)
3. **toggleSelectAll filter fix** — "Pilih Semua" sekarang hanya pilih pesan yang TAMPIL (setelah filter flag/category/unread/attachment), bukan semua pesan di folder
4. **Sidebar collapse persist** — Collapse state disimpan di `localStorage('pcp_sidebar_collapsed')`, tidak reset saat reload
5. **BottomNav safe-area** — `env(safe-area-inset-bottom)` untuk iPhone notch/home indicator
6. **ComposeModal footer safe-area** — `max(12px, env(safe-area-inset-bottom))` untuk tombol Kirim di iPhone
7. **Quick reply dari daftar email** — Tombol Reply di hover action bar (desktop), fetch detail + buka compose langsung

### Deploy: ✅ Live (commit 3046188)
### Git push: ⏳ Timeout — push manual diperlukan

### Next tasks:
- AI-loop bug hunt round 3: edge case auto-archive vs snooze, multi-tab race, dark mode auto switching di Safari
- Quick reply di mobile (tambahan tombol di baris email sentuh)
- Pull-to-refresh untuk inbox mobile

## 2026-08-27 — Bug Hunt Round 3 + Mobile UX

### Selesai:
1. **isMobile detection** — ganti `ontouchstart` → `matchMedia('(pointer: coarse)')` + `(hover: none)`. Laptop sentuh tidak lagi ter-deteksi sebagai mobile.
2. **Swipe kiri inbox = Reply** — bukan hapus. Pattern Gmail: swipe right = mark read, swipe left = reply. Folder lain tetap hapus.
3. **Pull-to-refresh** — komponen `PullToRefresh` dengan rubber-band effect, RefreshCw indicator, auto-spin saat refresh. Hanya aktif di mobile (scrollTop=0).
4. **Pending sends re-fetch** — useEffect re-fetch saat panel dibuka, di samping polling 60 detik existing.

### Deploy: ✅ Live
### Git push: ⏳ perlu push manual

### Next tasks:
- Quick reply mobile: tambah tombol reply visible di touch mode (bukan hanya hover)
- Dark mode auto-switch: cek Safari matchMedia quirks
- Keyboard shortcut 'e' untuk arsipkan (sudah ada di backlog)
- Fitur #5: local phishing detection (regex-based, tanpa AI)

## 2026-08-27 — Bug Hunt Round 4: Dark Mode Safari + Keyboard Shortcuts

### Selesai:
1. **Safari dark mode** — `mq.addEventListener?.('change')` diganti dengan fallback `addListener`/`removeListener` untuk Safari <14.
2. **Theme transition** — `document.documentElement.style.transition` ditambahkan agar switch tema tidak flash.
3. **`a` shortcut** — select-all sekarang pakai `sortedMessages` (konsisten dengan toggleSelectAll button).
4. **Dead code cleanup** — handler `r`/`f` di MailPage dihapus (sudah dimiliki MessageReader via isReaderOwnedShortcut).
5. **Touch target** — send button ComposeModal dinaikkan ke min-h-11 (44px).

### Deploy: ✅ Live
### Git push: ⏳ perlu push manual

### Next tasks:
- Fitur #5: local phishing detection (regex-based, tanpa AI)
- Conversation view: expand/collapse all thread
- Auto-load untuk folder Sent/Drafts/Junk (sudah di inbox)
- Preferences: export/import settings

## 2026-08-27 — Local Phishing Detection (tanpa AI)

### Selesai:
1. **phishingDetection.js** — modul baru: URL analysis (blacklist, IP, shortener, punycode, TLD), header analysis (From/Reply-To mismatch, display name spoofing), content analysis (urgency, scam, credential harvest, CEO fraud). Scoring 0-100 → safe/low/medium/high.
2. **MessageReader banner** — warning di atas email dengan warna sesuai risk level + daftar findings (max 5).
3. **MailPage indicator** — icon ⚠️ kecil di baris email jika From/Reply-To domain mismatch (lightweight, tanpa body analysis).
4. **Test** — 31 assertions, semua PASS.

### Deploy: ✅ Live
### Git push: ⏳ perlu push manual

### Next tasks:
- Auto-load untuk folder Sent/Drafts/Junk
- Conversation view: expand/collapse all thread
- Preferences: export/import settings
- Expand blacklist phishing dari URL dataset publik

## 2026-08-27 — Bug Hunt Round 5

### Selesai:
1. **Auto-load verified** — semua folder (Sent/Drafts/Junk) sudah auto-load sampai habis. INBOX dibatasi 5 bulan via `applyMessageWindow`. Tidak ada bug.
2. **Flag color picker dedup** — if/else identical → satu jalur. Komentar penjelasan: set warna selalu star aktif.
3. **SuggestionList verified** — `onMouseDown` + `preventDefault` mencegah blur race. Tidak ada duplikat email.

### Deploy: ✅ Live
### Git push: ⏳ perlu push manual

### Next tasks:
- Conversation view: expand/collapse all thread sekaligus
- Preferences: export/import settings
- Quick reply mobile: tambah tombol reply visible di touch mode

## 2026-08-27 — Conversation View Expand/Collapse All

### Selesai:
1. **expandAllConversations** — expand max 50 thread (limit utk cegah lag di inbox besar)
2. **collapseAllConversations** — collapse semua thread sekaligus
3. **Tombol header** — ChevronDown/ChevronRight, toggle otomatis (kalau semua sudah expand → collapse, sebaliknya)
4. **Edge cases verified** — hapus pesan dalam conversation, shrink ke 1 pesan, stale keys

### Deploy: ✅ Live
### Git push: ⏳ perlu push manual

### Next tasks:
- Preferences: export/import settings ke file JSON
- Quick reply mobile: tambah tombol reply visible di touch mode
- Keyboard shortcut '?' → help modal (sudah ada, verifikasi)

## 2026-08-27 — Fix #310 akar-masalah sebenarnya: duplikat runtime React

Rangkaian investigasi panjang menemukan bahwa error "r.substring"/"oe is not a
function"/React #310 semuanya berakar pada DUPLIKASI RUNTIME REACT via
use-sync-external-store CJS shim (dipakai zustand@4). Diperbaiki permanen
dengan resolveId-plugin shim lokal + test gating test-single-react.mjs.
Catatan durabel: ketika menambah dependency npm baru yang melakukan require
CJS 'react', verifikasi bundle tetap single-react (jalankan
node scripts/test-single-react.mjs setelah build).

## 2026-08-27 — Fix inbox tak bisa discroll (regresi PullToRefresh)
PullToRefresh wrapper 'relative h-full' memecah flex-sizing inner list →
overflow-y-auto mati. Kontrak layout baru: wrapper 'relative flex-1 min-h-0',
list 'absolute inset-0 overflow-y-auto'. Gating: test-list-scroll-layout.mjs.
Pelajaran durabel: menyisipkan WRAPPER di kolom flex-col WAJIB cek ulang
kontrak tinggi anak-anaknya; gunakan absolute-inset untuk scroll-container
yang harus selalu punya definite height.

## 2026-08-27 — Audit kontrak scroll lintas halaman
Selaras dgn pelajaran inbox (#310 flex), audit wrapper layout Manual:
Calendar/Contacts/MessageReader ditemukan sudah benar, HANYA lemah di
min-h-0 (flex-child bisa menolak shrink walau flex-col). Ditambahkan
min-h-0 di Calendar main + Contacts main. Gate baru test-scroll-contract.mjs
memaksa pola aman (absolute-inset ATAU flex-col + min-h-0) dan melarang
wrapper 'relative h-full'.
