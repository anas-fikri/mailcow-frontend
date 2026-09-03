import { pathSegment } from './pathSegment.js';
import { readStorage, persistNormalized } from './storageMigrate.js';
import DOMPurify from 'dompurify';
import { PURIFY_CONFIG } from './pasteUtils.js';
import { getMessageTotal } from './messageTotals.js';
import { parseMessageRows } from './messageRows.js';
import { parseContactRow } from './contactUtils.js';
import { parseCalendarEvents } from './calendarEvents.js';
import { buildMessageSearchBody, buildMessageViewBody } from './messageRequests.js';
import { extractLoginErrorMessage, isLoginSuccessResponse, isUnsupportedLoginFormat } from './loginDiagnostics.js';
import { flattenMailboxes } from './mailboxTree.js';
import { bumpDomainVersion } from './crossTab.js';

const SOGO_ENV = import.meta.env || {};
// Same-origin secara default (relatif) — SPA & SOGo dilayani nginx yang sama
// (mailcow mem-proxy /SOGo utk semua vhost: mail.pcpexpress.co.id DAN
// mail.pcpexpress.com). Base absolut (.co.id) dulu membuat fetch cross-origin
// saat app dibuka via .com → diblokir CORS + CSP connect-src 'self' →
// "NetworkError when attempting to fetch resource". VITE_SOGO_BASE_URL tetap
// dihormati bila di-set eksplisit (mis. SPA di origin terpisah).
const SOGO_BASE = SOGO_ENV.VITE_SOGO_BASE_URL || '';
const isDev = !!SOGO_ENV.DEV;
const debugLog = (...args) => isDev && console.log(...args);
const debugWarn = (...args) => isDev && console.warn(...args);

// ─── API Key untuk backend proxy ────────────────────────────────────────────────
// Digunakan oleh /api/* endpoints. Ambil dari env, fallback kosong = skip header.
const API_KEY = SOGO_ENV.VITE_API_KEY || '';
function withApiKey(headers = {}) {
  if (!API_KEY) return headers;
  return { ...headers, 'X-Api-Key': API_KEY };
}

// ─── Session expiry callback ──────────────────────────────────────────────────
// Dipanggil oleh throwApiError saat mendapatkan 401/403.
// Di-set oleh App.jsx saat mount.
let _onSessionExpired = null;
let _sessionExpiredFired = false; // debounce agar hanya fire sekali per session
let _loginGraceUntil = 0; // selama grace period, 403 tidak langsung kick ke login
export function onSessionExpired(cb) { _onSessionExpired = cb; }
export function resetSessionExpiredFlag() { _sessionExpiredFired = false; }
export function markLoginGrace(ms = 8000) { _loginGraceUntil = Date.now() + ms; }

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// fetch dengan deadline keras. Tanpa ini, backend lambat/down membuat fetch
// menggantung tanpa batas — login nampak "Memproses..." selamanya dan user
// tidak pernah dapat pesan error. AbortError diubah jadi error jaringan yang
// ramah (status 0 = network-level, bukan HTTP).
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      const e = new Error('Koneksi ke server email terputus (timeout). Periksa koneksi lalu coba lagi.');
      e.status = 0;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── XSRF helper ──────────────────────────────────────────────────────────────
// SOGo mensyaratkan header X-XSRF-TOKEN (dibaca dari cookie XSRF-TOKEN) agar
// endpoint /view dan lainnya dapat mengembalikan JSON 200 (bukan 500).
function getXsrfToken() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/** Headers standar untuk request SOGo */
function sogoHeaders(extra = {}) {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest', // wajib agar SOGo return JSON bukan HTML
    ...extra,
  };
  const xsrf = getXsrfToken();
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
  return headers;
}

/**
 * Buat Error dengan status code ter-attach.
 * Digunakan agar QueryClient retry logic bisa cek status.
 * Jika 401/403, panggil session expired callback.
 */
function throwApiError(message, status) {
  const err = new Error(message);
  err.status = status;
  const inGrace = Date.now() < _loginGraceUntil;
  // 403 segera setelah login sering race/session warm-up — jangan kick dulu
  if ((status === 401 || (status === 403 && !inGrace)) && _onSessionExpired && !_sessionExpiredFired) {
    _sessionExpiredFired = true; // prevent multiple triggers
    // Panggil di microtask agar tidak konflik dengan React state updates
    setTimeout(() => _onSessionExpired(), 0);
  }
  throw err;
}

function throwIfAuthError(res) {
  if (res.status === 401 || res.status === 403) {
    throwApiError('Sesi berakhir, silakan login ulang.', res.status);
  }
}

/**
 * Parse JSON dari response dengan aman.
 * Jika SOGo mengembalikan HTML karena session expired, throw 401.
 */
async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json') || ct.includes('text/json')) {
    try {
      return await res.json();
    } catch (e) {
      throwApiError('Respons server tidak dapat dibaca.', res.status);
    }
  }

  // Bukan JSON — baca teks untuk diagnosis
  const text = await res.text().catch(() => '');

  // Keep diagnostics metadata-only; response bodies may contain mailbox content.
  debugWarn('[API] Non-JSON response:', res.status, ct || 'unknown content type');

  // Jika status 4xx → session/auth error
  if (res.status === 401 || res.status === 403) {
    throwApiError('Sesi berakhir, silakan login ulang.', res.status);
  }

  // Cek apakah SOGo mengembalikan halaman login (LoginController adalah marker paling akurat)
  // SOGo selalu return LoginController jika session tidak valid/expired
  const isLoginPage = text.includes('LoginController') || text.includes('sg-login') ||
    (text.includes('userName') && text.includes('password') && text.includes('connect'));
  if (isLoginPage) {
    throwApiError('Sesi berakhir, silakan login ulang.', 401);
  }

  // Periksa apakah XSRF-TOKEN cookie ada — jika tidak, SOGo mungkin return HTML
  const xsrf = getXsrfToken();
  debugWarn('[API] XSRF-TOKEN present:', !!xsrf);

  // Jika response adalah HTML tapi BUKAN login page, kemungkinan error lain
  const isHtml = ct.includes('text/html') || text.trim().startsWith('<!');
  if (isHtml) {
    // SOGo mengembalikan halaman HTML yang tidak dikenali — mungkin error 500 atau maintenance
    throwApiError(`Respons server tidak valid (${res.status}). Coba refresh halaman.`, res.status);
  }

  throwApiError(`Respons server tidak valid (${res.status}). Coba refresh halaman.`, res.status);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Warm-up session SOGo setelah /connect.
 * Native SOGo UI melewati shell /so/{user} dan /Mail/view sebelum mailbox API.
 * HTML shell yang sah wajib diterima. Mailbox /Mail/0/view dicek untuk bukti
 * autentikasi, tetapi HTTP 5xx (server error seperti bug IMAP hierarchy SOGo)
 * pada shell maupun mailbox tidak menggagalkan warmup — session tetap dianggap
 * valid oleh /connect. 401/403 tetap memblokir login.
 */
function isLoginPageMarkup(text) {
  const markup = String(text || '');
  return markup.includes('LoginController') || markup.includes('sg-login') ||
    markup.includes('/SOGo/connect') || markup.includes('name="userName"') ||
    markup.includes('name="password"') ||
    (markup.includes('userName') && markup.includes('password') && markup.includes('connect'));
}

