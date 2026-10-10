import assert from 'node:assert/strict';
import fs from 'node:fs';

// ── Assertion statis fitur compose ala Outlook (pola test-draft-compose) ─────
// Logika React tidak bisa dijalankan di Node tanpa transpile JSX, jadi yang
// diverifikasi adalah kontrak di source: shortcut, mode jendela, chip
// penerima, pengaman kirim, jadwal, toolbar, toast, alur sukses.
const compose = fs.readFileSync('src/components/mailer/ComposeModal.jsx', 'utf8');
const toastUi = fs.readFileSync('src/components/Toast.jsx', 'utf8');
const toastLib = fs.readFileSync('src/lib/toast.js', 'utf8');
const paste = fs.readFileSync('src/lib/pasteUtils.js', 'utf8');

let passCount = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passCount++; };

// ── Kontrak 1: mode asli dipertahankan, forward tidak pakai caret balasan ─────
ok(compose.includes("const realMode = normalizeComposeMode(initialData?.composeMode);"), 'mode asli (new/reply/replyAll/forward/draft) dipertahankan');
ok(compose.includes("const isReplyLike = isReplyLikeMode(realMode);"), 'isReplyLike diturunkan utk caret');
ok(compose.includes("const composeMode = signatureModeFor(realMode);"), 'composeMode = mode signature');
ok(compose.includes("isReplyLike && prefs?.defaults?.SOGoMailReplyPlacement === 'below'"), 'caret posisi balasan hanya utk reply-like');
ok(compose.includes("isReplyLike || realMode === 'forward' ? 'start' : undefined"), 'forward: caret di atas, bukan logika posisi balasan');
ok(!compose.includes("composeMode === 'reply' && prefs?.defaults?.SOGoMailReplyPlacement"), 'logika caret lama (composeMode reply) tidak boleh kembali');
ok(compose.includes("aria-label={ariaLabel}") && compose.includes('composeAriaLabel(realMode, subject)'), 'aria-label dialog per mode asli');
ok(compose.includes('composeWindowTitle(realMode, subject)'), 'judul header per mode + subjek');
// Threading diteruskan ke sendMessage & saveDraft
ok(compose.includes("inReplyTo: initialData?.inReplyTo || ''") && compose.includes("references: initialData?.references || ''")
  && compose.includes("sourceFolder: initialData?.sourceFolder || ''") && compose.includes("sourceUid: initialData?.sourceUid || ''"),
  'threading dibaca dari initialData');
ok((compose.match(/\.\.\.threading,/g) || []).length >= 3, 'threading di-spread ke saveDraft, sendMessage, dan snapshot');

