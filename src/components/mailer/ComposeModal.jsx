import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Paperclip, ChevronDown, ChevronUp,
  Loader2, AlertCircle, Bold, Italic, Underline,
  List, ListOrdered, Heading1, Indent, IndentDecrease,
  ImagePlus, AlertTriangle, Maximize2, Minimize2, FileSignature
} from 'lucide-react';
import { sendMessage, createDraft, saveDraft, deleteDraft, fetchContacts, fetchPreferences } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { handleEditorPaste, insertImageFile, PURIFY_CONFIG } from '../../lib/pasteUtils';
import { loadSignatures, getSignatureFor } from '../../lib/signatures';
import { formatFileSize, totalAttachmentSize } from '../../lib/attachments';
import { firstInvalidRecipient } from '../../lib/emailValidation';

// Batas lampiran (sama dengan validasi backend — lihat attachmentValidation.js).
const MAX_ATTACHMENTS = 10;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB per file

export default function ComposeModal({ isOpen, onClose, initialData = null, sogoToken, userFrom = '' }) {
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
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);
  const [draftState, setDraftState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const draftIdRef   = useRef(null); // draftId SOGo utk autosave (sekali per bukaan)
  const draftUidRef  = useRef(null); // uid terakhir hasil save (utk hapus setelah kirim)
  const saveTimerRef = useRef(null);
  const autosaveDirty = useRef(false);
  const editingDraftUidRef = useRef(null); // uid draft asli (mode edit draft) — hapus saat kirim
  const autosaveBusy  = useRef(false);     // autosave sedang berjalan — cegah tumpukan/stale overwrite
  const sentRef       = useRef(false);     // email sudah terkirim — autosave in-flight harus bersihkan draft
  const userEditedRef = useRef(false);     // user sudah mengubah apa pun — gerbang autosave

  const [showToSugg, setShowToSugg]  = useState(false);
  const [showCcSugg, setShowCcSugg]  = useState(false);
  const [showBccSugg, setShowBccSugg] = useState(false);

  // Lampiran: [{ id, name, type, size, data }] — data = base64 tanpa prefix data URI
  const [attachments, setAttachments] = useState([]);
  const attachInputRef = useRef(null);
  const attachIdRef = useRef(0);

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

  // Mode compose: 'new' (tombol Tulis Pesan) atau 'reply' (balasan/forward)
  const composeMode = initialData?.composeMode === 'reply' ? 'reply' : 'new';

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
      setEditorMode('rich');
      setIsFullscreen(false);
      setError('');
      setSuccess(false);
      setSending(false);
      setDraftState('idle');
      draftIdRef.current = null;
      draftUidRef.current = null;
      autosaveDirty.current = false;
      editingDraftUidRef.current = initialData?.draftUid || null;
      autosaveBusy.current = false;
      sentRef.current = false;
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

  const markUserEdited = useCallback(() => { userEditedRef.current = true; }, []);

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
  }, [token, user?.email, hasContent, to, cc, bcc, subject, body, editorMode, userFrom]);

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

  // Signature lokal (pola Outlook) — pilih sesuai mode: new vs reply.
  // Fallback ke SOGoMailSignature lama bila belum ada signature lokal.
  useEffect(() => {
    if (!isOpen || sigInjected.current || !user?.email) return;
    // Draft yang dibuka untuk dilanjutkan TIDAK disuntik signature baru —
    // body-nya adalah yang terakhir disimpan user (mungkin sudah berisi
    // signature lama). Injeksi ulang akan menduplikasi signature.
    if (initialData?.composeMode === 'draft') { sigInjected.current = true; return; }
    const localSig = getSignatureFor(user.email, composeMode);
    // Entri legacy ber-placeholder tidak ikut disuntik ke email baru — hanya
    // diisi saat user mengeditnya (flag placeholder dihapus oleh updateSignature).
    const sigHtml = (localSig?.html && !localSig?.placeholder) || prefs?.defaults?.SOGoMailSignature;
    const enabled = localSig
      ? true
      : prefs?.defaults?.SOGoMailSignatureEnabled === '1';
    if (sigHtml && enabled) {
      setBody(cur => {
        if (cur.includes(sigHtml.substring(0, 80))) return cur;
        const bqIdx = cur.indexOf('<blockquote');
        const sigBlock = `<br>--<br>${sigHtml}`;
        return bqIdx > 0
          ? cur.slice(0, bqIdx) + sigBlock + cur.slice(bqIdx)
          : cur + sigBlock;
      });
    }
    sigInjected.current = true;
  }, [isOpen, prefs, user?.email, composeMode]);

  // ── Autocomplete ────────────────────────────────────────────────────────────

  function getSuggestions(fieldValue) {
    if (!fieldValue) return [];
    const lastWord = fieldValue.split(',').pop().trim().toLowerCase();
    if (lastWord.length < 2) return [];

    return contacts
      .filter(c => {
        const name  = c.name  || c.c_cn  || (Array.isArray(c) ? c[1] : '') || '';
        const email = c.email || c.c_mail || (Array.isArray(c) ? c[2] : '') || '';
        return `${name} ${email}`.toLowerCase().includes(lastWord);
      })
      .slice(0, 6);
  }

  function selectContact(contact, fieldValue, setField, setShow) {
    const name  = contact.name  || contact.c_cn  || (Array.isArray(contact) ? contact[1] : '') || '';
    const email = contact.email || contact.c_mail || (Array.isArray(contact) ? contact[2] : '') || '';
    const str   = name ? `${name.replace(/,/g, '')} <${email}>` : email;

    const parts = fieldValue.split(',').map(p => p.trim());
    parts.pop();
    parts.push(str);
    setField(parts.join(', ') + ', ');
    setShow(false);
  }

  // ── Send ────────────────────────────────────────────────────────────────────

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
    const remaining = MAX_ATTACHMENTS - attachCountRef.current;
    const accepted = [];
    const errors = [];
    for (const file of files) {
      if (accepted.length >= remaining) {
        errors.push(`Maksimal ${MAX_ATTACHMENTS} lampiran per email.`);
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`"${file.name}" melebihi 4 MB — lampiran maksimal 4 MB per file.`);
        continue;
      }
      accepted.push(file);
    }
    if (errors.length > 0) setError(errors.join(' '));
    if (accepted.length === 0) return;

    const entries = accepted.map(file => ({
      id: ++attachIdRef.current,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      data: '',
    }));
    setAttachments(prev => [...prev, ...entries]);

    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      const entry = entries[i];
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || '');
        const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
        setAttachments(cur => cur.map(a => (a.id === entry.id ? { ...a, data: b64 } : a)));
      };
      reader.onerror = () => {
        setAttachments(cur => cur.filter(a => a.id !== entry.id));
        setError(`Gagal membaca file "${entry.name}".`);
      };
      reader.readAsDataURL(file);
    }
  }, [markUserEdited]);

  const onAttachFiles = useCallback((e) => {
    addFiles(e.target.files);
    e.target.value = '';
  }, [addFiles]);

  const removeAttachment = useCallback((id) => {
    markUserEdited();
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, [markUserEdited]);

  async function handleSend(e) {
    e.preventDefault();
    if (!to.trim()) { setError('Kolom "Kepada" wajib diisi.'); return; }

    // Validasi format email per field SEBELUM kirim — server juga memvalidasi
    // (emailValidation.js), tapi error di sini lebih jelas: sebut alamat yang
    // salah dan field-nya, bukan error 400 generik setelah request dikirim.
    const invalidField = [['Kepada', to], ['Cc', cc], ['Bcc', bcc]]
      .map(([label, value]) => ({ label, bad: firstInvalidRecipient(value) }))
      .find((f) => f.bad);
    if (invalidField) {
      setError(`Alamat email tidak valid di "${invalidField.label}": "${invalidField.bad}". Gunakan format nama@domain.com.`);
      return;
    }

    // Hentikan autosave sebelum kirim — draft akan dihapus setelah sukses;
    // autosave yang sedang berjalan diarahkan bersih-bersih lewat sentRef.
    clearTimeout(saveTimerRef.current);
    autosaveDirty.current = false;
    sentRef.current = false;
    setSending(true);
    setError('');
    setSuccess(false);
    try {
      await sendMessage(token, {
        to: to.trim(),
        cc: cc.trim(),
        bcc: bcc.trim(),
        subject: subject.trim(),
        body: editorMode === 'plain' ? body : DOMPurify.sanitize(body, PURIFY_CONFIG),
        isHTML: editorMode !== 'plain',
        from: userFrom,
        attachments: attachments
          .filter(a => a.data)
          .map(a => ({ filename: a.name, contentType: a.type, data: a.data })),
      });
      setSuccess(true);
      sentRef.current = true;
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
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err.message || 'Gagal mengirim pesan.');
    } finally {
      setSending(false);
    }
  }

  // Tutup tanpa kirim. Mode EDIT DRAFT: autosave menyimpan ke draft BARU
  // (copy), draft asli tetap di folder Draf — tutup harus menghapus copy itu
  // agar tidak menumpuk duplikat. Compose baru dibiarkan (draft autosave-nya
  // berguna utk dilanjutkan dari folder Draf).
  function handleClose() {
    if (editingDraftUidRef.current && token) {
      const copyUid = draftUidRef.current;
      if (copyUid && copyUid !== editingDraftUidRef.current) {
        deleteDraft(token, copyUid);
      }
      draftUidRef.current = null;
      draftIdRef.current = null;
    }
    editingDraftUidRef.current = null;
    onClose();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`bg-background flex flex-col shadow-2xl ${
              isFullscreen
                ? 'w-screen h-screen rounded-none'
                : 'w-[90vw] sm:w-[800px] max-w-full h-[90vh] sm:h-[600px] sm:max-h-[90vh] rounded-t-2xl sm:rounded-xl resize overflow-hidden'
            }`}
            style={!isFullscreen ? { minWidth: '320px', minHeight: '400px' } : undefined}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
              <h2 className="text-base font-semibold">Tulis Pesan</h2>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors hidden sm:block" title="Layar Penuh">
                  {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button type="button" onClick={handleClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors" title="Tutup">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSend} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto">

                {/* Error / Success */}
                {error && (
                  <div className="mx-4 mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}
                {success && (
                  <div className="mx-4 mt-4 p-3 bg-green-500/10 text-green-600 dark:text-green-400 text-sm rounded-lg">
                    ✓ Email berhasil dikirim!
                  </div>
                )}

                {/* Fields */}
                <div className="px-5 py-3 space-y-0 border-b border-border">

                  {/* To */}
                  <div className="relative py-1 flex items-start border-b border-border/60 min-h-[44px]">
                    <label className="text-sm font-medium w-16 text-muted-foreground shrink-0 mt-2">Kepada:</label>
                    <MultiEmailInput 
                      value={to} 
                      onChange={(v) => { markUserEdited(); setTo(v); }} 
                      placeholder="nama@domain.com (Tab/Enter)" 
                      suggestions={getSuggestions} 
                    />
                    <div className="flex items-center gap-2 shrink-0 mt-2">
                      <button
                        type="button"
                        onClick={() => setShowCc(v => !v)}
                        className={`text-xs flex items-center gap-0.5 ${
                          showCc ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Cc {showCc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowBcc(v => !v)}
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
                      <label className="text-sm font-medium w-16 text-muted-foreground shrink-0 mt-2">Cc:</label>
                      <MultiEmailInput 
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
                      <label className="text-sm font-medium w-16 text-muted-foreground shrink-0 mt-2">Bcc:</label>
                      <MultiEmailInput 
                        value={bcc} 
                        onChange={(v) => { markUserEdited(); setBcc(v); }} 
                        placeholder="bcc@domain.com (Tab/Enter)" 
                        suggestions={getSuggestions} 
                      />
                    </div>
                  )}

                  {/* Subject */}
                  <div className="py-2 flex items-center">
                    <label className="text-sm font-medium w-16 text-muted-foreground shrink-0">Subjek:</label>
                    <input
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
                  <RichEditor value={body} onChange={(v) => { markUserEdited(); setBody(v); }} onAttachFiles={addFiles} />
                ) : editorMode === 'html' ? (
                  <textarea
                    value={body}
                    onChange={(e) => { markUserEdited(); setBody(e.target.value); }}
                    className="flex-1 w-full min-h-[200px] p-5 bg-transparent border-t border-border/40 focus:outline-none focus:ring-0 text-sm resize-none font-mono text-muted-foreground"
                    placeholder="<p>Tulis kode HTML di sini...</p>"
                  />
                ) : (
                  <textarea
                    value={body.replace(/<[^>]*>?/gm, '')}
                    onChange={(e) => { markUserEdited(); setBody(e.target.value); }}
                    className="flex-1 w-full min-h-[200px] p-5 bg-transparent border-t border-border/40 focus:outline-none focus:ring-0 text-sm resize-none"
                    placeholder="Tulis pesan Anda di sini..."
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
                      title={a.name}
                    >
                      <Paperclip size={12} className="shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{a.name}</span>
                      <span className="text-muted-foreground shrink-0">{formatFileSize(a.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        title={`Hapus ${a.name}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {attachments.length}/{MAX_ATTACHMENTS} · {totalAttachmentSize(attachments)}
                  </span>
                </div>
              )}

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-card">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => attachInputRef.current?.click()}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                    title="Lampirkan file"
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
                    onChange={(e) => {
                      const newMode = e.target.value;
                      markUserEdited();
                      if (newMode === 'plain' && editorMode !== 'plain') {
                        setBody(prev => prev.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]*>?/gm, ''));
                      } else if (editorMode === 'plain' && newMode !== 'plain') {
                        setBody(prev => prev.replace(/\n/g, '<br>'));
                      }
                      setEditorMode(newMode);
                    }}
                    className="text-xs px-2 py-1 border-none focus:ring-0 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 font-medium transition-colors cursor-pointer appearance-none"
                    style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                    title="Format Email"
                  >
                    <option value="rich">Rich Text</option>
                    <option value="html">HTML Source</option>
                    <option value="plain">Teks Biasa</option>
                  </select>

                  {/* Sisipkan signature (pola Outlook) */}
                  <SignaturePicker
                    email={user?.email || ''}
                    onInsert={(sigHtml) => {
                      if (!sigHtml) return;
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
                </div>
                <button
                  type="submit"
                  disabled={sending || success}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors disabled:opacity-60 text-sm"
                >
                  {sending
                    ? <><Loader2 size={16} className="animate-spin" /> Mengirim...</>
                    : success
                      ? '✓ Terkirim'
                      : <><Send size={16} /> Kirim</>}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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

function RichEditor({ value, onChange, onAttachFiles }) {
  const editorRef    = useRef(null);
  const fileInputRef = useRef(null);
  const [isMounted, setIsMounted]     = useState(false);
  const [showHeading, setShowHeading] = useState(false);
  const [cidWarning, setCidWarning]   = useState(false);
  const [isDragOver, setIsDragOver]   = useState(false);
  const headingRef = useRef(null);
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

  const exec = useCallback((cmd, val = null) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      markDirty();
      onChange(DOMPurify.sanitize(editorRef.current.innerHTML, PURIFY_CONFIG));
    }
  }, [onChange, markDirty]);

  const handleInput    = useCallback(() => {
    markDirty();
    if (editorRef.current) onChange(DOMPurify.sanitize(editorRef.current.innerHTML, PURIFY_CONFIG));
  }, [onChange, markDirty]);
  const handleKeyDown  = useCallback((e) => {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;'); markDirty(); }
  }, [markDirty]);

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
    // Gambar → inline (pola lama); file lain → lampiran.
    const image = files.find(f => f.type.startsWith('image/'));
    const rest = files.filter(f => !f.type.startsWith('image/'));
    if (image) await insertImageFile(image, editorRef, onChange);
    if (rest.length > 0 && onAttachFiles) onAttachFiles(rest);
    markDirty();
  }, [onChange, markDirty, onAttachFiles]);

  const onFileSelected = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await insertImageFile(file, editorRef, onChange);
    markDirty();
    e.target.value = '';
  }, [onChange, markDirty]);

  const toolbar = [
    { icon: Bold,         cmd: 'bold',               title: 'Tebal (Ctrl+B)' },
    { icon: Italic,       cmd: 'italic',             title: 'Miring (Ctrl+I)' },
    { icon: Underline,    cmd: 'underline',          title: 'Garis bawah (Ctrl+U)' },
    { type: 'divider' },
    { icon: List,         cmd: 'insertUnorderedList', title: 'Daftar bullet' },
    { icon: ListOrdered,  cmd: 'insertOrderedList',  title: 'Daftar nomor' },
    { type: 'divider' },
    { icon: Indent,         cmd: 'indent',  title: 'Indent (Tab)' },
    { icon: IndentDecrease, cmd: 'outdent', title: 'Outdent (Shift+Tab)' },
    { type: 'divider' },
    { type: 'heading' },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-[200px] border-t border-border/40">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-5 py-2 bg-muted/30 border-b border-border/40 flex-wrap">
        {toolbar.map((item, i) => {
          if (item.type === 'divider') return <div key={i} className="w-px h-5 bg-border/60 mx-1" />;
          if (item.type === 'heading') {
            return (
              <div key={i} className="relative" ref={headingRef}>
                <button type="button" title="Heading"
                  onMouseDown={e => { e.preventDefault(); setShowHeading(v => !v); }}
                  className="p-1.5 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors">
                  <Heading1 size={16} />
                </button>
                {showHeading && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowHeading(false)} />
                    <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border shadow-xl rounded-lg overflow-hidden min-w-[100px]">
                      {[{label:'Heading 1',tag:'h1'},{label:'Heading 2',tag:'h2'},{label:'Heading 3',tag:'h3'},{label:'Heading 4',tag:'h4'},{label:'Heading 5',tag:'h5'}].map(h => (
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
          const Icon = item.icon;
          return (
            <button key={i} type="button" title={item.title}
              onMouseDown={e => { e.preventDefault(); exec(item.cmd, item.arg); }}
              className="p-1.5 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors">
              <Icon size={16} />
            </button>
          );
        })}

        {/* Upload Gambar */}
        <button type="button" title="Upload Gambar dari File"
          onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click(); }}
          className="p-1.5 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors">
          <ImagePlus size={16} />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
      </div>

      {/* CID Warning */}
      {cidWarning && (
        <div className="flex items-start gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="flex-1">
            <strong>Gambar tidak disertakan</strong> — Apple Mail tidak menyertakan data gambar dalam clipboard.
            Gunakan tombol <strong>Upload Gambar</strong> atau drag &amp; drop gambar ke editor.
          </span>
          <button onClick={() => setCidWarning(false)} className="shrink-0 hover:opacity-70"><X size={12} /></button>
        </div>
      )}

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
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

function SuggestionList({ items, onSelect }) {
  return (
    <div className="absolute top-full left-1 right-0 bg-card border border-border shadow-lg rounded-lg mt-1 z-20 overflow-hidden max-h-48 overflow-y-auto">
      {items.map((c, i) => {
        const name  = c.name  || c.c_cn  || (Array.isArray(c) ? c[1] : '') || '';
        const email = c.email || c.c_mail || (Array.isArray(c) ? c[2] : '') || '';
        return (
          <button
            key={i}
            type="button"
            onMouseDown={e => { e.preventDefault(); onSelect(c); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none"
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

function MultiEmailInput({ value, onChange, placeholder, suggestions }) {
  const [inputValue, setInputValue] = useState('');
  const [showSugg, setShowSugg] = useState(false);
  const inputRef = useRef(null);

  const emails = value ? value.split(',').map(e => e.trim()).filter(Boolean) : [];

  const handleKeyDown = (e) => {
    if (['Enter', 'Tab', ','].includes(e.key)) {
      if (inputValue.trim()) {
        e.preventDefault();
        const newEmails = [...emails, inputValue.trim()];
        onChange(newEmails.join(', '));
        setInputValue('');
        setShowSugg(false);
      }
    } else if (e.key === 'Backspace' && !inputValue && emails.length > 0) {
      const newEmails = [...emails];
      newEmails.pop();
      onChange(newEmails.join(', '));
    }
  };

  const removeEmail = (index) => {
    const newEmails = [...emails];
    newEmails.splice(index, 1);
    onChange(newEmails.join(', '));
  };

  const handleSelectSuggestion = (contact) => {
     const name  = contact.name  || contact.c_cn  || (Array.isArray(contact) ? contact[1] : '') || '';
     const email = contact.email || contact.c_mail || (Array.isArray(contact) ? contact[2] : '') || '';
     const str   = name ? `${name.replace(/,/g, '')} <${email}>` : email;
     
     const newEmails = [...emails, str];
     onChange(newEmails.join(', '));
     setInputValue('');
     setShowSugg(false);
  };

  const currentSuggestions = showSugg && inputValue ? suggestions(inputValue) : [];

  return (
    <div className="flex-1 flex flex-wrap items-center gap-1.5 py-1">
      {emails.map((email, i) => (
        <span key={i} className="flex items-center gap-1 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-medium border border-primary/20">
          {email}
          <button type="button" onClick={() => removeEmail(i)} className="hover:text-destructive opacity-70 hover:opacity-100 shrink-0 ml-1 transition-opacity">
            <X size={12} />
          </button>
        </span>
      ))}
      <div className="relative flex-1 min-w-[150px]">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setShowSugg(true); }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) {
               const newEmails = [...emails, inputValue.trim()];
               onChange(newEmails.join(', '));
               setInputValue('');
            }
            setTimeout(() => setShowSugg(false), 200);
          }}
          className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-sm p-1.5 m-0"
          placeholder={emails.length === 0 ? placeholder : ''}
          autoComplete="off"
        />
        {currentSuggestions.length > 0 && (
          <SuggestionList items={currentSuggestions} onSelect={handleSelectSuggestion} />
        )}
      </div>
    </div>
  );
}
