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