async function warmUpSogoSession(sogoToken) {
  const tokenPath = pathSegment(sogoToken, 'sogoToken');
  const shellPaths = [
    `${SOGO_BASE}/SOGo/so/${tokenPath}`,
    `${SOGO_BASE}/SOGo/so/${tokenPath}/Mail/view`,
  ];

  // Prime the same HTML shell routes used by native SOGo. Do not require JSON
  // here: SOGo versions legitimately return authenticated HTML documents.
  //
  // Only 401/403 are hard blockers (session truly invalid). All other status
  // codes — including 5xx, HTML responses, and network errors — are logged
  // but do not prevent login. The /SOGo/connect 200 already proves the
  // session is valid.
  for (const url of shellPaths) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: sogoHeaders({ Accept: 'text/html,application/json,*/*' }),
        redirect: 'follow',
      });      const contentType = res.headers.get('content-type') || '';
      // Debug-only: URL path berisi sogoToken (session token) — jangan pernah
      // di-log di produksi. Logging token ke console = info disclosure ringan.
      debugLog('[Login] warm-up shell →', res.status, contentType || 'unknown');
      if (res.status === 401 || res.status === 403) {
        debugWarn('[Login] warm-up shell auth rejected — session invalid');
        return false;
      }
    } catch (err) {
      debugWarn('[Login] warm-up shell fetch error:', err?.message || err);
      // Network errors are not auth failures — continue.
    }
  }

  // Mailbox /Mail/0/view as final proof of authentication.
  // 401/403 remain hard blockers. Everything else is allowed through.
  try {
    const res = await fetch(`${SOGO_BASE}/SOGo/so/${tokenPath}/Mail/0/view`, {
      method: 'GET',
      credentials: 'include',
      headers: sogoHeaders({ Accept: 'application/json' }),
      redirect: 'follow',
    });
    const contentType = res.headers.get('content-type') || '';
    debugLog('[Login] warm-up mailbox →', res.status, contentType || 'unknown');


    if (res.status === 401 || res.status === 403) {
      debugWarn('[Login] warm-up mailbox auth rejected — session invalid');
      return false;
    }
    // Any other response (200, 500, HTML, empty, whatever) — session is valid,
    // SOGo /connect already proved it. Let the mailbox page surface errors.
  } catch (err) {
    debugWarn('[Login] warm-up mailbox fetch error:', err?.message || err);
    // Network errors are not auth failures.
  }

  // Allow the browser to process Set-Cookie before the first authenticated query.
  if (!getXsrfToken()) await sleep(50);
  return true;
}

async function readLoginResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json') || contentType.includes('text/json');
  // Read once so an empty body is detectable even when Content-Type is JSON.
  const text = await res.text().catch(() => '');
  const trimmed = text.trim();
  if (isJson && trimmed) {
    try {
      return { data: JSON.parse(trimmed), isJson: true, isEmpty: false, isHtml: false };
    } catch {
      return { data: {}, isJson: false, isEmpty: false, isHtml: false };
    }
  }
  // Do not expose the body; only retain a safe policy marker.
  return {
    data: trimmed.includes('LDAPPasswordPolicyError') ? { message: 'LDAPPasswordPolicyError' } : {},
    isJson,
    isEmpty: !trimmed,
    isHtml: contentType.includes('text/html') || /<\/?(html|!doctype)/i.test(trimmed),
  };
}

async function connectSogo(email, password, encoding = 'form') {
  const body = encoding === 'form'
    ? new URLSearchParams({ userName: email, password }).toString()
    : JSON.stringify({ userName: email, password });
  const contentType = encoding === 'form'
    ? 'application/x-www-form-urlencoded'
    : 'application/json';

  return fetchWithTimeout(`${SOGO_BASE}/SOGo/connect`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': contentType,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/plain, */*',
    },
    body,
    redirect: 'manual',
  }, 20000);
}

export async function login(email, password) {
  // Bersihkan session lama agar ganti akun tidak bawa cookie user sebelumnya.
  try {
    await fetch(`${SOGO_BASE}/SOGo/logoff`, {
      method: 'POST',
      credentials: 'include',
      headers: sogoHeaders(),
    });
  } catch {
    // logoff sering 500 tapi cookie tetap ter-clear sebagian
  }

  // SOGo 5.12.3 expects JSON for /SOGo/connect. Older versions used form encoding.
  // Try JSON first; fall back to form-encoded if server explicitly rejects the format.
  let res = await connectSogo(email, password, 'json');
  let response = await readLoginResponse(res);
  if (!isLoginSuccessResponse(res, response) && isUnsupportedLoginFormat(res.status, response.data)) {
    res = await connectSogo(email, password, 'form');
    response = await readLoginResponse(res);
  }

  if (!isLoginSuccessResponse(res, response)) {
    const error = new Error(extractLoginErrorMessage(response.data, res.status));
    error.status = res.status;
    throw error;
  }

  // SOGo returns email/username as the token identifier for API paths.
  const data = response.data;
  const sogoToken = data.username || email;

  debugLog('[Login] SOGo authentication response accepted | XSRF present:', !!getXsrfToken());

  const sessionReady = await warmUpSogoSession(sogoToken);
  if (!sessionReady) {
    const error = new Error('Sesi SOGo tidak terbentuk. Periksa cookie browser, proxy, atau status akun lalu coba lagi.');
    error.status = 401;
    throw error;
  }
  markLoginGrace(8000);
  resetSessionExpiredFlag();

  debugLog('[Login] session ready | XSRF present:', !!getXsrfToken());

  return { sogoToken, cn: data.cn || email, email };
}


export async function logout() {
  try {
    await fetch(`${SOGO_BASE}/SOGo/logoff`, {
    method: 'POST',
      credentials: 'include',
      headers: sogoHeaders(),
  });
  } catch {
    // ignore
  }
  await revokeSmtpSession();
}

// ─── Mailer ───────────────────────────────────────────────────────────────────

export async function fetchFolders(sogoToken) {
  debugLog('[DEBUG] fetchFolders START');

  const maxAttempts = 3;
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/view`, {
          method: 'GET',
          credentials: 'include',
          headers: sogoHeaders(),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        debugLog('[DEBUG] fetchFolders res received, status:', res.status, 'ct:', res.headers.get('content-type'), 'attempt:', attempt);

        // 403 segera setelah login = session belum ready → warm-up ulang + retry
        if (res.status === 403 && attempt < maxAttempts) {
          debugWarn('[DEBUG] fetchFolders 403 — warm-up + retry');
          await warmUpSogoSession(sogoToken);
          await sleep(200 * attempt);
          continue;
        }

        if (!res.ok) throwApiError('Gagal memuat folder.', res.status);
        debugLog('[DEBUG] fetchFolders reading safeJson...');
        const data = await safeJson(res);
        debugLog('[DEBUG] fetchFolders data parsed successfully');

        if (!data || !data.mailboxes) {
          throwApiError('Respons server tidak lengkap (Folder tidak ditemukan).', res.status);
        }
        return flattenMailboxes(data.mailboxes);
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throwApiError('Gagal memuat folder.', 403);
  } catch (err) {
    console.error('[API] fetchFolders ERROR:', err?.message || err);
    throw err;
  }
}

export async function getUnseenCount(sogoToken, folder = 'folderINBOX') {
  try {
    const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/view`, {
      credentials: 'include',
      headers: sogoHeaders(),
  });
    throwIfAuthError(res);
    if (!res.ok) return { unseenCount: 0 };
    const data = await safeJson(res);
    return { unseenCount: data?.unseenCount || 0 };
  } catch (err) {
    if (err?.status === 401 || err?.status === 403) throw err;
    return { unseenCount: 0 };
  }
}

