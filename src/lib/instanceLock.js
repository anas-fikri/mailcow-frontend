// ─── Lock satu-pengirim untuk antrean kirim (server-side) ─────────────────────
// INSIDEN 2026-10-14: 12 proses `node server.js` yatim (nohup manual Agustus/
// September) berjalan berdampingan dengan service systemd dan SEMUANYA mem-flush
// file antrean yang sama → setiap email undo-send terkirim 2–4× ke penerima
// (245 kiriman tambahan; kasus bayu.gunawan → nadya.adriany 4 salinan).
//
// Invarian: paling banyak SATU proses yang menjalankan flush untuk satu file
// antrean. Lock = file berisi PID pemegang. Lock dianggap basi bila PID itu
// sudah mati. Proses yang gagal mengambil lock TIDAK mem-flush (HTTP tetap
// jalan) dan mencoba lagi tiap tick — bila pemegang mati, ia mengambil alih.
//
// Modul murni: fs + pemeriksa proses di-inject agar bisa diuji tanpa proses nyata.
import fs from 'node:fs';
import path from 'node:path';

function defaultIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err?.code === 'EPERM'; }
}

/**
 * Buat pengelola lock.
 * @param {object} opts
 * @param {string} opts.lockPath
 * @param {number} [opts.pid=process.pid]
 * @param {(pid:number)=>boolean} [opts.isAlive]
 * @param {object} [opts.fsImpl=fs]
 * @returns {{ tryAcquire: () => {ok:boolean, holder:number|null}, release: () => void, held: () => boolean }}
 */
export function createInstanceLock({ lockPath, pid = process.pid, isAlive = defaultIsAlive, fsImpl = fs }) {
  let held = false;

  function readHolder() {
    try {
      const n = parseInt(String(fsImpl.readFileSync(lockPath, 'utf8')).trim(), 10);
      return Number.isInteger(n) ? n : null;
    } catch { return null; }
  }

  function createExclusive() {
    try {
      const dir = path.dirname(lockPath);
      if (!fsImpl.existsSync(dir)) fsImpl.mkdirSync(dir, { recursive: true });
      fsImpl.writeFileSync(lockPath, String(pid), { flag: 'wx' });
      return true;
    } catch (err) {
      if (err?.code === 'EEXIST') return false;
      throw err;
    }
  }

  function tryAcquire() {
    if (held && readHolder() === pid) return { ok: true, holder: pid };
    held = false;
    if (createExclusive()) { held = true; return { ok: true, holder: pid }; }
    const holder = readHolder();
    if (holder === pid) { held = true; return { ok: true, holder: pid }; }
    if (holder !== null && isAlive(holder)) return { ok: false, holder };
    // Basi (pemegang mati / isi rusak) → hapus lalu coba SEKALI lagi.
    try { fsImpl.unlinkSync(lockPath); } catch { /* sudah dihapus proses lain */ }
    if (createExclusive()) { held = true; return { ok: true, holder: pid }; }
    return { ok: false, holder: readHolder() };
  }

  function release() {
    if (!held) return;
    held = false;
    try { if (readHolder() === pid) fsImpl.unlinkSync(lockPath); } catch { /* noop */ }
  }

  return { tryAcquire, release, held: () => held };
}
