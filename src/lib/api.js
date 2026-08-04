const SOGO_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_SOGO_BASE_URL || '');

// ─── API Key untuk backend proxy ────────────────────────────────────────────────
// Digunakan oleh /api/* endpoints. Ambil dari env, fallback kosong = skip header.
const API_KEY = import.meta.env.VITE_API_KEY || '';
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

  // Log response snippet untuk debugging
  const snippet = text.slice(0, 200).replace(/\s+/g, ' ').trim();
  console.warn('[API] Non-JSON response:', res.status, ct, snippet);

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
  console.warn('[API] XSRF-TOKEN present:', !!xsrf, '| URL:', res.url);

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
 * Native SOGo UI selalu lewat /so/{user}/Mail/view dulu baru /Mail/0/view.
 * Tanpa langkah ini, GET /Mail/0/view sering return 403 (session belum fully bound).
 */
async function warmUpSogoSession(sogoToken) {
  const paths = [
    `${SOGO_BASE}/SOGo/so/${sogoToken}`,
    `${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/view`,
  ];

  for (const url of paths) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: sogoHeaders({ Accept: 'text/html,application/json,*/*' }),
        redirect: 'follow',
    });
      console.log('[Login] warm-up', url.replace(SOGO_BASE, ''), '→', res.status);
      // body harus di-drain supaya connection/session settle
      await res.text().catch(() => '');
    } catch (err) {
      console.warn('[Login] warm-up failed (non-fatal):', err?.message || err);
    }
  }

  // Pastikan XSRF terbaca setelah Set-Cookie dari warm-up
  if (!getXsrfToken()) {
    await sleep(50);
  }
}

