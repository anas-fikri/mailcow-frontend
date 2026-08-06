# 03. Implementation Roadmap & Task Breakdown
*Dokumen ini menguraikan langkah-langkah teknis pengerjaan untuk setiap modul SOGo Frontend secara bertahap.*

## Phase 1: Core Foundation & Authentication (Sprint 1) — ✅ DONE
- [x] **Task 1.1:** Inisialisasi *project* React dengan Vite, Tailwind CSS v4, dan konfigurasi *routing* dasar (React Router).
- [x] **Task 1.2:** Setup *State Management* (Zustand) & *Data Fetching* (TanStack React Query).
- [x] **Task 1.3:** Desain & Implementasi UI Halaman Login (Mobile-First).
- [x] **Task 1.4:** Integrasi endpoint `POST /SOGo/connect`. Validasi sukses (simpan session cookie) & *handling error* (password salah).
- [x] **Task 1.5:** Buat *layout* utama aplikasi (*Sidebar*, *Top Navbar*, *Mobile Bottom Navigation*).

## Phase 2: Mailer Module — ✅ DONE (2026-07-21)

> **Catatan teknis SOGo API:**
> - `GET /Mail/0/{folder}/view` → `{ headers: [colNames, ...rows], unseenCount }`
> - `headers[0]` adalah row nama kolom, data mulai index 1. `uid = row[10]`, `subject = row[3]`, `from = row[4]`, `to = row[0]`, `date = row[7]`, `isRead = row[5]`
> - Single message: `GET /{uid}/view` → `{ from, to, subject, date, parts: { content: [...] } }`
> - Body HTML ada di `parts.content[].contentType === "text/html"`, bukan `body` tree
> - **SOGo `/send` mengembalikan 501** → workaround via Express+Nodemailer SMTP proxy (`server.js`)
> - Semua request butuh header `X-XSRF-TOKEN` dari cookie `XSRF-TOKEN`

- [x] **Task 2.1:** Implementasi *Mailbox List* (Tarik daftar folder: Inbox, Sent, Trash, Drafts, Junk).
- [x] **Task 2.2:** Tampilkan daftar email (`GET /SOGo/.../view`) dengan parsing format SOGo baru, search client-side, & UI *Skeleton Loader*.
- [x] **Task 2.3:** Implementasi *Email Reader* (`MessageReader.jsx`). Render HTML dari `parts.content[]`, sanitasi DOMPurify, tampilkan lampiran dengan download link.
- [x] **Task 2.4:** *Quick Actions*: *Mark as Read*, Hapus Email, Pindah Folder (Bulk actions toolbar).
- [x] **Task 2.5:** *Message Editor* (`ComposeModal.jsx`). Autocomplete kontak dari `Contacts/personal/view`, CC/BCC toggle, success state.
- [x] **Task 2.6:** Pengiriman email via `POST /save` (form-urlencoded) + fallback `/api/send` (Nodemailer SMTP proxy). Backend proxy `server.js` (Express, port 3001 lokal; port 3005 production). Vite proxy `/api` → `127.0.0.1:3001`.

**File yang dimodifikasi:**
- `src/lib/api.js` — parsing SOGo format, XSRF helper, sendMessage flow
- `src/pages/MailPage.jsx` — message list dengan data valid
- `src/components/mailer/MessageReader.jsx` — render dari parts.content[]
- `src/components/mailer/ComposeModal.jsx` — send dengan SMTP fallback
- `src/store/authStore.js` — smtpCreds memory store
- `src/pages/LoginPage.jsx` — setSmtpCreds setelah login
- `server.js` — Express+Nodemailer backend proxy
- `vite.config.js` — proxy /api ke port 3001
- `package.json` — scripts dev:server, dev:all

## Phase 3: Contacts Module (Sprint 4) — ✅ DONE (2026-07-21)

