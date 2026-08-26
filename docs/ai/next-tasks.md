# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T16:06:47Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Kontrak SOGo kontak (diverifikasi source 5.12.10 + UI live): (1) create kontak = POST {pid}/_new_/saveAsContact + body c_component:'vcard' — server lookupName di SOGoContactGCSFolder hanya membuat objek baru bila URL berakhiran AsContact/AsList, jadi POST .../new → 404; (2) delete kontak = GET {pid}/{uid}/delete (Resource.remove UI SOGo), POST → POSTAction WebDAV-only → 500. Pola: jangan asumsi endpoint SOGo — unduh UI SOGo live dari server produksi (mail.pcpexpress.co.id/SOGo/WebServerResources/js/...) + source server lookupName untuk verifikasi kontrak.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
