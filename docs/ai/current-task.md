# Current Task

## 2026-08-27 — Ai-loop rotasi: ComposeModal rich-text + paste edge cases

**Status:** selesai — 2 bug ditemukan & diperbaiki, 57/57 PASS, build OK.

**Bug 1 — Plain mode menghapus karakter '<' user.** Textarea plain memakai
`value={body.replace(/<[^>]*>?/gm, '')}` tiap render → teks polos user yang
mengandung '<' (mis. "a < b", kode) di-strip tag palsu tiap re-render → user
TIDAK BISA mengetik '<'. Fix: PlainBodyTextarea — deteksi tag HTML lengkap
(HTML_TAG_RE /<[a-z][^>]*>/i); body yang benar-benar HTML (draft/reply) di-strip
(htmlToPlainText), teks polos user dibiarkan apa adanya.

**Bug 2 — Race paste fallback Clipboard API.** Di pasteUtils.handleEditorPaste,
jalur tryReadClipboardImages memanggil e.preventDefault() SETELAH await →
browser sudah paste teks default → gambar di-insert di atas teks = duplikat.
Fix: cek dt.types utk indikasi file/gambar (Files / image/*) — teks biasa
dibiarkan default; hanya preventDefault SYNC sebelum await saat berpotensi
gambar.

**Test:** test-paste-editor.mjs baru (9 assertion) + verifikasi runtime 3 kasus
(draft HTML strip, 'a < b', kode) → 57/57 PASS, build OK.
