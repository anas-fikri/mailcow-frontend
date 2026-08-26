# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T14:06:36Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Fitur edit/hapus SATU occurrence event berulang (SOGo 5) selesai — kontrak recurrence DIVERSIFIKASI dari source, bukan tebakan: (1) eventsblocks mengirim c_recurrence_id per baris occurrence = unix detik start (all-day: GMT midnight); (2) path occurrence SOGo 5 = Calendar/{cal}/{uid}/occurence{unixSec}/view
- Why: save|delete — server resolve via SOGoCalendarComponent.lookupName (hasPrefix 'occurence' + substringFromIndex:9 = intValue), bukan field recurrence_id di body; (3) save occurrence = exception RECURRENCE-ID (repeat WAJIB null di payload — mengirim repeat justru mengubah pola SERI); (4) delete occurrence = EXDATE di master (SOGoComponentOccurence.prepareDelete); (5) tanpa segmen occurrence, save/delete menyentuh SELURUH seri. Pelajaran: kontrak API pihak ketiga harus diverifikasi dari source client+server (UI SOGo 5.12.10 Component.service.js/Resource.service.js + file .m server) + diuji runtime (mock fetch memverifikasi URL occurence{ts} dan body tanpa repeat), bukan hanya assertion statis string. 146 a11y assertions, 55/55 PASS.|Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
