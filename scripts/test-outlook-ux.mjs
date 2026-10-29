// Regresi statis: kontrak UX ala Outlook di MailPage (seleksi, keyboard,
// menu konteks, MoveToPicker, drag-and-drop, cache optimis, undo, tata letak
// readingPane, favorit, perbaikan bug daftar). Pola sama dgn test-a11y.
// Jalankan: node scripts/test-outlook-ux.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const mail = read('src/pages/MailPage.jsx');
const ctx = read('src/components/mailer/ContextMenu.jsx');
const picker = read('src/components/mailer/MoveToPicker.jsx');
const help = read('src/components/KeyboardShortcuts.jsx');

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

// ── A. Seleksi ala Outlook (logika murni di lib, dipakai di baris) ─────────
ok(mail.includes("from '../lib/mailSelection'"), 'MailPage memakai lib/mailSelection');
ok(mail.includes('resolveRowClick(') && mail.includes('onClick={(e) => (sentCopy ? handleSentCopyClick(e, msg) : handleRowClick(e, msg.uid, idx))}'), 'klik baris lewat resolveRowClick (ctrl/shift dari event)');
ok(mail.includes('toggleSelectAllUids('), 'pilih-semua lewat toggleSelectAllUids');

// ── B. Keyboard: resolusi di lib/keymap, handler via ref (deps tidak basi) ──
ok(mail.includes("from '../lib/keymap'") && mail.includes('resolveMailShortcut(e, {'), 'pintasan diresolusi lib/keymap');
ok(mail.includes('keyHandlerRef.current = (e) =>'), 'handler keyboard disimpan di ref tiap render');
ok(mail.includes('resolveTargetUids({ selected: selectedUids, focusedUid: focusedMsg?.uid, openUid: selectedMsgId })'), 'target aksi = seleksi → fokus → terbuka (fix s/u/x/d/e)');
ok(mail.includes('case A.UNDO: undoLast(); break;'), 'Ctrl+Z → undoLast');
ok(mail.includes("if (msg && readingPane !== 'off' && !isDraftFolder && !selectionMode) setSelectedMsgId(msg.uid);"), 'panah membuka pesan di panel baca (kecuali readingPane off / draf)');
ok(!mail.includes('isReaderOwnedShortcut'), 'guard lama isReaderOwnedShortcut diganti keymap');
ok(mail.includes("window.addEventListener('pcp:open-shortcuts', onOpen)"), 'event pcp:open-shortcuts membuka bantuan');
ok(/const SHORTCUT_GROUPS/.test(read('src/lib/keymap.js')) && help.includes("from '../lib/keymap'"), 'modal bantuan membaca grup pintasan dari keymap');

// ── C. Menu konteks ─────────────────────────────────────────────────────────
ok(mail.includes('onContextMenu={(e) => handleRowContextMenu(e, msg, idx)}'), 'baris pesan punya menu konteks');
ok(mail.includes('onContextMenu={(e) => handleFolderContextMenu(e, folder)}'), 'baris folder punya menu konteks');
ok(mail.includes("kind === 'folder' ? buildFolderMenuItems(ctxMenu.folder) : buildMessageMenuItems(ctxMenu)"), 'ContextMenu dirender dgn item pesan/folder');
for (const label of ["label: 'Balas Semua'", "label: 'Teruskan'", "label: 'Bendera'", "label: 'Tunda'", "label: 'Pindahkan ke…'", "label: 'Arsip'", "label: 'Buat subfolder'", "label: 'Tandai semua dibaca'", "label: 'Hapus folder'"]) {
  ok(mail.includes(label), `menu konteks: ${label}`);
}
ok(ctx.includes('role="menu"') && ctx.includes("case 'ArrowDown'") && ctx.includes("case 'Escape'"), 'ContextMenu: role=menu + navigasi panah + Esc');
ok(ctx.includes('clampMenuPosition({') && ctx.includes('submenuPosition('), 'ContextMenu: clamp viewport + submenu');
ok(ctx.includes("document.addEventListener('mousedown', onDown, true)"), 'ContextMenu: tutup saat klik di luar');

// ── D. MoveToPicker (ganti <select> native) ─────────────────────────────────
ok(!mail.includes('bulk-move-select') && !mail.includes('<select'), 'select native bulk-move dihapus');
ok(mail.includes('<MoveToPicker') && mail.includes('openMovePicker(selectedUids, { x: e.clientX, y: e.clientY })'), 'toolbar bulk membuka MoveToPicker');
ok(mail.includes('case A.MOVE_PICKER: openMovePicker(targetUids, undefined, openFolder); break;'), "pintasan m / Ctrl+Shift+V membuka picker (bukan select.click())");
ok(picker.includes('filterFoldersForPicker(') && picker.includes("case 'Enter'") && picker.includes('role="listbox"'), 'MoveToPicker: ketik utk filter + Enter + listbox');

