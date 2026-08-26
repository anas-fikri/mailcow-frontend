import assert from 'node:assert/strict';
import fs from 'node:fs';

// ── Assertion statis untuk alur compose/draft (pola test-a11y) ───────────────
// Memverifikasi guard race autosave + alur edit-draft hadir di source, karena
// logika React tidak bisa dijalankan langsung di Node tanpa transpile JSX.
const compose = fs.readFileSync('src/components/mailer/ComposeModal.jsx', 'utf8');
const mail = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
const reader = fs.readFileSync('src/components/mailer/MessageReader.jsx', 'utf8');
const lib = fs.readFileSync('src/lib/messageHtml.js', 'utf8');

let passCount = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passCount++; };

// ── Race 1: autosave tidak boleh tumpuk (stale overwrite konten lebih baru) ──
ok(/autosaveBusy\s+= useRef\(false\)/.test(compose), 'guard autosaveBusy harus ada');
ok(compose.includes('if (autosaveBusy.current) { autosaveDirty.current = true; return; }'),
  'autosave sibuk → tandai dirty + skip (bukan tumpuk)');
ok(compose.includes('if (autosaveDirty.current) {\n        clearTimeout(saveTimerRef.current);\n        saveTimerRef.current = setTimeout(() => { runAutosave(); }, 3000);'),
  'finally harus jadwalkan ulang bila ada perubahan baru selama autosave');

// ── Race 2: autosave in-flight saat Send → draft tidak boleh yatim ──────────
ok(/sentRef\s+= useRef\(false\)/.test(compose), 'guard sentRef harus ada');
ok(compose.includes('clearTimeout(saveTimerRef.current);\n    autosaveDirty.current = false;\n    sentRef.current = false;'),
  'handleSend harus hentikan timer autosave sebelum kirim');
ok(compose.includes("if (sentRef.current) {"), 'runAutosave harus cek sentRef setelah save');
ok(compose.includes('const staleUids = [editingDraftUidRef.current, uid || draftUidRef.current].filter(Boolean);'),
  'autosave pasca-kirim harus bersihkan draft asli + autosave');
ok(compose.includes('const uidsToDelete = [editingDraftUidRef.current, draftUidRef.current].filter(Boolean);'),
  'handleSend harus hapus draft asli (edit-draft) + draft autosave');

// ── Gerbang autosave: hanya setelah user mengedit (buka draft ≠ buat salinan) ─
ok(/userEditedRef\s+= useRef\(false\)/.test(compose), 'guard userEditedRef harus ada');
ok(compose.includes('if (!userEditedRef.current) return;'),
  'autosave hanya boleh jalan setelah user mengubah apa pun');
ok(compose.includes('markUserEdited(); setTo(v)') && compose.includes('markUserEdited(); setCc(v)')
  && compose.includes('markUserEdited(); setBcc(v)'), 'field to/cc/bcc harus tandai userEdited');
ok(compose.includes('markUserEdited(); setSubject(e.target.value)'), 'subject harus tandai userEdited');
ok(compose.includes('markUserEdited(); setBody(v)'), 'editor rich harus tandai userEdited');
ok(compose.includes('markUserEdited(); setBody(e.target.value)'), 'textarea html/plain harus tandai userEdited');

// ── Edit draft: klik draft di folder Draf → buka compose (bukan reader) ──────
ok(mail.includes("composeMode: 'draft'"), 'openDraftForEdit harus set composeMode draft');
ok(mail.includes('draftUid: uid'), 'initialData harus membawa uid draft asli (untuk dibersihkan saat kirim)');
ok(mail.includes('if (isDraftFolder) {\n      openDraftForEdit(uid);\n      return;\n    }'),
  'handleRowClick di folder Draf harus buka editor, bukan reader');
ok(mail.includes("extractHtml(detail.parts)"), 'isi draft diambil dari detail.parts');
ok(compose.includes("editingDraftUidRef.current = initialData?.draftUid || null;"),
  'ComposeModal harus menyimpan uid draft asli saat edit');
ok(compose.includes("if (initialData?.composeMode === 'draft') { sigInjected.current = true; return; }"),
  'draft yang dibuka tidak boleh disuntik signature ganda');

// ── Restorasi lampiran saat edit draft ───────────────────────────────────────
ok(lib.includes('export function extractAttachments(parts, result = [])'),
  'extractAttachments harus ada di messageHtml.js');
ok(reader.includes('extractAttachments'), 'MessageReader harus pakai extractAttachments dari lib');
ok(!reader.includes('function extractAttachments(parts, result = [])'),
  'MessageReader tidak boleh punya duplikat extractAttachments lokal');
ok(mail.includes('fetchAttachmentData(att.downloadURL)'),
  'openDraftForEdit harus mengunduh tiap lampiran draft via downloadURL');
ok(mail.includes('Promise.allSettled('), 'restorasi multi-lampiran harus paralel + toleran gagal');
ok(mail.includes('attachments: restoredAttachments'), 'initialData harus membawa lampiran hasil restorasi');
ok(compose.includes('Array.isArray(initialData?.attachments)'),
  'ComposeModal harus seed attachments dari initialData');
ok(mail.includes("fetchAttachmentData,") || mail.includes('fetchAttachmentData,'),
  'fetchAttachmentData harus di-import di MailPage');

// ── extractHtml dipindah ke lib + dipakai reader & mail (dedup) ──────────────
ok(lib.includes('export function extractHtml(parts)'), 'extractHtml harus ada di messageHtml.js');
ok(/import \{ extractHtml, extractAttachments \} from '..\/..\/lib\/messageHtml'/.test(reader), 'MessageReader harus import dari lib');
ok(!reader.includes('function extractHtml(parts)'), 'MessageReader tidak boleh punya duplikat extractHtml lokal');
// Preferensi html di kedalaman mana pun (bug latent: plain bisa menang bila
// text/plain ada di urutan part lebih awal dari html yang bersarang).
ok(lib.includes('const html = findHtml(parts);'), 'extractHtml harus prefer html di kedalaman mana pun');

// ── Tutup compose mode EDIT DRAFT tanpa kirim → hapus copy autosave ─────────
// Autosave saat edit draft menyimpan ke draft BARU (copy) — tutup tanpa kirim
// membuat 2 draft (asli + copy) di folder Draf = duplikat. handleClose harus
// menghapus copy, menyisakan draft asli.
ok(compose.includes('function handleClose()'), 'ComposeModal punya handleClose (cleanup tutup)');
ok(compose.includes("if (copyUid && copyUid !== editingDraftUidRef.current)"), 'handleClose hapus copy autosave bila beda dari draft asli');
ok(compose.includes('deleteDraft(token, copyUid)'), 'copy dihapus via deleteDraft');
ok(compose.includes('onClick={handleClose}'), 'tombol X memakai handleClose');

console.log('\nDraft/compose audit: ' + passCount + ' assertions PASS ✅');
