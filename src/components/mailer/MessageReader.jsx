import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Trash2, Mail, ArrowLeft, Reply, Forward, FileText, Download, Paperclip,
  Flag, Printer, FolderOpen, Star, Send, ChevronDown, UserPlus, X,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { fetchMessage, markRead, markFlagged, deleteMessages, moveMessages, sendMessage, fetchPreferences, createContact } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../lib/toast';
import { MessageReaderSkeleton } from '../Skeleton';
import Avatar from '../Avatar';
import { isSentOrDraftFolder } from '../../lib/constants';
import { PURIFY_CONFIG } from '../../lib/pasteUtils';
import { toSafeUrl } from '../../lib/safeUrl';
import { looksLikeHtmlInPlainText } from '../../lib/messageHtml';
import { getSignatureFor } from '../../lib/signatures';

// Same-origin (relatif) — lihat catatan di src/lib/api.js. SPA & SOGo di origin
// yang sama (nginx mailcow mem-proxy /SOGo utk semua vhost), jadi base absolut
// hanya diperlukan bila SPA di-deploy di origin terpisah.
const SOGO_BASE = import.meta.env.VITE_SOGO_BASE_URL || '';

// ─── Extended DOMPurify config for email HTML ─────────────────────────────────
const EMAIL_PURIFY_CONFIG = {
  ...PURIFY_CONFIG,
  ADD_ATTR: [
    ...(PURIFY_CONFIG.ADD_ATTR || []),
    'margin', 'marginwidth', 'marginheight',
    'allowfullscreen', 'frameborder', 'scrolling',
    'itemscope', 'itemtype', 'itemprop',
    'cite', 'datetime',
    'color', 'face', 'size',
    'vlink', 'alink', 'link', 'text',
  ],
  ADD_TAGS: [
    ...(PURIFY_CONFIG.ADD_TAGS || []),
    'font', 'center', 'u', 's', 'tt', 'ins', 'del',
    'figure', 'figcaption', 'picture', 'source',
    'main', 'section', 'article', 'header', 'footer',
    'details', 'summary',
  ],
  WHOLE_DOCUMENT: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str).replace(/[<>&"']/g, c => {
    const m = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return m[c];
  });
}

function extractHtml(parts) {
  if (!parts) return '';
  if (parts.contentType === 'text/html' && parts.content) return parts.content;
  if (parts.contentType === 'text/plain' && parts.content) {
    // text/plain tetap harus diperlakukan sebagai teks, bukan HTML. Escape
    // markup yang dikirim pengirim agar tag palsu tidak menjadi DOM aktif.
    // Kecuali kontennya jelas berisi markup HTML (bounce/delivery report) —
    // render sebagai HTML; DOMPurify tetap memfilter tag/atribut berbahaya.
    if (looksLikeHtmlInPlainText(parts.content)) return parts.content;
    return `<div style="white-space:pre-wrap">${escapeHtml(parts.content)}</div>`;
  }
  if (Array.isArray(parts.content)) {
    const htmlPart = parts.content.find((c) => c.contentType === 'text/html');
    if (htmlPart) return extractHtml(htmlPart);
    for (const child of parts.content) {
      const html = extractHtml(child);
      if (html) return html;
    }
  }
  return '';
}

function extractAttachments(parts, result = []) {
  if (!parts) return result;
  const ct = parts.contentType || '';
  const isInline = ct === 'text/html' || ct === 'text/plain';
  if (parts.downloadURL && !isInline) {
    result.push({
      name: parts.filename || parts.name || 'attachment',
      size: parts.size || 0,
      contentType: ct,
      downloadURL: parts.downloadURL,
    });
  }
  if (Array.isArray(parts.content)) {
    parts.content.forEach((child) => extractAttachments(child, result));
  }
  return result;
}

function extractInlineImages(parts, result = []) {
  if (!parts) return result;
  if (parts.contentType?.startsWith('image/') && parts.downloadURL) {
    result.push({
      name: parts.filename || parts.name || 'image',
      contentType: parts.contentType,
      downloadURL: parts.downloadURL,
    });
  }
  if (Array.isArray(parts.content)) {
    parts.content.forEach((child) => extractInlineImages(child, result));
  }
  return result;
}

