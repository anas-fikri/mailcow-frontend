/**
 * Pengukuran UX di browser — ringan, tanpa dependensi, tanpa data pribadi.
 *
 *   start('message_open')           → mulai timer bernama
 *   end('message_open')             → catat durasi sejak start (no-op bila tak ada)
 *   record('api_error', 503)        → catat nilai langsung
 *
 * Sampel di-buffer lalu dikirim berkala (dan saat tab disembunyikan) via
 * navigator.sendBeacon ke POST /api/metrics. Server hanya menerima nama dari
 * daftar putih (src/lib/metricsStore.js). Tidak ada email, subjek, atau UID.
 */

const ENDPOINT = '/api/metrics';
const FLUSH_MS = 30_000;
const MAX_BUFFER = 50;

const timers = new Map();
let buffer = [];
let flushTimer = null;
let installed = false;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function deviceClass() {
  try {
    return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
  } catch {
    return 'desktop';
  }
}

export function start(name) {
  timers.set(name, now());
}

/** Akhiri timer; mengembalikan durasi (ms) atau null bila timer tak ada. */
export function end(name) {
  const t0 = timers.get(name);
  if (t0 === undefined) return null;
  timers.delete(name);
  const ms = Math.round(now() - t0);
  record(name, ms);
  return ms;
}

export function cancel(name) {
  timers.delete(name);
}

export function record(name, value) {
  if (!Number.isFinite(value) || value < 0) return;
  buffer.push([name, Math.round(value)]);
  if (import.meta.env?.DEV) console.debug(`[metrics] ${name}: ${Math.round(value)}`);
  if (buffer.length >= MAX_BUFFER) flush();
  else scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer || typeof window === 'undefined') return;
  flushTimer = window.setTimeout(flush, FLUSH_MS);
}

export function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return;
  const payload = JSON.stringify({ d: deviceClass(), m: buffer.splice(0, MAX_BUFFER) });
  try {
    const blob = new Blob([payload], { type: 'application/json' });
    if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
      fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    }
  } catch {
    /* metrik bersifat best-effort */
  }
}

/** Pasang observer Web Vitals + flush saat tab disembunyikan. Panggil sekali di main.jsx. */
export function installMetrics() {
  if (installed || typeof window === 'undefined' || import.meta.env?.DEV) return;
  installed = true;
  start('boot_to_inbox');

  const observe = (type, cb, opts = {}) => {
    try {
      const po = new PerformanceObserver((list) => list.getEntries().forEach(cb));
      po.observe({ type, buffered: true, ...opts });
      return po;
    } catch {
      return null;
    }
  };

  let lcp = 0;
  observe('largest-contentful-paint', (e) => { lcp = e.startTime; });

  let cls = 0;
  observe('layout-shift', (e) => { if (!e.hadRecentInput) cls += e.value; });

  let inp = 0;
  observe('event', (e) => { if (e.interactionId && e.duration > inp) inp = e.duration; }, { durationThreshold: 40 });

  let vitalsSent = false;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (!vitalsSent) {
      vitalsSent = true;
      if (lcp) record('web_vital_lcp', lcp);
      if (inp) record('web_vital_inp', inp);
      record('web_vital_cls', cls * 1000);
    }
    flush();
  });
}
