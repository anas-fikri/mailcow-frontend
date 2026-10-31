// Regresi insiden 2026-10-14: email undo-send terkirim 2–4× ke penerima.
// Akar: (1) proses server.js yatim ikut mem-flush file antrean yang sama,
// (2) setInterval flush tanpa guard → tick berikutnya mengirim ulang entri yang
// masih menunggu respons SMTP, (3) tiap retry membuat Message-ID baru.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInstanceLock } from '../src/lib/instanceLock.js';
import { buildQueueEntry } from '../src/lib/sendQueue.js';

// ── Lock: real filesystem, dua "proses" (pid berbeda) ────────────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-lock-'));
const lockPath = path.join(dir, 'pending-sends.json.flush.lock');
const alive = new Set([111, 222]);
const isAlive = (pid) => alive.has(pid);

const a = createInstanceLock({ lockPath, pid: 111, isAlive });
const b = createInstanceLock({ lockPath, pid: 222, isAlive });

assert.deepEqual(a.tryAcquire(), { ok: true, holder: 111 }, 'proses pertama mendapat lock');
assert.deepEqual(b.tryAcquire(), { ok: false, holder: 111 }, 'proses kedua DITOLAK selama pemegang hidup');
assert.deepEqual(a.tryAcquire(), { ok: true, holder: 111 }, 'pemegang tetap bisa re-acquire (idempoten)');
assert.equal(fs.readFileSync(lockPath, 'utf8'), '111');

// Pemegang mati (mis. di-kill / crash tanpa release) → lock basi diambil alih.
alive.delete(111);
assert.deepEqual(b.tryAcquire(), { ok: true, holder: 222 }, 'lock basi diambil alih proses hidup');
assert.equal(fs.readFileSync(lockPath, 'utf8'), '222');

// Proses lama "hidup lagi" (tidak mungkin, tapi pastikan tidak mencuri): ditolak.
alive.add(111);
assert.equal(a.tryAcquire().ok, false, 'mantan pemegang tidak boleh merebut lock yang sudah diambil alih');

// Release hanya menghapus lock milik sendiri.
a.release();
assert.ok(fs.existsSync(lockPath), 'release oleh bukan-pemegang tidak menghapus lock');
b.release();
assert.ok(!fs.existsSync(lockPath), 'release oleh pemegang menghapus lock');

// Isi lock rusak → dianggap basi.
fs.writeFileSync(lockPath, 'bukan-pid');
assert.deepEqual(a.tryAcquire(), { ok: true, holder: 111 }, 'isi lock rusak dianggap basi');
a.release();
fs.rmSync(dir, { recursive: true, force: true });

// ── Entri antrean: Message-ID stabil + header threading tidak terbuang ──────
const entry = buildQueueEntry({
  user: 'joko@x.id', sendAt: Date.now() + 1000, cred: {}, messageId: '<abc@x.id>',
  payload: { to: 'sinta@x.id', subject: 'Re: A', body: 'b', inReplyTo: '<orig@x.id>', references: '<r1@x.id> <orig@x.id>' },
});
assert.equal(entry.messageId, '<abc@x.id>', 'Message-ID ditetapkan saat antre');
assert.equal(entry.payload.inReplyTo, '<orig@x.id>', 'In-Reply-To ikut tersimpan di entri antrean');
assert.equal(entry.payload.references, '<r1@x.id> <orig@x.id>', 'References ikut tersimpan di entri antrean');
// Kompatibel: entri lama tanpa messageId tetap valid.
assert.equal(buildQueueEntry({ user: 'u', sendAt: 1, cred: {}, payload: {} }).messageId, '');

// ── Kontrak sumber server.js ────────────────────────────────────────────────
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
assert.ok(/if \(flushRunning\) return;/.test(server), 'flush wajib di-guard flushRunning (anti tick tumpang-tindih)');
assert.ok(/flushLock\.tryAcquire\(\)/.test(server), 'flush wajib memegang lock satu-pengirim');
assert.ok(/messageId: entry\.messageId/.test(server), 'flush wajib memakai Message-ID entri (stabil lintas retry)');
assert.ok(/inReplyTo: parsed\.data\.inReplyTo/.test(server), 'jalur antre & kirim langsung meneruskan In-Reply-To');
assert.ok(/if \(!sendQueue\.find\(entry\.id\)\) continue;/.test(server), 'entri yang dibatalkan saat flush tidak dikirim');
const deploy = fs.readFileSync(new URL('../deploy.sh', import.meta.url), 'utf8');
assert.ok(/BACKEND_LIB_FILES=.*src\/lib\/instanceLock\.js/.test(deploy), 'deploy.sh wajib men-sync instanceLock.js (backend gagal start tanpanya)');

console.log('send-queue-dedupe: all assertions passed');