export async function login(email, password) {
  // Bersihkan session lama agar ganti akun tidak bawa cookie user sebelumnya
  try {
    await fetch(`${SOGO_BASE}/SOGo/logoff`, {
    method: 'POST',
      credentials: 'include',
      headers: sogoHeaders(),
  });
  } catch {
    // ignore — logoff sering 500 tapi cookie tetap ter-clear sebagian
  }

  const res = await fetch(`${SOGO_BASE}/SOGo/connect`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/plain, */*',
    },
    body: JSON.stringify({ userName: email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Login gagal (HTTP ${res.status})`);
  }

  // SOGo returns email/username as the token identifier for API paths.
  // XSRF-TOKEN cookie juga di-set oleh /SOGo/connect — digunakan di request berikutnya.
  const data = await res.json().catch(() => ({}));
  const sogoToken = data.username || email; // fallback ke email jika username tidak ada

  console.log('[Login] OK sogoToken:', sogoToken, '| XSRF present:', !!getXsrfToken());

  await warmUpSogoSession(sogoToken);
  markLoginGrace(8000);
  resetSessionExpiredFlag();

  console.log('[Login] session ready | XSRF present:', !!getXsrfToken());

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
}

// ─── Message Row Parser ────────────────────────────────────────────────────────
/**
 * SOGo fetchMessages response format:
 *   { headers: [colNames, ...rows], uids: [...], unseenCount, ... }
 *
 * colNames (headers[0]) = ["To","hasAttachment","isFlagged","Subject","From",
 *                          "isRead","Priority","RelativeDate","Size","Flags",
 *                          "uid","isAnswered","isForwarded"]
 * Field indexes:
 *   0  = To (array [{name,email}])
 *   1  = hasAttachment
 *   2  = isFlagged
 *   3  = Subject
 *   4  = From (array [{name,email}])
 *   5  = isRead
 *   6  = Priority
 *   7  = RelativeDate
 *   8  = Size
 *   9  = Flags
 *   10 = uid
 *   11 = isAnswered
 *   12 = isForwarded
 */
function parseMessageRow(row) {
  if (!row || !Array.isArray(row)) return null;
  const from  = row[4] || [];
  const toArr = row[0] || [];

  const fmtAddr = (arr) =>
    Array.isArray(arr) ? arr.map(a => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', ') : String(arr);

  return {
    uid:       row[10],
    from:      fmtAddr(from),
    to:        fmtAddr(toArr),
    subject:   row[3]  || '',
    date:      row[7]  || '',
    isRead:    !!row[5],
    hasAtt:    !!row[1],
    isFlagged: !!row[2],
  };
}

// ─── Mailer ───────────────────────────────────────────────────────────────────

export async function fetchFolders(sogoToken) {
  console.log('[DEBUG] fetchFolders START', sogoToken);


  function flattenMailboxes(mailboxes) {
    const result = [];
    for (const mb of mailboxes || []) {
      const path     = mb.path || mb.name;
      // SOGo folder URL path: "folder" + path (path tidak boleh mengandung "/")
      // Untuk subfolder pakai encode, tapi semua folder di test ini flat
      const folderId = 'folder' + path.replace(/\//g, '%2F');
      const type     = mb.type || 'folder';
      const label    = FOLDER_TYPE_LABELS[type] ?? mb.name;
      result.push({ id: folderId, label, type, path, name: mb.name });
      if (mb.children?.length) {
        result.push(...flattenMailboxes(mb.children));
      }
    }
    return result;
  }

  const maxAttempts = 3;
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/view`, {
        method: 'GET',
        credentials: 'include',
        headers: sogoHeaders(),
        signal: controller.signal,
    });
      clearTimeout(timeoutId);
      console.log('[DEBUG] fetchFolders res received, status:', res.status, 'ct:', res.headers.get('content-type'), 'attempt:', attempt);

      // 403 segera setelah login = session belum ready → warm-up ulang + retry
      if (res.status === 403 && attempt < maxAttempts) {
        console.warn('[DEBUG] fetchFolders 403 — warm-up + retry');
        await warmUpSogoSession(sogoToken);
        await sleep(200 * attempt);
        continue;
      }

      if (!res.ok) throwApiError('Gagal memuat folder.', res.status);
      console.log('[DEBUG] fetchFolders reading safeJson...');
      const data = await safeJson(res);
      console.log('[DEBUG] fetchFolders data parsed successfully');

      if (!data || !data.mailboxes) {
        throwApiError('Respons server tidak lengkap (Folder tidak ditemukan).', res.status);
      }
      return flattenMailboxes(data.mailboxes);
    }
    throwApiError('Gagal memuat folder.', 403);
  } catch (err) {
    console.error('[DEBUG] fetchFolders ERROR:', err);
    throw err;
  }
}

export async function getUnseenCount(sogoToken) {
  try {
    const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/folderINBOX/view`, {
      credentials: 'include',
      headers: sogoHeaders(),
  });
    if (!res.ok) return { unseenCount: 0 };
    const data = await res.json().catch(() => ({ unseenCount: 0 }));
    return { unseenCount: data.unseenCount || 0 };
  } catch {
    return { unseenCount: 0 };
  }
}

/**
 * Fetch daftar pesan dari folder.
 * Returns { messages: [{uid, from, to, subject, date, isRead, hasAtt}], unseenCount, total }
 */
export async function fetchMessages(sogoToken, folder = 'folderINBOX', params = {}) {
  console.log('[DEBUG] fetchMessages START', folder, sogoToken);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const body = { sortby: "date", asc: 0 };
    // Server-side pagination (SOGo supports limit/offset)
    if (params.limit) body.limit = params.limit;
    if (params.offset) body.offset = params.offset;
    const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/view`, {
    method: 'POST',
      credentials: 'include',
      headers: sogoHeaders({
        'Content-Type': 'application/json'
      }),
    body: JSON.stringify(body),
      signal: controller.signal,
  });
    clearTimeout(timeoutId);
    console.log('[DEBUG] fetchMessages res status:', res.status);

    // 204 No Content = folder kosong (valid, bukan error)
    if (res.status === 204) return { messages: [], unseenCount: 0, total: 0 };
    if (!res.ok) throwApiError(`Gagal memuat daftar pesan (${res.status}).`, res.status);

    const data = await safeJson(res);
    // headers[0] = column names row, data rows mulai dari index 1
    const rows = (data.headers || []).slice(1);

    let messages = rows.map(parseMessageRow).filter(Boolean);

    // Sort descending by uid (terbaru duluan)
    messages.sort((a, b) => b.uid - a.uid);

    // Client-side search filter
    if (params.search) {
      const q = params.search.toLowerCase();
      messages = messages.filter(m =>
        m.subject.toLowerCase().includes(q) ||
        m.from.toLowerCase().includes(q) ||
        m.to.toLowerCase().includes(q)
      );
    }

    return { messages, unseenCount: data.unseenCount || 0, total: messages.length };
  } catch (err) {
    console.error('[DEBUG] fetchMessages ERROR:', err);
    throw err;
  }
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
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/${uid}/view`, {
    credentials: 'include',
    headers: sogoHeaders(),
  });
  if (!res.ok) throwApiError(`Gagal memuat isi pesan (${res.status}).`, res.status);
  return safeJson(res);
}

