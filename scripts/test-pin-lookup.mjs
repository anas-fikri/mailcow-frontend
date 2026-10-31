// Regresi produksi 2026-10-11: pinLookup harus mendukung mode `{ all: true }`
// yang dipakai Node ≥20 (autoSelectFamily). Sebelumnya membalas (addr, family)
// di mode itu → "Invalid IP address: undefined" → SEMUA gambar eksternal 500.
import assert from 'node:assert/strict';
import http from 'node:http';
import { pinLookup } from '../src/lib/remoteImage.js';

const records = [
  { address: '93.184.216.34', family: 4 },
  { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
];
const lookup = pinLookup(records);

// Mode single (all:false / tanpa opsi) → (err, address, family) alamat pertama.
lookup('example.com', {}, (err, address, family) => {
  assert.equal(err, null);
  assert.equal(address, '93.184.216.34');
  assert.equal(family, 4);
});
// Bentuk lama: lookup(hostname, cb) tanpa opsi.
lookup('example.com', (err, address, family) => {
  assert.equal(err, null);
  assert.equal(address, '93.184.216.34');
  assert.equal(family, 4);
});
// Mode all:true → array [{address,family}] dari record yang SUDAH divalidasi saja.
lookup('example.com', { all: true }, (err, list) => {
  assert.equal(err, null);
  assert.ok(Array.isArray(list), 'mode all harus mengembalikan array');
  assert.deepEqual(list, records.map((r) => ({ address: r.address, family: r.family })));
});

// Uji NYATA lewat stack http Node: server lokal 127.0.0.1, request ke hostname
// fiktif yang di-pin ke 127.0.0.1 — membuktikan Node menerima balasan lookup
// (termasuk mode autoSelectFamily) tanpa "Invalid IP address".
const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end('ok'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const pinned = pinLookup([{ address: '127.0.0.1', family: 4 }]);
for (const autoSelectFamily of [true, false]) {
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'pinned.invalid', port, path: '/x.png', lookup: pinned, autoSelectFamily }, (res) => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 200, `request ter-pin harus sukses (autoSelectFamily=${autoSelectFamily})`);
}
server.close();

console.log('pin-lookup: all assertions passed (single, legacy, all:true, real http autoSelectFamily on/off)');