/**
 * Resolve CID (Content-ID) image references in HTML.
 * Maps cid:xxx to SOGo download URLs.
 */
function resolveCidImages(html, inlineImages) {
  if (!html || !inlineImages?.length) return html;
  let resolved = html;
  inlineImages.forEach((img) => {
    const cidName = img.name.replace(/\.[^.]+$/, '');
    const downloadUrl = toSafeUrl(img.downloadURL, { base: SOGO_BASE, allowExternal: false });
    if (!downloadUrl) return;
    // Replace cid:name references
    const regex = new RegExp(`src="cid:${escapeRegex(cidName)}"`, 'gi');
    if (regex.test(resolved)) {
      resolved = resolved.replace(regex, `src="${downloadUrl}"`);
    }
    // Also try matching the full filename
    const fullRegex = new RegExp(`src="cid:${escapeRegex(img.name)}"`, 'gi');
    resolved = resolved.replace(fullRegex, `src="${downloadUrl}"`);
    // Also match cid with angle brackets
    resolved = resolved.replace(
      new RegExp(`src="cid:<${escapeRegex(cidName)}>"`, 'gi'),
      `src="${downloadUrl}"`
    );
  });
  return resolved;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize and prepare HTML for rendering.
 * Strips <html>/<body>/<head> wrappers, resolves CID images, sanitizes with DOMPurify.
 */
function prepareHtmlContent(rawHtml, inlineImages) {
  if (!rawHtml) return '';

  // Resolve CID images first
  let html = resolveCidImages(rawHtml, inlineImages);

  // Strip <html>, <head>, <body> tags but keep inner content
  html = html
    .replace(/<html[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '')
    .replace(/<\/body>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .trim();

  // Sanitize with extended email config
  return DOMPurify.sanitize(html, EMAIL_PURIFY_CONFIG);
}

function formatAddresses(arr) {
  if (!arr) return '';
  if (typeof arr === 'string') return arr;
  return arr.map((a) => {
    if (typeof a === 'string') return a;
    if (!a || typeof a !== 'object') return '';
    return a.name ? `${a.name} <${a.email}>` : (a.email || '');
  }).filter(Boolean).join(', ');
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

function isImageType(ct) {
  return ct?.startsWith('image/');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MessageReader({ folder, msgId, onClose, onReply, folders = [], onMoveComplete, siblingUids = [], onNavigateTo }) {
  const { user, smtpToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [quickOpen, setQuickOpen] = React.useState(false);
  const [quickText, setQuickText] = React.useState('');
  const [contactOpen, setContactOpen] = React.useState(false);
  const [contactSaving, setContactSaving] = React.useState(false);
  const [contactError, setContactError] = React.useState('');

  const { data: msg, isLoading } = useQuery({
    queryKey: ['message', user?.sogoToken, folder, msgId],
    queryFn: async () => {
      const data = await fetchMessage(user?.sogoToken, folder, msgId);
      markRead(user?.sogoToken, folder, msgId, true).then(() => {
        queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, folder] });
        queryClient.invalidateQueries({ queryKey: ['unseen', user?.sogoToken] });
      }).catch((e) => console.error('[markRead]', e?.message || e));
      return data;
    },
    enabled: !!msgId && !!user?.sogoToken,
  });

  // Preferences utk fallback signature SOGo lama (sama pola ComposeModal)
  const { data: prefs } = useQuery({
    queryKey: ['preferences', user?.sogoToken, smtpToken],
    queryFn: () => fetchPreferences(user?.sogoToken, user?.email, smtpToken),
    enabled: !!user?.sogoToken,
    staleTime: 5 * 60_000,
  });

  // Auto-advance: setelah hapus/arsip/pindah, buka pesan berikutnya (pola Gmail).
  // Kalau tidak ada, kembali ke daftar.
  function navigateAfter() {
    const idx = siblingUids.indexOf(msgId);
    if (idx >= 0) {
      const next = siblingUids[idx + 1] ?? siblingUids[idx - 1];
      if (next) {
        onNavigateTo?.(next);
        return;
      }
    }
    onClose();
  }

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Move to trash instead of permanent delete
      if (folder !== 'folderTrash') {
        await moveMessages(user.sogoToken, folder, [msgId], 'folderTrash');
      } else {
        await deleteMessages(user.sogoToken, folder, [msgId]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      navigateAfter();
      toast.success(folder === 'folderTrash' ? 'Pesan dihapus permanen' : 'Pesan dipindah ke Sampah');
    },
  });

  const flagMutation = useMutation({
    mutationFn: (flagged) => markFlagged(user.sogoToken, folder, msgId, flagged),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message', user.sogoToken, folder, msgId] });
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, folder] });
    },
  });

  const moveMutation = useMutation({
    mutationFn: (targetFolder) => moveMessages(user.sogoToken, folder, [msgId], targetFolder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      navigateAfter();
      onMoveComplete?.();
      toast.success('Pesan dipindahkan');
    },
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!msg) return;
    const handler = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.contentEditable === 'true') return;
      // Jangan curi kombinasi browser/OS (copy, refresh, find, dll)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); handleReply(); }
      else if (e.key.toLowerCase() === 'f') { e.preventDefault(); handleForward(); }
      else if (e.key === 'Delete') { e.preventDefault(); if (!deleteMutation.isPending) deleteMutation.mutate(); }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); flagMutation.mutate(!(msg.isFlagged)); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [msg, deleteMutation.isPending]);

  function handlePrint() {
    if (!msg) return;
    const win = window.open('', '_blank');
    if (!win) return;
    // Semua nilai yang diinterpolasi ke document.write harus di-escape:
    // jendela print (about:blank) berbagi origin dengan opener, jadi HTML
    // berbahaya di sini bisa mengakses halaman induk (cookie/opener).
    const safeSubject = escapeHtml(subject);
    const safeFrom    = escapeHtml(formatAddresses(msg.from));
    const safeTo      = escapeHtml(formatAddresses(msg.to));
    const safeCc      = escapeHtml(formatAddresses(msg.cc));
    const safeDate    = escapeHtml(msg.date || '');
    win.document.write(`
      <html><head><title>${safeSubject || 'Email'}</title>
      <style>body{font-family:sans-serif;padding:40px;max-width:800px;margin:auto;line-height:1.6}
      h1{font-size:1.5em;margin-bottom:20px}.meta{color:#666;font-size:.9em;margin-bottom:30px}
      hr{border:none;border-top:1px solid #ddd;margin:20px 0}
      img{max-width:100%}</style></head><body>
      <h1>${safeSubject || '(Tanpa Subjek)'}</h1>
      <div class="meta">
        <p><strong>Dari:</strong> ${safeFrom}</p>
        <p><strong>Kepada:</strong> ${safeTo}</p>
        ${msg.cc ? `<p><strong>Cc:</strong> ${safeCc}</p>` : ''}
        <p><strong>Tanggal:</strong> ${safeDate}</p>
      </div>
      <hr>
      ${cleanHtml}
    </body></html>`);
    win.document.close();
    win.print();
  }

  if (!msgId) return null;

  if (isLoading) return <MessageReaderSkeleton />;

  if (!msg) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <p className="text-sm">Gagal memuat pesan.</p>
        <button onClick={onClose} className="text-xs text-primary hover:underline">Kembali</button>
      </div>
    );
  }

  // ── Parse data ─────────────────────────────────────────────────────────────
  const from = formatAddresses(msg.from);
  const to = formatAddresses(msg.to);
  const cc = formatAddresses(msg.cc);
  const replyTo = formatAddresses(msg['reply-to']);
  // Subject dari SOGo bisa berupa object (bukan string) — normalisasi sebelum
  // dipakai di render, startsWith(), dan escapeHtml() agar tidak TypeError.
  const subject = typeof msg.subject === 'string' && msg.subject.trim()
    ? msg.subject
    : '(Tanpa Subjek)';
  const date = typeof msg.date === 'string' ? msg.date : String(msg.date || '');

  const rawHtml = extractHtml(msg.parts);
  const attachments = extractAttachments(msg.parts);
  const inlineImages = extractInlineImages(msg.parts);
  // Inisial avatar konsisten dengan daftar email: penerima utk Terkirim/Draf, pengirim utk lainnya
  const isSentOrDraft = isSentOrDraftFolder(folder, folders);
  const avatarName = isSentOrDraft ? (to || from) : from;
  // Orang yang relevan utk "Tambah ke Kontak" — pengirim (inbox) / penerima pertama (Terkirim)
  const contactSource = isSentOrDraft
    ? (Array.isArray(msg.to) ? msg.to : [])
    : (Array.isArray(msg.from) ? msg.from : []);
  const contactPerson = contactSource[0] || {};
  const cleanHtml = rawHtml
    ? prepareHtmlContent(rawHtml, inlineImages)
    : '<p style="color:var(--muted-foreground);font-size:.875rem;margin:0">Tidak ada konten.</p>';

  function handleReply() {
    // Semua header email (from/to/date/subject) adalah input dari pengirim dan
    // harus di-escape — body ini di-hydrate ke contentEditable editor via innerHTML.
    const safeFrom    = escapeHtml(from);
    const safeTo      = escapeHtml(to);
    const safeDate    = escapeHtml(date);
    const safeSubject = escapeHtml(subject);
    onReply?.({
      to: replyTo || from,
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      body: `<br><br><blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:0;color:#666">
        <b>Dari:</b> ${safeFrom}<br>
        <b>Tanggal:</b> ${safeDate}<br>
        <b>Kepada:</b> ${safeTo}<br>
        <b>Subjek:</b> ${safeSubject}<br><br>${cleanHtml}</blockquote>`,
      composeMode: 'reply',
    });
  }

  function handleForward() {
    const safeFrom    = escapeHtml(from);
    const safeTo      = escapeHtml(to);
    const safeDate    = escapeHtml(date);
    const safeSubject = escapeHtml(subject);
    onReply?.({
      subject: subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`,
      body: `<br><br><blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:0;color:#666">
        <b>---------- Pesan Diteruskan ----------</b><br>
        <b>Dari:</b> ${safeFrom}<br>
        <b>Tanggal:</b> ${safeDate}<br>
        <b>Kepada:</b> ${safeTo}<br>
        <b>Subjek:</b> ${safeSubject}<br><br>${cleanHtml}</blockquote>`,
      composeMode: 'reply',
    });
  }

  // ── Quick reply ────────────────────────────────────────────────────────────
  // Balas singkat tanpa buka compose penuh — kirim via SOGo compose flow
  // (sama seperti ComposeModal), penerima = replyTo || from.
  // Signature ikut disisipkan: lokal mode reply (pola Outlook) + fallback
  // signature SOGo lama (sama logika ComposeModal).
  async function handleQuickSend() {
    const body = quickText.trim();
    if (!body) return;
    const recipient = replyTo || from;
    // Bug fix: validasi recipient sebelum kirim
    if (!recipient || !recipient.trim()) {
      toast.error('Tidak ada alamat penerima — gunakan Balas Lengkap.');
      return;
    }
    // Signature: lokal utk balasan; fallback SOGoMailSignature lama bila belum ada
    const localSig = user?.email ? getSignatureFor(user.email, 'reply') : null;
    const sigHtml = localSig?.html || prefs?.defaults?.SOGoMailSignature;
    const sigEnabled = localSig
      ? true
      : prefs?.defaults?.SOGoMailSignatureEnabled === '1';
    const sigBlock = sigHtml && sigEnabled ? `<br>--<br>${sigHtml}` : '';
    try {
      await sendMessage(user.sogoToken, {
        to: recipient,
        cc: '',
        bcc: '',
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        body: escapeHtml(body).replace(/\n/g, '<br>') + sigBlock,
        isHTML: true,
        from: user?.cn ? `${user.cn} <${user.email}>` : user?.email || '',
      }, smtpToken);
      setQuickText('');
      setQuickOpen(false);
      toast.success('Balasan terkirim.');
    } catch (err) {
      toast.error(err?.message || 'Gagal mengirim balasan.');
    }
  }

  // ── Unduh semua lampiran ───────────────────────────────────────────────────
  // SOGo downloadURL diarahkan ke tab baru per lampiran (session cookie ikut).
  function handleDownloadAll() {
    const urls = attachments
      .map((att) => toSafeUrl(att.downloadURL, { base: SOGO_BASE, allowExternal: false }))
      .filter(Boolean);
    if (urls.length === 0) return;
    urls.forEach((url) => window.open(url, '_blank', 'noopener,noreferrer'));
  }

  // ── Tambah ke kontak ───────────────────────────────────────────────────────
  // Simpan pengirim/penerima email ini ke kontak personal (1 klik, form terisi).
  async function handleSaveContact(e) {
    e.preventDefault();
    if (contactSaving) return;
    setContactError('');
    setContactSaving(true);
    try {
      await createContact(user.sogoToken, {
        c_cn: (contactNameRef.current || '').trim(),
        c_mail: (contactEmailRef.current || '').trim(),
        c_telephonenumber: (contactPhoneRef.current || '').trim(),
      });
      setContactOpen(false);
      toast.success('Kontak disimpan');
    } catch (err) {
      setContactError(err?.message || 'Gagal menyimpan kontak.');
    } finally {
      setContactSaving(false);
    }
  }
  // Refs utk field modal kontak (prefill dari email, editable)
  const contactNameRef = React.useRef(null);
  const contactEmailRef = React.useRef(null);
  const contactPhoneRef = React.useRef(null);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background w-full">
      {/* Toolbar */}
      <div className="p-3 border-b border-border flex items-center justify-between sticky top-0 bg-background z-10 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="md:hidden p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted" title="Kembali">
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={() => markRead(user.sogoToken, folder, msgId, false).then(() => {
              queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, folder] });
              queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
            }).catch((e) => console.error('[markRead]', e?.message || e))}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Tandai belum dibaca (U)"
          >
            <Mail size={18} />
          </button>
          <button
            onClick={() => flagMutation.mutate(!(msg.isFlagged))}
            className={`p-2 rounded-xl transition-colors ${
              msg.isFlagged ? 'text-amber-500 hover:bg-amber-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title="Beri/Tandai bintang (S)"
          >
            <Star size={18} className={msg.isFlagged ? 'fill-amber-500' : ''} />
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Hapus (Del)"
          >
            {deleteMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
          </button>
          {/* Move to folder — click toggle (mobile-friendly) */}
          <div className="relative">
            <button
              onClick={() => setMoveOpen(!moveOpen)}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
              title="Pindahkan"
            >
              <FolderOpen size={18} />
            </button>
            {moveOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoveOpen(false)} />
                <div className="absolute top-full left-0 mt-1 bg-card border border-border shadow-xl rounded-lg z-40 min-w-[160px]">
                  <div className="p-1.5 space-y-0.5">
                    <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium">Pindahkan ke...</div>
                    {folders.filter((f) => f.id !== folder).map((f) => (
                      <button
                        key={f.id}
                        style={{ paddingLeft: `${12 + (f.depth || 0) * 16}px` }}
                        onClick={() => { moveMutation.mutate(f.id); setMoveOpen(false); }}
                        disabled={moveMutation.isPending}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={handlePrint} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted" title="Cetak">
            <Printer size={18} />
          </button>
          {(contactPerson?.email || contactPerson?.name) && (
            <button
              onClick={() => { setContactError(''); setContactOpen(true); }}
              className="p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-muted"
              title="Tambah ke kontak"
            >
              <UserPlus size={18} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            data-shortcut="quickreply"
            onClick={() => setQuickOpen(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
              quickOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
            title="Balas cepat — kirim langsung tanpa compose"
          >
            <ChevronDown size={14} className={`transition-transform ${quickOpen ? 'rotate-180' : ''}`} />
            Balas Cepat
          </button>
          <button data-shortcut="reply" onClick={handleReply} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-muted-foreground hover:bg-muted text-sm font-medium" title="Balas (R)">
            <Reply size={16} /> Balas
          </button>
          <button data-shortcut="forward" onClick={handleForward} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-muted-foreground hover:bg-muted text-sm font-medium" title="Teruskan (F)">
            <Forward size={16} /> Teruskan
          </button>
        </div>
      </div>

      {/* Message header */}
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground mb-4 leading-tight">{subject}</h1>
        <div className="flex items-start gap-3">
          {/* Avatar inisial — konsisten dengan daftar email */}
          <Avatar name={avatarName} size="md" className="mt-1" />
          <div className="text-sm flex-1 min-w-0">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex gap-2">
                  <span className="text-muted-foreground shrink-0 w-16 text-right">Dari:</span>
                  <span className="font-medium text-foreground truncate">{from}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground shrink-0 w-16 text-right">Kepada:</span>
                  <span className="text-foreground truncate">{to}</span>
                </div>
                {cc && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground shrink-0 w-16 text-right">Cc:</span>
                    <span className="text-foreground truncate">{cc}</span>
                  </div>
                )}
              </div>
              <div className="text-muted-foreground text-xs shrink-0 text-right">{date}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Message body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="email-body" dangerouslySetInnerHTML={{ __html: cleanHtml }} />

        {/* Quick reply — balas singkat tanpa compose */}
        {quickOpen && (
          <div className="mt-6 pt-4 border-t border-border">
            <div className="text-sm font-medium text-foreground mb-2">
              Balas ke: {replyTo || from}
            </div>
            <textarea
              autoFocus
              rows={3}
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleQuickSend();
                }
              }}
              placeholder="Tulis balasan singkat... (Cmd/Ctrl+Enter utk kirim)"
              className="w-full bg-muted border-none rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none resize-y"
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={() => { setQuickOpen(false); setQuickText(''); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Batal
              </button>
              <button
                onClick={handleQuickSend}
                disabled={!quickText.trim()}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
              >
                <Send size={13} />
                Kirim
              </button>
            </div>
          </div>
        )}

        {/* Inline images preview */}
        {inlineImages.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Gambar</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {inlineImages.map((img, idx) => (
                <a
                  key={idx}
                  href={toSafeUrl(img.downloadURL, { base: SOGO_BASE, allowExternal: false }) || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative rounded-xl overflow-hidden border border-border bg-card hover:ring-2 hover:ring-primary/30 transition-all"
                >
                  <img
                    src={toSafeUrl(img.downloadURL, { base: SOGO_BASE, allowExternal: false }) || undefined}
                    alt={img.name}
                    className="w-full h-32 object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  <div className="px-2 py-1 text-xs text-muted-foreground truncate">{img.name}</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Paperclip size={16} />
                Lampiran ({attachments.length})
              </h3>
              {attachments.length > 1 && (
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  title="Unduh semua lampiran (buka tab per file)"
                >
                  <Download size={13} />
                  Unduh Semua
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {attachments.map((att, idx) => {
                const attUrl = toSafeUrl(att.downloadURL, { base: SOGO_BASE, allowExternal: false });
                const isImage = isImageType(att.contentType);

                // Image attachments: show thumbnail preview
                if (isImage) {
                  return (
                    <a
                      key={idx}
                      href={attUrl || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative rounded-xl overflow-hidden border border-border bg-card hover:ring-2 hover:ring-primary/30 transition-all"
                    >
                      <img src={attUrl} alt={att.name} className="w-full h-36 object-cover" loading="lazy" />
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                        <div className="text-white text-sm font-medium truncate">{att.name}</div>
                        <div className="text-white/80 text-xs">{formatFileSize(att.size)}</div>
                      </div>
                      <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Download size={14} className="text-white" />
                      </div>
                    </a>
                  );
                }

                // Non-image attachments: file card
                return (
                  <a
                    key={idx}
                    href={attUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{att.name}</div>
                      <div className="text-xs text-muted-foreground">{formatFileSize(att.size) || att.contentType || ''}</div>
                    </div>
                    <Download size={16} className="text-muted-foreground group-hover:text-primary shrink-0" />
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Tambah ke kontak modal ─────────────────────────────────────────── */}
      {contactOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setContactOpen(false)}>
          <div
            className="bg-card w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold">Tambah ke Kontak</h2>
              <button onClick={() => setContactOpen(false)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveContact} className="p-5 space-y-4">
              {contactError && (
                <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{contactError}</div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Nama Lengkap</label>
                <input
                  ref={contactNameRef}
                  defaultValue={contactPerson?.name || contactPerson?.email || ''}
                  placeholder="John Doe"
                  className="bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <input
                  ref={contactEmailRef}
                  defaultValue={contactPerson?.email || ''}
                  type="email"
                  required
                  placeholder="email@domain.com"
                  className="bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">No. Telepon</label>
                <input
                  ref={contactPhoneRef}
                  placeholder="+62..."
                  className="bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setContactOpen(false)}
                  className="flex-1 bg-muted hover:bg-muted/80 text-foreground py-2 rounded-lg text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={contactSaving}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                >
                  {contactSaving ? <Loader2 size={14} className="animate-spin" /> : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