export async function markRead(sogoToken, folder, uid, read = true) {
  const endpoint = read ? 'markMessageRead' : 'markMessageUnread';
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/${uid}/${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: '{}',
  });
  if (!res.ok) throwApiError(`Gagal menandai pesan (${res.status}).`, res.status);
}

export async function markFlagged(sogoToken, folder, uid, flagged = true) {
  const endpoint = flagged ? 'markFlagged' : 'markUnflagged';
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/${uid}/${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: '{}',
  });
  if (!res.ok) throwApiError(`Gagal mengubah tanda bintang (${res.status}).`, res.status);
}

// ─── Search ───────────────────────────────────────────────────────────────────
/**
 * Search messages via SOGo search endpoint.
 * POST /Mail/0/{folder}/search  body: { search, criteria }
 * criteria: "all", "from", "to", "subject", "body"
 */
export async function searchMessages(sogoToken, folder, query, criteria = 'all') {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/search`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ search: query, criteria }),
  });
  if (res.status === 204) return { messages: [], total: 0 };
  if (!res.ok) throwApiError('Gagal mencari pesan.', res.status);
  const data = await safeJson(res);
  const rows = (data.headers || []).slice(1);
  const messages = rows.map(parseMessageRow).filter(Boolean);
  messages.sort((a, b) => b.uid - a.uid);
  return { messages, total: messages.length };
}

export async function deleteMessages(sogoToken, folder, uids) {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/batchDelete`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uids }),
  });
  if (!res.ok) throwApiError(`Gagal menghapus pesan (${res.status}).`, res.status);
}

export async function moveMessages(sogoToken, folder, uids, targetFolder) {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/batchMoveToMailbox`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uids, mailbox: targetFolder }),
  });
  if (!res.ok) throwApiError(`Gagal memindahkan pesan (${res.status}).`, res.status);
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
 * @param {string|null} smtpToken  session token SMTP dari /api/auth/smtp
 */
export async function revokeSmtpSession(smtpToken) {
  if (!smtpToken) return;
  try {
    await fetch('/api/auth/smtp', {
      method: 'DELETE',
      headers: withApiKey({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ smtpToken }),
    });
  } catch {} // fire-and-forget
}

export async function registerSmtpSession(user, pass) {
  const res = await fetch('/api/auth/smtp', {
    method: 'POST',
    headers: withApiKey({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ user, pass }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Gagal mendaftarkan sesi SMTP.');
  }
  const data = await res.json();
  return data.token;  // UUID session token
}

export async function sendMessage(sogoToken, payload, smtpToken = null) {
  const { to, cc = '', bcc = '', subject = '', body = '', isHTML = true, from = '' } = payload;

  // 1. Buat draft baru
  const composeRes = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/compose`, {
    method: 'GET',
    credentials: 'include',
    headers: sogoHeaders(),
  });
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
    text: body,
    isHTML,
    from
  };

  // 2. Kirim email via SOGo (langsung tanpa save)
  const sendRes = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/folderDrafts/${draftId}/send`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payloadData),
  });

  if (sendRes.ok) return { ok: true };

  // Fallback: SMTP proxy (workaround SOGo 501)
  if (!smtpToken) {
    throw new Error('Email tidak dapat dikirim. SOGo mengembalikan 501. Silakan login ulang dan coba lagi.');
  }
  const smtpRes = await fetch('/api/send', {
    method: 'POST',
    headers: withApiKey({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ to, cc, bcc, subject, body, isHTML, from, smtpToken }),
  });
  if (!smtpRes.ok) {
    const err = await smtpRes.json().catch(() => ({}));
    throw new Error(err.message || `Gagal mengirim via SMTP (${smtpRes.status}).`);
  }
  return smtpRes.json();
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
    const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Contacts/personal/view`, {
      method: 'GET',
      credentials: 'include',
      headers: sogoHeaders(),
  });
    if (res.status === 401 || res.status === 403) throw new Error('Unauthenticated');
    if (!res.ok) return [];
    const data = await res.json();

    const cols = data.headers?.[0] || [];
    const rows = data.headers?.slice(1) || [];

    return rows.map(row => {
      const c = Object.fromEntries(cols.map((k, i) => [k, row[i]]));
      return {
        uid:       c.id    || c.c_uid || '',
        name:      c.c_cn  || c.fn   || c.c_uid || '',
        firstName: c.c_givenname || '',
        lastName:  c.c_sn  || '',
        email:     c.c_mail || (Array.isArray(c.emails) ? c.emails[0] : '') || '',
        phone:     c.c_telephonenumber || '',
        org:       c.c_o   || '',
        isGAL:     String(c.containerName || '').includes('GAL'),
        source:    c.sourceID || '',
      };
  });
  } catch (e) {
    if (e.message === 'Unauthenticated') throw e;
    return [];
  }
}