> **API:** `GET /Contacts/personal/view` → `{headers:[colNames,...rows]}`.
> Kolom: `hasPhoto, c_cn, c_uid, id, containerName, sourceID, c_sn, c_givenname, c_name, c_telephonenumber, fn, c_mail, emails, c_o`
> GAL contacts: `containerName` contains `"GAL"`. 55 contacts total (semua GAL pcpexpress.co.id).

- [x] **Task 3.1:** Tampilkan daftar kontak (GAL + Personal) dengan filter tabs.
- [x] **Task 3.2:** Real-time search + detail panel (klik kontak → lihat detail).
- [x] **Task 3.3:** Form tambah kontak baru (Nama, Email, Telepon).
- [x] **Task 3.4:** Hapus kontak personal (GAL tidak bisa dihapus).

## Phase 4: Scheduler / Calendar Module (Sprint 5) — ✅ DONE (2026-07-21)

> **API:** `GET /Calendar/eventsblocks?startDate={unix}&endDate={unix}`
> Response: `[{eventsFields:[...], blocks:[...]}]`
> Fields: `c_name, c_folder, calendarName, c_status, c_title, c_startdate, startHour, c_enddate, c_location, c_isallday, c_description, ...`

- [x] **Task 4.1:** Calendar grid month view dengan navigasi bulan.
- [x] **Task 4.2:** Fetch events dari `eventsblocks` endpoint, tampilkan di grid.
- [x] **Task 4.3:** Side panel acara harian + popup detail event.
- [x] **Task 4.4:** Color coding per kalender.

## Phase 5: Preferences & Polish (Sprint 6) — ✅ DONE (2026-07-21)

> **API:** `POST /Preferences/save` → `{defaults:{...}, settings:{...}}`
> Returns 200 text/plain (empty) on success.
> Change password: `POST /Preferences/changePassword` (form-urlencoded).

- [x] **Task 5.1:** Ganti Password (dengan update smtpCreds memory).
- [x] **Task 5.2:** Signature Email (simpan via Preferences/save).
- [x] **Task 5.3:** Auto-Reply/Vacation (toggle + tanggal + pesan).
- [ ] **Task 5.4:** Final QA, Mobile Testing, bundle optimization.

## Phase 6: UI Enhancement & Migration Portal (2026-08-05/06) — ✅ DONE
- [x] **Task 6.1:** Theme color picker (8 presets via CSS `var(--theme-hue)`)
- [x] **Task 6.2:** Inbox sort + conversation view persisted per-account (survives logout)
- [x] **Task 6.3:** SOGo mail preferences: compose mode, reply placement, confirm delete
- [x] **Task 6.4:** StatsPage icon consistency (flat lucide-react)
- [x] **Task 6.5:** Migration Portal auth: bcryptjs verify against Mailcow admin table
- [x] **Task 6.6:** Migration Portal: auto-create mailbox + sync password + imapsync

## Phase 7: Security Audit & Hardening (2026-08-06) — ✅ DONE
- [x] **Task 7.1:** Fix deploy.sh GitLab token leak (ps aux) → GIT_TOKEN env var
- [x] **Task 7.2:** Fix ErrorBoundary error details exposed in production → DEV guard
- [x] **Task 7.3:** Fix api.js 15+ debug/Login/PII logs in production → debugLog wrapper
- [x] **Task 7.4:** Verify server.js, safeUrl.js, pathSegment.js, nginx CSP, XSRF → all safe
- [x] **Task 7.5:** Deploy at b8cde7d (webmail HTTP 200 verified)

## Deployment status — 2026-08-06
- [x] Security audit deploy: b8cde7d → webmail HTTP 200 verified.
- [x] Theme color + inbox prefs deploy: 565c8fe → webmail HTTP 200 verified.
- [x] Round 3 production deploy: proxy port corrected to 3005, service activated, frontend/Nginx config deployed, security headers verified.
- [ ] Local rebuild evidence: install dependencies (`npm install`) and rerun `npm run build` in any workspace without `node_modules`.
- [ ] Rotate the previously exposed webmail password and optionally scrub Git history.