/**
 * Fetch daftar pesan dari folder.
 * Returns { messages: [{uid, from, to, subject, date, isRead, hasAtt}], unseenCount, total }
 */
export async function fetchMessages(sogoToken, folder = 'folderINBOX', params = {}) {
  debugLog('[DEBUG] fetchMessages START', folder);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const body = buildMessageViewBody(params);
      const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/view`, {
        method: 'POST',
        credentials: 'include',
        headers: sogoHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      debugLog('[DEBUG] fetchMessages res status:', res.status);

    // 204 No Content = folder kosong (valid, bukan error)
    if (res.status === 204) return { messages: [], unseenCount: 0, total: 0 };
    if (!res.ok) throwApiError(`Gagal memuat daftar pesan (${res.status}).`, res.status);

    const data = await safeJson(res);
    let messages = parseMessageRows(data);

    // Tandai folder asal utk klasifikasi kategori (spam/promo/sosial/update)
    for (const m of messages) m.folderId = folder;

    // Sort descending by uid (terbaru duluan)
    messages.sort((a, b) => b.uid - a.uid);

    // Client-side search filter (subject dinormalisasi string di parseMessageRow,
    // tapi String() defensif untuk input non-string dari sumber lain)
    if (params.search) {
      const q = params.search.toLowerCase();
      messages = messages.filter(m =>
        String(m.subject || '').toLowerCase().includes(q) ||
        String(m.from || '').toLowerCase().includes(q) ||
        String(m.to || '').toLowerCase().includes(q)
      );
    }

    return {
      messages,
      unseenCount: data.unseenCount || 0,
      total: getMessageTotal(data, messages.length),
      // Daftar UID lengkap (urut terbaru) — dipakai utk pagination server-side.
      // SOGo /view hanya mem-prefetch ~100 header (headersPrefetchMaxSize);
      // sisanya diambil bertahap via /headers.
      uids: Array.isArray(data.uids) ? data.uids : null,
    };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.error('[API] fetchMessages ERROR:', err?.message || err);
    throw err;
  }
}

/**
 * Ambil header untuk UID tertentu — endpoint lazy-load SOGo (native frontend
 * memanggilnya saat scroll untuk memuat header di luar prefetch awal 100).
 *
 * POST /Mail/0/{folder}/headers  body { uids: [...] }
 * Response = array [columnNames, ...rows] — sama dengan field `headers` di /view,
 * jadi bisa langsung di-parse parseMessageRows.
 *
 * @param {string} sogoToken
 * @param {string} folder
 * @param {Array<number|string>} uids
 * @returns {Promise<Array>} baris pesan ter-parse
 */
export async function fetchMessageHeaders(sogoToken, folder, uids) {
  if (!Array.isArray(uids) || uids.length === 0) return [];
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/headers`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uids }),
  });
  if (res.status === 204) return [];
  throwIfAuthError(res);
  if (!res.ok) throwApiError(`Gagal memuat header pesan (${res.status}).`, res.status);
  const data = await safeJson(res);
  // /headers membalas array bare [columnNames, ...rows] (bukan { headers: [...] }).
  const messages = parseMessageRows({ headers: data });
  for (const m of messages) m.folderId = folder;
  return messages;
}

/**
 * Fetch isi satu pesan.
 *
 * Response format (SOGo v5+):
 * {
 *   from: [{name, email}],  to: [{name, email}],
 *   subject, date, isRead,
 *   parts: {
 *     type: "UIxMailPartAlternativeViewer",
 *     content: [
 *       { contentType: "text/plain", content: "..." },
 *       { contentType: "text/html",  content: "..." },
 *       // attachments have: filename, downloadURL, size, contentType
 *     ],
 *     preferredPart: "text/html"
 *   }
 * }
 */
export async function fetchMessage(sogoToken, folder, uid) {
  // Bug fix: retry on transient 500 errors (SOGo偶尔overwhelmed)
  const MAX_RETRIES = 2;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/${pathSegment(uid, 'uid')}/view`, {
        credentials: 'include',
        headers: sogoHeaders(),
      });
      if (res.status === 500 && attempt < MAX_RETRIES) {
        debugWarn('[API] fetchMessage 500 — retry', attempt);
        await sleep(300 * attempt);
        continue;
      }
      if (!res.ok) throwApiError(`Gagal memuat isi pesan (${res.status}).`, res.status);
      return safeJson(res);
    } catch (err) {
      if (attempt < MAX_RETRIES && (err?.status === 500 || !err?.status)) {
        debugWarn('[API] fetchMessage error — retry', attempt, err?.message);
        await sleep(300 * attempt);
        continue;
      }
      throw err;
    }
  }
  throwApiError('Gagal memuat isi pesan setelah beberapa percobaan.', 500);
}

export async function markRead(sogoToken, folder, uid, read = true) {
  const endpoint = read ? 'markMessageRead' : 'markMessageUnread';
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/${pathSegment(uid, 'uid')}/${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: '{}',
  });
  if (!res.ok) throwApiError(`Gagal menandai pesan (${res.status}).`, res.status);
  bumpMailVersion(sogoToken);
}

export async function markFlagged(sogoToken, folder, uid, flagged = true) {
  const endpoint = flagged ? 'markFlagged' : 'markUnflagged';
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/${pathSegment(uid, 'uid')}/${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: '{}',
  });
  if (!res.ok) throwApiError(`Gagal mengubah tanda bintang (${res.status}).`, res.status);
  bumpMailVersion(sogoToken);
}

// ─── Search ───────────────────────────────────────────────────────────────────
/**
 * Search messages — SOGo v5 search via folder view dengan `filters`
 * (endpoint /search tidak ada → 404; diverifikasi dari Mailbox.service.js).
 * POST /Mail/0/{folder}/view  body: { sortingAttributes, filters }
 * criteria: "all", "from", "to", "subject", "body"
 */
export async function searchMessages(sogoToken, folder, query, criteria = 'all') {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/view`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(buildMessageSearchBody(query, criteria)),
  });
  if (res.status === 204) return { messages: [], total: 0 };
  if (!res.ok) throwApiError('Gagal mencari pesan.', res.status);
  const data = await safeJson(res);
  const messages = parseMessageRows(data);
  for (const m of messages) m.folderId = folder;
  messages.sort((a, b) => b.uid - a.uid);
  return { messages, total: messages.length };
}

// ─── Cross-tab sync domain 'mail' ────────────────────────────────────────────
// Mutasi mailbox (delete/move/flag/read/junk/folder/kirim) di tab A harus
// terlihat di tab B: bump versi domain 'mail' → tab lain yang memasang
// watchDomainVersion('mail') ikut invalidate → refetch. Dipanggil DI LAYER API
// (bukan di tiap halaman) agar semua jalur mutasi tercakup, termasuk RulesPage
// (auto-archive) dan ComposeModal. Fire-and-forget: gagal localStorage tidak
// boleh menggagalkan mutasi yang sudah sukses di SOGo.
// @param {string} sogoToken - sekaligus identifier akun (sama dgn email user,
//   sesuai kontrak login: sogoToken = username/email) yang di-scope crossTab.
function bumpMailVersion(sogoToken) {
  try {
    bumpDomainVersion('mail', sogoToken);
  } catch { /* quota/privasi — abaikan */ }
}

