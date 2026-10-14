---
status: accepted
date: 2026-08-17
---

# Round 8: subfolder depth dari path, shortcut modifier guard, render HTML dalam text/plain

- **Decision (subfolder depth):** `flattenMailboxes` memakai `Math.max(depth, pathDepth)` — `depth` dari rekursi `children` (response nested) ATAU turunan dari segmen `path` (`INBOX/Sub` → 1).
- **Reason:** SOGo di production mengembalikan daftar folder flat tanpa `children`, jadi indentasi yang hanya mengandalkan `children` tidak pernah tampil. Depth dari `path` bekerja untuk kedua bentuk response; nilai keduanya identik saat response nested (full path selalu dibawa SOGo).
- **Decision (shortcut):** Semua shortcut keyboard app hanya tombol tunggal tanpa modifier; handler menolak event dengan `metaKey/ctrlKey/altKey`.
- **Reason:** Sebelumnya `key === 'c'` tanpa cek modifier membuat `cmd/ctrl+C` (copy) membuka compose dan `cmd/ctrl+R` / `cmd+shift+R` (refresh/hard refresh) memicu reply — mencuri perilaku native browser/OS. Kombo browser dikembalikan native; shortcut app tetap tersedia via tombol polos.
- **Decision (bounce/plain-HTML):** Konten `text/plain` yang terdeteksi mengandung markup HTML umum (`<div|p|br|a|table|...`) dirender sebagai HTML (di-sanitize DOMPurify); teks biasa tetap di-escape penuh.
- **Reason:** Bounce SOGo ("Mail delivery failed") adalah text/plain yang berisi HTML — meng-escape semua membuat sumber mentah tampil ke user. Heuristik tag spesifik mencegah salah-render teks biasa yang hanya memakai `<`/`>` (kode, perbandingan).

