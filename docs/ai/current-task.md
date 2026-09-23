# Current Task

Status: COMPLETED
Task ID: 20260923-014649-923291
Started At: 2026-09-23T01:46:49Z
Updated At: 2026-09-23T02:04:59Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
20260922-DATA-E2E: E2E live jalur data (restore draft berlampiran via kirim ulang + export .eml) di produksi

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
- Risk level: MEDIUM (E2E live mengirim email nyata dari akun diag2 ke dirinya sendiri — email uji berlabel E2E, dibersihkan otomatis)
- Impact surface: akun diag2 saja (compose→kirim→INBOX diag2); unduhan .eml via CDP ke /tmp lokal; tidak menyentuh akun user lain.
- Security concerns: lampiran uji = PDF/PNG buatan sendiri (bukan data sensitif); kredensial diag statis baku.
- Compatibility concerns: state UI diag2 (draft folder, tombol aksi) dikembalikan via cleanup expunge + pre-cleanup.
- Failure modes/edge cases: SOGo send bisa lambat/429 (mitigasi: waitForFunction timeout besar + retry cek INBOX); unduhan .eml bisa tak terpicu (mitigasi: await Promise.all dgn waitForTimeout fallback); leftover (mitigasi: expunge by-subject idempoten di finally + runner trap).
- Mitigations: cleanup double-layer; semua asersi pakai ground truth doveadm/MIME, bukan hanya DOM.
- Validation plan: node --check; E2E live PASS; bila bug app ditemukan → fix + test + deploy.
- Open risks/assumptions: delivery SMTP lokal biasanya <5 detik; asumsi tombol 'Unduh .eml' memicu download browser (diverifikasi saat implementasi).

## Risks
- (tercatat di atas)

## Validation
- Risk analysis: COMPLETE
- Tests/checks: Belum dijalankan