export async function deleteMessages(sogoToken, folder, uids) {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/batchDelete`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uids }),
  });
  if (!res.ok) throwApiError(`Gagal menghapus pesan (${res.status}).`, res.status);
  bumpMailVersion(sogoToken);
}

/**
 * Convert a relative folder path to a SOGo absolute CSS identifier path.
 * Ground truth (SoObjects/Mailer/SOGoMailFolder.m → moveUIDs:toFolder:):
 * SOGo memecah destination `folder` by '/' → ["", accountName, folder...]
 * dan MEMBANDINGKAN accountName dengan nameInContainer akun sumber.
 * Untuk akun utama, nameInContainer = "0" (indeks akun, BUKAN email).
 * Kirim email di sini → SOGo anggap cross-account →
 *   500 {"message":"Cannot copy messages to other account."}
 *
 * Format benar:
 *   "Archive"   → "/0/folderArchive"
 *   "INBOX/Sub" → "/0/folderINBOX/folderSub"
 *
 * @param {string} accountId  - TIDAK dipakai untuk path tujuan (kompat API lama);
 *                              akun sumber selalu "Mail/0" pada SPA ini.
 * @param {string} folderPath - relative path like "Archive" or "INBOX/Sub"
 * @returns {string} absolute path like "/0/folderArchive"
 */
function toSogoAbsPath(_accountId, folderPath) {
  const cssId = folderPath
    .split('/')
    .filter(Boolean)
    .map((c) => 'folder' + c)
    .join('/');
  return '/0/' + cssId;
}

/**
 * Pindahkan pesan antar folder (endpoint SOGo v5: moveMessages).
 * `targetFolder` = objek folder hasil flattenMailboxes ATAU string id (mis. "folderArchive").
 * SOGo v5 mengharapkan body `folder` = path absolut (mis. "/email@domain.com/folderArchive").
 *
 * Penting: UIDs harus INTEGER (bukan string). SOGo backend reject kalau uids string.
 */
export async function moveMessages(sogoToken, folder, uids, targetFolder) {
  const accountId = pathSegment(sogoToken, 'sogoToken');

  // Resolve relative folder path from targetFolder (object or string)
  let folderPath;
  if (typeof targetFolder === 'string') {
    // Could be "folderArchive" (id) or "Archive" (path) or URL-encoded
    const decoded = decodeURIComponent(targetFolder);
    folderPath = decoded.startsWith('folder')
      ? decoded.replace(/^folder/, '')
      : decoded;
  } else {
    folderPath = targetFolder?.path || targetFolder?.name || '';
  }

  // If folderPath is still empty, fail explicitly
  if (!folderPath) {
    throw new Error('Target folder tidak ditemukan — pastikan folder tersedia.');
  }

  const absPath = toSogoAbsPath(accountId, folderPath);

  // Pastikan UIDs selalu integer — SOGo reject kalau uids berisi string.
  const intUids = uids.map((u) => {
    const n = typeof u === 'number' ? u : parseInt(String(u), 10);
    if (Number.isNaN(n) || n <= 0) {
      console.warn('[moveMessages] invalid uid skipped:', u);
    }
    return n;
  }).filter((n) => !Number.isNaN(n) && n > 0);

  if (intUids.length === 0) {
    throw new Error('Tidak ada pesan valid untuk dipindahkan.');
  }

  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/moveMessages`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uids: intUids, folder: absPath }),
  });
  if (!res.ok) {
    // Tangkap response body utk debugging — SOGo sering return detail error di body.
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    const msg = detail
      ? `Gagal memindahkan pesan (${res.status}): ${detail.slice(0, 200)}`
      : `Gagal memindahkan pesan (${res.status}).`;

    // Diagnostik tambahan: SOGo kadang return 500 "Cannot copy messages to other account"
    // kalau target path meminta operasi antar-akun (cross-account IMAP copy yang tidak
    // di-support oleh endpoint moveMessages SOGo v5).
    if (detail.includes('Cannot copy messages to other account')) {
      console.warn('[moveMessages] SOGo menolak karena target cross-account:', absPath);
    }
    throwApiError(msg, res.status);
  }
  bumpMailVersion(sogoToken);
}

// ─── Folder management (subfolder) ───────────────────────────────────────────
// Ground truth dari UIxMailFolderActions.m (SOGo v5, deployed == master):
//   POST /so/{user}/Mail/0/{parentFolder}/createFolder  body {"name": "..."} → 204 / 500 {message}
//   POST /so/{user}/Mail/0/{folder}/delete              body {"withoutTrash": true} → 204

/** Buat subfolder baru di bawah parentFolder (id SOGo, mis. "folderINBOX"). */
export async function createFolder(sogoToken, parentFolderId, name) {
  const safeName = String(name || '').trim();
  if (!safeName) throw new Error('Nama folder tidak boleh kosong.');
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(parentFolderId, 'folder', { allowEncodedSlash: true })}/createFolder`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: safeName }),
  });
  if (!res.ok) {
    // Tangkap response body — SOGo return {message} saat gagal (mis. nama duplikat).
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    const msg = detail
      ? `Gagal membuat folder (${res.status}): ${detail.slice(0, 200)}`
      : `Gagal membuat folder (${res.status}).`;
    throwApiError(msg, res.status);
  }
  bumpMailVersion(sogoToken);
}

/** Hapus folder SOGo secara permanen (tanpa pindah ke Sampah). */
export async function deleteFolder(sogoToken, folderId) {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folderId, 'folder', { allowEncodedSlash: true })}/delete`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ withoutTrash: true }),
  });
  if (!res.ok) throwApiError(`Gagal menghapus folder (${res.status}).`, res.status);
  bumpMailVersion(sogoToken);
}

// ─── Junk/Spam (native SOGo) ──────────────────────────────────────────────────
// Ground truth dari UIxMailFolderActions.m:
//   POST /Mail/0/{folder}/markMessagesAsJunk    body {"uids": [int]} → 204
//   POST /Mail/0/{folder}/markMessagesAsNotJunk  body {"uids": [int]} → 204
// Native lebih baik daripada move manual ke folder Junk — SOGo set flag Junk
// sekaligus memindahkan, sehingga klasifikasi spam berfungsi penuh.

/** Normalisasi UIDs ke integer (SOGo reject string uid). */
function normalizeUids(uids) {
  return (Array.isArray(uids) ? uids : [])
    .map((u) => {
      const n = typeof u === 'number' ? u : parseInt(String(u), 10);
      return Number.isNaN(n) || n <= 0 ? null : n;
    })
    .filter((n) => n !== null);
}

/** Tandai pesan sebagai spam (junk) — native SOGo. */
export async function markMessagesAsJunk(sogoToken, folder, uids) {
  const intUids = normalizeUids(uids);
  if (intUids.length === 0) throw new Error('Tidak ada pesan valid untuk ditandai spam.');
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/markMessagesAsJunk`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uids: intUids }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    const msg = detail
      ? `Gagal menandai spam (${res.status}): ${detail.slice(0, 200)}`
      : `Gagal menandai spam (${res.status}).`;
    throwApiError(msg, res.status);
  }
  bumpMailVersion(sogoToken);
}

/** Batalkan penandaan spam (bukan junk) — native SOGo. */
export async function markMessagesAsNotJunk(sogoToken, folder, uids) {
  const intUids = normalizeUids(uids);
  if (intUids.length === 0) throw new Error('Tidak ada pesan valid.');
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/${pathSegment(folder, 'folder', { allowEncodedSlash: true })}/markMessagesAsNotJunk`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uids: intUids }),
  });
  if (!res.ok) throwApiError(`Gagal membatalkan spam (${res.status}).`, res.status);
  bumpMailVersion(sogoToken);
}

