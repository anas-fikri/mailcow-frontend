/**
 * Aturan server (Sieve) — model UI ⇄ format filter SOGo, validasi, dan
 * pencocokan client-side utk "Jalankan sekarang". MURNI (tanpa DOM/fetch)
 * supaya bisa dites di Node.
 *
 * ── Format SOGo (user default `SOGoSieveFilters`, array; urutan = prioritas) ─
 *   { name, active: 1|0, match: 'all'|'any'|'allmessages',
 *     rules:   [{ field, operator, value, custom_header? }],
 *     actions: [{ method, argument? }] }
 *
 * Diverifikasi dari JS UI SOGo yang ter-deploy (Preferences.js di
 * mail.pcpexpress.co.id, FiltersDialogController + addMailFilter):
 *   - filter baru  = { match: 'all', active: 1 } lalu di-push ke
 *     defaults.SOGoSieveFilters; rule baru = { field: 'subject', operator: 'contains' }
 *   - field   : subject | from | to | cc | to_or_cc | size | header (+ body bila
 *               server punya capability "body")
 *   - operator teks: is | is_not | contains | contains_not | matches | matches_not
 *               (+ regex | regex_not bila capability "regex")
 *   - operator ukuran: under | over  (label UI SOGo: "Size (Kb)" → nilai dalam KB)
 *   - method  : fileinto | addflag | stop | keep | discard | redirect | notify | reject
 *   - addflag argumen label "$labelN" disimpan apa adanya di DB (UI SOGo hanya
 *     menambah prefix "_" di memori lalu membuangnya lagi saat save).
 * CATATAN: operator SOGo memakai sufiks "_not" (contains_not), BUKAN
 * "does_not_contain"; ukuran memakai "under"/"over", BUKAN "size_is_under".
 * fileinto: argumen = `path` mailbox persis seperti dari /Mail/0/view
 * (mis. "INBOX/Proyek", "Archive") — sama dgn nilai yang dipakai UI SOGo
 * (mailbox.path dari $flattenMailboxes).
 */

import { parseAddressList } from './format.js';
import { stripSubjectPrefixes } from './conversations.js';

// ─── Kosakata UI ─────────────────────────────────────────────────────────────

export const FIELD_OPTIONS = [
  { id: 'from', label: 'Dari', kind: 'address' },
  { id: 'to', label: 'Kepada', kind: 'address' },
  { id: 'cc', label: 'Cc', kind: 'address' },
  { id: 'to_or_cc', label: 'Kepada atau Cc', kind: 'address' },
  { id: 'subject', label: 'Subjek', kind: 'text' },
  { id: 'header', label: 'Header lain', kind: 'text' },
  { id: 'size', label: 'Ukuran', kind: 'size' },
];

export const TEXT_OPERATORS = [
  { id: 'contains', label: 'mengandung' },
  { id: 'contains_not', label: 'tidak mengandung' },
  { id: 'is', label: 'sama dengan' },
  { id: 'is_not', label: 'tidak sama dengan' },
  { id: 'matches', label: 'cocok pola (* dan ?)' },
  { id: 'matches_not', label: 'tidak cocok pola' },
  { id: 'regex', label: 'cocok regex' },
  { id: 'regex_not', label: 'tidak cocok regex' },
];

export const SIZE_OPERATORS = [
  { id: 'under', label: 'kurang dari' },
  { id: 'over', label: 'lebih dari' },
];

export const MATCH_OPTIONS = [
  { id: 'all', label: 'Semua kondisi' },
  { id: 'any', label: 'Salah satu kondisi' },
  { id: 'allmessages', label: 'Semua pesan' },
];

/** Tindakan yang bisa diatur di editor (type UI → method SOGo). */
export const ACTION_OPTIONS = [
  { id: 'fileinto', label: 'Pindahkan ke folder' },
  { id: 'mark_seen', label: 'Tandai sebagai dibaca' },
  { id: 'mark_flagged', label: 'Tandai bendera' },
  { id: 'redirect', label: 'Teruskan ke' },
  { id: 'keep', label: 'Simpan juga di Kotak Masuk' },
  { id: 'discard', label: 'Hapus (buang permanen)' },
];

