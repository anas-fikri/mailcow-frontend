/**
 * Agregator metrik UX di server (dipakai server.js) — murni, tanpa I/O.
 *
 * Browser mengirim batch durasi (ms) per nama metrik via POST /api/metrics;
 * di sini disimpan sebagai histogram kumulatif dan diekspos dalam format teks
 * Prometheus (GET /metrics, hanya loopback). Tidak ada data pribadi: hanya
 * nama metrik dari daftar putih + angka + kelas perangkat.
 */

// Nama metrik yang diterima. Tambah di sini bila klien mengirim metrik baru.
export const METRIC_NAMES = Object.freeze({
  boot_to_inbox: 'Boot aplikasi sampai daftar inbox pertama tampil',
  login_to_inbox: 'Submit login sampai daftar inbox pertama tampil',
  folder_switch: 'Klik folder sampai daftar pesan tampil',
  message_open: 'Klik pesan sampai isi pesan tampil',
  search: 'Ketik pencarian sampai hasil tampil',
  send: 'Klik kirim sampai server menerima',
  api_error: 'Kegagalan panggilan API (nilai = status HTTP)',
  web_vital_lcp: 'Largest Contentful Paint',
  web_vital_inp: 'Interaction to Next Paint',
  web_vital_cls: 'Cumulative Layout Shift (x1000)',
});

export const DEVICES = Object.freeze(['mobile', 'desktop']);

// Batas bucket (ms) — rapat di bawah 1 dtk karena di situlah persepsi "cepat".
export const BUCKETS = Object.freeze([50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000, 30000]);

const MAX_VALUE = 120_000;
export const MAX_BATCH = 50;

/** Validasi & normalisasi satu batch dari klien. Mengembalikan array sampel valid. */
export function parseBatch(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.m)) return [];
  const device = DEVICES.includes(body.d) ? body.d : 'desktop';
  const out = [];
  for (const item of body.m.slice(0, MAX_BATCH)) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [name, value] = item;
    if (typeof name !== 'string' || !Object.hasOwn(METRIC_NAMES, name)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_VALUE) continue;
    out.push({ name, value, device });
  }
  return out;
}

export function createMetricsStore() {
  /** key `${name}|${device}` → { counts: number[], sum, count } */
  const series = new Map();

  function record({ name, value, device }) {
    const key = `${name}|${device}`;
    let s = series.get(key);
    if (!s) {
      s = { name, device, counts: new Array(BUCKETS.length).fill(0), sum: 0, count: 0 };
      series.set(key, s);
    }
    for (let i = 0; i < BUCKETS.length; i++) {
      if (value <= BUCKETS[i]) s.counts[i]++;
    }
    s.sum += value;
    s.count++;
  }

  /** Teks eksposisi Prometheus (histogram kumulatif). */
  function toPrometheus(prefix = 'webmail_ux') {
    const lines = [];
    const byName = new Map();
    for (const s of series.values()) {
      if (!byName.has(s.name)) byName.set(s.name, []);
      byName.get(s.name).push(s);
    }
    for (const [name, list] of byName) {
      const metric = `${prefix}_${name}_ms`;
      lines.push(`# HELP ${metric} ${METRIC_NAMES[name]}`);
      lines.push(`# TYPE ${metric} histogram`);
      for (const s of list) {
        const lbl = `device="${s.device}"`;
        BUCKETS.forEach((b, i) => lines.push(`${metric}_bucket{${lbl},le="${b}"} ${s.counts[i]}`));
        lines.push(`${metric}_bucket{${lbl},le="+Inf"} ${s.count}`);
        lines.push(`${metric}_sum{${lbl}} ${Math.round(s.sum)}`);
        lines.push(`${metric}_count{${lbl}} ${s.count}`);
      }
    }
    return lines.join('\n') + '\n';
  }

  /** Perkiraan persentil dari histogram (untuk ringkasan JSON / test). */
  function percentile(name, device, p) {
    const s = series.get(`${name}|${device}`);
    if (!s || s.count === 0) return null;
    const target = Math.ceil((p / 100) * s.count);
    for (let i = 0; i < BUCKETS.length; i++) {
      if (s.counts[i] >= target) return BUCKETS[i];
    }
    return Infinity;
  }

  return { record, toPrometheus, percentile, _series: series };
}
