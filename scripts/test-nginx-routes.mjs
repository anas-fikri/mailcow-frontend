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

// Single source of truth: configs/site.webmail.custom must contain every
// exact /api location (other apps regex overlap guard), including image-proxy.
const endpoints = ['/api/health', '/api/auth/smtp', '/api/preferences', '/api/send', '/api/image-proxy', '/api/metrics'];
for (const endpoint of endpoints) {
  assert.match(locationBlock(config, endpoint), /proxy_pass http:\/\/172\.25\.1\.1:3005;/);
}

// deploy.sh must NOT keep a second copy of the nginx config (heredoc) — it reads
// configs/site.webmail.custom and only substitutes the port.
assert.doesNotMatch(deploy, /nginx_config=\$\(cat <<NGINX_EOF/);
assert.match(deploy, /configs\/\$NGINX_FILE/);
assert.match(deploy, /s\/172\\\.25\\\.1\\\.1:3005\/172\.25\.1\.1:\$\{SOGO_API_PORT\}\/g/);

// Backend (server.js SMTP proxy) must be deployed + service restarted.
assert.match(deploy, /deploy_backend\(\)/);
assert.match(deploy, /rsync -av server\.js/);
assert.match(deploy, /node --check server\.js/);
assert.match(deploy, /systemctl --user restart sogo-smtp-proxy/);

// Verify step must health-check /api/image-proxy (SSRF guard + live fetch).
assert.match(deploy, /verify_image_proxy\(\)/);
assert.match(deploy, /\/api\/image-proxy\?url=http%3A%2F%2F127\.0\.0\.1/);
assert.match(deploy, /warn\(\)/);

// No broad /api regex route may shadow the exact locations.
assert.doesNotMatch(config, /location ~ \^\/api\/\(send\|health\|preferences\|auth\/smtp\)/);

console.log('nginx route assertions passed');