/**
 * Kirim email via SOGo compose → save draft → send.
 *
 * Flow:
 * 1. GET  /Mail/0/compose                           → { draftId }
 * 2. POST /Mail/0/folderDrafts/{draftId}/save       (form-urlencoded) → { uid }
 * 3. POST /Mail/0/folderDrafts/{draftId}/send       (form-urlencoded)
 *    → jika 501, fallback ke /api/send (Nodemailer SMTP proxy)
 *
 * @param {string} sogoToken
 * @param {{ to, cc, bcc, subject, body, isHTML, from }} payload
 */
export async function revokeSmtpSession() {
  try {
    // Token sesi SMTP ada di cookie httpOnly — browser kirim otomatis (same-origin).
    await fetch('/api/auth/smtp', {
      method: 'DELETE',
      credentials: 'include',
      headers: withApiKey(),
    });
  } catch {} // fire-and-forget
}

/**
 * Ambil sisa sesi SMTP proxy dari server — dipakai header countdown timer.
 *
 * Return: { user, createdAt, lastUsed, maxAgeMs, idleMs, remainingMs }
 *   remainingMs = min(maxAge-remaining, idle-remaining) — sesi berakhir
 *                 begitu salah satu mencapai 0.
 *
 * 401 (atau 403 di luar login grace): sesi berakhir → picu _onSessionExpired
 * supaya App.jsx auto-logout seperti /api/send 401. Tidak untuk polling
 * yang jarang (≥30s); rate-limit server 30/menit cukup.
 */
export async function fetchSmtpSessionStatus() {
  const res = await fetch('/api/auth/smtp/status', {
    credentials: 'include',
    headers: withApiKey(),
  });
  // 401/403 = sesi SMTP berakhir/akun mismatch → trigger auto-logout.
  throwIfAuthError(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Gagal membaca status sesi (${res.status}).`);
  }
  const data = await res.json();
  // Defensive validation agar rendering tidak NaN/undefined.
  return {
    user: String(data?.user || ''),
    createdAt: Number(data?.createdAt) || 0,
    lastUsed: Number(data?.lastUsed) || 0,
    maxAgeMs: Number(data?.maxAgeMs) || 0,
    idleMs: Number(data?.idleMs) || 0,
    remainingMs: Number(data?.remainingMs) || 0,
  };
}

export async function registerSmtpSession(user, pass) {
  // Server menyimpan token sesi SMTP sebagai cookie httpOnly (Set-Cookie),
  // sehingga tidak ada token yang dikembalikan/di-pegang oleh JS.
  // Deadline 15s: backend SMTP yang hang (upstream mailcow lambat) tidak
  // boleh membuat tombol "Masuk" menggantung selamanya.
  const res = await fetchWithTimeout('/api/auth/smtp', {
    method: 'POST',
    credentials: 'include',
    headers: withApiKey({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ user, pass }),
  }, 15000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Gagal mendaftarkan sesi SMTP.');
  }
  return true;
}

/** Buat draft kosong baru — mengembalikan draftId SOGo. */
export async function createDraft(sogoToken) {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/compose`, {
    method: 'GET',
    credentials: 'include',
    headers: sogoHeaders(),
  });
  throwIfAuthError(res);
  if (!res.ok) throw new Error('Gagal membuat draft.');
  const data = await res.json().catch(() => ({}));
  if (!data?.draftId) throw new Error('Gagal membuat draft (respons tidak lengkap).');
  return data.draftId;
}

/**
 * Simpan konten draft. Dipakai autosave di ComposeModal.
 * @returns {string|null} uid draft di folder Draf (bila SOGo kembalikan)
 */
export async function saveDraft(sogoToken, draftId, payload) {
  const { to = '', cc = '', bcc = '', subject = '', body = '', isHTML = true, from = '' } = payload;
  const data = {
    subject,
    to: to ? to.split(',').map(s => s.trim()) : [],
    cc: cc ? cc.split(',').map(s => s.trim()) : [],
    bcc: bcc ? bcc.split(',').map(s => s.trim()) : [],
    replyTo: '',
    inReplyTo: '',
    references: '',
    text: body,
    isHTML,
    from,
  };
  const safeDraftId = pathSegment(draftId, 'draftId');
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/folderDrafts/${safeDraftId}/save`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
  throwIfAuthError(res);
  if (!res.ok) throw new Error(`Gagal menyimpan draft (${res.status}).`);
  const saved = await res.json().catch(() => ({}));
  return saved?.uid || null;
}

/** Hapus draft yang sudah tidak dipakai (mis. autosave yang berhasil dikirim). */
/**
 * Unduh konten lampiran dari SOGo → base64 (tanpa prefix data URI).
 * Dipakai merestorasi lampiran draft saat diedit: downloadURL (dari /view)
 * sudah memuat token sesi, jadi cukup fetch + credentials include.
 */
export async function fetchAttachmentData(downloadURL) {
  if (!downloadURL) return null;
  const url = String(downloadURL).startsWith('http')
    ? downloadURL
    : `${SOGO_BASE}${downloadURL}`;
  const res = await fetch(url, { credentials: 'include', headers: sogoHeaders() });
  throwIfAuthError(res);
  if (!res.ok) throw new Error(`Gagal mengunduh lampiran (${res.status}).`);
  const buf = await res.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000; // 32 KB — hindari stack overflow fromCharCode utk file besar
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function deleteDraft(sogoToken, uid) {
  if (!uid) return;
  try {
    const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/folderDrafts/batchDelete`, {
      method: 'POST',
      credentials: 'include',
      headers: sogoHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ uids: [uid] }),
    });
    throwIfAuthError(res);
  } catch { /* fire-and-forget */ }
}

