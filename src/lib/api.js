const SOGO_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_SOGO_BASE_URL || '');

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
  return {
    Accept: 'application/json',
    'X-XSRF-TOKEN': getXsrfToken(),
    ...extra,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email, password) {
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

  // SOGo 5.12+ returns encrypted session token as 'username' (bukan email).
  // Kita pake email langsung dari form login aja.
  const data = await res.json().catch(() => ({}));
  return { sogoToken: email, cn: data.cn || email, email };
}

export async function logout() {
  await fetch(`${SOGO_BASE}/SOGo/logoff`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders(),
  });
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
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/view`, {
    credentials: 'include',
    headers: sogoHeaders(),
  });
  if (!res.ok) throw new Error('Gagal memuat folder.');
  const data = await res.json();

  const FOLDER_TYPE_LABELS = {
    inbox:     'Kotak Masuk',
    draft:     'Draf',
    sent:      'Terkirim',
    trash:     'Sampah',
    junk:      'Junk/Spam',
    templates: 'Templates',
    folder:    null, // pakai nama folder apa adanya
  };

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

  return flattenMailboxes(data.mailboxes);
}

export async function getUnseenCount(sogoToken) {
  try {
    const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/folderINBOX/view`, {
      credentials: 'include',
      headers: sogoHeaders(),
    });
    if (!res.ok) return { unseenCount: 0 };
    const data = await res.json();
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
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/view`, {
    method: 'GET',
    credentials: 'include',
    headers: sogoHeaders(),
  });

  // 204 No Content = folder kosong (valid, bukan error)
  if (res.status === 204) return { messages: [], unseenCount: 0, total: 0 };
  if (!res.ok) throw new Error(`Gagal memuat pesan (${res.status}).`);

  const data = await res.json();
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
  if (!res.ok) throw new Error(`Gagal memuat pesan (${res.status}).`);
  return res.json();
}

export async function markRead(sogoToken, folder, uid, read = true) {
  const endpoint = read ? 'markMessageRead' : 'markMessageUnread';
  await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/${uid}/${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: '{}',
  });
}

export async function deleteMessages(sogoToken, folder, uids) {
  await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/batchDelete`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uids }),
  });
}

export async function moveMessages(sogoToken, folder, uids, targetFolder) {
  await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/${folder}/batchMoveToMailbox`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uids, mailbox: targetFolder }),
  });
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
 * @param {{ user, pass }|null} smtpCreds  credential SMTP untuk fallback
 */
export async function sendMessage(sogoToken, payload, smtpCreds = null) {
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
  const formData = new URLSearchParams({ subject, to, cc, bcc, replyTo: '', inReplyTo: '', references: '', text: body, isHTML: isHTML ? '1' : '0', from });

  const saveRes = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/folderDrafts/${draftId}/save`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: formData.toString(),
  });
  if (!saveRes.ok) throw new Error('Gagal menyimpan draft.');

  // 3. Kirim draft via SOGo
  const sendRes = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Mail/0/folderDrafts/${draftId}/send`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: formData.toString(),
  });

  if (sendRes.ok) return { ok: true };

  // Fallback: SMTP proxy (workaround SOGo 501)
  if (!smtpCreds?.user || !smtpCreds?.pass) {
    throw new Error('Email tidak dapat dikirim. SOGo mengembalikan 501. Silakan login ulang dan coba lagi.');
  }
  const smtpRes = await fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, cc, bcc, subject, body, isHTML, from, smtpUser: smtpCreds.user, smtpPass: smtpCreds.pass }),
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

/**
 * Save preferences ke SOGo.
 * POST /Preferences/save dengan JSON body.
 */
export async function savePreferences(sogoToken, prefs) {
  const res = await fetch(`${SOGO_BASE}/SOGo/so/${sogoToken}/Preferences/save`, {
    method: 'POST',
    credentials: 'include',
    headers: sogoHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error(`Gagal menyimpan preferensi (${res.status}).`);
  return true;
}
