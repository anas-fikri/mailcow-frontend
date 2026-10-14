---
id: T-3jkr
title: '20260922-CONV-AUDIT: audit E2E live fitur conversation (sortAsc, expand-all, pagination) yang dijaga test statis'
status: done
profile: standard
created: "2026-09-23T01:23:29Z"
updated: "2026-09-23T01:40:36Z"
legacy:
  source: docs/ai/tasks/20260923-014649-923291.previous.md
  status: COMPLETED
  v1_id: 20260923-012329-321379
---

## Objective
20260922-CONV-AUDIT: audit E2E live fitur conversation (sortAsc, expand-all, pagination) yang dijaga test statis

## Goal Link
Goal ID: TBD
Sub-goal ID: TBD

## Files Involved
- To be determined

## Next Steps
- Inspect the current code and context
- Execute the task
- Update handoff notes before switching tools

## Risk Analysis
- Status: COMPLETE
- Risk level: LOW (audit; perubahan kode hanya bila bug terbukti)
- Impact surface: E2E live baca-utama terhadap PRODUKSI via akun diag2 (mailbox uji); seed ~105 email plain ke INBOX diag2 utk pagination, expunge by-subject di finally + expunge ALL oleh runner cleanup. Tidak menyentuh akun user nyata.
- Security concerns: kredensial diag2 statis (sudah baku di repo); tidak ada payload berbahaya.
- Compatibility concerns: sortAsc/expand-all hanya diubah state UI diag2; preferensi dikembalikan (toggle-back) di finally.
- Failure modes/edge cases: seed 105 bisa lambat (mitigasi: 1 ssh loop); refetchOnWindowFocus bisa mengubah DOM saat assert (mitigasi: sleep settle); leftover email (mitigasi: expunge idempoten).
- Mitigations: cleanup double-layer (test finally + runner trap); assertions dgn diagnostik dump saat gagal.
- Validation plan: node --check, unit conversation contracts hijau, E2E live PASS terhadap bundle produksi; fix+deploy bila bug app ditemukan.
- Open risks/assumptions: prefetch /view ≈100 header (asumsi dari komentar kode) — di-verifikasi empiris di E2E.

## Risks
- (tercatat di atas)

## Validation
- Risk analysis: COMPLETE
- Tests/checks: Belum dijalankan (E2E menyusul implementasi skrip)
