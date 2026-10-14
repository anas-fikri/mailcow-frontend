---
status: accepted
date: 2026-10-11
---

# UX ala Outlook: preferensi layout per-akun + threading balasan
- **Decision:** Preferensi tata letak (readingPane/density/markReadMode/paneWidths/
  favorit/collapse folder) disimpan per-akun di localStorage (skema `userPrefs.js`
  ternormalisasi + setPref generik di authStore), BUKAN di SOGo defaults — konsisten
  dgn pola theme/sortAsc yang ada, nol dependensi backend.
- **Decision:** Threading balasan dipasang di server (`/api/send` → nodemailer
  inReplyTo/References, sanitasi token `<id@host>` anti header-injection di
  `src/lib/threadingHeaders.js`); frontend hanya meneruskan nilai dari viewsource.
- **Decision:** Optimistic update menambal SEMUA key `['messages', token, folder, *]`
  + `extraMessages` + unseen, satu `bumpMailVersion` per batch; delete/move/arsip
  deferred 6 dtk (baris disembunyikan segera, undo mengembalikan tanpa kehilangan
  warna bendera).
- **Decision:** Mode compose asli (new/reply/replyAll/forward/draft) dipertahankan utk
  judul/aria; signature tetap dipetakan reply-like → 'reply' (perilaku lama).