// ── Kontrak 2: onReopen + undo tidak merekam penerima ────────────────────────
ok(compose.includes('export default function ComposeModal({ isOpen, onClose, onReopen,'), 'prop onReopen ada');
ok(compose.includes('onReopen?.(snapshot)'), 'Urungkan → onReopen(snapshot)');
ok(compose.includes('buildReopenSnapshot({'), 'snapshot dibangun via composeUtils');
ok(compose.includes('reopened: true'), 'snapshot ditandai reopened (signature tidak disuntik ulang)');
ok(compose.includes("if (initialData?.reopened) { sigInjected.current = true; return; }"), 'reopen tidak menyuntik signature ganda');
ok(compose.includes('onCommitted: () => recordSentRecipients(user?.email, to, cc, bcc)'), 'penerima direkam lewat onCommitted (setelah kiriman pasti jalan)');
{
  const queued = compose.slice(compose.indexOf('if (res?.queued && res?.id) {'), compose.indexOf('setSuccess(true);'));
  ok(!/^\s*recordSentRecipients\(/m.test(queued), 'jalur queued TIDAK memanggil recordSentRecipients langsung sebelum undo');
}
ok(compose.includes('settled = true;') && compose.includes('const commit = () => {'), 'commit sekali: undo vs countdown habis vs toast ditutup');

// ── A. Keyboard ──────────────────────────────────────────────────────────────
ok(compose.includes('onKeyDown={handleDialogKeyDown}'), 'dialog punya handler keyboard');
ok(compose.includes("if (e.key === 'Escape') {") && compose.includes('handleClose();'), 'Esc → handleClose (konfirmasi bila dirty)');
ok(compose.includes("(e.ctrlKey || e.metaKey) && e.key === 'Enter'"), 'Ctrl/Cmd+Enter → kirim');
ok(compose.includes("title: 'Buang perubahan?'") && compose.includes("label: 'Simpan draf'") && compose.includes("label: 'Buang'") && compose.includes("label: 'Batal'"),
  'dialog Buang perubahan: Simpan draf / Buang / Batal');
ok(compose.includes("if (e.shiftKey) { exec('outdent'); return; }"), 'Shift+Tab → outdent');
ok(compose.includes("e.key.toLowerCase() === 'k'") && compose.includes('openLinkPopover();'), 'Ctrl/Cmd+K → tautan');
ok(compose.includes('discardRef'), 'guard discardRef utk autosave in-flight saat Buang');
ok(compose.includes('if (discardRef.current) {'), 'runAutosave membersihkan hasil save setelah Buang');

// ── B. Mode jendela ──────────────────────────────────────────────────────────
ok(compose.includes('const [isMinimized, setIsMinimized]'), 'state minimize');
ok(compose.includes("'fixed bottom-0 right-0 sm:right-6 z-50 pointer-events-none'"), 'minimize: docked bar kanan bawah tanpa backdrop');
ok(compose.includes('aria-modal={!isMinimized}'), 'minimize: bukan modal');
ok(compose.includes("${isMinimized ? 'hidden' : 'flex'} flex-col flex-1 overflow-hidden"), 'form disembunyikan (tetap mounted → autosave jalan)');
ok(compose.includes('aria-label="Ciutkan jendela compose"') && compose.includes('aria-label="Pulihkan jendela compose"'), 'tombol ciutkan/pulihkan');
ok(compose.includes('hidden sm:flex" title="Ciutkan"'), 'ciutkan hanya desktop (mobile tetap layar penuh)');
ok(compose.includes("setIsFullscreen(!isFullscreen)"), 'toggle layar penuh tetap ada');

// ── C. Chip penerima ─────────────────────────────────────────────────────────
ok(compose.includes('const chips = emails.map(parseRecipientChip);'), 'chip diparse (nama/email/valid)');
ok(compose.includes('{chip.name || chip.email || chip.raw}'), 'chip menampilkan nama tampilan');
ok(compose.includes('title={chip.valid ? chip.email : chip.error}'), 'title chip = email / pesan error');
ok(compose.includes("'bg-destructive/10 text-destructive border-destructive/40'"), 'chip tidak valid merah');
ok(compose.includes('const next = addRecipients(emails, text);'), 'tambah chip via addRecipients (dedup case-insensitive)');
ok(compose.includes("e.key === 'ArrowDown' && hasList") && compose.includes("e.key === 'ArrowUp' && hasList"), 'panah navigasi saran');
ok(compose.includes("hasList && activeIdx >= 0 && (e.key === 'Enter' || e.key === 'Tab')"), 'Enter/Tab mengambil saran tersorot');
ok(compose.includes('onDoubleClick={() => editChip(i)}'), 'dobel-klik chip → edit');
ok(compose.includes('onPaste={handlePaste}') && compose.includes('looksLikeRecipientList('), 'tempel daftar alamat → pecah jadi chip');
ok(compose.includes("if (inputValue.trim()) addFromText(inputValue);"), 'validasi saat blur (teks sisa jadi chip)');
ok(compose.includes('{invalidChips[0].error}'), 'pesan inline menyebut alamat tidak valid');
ok(compose.includes("firstInvalidRecipient(value) || firstInvalidChip(value)?.raw"), 'kirim diblokir oleh aturan server + chip klien');
ok(compose.includes('role="combobox"') && compose.includes('aria-activedescendant='), 'combobox a11y');

// ── D. Pengaman ──────────────────────────────────────────────────────────────
ok(compose.includes('needsAttachmentReminder({ subject, body, attachments })'), 'pengingat lampiran sebelum kirim');
ok(compose.includes("title: 'Kirim tanpa lampiran?'") && compose.includes("label: 'Kirim saja'") && compose.includes("label: 'Lampirkan file'"), 'dialog pengingat lampiran');
ok(compose.includes('const attachmentsReading = attachments.some((a) => a.pending);'), 'deteksi lampiran masih dibaca');
ok(compose.includes('disabled={sending || success || attachmentsReading}'), 'Kirim dinonaktifkan saat lampiran masih dibaca');
ok(compose.includes('pending: true, // masih dibaca FileReader'), 'entri lampiran baru ditandai pending');
ok(compose.includes("{ ...a, data: b64, pending: false }"), 'pending dihapus setelah terbaca');
ok(compose.includes('tidak memiliki data — hapus lalu lampirkan ulang'), 'lampiran tanpa data tidak dibuang diam-diam');
ok(compose.includes("window.addEventListener('beforeunload', guard);"), 'beforeunload saat dirty');
ok(compose.includes("title: 'Ubah ke Teks Biasa?'"), 'ganti ke Plain minta konfirmasi');
ok(compose.includes('role="alert" className="sticky top-0 z-10'), 'banner error sticky di atas area scroll');
ok(compose.includes("setError('');\n  }, []);") && compose.includes('userEditedRef.current = true;\n    setDirty(true);'), 'error dibersihkan pada edit berikutnya');
ok(compose.includes('aria-label="Tutup pesan error"'), 'banner error bisa ditutup');

// ── E. Jadwal ────────────────────────────────────────────────────────────────
ok(compose.includes('value={schedulePick ? formatLocalDateTimeInput(new Date(schedulePick)) : \'\'}'), 'datetime-local value LOKAL');
ok(compose.includes('min={formatLocalDateTimeInput(new Date(Date.now() + 60_000))}'), 'datetime-local min LOKAL (konsisten dgn value)');
ok(!compose.includes('toISOString().slice(0, 16)'), 'bug UTC slice hilang');
ok(compose.includes('onChange={(e) => setSchedulePick(parseLocalDateTimeInput(e.target.value))}'), 'parse input lokal');
ok(compose.includes('`Kirim ${formatScheduleLabel(schedulePick)}`'), 'label tombol jadwal = tanggal + jam');
ok(compose.includes('`Dijadwalkan ${formatScheduleLabel(deadline)}.`'), 'toast jadwal "Dijadwalkan <tanggal jam>"');
ok(compose.includes("label: scheduled ? 'Batalkan' : 'Urungkan'"), 'toast jadwal: Batalkan; undo send: Urungkan');
ok(compose.includes("if (!scheduled) useToastStore.getState().updateToast(toastId, { message: messageFor() });"), 'countdown hanya utk undo send (bukan jadwal berjam-jam)');
ok(compose.includes('formatCountdown(remaining())'), 'countdown via formatCountdown (format jam utk >60 mnt)');

// ── F. Toolbar ───────────────────────────────────────────────────────────────
for (const cmd of ['strikeThrough', 'foreColor', 'justifyLeft', 'justifyCenter', 'justifyRight', 'removeFormat', "cmd: 'undo'", "cmd: 'redo'"]) {
  ok(compose.includes(cmd), `toolbar: ${cmd}`);
}
ok(compose.includes("{ type: 'link' }") && compose.includes('applyLink'), 'toolbar: tautan');
ok(compose.includes("'hiliteColor' : 'backColor'"), 'toolbar: stabilo (hiliteColor dgn fallback)');
ok(compose.includes('spellCheck\n        lang="id"'), 'editor: spellcheck + lang id');
ok(compose.includes('if (images.length > 0) await insertImageFiles(images, editorRef, onChange);'), 'drop beberapa gambar → semua disisipkan');
ok(compose.includes('accept="image/*" multiple'), 'upload gambar multi-file');
ok(compose.includes("if (/^(javascript|data|vbscript):/i.test(s)) return '';"), 'URL tautan: skema berbahaya ditolak');
ok(compose.includes('onMouseDownCapture={saveSelection}'), 'seleksi disimpan sebelum fokus pindah ke toolbar');
ok(paste.includes('export async function insertImageFiles(files, editorRef, onChange)'), 'pasteUtils: insertImageFiles');
ok(paste.includes('await insertImageFiles(imageFiles, editorRef, onChange);'), 'paste beberapa gambar → semua disisipkan');
ok(!paste.includes('insertImageFile(imageFiles[0]'), 'paste tidak lagi hanya gambar pertama');

// ── G. Toast ─────────────────────────────────────────────────────────────────
ok(toastUi.includes('role="status"') && toastUi.includes('aria-live="polite"'), 'kontainer toast live region');
ok(!toastUi.includes('if (toasts.length === 0) return null;'), 'live region selalu ada di DOM (bukan unmount saat kosong)');
ok(toastUi.includes('undo: Undo2,') && toastUi.includes('cancel: Ban,'), 'ikon tombol aksi per jenis');
ok(toastUi.includes('aria-label="Tutup notifikasi"'), 'tombol tutup toast ber-label');
ok(toastLib.includes("kind: 'undo'"), 'toast.undo menandai kind undo');
ok(compose.includes("kind: scheduled ? 'cancel' : 'undo'"), 'compose: ikon Batalkan vs Urungkan');

// ── H. Alur sukses ───────────────────────────────────────────────────────────
ok(compose.includes("toast.success('Email terkirim.');\n      onClose();"), 'sukses kirim → toast + tutup segera');
ok(!compose.includes('setTimeout(() => onClose(), 1500)'), 'modal tidak ditahan 1,5 dtk');
ok(!compose.includes('✓ Email berhasil dikirim!'), 'banner sukses lama dihapus');

console.log('\nCompose Outlook audit: ' + passCount + ' assertions PASS ✅');
