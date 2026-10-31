// Jalankan semua npm script test:* (kecuali deploy-runtime-env yang hanya ada di innaka).
// Pakai: `npm test`. Exit code ≠ 0 bila ada yang gagal.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const cwd = process.argv[2];
const pkg = JSON.parse(readFileSync(`${cwd}/package.json`, 'utf8'));
const keys = Object.keys(pkg.scripts).filter((k) => k.startsWith('test:') && k !== 'test:deploy-runtime-env');
let pass = 0; const fail = [];
for (const k of keys) {
  const r = spawnSync('npm', ['run', '-s', k], { cwd, encoding: 'utf8', timeout: 180000 });
  if (r.status === 0) pass++; else fail.push(k + ' :: ' + (r.stderr || r.stdout || '').split('\n').filter((l) => /AssertionError|Error:|✗|FAIL/.test(l)).slice(0, 2).join(' | '));
}
console.log(`PASS=${pass}/${keys.length}`);
for (const f of fail) console.log('FAIL', f);
process.exitCode = fail.length ? 1 : 0;
