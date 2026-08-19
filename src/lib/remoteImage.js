/**
 * Remote image fetch (server-side) — anti tracking-pixel + SSRF-safe.
 *
 * Di-extract dari server.js agar bisa diuji di Node tanpa menyala server Express.
 * Mengambil gambar HTTP(S) atas nama user (bukan dari browser), dengan:
 *   - SSRF guard: tolak IP privat/loopback/reserved (isBlockedIp) + DNS-pinned.
 *   - Hard deadline anti slow-loris/slow-read: total waktu fetch dibatasi.
 *   - Redirect terbatas + re-validasi tiap hop, wajib image/*, max bytes.
 */

import { promises as dnsPromises } from 'dns';
import http from 'http';
import https from 'https';
import { isBlockedIp } from './ssrfGuard.js';

export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_MAX_REDIRECTS = 3;

export function imageProxyError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function parseImageProxyUrl(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > 2048) return null;
  let u;
  try { u = new URL(value); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null; // tolak kredensial tersemat
  return u;
}

// Resolve semua address host lalu tolak bila SATU pun privat/reserved.
export async function resolveSafeAddresses(hostname) {
  let records;
  try {
    records = await dnsPromises.lookup(hostname, { all: true });
  } catch {
    throw imageProxyError(502, 'Gagal me-resolve host gambar.');
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw imageProxyError(502, 'Gagal me-resolve host gambar.');
  }
  for (const r of records) {
    if (isBlockedIp(r.address)) {
      throw imageProxyError(403, 'Host gambar diblokir.');
    }
  }
  return records;
}

// Pin koneksi ke IP yang sudah divalidasi — cegah DNS rebinding (koneksi memakai
// IP hasil resolusi pertama, bukan resolusi ulang yang bisa mengarah ke privat).
export function pinLookup(records) {
  const first = records[0];
  return (_hostname, _opts, cb) => cb(null, first.address, first.family);
}

/**
 * Kirim satu request GET + kembalikan response stream. Promise resolve saat
 * headers tiba. Hard deadline dihitung dari `deadline` absolut (satu kali utk
 * seluruh fetch, termasuk redirect): begitu lewat, stream di-destroy dengan
 * error 504. `timeoutMs` adalah idle/socket timeout (byte diam).
 */
export function requestImageOnce(url, records, deadline, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: 'GET',
      lookup: pinLookup(records),
      headers: {
        'User-Agent': 'PCPExpress-Webmail-ImageProxy/1.0',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Encoding': 'identity',
      },
      timeout: timeoutMs,
    }, (res) => {
      // Hard deadline utk seluruh transfer (anti slow-loris/slow-read):
      // hancurkan stream bila total waktu (resolve + connect + read) melebihi
      // deadline absolut yang dihitung sekali di awal.
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        // Bug fix: dulu branch ini destroy res tapi TIDAK settle promise →
        // await hang selamanya. Sekarang reject supaya caller dapat 504.
        res.destroy();
        reject(imageProxyError(504, 'Gambar timeout.'));
        return;
      }
      const timer = setTimeout(() => res.destroy(imageProxyError(504, 'Gambar timeout.')), remaining);
      res.on('close', () => clearTimeout(timer));
      resolve(res);
    });
    req.on('timeout', () => req.destroy(imageProxyError(504, 'Gambar timeout.')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch gambar remote penuh (redirect-aware, SSRF-guarded, size-capped).
 *
 * @param {string} initialUrl
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]     hard deadline + idle timeout (ms)
 * @param {number} [opts.maxBytes]      batas ukuran body
 * @param {number} [opts.maxRedirects]  maksimum redirect hop
 * @param {function} [opts.resolve]     injectable resolver (default resolveSafeAddresses; utk test)
 * @returns {Promise<{contentType: string, buffer: Buffer}>}
 */
export async function fetchRemoteImage(initialUrl, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  resolve = resolveSafeAddresses,
} = {}) {
  let url = parseImageProxyUrl(initialUrl);
  if (!url) throw imageProxyError(400, 'URL gambar tidak valid.');

  // Deadline absolut satu kali untuk SELURUH fetch (semua redirect hop) —
  // mencegah slow-drip yang menahan koneksi tak terbatas meski tiap socket
  // masih 'hidup' (byte dikirim <timeoutMs sekali).
  const deadline = Date.now() + timeoutMs;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const records = await resolve(url.hostname);
    const res = await requestImageOnce(url, records, deadline, timeoutMs);

    const status = res.statusCode || 0;
    const location = res.headers.location;

    // Ikuti redirect (terbatas) + re-validasi tiap hop.
    if (status >= 300 && status < 400 && location) {
      res.resume();
      if (hop >= maxRedirects) throw imageProxyError(502, 'Terlalu banyak redirect.');
      try { url = new URL(location, url); } catch { throw imageProxyError(502, 'Redirect tidak valid.'); }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw imageProxyError(502, 'Redirect tidak valid.');
      if (url.username || url.password) throw imageProxyError(502, 'Redirect tidak valid.');
      continue;
    }

    if (status !== 200) {
      res.resume();
      throw imageProxyError(502, 'Gambar gagal dimuat.');
    }

    const contentType = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
      res.resume();
      throw imageProxyError(415, 'Konten bukan gambar.');
    }

    const chunks = [];
    let total = 0;
    let tooBig = false;
    for await (const chunk of res) {
      total += chunk.length;
      if (total > maxBytes) {
        tooBig = true;
        res.destroy();
        break;
      }
      chunks.push(chunk);
    }
    if (tooBig) throw imageProxyError(413, 'Gambar terlalu besar.');
    return { contentType, buffer: Buffer.concat(chunks) };
  }
  throw imageProxyError(502, 'Gagal memuat gambar.');
}