export async function createContact(sogoToken, contactData) {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Contacts/personal/new`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(contactData),
  });
  if (!res.ok) throw new Error('Gagal menambah kontak.');
  return res.text();
}

export async function deleteContact(sogoToken, cardId) {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Contacts/personal/${cardId}/delete`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders(),
  });
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
 */
async function newEventGuid(sogoToken, calendarId = 'personal') {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Calendar/${calendarId}/newguid`, {
    credentials: 'include',
    headers: sogoHeaders(),
  });
  if (!res.ok) throw new Error('Gagal membuat ID event baru.');
  const data = await res.json();
  return data.id || data;
}

/**
 * Create a new calendar event.
 * POST /Calendar/{calendarId}/{eventId}/saveAsappointment
 *
 * @param {string} sogoToken
 * @param {object} event - { title, startDate, startTime, endDate, endTime, location, description, isAllDay, attendees }
 * @param {string} [calendarId] - defaults to 'personal'
 */
export async function createCalendarEvent(sogoToken, event, calendarId = 'personal') {
  // 1. Get a new GUID
  const eventId = await newEventGuid(sogoToken, calendarId);

  // 2. Save the event
  const body = {
    c_title: event.title,
    startDate: event.startDate,
    startTime: event.startTime || '',
    endDate: event.endDate,
    endTime: event.endTime || '',
    c_location: event.location || '',
    c_description: event.description || '',
    c_isallday: !!event.isAllDay,
    c_partmails: event.attendees || '',
    c_partstates: event.attendees ? event.attendees.split(',').map(() => 'NEEDS-ACTION').join(',') : '',
    classification: 'public',
  };

  const res = await fetch(
    `${SOGO_BASE}/SOGo/so/${sogoToken}/Calendar/${calendarId}/${eventId}/saveAsappointment`,
    {
    method: 'POST',
      credentials: 'include',
      headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Gagal menyimpan event (${res.status}).`);
  return { id: eventId };
}

/**
 * Update an existing calendar event.
 * POST /Calendar/{calendarId}/{eventId}/save
 */