/** Tindakan yang bisa diterapkan "Jalankan sekarang" ke email yang sudah ada. */
export const RUNNABLE_ACTIONS = new Set(['fileinto', 'mark_seen', 'mark_flagged']);

const TEXT_OP_IDS = new Set(TEXT_OPERATORS.map((o) => o.id));
const SIZE_OP_IDS = new Set(SIZE_OPERATORS.map((o) => o.id));
const FIELD_IDS = new Set(FIELD_OPTIONS.map((f) => f.id));
const MATCH_IDS = new Set(MATCH_OPTIONS.map((m) => m.id));
const HEADER_NAME_RE = /^[!-9;-~]+$/; // RFC 5322 field-name (tanpa ":")
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

export const fieldKind = (field) => FIELD_OPTIONS.find((f) => f.id === field)?.kind || 'text';
export const operatorsFor = (field) => (fieldKind(field) === 'size' ? SIZE_OPERATORS : TEXT_OPERATORS);

let keySeq = 0;
const newKey = () => `r${Date.now().toString(36)}_${(keySeq++).toString(36)}`;

export function emptyCondition(field = 'from') {
  return fieldKind(field) === 'size'
    ? { field, header: '', operator: 'over', value: '', unit: 'KB' }
    : { field, header: '', operator: 'contains', value: '', unit: 'KB' };
}

export function emptyRule(overrides = {}) {
  return {
    key: newKey(),
    name: '',
    active: true,
    match: 'all',
    conditions: [emptyCondition('from')],
    actions: [{ type: 'fileinto', argument: '' }],
    stop: true,
    extra: {},
    ...overrides,
  };
}

// ─── Folder id ⇄ path (sesuai mailboxTree.js: id = 'folder' + path(/→%2F)) ──

export function folderIdToPath(id) {
  const s = String(id ?? '');
  if (!s) return '';
  const raw = s.startsWith('folder') ? s.slice(6) : s;
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export function pathToFolderId(path) {
  const p = String(path ?? '');
  return p ? `folder${p.replace(/\//g, '%2F')}` : '';
}

// ─── Konversi SOGo → UI ──────────────────────────────────────────────────────

function parseSize(value) {
  const m = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*([kKmMgG])?/);
  if (!m) return { value: String(value ?? ''), unit: 'KB' };
  let kb = Number(m[1]);
  const suf = (m[2] || 'k').toLowerCase();
  if (suf === 'm') kb *= 1024;
  if (suf === 'g') kb *= 1024 * 1024;
  if (kb >= 1024 && kb % 1024 === 0) return { value: String(kb / 1024), unit: 'MB' };
  return { value: String(kb), unit: 'KB' };
}

function fromSogoRule(r) {
  const src = r && typeof r === 'object' ? r : {};
  const field = typeof src.field === 'string' ? src.field : 'subject';
  const operator = typeof src.operator === 'string' ? src.operator : (field === 'size' ? 'over' : 'contains');
  if (field === 'size') {
    const { value, unit } = parseSize(src.value);
    return { field, header: '', operator, value, unit };
  }
  return {
    field,
    header: field === 'header' ? String(src.custom_header ?? '') : '',
    operator,
    value: src.value == null ? '' : String(src.value),
    unit: 'KB',
  };
}

function fromSogoAction(a) {
  const src = a && typeof a === 'object' ? a : {};
  const method = String(src.method ?? '');
  const arg = src.argument == null ? '' : String(src.argument);
  if (method === 'fileinto') return { type: 'fileinto', argument: arg };
  if (method === 'redirect') return { type: 'redirect', argument: arg };
  if (method === 'keep') return { type: 'keep', argument: '' };
  if (method === 'discard') return { type: 'discard', argument: '' };
  if (method === 'addflag' && arg === 'seen') return { type: 'mark_seen', argument: '' };
  if (method === 'addflag' && arg === 'flagged') return { type: 'mark_flagged', argument: '' };
  // reject / notify / vacation / addflag lain: dipertahankan apa adanya.
  return { type: 'other', argument: arg, raw: { ...src } };
}