// ── E. Drag-and-drop pesan → folder ─────────────────────────────────────────
ok(mail.includes('draggable={!isTouch}') && mail.includes('onDragStart={(e) => handleRowDragStart(e, msg)}'), 'baris pesan draggable (desktop)');
ok(mail.includes('onDrop={(e) => handleFolderDrop(e, folder)}') && mail.includes("ring-2 ring-primary bg-primary/10"), 'folder = drop target dgn highlight');
ok(mail.includes('setDragImage(ghost, 16, 16)') && mail.includes('`${uids.length} pesan`'), 'drag image memuat jumlah pesan');
ok(mail.includes("renderFolderRow(f, { favorite: true })"), 'baris Favorit memakai renderer yang sama (juga drop target)');

// ── F. Cache optimis + undo ─────────────────────────────────────────────────
ok(mail.includes("queryClient.setQueriesData({ queryKey: ['messages', user?.sogoToken, folderId] }"), 'patch cache utk semua key messages folder');
ok(mail.includes('const applyReadLocal = useCallback('), 'status baca lokal (dipakai reader onReadStateChange)');
ok(mail.includes('onReadStateChange={(uid, isRead) => {'), 'reader onReadStateChange → patch optimis');
ok(mail.includes('onMoveComplete={({ next } = {}) => {') && mail.includes('setSelectedMsgId(next ?? null);'), 'onMoveComplete menghormati auto-advance reader');
ok(mail.includes('function scheduleDeferred({ uids, sourceFolder, targetFolderId, label, kind, commit })'), 'aksi tertunda dgn jendela undo');
ok(mail.includes("if (hiddenByFolder[m.folderId || selectedFolder]?.has(String(m.uid))) return false;"), 'baris tersembunyi selama jendela undo (tidak bisa dihapus 2x)');
ok(mail.includes('markReadBulk(user.sogoToken, folder, list, read, { concurrency: 5 })'), 'bulk read memakai markReadBulk (concurrency 5)');
ok(mail.includes('markFlaggedBulk(user.sogoToken, folder, list, flagged, { concurrency: 5 })'), 'bulk flag memakai markFlaggedBulk');
ok(/const bulkDeleteMutation = useMutation\(\{[\s\S]*?removeFlagColorsBulk\) TIDAK lagi dilakukan di sini/.test(mail), 'warna flag tidak di-purge sebelum commit (undo mengembalikan warna)');
ok(mail.includes('disabled={bulkBusy}'), 'tombol bulk punya pending/disabled');
ok(mail.includes("onError: (err) => toast.error(err?.message || 'Gagal memindahkan pesan.')"), 'moveMutation punya onError toast');

// ── G. Tata letak readingPane / density / persist ───────────────────────────
ok(mail.includes("readingPane === 'bottom' ? 'flex-col' : 'flex-row'"), 'readingPane bottom = kolom');
ok(mail.includes('md:w-[var(--list-w)]') && mail.includes('md:h-[var(--list-h)]'), 'lebar/tinggi daftar hanya di md+ (fix overflow mobile)');
ok(!/style=\{\{ width: listW \}\}/.test(mail), 'inline width listW mobile dihapus');
ok(mail.includes("setPref('paneWidths', { ...cur, folders: folderW, list: listW, listHeight: listH })"), 'paneWidths dipersist via setPref (debounce)');
ok(mail.includes("setPref('collapsedFolders', next)") && mail.includes("setPref('favoriteFolders'"), 'collapsed/favorit dipersist via setPref');
ok(mail.includes('role="separator"') && mail.includes('onPointerDown={onPointerDown}') && mail.includes('onKeyDown={onKeyDown}'), 'pegangan resize aksesibel (separator + pointer + keyboard)');
ok(mail.includes("const ROW_PAD_CLS = 'density-row px-4'") && mail.includes('density-hide'), 'kelas density dari index.css dipakai di baris');
ok(mail.includes('Kembali ke daftar'), "readingPane off: tombol kembali di desktop");
ok(mail.includes('notifyPrefsRef.current?.sound === true) playNotifyBeep()'), 'suara notifikasi mengikuti preferensi sound');

// ── H. Perbaikan bug daftar ─────────────────────────────────────────────────
ok(mail.includes(") : sortedMessages.length === 0 && !(hasMore && !searchQuery) ? ("), 'gate empty-state memakai sortedMessages (hasil global & filter tampil)');
ok(mail.includes('key={`${rowFolder}:${msg.uid}`}'), 'key baris = folder:uid');
ok(mail.includes('const rowFolder = msg.folderId || selectedFolder;'), 'aksi baris memakai folder asal');
ok(mail.includes('setArchiveConfirmOpen(true)') && mail.includes('Arsipkan seluruh folder?'), 'Arsip seluruh folder dikonfirmasi dgn jumlah');
ok(mail.includes("sortAsc ? groups.map((g) => ({ ...g, messages: [...g.messages].reverse() })) : groups"), 'sortAsc membalik isi grup (Terlama dulu konsisten)');
ok(mail.includes('resetAllFilters();') && /function selectFolder\(folderId\) \{[\s\S]*?resetAllFilters\(\);/.test(mail), 'ganti folder me-reset semua filter');

console.log(`outlook-ux: ${pass} assertions PASS`);
