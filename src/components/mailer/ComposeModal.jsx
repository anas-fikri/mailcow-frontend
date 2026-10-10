import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Paperclip, ChevronDown, ChevronUp,
  Loader2, AlertCircle, Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, Heading1, Indent, IndentDecrease,
  ImagePlus, AlertTriangle, Maximize2, Minimize2, Minus, FileSignature, CalendarClock,
  Link as LinkIcon, Palette, Highlighter, AlignLeft, AlignCenter, AlignRight,
  RemoveFormatting, Undo2, Redo2,
} from 'lucide-react';
import { sendMessage, createDraft, saveDraft, deleteDraft, fetchContacts, fetchPreferences, undoScheduledSend, fetchSendConfig } from '../../lib/api';
import { toast, useToastStore, TOAST_TYPES } from '../../lib/toast';
import { useAuthStore } from '../../store/authStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { handleEditorPaste, insertImageFiles, insertHtmlAtCursor, PURIFY_CONFIG } from '../../lib/pasteUtils';
import { loadSignatures, getSignatureFor, resolveSignatureHtml } from '../../lib/signatures';
import { formatFileSize, totalAttachmentSize } from '../../lib/attachments';
import { firstInvalidRecipient } from '../../lib/emailValidation';
import { recordSentRecipients, getEmailSuggestions } from '../../lib/emailHistory';
import { parseEmlContent } from '../../lib/emlUtils';
import {
  normalizeComposeMode, isReplyLikeMode, signatureModeFor,
  composeWindowTitle, composeAriaLabel,
  needsAttachmentReminder,
  splitRecipients, joinRecipients, parseRecipientChip, addRecipients, looksLikeRecipientList, firstInvalidChip,
  formatLocalDateTimeInput, parseLocalDateTimeInput, formatScheduleLabel, formatCountdown,
  buildReopenSnapshot,
} from '../../lib/composeUtils';

// Batas lampiran default (fallback bila config server belum tiba — lihat
// attachmentValidation.js + server.js env SMTP_MAX_*).
const MAX_ATTACHMENTS_DEFAULT = 10;
const MAX_FILE_MB_DEFAULT = 20;
const MAX_TOTAL_MB_DEFAULT = 60;

