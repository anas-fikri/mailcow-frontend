import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchRemoteImage, requestImageOnce } from '../src/lib/remoteImage.js';

// Resolver injectable: bypass SSRF guard (127.0.0.1 diblokir di produksi) agar
// test bisa memakai server lokal. Di produksi resolve = resolveSafeAddresses.
const localhostRecords = [{ address: '127.0.0.1', family: 4 }];
const resolveLocalhost = async () => localhostRecords;

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

// ── 1. Slow-drip (slow-loris/slow-read): hard deadline harus potong dgn 504 ──
// Upstream mengirim headers segera lalu menetes 1 byte tiap 50ms tanpa pernah
// selesai. Tanpa hard deadline, `for await` di fetchRemoteImage akan hang
// selamanya (byte terus datang < timeout idle). Hard deadline harus menyetopnya.
{
  const slow = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.write(Buffer.from([0x89])); // 1 byte awal (header sudah terkirim)
    res.on('error', () => {});
    const timer = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(Buffer.from([0x00]));
    }, 50);
    res.on('close', () => clearInterval(timer));
  });
  const port = await listen(slow);
  try {
    const start = Date.now();
    let caught = null;
    try {
      await fetchRemoteImage(`http://127.0.0.1:${port}/slow.png`, { timeoutMs: 500, resolve: resolveLocalhost });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'slow-drip harus dihentikan (throw), bukan hang');
    assert.equal(caught.status, 504, 'harus 504 timeout');
    assert.match(caught.message, /timeout/i);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 3000, `hard deadline harus aktif <3s (actual ${elapsed}ms) — tanpa deadline hang selamanya`);
  } finally {
    slow.close();
  }
}

// ── 2. Happy path: gambar kecil valid → sukses (ekstraksi tidak merusak) ─────
{
  const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const good = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(png);
  });
  const port = await listen(good);
  try {
    const r = await fetchRemoteImage(`http://127.0.0.1:${port}/ok.png`, { timeoutMs: 2000, resolve: resolveLocalhost });
    assert.equal(r.contentType, 'image/png');
    assert.deepEqual(r.buffer, png);
  } finally {
    good.close();
  }
}

// ── 3. Headers tiba setelah deadline → reject 504 (bug fix: dulu hang) ───────
{
  const late = http.createServer((req, res) => {
    res.on('error', () => {});
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from([0x89]));
    }, 300); // headers lewat dari deadline 100ms
  });
  const port = await listen(late);
  try {
    const url = new URL(`http://127.0.0.1:${port}/late.png`);
    const deadline = Date.now() + 100;
    let caught = null;
    try {
      await requestImageOnce(url, localhostRecords, deadline, 5000);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'headers lewat deadline harus reject (bukan hang)');
    assert.equal(caught.status, 504);
  } finally {
    late.close();
  }
}

console.log('remote image assertions passed');
