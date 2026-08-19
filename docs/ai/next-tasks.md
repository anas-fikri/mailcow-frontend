# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T15:15:17Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Hardening paste-XSS + anti tabnabbing pada webmail: PURIFY_CONFIG.ALLOWED_URI_REGEXP mengizinkan data: (utk img base64 composer) tapi DOMPurify tidak membedakan per-atribut, sehingga <a href="data:text/html,..."> dari paste lolos sanitasi (phishing payload). Fix: hook DOMPurify afterSanitizeAttributes hardenAnchorNode(node) — hapus data: href pada <a> + paksa rel=noopener noreferrer pada <a target=_blank> (anti tabnabbing window.opener). Hook dipasang sekali di pasteUtils.js (import oleh MessageReader/HtmlEditor/ComposeModal) sehingga berlaku utk render email + editor. DOMPurify TIDAK bisa jalan di Node/linkedom (linkedom tanpa document.implementation → isSupported false → sanitize no-op), jadi test murni ke logic hardenAnchorNode via linkedom + mock addHook utk registerPurifyHardening. 27/27 test PASS + build OK. deploy.sh BACKEND_LIB_FILES += smtpCookie.js (ikut commit ini).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 9 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
