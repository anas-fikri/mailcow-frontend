# Current Task

Status: COMPLETED
Task ID: 20260922-105739-174098
Started At: 2026-09-22T10:57:39Z
Updated At: 2026-09-22T11:06:21Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
20260922-ATTACH-REGRESSION: lampiran hilang + gambar CID footer masuk daftar lampiran (regresi restore 08bef9c)

## Goal Link
Goal ID: TBD
Sub-goal ID: TBD

## Files Involved
- src/lib/messageHtml.js — extractHtml/extractAttachments
- src/components/mailer/MessageReader.jsx — extractInlineImages, seksi Gambar, formatFileSize
- scripts/test-message-html.mjs — regresi

## Next Steps
- Fix extract di messageHtml.js (guard array + hormati shouldDisplayAttachment)
- Fix MessageReader (inline images, seksi Gambar, formatFileSize lib)
- Test regresi + suite + build

## Risk Analysis
- Status: DONE
- Risk level: LOW-MEDIUM (render path read-only, tidak ada mutasi data)
- Impact surface: MessageReader render (lampiran/gambar), tidak menyentuh compose/send/backend
- Security concerns: flag shouldDisplayAttachment diabaikan utk part text/*; URL tetap lewat toSafeUrl; tidak ada sink baru
- Compatibility concerns: parts-as-object (fixture golden) & parts-as-array (bug 19 Agu) tetap didukung; flag false dipakai utk SEMUA tipe (kontrak SOGo, diverifikasi Message.service.js:464)
- Failure modes/edge cases: (1) parts array → guard Array.isArray di TOP; (2) part teks dengan flag 0 → tidak masuk lampiran; (3) flag hilang (undefined) → tetap lampiran, perilaku lama; (4) lampiran PDF+CID footer → PDF tampil, footer tidak dobel
- Mitigations: test regresi shape array + flag CID; fixture golden tetap jadi gate
- Validation plan: test:message-html, test-mail-golden, test:attachments, test:a11y (seksi Gambar), test:security-hardening, build
- Open risks/assumptions: None

## Risks
- Regresi fase draft: extractAttachments draft-followup memakai flag c1 — sudah dicek konsisten (c1 && isInline), test:attachments sebagai gate.

## Validation
- Risk analysis: REQUIRED
- Tests/checks: Not run
