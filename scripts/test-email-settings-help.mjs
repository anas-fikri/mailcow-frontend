/**
 * REGRESSION — fitur ?domain= pada public/help/email-settings.html.
 *
 * Latar belakang (2026-09-05): script aslinya INLINE di HTML → diblokir CSP
 * `script-src 'self'` di produksi → fitur mati senyap (host IMAP/SMTP selalu
 * mail.example.net walau user dari domain lain). Setelah diekstrak ke
 * email-settings.js eksternal, fitur hidup lagi — dan ekspos bug lain: link
 * relatif <a class="host" href="/webmail/">webmail</a> ikut diganti
 * textContent-nya menjadi "mail.X" (teks link menyesatkan).
 *
 * Kontrak yang dikunci:
 *  1. Dengan ?domain=example.com → semua host IMAP/SMTP (bukan id=mail-host,
 *     bukan <a>) menjadi mail.example.com.
 *  2. Baris canonical id="mail-host" tetap mail.example.net.
 *  3. Link relatif <a class="host"> tetap text "webmail" (href relatif tetap benar).
 *  4. Tanpa ?domain= → semua elemen .host tidak berubah.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../public/help/email-settings.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/help/email-settings.js', import.meta.url), 'utf8');

function run(url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  dom.window.eval(script);
  return [...dom.window.document.querySelectorAll('.host')].map((el) => ({
    id: el.id || '', tag: el.tagName, href: el.getAttribute('href') || '', text: el.textContent,
  }));
}

// 1+2+3: dengan ?domain=
const withDomain = run('https://mail.example.com/webmail/help/email-settings.html?domain=example.com');
const swapTargets = withDomain.filter((r) => r.id !== 'mail-host' && r.tag !== 'A');
assert.ok(swapTargets.length >= 7, `host IMAP/SMTP yang bisa diganti minimal 7, dapat ${swapTargets.length}`);
for (const r of swapTargets) {
  assert.equal(r.text, 'mail.example.com', `host ${r.id || r.tag} harus terganti`);
}
const canonical = withDomain.find((r) => r.id === 'mail-host');
assert.equal(canonical.text, 'mail.example.net', 'baris canonical mail-host tidak boleh berubah');
const webmailLink = withDomain.find((r) => r.tag === 'A');
assert.equal(webmailLink.text, 'webmail', 'link relatif webmail tidak boleh diganti text-nya');
assert.equal(webmailLink.href, '/webmail/', 'href link webmail tetap relatif');

// 4: tanpa ?domain=
const noDomain = run('https://mail.example.com/webmail/help/email-settings.html');
for (const r of noDomain) {
  assert.ok(['webmail', 'mail.example.net'].includes(r.text), `tanpa ?domain= tidak ada perubahan: ${r.text}`);
}

console.log('✅ email-settings help: host IMAP/SMTP terganti per domain, canonical & link webmail dipertahankan, tanpa ?domain= tidak berubah');