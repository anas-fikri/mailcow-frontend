export function getFormatSize(size) {
  if (!size && size !== 0) return '';
  const num = parseFloat(size);
  if (!Number.isFinite(num)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = num;
  let unit = units[0];
  for (let i = 0; value >= 1024 && i < units.length - 1; i++) {
    value /= 1024;
    unit = units[i + 1];
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

export const formatSize = getFormatSize;

/**
 * Normalisasi daftar alamat dari SOGo.
 * Item bisa berupa objek {name, email}, string mentah ("user@domain"), atau
 * null/undefined (baris rusak). Semua bentuk harus aman: item null dilewati,
 * string dipakai apa adanya, objek dirangkai "Nama <email>".
 * Tanpa guard ini, item null → TypeError crash seluruh reader.
 */
export function formatAddresses(arr) {
  if (!arr) return '';
  if (typeof arr === 'string') return arr;
  if (!Array.isArray(arr)) return String(arr);
  return arr
    .map((a) => {
      if (!a) return '';
      if (typeof a === 'string') return a;
      if (typeof a === 'object') {
        const name = a.name ? String(a.name) : '';
        const email = a.email ? String(a.email) : '';
        return name && email ? `${name} <${email}>` : (name || email);
      }
      return String(a);
    })
    .filter(Boolean)
    .join(', ');
}

export function renderDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}