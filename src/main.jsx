import './themeInit.js'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { installMetrics } from './lib/metrics.js'

installMetrics()

// PWA: daftarkan service worker HANYA di production. SW hanya menangani GET
// dalam scope /webmail/ (navigasi + asset hashed) dan TIDAK pernah menyentuh
// /api/* — data email & sesi tidak masuk cache browser.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // ?v= cache-bust: karena sw.js bukan asset ber-hash, pertaruh HTTP cache
    // bisa menahan versi SW lama dari cache. Bump angka ini di tiap rilis SW
    // agar browser SELALU mengambil SW terbaru (penggantian cache lama).
    navigator.serviceWorker.register('/webmail/sw.js?v=8').catch(() => {
      /* SW gagal registrasi — aplikasi tetap berjalan normal tanpa offline shell */
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
