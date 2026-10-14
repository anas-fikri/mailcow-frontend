---
status: accepted
date: 2026-08-11
---

# Avatar inisial, tooltip custom, dan kontrol floating

- **Decision:** Satu komponen avatar bersama `src/components/Avatar.jsx`; logika inisial murni di `src/lib/initials.js` agar bisa diuji oleh Node tanpa transpile JSX. `ContactsPage` memakai komponen yang sama (hapus duplikat).
- **Reason:** Tiga lokasi (daftar email, percakapan, panel baca) butuh avatar identik; logika yang diduplikasi berisiko drift.
- **Decision:** Helper `isSentOrDraftFolder(folderId, folders)` di `src/lib/constants.js` sebagai satu sumber kebenaran untuk keputusan "penerima vs pengirim" (Terkirim/Draf).
- **Reason:** MailPage memakai `folders.find(...)` sementara MessageReader `folders.some(...)` — sudah mulai tidak konsisten.
- **Decision:** Ganti tooltip `title` native dengan tooltip custom (portal ke `document.body`, delay 450ms, animasi, caret, flip/clamp viewport, hide saat scroll/resize).
- **Reason:** Tooltip native tidak mengikuti tema, tidak konsisten, dan terpotong di kontainer overflow; portal menghindari clipping daftar yang scrollable.
- **Decision:** Checkbox & star di baris email menjadi **overlay floating di atas avatar** (hapus kolom ~52px). Desktop: muncul saat hover. Mobile (`hover:none and pointer:coarse`): star selalu tampil; checkbox hanya di mode seleksi.
- **Decision (mobile):** Seleksi via **long-press** (450ms, batal jika gerak >10px agar tidak bentrok scroll/swipe SwipeableRow); di mode seleksi, tap baris = toggle (pola Gmail); keluar via tombol X di toolbar bulk, Escape, atau auto-exit saat pilihan kosong. Klik sintetis browser setelah long-press ditekan dengan flag di `touchend` (bukan timestamp — aman utk penahanan berapa pun).
- **Decision:** `tabIndex={-1}` untuk kontrol yang tersembunyi (`pointer-events-none` tidak menghilangkan fokus keyboard); `select-none` + `-webkit-touch-callout:none` di baris.
- **Decision (test):** `test:initials` menambah cakupan `getInitials` + `isSentOrDraftFolder`; `test:login-flow` **ditulis ulang** agar mencerminkan perilaku production saat ini: `/SOGo/connect` JSON-first, fallback form hanya pada 415/422, dan warm-up toleran yang hanya memblokir 401/403.
- **Reason:** Test login-flow lama dibuat sebelum fix `327dac7` (JSON-first) dan `7306234` (warm-up toleran) sehingga mengasumsikan perilaku yang sudah tidak berlaku.

