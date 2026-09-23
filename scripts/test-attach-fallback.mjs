import assert from 'node:assert/strict';
import { extractAttachments, parseAttachmentCard, isInlineBodyImage } from '../src/lib/messageHtml.js';

// ── parseAttachmentCard: card HTML asli dari serializer JSON SOGo 5.12.9 ─────
// (sample diambil live dari /view?Accept:application/json, part xlsx tanpa
// viewer — round-53 repo mailcow-dashboard, diagnosa lampiran hilang)
const CARD_HTML = `
  <md-card>
    <md-card-content>
      <p title="ICT.xlsx" class="md-caption sg-attachment-name">
        ICT.xlsx
      </p>
    </md-card-content>
    <md-dialog-actions layout="row" layout-align="end center">
      <div class="md-flex sg-attachment-size">
        41.5 KiB
      </div>
      <md-button href="/SOGo/so/user@pcpexpress.com/Mail/0/folderINBOX/1133/2/ICT.xlsx" class="sg-icon-button" target="_blank">
        <md-tooltip md-direction="left">View Attachment</md-tooltip>
      </md-button>
      <md-button href="/SOGo/so/user@pcpexpress.com/Mail/0/folderINBOX/1133/2/asAttachment/ICT.xlsx" class="sg-icon-button">
        <md-tooltip md-direction="left">Save Attachment</md-tooltip>
      </md-button>
    </md-dialog-actions>
  </md-card>
`;
const card = parseAttachmentCard(CARD_HTML);
assert.ok(card, 'card harus ter-parse');
assert.equal(card.downloadURL, '/SOGo/so/user@pcpexpress.com/Mail/0/folderINBOX/1133/2/asAttachment/ICT.xlsx');
assert.equal(card.filename, 'ICT.xlsx');
assert.equal(card.size, '41.5 KiB');

// URL absolut direlatifkan + entity &amp; di-unescape
const cardAbs = parseAttachmentCard('<md-button href="https://mail.pcpexpress.com/SOGo/so/u@d/Mail/0/f/1/asAttachment/a&amp;b.txt"></md-button>');
assert.equal(cardAbs.downloadURL, '/SOGo/so/u@d/Mail/0/f/1/asAttachment/a&b.txt');
assert.equal(cardAbs.filename, 'a&b.txt');

// Bukan card → null
assert.equal(parseAttachmentCard('plain text'), null);
assert.equal(parseAttachmentCard('<p>tanpa link</p>'), null);
assert.equal(parseAttachmentCard(null), null);
assert.equal(parseAttachmentCard(undefined), null);

