import assert from 'node:assert/strict';
import {
  getFileKind, parseSizeToBytes, formatFileSize, totalAttachmentSize, fileExtension,
} from '../src/lib/attachments.js';

// ── getFileKind ───────────────────────────────────────────────────────────────
assert.equal(getFileKind('laporan.pdf'), 'pdf');
assert.equal(getFileKind('dokumen.PDF'), 'pdf');
assert.equal(getFileKind('arsip.zip'), 'archive');
assert.equal(getFileKind('data.tar.gz'), 'archive');
assert.equal(getFileKind('sheet.xlsx'), 'spreadsheet');
assert.equal(getFileKind('surat.docx'), 'document');
assert.equal(getFileKind('slide.pptx'), 'presentation');
assert.equal(getFileKind('foto.jpg'), 'image');
assert.equal(getFileKind('foto.webp'), 'image');
assert.equal(getFileKind('lagu.mp3'), 'audio');
assert.equal(getFileKind('video.mp4'), 'video');
assert.equal(getFileKind('app.js'), 'code');
assert.equal(getFileKind('tanpa-ekstensi'), 'other');

// contentType menang atas nama file.
assert.equal(getFileKind('x', 'image/png'), 'image');
assert.equal(getFileKind('x', 'application/pdf'), 'pdf');
assert.equal(getFileKind('x', 'audio/mpeg'), 'audio');
assert.equal(getFileKind('x', 'video/mp4'), 'video');

// ── parseSizeToBytes ──────────────────────────────────────────────────────────
assert.equal(parseSizeToBytes(1024), 1024);
assert.equal(parseSizeToBytes('1.2 MB'), Math.round(1.2 * 1024 * 1024));
assert.equal(parseSizeToBytes('500 KB'), 500 * 1024);
assert.equal(parseSizeToBytes('3.4 GB'), Math.round(3.4 * 1024 ** 3));
assert.equal(parseSizeToBytes('900 B'), 900);
assert.equal(parseSizeToBytes('2,5 MB'), Math.round(2.5 * 1024 * 1024)); // koma desimal
assert.equal(parseSizeToBytes(''), null);
assert.equal(parseSizeToBytes(null), null);
assert.equal(parseSizeToBytes('abc'), null);
assert.equal(parseSizeToBytes(0), null);

// ── formatFileSize ────────────────────────────────────────────────────────────
assert.equal(formatFileSize('1.2 MB'), '1.2 MB'); // string SOGo → tampilkan langsung
assert.equal(formatFileSize(0), '');
assert.equal(formatFileSize(''), '');
assert.equal(formatFileSize(1536 * 1024), '1.5 MB');
assert.equal(formatFileSize(512 * 1024), '512 KB');
// Sub-KB: bytes utuh, bukan "0 KB" (golden sample produksi: "144 B")
assert.equal(formatFileSize(144), '144 B');
assert.equal(formatFileSize(1023), '1023 B');

// ── totalAttachmentSize ───────────────────────────────────────────────────────
assert.equal(totalAttachmentSize([]), '');
assert.equal(totalAttachmentSize([{ size: '1 MB' }, { size: '512 KB' }]), '1.5 MB');
assert.equal(totalAttachmentSize([{ size: 1048576 }]), '1.0 MB');
assert.equal(totalAttachmentSize([{ size: 'abc' }]), ''); // tak terbaca → diabaikan

// ── fileExtension ─────────────────────────────────────────────────────────────
assert.equal(fileExtension('a.tar.gz'), 'gz');
assert.equal(fileExtension('README'), '');
assert.equal(fileExtension('file.name.with.dots.txt'), 'txt');

console.log('attachments assertions passed');
