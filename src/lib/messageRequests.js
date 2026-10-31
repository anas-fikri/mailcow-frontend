import { SOGO_MESSAGE_HEADERS } from './messageRows.js';

export function buildMessageViewBody(params = {}) {
  const body = {
    sortby: 'date',
    asc: 0,
    headers: SOGO_MESSAGE_HEADERS,
  };
  if (params.limit) body.limit = params.limit;
  if (params.offset) body.offset = params.offset;
  return body;
}

/**
 * Body search SOGo v5 — search dilakukan lewat folder view dengan `filters`,
 * BUKAN endpoint /search (yang tidak ada → 404). Diverifikasi dari kode
 * Mailbox.service.js (SOGo 5.12): `$filter` → `post(id, 'view', { filters })`,
 * filter valid: {searchBy, searchInput, negative, operator}.
 * searchBy SOGo: subject_or_from, subject_or_to, contains, body, from, to, subject.
 */
/** Panjang maksimal query pencarian yang dikirim ke SOGo. */
export const MAX_SEARCH_QUERY_LENGTH = 500;

export function buildMessageSearchBody(query, criteria = 'all') {
  // Map kriteria UI (all/from/to/subject/body) ke searchBy SOGo.
  const searchBy = {
    from: 'from',
    to: 'to',
    subject: 'subject',
    body: 'body',
  }[criteria] || 'contains';
  // Cap defensif: query raksasa → body besar ke SOGo. Input UI sudah
  // maxLength=300, tapi pemanggil lain/state korup harus aman juga.
  const safeQuery = String(query ?? '').slice(0, MAX_SEARCH_QUERY_LENGTH);
  return {
    sortingAttributes: { sort: 'date', asc: 0 },
    filters: [
      { searchBy, searchInput: safeQuery, negative: 0 },
    ],
  };
}
