---
id: T-9rsd
title: Banner peringatan keamanan terlalu besar & duplikat
status: done
profile: standard
profile_pinned: true
created: "2026-10-29T05:38:13Z"
updated: "2026-10-29T05:41:52Z"
closed: "2026-10-29T05:41:52Z"
created_by: claude-code
workers:
  - claude-code
branch: worktree-fix-dup-rules
base: 8cf3a42f6e13fc6a70f3152b992dc2b5d05f6966
paths:
  - deploy.sh
  - package.json
  - scripts/run-tests.mjs
  - scripts/test-a11y.mjs
  - scripts/test-contact-signature-edge.mjs
  - scripts/test-conv-sent.mjs
  - scripts/test-conversation-expand.mjs
  - scripts/test-conversation-toolbar-regression.mjs
  - scripts/test-date-range-picker.mjs
  - scripts/test-mark-read-sync.mjs
  - scripts/test-new-mail-detect.mjs
  - scripts/test-outlook-ux.mjs
  - scripts/test-phishing-detection.mjs
  - scripts/test-protected-folders.mjs
  - scripts/test-quick-rule.mjs
  - scripts/test-rule-address-suggest.mjs
  - scripts/test-search-flow.mjs
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
  - src/lib/conversations.js
  - src/lib/instanceLock.js
  - src/lib/mailToolbar.js
  - src/lib/mailboxTree.js
  - src/lib/newMail.js
  - src/lib/phishingDetection.js
  - src/lib/ruleAddressSuggest.js
  - src/lib/sendQueue.js
  - src/lib/sieveFilters.js
  - src/lib/signatureStore.js
  - src/lib/signatures.js
  - src/lib/userPrefs.js
  - src/lib/vacation.js
  - src/pages/MailPage.jsx
  - src/pages/PreferencesPage.jsx
  - src/pages/RulesPage.jsx
  - src/store/authStore.js
evidence:
  check:
    cmd: npm test && npm run build
    exit_code: 0
    duration_ms: 31649
    summary: |-
      … kB │ gzip:   0.65 kB
      dist/assets/index-DKusOOHF.css             89.77 kB │ gzip:  15.59 kB
      dist/assets/loader-circle-DSS7Hivk.js       0.13 kB │ gzip:   0.14 kB
      dist/assets/send-DeR1SXnZ.js                0.16 kB │ gzip:   0.15 kB
      dist/assets/clock-CojKr6Da.js               0.17 kB │ gzip:   0.16 kB
      dist/assets/chevron-right-Dz_2vShp.js       0.19 kB │ gzip:   0.17 kB
      dist/assets/copy-CqPw4kzX.js                0.22 kB │ gzip:   0.20 kB
      dist/assets/pencil-Cmo6yGSN.js              0.26 kB │ gzip:   0.22 kB
      dist/assets/inbox-D2sb9y6g.js               0.27 kB │ gzip:   0.22 kB
      dist/assets/file-text-CxhUSFJ9.js           0.32 kB │ gzip:   0.21 kB
      dist/assets/trash-2-BtAoZvCC.js             0.45 kB │ gzip:   0.28 kB
      dist/assets/rolldown-runtime-C0FnF6B9.js    1.29 kB │ gzip:   0.71 kB
      dist/assets/useMutation-C9_HGQBy.js         2.29 kB │ gzip:   0.96 kB
      dist/assets/Skeleton-JWz3KZWq.js            3.52 kB │ gzip:   0.82 kB
      dist/assets/notifyPrefs-D4K_SJSd.js         3.69 kB │ gzip:   1.70 kB
      dist/assets/LoginPage-BOkUcNHk.js           6.95 kB │ gzip:   2.51 kB
      dist/assets/ContactsPage-vWir4iSi.js       11.79 kB │ gzip:   3.47 kB
      dist/assets/RulesPage-ByARYgJ_.js          15.11 kB │ gzip:   5.11 kB
      dist/assets/StatsPage-BWqniVcM.js          15.16 kB │ gzip:   4.49 kB
      dist/assets/authStore-BiBbdLLY.js          16.66 kB │ gzip:   6.09 kB
      dist/assets/CalendarPage-B98W8RxC.js       42.56 kB │ gzip:  10.24 kB
      dist/assets/RunNowDialog-C1GfbxMC.js       50.66 kB │ gzip:  16.44 kB
      dist/assets/PreferencesPage-CEunkxLJ.js    62.12 kB │ gzip:  17.01 kB
      dist/assets/api-6RXiv-kh.js                87.79 kB │ gzip:  29.06 kB
      dist/assets/jszip.min-gms7YGF-.js          95.96 kB │ gzip:  28.50 kB
      dist/assets/MailPage-D4WC57Oo.js          260.59 kB │ gzip:  75.08 kB
      dist/assets/lib-B2hRtwez.js               294.68 kB │ gzip:  89.71 kB
      dist/assets/index-D8qGHGI-.js             421.90 kB │ gzip: 135.51 kB
      dist/assets/xlsx-BivLitlN.js              424.08 kB │ gzip: 141.36 kB

      ✓ built in 402ms
    at: "2026-10-29T05:41:38Z"
    tree: 0f27e1a3345efb37c90f04e1cea40401308a61a1ef03e6a6217b00d384d73209
  commits:
    - 918fd10
  acceptance:
    total: 3
    done: 3
---

## Objective
Ringkas banner Peringatan Keamanan di panel baca: dedupe temuan, satu baris ringkas default (bisa dibuka), tingkat keparahan (merah hanya utk risiko tinggi), bisa disembunyikan per pesan.

## Acceptance criteria
- [x] Banner peringatan ringkas 1 baris dgn Detail & sembunyikan
- [x] Temuan phishing dedupe per host; newsletter link pelacak tidak high
- [x] Regresi test + npm test & build lulus

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes

## Evidence
<!-- Generated by aitk close. -->
- Check: `npm test && npm run build` → exit 0 at 2026-10-29T05:41:38Z (31649 ms)
- Acceptance criteria: 3/3 satisfied
- Commits: 918fd10