export default function ComposeModal({ isOpen, onClose, onReopen, initialData = null, sogoToken, userFrom = '' }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const token = sogoToken || user?.sogoToken;

  const [to, setTo]           = useState('');
  const [cc, setCc]           = useState('');
  const [bcc, setBcc]         = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState('');
  const [showCc, setShowCc]   = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [editorMode, setEditorMode] = useState('rich'); // 'rich', 'html', 'plain'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized]   = useState(false); // jendela diciutkan ke bar bawah (pola Outlook)
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);
  const [dirty, setDirty]     = useState(false); // cermin userEditedRef utk render (beforeunload, konfirmasi tutup)
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, actions: [{label, onClick, variant}] }
  const [scheduleMenuOpen, setScheduleMenuOpen] = useState(false);   // dropdown jadwal
  const [schedulePick, setSchedulePick] = useState('');               // ISO string jadwal terpilih
  const [draftState, setDraftState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const draftIdRef   = useRef(null); // draftId SOGo utk autosave (sekali per bukaan)
  const draftUidRef  = useRef(null); // uid terakhir hasil save (utk hapus setelah kirim)
  const saveTimerRef = useRef(null);
  const autosaveDirty = useRef(false);
  const editingDraftUidRef = useRef(null); // uid draft asli (mode edit draft) — hapus saat kirim
  const autosaveBusy  = useRef(false);     // autosave sedang berjalan — cegah tumpukan/stale overwrite
  const sentRef       = useRef(false);     // email sudah terkirim — autosave in-flight harus bersihkan draft
  const closedRef     = useRef(false);     // modal ditutup — autosave in-flight di mode edit-draft harus bersihkan copy
  const discardRef    = useRef(false);     // user memilih "Buang" — autosave in-flight harus hapus hasil save-nya sendiri
  const userEditedRef = useRef(false);     // user sudah mengubah apa pun — gerbang autosave

  // Lampiran: [{ id, name, type, size, data, pending }] — data = base64 tanpa
  // prefix data URI; pending = FileReader masih membaca (kirim diblokir).
  const [attachments, setAttachments] = useState([]);
  const attachInputRef = useRef(null);
  const attachIdRef = useRef(0);

  // Batas lampiran dari server (/api/send/config) — sinkron dengan env backend
  // & konfigurasi dashboard. Fallback default 20MB/file, 60MB total, 10 file.
  const [sendLimits, setSendLimits] = useState({
    maxFileMB: MAX_FILE_MB_DEFAULT,
    maxTotalMB: MAX_TOTAL_MB_DEFAULT,
    maxAttachments: MAX_ATTACHMENTS_DEFAULT,
  });
  useEffect(() => {
    if (!isOpen) return;
    fetchSendConfig()
      .then((c) => setSendLimits({
        maxFileMB: c?.maxFileMB || MAX_FILE_MB_DEFAULT,
        maxTotalMB: c?.maxTotalMB || MAX_TOTAL_MB_DEFAULT,
        maxAttachments: c?.maxAttachments || MAX_ATTACHMENTS_DEFAULT,
      }))
      .catch(() => { /* fallback default sudah dipakai */ });
  }, [isOpen]);

  // Ambil kontak untuk autocomplete
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', token],
    queryFn: () => fetchContacts(token),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  // Ambil preferences (signature, dll)
  const { data: prefs } = useQuery({
    queryKey: ['preferences', token],
    queryFn: () => fetchPreferences(token, user?.email),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  // Ref untuk mencegah double-inject signature
  const sigInjected = useRef(false);

  // Mode tulis awal dari preferensi SOGo (SOGoMailComposeMessageType):
  // 'text' → buka compose langsung Plain Text. Diterapkan SEKALI per bukaan,
  // hanya bila prefs sudah tiba dan user belum mengubah mode manual.
  const modeAppliedRef = useRef(false);
  const modeTouchedRef = useRef(false);
  useEffect(() => {
    if (isOpen) { modeAppliedRef.current = false; modeTouchedRef.current = false; }
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen || modeAppliedRef.current || modeTouchedRef.current) return;
    if (!prefs?.defaults) return;
    modeAppliedRef.current = true;
    if (prefs.defaults.SOGoMailComposeMessageType === 'text') {
      setEditorMode('plain');
      // Konversi body sama seperti toolbar (hapus tag → teks polos).
      setBody((prev) => prev.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]*>?/gm, ''));
    }
  }, [isOpen, prefs]);

  // Mode compose sebenarnya: 'new' | 'reply' | 'replyAll' | 'forward' | 'draft'
  // (judul header, aria-label). isReplyLike = reply/replyAll → caret mengikuti
  // preferensi posisi balasan; forward TIDAK (catatan selalu di atas kutipan).
  // composeMode = mode signature ('reply' utk balasan & teruskan, selain itu 'new').
  const realMode = normalizeComposeMode(initialData?.composeMode);
  const isReplyLike = isReplyLikeMode(realMode);
  const composeMode = signatureModeFor(realMode);

  // Header threading & sumber pesan (reply/forward) — diteruskan apa adanya ke
  // sendMessage/saveDraft (api.js memetakan ke In-Reply-To/References).
  const threading = {
    inReplyTo: initialData?.inReplyTo || '',
    references: initialData?.references || '',
    sourceFolder: initialData?.sourceFolder || '',
    sourceUid: initialData?.sourceUid || '',
  };

  // Reset form saat dibuka / initialData berubah
  useEffect(() => {
    if (isOpen) {
      sigInjected.current = false;
      setTo(initialData?.to || '');
      setCc(initialData?.cc || '');
      setBcc(initialData?.bcc || '');
      setSubject(initialData?.subject || '');
      setBody(initialData?.body || '');
      setShowCc(!!initialData?.cc);
      setShowBcc(!!initialData?.bcc);
      // Snapshot "Urungkan" membawa mode editor terakhir (plain tidak boleh
      // dibuka sebagai rich — baris baru akan hilang).
      const snapshotMode = initialData?.editorMode === 'plain' ? 'plain' : 'rich';
      setEditorMode(snapshotMode);
      if (initialData?.editorMode) modeTouchedRef.current = true;
      setIsFullscreen(false);
      setIsMinimized(false);
      setError('');
      setSuccess(false);
      setSending(false);
      setDirty(false);
      setConfirmDialog(null);
      setScheduleMenuOpen(false);
      setSchedulePick(initialData?.sendAt || '');
      setDraftState('idle');
      draftIdRef.current = null;
      draftUidRef.current = null;
      autosaveDirty.current = false;
      editingDraftUidRef.current = initialData?.draftUid || null;
      autosaveBusy.current = false;
      sentRef.current = false;
      closedRef.current = false;
      discardRef.current = false;
      userEditedRef.current = false;
      // Restorasi lampiran draft yang dibuka utk diedit (base64 sudah diunduh
      // MailPage). Bukan "user edit" — tidak memicu autosave sendiri.
      setAttachments(
        (Array.isArray(initialData?.attachments) ? initialData.attachments : [])
          .map((a) => ({
            id: ++attachIdRef.current,
            name: a.name || 'attachment',
            type: a.type || a.contentType || 'application/octet-stream',
            size: a.size || 0,
            data: a.data || '',
            pending: false,
          }))
      );
      clearTimeout(saveTimerRef.current);
    }
  }, [isOpen, initialData]);

  // ── Draft autosave ──────────────────────────────────────────────────────────
  // Simpan otomatis ke folder Draf (SOGo) saat compose berhenti diketik ±3 dtk.
  // Draft dibuat sekali per bukaan; konten di-save berulang; draft dihapus
  // setelah email terkirim (deleteDraft) supaya tidak menumpuk di Draf.
  const hasContent = !!(to.trim() || cc.trim() || bcc.trim() || subject.trim() || body.trim() || attachments.length > 0);

  // Setiap edit: buka gerbang autosave + bersihkan banner error lama (error
  // dibersihkan pada edit berikutnya, bukan menempel selamanya).
  const markUserEdited = useCallback(() => {
    userEditedRef.current = true;
    setDirty(true);
    setError('');
  }, []);

  const runAutosave = useCallback(async () => {
    if (!token || !user?.email || !hasContent) {
      autosaveDirty.current = false;
      return;
    }
    // Cegah tumpukan: kalau autosave lain masih berjalan, tandai dirty dan
    // biarkan finally menjadwalkan ulang — mencegah konten STALE menimpa
    // konten yang lebih baru (race dua autosave yang saling menimpa).
    if (autosaveBusy.current) { autosaveDirty.current = true; return; }
    autosaveBusy.current = true;
    try {
      setDraftState('saving');
      if (!draftIdRef.current) {
        draftIdRef.current = await createDraft(token);
      }
      const uid = await saveDraft(token, draftIdRef.current, {
        to: to.trim(), cc: cc.trim(), bcc: bcc.trim(),
        subject: subject.trim(),
        body: editorMode === 'plain' ? body : DOMPurify.sanitize(body, PURIFY_CONFIG),
        isHTML: editorMode !== 'plain',
        from: userFrom,
        ...threading,
        // Lampiran ikut disimpan (multipart field "attachments") — kalau tidak,
        // draft SOGo hanya menyimpan teks dan lampiran HILANG saat draft
        // dibuka ulang (bug ditemukan browser E2E draft-attachments).
        attachments: attachments.filter((a) => a.data).map((a) => ({
          name: a.name,
          type: a.type,
          data: a.data,
        })),
      });
      if (sentRef.current) {
        // Email sudah terkirim saat autosave ini berjalan — jangan simpan ref,
        // bersihkan draft (asli + autosave) supaya tidak yatim di folder Draf.
        autosaveDirty.current = false;
        const staleUids = [editingDraftUidRef.current, uid || draftUidRef.current].filter(Boolean);
        staleUids.forEach((dUid) => deleteDraft(token, dUid));
        draftUidRef.current = null;
        draftIdRef.current = null;
        editingDraftUidRef.current = null;
        return;
      }
      if (discardRef.current) {
        // User memilih "Buang" selama autosave berjalan — hasil save ini (dan
        // copy lama) tidak diinginkan; draft asli (mode edit) dibiarkan utuh.
        autosaveDirty.current = false;
        [uid, draftUidRef.current]
          .filter((u) => u && u !== editingDraftUidRef.current)
          .forEach((dUid) => deleteDraft(token, dUid));
        draftUidRef.current = null;
        draftIdRef.current = null;
        return;
      }
      if (closedRef.current && editingDraftUidRef.current) {
        // Modal ditutup selama autosave berjalan (mode edit-draft). Hasil
        // autosave INI adalah konten terbaru milik pengguna — copy inilah
        // yang harus selamat; buang draft asli (tanpa edit) + copy lama.
        // Membuang hasil autosave = menghapus edit pengguna diam-diam
        // (bug ditemukan browser E2E draft-attachments). Bila save gagal
        // (uid falsy) jangan hapus apa pun — draft asli tetap ada.
        autosaveDirty.current = false;
        const staleUids = uid
          ? [editingDraftUidRef.current, draftUidRef.current].filter((u) => u && u !== uid)
          : [];
        staleUids.forEach((dUid) => deleteDraft(token, dUid));
        draftUidRef.current = null;
        draftIdRef.current = null;
        editingDraftUidRef.current = null;
        return;
      }
      if (uid) draftUidRef.current = uid;
      autosaveDirty.current = false;
      setDraftState('saved');
    } catch {
      setDraftState('error'); // gagal autosave — jangan ganggu compose, retry berikutnya
    } finally {
      autosaveBusy.current = false;
      // Ada perubahan baru yang masuk selama autosave berjalan (dirty lagi)
      // atau autosave tadi di-skip karena sibuk → jadwalkan ulang supaya
      // konten terbaru tidak pernah terlewat.
      if (autosaveDirty.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => { runAutosave(); }, 3000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.email, hasContent, to, cc, bcc, subject, body, editorMode, userFrom, attachments,
    threading.inReplyTo, threading.references, threading.sourceFolder, threading.sourceUid]);

  useEffect(() => {
    if (!isOpen || success || !hasContent) return;
    // Autosave HANYA setelah user mengubah apa pun — membuka draft/reply yang
    // sudah terisi (initialData) tanpa edit tidak boleh langsung membuat
    // salinan draft baru di folder Draf.
    if (!userEditedRef.current) return;
    autosaveDirty.current = true;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { runAutosave(); }, 3000);
    return () => clearTimeout(saveTimerRef.current);
  }, [isOpen, success, hasContent, to, cc, bcc, subject, body, editorMode, runAutosave]);

  // Bersihkan timer saat unmount
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  // Penjaga tutup tab/refresh selama ada perubahan yang belum terkirim —
  // browser menampilkan dialog "perubahan belum disimpan".
  useEffect(() => {
    if (!isOpen || !dirty || success) return;
    const guard = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [isOpen, dirty, success]);

  // Signature lokal (pola Outlook) — pilih sesuai mode: new vs reply.
  // Fallback ke SOGoMailSignature lama bila belum ada signature lokal.
  useEffect(() => {
    if (!isOpen || sigInjected.current || !user?.email) return;
    // Draft yang dibuka untuk dilanjutkan TIDAK disuntik signature baru —
    // body-nya adalah yang terakhir disimpan user (mungkin sudah berisi
    // signature lama). Injeksi ulang akan menduplikasi signature.
    if (initialData?.composeMode === 'draft') { sigInjected.current = true; return; }
    // Snapshot "Urungkan" sudah membawa body lengkap (termasuk signature).
    if (initialData?.reopened) { sigInjected.current = true; return; }
    const localSig = getSignatureFor(user.email, composeMode);
    // Entri legacy ber-placeholder tidak ikut disuntik ke email baru — hanya
    // diisi saat user mengeditnya (flag placeholder dihapus oleh updateSignature).
    // resolveSignatureHtml mengembalikan SELALU string (fallback SOGo
    // dinormalisasi) — mencegah crash `sigHtml.substring is not a function`
    // saat ekspresi ||-rantai bernilai boolean (regresi e6a57e6).
    const sigHtml = resolveSignatureHtml(
      localSig,
      prefs?.defaults?.SOGoMailSignature,
    );
    const enabled = localSig
      ? !localSig.placeholder
      : prefs?.defaults?.SOGoMailSignatureEnabled === '1';
    if (sigHtml && enabled) {
      setBody(cur => {
        if (cur.includes(sigHtml.substring(0, 80))) return cur;
        const bqIdx = cur.indexOf('<blockquote');
        // Mode teks polos (preferensi SOGoMailComposeMessageType='text'):
        // signature HTML harus di-strip jadi teks, bukan dikirim mentah.
        const sigText = editorMode === 'plain'
          ? sigHtml.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]*>?/gm, '')
          : sigHtml;
        const sigBlock = editorMode === 'plain' ? `\n--\n${sigText}` : `<br>--<br>${sigText}`;
        return bqIdx > 0
          ? cur.slice(0, bqIdx) + sigBlock + cur.slice(bqIdx)
          : cur + sigBlock;
      });
    }
    sigInjected.current = true;
  }, [isOpen, prefs, user?.email, composeMode, editorMode]);

  // ── Autocomplete ────────────────────────────────────────────────────────────

  function getSuggestions(fieldValue) {
    if (!fieldValue) return [];
    const lastWord = fieldValue.split(',').pop().trim().toLowerCase();
    if (lastWord.length < 2) return [];

    // Kontak (diutamakan) + riwayat alamat yang pernah dikirim (dedup per
    // email) — pola Gmail "people you've emailed".
    return getEmailSuggestions(user?.email, contacts, lastWord);
  }

  // ── Lampiran ────────────────────────────────────────────────────────────────

  // Baca file → base64 (tanpa prefix data URI) lalu tambahkan ke daftar lampiran.
  // Semua side effect (FileReader) di luar updater setState agar aman terhadap
  // double-invoke updater di React StrictMode (dev).
  const attachCountRef = useRef(0);
  useEffect(() => { attachCountRef.current = attachments.length; }, [attachments]);

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    markUserEdited();

    // Validasi jumlah & ukuran di luar updater (deterministik, tanpa double-run).
    const maxFileBytes = sendLimits.maxFileMB * 1024 * 1024;
    const remaining = sendLimits.maxAttachments - attachCountRef.current;
    const accepted = [];
    const errors = [];
    let totalBytes = attachments.reduce((s, a) => s + (a.size || 0), 0);
    for (const file of files) {
      if (accepted.length >= remaining) {
        errors.push(`Maksimal ${sendLimits.maxAttachments} lampiran per email.`);
        break;
      }
      if (file.size > maxFileBytes) {
        errors.push(`"${file.name}" melebihi ${sendLimits.maxFileMB} MB — lampiran maksimal ${sendLimits.maxFileMB} MB per file.`);
        continue;
      }
      if (totalBytes + file.size > sendLimits.maxTotalMB * 1024 * 1024) {
        errors.push(`Total lampiran melebihi ${sendLimits.maxTotalMB} MB.`);
        continue;
      }
      accepted.push(file);
      totalBytes += file.size;
    }
    if (errors.length > 0) setError(errors.join(' '));
    if (accepted.length === 0) return;

    const entries = accepted.map(file => ({
      id: ++attachIdRef.current,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      data: '',
      pending: true, // masih dibaca FileReader — tombol Kirim dinonaktifkan
    }));
    setAttachments(prev => [...prev, ...entries]);

    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      const entry = entries[i];
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || '');
        const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
        setAttachments(cur => cur.map(a => (a.id === entry.id ? { ...a, data: b64, pending: false } : a)));
      };
      reader.onerror = () => {
        setAttachments(cur => cur.filter(a => a.id !== entry.id));
        setError(`Gagal membaca file "${entry.name}".`);
      };
      reader.readAsDataURL(file);
    }
  }, [markUserEdited, attachments, sendLimits]);

  const onAttachFiles = useCallback((e) => {
    addFiles(e.target.files);
    e.target.value = '';
  }, [addFiles]);

  // Drag & drop file .eml ke compose → parse field & isi form. Body HTML
  // dibiarkan apa adanya (editor rich menampilkan), mode editor set ke rich
  // bila sumbernya HTML, plain bila teks polos.
  const handleEmlDrop = useCallback(async (file) => {
    try {
      const text = await file.text();
      const parsed = parseEmlContent(text);
      markUserEdited();
      if (parsed.to) setTo(parsed.to);
      if (parsed.cc) setCc(parsed.cc);
      if (parsed.bcc) setBcc(parsed.bcc);
      if (parsed.subject) setSubject(parsed.subject);
      if (parsed.body) {
        setBody(parsed.isHTML
          ? DOMPurify.sanitize(parsed.body, PURIFY_CONFIG)
          : parsed.body.replace(/\n/g, '<br>'));
        setEditorMode(parsed.isHTML ? 'rich' : 'plain');
      }
      toast.success('Email .eml dimuat — periksa & lengkapi sebelum kirim.');
    } catch {
      toast.error('Gagal membaca file .eml.');
    }
  }, [markUserEdited]);

  const removeAttachment = useCallback((id) => {
    markUserEdited();
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, [markUserEdited]);

  const attachmentsReading = attachments.some((a) => a.pending);

  // ── Mode editor ─────────────────────────────────────────────────────────────

  function applyEditorMode(newMode) {
    modeTouchedRef.current = true;
    markUserEdited();
    if (newMode === 'plain' && editorMode !== 'plain') {
      setBody(prev => prev.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]*>?/gm, ''));
    } else if (editorMode === 'plain' && newMode !== 'plain') {
      setBody(prev => prev.replace(/\n/g, '<br>'));
    }
    setEditorMode(newMode);
  }

  function requestEditorMode(newMode) {
    // Rich/HTML → Teks Biasa bersifat destruktif (format, tautan, gambar
    // hilang) → konfirmasi dulu bila body memang mengandung markup.
    if (newMode === 'plain' && editorMode !== 'plain' && HTML_TAG_RE.test(body)) {
      setConfirmDialog({
        title: 'Ubah ke Teks Biasa?',
        message: 'Format teks (tebal, tautan, gambar, tabel) akan dihapus dan tidak bisa dikembalikan.',
        actions: [
          { label: 'Batal' },
          { label: 'Ubah ke Teks Biasa', variant: 'destructive', onClick: () => applyEditorMode('plain') },
        ],
      });
      return;
    }
    applyEditorMode(newMode);
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  function handleSubmit(e) {
    e.preventDefault();
    trySend();
  }

  // Validasi + pengingat sebelum kirim. Pengingat lampiran hanya sekali —
  // setelah user memilih "Kirim saja", performSend langsung dijalankan.
  function trySend({ skipAttachmentReminder = false } = {}) {
    // Catatan: jangan pakai state confirmDialog sebagai gerbang di sini —
    // aksi dialog ("Kirim saja") memanggil trySend sebelum re-render, jadi
    // closure masih melihat dialog lama (stale) dan kirim batal diam-diam.
    if (sending || success) return;
    if (!to.trim()) { setError('Kolom "Kepada" wajib diisi.'); return; }

    // Validasi format email per field SEBELUM kirim — server juga memvalidasi
    // (emailValidation.js), tapi error di sini lebih jelas: sebut alamat yang
    // salah dan field-nya, bukan error 400 generik setelah request dikirim.
    // Dua lapis: aturan server (firstInvalidRecipient) + aturan chip sisi
    // klien yang lebih ketat (domain wajib ber-titik) agar konsisten dengan
    // chip merah di kolom penerima.
    const invalidField = [['Kepada', to], ['Cc', cc], ['Bcc', bcc]]
      .map(([label, value]) => ({ label, bad: firstInvalidRecipient(value) || firstInvalidChip(value)?.raw }))
      .find((f) => f.bad);
    if (invalidField) {
      setError(`Alamat email tidak valid di "${invalidField.label}": "${invalidField.bad}". Gunakan format nama@domain.com.`);
      return;
    }

    if (attachmentsReading) {
      setError('Lampiran masih dibaca — tunggu sebentar lalu kirim lagi.');
      return;
    }
    const emptyAtt = attachments.find((a) => !a.data);
    if (emptyAtt) {
      // Jangan diam-diam membuang lampiran tanpa data (mis. restorasi draft gagal).
      setError(`Lampiran "${emptyAtt.name}" tidak memiliki data — hapus lalu lampirkan ulang.`);
      return;
    }

    if (!skipAttachmentReminder && needsAttachmentReminder({ subject, body, attachments })) {
      setConfirmDialog({
        title: 'Kirim tanpa lampiran?',
        message: 'Pesan Anda menyebut lampiran, tetapi belum ada file yang dilampirkan.',
        actions: [
          { label: 'Lampirkan file', onClick: () => attachInputRef.current?.click() },
          { label: 'Batal' },
          { label: 'Kirim saja', variant: 'primary', onClick: () => trySend({ skipAttachmentReminder: true }) },
        ],
      });
      return;
    }

    performSend();
  }

  async function performSend() {
    // Hentikan autosave sebelum kirim — draft akan dihapus setelah sukses;
    // autosave yang sedang berjalan diarahkan bersih-bersih lewat sentRef.
    clearTimeout(saveTimerRef.current);
    autosaveDirty.current = false;
    sentRef.current = false;
    setSending(true);
    setError('');
    setSuccess(false);
    try {
      const res = await sendMessage(token, {
        to: to.trim(),
        cc: cc.trim(),
        bcc: bcc.trim(),
        subject: subject.trim(),
        body: editorMode === 'plain' ? body : DOMPurify.sanitize(body, PURIFY_CONFIG),
        isHTML: editorMode !== 'plain',
        from: userFrom,
        ...threading,
        attachments: attachments
          .filter(a => a.data)
          .map(a => ({ filename: a.name, contentType: a.type, data: a.data })),
        ...(schedulePick ? { sendAt: schedulePick } : {}),
      });

      // Kiriman masuk queue server (undo send default / jadwal): tampilkan
      // toast dengan countdown + tombol batal, tutup modal tanpa state success
      // (email BELUM terkirim — tombol ✓ Terkirim hanya utk kirim langsung).
      if (res?.queued && res?.id) {
        const isScheduled = !!schedulePick;
        // Snapshot utuh utk "Urungkan" → parent membuka compose kembali
        // dengan pesan yang sama (to/cc/bcc/subjek/body/lampiran/threading).
        const snapshot = {
          ...buildReopenSnapshot({
            composeMode: realMode, to, cc, bcc, subject, body, attachments, editorMode, ...threading,
            sendAt: schedulePick,
          }),
          reopened: true,
        };
        showSendToast({
          id: res.id,
          sendAt: res.sendAt || schedulePick,
          scheduled: isScheduled,
          snapshot,
          // Riwayat penerima dicatat hanya bila kiriman benar-benar jalan
          // (countdown habis / toast ditutup) — BUKAN sebelum undo.
          onCommitted: () => recordSentRecipients(user?.email, to, cc, bcc),
        });
        sentRef.current = true; // autosave tidak boleh menimpa draft yang sudah dikirim/dijadwalkan
        const uidsToDelete = [editingDraftUidRef.current, draftUidRef.current].filter(Boolean);
        if (uidsToDelete.length > 0) {
          uidsToDelete.forEach((dUid) => deleteDraft(token, dUid));
          draftUidRef.current = null;
          draftIdRef.current = null;
          editingDraftUidRef.current = null;
        }
        onClose();
        return;
      }

      setSuccess(true);
      sentRef.current = true;
      // Simpan riwayat alamat yang pernah dikirim (autocomplete berikutnya).
      // Dipanggil SETELAH kirim sukses — hanya alamat yang benar-benar terkirim.
      recordSentRecipients(user?.email, to, cc, bcc);
      // Refresh Sent folder setelah sukses kirim
      if (token) {
        queryClient.invalidateQueries({ queryKey: ['messages', token, 'folderSent'] });
        queryClient.invalidateQueries({ queryKey: ['messages', token, 'folderDrafts'] });
      }
      // Hapus draft autosave + draft asli (mode edit draft) supaya tidak
      // menumpuk di Draf. Kalau autosave masih berjalan saat kirim, sentRef
      // membuat runAutosave membersihkan draftnya sendiri begitu selesai.
      const uidsToDelete = [editingDraftUidRef.current, draftUidRef.current].filter(Boolean);
      if (uidsToDelete.length > 0) {
        uidsToDelete.forEach((dUid) => deleteDraft(token, dUid));
        draftUidRef.current = null;
        draftIdRef.current = null;
        editingDraftUidRef.current = null;
      }
      // Tutup segera + toast (pola Outlook) — tidak menahan modal 1,5 dtk.
      toast.success('Email terkirim.');
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal mengirim pesan.');
    } finally {
      setSending(false);
    }
  }

  // Toast undo/cancel utk kiriman yang masuk queue server.
  //   - undo send (default 3 mnt): countdown tiap detik + "Urungkan" → pesan
  //     dibuka kembali lewat onReopen(snapshot).
  //   - jadwal: "Dijadwalkan <tanggal jam>" + "Batalkan" (tanpa countdown
  //     berjam-jam).
  // onCommitted dipanggil saat kiriman benar-benar jalan (countdown habis /
  // toast ditutup tanpa undo).
  function showSendToast({ id, sendAt, scheduled, snapshot, onCommitted }) {
    const deadline = sendAt ? new Date(sendAt).getTime() : Date.now() + 180_000;
    const remaining = () => Math.max(0, deadline - Date.now());
    const messageFor = () => scheduled
      ? `Dijadwalkan ${formatScheduleLabel(deadline)}.`
      : `Mengirim email… batal dalam ${formatCountdown(remaining())}`;

    let settled = false; // sudah undo / commit — cegah double
    const commit = () => {
      if (settled) return;
      settled = true;
      onCommitted?.();
    };

    // Undo send: toast hidup sampai countdown habis + 3 dtk agar pesan
    // "Email terkirim." sempat terlihat sebelum auto-dismiss.
    const duration = scheduled ? 10_000 : Math.max(remaining(), 4000) + 3000;
    const toastId = toast.info(messageFor(), duration);
    const interval = setInterval(() => {
      // Toast sudah di-dismiss (tombol X / auto-remove) tanpa undo → kiriman
      // tetap jalan di server: catat penerima, hentikan interval.
      if (!useToastStore.getState().hasToast(toastId)) {
        clearInterval(interval);
        commit();
        return;
      }
      if (!scheduled && remaining() <= 0) {
        clearInterval(interval);
        commit();
        useToastStore.getState().updateToast(toastId, { type: TOAST_TYPES.SUCCESS, message: 'Email terkirim.' });
        return;
      }
      if (!scheduled) useToastStore.getState().updateToast(toastId, { message: messageFor() });
    }, 1000);

    // Tombol batal — dibungkus agar dapat membatalkan interval saat diklik
    useToastStore.getState().updateToast(toastId, {
      action: {
        label: scheduled ? 'Batalkan' : 'Urungkan',
        kind: scheduled ? 'cancel' : 'undo',
        onClick: () => {
          clearInterval(interval);
          settled = true;
          undoScheduledSend(id)
            .then(() => {
              toast.success(scheduled ? 'Jadwal kirim dibatalkan.' : 'Pengiriman dibatalkan.');
              // Buka kembali compose dengan pesan utuh (bukan kehilangan pesan).
              onReopen?.(snapshot);
            })
            .catch((err) => {
              // Gagal membatalkan (mis. sudah terkirim) → kiriman jalan; catat penerima.
              onCommitted?.();
              toast.error(err.message || 'Gagal membatalkan kiriman.');
            });
        },
      },
    });
  }

  // ── Tutup ───────────────────────────────────────────────────────────────────

  // Gerbang tutup (tombol X / Esc): ada perubahan yang belum terkirim →
  // tanya "Buang perubahan?" (Simpan draf / Buang / Batal, pola Outlook).
  function handleClose() {
    if (confirmDialog) { setConfirmDialog(null); return; }
    const needsConfirm = userEditedRef.current && hasContent && !sentRef.current && !success;
    if (!needsConfirm) { finishClose(); return; }
    setIsMinimized(false); // dialog hanya dirender saat jendela terbuka penuh
    setConfirmDialog({
      title: 'Buang perubahan?',
      message: 'Pesan ini belum terkirim. Simpan sebagai draf agar bisa dilanjutkan nanti, atau buang.',
      actions: [
        { label: 'Batal' },
        { label: 'Buang', variant: 'destructive', onClick: discardAndClose },
        { label: 'Simpan draf', variant: 'primary', onClick: finishClose },
      ],
    });
  }

  // "Buang": hapus copy autosave (draft asli di mode edit dibiarkan utuh),
  // autosave in-flight membersihkan hasilnya sendiri lewat discardRef.
  function discardAndClose() {
    discardRef.current = true;
    closedRef.current = true;
    clearTimeout(saveTimerRef.current);
    autosaveDirty.current = false;
    if (token && !autosaveBusy.current && draftUidRef.current && draftUidRef.current !== editingDraftUidRef.current) {
      deleteDraft(token, draftUidRef.current);
    }
    draftUidRef.current = null;
    draftIdRef.current = null;
    onClose();
  }

  // Tutup tanpa kirim (simpan draf). Mode EDIT DRAFT: autosave menyimpan ke
  // draft BARU (copy), draft asli tetap di folder Draf — tutup harus menghapus
  // draft asli agar tidak menumpuk duplikat. Compose baru dibiarkan (draft
  // autosave-nya berguna utk dilanjutkan dari folder Draf). Edit yang belum
  // sempat di-autosave di-flush dulu (runAutosave) — path closedRef yang
  // membereskan draft asli + copy lama setelah save selesai.
  function finishClose() {
    closedRef.current = true; // autosave in-flight harus tahu modal sudah ditutup
    clearTimeout(saveTimerRef.current);
    const unsaved = autosaveDirty.current && userEditedRef.current && hasContent;
    if (editingDraftUidRef.current && token && !autosaveBusy.current) {
      if (unsaved) {
        // Tutup SEBELUM autosave sempat jalan (edit masih di memori):
        // simpan terakhir sekali, lalu biarkan path penyelesaian autosave
        // (closedRef) yang membuang draft asli + copy lama. Tanpa ini edit hilang.
        runAutosave();
      } else if (draftUidRef.current) {
        // Copy autosave membawa SEMUA edit terbaru pengguna — copy itulah yang
        // harus selamat di folder Draf. Perilaku lama menghapus copy & memelihara
        // draft asli → edit pengguna hilang diam-diam saat tutup
        // (bug ditemukan browser E2E draft-attachments).
        if (draftUidRef.current !== editingDraftUidRef.current) {
          deleteDraft(token, editingDraftUidRef.current); // buang draft asli (stale)
        }
        draftIdRef.current = null;
        editingDraftUidRef.current = null;
      }
    } else if (token && !autosaveBusy.current && unsaved) {
      // Compose baru: flush edit terakhir supaya folder Draf memuat versi terbaru.
      runAutosave();
    }
    // Bila autosave masih berjalan: JANGAN hapus apa pun di sini — path
    // penyelesaian autosave (closedRef) yang memutuskan: simpan hasil
    // terbarunya, buang draft asli + copy lama.
    onClose();
  }

  // ── Keyboard jendela compose ────────────────────────────────────────────────
  // Esc → tutup (konfirmasi bila ada perubahan); Ctrl/Cmd+Enter → kirim.
  // stopPropagation: shortcut global MailPage (window keydown) tidak ikut
  // bereaksi (mis. blur input) — jendela compose memiliki Esc sepenuhnya.
  function handleDialogKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (confirmDialog) { setConfirmDialog(null); return; }
      if (scheduleMenuOpen) { setScheduleMenuOpen(false); return; }
      handleClose();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (confirmDialog) return; // dialog konfirmasi terbuka — jangan kirim lewat shortcut
      trySend();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const windowTitle = composeWindowTitle(realMode, subject);
  const ariaLabel = composeAriaLabel(realMode, subject);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={isMinimized
            // Diciutkan: tanpa backdrop — user bisa membaca email lain sambil
            // compose tetap hidup (state + autosave jalan terus).
            ? 'fixed bottom-0 right-0 sm:right-6 z-50 pointer-events-none'
            : 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4'}
          role="dialog"
          aria-modal={!isMinimized}
          aria-label={ariaLabel}
          onKeyDown={handleDialogKeyDown}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`bg-background flex flex-col shadow-2xl relative ${
              isMinimized
                ? 'pointer-events-auto w-[320px] max-w-[calc(100vw-16px)] rounded-t-xl border border-border border-b-0'
                : isFullscreen
                  ? 'w-screen h-screen rounded-none'
                  : 'w-[90vw] sm:w-[800px] max-w-full h-[90vh] sm:h-[600px] sm:max-h-[90vh] rounded-t-2xl sm:rounded-xl resize overflow-hidden'
            }`}
            style={!isFullscreen && !isMinimized ? { minWidth: '320px', minHeight: '400px' } : undefined}
          >
            {/* Header — judul per mode + subjek; tombol ciutkan / layar penuh / tutup */}
            <div className={`flex items-center justify-between gap-2 border-b border-border bg-card ${isMinimized ? 'px-3 py-2' : 'px-5 py-4'}`}>
              {isMinimized ? (
                <button
                  type="button"
                  onClick={() => setIsMinimized(false)}
                  className="flex-1 min-w-0 text-left text-sm font-semibold truncate hover:text-primary transition-colors"
                  title="Pulihkan jendela compose"
                >
                  {windowTitle}
                </button>
              ) : (
                <h2 className="text-base font-semibold truncate min-w-0" title={windowTitle}>{windowTitle}</h2>
              )}
              <div className="flex items-center gap-1 shrink-0">
                {isMinimized ? (
                  <button type="button" onClick={() => setIsMinimized(false)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors" title="Pulihkan" aria-label="Pulihkan jendela compose">
                    <ChevronUp size={18} />
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => { setIsMinimized(true); setScheduleMenuOpen(false); }} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors hidden sm:block" title="Ciutkan" aria-label="Ciutkan jendela compose">
                      <Minus size={18} />
                    </button>
                    <button type="button" onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors hidden sm:block" title={isFullscreen ? 'Keluar layar penuh' : 'Layar Penuh'} aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'} aria-pressed={isFullscreen}>
                      {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                  </>
                )}
                <button type="button" onClick={handleClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors" title="Tutup" aria-label="Tutup compose">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Form — saat diciutkan disembunyikan (bukan di-unmount) agar state
                editor, lampiran, dan autosave tetap berjalan. */}
            <form onSubmit={handleSubmit} className={`${isMinimized ? 'hidden' : 'flex'} flex-col flex-1 overflow-hidden`}>
              <div className="flex-1 overflow-y-auto">

                {/* Error — sticky di atas area scroll supaya selalu terlihat;
                    dibersihkan otomatis pada edit berikutnya (markUserEdited). */}
                {error && (
                  <div role="alert" className="sticky top-0 z-10 mx-4 mt-3 p-3 bg-destructive/10 backdrop-blur-sm border border-destructive/30 text-destructive text-sm rounded-lg flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="flex-1 min-w-0">{error}</span>
                    <button type="button" onClick={() => setError('')} className="shrink-0 p-0.5 rounded hover:bg-destructive/20" aria-label="Tutup pesan error">
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Fields */}
                <div className="px-5 py-3 space-y-0 border-b border-border">

                  {/* To — flex-wrap: di lebar sempit (modal mobile 320px) tombol
                      Cc/Bcc pindah ke baris bawah input, TIDAK menimpa chip/
                      label (label 64px + input min 150px + tombol ≈90px > 280px). */}
                  <div className="relative py-1 flex flex-wrap items-start border-b border-border/60 min-h-[44px]">
                    <label htmlFor="compose-to" className="text-sm font-medium w-16 text-muted-foreground shrink-0 mt-2">Kepada:</label>
                    <MultiEmailInput
                      inputId="compose-to"
                      value={to}
                      onChange={(v) => { markUserEdited(); setTo(v); }}
                      placeholder="nama@domain.com (Tab/Enter)"
                      suggestions={getSuggestions}
                    />
                    <div className="flex items-center gap-2 shrink-0 mt-2">
                      <button
                        type="button"
                        onClick={() => setShowCc(v => !v)}
                        aria-expanded={showCc}
                        className={`text-xs flex items-center gap-0.5 ${
                          showCc ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Cc {showCc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowBcc(v => !v)}
                        aria-expanded={showBcc}
                        className={`text-xs flex items-center gap-0.5 ${
                          showBcc ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Bcc {showBcc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>
                  </div>

                  {/* Cc */}
                  {showCc && (
                    <div className="relative py-1 flex items-start border-b border-border/60 min-h-[44px]">
                      <label htmlFor="compose-cc" className="text-sm font-medium w-16 text-muted-foreground shrink-0 mt-2">Cc:</label>
                      <MultiEmailInput
                        inputId="compose-cc"
                        value={cc}
                        onChange={(v) => { markUserEdited(); setCc(v); }}
                        placeholder="cc@domain.com (Tab/Enter)"
                        suggestions={getSuggestions}
                      />
                    </div>
                  )}

                  {/* Bcc */}
                  {showBcc && (
                    <div className="relative py-1 flex items-start border-b border-border/60 min-h-[44px]">
                      <label htmlFor="compose-bcc" className="text-sm font-medium w-16 text-muted-foreground shrink-0 mt-2">Bcc:</label>
                      <MultiEmailInput
                        inputId="compose-bcc"
                        value={bcc}
                        onChange={(v) => { markUserEdited(); setBcc(v); }}
                        placeholder="bcc@domain.com (Tab/Enter)"
                        suggestions={getSuggestions}
                      />
                    </div>
                  )}

                  {/* Subject */}
                  <div className="py-2 flex items-center">
                    <label htmlFor="compose-subject" className="text-sm font-medium w-16 text-muted-foreground shrink-0">Subjek:</label>
                    <input
                      id="compose-subject"
                      type="text"
                      value={subject}
                      onChange={(e) => { markUserEdited(); setSubject(e.target.value); }}
                      className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-sm font-medium"
                      placeholder="Subjek pesan..."
                    />
                  </div>
                </div>

                {/* Body */}
                {editorMode === 'rich' ? (
                  <RichEditor
                    value={body}
                    onChange={(v) => { markUserEdited(); setBody(v); }}
                    onAttachFiles={addFiles}
                    onEmlDropped={handleEmlDrop}
                    // Preferensi "Posisi Balasan" (hanya balasan): 'below' →
                    // caret di bawah quote, 'above' → di atas. Teruskan: caret
                    // selalu di atas blok pesan yang diteruskan (bukan logika
                    // posisi balasan). Pesan baru/draf: tanpa pemindahan caret.
                    initialCaret={
                      isReplyLike && prefs?.defaults?.SOGoMailReplyPlacement === 'below'
                        ? 'end'
                        : isReplyLike || realMode === 'forward' ? 'start' : undefined
                    }
                  />
                ) : editorMode === 'html' ? (
                  <textarea
                    value={body}
                    onChange={(e) => { markUserEdited(); setBody(e.target.value); }}
                    className="flex-1 w-full min-h-[200px] p-5 bg-transparent border-t border-border/40 focus:outline-none focus:ring-0 text-sm resize-none font-mono text-muted-foreground"
                    placeholder="<p>Tulis kode HTML di sini...</p>"
                    aria-label="Sumber HTML pesan"
                  />
                ) : (
                  <PlainBodyTextarea
                    body={body}
                    onBodyChange={(v) => { markUserEdited(); setBody(v); }}
                  />
                )}
              </div>

              {/* Attachment list */}
              {attachments.length > 0 && (
                <div className="px-5 py-2 border-t border-border bg-card flex items-center gap-2 flex-wrap max-h-28 overflow-y-auto">
                  {attachments.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 bg-muted border border-border rounded-lg px-2.5 py-1.5 text-xs max-w-[220px]"
                      title={a.pending ? `${a.name} — sedang dibaca` : a.name}
                    >
                      {a.pending
                        ? <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" aria-label="Sedang dibaca" />
                        : <Paperclip size={12} className="shrink-0 text-muted-foreground" />}
                      <span className="truncate font-medium">{a.name}</span>
                      <span className="text-muted-foreground shrink-0">{formatFileSize(a.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        title={`Hapus ${a.name}`}
                        aria-label={`Hapus lampiran ${a.name}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {attachments.length}/{sendLimits.maxAttachments} · {totalAttachmentSize(attachments)}
                  </span>
                </div>
              )}

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-card flex-wrap gap-y-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}>
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => attachInputRef.current?.click()}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                    title="Lampirkan file"
                    aria-label="Lampirkan file"
                  >
                    <Paperclip size={18} />
                  </button>
                  <input
                    ref={attachInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={onAttachFiles}
                  />
                  <select
                    value={editorMode}
                    onChange={(e) => requestEditorMode(e.target.value)}
                    className="text-xs px-2 py-1 border-none focus:ring-0 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 font-medium transition-colors cursor-pointer appearance-none"
                    style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                    title="Format Email"
                    aria-label="Format email"
                  >
                    <option value="rich">Rich Text</option>
                    <option value="html">HTML Source</option>
                    <option value="plain">Teks Biasa</option>
                  </select>

                  {/* Sisipkan signature (pola Outlook) */}
                  <SignaturePicker
                    email={user?.email || ''}
                    onInsert={(sigHtml) => {
                      if (typeof sigHtml !== 'string' || !sigHtml) return;
                      markUserEdited();
                      setBody(cur => {
                        if (cur.includes(sigHtml.substring(0, 80))) return cur;
                        const bqIdx = cur.indexOf('<blockquote');
                        const sigBlock = `<br>--<br>${sigHtml}`;
                        return bqIdx > 0
                          ? cur.slice(0, bqIdx) + sigBlock + cur.slice(bqIdx)
                          : cur + sigBlock;
                      });
                      sigInjected.current = true;
                    }}
                  />

                  {/* Status draft autosave */}
                  {draftState === 'saving' && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Loader2 size={10} className="animate-spin" />
                      Menyimpan draf...
                    </span>
                  )}
                  {draftState === 'saved' && (
                    <span className="text-[10px] text-green-600 dark:text-green-400">
                      Draf tersimpan
                    </span>
                  )}
                  {draftState === 'error' && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      Draf gagal disimpan — akan coba lagi
                    </span>
                  )}
                  {attachmentsReading && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Loader2 size={10} className="animate-spin" />
                      Membaca lampiran...
                    </span>
                  )}
                </div>

                {/* Jadwalkan Kirim */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setScheduleMenuOpen(o => !o)}
                    aria-expanded={scheduleMenuOpen}
                    aria-haspopup="menu"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      schedulePick
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                    title="Jadwalkan pengiriman"
                  >
                    <CalendarClock size={16} />
                    {schedulePick
                      ? `Kirim ${formatScheduleLabel(schedulePick)}`
                      : 'Jadwalkan'}
                    <ChevronDown size={14} />
                  </button>
                  {scheduleMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setScheduleMenuOpen(false)} />
                      <div className="absolute bottom-full mb-2 right-0 w-64 rounded-xl border bg-popover text-popover-foreground shadow-xl z-50 p-1.5" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setSchedulePick(''); setScheduleMenuOpen(false); }}
                          className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                        >
                          Kirim sekarang
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setSchedulePick(nextScheduleDate(18, 0)); setScheduleMenuOpen(false); }}
                          className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                        >
                          Nanti · {formatScheduleLabel(nextScheduleDate(18, 0))}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setSchedulePick(nextScheduleDate(8, 0, 1)); setScheduleMenuOpen(false); }}
                          className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                        >
                          Besok pagi · {formatScheduleLabel(nextScheduleDate(8, 0, 1))}
                        </button>
                        <div className="px-3 py-2 mt-1 border-t border-border/60">
                          <label htmlFor="compose-schedule-custom" className="block text-[11px] font-medium text-muted-foreground mb-1">Waktu khusus</label>
                          {/* value & min sama-sama waktu LOKAL (formatLocalDateTimeInput) —
                              toISOString() memberi UTC dan menggeser jam sejauh offset zona. */}
                          <input
                            id="compose-schedule-custom"
                            type="datetime-local"
                            min={formatLocalDateTimeInput(new Date(Date.now() + 60_000))}
                            value={schedulePick ? formatLocalDateTimeInput(new Date(schedulePick)) : ''}
                            onChange={(e) => setSchedulePick(parseLocalDateTimeInput(e.target.value))}
                            className="w-full text-xs px-2 py-1.5 rounded-md border border-input bg-background text-foreground"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={sending || success || attachmentsReading}
                  title={attachmentsReading ? 'Menunggu lampiran selesai dibaca' : (schedulePick ? 'Jadwalkan (Ctrl+Enter)' : 'Kirim (Ctrl+Enter)')}
                  className="flex items-center gap-2 px-6 min-h-11 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors disabled:opacity-60 text-sm shrink-0"
                >
                  {sending
                    ? <><Loader2 size={16} className="animate-spin" /> Mengirim...</>
                    : success
                      ? '✓ Terkirim'
                      : <><Send size={16} /> {schedulePick ? 'Jadwalkan' : 'Kirim'}</>}
                </button>
              </div>
            </form>

            {/* Dialog konfirmasi (buang perubahan / kirim tanpa lampiran /
                ubah ke teks biasa) — overlay di dalam jendela compose. */}
            {confirmDialog && !isMinimized && (
              <ConfirmDialog dialog={confirmDialog} onDismiss={() => setConfirmDialog(null)} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Dialog konfirmasi ─────────────────────────────────────────────────────────
// actions: [{ label, onClick?, variant?: 'primary' | 'destructive' }] — tanpa
// onClick = sekadar menutup dialog (Batal). Tombol terakhir ber-variant
// mendapat fokus awal (aksi utama di kanan, pola dialog desktop).
function ConfirmDialog({ dialog, onDismiss }) {
  const primaryIdx = (() => {
    for (let i = dialog.actions.length - 1; i >= 0; i--) {
      if (dialog.actions[i].variant) return i;
    }
    return dialog.actions.length - 1;
  })();
  const variantClass = (v) => v === 'primary'
    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
    : v === 'destructive'
      ? 'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20'
      : 'border border-border text-foreground hover:bg-muted';
  return (
    <div className="absolute inset-0 z-30 bg-background/70 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="compose-confirm-title"
        aria-describedby="compose-confirm-message"
        className="w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl p-5"
      >
        <h3 id="compose-confirm-title" className="text-base font-semibold">{dialog.title}</h3>
        <p id="compose-confirm-message" className="mt-2 text-sm text-muted-foreground">{dialog.message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {dialog.actions.map((a, i) => (
            <button
              key={a.label}
              type="button"
              autoFocus={i === primaryIdx}
              onClick={() => { onDismiss(); a.onClick?.(); }}
              className={`px-3 min-h-10 py-2 rounded-lg text-sm font-medium transition-colors ${variantClass(a.variant)}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Plain Body Textarea ───────────────────────────────────────────────────────
// Mode Teks Biasa: textarea menampilkan body sebagai teks polos.
// Draft/balasan yang dibawa sbg HTML (initialData.body) harus di-strip tag
// (br→\n, sisanya dibuang). TAPI teks polos yang diketik user TIDAK boleh
// di-strip: body bisa berisi '<' legit (mis. "a < b" atau kode), dan regex
// strip-tag akan memakannya setiap re-render → user tidak bisa mengetik '<'.
// Deteksi "body masih HTML" = ada tag lengkap <tagname ...>. Teks biasa tanpa
// tag tidak diubah sama sekali.
// Jadwal kirim preset: jam:menit + offset hari. Bila jam sudah lewat hari ini,
// otomatis geser ke hari berikutnya (server tolak masa lalu).
function nextScheduleDate(hour, minute, dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  if (dayOffset === 0 && d.getTime() <= Date.now() + 60_000) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

const HTML_TAG_RE = /<[a-z][^>]*>/i;
function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '');
}
function PlainBodyTextarea({ body, onBodyChange }) {
  const display = HTML_TAG_RE.test(String(body || '')) ? htmlToPlainText(body) : body;
  return (
    <textarea
      value={display}
      onChange={(e) => { onBodyChange(e.target.value); }}
      className="flex-1 w-full min-h-[200px] p-5 bg-transparent border-t border-border/40 focus:outline-none focus:ring-0 text-sm resize-none"
      placeholder="Tulis pesan Anda di sini..."
      aria-label="Isi pesan"
      spellCheck
      lang="id"
    />
  );
}

// ── Signature Picker (pola Outlook) ──────────────────────────────────────────
// Dropdown kecil utk menyisipkan salah satu signature yang tersimpan.
function SignaturePicker({ email, onInsert }) {
  const [open, setOpen] = useState(false);
  // Entri legacy ber-placeholder di-skip: tidak ada konten nyata utk disisipkan
  // (placeholder hanya panduan "ketik di sini" — disisipkan bisa ikut terkirim).
  // User mengisi/mengeditnya lewat halaman Settings → Signature.
  const sigs = email
    ? loadSignatures(email).list.filter((s) => !s.placeholder)
    : [];
  if (sigs.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs px-2 py-1 border-none focus:ring-0 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 font-medium transition-colors"
        title="Sisipkan signature"
      >
        <FileSignature size={13} />
        Signature
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 z-20 bg-card border border-border shadow-xl rounded-lg overflow-hidden min-w-[160px]">
            {sigs.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onInsert(s.html); setOpen(false); }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                {s.name || 'Signature'}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Rich Editor ────────────────────────────────────────────────────────────────

// Normalisasi URL tautan: tanpa skema → https:// (alamat email → mailto:).
// Skema berbahaya (javascript:, data:) ditolak di sini DAN oleh DOMPurify.
function normalizeLinkUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^(javascript|data|vbscript):/i.test(s)) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)) return `mailto:${s}`;
  return `https://${s}`;
}

function RichEditor({ value, onChange, onAttachFiles, initialCaret, onEmlDropped }) {
  const editorRef    = useRef(null);
  const fileInputRef = useRef(null);
  const foreColorRef = useRef(null);
  const hiliteRef    = useRef(null);
  const [isMounted, setIsMounted]     = useState(false);
  const [showHeading, setShowHeading] = useState(false);
  const [cidWarning, setCidWarning]   = useState(false);
  const [isDragOver, setIsDragOver]   = useState(false);
  const [linkPopover, setLinkPopover] = useState(null); // { url, text, collapsed, anchor }
  const headingRef = useRef(null);
  // Range terakhir di dalam editor — disimpan saat toolbar/popover diklik
  // (fokus pindah ke input URL/warna) dan dipulihkan sebelum execCommand.
  const savedRangeRef = useRef(null);
  // Posisi caret awal saat compose dibuka (reply: di atas/bawah quote sesuai
  // preferensi SOGoMailReplyPlacement). Hanya berlaku utk balasan/forward.
  useEffect(() => {
    if (editorRef.current && isMounted && initialCaret) {
      const el = editorRef.current;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(initialCaret === 'end');
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      el.focus();
    }
    // Hanya saat mount (isMounted) — initialCaret tidak boleh berubah di tengah
    // compose karena itu akan memindahkan caret user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);
  // Setelah user mengetik/mengedit, isi DOM adalah sumber kebenaran — jangan
  // pernah menimpa dari prop `value` (mencegah cursor jump & kehilangan input).
  // Sebelum ada input, `value` tetap disinkronkan: signature yang di-inject,
  // quote balasan, dan reset form saat modal dibuka ulang akan tampil.
  const dirtyRef = useRef(false);
  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (editorRef.current && isMounted && !dirtyRef.current) {
      const next = DOMPurify.sanitize(value || '', PURIFY_CONFIG);
      if (editorRef.current.innerHTML !== next) {
        editorRef.current.innerHTML = next;
      }
    }
  }, [value, isMounted]);

  const selectionInEditor = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return false;
    return editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer);
  }, []);

  const saveSelection = useCallback(() => {
    if (selectionInEditor()) savedRangeRef.current = window.getSelection().getRangeAt(0).cloneRange();
  }, [selectionInEditor]);

  const restoreSelection = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    if (selectionInEditor()) return;
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, [selectionInEditor]);

  const syncChange = useCallback(() => {
    if (!editorRef.current) return;
    markDirty();
    onChange(DOMPurify.sanitize(editorRef.current.innerHTML, PURIFY_CONFIG));
  }, [onChange, markDirty]);

  const exec = useCallback((cmd, val = null) => {
    restoreSelection();
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      syncChange();
    }
  }, [restoreSelection, syncChange]);

  // ── Tautan (Ctrl/Cmd+K / tombol toolbar) ──────────────────────────────────
  const openLinkPopover = useCallback(() => {
    saveSelection();
    const sel = window.getSelection();
    let anchor = null;
    if (sel && sel.rangeCount > 0 && selectionInEditor()) {
      let node = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === 3) node = node.parentNode;
      anchor = node?.closest?.('a') || null;
      if (anchor && !editorRef.current.contains(anchor)) anchor = null;
    }
    const collapsed = !sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed;
    setLinkPopover({
      url: anchor?.getAttribute('href') || '',
      text: anchor ? '' : (collapsed ? '' : sel.toString()),
      collapsed: collapsed && !anchor,
      anchor,
    });
    setShowHeading(false);
  }, [saveSelection, selectionInEditor]);

  const applyLink = useCallback(() => {
    if (!linkPopover) return;
    const url = normalizeLinkUrl(linkPopover.url);
    if (!url) { setLinkPopover(null); return; }
    const { anchor, collapsed, text } = linkPopover;
    if (anchor) {
      // Edit tautan yang ada: cukup ganti href.
      anchor.setAttribute('href', url);
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
      syncChange();
    } else if (collapsed) {
      // Tanpa seleksi: sisipkan teks tautan baru di posisi caret.
      restoreSelection();
      const label = (text || '').trim() || url.replace(/^mailto:/, '');
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      insertHtmlAtCursor(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>&nbsp;`, editorRef.current);
      syncChange();
    } else {
      // Teks terseleksi → bungkus jadi tautan.
      exec('createLink', url);
      try {
        editorRef.current?.querySelectorAll('a[href]').forEach((a) => {
          if (a.getAttribute('href') !== url) return;
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        });
      } catch { /* selector gagal — tautan tetap tersisip tanpa target */ }
      syncChange();
    }
    setLinkPopover(null);
  }, [linkPopover, exec, restoreSelection, syncChange]);

  const removeLink = useCallback(() => {
    if (linkPopover?.anchor) {
      const a = linkPopover.anchor;
      const parent = a.parentNode;
      while (a.firstChild) parent.insertBefore(a.firstChild, a);
      parent.removeChild(a);
      syncChange();
    } else {
      exec('unlink');
    }
    setLinkPopover(null);
  }, [linkPopover, exec, syncChange]);

  const handleInput    = useCallback(() => { syncChange(); }, [syncChange]);
  const handleKeyDown  = useCallback((e) => {
    // Tab / Shift+Tab: di dalam daftar → indent/outdent item; di luar daftar
    // Tab menyisipkan 4 spasi (pola lama), Shift+Tab mengurangi indent.
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) { exec('outdent'); return; }
      const sel = window.getSelection();
      let node = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
      if (node && node.nodeType === 3) node = node.parentNode;
      if (node?.closest?.('li')) { exec('indent'); return; }
      document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
      syncChange();
      return;
    }
    // Ctrl/Cmd+K: sisip/ubah tautan. (Ctrl/Cmd+B/I/U ditangani native contentEditable.)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openLinkPopover();
    }
  }, [exec, syncChange, openLinkPopover]);

  const onPaste = useCallback((e) => {
    markDirty();
    handleEditorPaste(e, {
      editorRef, onChange,
      onCidWarning: () => setCidWarning(true),
    });
  }, [onChange, markDirty]);

  const onDragOver  = useCallback((e) => { e.preventDefault(); setIsDragOver(true);  }, []);
  const onDragLeave = useCallback(() => setIsDragOver(false), []);
  const onDrop      = useCallback(async (e) => {
    e.preventDefault(); setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    // File .eml → parse & isi form compose (to/cc/subject/body).
    const eml = files.find(f => /^message\/rfc822$/i.test(f.type) || /\.eml$/i.test(f.name || ''));
    if (eml && onEmlDropped) {
      onEmlDropped(eml);
      return;
    }
    // Gambar → inline (SEMUA gambar, berurutan); file lain → lampiran.
    const images = files.filter(f => f.type.startsWith('image/'));
    const rest = files.filter(f => !f.type.startsWith('image/'));
    if (images.length > 0) await insertImageFiles(images, editorRef, onChange);
    if (rest.length > 0 && onAttachFiles) onAttachFiles(rest);
    markDirty();
  }, [onChange, markDirty, onAttachFiles, onEmlDropped]);

  const onFileSelected = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await insertImageFiles(files, editorRef, onChange);
    markDirty();
    e.target.value = '';
  }, [onChange, markDirty]);

  // Warna teks / stabilo: input color tersembunyi; seleksi disimpan sebelum
  // picker dibuka dan dipulihkan saat warna dipilih (exec → restoreSelection).
  const hiliteCmd = typeof document !== 'undefined' && document.queryCommandSupported?.('hiliteColor')
    ? 'hiliteColor' : 'backColor';

  const toolbar = [
    { icon: Undo2,        cmd: 'undo',               title: 'Urungkan (Ctrl+Z)' },
    { icon: Redo2,        cmd: 'redo',               title: 'Ulangi (Ctrl+Y)' },
    { type: 'divider' },
    { icon: Bold,         cmd: 'bold',               title: 'Tebal (Ctrl+B)' },
    { icon: Italic,       cmd: 'italic',             title: 'Miring (Ctrl+I)' },
    { icon: Underline,    cmd: 'underline',          title: 'Garis bawah (Ctrl+U)' },
    { icon: Strikethrough, cmd: 'strikeThrough',     title: 'Coret' },
    { type: 'color', icon: Palette,     ref: foreColorRef, cmd: 'foreColor', title: 'Warna teks' },
    { type: 'color', icon: Highlighter, ref: hiliteRef,    cmd: hiliteCmd,   title: 'Stabilo' },
    { type: 'divider' },
    { type: 'link' },
    { type: 'divider' },
    { icon: List,         cmd: 'insertUnorderedList', title: 'Daftar bullet' },
    { icon: ListOrdered,  cmd: 'insertOrderedList',  title: 'Daftar nomor' },
    { icon: Indent,         cmd: 'indent',  title: 'Indent (Tab)' },
    { icon: IndentDecrease, cmd: 'outdent', title: 'Outdent (Shift+Tab)' },
    { type: 'divider' },
    { icon: AlignLeft,    cmd: 'justifyLeft',   title: 'Rata kiri' },
    { icon: AlignCenter,  cmd: 'justifyCenter', title: 'Rata tengah' },
    { icon: AlignRight,   cmd: 'justifyRight',  title: 'Rata kanan' },
    { type: 'divider' },
    { type: 'heading' },
    { icon: RemoveFormatting, cmd: 'removeFormat', title: 'Hapus format' },
  ];

  const btnClass = 'p-1.5 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors';

  return (
    <div className="flex flex-col flex-1 min-h-[200px] border-t border-border/40 relative">
      {/* Toolbar — onMouseDown (capture) menyimpan seleksi editor sebelum fokus pindah */}
      <div
        className="flex items-center gap-0.5 px-5 py-2 bg-muted/30 border-b border-border/40 flex-wrap"
        role="toolbar"
        aria-label="Format teks"
        onMouseDownCapture={saveSelection}
      >
        {toolbar.map((item, i) => {
          if (item.type === 'divider') return <div key={i} className="w-px h-5 bg-border/60 mx-1" aria-hidden="true" />;
          if (item.type === 'heading') {
            return (
              <div key={i} className="relative" ref={headingRef}>
                <button type="button" title="Heading" aria-label="Heading" aria-expanded={showHeading}
                  onMouseDown={e => { e.preventDefault(); setShowHeading(v => !v); }}
                  className={btnClass}>
                  <Heading1 size={16} />
                </button>
                {showHeading && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowHeading(false)} />
                    <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border shadow-xl rounded-lg overflow-hidden min-w-[100px]">
                      {[{label:'Paragraf',tag:'p'},{label:'Heading 1',tag:'h1'},{label:'Heading 2',tag:'h2'},{label:'Heading 3',tag:'h3'},{label:'Heading 4',tag:'h4'},{label:'Heading 5',tag:'h5'}].map(h => (
                        <button key={h.tag} type="button"
                          onMouseDown={e => { e.preventDefault(); exec('formatBlock', h.tag); setShowHeading(false); }}
                          className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                          {h.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          }
          if (item.type === 'color') {
            const Icon = item.icon;
            return (
              <span key={i} className="relative inline-flex">
                <button type="button" title={item.title} aria-label={item.title}
                  onMouseDown={e => { e.preventDefault(); saveSelection(); item.ref.current?.click(); }}
                  className={btnClass}>
                  <Icon size={16} />
                </button>
                <input ref={item.ref} type="color" tabIndex={-1} aria-hidden="true"
                  className="absolute w-0 h-0 opacity-0 pointer-events-none"
                  defaultValue={item.cmd === 'foreColor' ? '#d92d20' : '#fff59d'}
                  onChange={e => exec(item.cmd, e.target.value)} />
              </span>
            );
          }
          if (item.type === 'link') {
            return (
              <button key={i} type="button" title="Tautan (Ctrl+K)" aria-label="Sisipkan tautan"
                onMouseDown={e => { e.preventDefault(); openLinkPopover(); }}
                className={btnClass}>
                <LinkIcon size={16} />
              </button>
            );
          }
          const Icon = item.icon;
          return (
            <button key={i} type="button" title={item.title} aria-label={item.title}
              onMouseDown={e => { e.preventDefault(); exec(item.cmd, item.arg); }}
              className={btnClass}>
              <Icon size={16} />
            </button>
          );
        })}

        {/* Upload Gambar */}
        <button type="button" title="Upload Gambar dari File" aria-label="Upload gambar dari file"
          onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click(); }}
          className={btnClass}>
          <ImagePlus size={16} />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFileSelected} />
      </div>

      {/* Popover tautan */}
      {linkPopover && (
        <div
          className="absolute left-5 top-12 z-20 w-[min(360px,calc(100%-40px))] bg-card border border-border shadow-xl rounded-lg p-3 space-y-2"
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); applyLink(); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setLinkPopover(null); editorRef.current?.focus(); }
          }}
        >
          <label className="block text-[11px] font-medium text-muted-foreground">
            URL
            <input
              type="url"
              autoFocus
              value={linkPopover.url}
              onChange={(e) => setLinkPopover((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://contoh.com"
              className="mt-1 w-full text-sm px-2 py-1.5 rounded-md border border-input bg-background text-foreground"
            />
          </label>
          {linkPopover.collapsed && (
            <label className="block text-[11px] font-medium text-muted-foreground">
              Teks tautan
              <input
                type="text"
                value={linkPopover.text}
                onChange={(e) => setLinkPopover((p) => ({ ...p, text: e.target.value }))}
                placeholder="(opsional — default: URL)"
                className="mt-1 w-full text-sm px-2 py-1.5 rounded-md border border-input bg-background text-foreground"
              />
            </label>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            {linkPopover.anchor && (
              <button type="button" onClick={removeLink} className="mr-auto text-xs text-destructive hover:underline">Hapus tautan</button>
            )}
            <button type="button" onClick={() => { setLinkPopover(null); editorRef.current?.focus(); }} className="px-2.5 py-1.5 rounded-md text-xs border border-border hover:bg-muted">Batal</button>
            <button type="button" onClick={applyLink} className="px-2.5 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
              {linkPopover.anchor ? 'Simpan' : 'Sisipkan'}
            </button>
          </div>
        </div>
      )}

      {/* CID Warning */}
      {cidWarning && (
        <div className="flex items-start gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="flex-1">
            <strong>Gambar tidak disertakan</strong> — Apple Mail tidak menyertakan data gambar dalam clipboard.
            Gunakan tombol <strong>Upload Gambar</strong> atau drag &amp; drop gambar ke editor.
          </span>
          <button type="button" onClick={() => setCidWarning(false)} className="shrink-0 hover:opacity-70" aria-label="Tutup peringatan"><X size={12} /></button>
        </div>
      )}

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Isi pesan"
        spellCheck
        lang="id"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex-1 px-5 py-3 text-sm leading-relaxed focus:outline-none overflow-y-auto min-h-[180px] transition-colors ${
          isDragOver ? 'bg-primary/5 ring-2 ring-primary/30 ring-inset' : ''
        }`}
        data-placeholder="Tulis pesan Anda di sini..."
        style={{ '--placeholder': '"Tulis pesan Anda di sini..."' }}
      />
    </div>
  );
}

// ── Sub-component: Suggestion List ────────────────────────────────────────────

function SuggestionList({ items, onSelect, activeIdx, listId }) {
  const listRef = useRef(null);
  // Item aktif (navigasi panah) selalu terlihat di dalam daftar yang scroll.
  useEffect(() => {
    const el = listRef.current?.children?.[activeIdx];
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIdx]);
  return (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      className="absolute top-full left-1 right-0 bg-card border border-border shadow-lg rounded-lg mt-1 z-20 overflow-hidden max-h-48 overflow-y-auto"
    >
      {items.map((c, i) => {
        const name  = c.name  || c.c_cn  || (Array.isArray(c) ? c[1] : '') || '';
        const email = c.email || c.c_mail || (Array.isArray(c) ? c[2] : '') || '';
        const active = i === activeIdx;
        return (
          <button
            key={i}
            id={`${listId}-opt-${i}`}
            type="button"
            role="option"
            aria-selected={active}
            onMouseDown={e => { e.preventDefault(); onSelect(c); }}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none ${active ? 'bg-muted' : ''}`}
          >
            <div className="font-medium text-foreground">{name || email}</div>
            {name && <div className="text-xs text-muted-foreground">{email}</div>}
          </button>
        );
      })}
    </div>
  );
}

// ── Sub-component: Multi Email Input ──────────────────────────────────────────
// Chip penerima pola Outlook: nama tampilan (email di title), chip tidak
// valid merah + title error, dedup case-insensitive, panah ↑/↓ memilih saran
// (Enter/Tab mengambil yang tersorot), dobel-klik chip utk mengedit, tempel
// "a@x, b@y; c@z" dipecah jadi beberapa chip.
function MultiEmailInput({ value, onChange, placeholder, suggestions, inputId }) {
  const [inputValue, setInputValue] = useState('');
  const [showSugg, setShowSugg] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef(null);
  const listId = `${inputId || 'recipients'}-listbox`;

  const emails = splitRecipients(value);
  const chips = emails.map(parseRecipientChip);
  const invalidChips = chips.filter((c) => !c.valid);

  const commit = (list) => onChange(joinRecipients(list));

  // Tambah teks (ketik/tempel) sebagai satu atau beberapa chip, dedup.
  const addFromText = (text) => {
    const next = addRecipients(emails, text);
    if (next.length !== emails.length || joinRecipients(next) !== joinRecipients(emails)) commit(next);
    setInputValue('');
    setShowSugg(false);
    setActiveIdx(-1);
  };

  const contactToString = (contact) => {
    const name  = contact.name  || contact.c_cn  || (Array.isArray(contact) ? contact[1] : '') || '';
    const email = contact.email || contact.c_mail || (Array.isArray(contact) ? contact[2] : '') || '';
    return name ? `${name.replace(/,/g, '')} <${email}>` : email;
  };

  const handleSelectSuggestion = (contact) => {
    addFromText(contactToString(contact));
  };

  // Keluarkan chip ke input utk diedit (dobel-klik / Backspace di input kosong).
  const editChip = (index) => {
    const next = [...emails];
    const [raw] = next.splice(index, 1);
    commit(next);
    setInputValue(raw);
    setShowSugg(false);
    setActiveIdx(-1);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeEmail = (index) => {
    const next = [...emails];
    next.splice(index, 1);
    commit(next);
  };

  const currentSuggestions = showSugg && inputValue ? suggestions(inputValue) : [];

  const handleKeyDown = (e) => {
    const hasList = currentSuggestions.length > 0;
    if (e.key === 'ArrowDown' && hasList) {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % currentSuggestions.length);
      return;
    }
    if (e.key === 'ArrowUp' && hasList) {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? currentSuggestions.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Escape' && hasList) {
      // Hanya menutup daftar saran — jangan sampai menutup jendela compose.
      e.preventDefault();
      e.stopPropagation();
      setShowSugg(false);
      setActiveIdx(-1);
      return;
    }
    if (['Enter', 'Tab', ',', ';'].includes(e.key)) {
      if (hasList && activeIdx >= 0 && (e.key === 'Enter' || e.key === 'Tab')) {
        // Saran tersorot → ambil (bukan teks mentah).
        e.preventDefault();
        handleSelectSuggestion(currentSuggestions[activeIdx]);
        return;
      }
      if (inputValue.trim()) {
        e.preventDefault();
        // Teks bukan alamat (mis. potongan nama "budi") + ada saran → ambil
        // saran pertama; selain itu commit teks apa adanya.
        if (hasList && e.key === 'Enter' && !parseRecipientChip(inputValue).valid) {
          handleSelectSuggestion(currentSuggestions[0]);
          return;
        }
        addFromText(inputValue);
      }
      // Tab dengan input kosong: biarkan fokus berpindah normal.
    } else if (e.key === 'Backspace' && !inputValue && emails.length > 0) {
      e.preventDefault();
      editChip(emails.length - 1);
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData?.getData('text') || '';
    // Daftar alamat ("a@x, b@y; c@z" / per baris) → pecah jadi chip. Satu
    // alamat biasa dibiarkan tempel normal ke input.
    if (looksLikeRecipientList(`${inputValue}${text}`)) {
      e.preventDefault();
      addFromText(`${inputValue}${text}`);
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex flex-wrap items-center gap-1.5 py-1">
        {chips.map((chip, i) => (
          <span
            key={`${chip.raw}-${i}`}
            onDoubleClick={() => editChip(i)}
            title={chip.valid ? chip.email : chip.error}
            aria-invalid={!chip.valid || undefined}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border cursor-default select-none ${
              chip.valid
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'bg-destructive/10 text-destructive border-destructive/40'
            }`}
          >
            {!chip.valid && <AlertCircle size={11} className="shrink-0" aria-hidden="true" />}
            <span className="truncate max-w-[220px]">{chip.name || chip.email || chip.raw}</span>
            <button
              type="button"
              onClick={() => removeEmail(i)}
              className="hover:text-destructive opacity-70 hover:opacity-100 shrink-0 ml-1 transition-opacity"
              aria-label={`Hapus ${chip.email || chip.raw}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <div className="relative flex-1 min-w-[150px]">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); setShowSugg(true); setActiveIdx(-1); }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => {
              // Validasi saat blur: teks tersisa dijadikan chip (valid/merah).
              if (inputValue.trim()) addFromText(inputValue);
              setTimeout(() => { setShowSugg(false); setActiveIdx(-1); }, 200);
            }}
            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-sm p-1.5 m-0"
            id={inputId}
            placeholder={emails.length === 0 ? placeholder : ''}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={currentSuggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeIdx >= 0 ? `${listId}-opt-${activeIdx}` : undefined}
          />
          {currentSuggestions.length > 0 && (
            <SuggestionList items={currentSuggestions} onSelect={handleSelectSuggestion} activeIdx={activeIdx} listId={listId} />
          )}
        </div>
      </div>
      {invalidChips.length > 0 && (
        <p className="text-[11px] text-destructive pb-1" role="alert">
          {invalidChips[0].error}
        </p>
      )}
    </div>
  );
}
