---
id: T-tkf4
title: Date picker kustom untuk tanggal Auto-Reply Cuti
status: done
profile: standard
profile_pinned: true
created: "2026-10-29T04:28:48Z"
updated: "2026-10-29T04:37:24Z"
closed: "2026-10-29T04:37:24Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-fix-dup-rules
base: 35397f785ce74a3f31464a3c54a41314646dbf1d
paths:
  - deploy.sh
  - package.json
  - scripts/run-tests.mjs
  - scripts/test-a11y.mjs
  - scripts/test-contact-signature-edge.mjs
  - scripts/test-conversation-expand.mjs
  - scripts/test-conversation-toolbar-regression.mjs
  - scripts/test-date-range-picker.mjs
  - scripts/test-mark-read-sync.mjs
  - scripts/test-new-mail-detect.mjs
  - scripts/test-protected-folders.mjs
  - scripts/test-quick-rule.mjs
  - scripts/test-rule-address-suggest.mjs
  - scripts/test-send-queue-dedupe.mjs
  - scripts/test-sieve-filters.mjs
  - scripts/test-sieve-save.mjs
  - scripts/test-signature-sync.mjs
  - scripts/test-vacation.mjs
  - server.js
  - src/components/DateRangePicker.jsx
  - src/components/layout/AppLayout.jsx
  - src/components/mailer/ComposeModal.jsx
  - src/components/mailer/MessageReader.jsx
  - src/components/mailer/QuickRuleModal.jsx
  - src/components/rules/AddressValueInput.jsx
  - src/components/rules/Modal.jsx
  - src/components/rules/RuleEditor.jsx
  - src/components/rules/RunNowDialog.jsx
  - src/components/rules/styles.js
  - src/lib/api.js
  - src/lib/autoArchive.js
  - src/lib/calendarGrid.js
  - src/lib/instanceLock.js
  - src/lib/mailToolbar.js
  - src/lib/mailboxTree.js
  - src/lib/newMail.js
  - src/lib/ruleAddressSuggest.js
  - src/lib/sendQueue.js
  - src/lib/sieveFilters.js
  - src/lib/signatureStore.js
  - src/lib/signatures.js
  - src/lib/vacation.js
  - src/pages/MailPage.jsx
  - src/pages/PreferencesPage.jsx
  - src/pages/RulesPage.jsx
evidence:
  check:
    cmd: npm test && npm run build
    exit_code: 0
    duration_ms: 31951
    summary: |-
      …omputing gzip size...
      dist/index.html                             1.57 kB │ gzip:   0.65 kB
      dist/assets/index-DhbysTlS.css             88.97 kB │ gzip:  15.48 kB
      dist/assets/loader-circle-DgYlufKE.js       0.13 kB │ gzip:   0.15 kB
      dist/assets/clock-DMoWr2al.js               0.17 kB │ gzip:   0.16 kB
      dist/assets/chevron-right-aPkpFpJB.js       0.19 kB │ gzip:   0.17 kB
      dist/assets/copy-BkS4uABt.js                0.22 kB │ gzip:   0.20 kB
      dist/assets/pencil-BhXT7E2s.js              0.26 kB │ gzip:   0.22 kB
      dist/assets/file-text-C213ojBY.js           0.32 kB │ gzip:   0.20 kB
      dist/assets/send-BFFenwgn.js                0.39 kB │ gzip:   0.28 kB
      dist/assets/trash-2-C_q0TMxf.js             0.45 kB │ gzip:   0.28 kB
      dist/assets/rolldown-runtime-C0FnF6B9.js    1.29 kB │ gzip:   0.71 kB
      dist/assets/useMutation-BI1NhGys.js         2.29 kB │ gzip:   0.96 kB
      dist/assets/Skeleton-C1LK9v7H.js            3.52 kB │ gzip:   0.81 kB
      dist/assets/notifyPrefs-Dyi62kkF.js         3.69 kB │ gzip:   1.69 kB
      dist/assets/LoginPage-CZCUgy0G.js           6.95 kB │ gzip:   2.51 kB
      dist/assets/ContactsPage-LNEO9zoU.js       11.79 kB │ gzip:   3.47 kB
      dist/assets/RulesPage-BUDymrND.js          15.11 kB │ gzip:   5.12 kB
      dist/assets/StatsPage-CSockIRT.js          15.12 kB │ gzip:   4.48 kB
      dist/assets/authStore-YG3n38kh.js          16.48 kB │ gzip:   6.05 kB
      dist/assets/CalendarPage-D3L6F4YJ.js       42.56 kB │ gzip:  10.23 kB
      dist/assets/RunNowDialog-CL-PUYHw.js       49.65 kB │ gzip:  16.08 kB
      dist/assets/PreferencesPage-ChqidaqF.js    61.71 kB │ gzip:  16.88 kB
      dist/assets/api-6RXiv-kh.js                87.79 kB │ gzip:  29.06 kB
      dist/assets/jszip.min-gms7YGF-.js          95.96 kB │ gzip:  28.50 kB
      dist/assets/MailPage-BJz05HdE.js          255.83 kB │ gzip:  73.66 kB
      dist/assets/lib-B2hRtwez.js               294.68 kB │ gzip:  89.71 kB
      dist/assets/index-Qt_qXqDz.js             421.87 kB │ gzip: 135.48 kB
      dist/assets/xlsx-BivLitlN.js              424.08 kB │ gzip: 141.36 kB

      ✓ built in 421ms
    at: "2026-10-29T04:37:15Z"
    tree: bcc2c3e83c588e3a1801ac14b7fea3ec6b814a1e5b67bc45d7954b83977ebe58
  commits:
    - 5b4d0cb
  acceptance:
    total: 3
    done: 3
---

## Objective
Ganti input type=date native di form Auto-Reply Cuti dengan date picker kustom (popover kalender Indonesia, pilih rentang mulai-selesai, keyboard accessible, mode gelap/terang, mobile friendly).

## Acceptance criteria
- [x] Given form Auto-Reply Cuti, when user klik field tanggal, then muncul kalender popover berbahasa Indonesia untuk memilih rentang mulai-selesai
- [x] Given tanggal dipilih via picker, when disimpan, then nilai tersimpan sama seperti sebelumnya (format YYYY-MM-DD → epoch lokal) dan validasi tetap jalan
- [x] Given keyboard saja, when navigasi picker, then tanggal bisa dipilih dengan panah/Enter dan Esc menutup

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm test && npm run build` → exit 0 at 2026-10-29T04:37:15Z (31951 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 5b4d0cb
