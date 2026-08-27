# Current Task: Fix compose crash (React error #310)

## Status: ✅ DEPLOYED

## Root Causes Found & Fixed

### Bug 1: React error #310 — "Rendered fewer hooks than expected"
- `renderMessageRow` is a plain function (not a React component) called via `.map()` in JSX
- Had `React.useMemo` inside it → counts as hooks of parent MailPage component
- Changing message count = changing hook count = React #310 crash
- **Fix**: Replace `useMemo` with lightweight inline computation

### Bug 2: nginx MIME type — sw.js served as application/octet-stream
- `types{application/manifest+json webmanifest} + default_type application/octet-stream`
- Applied to sw.js AND theme-init.js → browsers refuse to register service worker
- Old cached JS (MailPage-DVvbjdE0.js) never cleared → `r.substring is not a function`
- **Fix**: Split into separate location blocks; .js files get auto-detected `application/javascript`

### Bug 3: Defensive .substring guards
- `phishingDetection.js` had `raw.substring(0, 60)` without `String()` wrapper
- **Fix**: `String(raw || '').substring(0, 60)`

## Deployed
- Commit: `ec0fce3`
- SW v4 active
- All nginx config updated
- 59/60 tests pass
