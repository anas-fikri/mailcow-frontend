# Current Task

## 2026-08-27 — Audit keamanan: headers CSP/HSTS + hardening nginx produksi

**Status:** selesai, live terverifikasi.

**Temuan (sudah baik):** /webmail + assets punya CSP ketat, HSTS 1th, nosniff, XFO
DENY, Referrer-Policy, Permissions-Policy, COOP/CORP. TLS TLSv1.2/1.3 + ciphers
modern. server.js middleware semua /api. /SOGo tanpa auth = login page.

**Gap diperbaiki:**
1. Duplikat/konflik header /api/* — nginx level-server mailcow (sites-default)
   meng-inherit XFO SAMEORIGIN + HSTS 6bln ke location /api yang tanpa add_header
   → konflik dgn server.js (DENY/1th). Fix: proxy_hide_header (buang upstream
   duplicate) + add_header konsisten di 6 location /api (HSTS 31536000, XFO DENY,
   nosniff, Referrer-Policy, Permissions-Policy).
2. server.js: tambah HSTS max-age=31536000 + Cache-Control no-store utk semua
   /api (data email sensitif; image-proxy tetap public immutable).

**Verifikasi live:** /api/health 200 — tiap header SATU nilai (HSTS 1th, XFO DENY,
nosniff, Referrer, Permissions, CSP, no-store). image-proxy 200 image + immutable.
Test 56/56 PASS, build OK, deploy sukses.
Status: COMPLETED
Updated At: 2026-08-27T02:46:37Z
