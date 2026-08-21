// Test komponen ErrorBoundary (tombol debug "Lihat Detail Error").
//
// Pendekatan: bundle ErrorBoundary.jsx + harness kecil dengan esbuild
// (jsx automatic, bundle penuh), jalankan di jsdom, lalu assert:
//   1. Fallback "Terjadi Kesalahan" tampil saat child melempar.
//   2. Detail error TIDAK tampil secara default (keputusan keamanan).
//   3. Klik "Lihat Detail Error" → pesan error tampil.
//   4. Klik lagi ("Sembunyikan Detail") → detail disembunyikan.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: 'https://mail.pcpexpress.com/webmail/settings',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;

for (const k of ['window', 'document', 'navigator', 'localStorage', 'location', 'history',
  'HTMLElement', 'Node', 'Element', 'Event', 'CustomEvent', 'MutationObserver',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'Image',
  'TextEncoder', 'TextDecoder', 'DOMParser', 'SVGElement', 'SVGSVGElement']) {
  try { globalThis[k] = window[k]; }
  catch { Object.defineProperty(globalThis, k, { value: window[k], writable: true, configurable: true }); }
}
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
globalThis.matchMedia = window.matchMedia;
try { globalThis.crypto = window.crypto; }
catch { Object.defineProperty(globalThis, 'crypto', { value: window.crypto, writable: true, configurable: true }); }

const result = await esbuild.build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import ErrorBoundary from './src/components/ErrorBoundary.jsx';

      function Boom() {
        throw new Error('BOOM_TEST_ERROR_123');
      }

      export function mount(container) {
        const root = createRoot(container);
        root.render(React.createElement(ErrorBoundary, null, React.createElement(Boom)));
        return root;
      }
    `,
    resolveDir: process.cwd(),
    sourcefile: 'harness.jsx',
    loader: 'jsx',
  },
  bundle: true,
  write: false,
  format: 'esm',
  jsx: 'automatic',
  platform: 'browser',
  logLevel: 'silent',
});

const code = result.outputFiles[0].text;
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

// Redam noise console.error React/ErrorBoundary (stack berisi base64 source
// dari harness — bukan bagian yang diuji).
const originalConsoleError = console.error;
const captured = [];
console.error = (...args) => { captured.push(args.map(String).join(' ').slice(0, 120)); };

try {
const root = window.document.getElementById('root');
mod.mount(root);
await new Promise((r) => setTimeout(r, 300));

const text = () => (root.textContent || '');
assert.ok(text().includes('Terjadi Kesalahan'), 'fallback harus tampil');
assert.ok(!text().includes('BOOM_TEST_ERROR_123'), 'detail TIDAK boleh tampil secara default');

// Klik tombol "Lihat Detail Error" → detail tampil
const buttons = [...root.querySelectorAll('button')];
const showBtn = buttons.find((b) => (b.textContent || '').includes('Lihat Detail Error'));
assert.ok(showBtn, 'tombol "Lihat Detail Error" harus ada');
showBtn.click();
await new Promise((r) => setTimeout(r, 100));
assert.ok(text().includes('BOOM_TEST_ERROR_123'), 'pesan error harus tampil setelah klik');

// Klik lagi → detail disembunyikan
const hideBtn = [...root.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Sembunyikan Detail'));
assert.ok(hideBtn, 'tombol harus berubah jadi "Sembunyikan Detail"');
hideBtn.click();
await new Promise((r) => setTimeout(r, 100));
assert.ok(!text().includes('BOOM_TEST_ERROR_123'), 'detail harus disembunyikan setelah klik lagi');

console.log('error-boundary-debug assertions passed');
console.log('  (console.error noise suppressed:', captured.length, 'line)');
} finally {
  console.error = originalConsoleError;
}
