# Current Task

Status: COMPLETED
Task ID: 20260905-AUDIT-UNGUAURDED
Updated At: 2026-09-05
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Audit the areas the module-scope guard does not cover: workers, iframes, and inline scripts — looking for the outage bug class and security issues.

## Result
1. **Workers** — satu-satunya worker: `public/sw.js` (service worker). Audit aman; **diperketat**: `isCacheableResponse` kini hanya `response.ok` (hapus `opaqueredirect` — respons opaque tak bisa divalidasi, redirect cross-origin mustahil di skenario same-origin /webmail/ non-api).
2. **Iframes** — hanya lightbox PDF di `MessageReader.jsx` (`src` = viewURL SOGo same-origin; X-Frame-Options SAMEORIGIN sudah diverifikasi). Tidak ada srcdoc / createElement('iframe') / contentWindow.
3. **Inline scripts / eval** — tidak ada eval / new Function / createElement('script'). Semua sink (`document.write` print EML, `innerHTML` compose/editor/proxy) sudah di-escape + DOMPurify + image-proxy.
4. **Bug fitur senyap ditemukan & diperbaiki** — `public/help/email-settings.html` punya inline `<script>` untuk fitur `?domain=` (host IMAP/SMTP per domain, diandalkan `Sidebar.jsx`), tapi CSP `script-src 'self'` (location /webmail + location ~* \.html$) memblokirnya di produksi → fitur mati tanpa error. Fix: diekstrak ke `public/help/email-settings.js` eksternal.
5. **Guard baru** `scripts/test-public-html.mjs` — public/*.html dilarang punya inline script (mencegah regresi).
6. **Cleanup** — `public/theme-init.js` (legacy, sudah digantikan `src/themeInit.js`) dihapus. Module-scope guard kini scan rekursif + `public/` + `src/themeInit.js` → **63 file, 0 temuan**.

## Validasi
- Suite **84/84 PASS** (83 + guard public-html baru), build produksi bersih.
- dist terverifikasi: `sw.js` (fix opaque), `help/email-settings.js` ikut, `theme-init.js` hilang, HTML referensi script eksternal.

## Next
- **Deploy belum dilakukan** — perubahan menyentuh file yang disajikan langsung (`public/sw.js`, help page): jalankan `SERVER=deploy-mail ./deploy.sh` agar live, lalu verifikasi bundle + `/webmail/help/email-settings.html?domain=…`.