export async function sendMessage(sogoToken, payload) {
  const { to, cc = '', bcc = '', subject = '', body = '', isHTML = true, from = '', attachments = [], sendAt } = payload;

  // Defense-in-depth sanitasi: body HTML SELALU melewati DOMPurify sebelum
  // dikirim — terlepas dari apa pun yang dipanggil (ComposeModal memang sudah
  // sanitize saat handleSend, tapi chokepoint ini menjamin pemanggil lain /
  // jalur masa depan tidak bisa mengirim HTML mentah). Konfigurasi sama dengan
  // editor (PURIFY_CONFIG) agar output tidak berubah untuk konten sah.
  // Guard isSupported: DOMPurify tanpa window (Node/test tanpa jsdom) tidak
  // punya sanitize — lewatkan apa adanya; di browser (satu-satunya tempat
  // sendMessage dipakai) sanitize selalu aktif.
  const safeBody = isHTML && DOMPurify?.isSupported ? DOMPurify.sanitize(body, PURIFY_CONFIG) : body;

  // Kirim Terjadwal / Undo Send TIDAK bisa lewat draft SOGo (SOGo tidak punya
  // konsep send-at; jalur draft → /send SOGo 501). Semua kirim dengan sendAt
  // (jadwal) WAJIB lewat proxy SMTP /api/send — server menahan di queue sampai
  // due (kredensial terenkripsi), jadi aman walau tab ditutup.
  const viaSmtp = (Array.isArray(attachments) && attachments.length > 0) || !!sendAt;
  if (viaSmtp) {
    const smtpRes = await fetch('/api/send', {
      method: 'POST',
      credentials: 'include',
      headers: withApiKey({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        to, cc, bcc, subject, body: safeBody, isHTML, from,
        ...(sendAt ? { sendAt: new Date(sendAt).toISOString() } : {}),
        attachments: attachments.map(a => ({
          filename: a.filename || a.name || 'attachment',
          contentType: a.contentType || a.type || 'application/octet-stream',
          data: a.data || a.dataBase64 || '',
        })),
      }),
    });
    // 401 = sesi SMTP proxy berakhir di server (cookie Max-Age 8h / idle 30m).
    // Fallback ke error toast saja bikin user "logged in tapi tidak bisa ngirim"
    // — lebih baik logout paksa lewat session-expired callback. 403 adalah
    // From mismatch (lihat server.js /api/send) — bukan sesi, jangan logout.
    if (smtpRes.status === 401) throwIfAuthError(smtpRes);
    if (!smtpRes.ok) {
      const err = await smtpRes.json().catch(() => ({}));
      throw new Error(err.message || `Gagal mengirim via SMTP (${smtpRes.status}).`);
    }
    bumpMailVersion(sogoToken);
    return smtpRes.json();
  }

  // 1. Buat draft baru
  const composeRes = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/compose`, {
    method: 'GET',
    credentials: 'include',
    headers: sogoHeaders(),
  });
  throwIfAuthError(composeRes);
  if (!composeRes.ok) throw new Error('Gagal membuat draft.');
  const { draftId } = await composeRes.json();

  // 2. Simpan konten draft (form-urlencoded)
  const payloadData = {
    subject,
    to: to ? to.split(',').map(s => s.trim()) : [],
    cc: cc ? cc.split(',').map(s => s.trim()) : [],
    bcc: bcc ? bcc.split(',').map(s => s.trim()) : [],
    replyTo: '',
    inReplyTo: '',
    references: '',
    text: safeBody,
    isHTML,
    from
  };

  // 2. Kirim email via SOGo (langsung tanpa save)
  const safeDraftId = pathSegment(draftId, 'draftId');
  const sendRes = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Mail/0/folderDrafts/${safeDraftId}/send`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payloadData),
  });

  throwIfAuthError(sendRes);
  if (sendRes.ok) {
    bumpMailVersion(sogoToken);
    return { ok: true };
  }

  // Fallback: SMTP proxy (workaround SOGo 501 — endpoint /send tidak
  // diimplementasikan). HANYA pada 501: status lain (400/422/500/502/dll)
  // berarti SOGo memproses tapi gagal/berhasil sebagian — fallback ke SMTP
  // berisiko kirim GANDA, jadi surface error-nya saja.
  if (sendRes.status !== 501) {
    throw new Error(`Gagal mengirim pesan (${sendRes.status}). Silakan coba lagi.`);
  }
  const smtpRes = await fetch('/api/send', {
    method: 'POST',
    credentials: 'include',
    headers: withApiKey({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ to, cc, bcc, subject, body: safeBody, isHTML, from, attachments }),
  });
  if (smtpRes.status === 401) throwIfAuthError(smtpRes);
  if (!smtpRes.ok) {
    const err = await smtpRes.json().catch(() => ({}));
    throw new Error(err.message || `Gagal mengirim via SMTP (${smtpRes.status}).`);
  }
  bumpMailVersion(sogoToken);
  return smtpRes.json();
}

// ─── Konfigurasi kirim (batas lampiran) ───────────────────────────────────────
// Dibaca dari server (env SMTP_MAX_ATTACHMENT_MB dll) agar validasi client
// sinkron dengan nilai backend & konfigurasi dashboard. Cache singkat per tab.
let _sendConfigCache = null;
let _sendConfigAt = 0;
export async function fetchSendConfig(force = false) {
  const now = Date.now();
  if (!force && _sendConfigCache && now - _sendConfigAt < 60_000) return _sendConfigCache;
  const res = await fetch('/api/send/config', { credentials: 'include', headers: withApiKey() });
  if (res.status === 401) throwIfAuthError(res);
  if (!res.ok) throw new Error(`Gagal memuat konfigurasi kirim (${res.status}).`);
  const data = await safeJson(res);
  _sendConfigCache = data;
  _sendConfigAt = now;
  return data;
}

// ─── Scheduled/undo send ──────────────────────────────────────────────────────
// Batal kirim yang masih ditahan di queue server (undo send / batalkan jadwal).
export async function undoScheduledSend(id) {
  if (!id) return;
  const res = await fetch('/api/send/undo', {
    method: 'POST',
    credentials: 'include',
    headers: withApiKey({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id }),
  });
  if (res.status === 401) throwIfAuthError(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Gagal membatalkan kiriman (${res.status}).`);
  }
  return res.json();
}

// Daftar kiriman terjadwal milik user (badge toolbar + panel cancel).
export async function getPendingSends() {
  const res = await fetch('/api/send/pending', { credentials: 'include', headers: withApiKey() });
  if (res.status === 401) throwIfAuthError(res);
  if (!res.ok) throw new Error(`Gagal memuat kiriman terjadwal (${res.status}).`);
  const data = await safeJson(res);
  return data?.items || [];
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

/**
 * SOGo Contacts/personal/view response:
 * {
 *   id: "personal",
 *   headers: [
 *     [colNames],   // index 0: column names
 *     [row1],       // index 1+: data rows
 *   ]
 * }
 * columns: hasPhoto, c_cn, c_screenname, c_uid, id, containerName, sourceID,
 *          c_component, c_sn, c_givenname, c_name, c_telephonenumber, fn,
 *          c_mail, emails, c_o
 *
 * GAL contacts punya containerName yang mengandung "GAL".
 * Personal contacts containerName = "personal".
 */
export async function fetchContacts(sogoToken) {
  try {
    const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Contacts/personal/view`, {
      method: 'GET',
      credentials: 'include',
      headers: sogoHeaders(),
  });
    throwIfAuthError(res);
    if (!res.ok) throwApiError('Gagal memuat kontak.', res.status);
    const data = await safeJson(res);

    const cols = data.headers?.[0] || [];
    const rows = data.headers?.slice(1) || [];

    return rows.map(row => parseContactRow(cols, row)).filter(Boolean);
  } catch (e) {
    // Auth failure harus propagate (biar session-expired UI jalan);
    // error lain juga propagate agar halaman menampilkan error, bukan state kosong palsu.
    throw e;
  }
}

export async function createContact(sogoToken, contactData) {
  // Kontrak SOGo (diverifikasi dari UI SOGo 5.12 live + source server):
  // server `lookupName` di SOGoContactGCSFolder hanya membuat objek baru bila
  // URL berakhiran `AsContact`/`AsList` — `POST .../Contacts/personal/new`
  // menghasilkan 404. Create yang benar: `POST .../Contacts/personal/_new_/
  // saveAsContact` dengan body JSON berisi `c_component: 'vcard'` + fields.
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Contacts/personal/_new_/saveAsContact`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ c_component: 'vcard', ...contactData }),
  });
  throwIfAuthError(res);
  if (!res.ok) throw new Error('Gagal menambah kontak.');
  return res.text();
}

export async function deleteContact(sogoToken, cardId) {
  // UI SOGo live memakai `Resource.remove` → GET {pid}/{uid}/delete
  // (bukan POST) — mengikuti kontrak yang dipakai produksi.
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Contacts/personal/${pathSegment(cardId, 'cardId')}/delete`, {
    method: 'GET',
    credentials: 'include',
    headers: sogoHeaders(),
  });
  throwIfAuthError(res);
  if (!res.ok) throw new Error('Gagal menghapus kontak.');
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

