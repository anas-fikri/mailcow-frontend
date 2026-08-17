/**
 * Columns requested from SOGo's mailbox view endpoint.
 * Explicitly requesting these prevents some SOGo configurations from returning
 * only `uids` metadata without the header rows needed by the Inbox UI.
 */
export const SOGO_MESSAGE_HEADERS = [
  'To',
  'hasAttachment',
  'isFlagged',
  'Subject',
  'From',
  'isRead',
  'Priority',
  'RelativeDate',
  'Size',
  'Flags',
  'uid',
  'isAnswered',
  'isForwarded',
];

const COLUMN_ALIASES = {
  to: ['to', 'recipient', 'recipients'],
  from: ['from', 'sender'],
  subject: ['subject'],
  date: ['relativedate', 'date', 'receiveddate'],
  uid: ['uid', 'id'],
  isRead: ['isread', 'read'],
  hasAtt: ['hasattachment', 'attachment', 'hasatt'],
  isFlagged: ['isflagged', 'flagged'],
};

function normalizeColumnName(value) {
  return String(value ?? '').replace(/[\s_-]/g, '').toLowerCase();
}

function createColumnMap(columns) {
  const map = new Map();
  (Array.isArray(columns) ? columns : []).forEach((column, index) => {
    map.set(normalizeColumnName(column), index);
  });
  return map;
}

function findColumnIndex(columnMap, field) {
  return COLUMN_ALIASES[field]
    .map(normalizeColumnName)
    .map((alias) => columnMap.get(alias))
    .find((index) => index !== undefined);
}

function valueAt(row, columnMap, field, fallbackIndex) {
  const dynamicIndex = findColumnIndex(columnMap, field);
  // Once SOGo supplies a column row, an omitted optional column must remain
  // absent. Falling back to an old positional index would read another field
  // (for example Subject) as a boolean flag.
  return dynamicIndex !== undefined
    ? row[dynamicIndex]
    : columnMap.size === 0
      ? row[fallbackIndex]
      : undefined;
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return !['', '0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function formatAddress(value) {
  const addresses = Array.isArray(value) ? value : value == null ? [] : [value];

  return addresses.map((address) => {
    if (typeof address === 'string') return address;
    if (!address || typeof address !== 'object') return '';
    const name = address.name || address.displayName || '';
    const email = address.email || address.address || '';
    if (name && email) return `${name} <${email}>`;
    return name || email;
  }).filter(Boolean).join(', ');
}

/**
 * Parse one SOGo row. Dynamic column names are preferred; positional indexes
 * remain as a compatibility fallback for older responses without column names.
 */
export function parseMessageRow(row, columns = []) {
  if (!Array.isArray(row)) return null;

  const columnMap = createColumnMap(columns);
  const uid = valueAt(row, columnMap, 'uid', 10);
  if (uid === null || uid === undefined || uid === '') return null;

  return {
    uid,
    from: formatAddress(valueAt(row, columnMap, 'from', 4)),
    to: formatAddress(valueAt(row, columnMap, 'to', 0)),
    // SOGo terkadang mengembalikan subject/date sebagai object (bukan string).
    // Normalisasi di sini mencegah TypeError di search filter, sorting, dan
    // render React ("Objects are not valid as a React child") di semua pemakai.
    subject: String(valueAt(row, columnMap, 'subject', 3) || ''),
    date: String(valueAt(row, columnMap, 'date', 7) || ''),
    isRead: asBoolean(valueAt(row, columnMap, 'isRead', 5)),
    hasAtt: asBoolean(valueAt(row, columnMap, 'hasAtt', 1)),
    isFlagged: asBoolean(valueAt(row, columnMap, 'isFlagged', 2)),
  };
}

/** Parse the `{ headers: [columnNames, ...rows] }` portion of a SOGo response. */
export function parseMessageRows(data) {
  const headerRows = data?.headers;
  if (!Array.isArray(headerRows) || headerRows.length === 0) return [];

  const columns = Array.isArray(headerRows[0]) ? headerRows[0] : [];
  const knownColumnNames = new Set(Object.values(COLUMN_ALIASES).flat().map(normalizeColumnName));
  const matchingColumns = columns.filter((column) =>
    typeof column === 'string' && knownColumnNames.has(normalizeColumnName(column))
  ).length;
  // A real column row is a string-only list with several recognized fields.
  // Requiring multiple matches avoids dropping a data row whose subject happens
  // to equal a column name such as "Subject".
  const hasColumnRow = columns.length >= 3 &&
    columns.every((column) => typeof column === 'string') &&
    matchingColumns >= 3;
  const rows = hasColumnRow ? headerRows.slice(1) : headerRows;

  return rows.map((row) => parseMessageRow(row, hasColumnRow ? columns : [])).filter(Boolean);
}
