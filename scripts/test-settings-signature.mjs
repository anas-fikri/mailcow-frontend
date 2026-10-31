// Regression test: buka /webmail/settings dengan bundle produksi nyata (dist/)
// di jsdom, seed sesi login + data signature LEGACY (entri tanpa field html),
// klik tab Signature, lalu assert TIDAK ada crash (pcp_last_error kosong).
//
// Konteks bug: PreferencesPage memanggil sig.html.length di SignatureSection;
// entri legacy dari localStorage tanpa field html → TypeError → ErrorBoundary
// root menampilkan "Terjadi Kesalahan" dan seluruh halaman Settings mati.
// Fix: guard optional chaining di render + normalisasi entri di loadSignatures.
//
// Prasyarat: dist/ harus build dari kode terbaru (script npm menjalankan
// `npm run build` dulu).
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');
const indexPath = resolve(distDir, 'index.html');
if (!existsSync(indexPath)) {
  console.error('dist/index.html tidak ada — jalankan npm run build dulu');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');

const dom = new JSDOM(html, {
  url: 'https://mail.example.net/webmail/settings',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});

const { window } = dom;

// ── Polyfill global yang dibutuhkan bundle ──────────────────────────────────
const install = (name, value) => {
  // Node 24 punya beberapa global read-only (navigator, dll) — override via
  // Object.defineProperty dengan configurable:true.
  try { globalThis[name] = value; }
  catch {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: true });
  }
};
for (const k of ['window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'location', 'history', 'customElements', 'HTMLElement', 'MutationObserver',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
  'Image', 'URL', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder',
  'CryptoKey', 'Event', 'CustomEvent', 'Node', 'Element', 'DOMParser',
  'SVGElement', 'SVGSVGElement', 'SVGPathElement', 'SVGGraphicsElement',
  'SVGImageElement', 'SVGUseElement', 'SVGTitleElement', 'SVGGElement',
  'SVGTextElement', 'SVGTextContentElement', 'SVGDefsElement', 'SVGLinearGradientElement']) {
  install(k, window[k]);
}
install('crypto', window.crypto);

// matchMedia (Tailwind responsive / tema)
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; },
}));
install('matchMedia', window.matchMedia);

// IntersectionObserver / ResizeObserver (Sidebar/MailPage), polos
class NoopObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
window.IntersectionObserver = window.IntersectionObserver || NoopObserver;
window.ResizeObserver = window.ResizeObserver || NoopObserver;
install('IntersectionObserver', window.IntersectionObserver);
install('ResizeObserver', window.ResizeObserver);

// fetch stub — semua permintaan dibalas 200 JSON kosong agar sesi dianggap
// valid, app boot penuh, dan halaman /settings benar-benar dirender.
// Mencegah kebocoran ke jaringan nyata dari repro.
window.fetch = async () => new Response(JSON.stringify({ message: 'mocked 200 (repro stub)' }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});
install('fetch', window.fetch);

// ── Seed sesi login (zustand persist format) ────────────────────────────────
const EMAIL = 'test@example.net';
window.localStorage.setItem('pcp-auth', JSON.stringify({
  state: {
    user: { email: EMAIL, sogoToken: 'sogo-test-token', cn: 'Test User' },
    isLoggedIn: true,
    theme: 'dark',
    themeColor: 'blue',
    sortAsc: false,
    conversationView: false,
  },
  version: 0,
}));

// Seed data signature LEGACY (dari versi lama): entri tanpa field html.
// Hipotesis bug: SignatureSection memanggil sig.html.length → TypeError.
window.localStorage.setItem(`pcp_signatures_${EMAIL}`, JSON.stringify({
  list: [{ id: 'legacy-1', name: 'Signature Lama' }],
  defaults: { new: 'legacy-1', reply: null },
}));

// ── Tangkap error ───────────────────────────────────────────────────────────
const errors = [];
window.addEventListener('error', (e) => {
  errors.push({ type: 'window-error', message: String(e.error?.message || e.message), stack: String(e.error?.stack || '') });
});
const origConsoleError = console.error;
console.error = (...args) => {
  origConsoleError('[console.error]', ...args.map(a => (a instanceof Error ? `${a.message}\n${a.stack}` : a)));
  errors.push({ type: 'console', message: args.map(String).join(' ') });
};

// ── Muat bundle (app bootstrap sendiri) ─────────────────────────────────────
const indexChunk = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
if (!indexChunk) { console.error('index chunk tidak ditemukan di index.html'); process.exit(1); }
const entryUrl = pathToFileURL(resolve(distDir, 'assets', indexChunk[1])).href;

console.log(`Memuat bundle: ${entryUrl}`);
try {
  await import(entryUrl);
} catch (e) {
  console.error('=== GAGAL IMPORT BUNDLE ===');
  console.error(e?.stack || e);
  process.exit(2);
}

// Tunggu render + lazy chunks + react-query settle
await new Promise((r) => setTimeout(r, 4000));

// Klik tab "Signature" (tombol dengan teks Signature di sidebar kiri)
const buttons = [...window.document.querySelectorAll('button')];
const sigTab = buttons.find((b) => b.textContent.trim() === 'Signature');
if (sigTab) {
  console.log('Mengklik tab Signature...');
  sigTab.click();
  await new Promise((r) => setTimeout(r, 1500));
} else {
  console.log('Tab Signature tidak ditemukan — tab yang ada:', buttons.map(b => b.textContent.trim()).filter(Boolean).slice(0, 8));
}

const rootHtml = window.document.getElementById('root')?.innerHTML || '';
const pcpError = window.localStorage.getItem('pcp_last_error');
const bodyText = window.document.body.textContent || '';

console.log('\n──────────────────────────');
console.log('root length  :', rootHtml.length);
console.log('body text    :', bodyText.slice(0, 300).replace(/\s+/g, ' '));
console.log('pcp_last_error:', pcpError ? 'ADA ✓' : '(tidak ada)');
console.log('window errors:', errors.length);
if (pcpError) {
  try { console.log('\n=== pcp_last_error ===\n' + JSON.stringify(JSON.parse(pcpError), null, 2)); }
  catch { console.log('\n=== pcp_last_error (raw) ===\n' + pcpError); }
}
if (errors.length) {
  console.log('\n=== errors captured ===');
  errors.slice(0, 10).forEach((e, i) => console.log(`[${i}] ${e.type}: ${e.message.slice(0, 400)}`));
}

const crashed = !!pcpError || /Terjadi Kesalahan/.test(bodyText);

// Migrasi sekali-jalan: entri legacy tanpa html diberi placeholder — daftar
// menampilkan badge "Perlu diisi" (bukan "0.0 KB — teks saja" yang menyesatkan).
const hasPlaceholderBadge = bodyText.includes('Perlu diisi — klik untuk mengedit');
if (!crashed) {
  console.log('placeholder badge di daftar:', hasPlaceholderBadge ? 'ADA ✓' : 'TIDAK ADA ✗');
}
const fail = crashed || !hasPlaceholderBadge;
console.log('\nRESULT:', fail
  ? 'FAIL ✗ — Settings error ATAU badge placeholder tidak tampil utk signature legacy'
  : 'PASS — Settings render OK + signature legacy ditandai "Perlu diisi"');
process.exit(fail ? 1 : 0);
