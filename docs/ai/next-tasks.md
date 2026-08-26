# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T01:15:42Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Bug hunt kombinasi: (1) SEMUA query key React Query global harus di-scope identitas user — ['smtp-session-status'] di Sidebar tanpa scope menampilkan countdown sesi akun sebelumnya ke akun baru (cache QueryClient global, staleTime 30s). Fix: queryKey ['smtp-session-status', user?.sogoToken]. (2) Komponen yang mount permanen di belakang modal (MessageReader + ComposeModal saat reply) perlu guard keyboard berdasarkan state modal: prop shortcutsEnabled={!composeOpen} + guard di handler + deps array. Tanpa ini 'r' reset compose, Delete hapus pesan yang dibalas, Escape tutup reader di balik modal. (3) Verified aman multi-akun: localStorage semua *_v2_<email> scoped; LoginPage revokeSmtpSession+clearUser+resetSessionExpiredFlag sebelum login baru; server /api/send terikat session.user + anti-spoof From (403 bila mismatch); register SMTP evict sesi lama per user; visibleOrderUids = hasil filter snooze (reader tak buka pesan tersembunyi); semua interval unmount-clean + multi-tab idempotent. Test test:state-combination = 7 assertions static.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 9 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