export async function updateCalendarEvent(sogoToken, eventId, event, calendarId = 'personal') {
  const body = {
    c_title: event.title,
    startDate: event.startDate,
    startTime: event.startTime || '',
    endDate: event.endDate,
    endTime: event.endTime || '',
    c_location: event.location || '',
    c_description: event.description || '',
    c_isallday: !!event.isAllDay,
    c_partmails: event.attendees || '',
    c_partstates: event.attendees ? event.attendees.split(',').map(() => 'NEEDS-ACTION').join(',') : '',
    classification: 'public',
  };

  const res = await fetch(
    `${SOGO_BASE}/SOGo/so/${sogoToken}/Calendar/${calendarId}/${eventId}/save`,
    {
    method: 'POST',
      credentials: 'include',
      headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Gagal memperbarui event (${res.status}).`);
  return { id: eventId };
}

/**
 * Delete a calendar event.
 * GET /Calendar/{calendarId}/{eventId}/delete
 */
export async function deleteCalendarEvent(sogoToken, eventId, calendarId = 'personal') {
  const res = await fetch(
    `${SOGO_BASE}/SOGo/so/${sogoToken}/Calendar/${calendarId}/${eventId}/delete`,
    {
      credentials: 'include',
      headers: sogoHeaders(),
    }
  );
  if (!res.ok) throw new Error(`Gagal menghapus event (${res.status}).`);
  return true;
}

export async function fetchCalendarEvents(sogoToken, _calendarId = 'personal', start, end) {
  try {
    const query = new URLSearchParams({ startDate: start, endDate: end }).toString();
    const res = await fetch(
      `${SOGO_BASE}/SOGo/so/${sogoToken}/Calendar/eventsblocks?${query}`,
      { credentials: 'include', headers: sogoHeaders() }
    );
    if (!res.ok) return [];
    const raw = await res.json();

    // raw = array of calendar objects, each has eventsFields + blocks
    const events = [];
    for (const cal of (Array.isArray(raw) ? raw : [])) {
      const fields = cal.eventsFields || [];
      for (const block of (cal.blocks || [])) {
        const ev = Object.fromEntries(fields.map((f, i) => [f, block[i]]));
        events.push({
          id:        ev.c_name || '',
          title:     ev.c_title || '(Tanpa Judul)',
          start:     ev.c_startdate,   // unix timestamp
          end:       ev.c_enddate,     // unix timestamp
          startHour: ev.startHour || '',
          location:  ev.c_location || '',
          isAllDay:  !!ev.c_isallday,
          calendar:  ev.calendarName || '',
          folder:    ev.c_folder || '',
          owner:     ev.c_owner || '',
          status:    ev.c_status,
          description: ev.c_description || '',
      });
      }
    }
    return events;
  } catch {
    return [];
  }
}

// ─── Preferences ──────────────────────────────────────────────────────────────

/**
 * Change password via Mailcow SOGo.
 * SOGo change password endpoint: POST /Preferences/changePassword
 * (atau via Mailcow API jika SOGo tidak expose endpoint ini)
 */
export async function changePassword(sogoToken, oldPassword, newPassword) {
  const formData = new URLSearchParams({ oldPassword, newPassword, newPasswordConfirmation: newPassword });
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Preferences/changePassword`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: formData.toString(),
  });
  // SOGo returns 200 text/plain (empty) on success
  if (res.status === 404) throw new Error('Fitur ganti password tidak tersedia di server ini.');
  if (!res.ok) throw new Error(`Gagal mengganti password (${res.status}).`);
  return true;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
const LS_KEY = (email) => `sogo_prefs_${email}`;

function savePrefsToLocal(email, prefs) {
  try {
    localStorage.setItem(LS_KEY(email), JSON.stringify(prefs));
  } catch {}
}

function loadPrefsFromLocal(email) {
  try {
    const raw = localStorage.getItem(LS_KEY(email));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
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
    console.warn('[prefs] Skipped — email atau token tidak valid.');
    const local = loadPrefsFromLocal(email);
    return local || null;
  }

  // ─ Layer 1: Backend DB endpoint ─
  try {
    const url = `/api/preferences?email=${encodeURIComponent(email)}&t=${Date.now()}`;
    const res  = await fetch(url, { credentials: 'include', headers: withApiKey() });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (data && (data.defaults || data.settings)) {
          console.log('[prefs] Loaded from DB via /api/preferences. Vacation.enabled =', data.defaults?.Vacation?.enabled);
          // Sync ke localStorage agar tersedia saat offline
          savePrefsToLocal(email, data);
          return data;
        }
      }
    }
  } catch (e) {
    console.warn('[prefs] /api/preferences error:', e.message);
  }

  // ─ Layer 2: localStorage ─
  const local = loadPrefsFromLocal(email);
  if (local) {
    console.log('[prefs] Loaded from localStorage. Vacation.enabled =', local.defaults?.Vacation?.enabled);
    return local;
  }

  console.warn('[prefs] No preferences found — using defaults.');
  return null;
}

/**
 * Save preferences ke SOGo via POST /Preferences/save.
 * Juga menyimpan ke localStorage agar fetchPreferences bisa baca balik.
 */
export async function savePreferences(sogoToken, prefs, email) {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Preferences/save`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error(`Gagal menyimpan preferensi (${res.status}).`);

  // Simpan ke localStorage sebagai cache
  if (email) savePrefsToLocal(email, prefs);

  return true;
}
