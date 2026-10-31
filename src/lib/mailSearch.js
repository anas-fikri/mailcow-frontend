// ─── Pencarian lintas folder & empty-state pintar inbox ──────────────────────
// Pure helpers (tanpa React) — testable di Node via scripts/test-mail-search.mjs.
// searchMessages di-import DINAMIS: di Node test, import statik api.js akan
// menarik seluruh rantai modul berat (loginDiagnostics dll) — tidak perlu.
// Di build Vite hasilnya identik (dynamic import dari modul yang sama tetap
// masuk bundle graph biasa, bukan chunk terpisah, karena juga di-import statik).

/** Batas & konstanta pencarian global. */
export const GLOBAL_SEARCH = {
  /** Maks folder yang di-query paralel (guard biar tidak membombardir SOGo). */
  MAX_FOLDERS: 12,
  /** Delay sebelum auto-expand ke semua folder setelah hasil folder aktif 0 (ms). */
  EXPAND_DELAY_MS: 900,
};

/**
 * Kumpulan folder untuk pencarian global: hanya folder MAIL (id berprefix
 * `folder`), buang kalender/kontak & non-selectable, urut sesuai order sidebar.
 */
export function pickSearchableFolders(folders) {
  return (Array.isArray(folders) ? folders : [])
    .filter((f) => f && f.id && f.id.startsWith('folder') && !/calendar|contact/i.test(f.id))
    .sort((a, b) => String(a.order ?? '').localeCompare(String(b.order ?? '')))
    .slice(0, GLOBAL_SEARCH.MAX_FOLDERS);
}

/**
 * Pencarian lintas folder: folder aktif dulu; kalau hasil 0 → paralel ke semua
 * folder terpilih. Folder yang gagal (kuota/akses) dianggap 0 hasil — bukan
 * error global (pola allSettled).
 * @param {object} [opts] injeksi test: { searchFn } menggantikan searchMessages
 *   (dependency injection — test Node tidak perlu memuat rantai api.js).
 * @returns {Promise<{messages: Array, searchedAll: boolean, folderErrors: number}>}
 */
export async function searchAllFolders(token, activeFolder, query, criteria, folders, opts = {}) {
  const search = opts.searchFn || (async (t, f, q, c) => {
    const { searchMessages } = await import('./api.js');
    return searchMessages(t, f, q, c);
  });
  const active = await search(token, activeFolder, query, criteria);
  const activeMessages = active?.messages || [];
  if (activeMessages.length > 0) {
    return { messages: activeMessages, searchedAll: false, folderErrors: 0 };
  }
  const targets = pickSearchableFolders(folders).filter((f) => f.id !== activeFolder);
  if (!targets.length) return { messages: [], searchedAll: false, folderErrors: 0 };
  // Promise.resolve().then(...) → throw sinkron dari searchFn non-async ikut
  // jadi rejection, bukan meledak keluar dari allSettled.
  const settled = await Promise.allSettled(
    targets.map((f) => Promise.resolve().then(() => search(token, f.id, query, criteria)))
  );
  const extra = [];
  let folderErrors = 0;
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].status === 'fulfilled') {
      for (const m of settled[i].value?.messages || []) {
        if (!m.folderId) m.folderId = targets[i].id;
        extra.push(m);
      }
    } else {
      folderErrors++;
    }
  }
  return { messages: extra, searchedAll: true, folderErrors };
}

/**
 * Gabungkan hasil multi-folder: dedupe by folder+uid (+fallback date+subject
 * karena beberapa backend melaporkan uid yang sama untuk folder berbeda),
 * urutkan terbaru dulu.
 */
export function mergeSearchResults(messages) {
  const seen = new Set();
  const out = [];
  for (const m of messages || []) {
    const key = `${m.folderId}|${m.uid}|${m.date}|${m.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  const ts = (v) => {
    const n = v ? Date.parse(v) : NaN;
    return Number.isNaN(n) ? 0 : n;
  };
  return out.sort((a, b) => ts(b.date) - ts(a.date));
}

/**
 * Saring daftar folder utk MoveToPicker: cocokkan query (case-insensitive)
 * terhadap label ATAU path lengkap, buang folder sumber (excludeId) dan folder
 * non-mail (Calendar/Contacts). Tanpa query → semua folder (urutan asli).
 */
export function filterFoldersForPicker(folders, query = '', excludeId = null) {
  const q = String(query || '').trim().toLowerCase();
  const list = Array.isArray(folders) ? folders : [];
  return list.filter((f) => {
    if (!f || !f.id) return false;
    if (excludeId && f.id === excludeId) return false;
    if (/^folder(Calendar|Contacts)$/i.test(f.id)) return false;
    if (!q) return true;
    const label = String(f.label || f.name || '').toLowerCase();
    const path = String(f.path || '').toLowerCase().replace(/\//g, ' / ');
    return label.includes(q) || path.includes(q);
  });
}

/** Label pendek folder utk chip hasil pencarian (segmen terakhir path). */
export function folderChipLabel(folder) {
  if (!folder) return '';
  const leaf = String(folder.label || folder.name || folder.path || '')
    .split('/').pop().trim();
  return leaf || '';
}

/** Label Indonesia utk filter aktif di empty-state. */
export const FILTER_LABELS_ID = {
  unread: 'belum dibaca',
  attachment: 'berlampiran',
  category: 'kategori',
  flag: 'bintang berwarna',
};

/**
 * Empty state pintar: analisis kenapa daftar kosong + kategori saran aksi.
 * @returns {{kind:'search'|'filters'|'folder', filters: string[], scopeNote: string|null}}
 */
export function analyzeEmptyList({ searchQuery, activeFilters, scopeNote }) {
  if (searchQuery) return { kind: 'search', filters: [], scopeNote };
  const filters = Object.entries(activeFilters || {})
    .filter(([, v]) => !!v)
    .map(([k]) => k);
  if (filters.length > 0) return { kind: 'filters', filters, scopeNote };
  return { kind: 'folder', filters: [], scopeNote };
}
