# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-27T02:46:37Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Nginx mailcow sites-default.conf.j2 level-server meng-inherit X-Frame-Options SAMEORIGIN + HSTS 15768000 ke SEMUA location tanpa add_header sendiri — termasuk location /api proxy milik kita → konflik dgn header server.js (DENY/31536000), browser lihat 2 nilai XFO beda. Fix pola: di tiap location /api gunakan proxy_hide_header (buang header upstream server.js utk nama yg sama) + add_header konsisten (nilai identik dgn server.js) — hasil SATU header bersih. Server.js juga harus set HSTS sendiri (jangan andalkan nginx) + Cache-Control no-store utk data email sensitif; image-proxy tetap public immutable (cacheable). Verifikasi duplikat header: curl -D - 
- Why:  grep -c 'header-name:' harus 1.|Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
