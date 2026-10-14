---
id: T-hcrr
title: 'Webmail: weekly repeat day picker + hari kerja saja'
status: done
profile: standard
goal: G-001
created: "2026-08-20T11:12:41Z"
updated: "2026-08-20T11:12:56Z"
legacy:
  source: docs/ai/tasks/20260820-114411-136241.previous.md
  status: COMPLETED
  v1_id: 20260820-111241-959627
---

## Objective
Webmail: weekly repeat day picker + hari kerja saja

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-010 (kalender)

## Files Involved
- src/components/EventModal.jsx — pilihan hari (Sen..Min) + tombol "Hari kerja saja" untuk weekly
- scripts/test-calendar-api.mjs — assert repeat.days dikirim ke body

## Next Steps
- ai-close + commit + push + deploy

## Risks
- Kontrak `repeat.days` harus array `[{day:'MO'}]` (iCalByDayMask byDayMaskWithDaysAndOccurrences)

## Validation
- 20/20 test PASS · npm run build ✅
