import assert from 'node:assert/strict';

const api = await import('../src/lib/api.js');

function response(status, data, contentType = 'application/json') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : '' },
    json: async () => data,
    text: async () => typeof data === 'string' ? data : data && typeof data === 'object' ? JSON.stringify(data) : '',
  };
}

const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
try {
  globalThis.document = { cookie: '' };
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return response(204, '', ''); // logoff
    return response(403, { message: 'invalid credentials' });
  };

  await assert.rejects(
    () => api.login('invalid-test@example.invalid', 'invalid-test-only'),
    (error) => error.status === 403 && error.message === 'Email atau password tidak valid.',
  );
  assert.equal(calls.length, 2, '403 must not retry with another credential format');
  assert.equal(calls[1].options.credentials, 'include');
  assert.equal(calls[1].options.headers['Content-Type'], 'application/x-www-form-urlencoded');

  calls.length = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return response(204, '', ''); // logoff
    if (calls.length === 2) return response(415, { message: 'unsupported content-type' });
    if (calls.length === 3) return response(200, { username: 'invalid-test@example.invalid', cn: 'Dummy' });
    if (calls.length === 4 || calls.length === 5) return response(200, '<html><body>Authenticated SOGo shell</body></html>', 'text/html');
    return response(200, { mailboxes: [] }, 'application/json'); // protected mailbox proof
  };

  const result = await api.login('invalid-test@example.invalid', 'invalid-test-only');
  assert.equal(result.sogoToken, 'invalid-test@example.invalid');
  assert.equal(calls.length, 6, 'format fallback plus shell and protected mailbox warm-up expected');
  assert.equal(calls[1].options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(calls[2].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[2].options.credentials, 'include');
  assert.match(calls[3].url, /\/SOGo\/so\/invalid-test@example\.invalid$/);
  assert.match(calls[4].url, /\/SOGo\/so\/invalid-test@example\.invalid\/Mail\/view$/);
  assert.match(calls[5].url, /\/SOGo\/so\/invalid-test@example\.invalid\/Mail\/0\/view$/);

  calls.length = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return response(204, '', ''); // logoff
    if (calls.length === 2) return response(200, '', 'application/json'); // SOGo empty-body success
    if (calls.length === 3 || calls.length === 4) return response(200, '<html><body>Authenticated SOGo shell</body></html>', 'text/html');
    return response(200, 'generic upstream page', 'text/html'); // protected mailbox proof rejects non-JSON
  };

  await assert.rejects(
    () => api.login('invalid-test@example.invalid', 'invalid-test-only'),
    (error) => error.status === 401 && error.message.includes('Sesi SOGo tidak terbentuk'),
  );
  assert.equal(calls.length, 5, 'failed mailbox proof must stop after both shell routes');
  assert.match(calls[3].url, /\/Mail\/view$/);
  assert.match(calls[4].url, /\/Mail\/0\/view$/);

  calls.length = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return response(204, '', ''); // logoff
    if (calls.length === 2) return response(200, '', 'application/json'); // empty-body connect success
    return response(200, '<html><body>LoginController <input name="userName"><input name="password"></body></html>', 'text/html');
  };

  await assert.rejects(
    () => api.login('invalid-test@example.invalid', 'invalid-test-only'),
    (error) => error.status === 401 && error.message.includes('Sesi SOGo tidak terbentuk'),
  );
  assert.equal(calls.length, 3, 'login-page HTML must stop warm-up immediately');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
}

console.log('login flow assertions passed');
