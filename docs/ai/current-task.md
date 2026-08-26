# Current Task

## Task: ai-loop rotasi compose & draft flow (race autosave + edit draft)

**Status: SELESAI — 3 bug diperbaiki, 52/52 test PASS, live build terverifikasi.**

## Konteks
Rotasi ai-loop fokus **compose & draft flow**. Audit menemukan 2 race di
autosave + 1 gap UX (draft tidak bisa dilanjutkan) + 1 bug latent di
`extractHtml`.

## Bug & Fix

### Bug 1 — Autosave in-flight saat Send → draft yatim di folder Draf
`handleSend` tidak menghentikan timer autosave. Timer 3s bisa fire saat
`sendMessage` in-flight → autosave menyimpan draft SETELAH `deleteDraft`
mengecek `draftUidRef` → draft tertinggal. Plus setState setelah modal tutup.
**Fix (ComposeModal):** `clearTimeout` + `autosaveDirty=false` + `sentRef=false`
di awal send; `sentRef=true` setelah sukses; `runAutosave` cek `sentRef` setelah
save → bersihkan draft sendiri bila email sudah terkirim.

### Bug 2 — Autosave bertumpuk → konten STALE bisa menimpa konten baru
Dua `runAutosave` bisa berjalan bersamaan (tanpa in-flight guard); yang selesai
paling akhir menulis konten lebih lama.
**Fix:** guard `autosaveBusy` — kalau sibuk, tandai dirty + skip; `finally`
jadwalkan ulang 3s bila ada perubahan baru yang masuk selama autosave.

### Bug 3 (UX) — Draft di folder Draf tidak bisa diedit/dilanjutkan
Klik draft hanya membuka MessageReader baca-saja — sekali disimpan, draft tidak
pernah bisa dilanjutkan.
**Fix:** `handleRowClick` di folder draft → `openDraftForEdit(uid)` (MailPage):
fetch detail → `initialData` {to/cc/bcc/subject/body + `draftUid`} → buka
ComposeModal. `editingDraftUidRef` menahan uid draft asli; autosave menyimpan ke
draft BARU (createDraft) lalu draft asli + draft autosave dihapus saat kirim.
Signature TIDAK disuntik ulang saat edit draft (hindari duplikat). Gerbang
`userEditedRef`: autosave hanya setelah user mengubah apa pun — membuka draft
yang sudah terisi tanpa edit tidak membuat salinan draft baru.

### Bug 4 (latent) — extractHtml memilih text/plain padahal html ada
Versi lama hanya cari `text/html` di child LANGSUNG. Struktur SOGo umum
(`multipart/mixed` → `text/plain` lalu `multipart/alternative[html]`) membuat
versi plain menang. **Fix:** `extractHtml` di `src/lib/messageHtml.js` (dipindah
dari MessageReader, dipakai MailPage + MessageReader) — prefer html di
kedalaman mana pun, fallback plain. 

## Test
- `test-message-html` +9 assertion `extractHtml` (html langsung, plain wrap,
  mixed/nested, prefer html, kosong)
- **Baru `test:draft-compose`** — 24 assertion statis: guard `autosaveBusy`/
  `sentRef`/`userEditedRef`, finally reschedule, handleSend cleanup, delete
  draft asli+autosave, gerbang autosave, alur edit-draft, dedup extractHtml
- **52/52 PASS** (51 + draft-compose) · build OK

Status: COMPLETED
Updated At: 2026-08-26T03:40:00Z
