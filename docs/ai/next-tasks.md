# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-27T01:16:42Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Conversation view: grup dengan 1 pesan (email tunggal) jangan dirender sebagai header percakapan ala Outlook (avatar stack + badge count '1' + chevron) — render sebagai baris biasa via renderMessageRow(msg, -1, false); hanya grup >=2 pesan yang dapat header + thread line. Pola Gmail/Outlook: penanda percakapan hanya utk thread sungguhan. Logika grouping di lib murni conversations.js tidak perlu diubah — keputusan render cukup di MailPage (group.messages.length === 1). visibleOrderUids/range-select/auto-advance tidak terpengaruh karena key di SwipeableRow = msg.uid.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