// ── extractAttachments: tree JSON persis seperti respons SOGo utk pesan
// herlina (round-53): nested related + gambar (metadata lengkap) + xlsx
// top-level (metadata kosong, content = card HTML) ───────────────────────────
const SOGO_TREE = {
  contentType: 'multipart/mixed',
  type: 'UIxMailPartMixedViewer',
  content: [
    {
      contentType: 'multipart/related',
      type: 'UIxMailPartMixedViewer',
      content: [
        {
          preferredPart: '1',
          type: 'UIxMailPartAlternativeViewer',
          content: [
            { contentType: 'text/plain', filename: 'untitled-1-1-1', shouldDisplayAttachment: 1, content: 'body' },
            { contentType: 'text/html', filename: 'untitled-1-1-2', content: '<p>body</p>' },
          ],
        },
        { contentType: 'image/jpeg', filename: 'image001.jpg', shouldDisplayAttachment: 1, size: '7.4 KiB', viewURL: '/SOGo/so/u/Mail/0/folderINBOX/1133/1/2/image001.jpg', downloadURL: '/SOGo/so/u/Mail/0/folderINBOX/1133/1/2/asAttachment/image001.jpg', content: 'img' },
        { contentType: 'image/jpeg', filename: 'image002.jpg', shouldDisplayAttachment: 1, size: '4.8 KiB', viewURL: '/SOGo/so/u/Mail/0/folderINBOX/1133/1/3/image002.jpg', downloadURL: '/SOGo/so/u/Mail/0/folderINBOX/1133/1/3/asAttachment/image002.jpg', content: 'img' },
      ],
    },
    { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'ICT.xlsx', type: 'UIxMailPartLinkViewer', content: CARD_HTML },
  ],
};
const atts = extractAttachments(SOGO_TREE);
const names = atts.map((a) => a.name);
assert.ok(names.includes('ICT.xlsx'), `xlsx harus masuk daftar (dapat: ${names})`);
assert.ok(names.includes('image001.jpg') && names.includes('image002.jpg'), 'gambar tetap masuk');
assert.equal(atts.length, 3, 'text/plain & text/html bukan lampiran');
const xlsx = atts.find((a) => a.name === 'ICT.xlsx');
assert.equal(xlsx.downloadURL, '/SOGo/so/user@pcpexpress.com/Mail/0/folderINBOX/1133/2/asAttachment/ICT.xlsx');
assert.equal(xlsx.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
assert.equal(xlsx.size, '41.5 KiB');
assert.equal(xlsx.inline, false);

// ── Regresi perilaku lama ─────────────────────────────────────────────────────
// Part inline CID (flag 0) tetap dikecualikan dari daftar default.
const withInline = extractAttachments({
  contentType: 'multipart/mixed',
  content: [
    { contentType: 'image/png', filename: 'footer.png', shouldDisplayAttachment: 0, size: '1 KiB', downloadURL: '/SOGo/so/u/Mail/0/f/1/2/asAttachment/footer.png' },
    { contentType: 'application/pdf', filename: 'doc.pdf', shouldDisplayAttachment: 1, size: '2 KiB', downloadURL: '/SOGo/so/u/Mail/0/f/1/3/asAttachment/doc.pdf' },
  ],
});
assert.deepEqual(withInline.map((a) => a.name), ['doc.pdf']);
// includeHidden: inline tetap ikut (jalur draft/.eml)
const hidden = extractAttachments(withInlineTree(), [], { includeHidden: true });
assert.deepEqual(hidden.map((a) => a.name), ['footer.png', 'doc.pdf']);
function withInlineTree() {
  return {
    contentType: 'multipart/mixed',
    content: [
      { contentType: 'image/png', filename: 'footer.png', shouldDisplayAttachment: 0, size: '1 KiB', downloadURL: '/SOGo/so/u/Mail/0/f/1/2/asAttachment/footer.png' },
      { contentType: 'application/pdf', filename: 'doc.pdf', shouldDisplayAttachment: 1, size: '2 KiB', downloadURL: '/SOGo/so/u/Mail/0/f/1/3/asAttachment/doc.pdf' },
    ],
  };
}

// Part tanpa metadata & tanpa card → tetap gak muncul (bukan lampiran).
const noCard = extractAttachments({ contentType: 'application/zip', filename: 'x.zip', content: 'raw-garbage' });
assert.equal(noCard.length, 0);

// ── isInlineBodyImage: gambar body (footer/banner/signature) bukan lampiran ──
const BODY_HTML = '<img src="/SOGo/so/u/Mail/0/f/1/2/image001.jpg"><p>footer</p><img src="https://x/logo.png">';

// 1. Nama file ke-refer utuh di body → inline (sembunyikan)
assert.equal(isInlineBodyImage({ name: 'image001.jpg', contentType: 'image/jpeg' }, BODY_HTML), true);
// 2. Nama TIDAK ada di body → lampiran asli (tetap tampil) — juga memastikan
//    substring tidak salah match ("logo.png" ≠ "foto-lain.png"; "lain.png" pun
//    tidak match karena match harus filename UTUH sbg substring).
assert.equal(isInlineBodyImage({ name: 'ICT.xlsx', contentType: 'application/vnd.ms-excel' }, BODY_HTML), false);
assert.equal(isInlineBodyImage({ name: 'foto-lain.png', contentType: 'image/png' }, BODY_HTML), false);

// 3. CID klasik Outlook di body (token mentah) → inline
assert.equal(isInlineBodyImage(
  { name: 'image002.jpg', contentType: 'image/jpeg' },
  '<img src="cid:image002.jpg@01DD49E3.1FC745E0">',
), true);

// 4. URL-encoded filename di body → inline
assert.equal(isInlineBodyImage(
  { name: 'banner%20atas.png', contentType: 'image/png' },
  '<img src="/SOGo/so/u/Mail/0/f/1/4/banner%20atas.png">',
), true);

// 5. Stem-saja TIDAK cukup: body menyebut kata "report" tapi file report-final.pdf beda
assert.equal(isInlineBodyImage({ name: 'report-final.pdf', contentType: 'application/pdf' }, '<p>kirim report segera</p>'), false);

// 6. Non-image selalu false (walaupun nama ke-refer)
assert.equal(isInlineBodyImage({ name: 'image001.jpg', contentType: 'application/octet-stream' }, BODY_HTML), false);

// 7. inline=true dari flag 0 (part CID) → true tanpa perlu body match
assert.equal(isInlineBodyImage({ name: 'footer.png', contentType: 'image/png', inline: true }, ''), true);

// 8. body kosong/att kosong → false (aman)
assert.equal(isInlineBodyImage({ name: 'a.jpg', contentType: 'image/jpeg' }, ''), false);
assert.equal(isInlineBodyImage(null, BODY_HTML), false);

console.log('attach-fallback assertions passed');
