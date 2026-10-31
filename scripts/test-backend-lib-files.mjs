// Setiap modul src/lib yang di-import server.js WAJIB ikut di-deploy
// (deploy.sh BACKEND_LIB_FILES) — kalau tidak, backend crash saat start.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../deploy.sh', import.meta.url), 'utf8');
const imported = [...server.matchAll(/from '\.\/(src\/lib\/[\w.-]+\.js)'/g)].map((m) => m[1]);
const listed = (deploy.match(/BACKEND_LIB_FILES="([^"]*)"/) || [])[1]?.split(/\s+/) || [];
assert.ok(imported.length > 0, 'server.js harus mengimpor modul src/lib');
for (const f of imported) assert.ok(listed.includes(f), `${f} di-import server.js tapi tidak ada di BACKEND_LIB_FILES (deploy.sh)`);
console.log(`✅ test-backend-lib-files: ${imported.length} modul backend ter-deploy`);
