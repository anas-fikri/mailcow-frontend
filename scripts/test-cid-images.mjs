import assert from 'node:assert/strict';

// Run standalone (tanpa transpile): re-implement minimal via dynamic import setelah build? Tidak —
// file lib murni ESM, Node bisa import langsung.
const { extractCidReferences, resolveCidReferences } = await import('../src/lib/cidImages.js');

const SOGO_URL = 'https://mail.test/SOGo/so/user/Mail/0/folderINBOX/12/part/3.2';
const toSafeUrl = (u) => (u && u.startsWith('/SOGo/so/') ? `https://mail.test${u}` : u ? SOGO_URL : null);

// ── extractCidReferences ──
assert.deepEqual(
  extractCidReferences('<img src="cid:image001.png@01DB3A12"><img src=\'cid:b.png\'>'),
  ['image001.png@01DB3A12', 'b.png']
);
assert.deepEqual(extractCidReferences('<p>tanpa cid</p>'), []);
assert.deepEqual(extractCidReferences(''), []);

// ── resolveCidReferences: Outlook-style cid:name.ext@uuid ──
const outlookImages = [
  { name: 'image001.png', downloadURL: '/SOGo/so/user/Mail/0/folderINBOX/12/part/3.2' },
];
const outlookHtml = '<div><img src="cid:image001.png@01DB3A12F4C5" width="100"></div>';
const out1 = resolveCidReferences(outlookHtml, outlookImages, toSafeUrl, {});
assert.ok(out1.includes(`src="${SOGO_URL}"`), 'Outlook cid:name.ext@uuid harus resolve');
assert.ok(!out1.includes('cid:'), 'tidak ada cid tersisa untuk case match');

// ── cid tanpa ekstensi (cid:logo) utk file logo.png ──
const out2 = resolveCidReferences('<img src="cid:logo">', [{ name: 'logo.png', downloadURL: '/SOGo/so/x' }], toSafeUrl, {});
assert.ok(out2.includes('src="https://mail.test/SOGo/so/x"'), 'cid tanpa ekstensi harus resolve via stem');

// ── cid persis nama file ──
const out3 = resolveCidReferences('<img src="cid:logo.png">', [{ name: 'logo.png', downloadURL: '/SOGo/so/x' }], toSafeUrl, {});
assert.ok(out3.includes('https://mail.test/SOGo/so/x'));

// ── contentId persis (dgn angle bracket) menang sebelum fallback nama ──
const out4 = resolveCidReferences(
  '<img src="cid:xyz@abc">',
  [{ name: 'other.png', contentId: '<xyz@abc>', downloadURL: '/SOGo/so/cid-match' }],
  toSafeUrl, {}
);
assert.ok(out4.includes('https://mail.test/SOGo/so/cid-match'));

// ── single quotes ──
const out5 = resolveCidReferences("<img src='cid:a.png@01DD'>", [{ name: 'a.png', downloadURL: '/SOGo/so/q' }], toSafeUrl, {});
assert.ok(out5.includes('src="https://mail.test/SOGo/so/q"'));

// ── referensi tanpa match: dibiarkan utuh ──
const out6 = resolveCidReferences('<img src="cid:unknown@01DB">', outlookImages, toSafeUrl, {});
assert.ok(out6.includes('cid:unknown@01DB'), 'cid tanpa match jangan diubah');

// ── inlineImages kosong / html kosong: no-op ──
assert.equal(resolveCidReferences('<img src="cid:x">', [], toSafeUrl, {}), '<img src="cid:x">');
assert.equal(resolveCidReferences('', outlookImages, toSafeUrl, {}), '');

// ── toSafeUrl null (URL tidak aman) → jangan replace dgn "null"/"undefined" ──
const out7 = resolveCidReferences('<img src="cid:a.png@01">', [{ name: 'a.png', downloadURL: 'http://evil/x' }], () => null, {});
assert.ok(out7.includes('cid:a.png@01'), 'URL ditolak toSafeUrl → cid utuh');

console.log('✓ test-cid-images: semua assertion lulus (8 grup kasus)');