/**
 * SOGo Calendar eventsblocks endpoint:
 * GET /Calendar/eventsblocks?startDate={unix}&endDate={unix}
 *
 * Response: [{
 *   eventsFields: ["c_name","c_folder","calendarName","c_status","c_isopaque",
 *                  "c_title","c_startdate","startHour","c_enddate","c_location",
 *                  "c_isallday","c_classification","c_category","c_priority",
 *                  "c_partmails","c_partstates","c_owner","c_iscycle",
 *                  "c_nextalarm","c_recurrence_id","isException","viewable",
 *                  "editable","erasable","ownerIsOrganizer","c_description"],
 *   blocks: [row, row, ...]
 * }]
 */
/**
 * Create a new event GUID (SOGo returns a new unique ID).
 * GET /Calendar/{calendarId}/newguid
 *
 * Responsenya JSON `{"id": "<uid>"}` (beberapa versi SOGo balas plain string).
 */
async function newEventGuid(sogoToken, calendarId = 'personal') {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Calendar/${pathSegment(calendarId, 'calendarId')}/newguid`, {
    credentials: 'include',
    headers: sogoHeaders(),
  });
  throwIfAuthError(res);
  if (!res.ok) throw new Error('Gagal membuat ID event baru.');
  const data = await res.json();
  const id = (data && typeof data === 'object') ? (data.id || data.uid || data.name) : data;
  if (!id || typeof id !== 'string') throw new Error('Gagal membaca ID event dari server.');
  return id;
}

/**
 * Bangun payload appointment SOGo (field iCal, bukan kolom DB c_*).
 * Referensi: iCalEntityObject+SOGo.m `setAttributes:` membaca `summary`,
 * `location`, `comment`, `classification`, `attendees` (array), serta
 * iCalEvent+SOGo.m membaca `startDate`/`startTime`/`endDate`/`endTime`
 * dan `isAllDay`.
 */
/** Normalisasi classification ke string yang dikenali SOGo (public/private/confidential). */
function normalizeClassification(value) {
  if (value === 1 || value === '1') return 'private';
  if (value === 2 || value === '2') return 'confidential';
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (['public', 'private', 'confidential'].includes(v)) return v;
  }
  return 'public';
}

function buildAppointmentBody(event) {
  const attendees = (event.attendees || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ email, name: email, role: 'REQ-PARTICIPANT', partstat: 'NEEDS-ACTION' }));

  const body = {
    summary: event.title || '',
    location: event.location || '',
    comment: event.description || '',
    classification: normalizeClassification(event.classification),
    isAllDay: !!event.isAllDay,
    startDate: event.startDate || '',
    endDate: event.endDate || '',
  };
  if (!event.isAllDay) {
    body.startTime = event.startTime || '';
    body.endTime = event.endTime || '';
  }
  if (attendees.length > 0) body.attendees = attendees;
  // Recurrence (repeat) sesuai kontrak iCalRepeatableEntityObject+SOGo.m.
  if (event.repeat && typeof event.repeat === 'object') body.repeat = event.repeat;
  return body;
}

/**
 * Create a new calendar event.
 * POST /Calendar/{calendarId}/{eventId}/saveAsAppointment  (capital A — case-sensitive)
 *
 * @param {string} sogoToken
 * @param {object} event - { title, startDate, startTime, endDate, endTime, location, description, isAllDay, attendees }
 * @param {string} [calendarId] - defaults to 'personal'
 */
export async function createCalendarEvent(sogoToken, event, calendarId = 'personal') {
  // 1. Get a new GUID
  const eventId = await newEventGuid(sogoToken, calendarId);

  // 2. Save the event
  const res = await fetch(
    `${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Calendar/${pathSegment(calendarId, 'calendarId')}/${pathSegment(eventId, 'eventId')}/saveAsAppointment`,
    {
      method: 'POST',
      credentials: 'include',
      headers: sogoHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(buildAppointmentBody(event)),
    }
  );
  throwIfAuthError(res);
  if (!res.ok) throw new Error(`Gagal menyimpan event (${res.status}).`);
  return { id: eventId };
}

/**
 * Segment path occurrence utk event berulang (kontrak SOGo 5, diverifikasi
 * dari UI SOGo 5.12.10: Component.service.js + SOGoCalendarComponent.m):
 *
 *   POST /Calendar/{cal}/{uid}/occurence{unixSec}/save   → edit SATU occurrence
 *   GET  /Calendar/{cal}/{uid}/occurence{unixSec}/delete → hapus SATU occurrence
 *   GET  /Calendar/{cal}/{uid}/occurence{unixSec}/view   → detail SATU occurrence
 *
 * SOGoCalendarComponent.lookupName me-resolve segmen berprefix `occurence`
 * (hasPrefix + substringFromIndex:9), lalu [recID intValue] = unix detik
 * (c_recurrence_id dari eventsblocks). Tanpa segmen ini, save/delete/view
 * menyentuh SELURUH seri (semua occurrence berbagi satu UID).
 */
function occurrenceSegment(occurrenceId) {
  const n = Number(occurrenceId);
  return Number.isFinite(n) && n > 0 ? `occurence${n}` : '';
}

/**
 * Update an existing calendar event.
 * POST /Calendar/{calendarId}/{eventId}/save
 * (dengan occurrenceId → POST .../{eventId}/occurence{ts}/save = edit SATU
 * occurrence tanpa mengubah seri: server menciptakan detached occurrence /
 * exception dengan RECURRENCE-ID, master + RRULE tidak disentuh.)
 */
export async function updateCalendarEvent(sogoToken, eventId, event, calendarId = 'personal', occurrenceId = null) {
  const occ = occurrenceSegment(occurrenceId);
  const res = await fetch(
    `${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Calendar/${pathSegment(calendarId, 'calendarId')}/${pathSegment(eventId, 'eventId')}${occ ? '/' + occ : ''}/save`,
    {
      method: 'POST',
      credentials: 'include',
      headers: sogoHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(buildAppointmentBody(event)),
    }
  );
  throwIfAuthError(res);
  if (!res.ok) throw new Error(`Gagal memperbarui event (${res.status}).`);
  return { id: eventId };
}

/**
 * Delete a calendar event.
 * GET /Calendar/{calendarId}/{eventId}/delete
 * (dengan occurrenceId → GET .../{eventId}/occurence{ts}/delete = hapus SATU
 * occurrence: server menambah EXDATE ke master (prepareDelete) — bukan hapus
 * seluruh seri.)
 */
export async function deleteCalendarEvent(sogoToken, eventId, calendarId = 'personal', occurrenceId = null) {
  const occ = occurrenceSegment(occurrenceId);
  const res = await fetch(
    `${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Calendar/${pathSegment(calendarId, 'calendarId')}/${pathSegment(eventId, 'eventId')}${occ ? '/' + occ : ''}/delete`,
    {
      credentials: 'include',
      headers: sogoHeaders(),
    }
  );
  throwIfAuthError(res);
  if (!res.ok) throw new Error(`Gagal menghapus event (${res.status}).`);
  return true;
}

export async function fetchCalendarEvents(sogoToken, _calendarId = 'personal', start, end) {
  try {
    const query = new URLSearchParams({ startDate: start, endDate: end }).toString();
    const res = await fetch(
      `${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Calendar/eventsblocks?${query}`,
      { credentials: 'include', headers: sogoHeaders() }
    );
    throwIfAuthError(res);
    if (!res.ok) throwApiError('Gagal memuat kalender.', res.status);
    const raw = await safeJson(res);

    // raw = array of calendar objects, each has eventsFields + blocks.
    // Parser murni di src/lib/calendarEvents.js — termasuk dedup baris
    // duplikat (id+start+calendar) agar event yang sama tidak dirender 2x.
    return parseCalendarEvents(raw);
  } catch (err) {
    // Auth failure harus propagate (session-expired UI); error lain juga
    // propagate agar halaman menampilkan error, bukan kalender kosong palsu.
    throw err;
  }
}

// ─── Calendar detail (full content via /view) ────────────────────────────────

/**
 * Ambil detail lengkap event via GET /Calendar/{calendarId}/{eventId}/view.
 *
 * /view mengembalikan field iCal lengkap (iCalEntityObject+SOGo.m
 * `attributesInContext`): summary, location, comment, classification,
 * attendees (array {email,name,partstat,role}), startDate/endDate (string
 * ISO), isAllDay, dll — lebih lengkap dari `eventsblocks` (yang attendee-nya
 * berupa kolom c_partmails terpisah).
 */
export async function fetchCalendarEventDetail(sogoToken, eventId, calendarId = 'personal', occurrenceId = null) {
  const occ = occurrenceSegment(occurrenceId);
  const res = await fetch(
    `${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Calendar/${pathSegment(calendarId, 'calendarId')}/${pathSegment(eventId, 'eventId')}${occ ? '/' + occ : ''}/view`,
    { credentials: 'include', headers: sogoHeaders() }
  );
  throwIfAuthError(res);
  if (!res.ok) throwApiError('Gagal memuat detail event.', res.status);
  const d = await safeJson(res);

  const attendees = Array.isArray(d.attendees)
    ? d.attendees.map((a) => a?.email).filter(Boolean).join(', ')
    : '';

  // startDate/endDate = string ISO (ex: "2015-10-25T22:34:51+00:00").
  const toUnix = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Math.floor(v / 1000);
    const t = Date.parse(String(v));
    return Number.isNaN(t) ? null : Math.floor(t / 1000);
  };

  return {
    id: eventId,
    title: d.summary || '(Tanpa Judul)',
    location: d.location || '',
    description: d.comment || '',
    isAllDay: !!d.isAllDay,
    classification: normalizeClassification(d.classification),
    attendees,
    start: toUnix(d.startDate),
    end: toUnix(d.endDate),
    repeat: d.repeat || null,
    raw: d,
  };
}

// ─── Preferences ──────────────────────────────────────────────────────────────

/**
 * Change password via Mailcow SOGo.
 * SOGo change password endpoint: POST /Preferences/changePassword
 * (atau via Mailcow API jika SOGo tidak expose endpoint ini)
 */
export async function changePassword(sogoToken, oldPassword, newPassword) {
  const formData = new URLSearchParams({ oldPassword, newPassword, newPasswordConfirmation: newPassword });
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Preferences/changePassword`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: formData.toString(),
  });
  // SOGo returns 200 text/plain (empty) on success
  throwIfAuthError(res);
  if (res.status === 404) throw new Error('Fitur ganti password tidak tersedia di server ini.');
  if (!res.ok) throw new Error(`Gagal mengganti password (${res.status}).`);
  return true;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
// v1 legacy: `sogo_prefs_<email>` — dimigrasi sekali-jalan ke v2.
// readStorage/persistNormalized sudah di-import di bagian atas file.
const PREFS_BASE_KEY = 'sogo_prefs';
const LS_KEY = (email) => `sogo_prefs_v2_${email}`;

function savePrefsToLocal(email, prefs) {
  try {
    localStorage.setItem(LS_KEY(email), JSON.stringify(prefs));
  } catch {}
}

function loadPrefsFromLocal(email) {
  if (!email) return null;
  const { value: parsed, key: targetKey, version, fromLegacy } = readStorage(PREFS_BASE_KEY, email);
  if (parsed == null) return null;
  // Normalisasi bentuk: konsumen (DisplaySection/VacationSection/...)
  // membaca prefs.defaults.* dan prefs.settings — pastikan keduanya object
  // (data cache lama bisa berbentuk apa pun → jangan dioper mentah; bentuk
  // rusak dianggap "belum ada preferensi" = bentuk kosong valid).
  const normalized = (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    ? { defaults: {}, settings: {} }
    : {
        defaults: parsed.defaults && typeof parsed.defaults === 'object' ? parsed.defaults : {},
        settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
      };
  // Migrasi SEKALI-JALAN: bila bentuk tersimpan beda dari bentuk
  // ternormalisasi (non-object / key ekstra / defaults-settings rusak),
  // tulis balik agar baca berikutnya tidak mengulang normalisasi.
  persistNormalized(PREFS_BASE_KEY, email, parsed, normalized, { fromLegacy, key: targetKey, version });
  return normalized;
}

/**
 * Load preferences dari backend /api/preferences yang membaca langsung dari
 * database SOGo. SOGo tidak menyediakan REST JSON endpoint untuk GET preferences
 * (GET /Preferences/save selalu mengembalikan HTML, bukan JSON).
 *
 * Fallback berlapis:
 * 1. /api/preferences → baca dari MySQL via server.js
 * 2. localStorage (hasil save terakhir)
 * 3. null (komponen UI pakai default)
 *
 * @param {string} sogoToken - SOGo session token
 * @param {string} email     - email user (untuk query DB dan localStorage key)
 */
export async function fetchPreferences(sogoToken, email) {
  // Guard: jangan panggil API jika email tidak valid
  if (!email || !sogoToken) {
    debugWarn('[prefs] Skipped — email atau token tidak valid.');
    const local = loadPrefsFromLocal(email);
    return local || null;
  }

  // ─ Layer 1: Backend DB endpoint ─
  // Penting: 401/403 dari /api/* adalah masalah sesi SMTP proxy (token
  // hilang/expired), BUKAN sesi SOGo. Jangan picu session-expired / force
  // logout webmail — cukup lanjut ke fallback localStorage. Perbaiki isu
  // "reload halaman → /api/preferences 401 → user di-logout paksa".
  try {
    const url = `/api/preferences?email=${encodeURIComponent(email)}&t=${Date.now()}`;
    // Sesi SMTP ada di cookie httpOnly — dikirim otomatis (credentials: 'include').
    const headers = withApiKey();
    const res  = await fetch(url, { credentials: 'include', headers });
    if (res.status === 401 || res.status === 403) {
      debugWarn('[prefs] /api/preferences ditolak (', res.status, ') — sesi SMTP proxy tidak valid, pakai fallback.');
    } else if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (data && (data.defaults || data.settings)) {
          debugLog('[prefs] Loaded from DB via /api/preferences. Vacation.enabled =', data.defaults?.Vacation?.enabled);
          // Sync ke localStorage agar tersedia saat offline
          savePrefsToLocal(email, data);
          return data;
        }
      }
    }
  } catch (e) {
    // 401/403 dari /api/* bukan sinyal session-expired SOGo — fallback saja.
    debugWarn('[prefs] /api/preferences error:', e?.message || e);
  }

  // ─ Layer 2: localStorage ─
  const local = loadPrefsFromLocal(email);
  if (local) {
    debugLog('[prefs] Loaded from localStorage.');
    return local;
  }

  debugWarn('[prefs] No preferences found — using defaults.');
  return null;
}

/**
 * Save preferences ke SOGo via POST /Preferences/save.
 * Juga menyimpan ke localStorage agar fetchPreferences bisa baca balik.
 */
export async function savePreferences(sogoToken, prefs, email) {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${pathSegment(sogoToken, 'sogoToken')}/Preferences/save`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(prefs),
  });
  throwIfAuthError(res);
  if (!res.ok) throw new Error(`Gagal menyimpan preferensi (${res.status}).`);

  // Simpan ke localStorage sebagai cache
  if (email) savePrefsToLocal(email, prefs);

  return true;
}
