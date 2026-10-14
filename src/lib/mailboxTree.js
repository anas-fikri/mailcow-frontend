// ─── Mailbox tree flattening ──────────────────────────────────────────────────
// Logika murni (tanpa fetch) agar bisa diuji oleh Node tanpa transpile JSX.

export const FOLDER_TYPE_LABELS = {
  sent:     'Terkirim',
  drafts:   'Draft',
  trash:    'Sampah',
  junk:     'Spam',
  inbox:    'Kotak Masuk',
};

// Tipe folder khusus SOGo yang TIDAK boleh dihapus dari UI. `templates` ikut:
// SOGo selalu menampilkan folder Templates (SOGoTemplatesFolderName) walau
// mailbox-nya belum pernah dibuat di IMAP — hapus → 500 "Mailbox doesn't exist"
// (insiden 2026-10-14, log sogod). Diperiksa berdasarkan TIPE dari SOGo, bukan
// hanya id tetap, agar nama folder khusus yang dikustomisasi tetap terlindungi.
export const PROTECTED_FOLDER_TYPES = new Set(['inbox', 'sent', 'draft', 'drafts', 'trash', 'junk', 'templates']);
const PROTECTED_FOLDER_IDS = new Set(['folderINBOX', 'folderSent', 'folderDrafts', 'folderTrash', 'folderJunk', 'folderTemplates']);

/** True bila folder adalah folder sistem (tidak boleh dihapus). */
export function isProtectedFolder(folder) {
  if (!folder || typeof folder !== 'object') return false;
  if (PROTECTED_FOLDER_IDS.has(folder.id)) return true;
  return PROTECTED_FOLDER_TYPES.has(String(folder.type || '').toLowerCase());
}

/**
 * Flatten response SOGo Mail/0/view menjadi daftar folder satu tingkat.
 *
 * Depth dihitung dari dua sumber yang digabung dengan Math.max:
 *  - `depth` rekursi `children` — dipakai saat SOGo mengembalikan response
 *    NESTED (hierarki via array children).
 *  - `pathDepth` turunan dari segmen `path` ("INBOX/Sub" = 1,
 *    "INBOX/Sub/Sub2" = 2) — fallback saat SOGo mengembalikan daftar FLAT
 *    tanpa children (terbukti di production), agar indentasi tetap tampil.
 * Nilai keduanya identik saat response nested karena SOGo selalu membawa
 * full path (prefix parent) pada tiap child.
 */
export function flattenMailboxes(mailboxes, depth = 0) {
  const result = [];
  for (const mb of mailboxes || []) {
    // Guard entri malformed (null / non-object) — jangan crash di mb.path.
    if (!mb || typeof mb !== 'object') continue;
    // Path harus string: SOGo bisa mengembalikan path/name non-string; String()
    // mencegah crash di .replace/.split (pola yang sama dgn normalisasi lain).
    const path     = String(mb.path || mb.name || '');
    if (!path) continue;
    // SOGo folder URL path: "folder" + path (path tidak boleh mengandung "/")
    // Untuk subfolder pakai encode
    const folderId = 'folder' + path.replace(/\//g, '%2F');
    const type     = String(mb.type || 'folder');
    const label    = FOLDER_TYPE_LABELS[type] ?? String(mb.name ?? path);
    const pathDepth = path.split('/').filter(Boolean).length - 1;
    result.push({ id: folderId, label, type, path, name: String(mb.name ?? path), depth: Math.max(depth, pathDepth) });
    if (Array.isArray(mb.children) && mb.children.length) {
      result.push(...flattenMailboxes(mb.children, depth + 1));
    }
  }
  return result;
}
