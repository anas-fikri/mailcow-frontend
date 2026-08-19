# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T15:21:04Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Ekstraksi fetch image proxy dari server.js ke src/lib/remoteImage.js (parseImageProxyUrl/resolveSafeAddresses/pinLookup/requestImageOnce/fetchRemoteImage) dgn opsi injectable timeoutMs/maxBytes/maxRedirects/resolve agar testable. Bonus bug fix DoS: branch remaining<=0 di requestImageOnce dulu destroy res tanpa settle promise → await hang selamanya; kini reject 504. Test DoS test:remote-image: (1) slow-drip 1 byte/50ms tanpa selesai → hard deadline potong 504 <3s (bukan hang), (2) happy path gambar valid sukses, (3) headers lewat deadline → reject 504. Resolver injectable bypass SSRF guard (127.0.0.1) utk test lokal. server.js kini import fetchRemoteImage; import dns/http/https/isBlockedIp dihapus. deploy.sh BACKEND_LIB_FILES += remoteImage.js. 28/28 test PASS + build OK.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 10 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
