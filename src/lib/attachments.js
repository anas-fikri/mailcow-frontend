// ─── Lampiran helpers (pure, tanpa JSX/DOM — testable di Node) ────────────────

/** Ekstensi file dari nama (lowercase), tanpa titik. Kosong bila tidak ada. */
export function fileExtension(name) {
  const m = String(name || '').match(/\.([A-Za-z0-9]{1,8})$/);
  return m ? m[1].toLowerCase() : '';
}

const KIND_BY_EXT = {
  pdf: 'pdf',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive',
  gz: 'archive', bz2: 'archive', xz: 'archive',
  xls: 'spreadsheet', xlsx: 'spreadsheet', csv: 'spreadsheet', ods: 'spreadsheet',
  doc: 'document', docx: 'document', odt: 'document', rtf: 'document', txt: 'document', md: 'document',
  ppt: 'presentation', pptx: 'presentation', odp: 'presentation',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  bmp: 'image', ico: 'image', heic: 'image', tiff: 'image',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio',
  mp4: 'video', mov: 'video', mkv: 'video', webm: 'video', avi: 'video', m4v: 'video',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', json: 'code', html: 'code', css: 'code',
  py: 'code', java: 'code', c: 'code', cpp: 'code', sh: 'code', sql: 'code', xml: 'code',
  yml: 'code', yaml: 'code', log: 'code',
};

/**
 * Klasifikasi tipe lampiran berdasarkan nama + contentType.
 * @returns {'image'|'pdf'|'archive'|'spreadsheet'|'document'|'presentation'|'audio'|'video'|'code'|'other'}
 */
export function getFileKind(name, contentType = '') {
  const ct = String(contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('audio/')) return 'audio';
  if (ct.startsWith('video/')) return 'video';
  if (ct === 'application/pdf') return 'pdf';
  if (/zip|compressed|archive|tar|rar|7z/.test(ct)) return 'archive';
  if (/spreadsheet|excel|csv/.test(ct)) return 'spreadsheet';
  if (/presentation|powerpoint/.test(ct)) return 'presentation';
  if (/word|document|msword|text\/plain/.test(ct)) return 'document';
  const ext = fileExtension(name);
  return KIND_BY_EXT[ext] || 'other';
}

/**
 * Parse ukuran SOGo menjadi bytes (number), atau null bila tak terbaca.
 * Menerima number (bytes) ATAU string terformat "1.2 MB" / "500 KB" / "3.4 GB".
 */
export function parseSizeToBytes(size) {
  if (size === null || size === undefined || size === '') return null;
  if (typeof size === 'number') return Number.isFinite(size) && size > 0 ? size : null;
  const s = String(size).trim().toLowerCase();
  const m = s.match(/^([\d.,]+)\s*(b|kb|mb|gb|tb|kib|mib|gib|tib)?$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (Number.isNaN(n)) return null;
  const unit = m[2] || 'b';
  const mult = {
    b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4,
    kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4,
  }[unit] || 1;
  return Math.round(n * mult);
}

/**
 * Format ukuran untuk tampilan.
 * SOGo sudah kirim `size` sebagai STRING terformat ("1.2 MB") — tampilkan
 * langsung; hanya angka numerik (bytes) yang diformat ulang.
 */
export function formatFileSize(size) {
  if (!size || size === 0) return '';
  if (typeof size === 'string') return size;
  // < 1 KB → tampilkan bytes utuh (golden sample produksi: lampiran kecil
  // "144 B" — Math.round(144/1024) = 0 menampilkan "0 KB" yang menyesatkan).
  if (size < 1024) return `${size} B`;
  return size > 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(size / 1024)} KB`;
}

/** Jumlahkan ukuran semua lampiran → string ringkas ("2.4 MB"), atau '' bila tak ada. */
export function totalAttachmentSize(attachments) {
  let bytes = 0;
  for (const a of attachments || []) {
    const b = parseSizeToBytes(a?.size);
    if (b) bytes += b;
  }
  if (bytes <= 0) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