/** Satu filter SOGo → model UI (field tak dikenal disimpan di `extra`). */
export function fromSogoFilter(filter) {
  const f = filter && typeof filter === 'object' && !Array.isArray(filter) ? filter : {};
  const { name, active, match, rules, actions, ...extra } = f;
  const acts = Array.isArray(actions) ? actions : [];
  const stop = acts.some((a) => a && a.method === 'stop');
  return {
    key: newKey(),
    name: typeof name === 'string' ? name : '',
    // SOGo menyimpan 1/0 (kadang string "1"/"0" atau boolean).
    active: !(active === 0 || active === '0' || active === false),
    match: MATCH_IDS.has(match) ? match : 'all',
    conditions: (Array.isArray(rules) ? rules : []).map(fromSogoRule),
    actions: acts.filter((a) => !(a && a.method === 'stop')).map(fromSogoAction),
    stop,
    extra,
  };
}

export function fromSogoFilters(list) {
  return (Array.isArray(list) ? list : [])
    .filter((f) => f && typeof f === 'object' && !Array.isArray(f))
    .map(fromSogoFilter);
}

// ─── Konversi UI → SOGo ──────────────────────────────────────────────────────

function toSogoRule(c) {
  if (c.field === 'size') {
    const n = Number(String(c.value).trim());
    const kb = c.unit === 'MB' ? n * 1024 : n;
    return { field: 'size', operator: c.operator, value: String(Number.isFinite(kb) ? Math.round(kb) : c.value) };
  }
  const out = { field: c.field, operator: c.operator, value: String(c.value ?? '').trim() };
  if (c.field === 'header') out.custom_header = String(c.header ?? '').trim();
  return out;
}

function toSogoAction(a) {
  switch (a.type) {
    case 'fileinto': return { method: 'fileinto', argument: String(a.argument ?? '') };
    case 'redirect': return { method: 'redirect', argument: String(a.argument ?? '').trim() };
    case 'keep': return { method: 'keep' };
    case 'discard': return { method: 'discard' };
    case 'mark_seen': return { method: 'addflag', argument: 'seen' };
    case 'mark_flagged': return { method: 'addflag', argument: 'flagged' };
    default: return a.raw ? { ...a.raw } : null;
  }
}

/** Model UI → filter SOGo. `stop` selalu jadi tindakan TERAKHIR. */
export function toSogoFilter(rule) {
  const r = rule || {};
  const actions = (Array.isArray(r.actions) ? r.actions : []).map(toSogoAction).filter(Boolean);
  if (r.stop) actions.push({ method: 'stop' });
  return {
    ...(r.extra && typeof r.extra === 'object' ? r.extra : {}),
    name: String(r.name ?? '').trim(),
    active: r.active === false ? 0 : 1,
    match: MATCH_IDS.has(r.match) ? r.match : 'all',
    rules: r.match === 'allmessages' ? [] : (Array.isArray(r.conditions) ? r.conditions : []).map(toSogoRule),
    actions,
  };
}

export const toSogoFilters = (rules) => (Array.isArray(rules) ? rules : []).map(toSogoFilter);

// ─── Validasi ────────────────────────────────────────────────────────────────

export function isValidEmail(s) {
  return EMAIL_RE.test(String(s ?? '').trim());
}

/**
 * @returns {string[]} daftar pesan error (Indonesia). Kosong = valid.
 */
