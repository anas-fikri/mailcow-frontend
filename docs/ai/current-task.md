# Current Task

Status: COMPLETED
Task ID: 20260912-SIG-CRASH-SUBSTRING
Updated At: 2026-09-12T00:00:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Diagnose production TypeError `r.substring is not a function` (MailPage-6eAqXrDW.js:48:2152)
dilaporkan sebagian user di https://mail.pcpexpress.com/webmail.

## Root Cause (terverifikasi dari bundle live, bukan tebakan)
- Crash di effect auto-inject signature `ComposeModal`:
  `sigHtml = (localSig?.html && !localSig?.placeholder) || prefs?.defaults?.SOGoMailSignature`.
  Karena `&&` lebih kuat dari `||`, user dengan signature lokal REAL membuat
  ekspresi bernilai boolean `true` → `sigHtml.substring(0, 80)` melempar TypeError.
- Regresi dari commit `e6a57e6` (2026-08-21, fitur placeholder legacy).
- "Sebagian user / lokasi berbeda" = ilusi; pemicunya per-account localStorage
  (`pcp_signatures_v2_<email>` berisi signature non-placeholder), bukan lokasi.
- Fallback `SOGoMailSignature` (DB/localStorage) juga tidak pernah dinormalisasi
  — hardening ditambahkan.

## Result
- `src/lib/signatures.js`: helper baru `resolveSignatureHtml(localSig, sogoHtml)`
  — SELALU return string (lokal non-placeholder menang, fallback SOGo dinormalisasi,
  non-string/whitespace → '').
- `src/components/mailer/ComposeModal.jsx`: pakai helper tsb; `enabled` kini
  `localSig ? !localSig.placeholder : prefsEnabled === '1'` (perilaku sama,
  tanpa boolean leak); `SignaturePicker.onInsert` di-guard `typeof === 'string'`.
- `src/pages/PreferencesPage.jsx`: `savedSogo` di-guard `typeof` sebelum `.trim()`.
- Regresi test di `scripts/test-signatures.mjs` (kontrak helper: 13 assertion baru,
  termasuk kasus crash produksi).
- Validasi: test:signatures PASS, test:contact-signature-edge 34 PASS,
  test:draft-compose 49 PASS, test:settings-signature PASS (build + puppeteer),
  build bersih. Bundle hasil build terverifikasi memuat guard
  (`typeof e != 'string'` + `r=me(t,Ge?.defaults?.SOGoMailSignature)`).

## Next
- DEPLOY diperlukan agar fix sampai ke user (di luar scope sesi ini —
  `SERVER=deploy-mail ./deploy.sh`).
