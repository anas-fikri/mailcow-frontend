import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../configs/site.webmail.custom', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../deploy.sh', import.meta.url), 'utf8');

function locationBlock(source, endpoint) {
  const marker = `location = ${endpoint} {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} is missing`);
  const end = source.indexOf('\n}', start);
  assert.notEqual(end, -1, `${marker} is not closed`);
  return source.slice(start, end + 2);
}

for (const endpoint of ['/api/health', '/api/auth/smtp', '/api/preferences', '/api/send']) {
  assert.match(locationBlock(config, endpoint), /proxy_pass http:\/\/172\.25\.1\.1:3005;/);
  assert.match(locationBlock(deploy, endpoint), /proxy_pass http:\/\/172\.25\.1\.1:\$\{SOGO_API_PORT\};/);
}

assert.doesNotMatch(config, /location ~ \^\/api\/\(send\|health\|preferences\|auth\/smtp\)/);
assert.doesNotMatch(deploy, /location ~ \^\/api\/\(send\|health\|preferences\|auth\/smtp\)/);

console.log('nginx route assertions passed');