export function validateRule(rule) {
  const errors = [];
  const r = rule || {};
  if (!String(r.name ?? '').trim()) errors.push('Nama aturan wajib diisi.');
  if (!MATCH_IDS.has(r.match)) errors.push('Pilih cara pencocokan kondisi.');

  if (r.match !== 'allmessages') {
    const conds = Array.isArray(r.conditions) ? r.conditions : [];
    if (conds.length === 0) errors.push('Tambahkan minimal satu kondisi, atau pilih "Semua pesan".');
    conds.forEach((c, i) => {
      const n = `Kondisi ${i + 1}`;
      if (!FIELD_IDS.has(c.field)) { errors.push(`${n}: kolom tidak dikenal.`); return; }
      if (c.field === 'size') {
        if (!SIZE_OP_IDS.has(c.operator)) errors.push(`${n}: operator ukuran tidak valid.`);
        const v = Number(String(c.value).trim());
        if (!String(c.value).trim() || !Number.isFinite(v) || v <= 0) errors.push(`${n}: ukuran harus angka lebih dari 0.`);
        return;
      }
      if (!TEXT_OP_IDS.has(c.operator)) errors.push(`${n}: operator tidak valid.`);
      if (c.field === 'header') {
        const h = String(c.header ?? '').trim();
        if (!h) errors.push(`${n}: isi nama header (mis. List-Id).`);
        else if (!HEADER_NAME_RE.test(h)) errors.push(`${n}: nama header tidak valid.`);
      }
      const v = String(c.value ?? '').trim();
      if (!v) errors.push(`${n}: nilai tidak boleh kosong.`);
      else if (c.operator === 'regex' || c.operator === 'regex_not') {
        try { new RegExp(v); } catch { errors.push(`${n}: regex tidak valid.`); }
      }
    });
  }

  const acts = Array.isArray(r.actions) ? r.actions : [];
  if (acts.length === 0 && !r.stop) errors.push('Tambahkan minimal satu tindakan.');
  const types = acts.map((a) => a.type);
  acts.forEach((a, i) => {
    const n = `Tindakan ${i + 1}`;
    if (a.type === 'fileinto' && !String(a.argument ?? '').trim()) errors.push(`${n}: pilih folder tujuan.`);
    if (a.type === 'redirect' && !isValidEmail(a.argument)) errors.push(`${n}: alamat email penerusan tidak valid.`);
  });
  if (types.includes('discard') && (types.includes('fileinto') || types.includes('keep') || types.includes('redirect'))) {
    errors.push('"Hapus" tidak bisa digabung dengan pindahkan/simpan/teruskan.');
  }
  const dup = types.filter((t) => t !== 'other' && t !== 'fileinto' && t !== 'redirect')
    .find((t, i, arr) => arr.indexOf(t) !== i);
  if (dup) errors.push('Ada tindakan yang sama lebih dari sekali.');
  return errors;
}

// ─── Pencocokan client-side (pratinjau / "Jalankan sekarang") ───────────────

