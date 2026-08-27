# Current Task

## 2026-08-27 — Fix login diagnostics + harden LDAPPasswordPolicyError detection

**Root cause bug:** SOGo mengembalikan `{"LDAPPasswordPolicyError": 65535}` (tanpa field `message`), tapi `extractLoginErrorMessage` hanya mengecek field `message/error/reason` → fallback ke "Login ditolak SOGo" yang tidak informatif.

**Fix:**
- `loginDiagnostics.js`: deteksi field `LDAPPasswordPolicyError` langsung dari response data (sebelum cek text). + `loginErrorAction()` → return action CTA untuk error type (password-change, inactive).
- `LoginPage.jsx`: simpan `errorObj`, render hint + tombol "Hubungi administrator" (mailto admin).
- SOGo: `SOGoPasswordChangeEnabled = YES` di host sogo.conf (persistent) + restart.

**Status:** 59/59 PASS, build OK, deploy live.
