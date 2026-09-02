# Current Task

Status: COMPLETED
Task ID: 20260902-142500-000001
Started At: 2026-09-02T14:25:00Z
Updated At: 2026-09-02T14:37:06Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
T-MAIL-REFRESH-2026-09-02: webmail selalu menampilkan email terbaru (auto-refresh list)

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-001

## Files Involved
- src/pages/MailPage.jsx
- docs/ai/knowledge.md
- docs/ai/current-task.md
- docs/ai/handoff.md

## Next Steps
- [DONE] Regression 74/74 PASS + vite build PASS
- [DONE] Deploy produksi via SERVER=deploy-mail ./deploy.sh — smoke test webmail 200, /api/health 200, image-proxy SSRF 403 OK, backend unchanged (skip restart)
- Push ke GitLab ditunda sampai tunnel wg0 hidup (29 commit lokal menunggu, termasuk 3062618)

## Risk Analysis
- Status: COMPLETE
- Risk level: LOW
- Impact surface: MailPage polling/refresh behavior only; no backend change.
- Security concerns: no credential handling; request frequency tetap rendah (1x unseen poll/60s, messages refetch hanya saat unseen naik atau window focus).
- Compatibility concerns: React Query v5 invalidateQueries refetchType 'active'; refetchOnWindowFocus override per-query.
- Failure modes/edge cases: list pagination "loncat" saat background refresh → extraMessages kini divalidasi terhadap allUids fresh; search aktif tidak diganggu.
- Mitigations: validasi extraMessages vs allUids; fallback reset penuh bila SOGo lama tidak menyediakan uids.
- Validation plan: 74 regression scripts + vite build.

## Risks
- Jika unseenCount melompat besar (bulk delivery), satu invalidate cukup — dedup via prev > current guard.

## Validation
- Risk analysis: COMPLETE
- Tests/checks: 74/74 PASS; vite build PASS; deploy produksi 2026-09-02 PASS (webmail HTTP 200, /api/health 200 end-to-end, image-proxy SSRF 403 OK, backend unchanged — skip restart). Commit 3062618; GitLab push ditunda sampai tunnel wg0 hidup kembali.