/** Ambil daftar alamat email dari string header ("Nama <a@b>, c@d"). */
export function extractAddresses(value) {
  const s = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  const found = s.match(/[^\s<>(),;:"']+@[^\s<>(),;:"']+/g);
  if (found && found.length) return found.map((x) => x.toLowerCase());
  return s.split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

function wildcardToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) { out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    if (ch === '*') out += '[\\s\\S]*';
    else if (ch === '?') out += '[\\s\\S]';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 'i');
}

function testString(op, candidate, value) {
  const base = op.replace(/_not$/, '');
  const c = String(candidate ?? '');
  switch (base) {
    case 'contains': return c.toLowerCase().includes(value.toLowerCase());
    case 'is': return c.toLowerCase() === value.toLowerCase();
    case 'matches': return wildcardToRegExp(value).test(c);
    // SOGo memakai :comparator "i;octet" utk regex → peka huruf besar/kecil.
    case 'regex': try { return new RegExp(value).test(c); } catch { return false; }
    default: return false;
  }
}

function headerGetter(msg) {
  const h = msg?.headers;
  if (!h) return null;
  if (typeof h.get === 'function') return (name) => h.get(name) || '';
  if (typeof h === 'object') {
    const lower = {};
    for (const [k, v] of Object.entries(h)) lower[k.toLowerCase()] = v;
    return (name) => String(lower[String(name).toLowerCase()] ?? '');
  }
  return null;
}

/** Nilai mentah utk satu kondisi; `undefined` = data tidak tersedia. */
function candidatesFor(c, msg) {
  const get = headerGetter(msg);
  const ccValue = msg.cc !== undefined ? msg.cc : (get ? get('cc') : undefined);
  switch (c.field) {
    case 'from': return msg.from === undefined ? undefined : extractAddresses(msg.from);
    case 'to': return msg.to === undefined ? undefined : extractAddresses(msg.to);
    case 'cc': return ccValue === undefined ? undefined : extractAddresses(ccValue);
    case 'to_or_cc':
      if (msg.to === undefined || ccValue === undefined) return undefined;
      return [...extractAddresses(msg.to), ...extractAddresses(ccValue)];
    case 'subject': {
      const s = msg.subject !== undefined ? msg.subject : (get ? get('subject') : undefined);
      return s === undefined ? undefined : (String(s) ? [String(s)] : []);
    }
    case 'header': {
      if (!get) return undefined;
      const v = get(String(c.header ?? '').trim());
      return v ? [v] : [];
    }
    default: return undefined;
  }
}

/** true/false, atau null bila data pesan tidak cukup (mis. Cc belum dimuat). */
export function matchesCondition(c, msg) {
  if (!c || !msg) return null;
  const negated = /_not$/.test(c.operator || '');
  if (c.field === 'size') {
    const size = Number(msg.size);
    if (!Number.isFinite(size) || msg.size == null) return null;
    const kb = Number(c.value) * (c.unit === 'MB' ? 1024 : 1);
    if (!Number.isFinite(kb)) return false;
    return c.operator === 'under' ? size < kb * 1024 : size > kb * 1024;
  }
  const cands = candidatesFor(c, msg);
  if (cands === undefined) return null;
  const value = String(c.value ?? '').trim();
  // Sieve: header/alamat yang tidak ada → tes positif false (negasi → true).
  const hit = cands.some((cand) => testString(c.operator || 'contains', cand, value));
  return negated ? !hit : hit;
}

/**
 * Apakah aturan cocok dgn pesan? true/false, atau null bila tak bisa
 * dipastikan (data yang dibutuhkan tidak ada di objek pesan).
 */
export function matchesMessage(rule, msg) {
  if (!rule || !msg) return false;
  if (rule.match === 'allmessages') return true;
  const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
  if (conds.length === 0) return false;
  const results = conds.map((c) => matchesCondition(c, msg));
  if (rule.match === 'any') {
    if (results.includes(true)) return true;
    return results.includes(null) ? null : false;
  }
  if (results.includes(false)) return false;
  return results.includes(null) ? null : true;
}

/** Butuh header lengkap (viewsource) — Cc / header lain tidak ada di baris daftar. */
export function ruleNeedsHeaders(rule) {
  if (!rule || rule.match === 'allmessages') return false;
  return (rule.conditions || []).some((c) => c.field === 'cc' || c.field === 'to_or_cc' || c.field === 'header');
}

export function ruleUsesSize(rule) {
  return !!rule && rule.match !== 'allmessages' && (rule.conditions || []).some((c) => c.field === 'size');
}

export function isRunnable(rule) {
  return !!rule && (rule.actions || []).some((a) => RUNNABLE_ACTIONS.has(a.type));
}

/**
 * Rencana "Jalankan sekarang" (semantik Outlook/Sieve: aturan teratas dulu,
 * "berhenti" menghentikan aturan berikutnya; satu pesan hanya dipindah sekali
 * — fileinto pertama menang).
 *
 * @param {Array} rules     model UI (urut prioritas)
 * @param {Array} messages  baris pesan ({ uid, from, to, cc?, subject, isRead, isFlagged, headers? })
 * @param {{ sourcePath?: string, isExcluded?: (msg)=>boolean }} opts
 * @returns {{ matched: Array, moves: Object<string, Array>, markSeen: Array, markFlagged: Array, unknown: number, skippedActions: number }}
 */
export function planRun(rules, messages, { sourcePath = '', isExcluded } = {}) {
  const plan = { matched: [], moves: {}, markSeen: [], markFlagged: [], unknown: 0, skippedActions: 0 };
  const active = (Array.isArray(rules) ? rules : []).filter((r) => r && r.active !== false);
  for (const msg of Array.isArray(messages) ? messages : []) {
    if (!msg || msg.uid == null) continue;
    if (typeof isExcluded === 'function' && isExcluded(msg)) continue;
    let moved = false; let seen = false; let flagged = false; let any = false; let unsure = false;
    for (const rule of active) {
      const m = matchesMessage(rule, msg);
      if (m === null) { unsure = true; continue; }
      if (!m) continue;
      any = true;
      const types = (rule.actions || []).map((a) => a.type);
      for (const a of rule.actions || []) {
        if (a.type === 'mark_seen') seen = true;
        else if (a.type === 'mark_flagged') flagged = true;
        else if (a.type === 'fileinto') {
          // keep + fileinto = salinan di Sieve; memindahkan akan menghilangkan
          // salinan Inbox → jangan pindahkan di run-manual.
          if (moved || types.includes('keep')) continue;
          const target = String(a.argument ?? '');
          if (target && target !== sourcePath) {
            (plan.moves[target] ||= []).push(msg.uid);
            moved = true;
          }
        } else plan.skippedActions++;
      }
      if (rule.stop) break;
    }
    if (any) plan.matched.push(msg.uid);
    else if (unsure) plan.unknown++;
    if (seen && !msg.isRead) plan.markSeen.push(msg.uid);
    if (flagged && !msg.isFlagged) plan.markFlagged.push(msg.uid);
  }
  return plan;
}

// ─── Kalimat ringkas ("Jika … → …") ──────────────────────────────────────────

const label = (list, id) => list.find((x) => x.id === id)?.label || id;

export function describeCondition(c) {
  const field = c.field === 'header' ? `Header "${c.header || '?'}"` : label(FIELD_OPTIONS, c.field);
  if (c.field === 'size') return `${field} ${label(SIZE_OPERATORS, c.operator)} ${c.value || '?'} ${c.unit || 'KB'}`;
  return `${field} ${label(TEXT_OPERATORS, c.operator)} '${String(c.value ?? '').trim() || '…'}'`;
}

export function describeAction(a, folderLabel = (p) => p) {
  switch (a.type) {
    case 'fileinto': return `pindahkan ke '${a.argument ? folderLabel(a.argument) : '…'}'`;
    case 'mark_seen': return 'tandai dibaca';
    case 'mark_flagged': return 'tandai bendera';
    case 'redirect': return `teruskan ke ${a.argument || '…'}`;
    case 'keep': return 'simpan juga di Kotak Masuk';
    case 'discard': return 'hapus permanen';
    default: return a.raw?.method ? `${a.raw.method}${a.argument ? ` ${a.argument}` : ''}` : 'tindakan lain';
  }
}

export function describeRule(rule, folderLabel) {
  if (!rule) return '';
  const conds = rule.match === 'allmessages'
    ? 'Untuk semua pesan'
    : `Jika ${(rule.conditions || []).map(describeCondition).join(rule.match === 'any' ? ' atau ' : ' dan ') || '…'}`;
  const acts = (rule.actions || []).map((a) => describeAction(a, folderLabel));
  if (rule.stop) acts.push('berhenti');
  return `${conds} → ${acts.join(', ') || '…'}`;
}

// ─── Aturan dari pesan (ala Outlook "Buat aturan") ───────────────────────────

/**
 * Konteks prefill dari baris pesan: alamat pengirim (BUKAN nama tampilan —
 * Sieve mencocokkan alamat), nama pengirim, subjek tanpa Re:/Fwd:, email akun.
 * @param {{from?:any, subject?:string}} msg
 * @param {string} userEmail
 */
export function quickRuleContext(msg, userEmail) {
  const sender = parseAddressList(msg?.from).find((a) => a.email) || parseAddressList(msg?.from)[0] || { name: '', email: '' };
  const senderEmail = String(sender.email || '').trim().toLowerCase();
  return {
    senderEmail,
    senderName: String(sender.name || '').trim(),
    subject: stripSubjectPrefixes(String(msg?.subject ?? '')),
    me: String(userEmail ?? '').trim().toLowerCase(),
  };
}

/** Kondisi cepat yang tersedia untuk konteks ini (urutan tampil). */
export function quickRuleOptions(ctx) {
  const out = [];
  if (ctx.senderEmail) out.push({ id: 'from', label: `Dari ${ctx.senderName ? `${ctx.senderName} <${ctx.senderEmail}>` : ctx.senderEmail}` });
  if (ctx.subject) out.push({ id: 'subject', label: `Subjek mengandung "${ctx.subject}"` });
  if (ctx.me) {
    out.push({ id: 'toMe', label: 'Dikirim ke saya (Kepada)' });
    out.push({ id: 'ccMe', label: 'Cc ke saya' });
  }
  return out;
}

const sameCond = (c, field, value) => c.field === field && (c.operator || 'contains') === 'contains'
  && String(c.value ?? '').trim().toLowerCase() === String(value ?? '').trim().toLowerCase();
const isBlankCond = (c) => c.field !== 'size' && c.field !== 'header' && !String(c.value ?? '').trim();
const cond = (field, value) => ({ ...emptyCondition(field), value });

/** Status centang kondisi cepat, diturunkan dari model aturan (sumber kebenaran). */
export function quickConditionState(rule, ctx) {
  const cs = Array.isArray(rule?.conditions) ? rule.conditions : [];
  const has = (f, v) => !!v && cs.some((c) => sameCond(c, f, v));
  return {
    from: has('from', ctx.senderEmail),
    subject: has('subject', ctx.subject),
    toMe: has('to', ctx.me) || has('to_or_cc', ctx.me),
    ccMe: has('cc', ctx.me) || has('to_or_cc', ctx.me),
  };
}

/**
 * Tambah/hapus satu kondisi cepat di model aturan (murni → aturan baru).
 * "Kepada saya" + "Cc ke saya" sekaligus digabung jadi satu kondisi
 * "Kepada atau Cc" — kalau dua kondisi terpisah dgn "Semua kondisi", email
 * harus ke saya di Kepada DAN Cc sekaligus (salah).
 */
export function toggleQuickCondition(rule, id, on, ctx) {
  let cs = (Array.isArray(rule?.conditions) ? rule.conditions : []).slice();
  const me = ctx.me;
  const without = (f, v) => cs.filter((c) => !sameCond(c, f, v));
  const add = (c) => { cs = [...cs.filter((x) => !isBlankCond(x)), c]; };
  const replace = (fromField, toField) => { cs = cs.map((c) => (sameCond(c, fromField, me) ? cond(toField, me) : c)); };
  const has = (f, v) => cs.some((c) => sameCond(c, f, v));
  if (id === 'from' || id === 'subject') {
    const field = id;
    const value = id === 'from' ? ctx.senderEmail : ctx.subject;
    if (!value) return rule;
    if (on) { if (!has(field, value)) add(cond(field, value)); } else cs = without(field, value);
  } else if (id === 'toMe' || id === 'ccMe') {
    if (!me) return rule;
    const mine = id === 'toMe' ? 'to' : 'cc';
    const other = id === 'toMe' ? 'cc' : 'to';
    if (on) {
      if (has('to_or_cc', me) || has(mine, me)) return rule;
      if (has(other, me)) replace(other, 'to_or_cc');
      else add(cond(mine, me));
    } else if (has('to_or_cc', me)) replace('to_or_cc', other);
    else cs = without(mine, me);
  } else {
    return rule;
  }
  if (cs.length === 0) cs = [emptyCondition('from')];
  return { ...rule, conditions: cs };
}

/**
 * Model aturan awal dari pesan yang diklik (QuickRuleModal).
 * Default: Dari <alamat pengirim> → Pindahkan ke folder (kosong — validasi
 * meminta folder), nama "Dari <nama pengirim>".
 * @param {object} msg  baris pesan { from, to, cc?, subject }
 * @param {{ userEmail?: string, options?: {from?:boolean, subject?:boolean, toMe?:boolean, ccMe?:boolean} }} opts
 */
export function buildRuleFromMessage(msg, { userEmail = '', options = {} } = {}) {
  const ctx = quickRuleContext(msg, userEmail);
  const opt = { from: true, subject: false, toMe: false, ccMe: false, ...options };
  const who = ctx.senderEmail ? (ctx.senderName || ctx.senderEmail) : '';
  let rule = emptyRule({ name: who ? `Dari ${who}` : 'Aturan baru' });
  for (const id of ['from', 'subject', 'toMe', 'ccMe']) {
    if (opt[id]) rule = toggleQuickCondition(rule, id, true, ctx);
  }
  return rule;
}

// ─── Utilitas daftar ─────────────────────────────────────────────────────────

export function moveItem(list, from, to) {
  const arr = [...list];
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
  const [it] = arr.splice(from, 1);
  arr.splice(to, 0, it);
  return arr;
}

export function duplicateRule(rule) {
  const copy = JSON.parse(JSON.stringify({ ...rule, key: undefined }));
  return { ...copy, key: newKey(), name: `${rule.name || 'Aturan'} (salinan)` };
}

// ─── Migrasi aturan lama (localStorage auto-archive) ────────────────────────

const escapeWildcard = (s) => String(s).replace(/[\\*?]/g, '\\$&');

function legacyCondition(c) {
  const v = String(c?.value ?? '').trim();
  const field = ['from', 'to', 'subject'].includes(c?.field) ? c.field : null;
  if (!field || !v) return null;
  switch (c.operator) {
    case 'equals': return { ...emptyCondition(field), operator: 'is', value: v };
    case 'startsWith': return { ...emptyCondition(field), operator: 'matches', value: `${escapeWildcard(v)}*` };
    case 'endsWith': return { ...emptyCondition(field), operator: 'matches', value: `*${escapeWildcard(v)}` };
    case 'notContains': return { ...emptyCondition(field), operator: 'contains_not', value: v };
    default: return { ...emptyCondition(field), operator: 'contains', value: v };
  }
}

/**
 * Aturan lama → model UI server. Aturan lama menjalankan pemindahan per
 * aturan berurutan, jadi pesan praktis hanya dipindah oleh aturan pertama yang
 * cocok → `stop: true` meniru perilaku itu. Kondisi body/kosong dibuang.
 * @returns {object|null} null bila tidak ada kondisi yang bisa dimigrasi.
 */
export function legacyToRule(legacy) {
  if (!legacy || typeof legacy !== 'object') return null;
  const conditions = (Array.isArray(legacy.conditions) ? legacy.conditions : []).map(legacyCondition).filter(Boolean);
  const target = folderIdToPath(legacy.actionFolder);
  if (!conditions.length || !target) return null;
  return emptyRule({
    name: String(legacy.name || 'Aturan lama').trim() || 'Aturan lama',
    active: legacy.enabled !== false,
    match: legacy.matchType === 'any' ? 'any' : 'all',
    conditions,
    actions: [{ type: 'fileinto', argument: target }],
    stop: true,
  });
}

/** Sidik jari filter SOGo (tanpa key UI) — dipakai cegah duplikasi migrasi. */
export function filterSignature(filter) {
  const f = toSogoFilter(fromSogoFilter(filter));
  return JSON.stringify([f.name, f.match, f.rules, f.actions]);
}

/**
 * Gabungkan aturan lama ke daftar server (di BELAKANG — aturan server yang
 * sudah ada tetap berprioritas). Yang sidik jarinya sudah ada tidak digandakan.
 * @returns {{ rules: Array, migratedIds: string[], skipped: number }}
 */
export function mergeLegacyRules(serverRules, legacyRules) {
  const out = [...(Array.isArray(serverRules) ? serverRules : [])];
  const seen = new Set(out.map((r) => filterSignature(toSogoFilter(r))));
  const migratedIds = [];
  let skipped = 0;
  for (const legacy of Array.isArray(legacyRules) ? legacyRules : []) {
    const rule = legacyToRule(legacy);
    if (!rule) { skipped++; continue; }
    const sig = filterSignature(toSogoFilter(rule));
    if (!seen.has(sig)) { out.push(rule); seen.add(sig); }
    migratedIds.push(legacy.id);
  }
  return { rules: out, migratedIds, skipped };
}
