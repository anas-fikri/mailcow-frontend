# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T02:01:52Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Nginx webmail security: HSTS wajib tanpa includeSubDomains (subdomain lain bisa non-HTTPS); COOP same-origin + CORP same-origin + X-XSS-Protection 0 + CSP upgrade-insecure-requests ditambahkan ke 3 blok location. Keputusan penting: img-src 'self' data: TANPA https: — semua gambar eksternal email di-rewrite ke /api/image-proxy (anti tracking-pixel); mengizinkan https: langsung = browser bisa muat pixel tanpa proxy. Referrer-Policy strict-origin-when-cross-origin krusial krn URL SOGo memuat sogoToken di path (hanya origin yg bocor keluar). /api/* proxy tidak perlu header tambahan — server.js upstream sudah set sendiri. Image-proxy 502 utk URL gambar gagal = status sengaja remoteImage.js (DNS/redirect/UA), bukan regresi nginx; 400 passthrough utk url invalid bukti routing jalan. Config single-source: configs/site.webmail.custom + deploy.sh substitusi port + reload; validasi docker exec nginx -t dulu sebelum reload.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 5 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
