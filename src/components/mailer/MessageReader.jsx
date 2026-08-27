import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Trash2, Mail, ArrowLeft, Reply, Forward, FileText, Download, FileDown, Paperclip,
  Flag, Printer, FolderOpen, Star, AlertTriangle, UserPlus, ExternalLink, Eye, X,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { fetchMessage, markRead, markFlagged, deleteMessages, moveMessages, markMessagesAsJunk, createContact, fetchAttachmentData } from '../../lib/api';
import { unsnoozeMessages } from '../../lib/snooze';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../lib/toast';
import { MessageReaderSkeleton } from '../Skeleton';
import { PURIFY_CONFIG } from '../../lib/pasteUtils';
import { toSafeUrl } from '../../lib/safeUrl';
import { formatAddresses } from '../../lib/format';
import { extractHtml, extractAttachments } from '../../lib/messageHtml';
import { proxyExternalImages } from '../../lib/imageProxy';
import { getFileKind, totalAttachmentSize } from '../../lib/attachments';
import { buildEml, htmlToText } from '../../lib/emlUtils';

const SOGO_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_SOGO_BASE_URL || '');

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

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

function isImageType(ct) {
  return ct?.startsWith('image/');
}

/** Unduh file via blob (fetch + objectURL) — dipakai tombol Unduh di lightbox. */
async function downloadFileBlob(url, filename) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`${filename || 'file'} (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename || 'attachment';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MessageReader({ folder, msgId, onClose, onReply, folders = [], onMoveComplete, onSnoozeCleared, shortcutsEnabled = true, siblingUids = [], onNavigateTo }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [moveOpen, setMoveOpen] = React.useState(false);
  // Preview lampiran (gambar/PDF) — lightbox full-screen.
  const [lightbox, setLightbox] = React.useState(null); // { name, url, kind } | null
  // Tambah ke kontak.
  const [contactOpen, setContactOpen] = React.useState(false);
  const [contactSaving, setContactSaving] = React.useState(false);
  const [contactError, setContactError] = React.useState('');
  const contactNameRef = React.useRef(null);
  const contactEmailRef = React.useRef(null);
  const contactPhoneRef = React.useRef(null);
  // Unduh semua lampiran.
  const [downloadingAll, setDownloadingAll] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState('');

  const { data: msg, isLoading } = useQuery({
    queryKey: ['message', user?.sogoToken, folder, msgId],
    queryFn: async () => {
      const data = await fetchMessage(user?.sogoToken, folder, msgId);
      markRead(user?.sogoToken, folder, msgId, true).then(() => {
        queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, folder] });
        queryClient.invalidateQueries({ queryKey: ['unseen', user?.sogoToken] });
      }).catch(() => {});
      return data;
    },
    enabled: !!msgId && !!user?.sogoToken,
  });

  // Auto-advance (pola Gmail/Outlook): setelah hapus/pindah/spam, buka pesan
  // berikutnya di daftar (siblingUids = urutan tampil, flat atau conversation).
  // Fallback ke pesan sebelumnya bila di ujung, baru tutup reader.
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
      // Pesan pindah/hapus → UID di folder asal tidak berlaku lagi → entri
      // snooze di folder tsb menjadi yatim; hapus agar tidak menyembunyikan
      // pesan baru yang memakai ulang UID yang sama.
      if (user?.email && unsnoozeMessages(user.email, folder, [msgId]) > 0) {
        onSnoozeCleared?.();
      }
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
      if (user?.email && unsnoozeMessages(user.email, folder, [msgId]) > 0) {
        onSnoozeCleared?.();
      }
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      navigateAfter();
      onMoveComplete?.();
      toast.success('Pesan dipindahkan');
    },
  });

  // Laporkan Spam — endpoint native SOGo markMessagesAsJunk (set flag Junk +
  // pindahkan ke folder Junk sekaligus; lebih benar daripada move manual).
  const spamMutation = useMutation({
    mutationFn: () => markMessagesAsJunk(user.sogoToken, folder, [msgId]),
    onSuccess: () => {
      if (user?.email && unsnoozeMessages(user.email, folder, [msgId]) > 0) {
        onSnoozeCleared?.();
      }
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      navigateAfter();
      onMoveComplete?.();
      toast.success('Pesan dilaporkan sebagai spam');
    },
    onError: (err) => toast.error(err?.message || 'Gagal melaporkan spam.'),
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!msg) return;
    const handler = (e) => {
      // Mati saat modal lain terbuka di atas reader (mis. ComposeModal reply
      // yang menimpa reader). Tanpa ini 'r' membuka ulang compose / 'Delete'
      // menghapus pesan yang sedang dibalas / Escape menutup reader di balik
      // modal — konflik state antar UI.
      if (!shortcutsEnabled) return;
      // Skip saat user mengetik di input/textarea ATAU contentEditable
      // (RichEditor compose — tagName DIV tidak tertangkap guard INPUT/TEXTAREA).
      // Tanpa ini, menekan 'r'/'f'/'s'/Delete saat mengetik di editor compose
      // akan membuka ulang compose / menghapus pesan yang sedang dibaca.
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.contentEditable === 'true') return;
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); handleReply(); }
      else if (e.key.toLowerCase() === 'f') { e.preventDefault(); handleForward(); }
      else if (e.key === 'Delete') { e.preventDefault(); if (!deleteMutation.isPending) deleteMutation.mutate(); }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); flagMutation.mutate(!(msg.isFlagged)); }
      else if (e.key === 'Escape') { e.preventDefault(); if (lightbox) setLightbox(null); else onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [msg, deleteMutation.isPending, shortcutsEnabled, lightbox]);

  function escapeHtml(str) {
    return String(str).replace(/[<>&"']/g, c => {
      const m = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
      return m[c];
    });
  }

  // Unduh pesan sebagai file .eml (rekonstruksi dari data yang sudah dimuat:
  // header + body + lampiran base64). Valid utk dibuka Outlook/Thunderbird.
  async function handleDownloadEml() {
    try {
      const plainBody = htmlToText(rawHtml || '');
      const htmlBody = rawHtml || '';
      const atts = [];
      for (const a of attachments) {
        if (!a.downloadURL) continue;
        try {
          const data = await fetchAttachmentData(a.downloadURL);
          if (data) atts.push({ filename: a.name, contentType: a.contentType, data });
        } catch { /* lampiran gagal diunduh — lewati, .eml tetap terunduh */ }
      }
      const eml = buildEml({
        from, to, cc,
        subject: msg.subject || '',
        date,
        textBody: plainBody,
        htmlBody,
        attachments: atts,
      });
      const blob = new Blob([eml], { type: 'message/rfc822' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(msg.subject || 'email').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80)}.eml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      toast.error('Gagal membuat file .eml.');
    }
  }

  function handlePrint() {
    if (!msg) return;
    const win = window.open('', '_blank');
    if (!win) return;
    // Semua nilai yang diinterpolasi ke document.write harus di-escape:
    // jendela print (about:blank) berbagi origin dengan opener, jadi HTML
    // berbahaya di sini bisa mengakses halaman induk (cookie/opener).
    const safeSubject = escapeHtml(msg.subject);
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
      ${renderHtml}
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
  const subject = msg.subject || '(Tanpa Subjek)';
  const date = msg.date || '';

  const rawHtml = extractHtml(msg.parts);
  const attachments = extractAttachments(msg.parts);
  const inlineImages = extractInlineImages(msg.parts);
  const cleanHtml = rawHtml
    ? prepareHtmlContent(rawHtml, inlineImages)
    : '<p style="color:var(--muted-foreground);font-size:.875rem;margin:0">Tidak ada konten.</p>';
  // Anti tracking-pixel (pola Gmail): gambar eksternal hanya di-proxy pada
  // path RENDER. Quote balasan/forward & editor compose tetap memakai URL
  // asli — konten itu dikirim sebagai email dan harus punya URL valid utk
  // penerima (lihat catatan di src/lib/imageProxy.js).
  const renderHtml = rawHtml ? proxyExternalImages(cleanHtml) : cleanHtml;

  function handleReply() {
    // Semua header email (from/to/date/subject) adalah input dari pengirim dan
    // harus di-escape — body ini di-hydrate ke contentEditable editor via innerHTML.
    const safeFrom    = escapeHtml(from);
    const safeTo      = escapeHtml(to);
    const safeDate    = escapeHtml(date);
    const safeSubject = escapeHtml(subject);
    onReply?.({
      // composeMode 'reply' penting: ComposeModal memilih signature reply
      // (getSignatureFor(email, 'reply')) — tanpa ini balasan memakai
      // signature mode 'new'.
      composeMode: 'reply',
      to: replyTo || from,
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      body: `<br><br><blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:0;color:#666">
        <b>Dari:</b> ${safeFrom}<br>
        <b>Tanggal:</b> ${safeDate}<br>
        <b>Kepada:</b> ${safeTo}<br>
        <b>Subjek:</b> ${safeSubject}<br><br>${cleanHtml}</blockquote>`,
    });
  }

  function handleForward() {
    const safeFrom    = escapeHtml(from);
    const safeTo      = escapeHtml(to);
    const safeDate    = escapeHtml(date);
    const safeSubject = escapeHtml(subject);
    onReply?.({
      composeMode: 'reply', // sama seperti reply — signature reply dipakai
      subject: subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`,
      body: `<br><br><blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:0;color:#666">
        <b>---------- Pesan Diteruskan ----------</b><br>
        <b>Dari:</b> ${safeFrom}<br>
        <b>Tanggal:</b> ${safeDate}<br>
        <b>Kepada:</b> ${safeTo}<br>
        <b>Subjek:</b> ${safeSubject}<br><br>${cleanHtml}</blockquote>`,
    });
  }

  // Orang yang relevan utk "Tambah ke Kontak" — pengirim (kotak masuk) atau
  // penerima pertama (Terkirim/Draf).
  const isSentOrDraft = /(^|\/)sent$/i.test(folder) || /(^|\/)drafts?$/i.test(folder);
  const contactSource = isSentOrDraft
    ? (Array.isArray(msg.to) ? msg.to : [])
    : (Array.isArray(msg.from) ? msg.from : []);
  const contactPerson = contactSource[0] || {};

  // ── Unduh semua lampiran ───────────────────────────────────────────────────
  // SOGo downloadURL diarahkan ke tab baru per lampiran (session cookie ikut);
  // versi ini mengunduh lewat blob + objectURL supaya nama file terjaga.
  async function handleDownloadAll() {
    if (downloadingAll) return;
    const files = attachments
      .map((att) => ({ url: toSafeUrl(att.downloadURL, { base: SOGO_BASE, allowExternal: false }), name: att.name }))
      .filter((f) => f.url);
    if (files.length === 0) return;
    setDownloadingAll(true);
    try {
      let done = 0;
      for (const f of files) {
        await downloadFileBlob(f.url, f.name);
        done += 1;
        setDownloadProgress(`${done}/${files.length}`);
      }
      toast.success(`${done} lampiran diunduh.`);
    } catch (err) {
      toast.error(err?.message || 'Gagal mengunduh lampiran.');
    } finally {
      setDownloadingAll(false);
      setDownloadProgress('');
    }
  }

  // Buka preview lightbox utk gambar/PDF; file lain → unduh di tab baru.
  function openPreview(att) {
    const url = toSafeUrl(att.viewURL || att.downloadURL, { base: SOGO_BASE, allowExternal: false });
    if (!url) return;
    const kind = getFileKind(att.name, att.contentType);
    if (kind === 'image' || kind === 'pdf') {
      setLightbox({ name: att.name, url, kind });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
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
        c_cn: (contactNameRef.current?.value || '').trim(),
        c_mail: (contactEmailRef.current?.value || '').trim(),
        c_telephonenumber: (contactPhoneRef.current?.value || '').trim(),
      });
      setContactOpen(false);
      toast.success('Kontak disimpan');
    } catch (err) {
      setContactError(err?.message || 'Gagal menyimpan kontak.');
    } finally {
      setContactSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background w-full">
      {/* Toolbar */}
      <div className="p-3 border-b border-border flex items-center justify-between sticky top-0 bg-background z-10 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="md:hidden min-w-11 min-h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted" title="Kembali" aria-label="Kembali">
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={() => markRead(user.sogoToken, folder, msgId, false).then(() => {
              queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, folder] });
              queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
            }).catch(() => {})}
            className="min-w-11 min-h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Tandai belum dibaca (U)"
            aria-label="Tandai belum dibaca"
          >
            <Mail size={18} />
          </button>
          <button
            onClick={() => flagMutation.mutate(!(msg.isFlagged))}
            className={`min-w-11 min-h-11 flex items-center justify-center rounded-xl transition-colors ${
              msg.isFlagged ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title="Beri/Tandai bintang (S)"
            aria-label="Tandai berbintang"
            aria-pressed={!!msg.isFlagged}
          >
            <Star size={18} className={msg.isFlagged ? 'fill-amber-600 dark:fill-amber-400' : ''} />
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="min-w-11 min-h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Hapus (Del)"
            aria-label="Hapus pesan"
          >
            {deleteMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
          </button>
          {folder !== 'folderJunk' && (
            <button
              onClick={() => spamMutation.mutate()}
              disabled={spamMutation.isPending}
              className="min-w-11 min-h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-500/10"
              title="Laporkan Spam"
              aria-label="Laporkan spam"
            >
              {spamMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
            </button>
          )}
          {/* Move to folder — click toggle (mobile-friendly) */}
          <div className="relative">
            <button
              onClick={() => setMoveOpen(!moveOpen)}
              className="min-w-11 min-h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
              title="Pindahkan"
              aria-label="Pindahkan ke folder lain"
              aria-expanded={moveOpen}
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
          <button
            onClick={handleDownloadEml}
            className="min-w-11 min-h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Unduh sebagai file .eml"
            aria-label="Unduh sebagai file .eml"
          >
            <FileDown size={18} />
          </button>
          <button onClick={handlePrint} className="min-w-11 min-h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted" title="Cetak" aria-label="Cetak">
            <Printer size={18} />
          </button>
          {(contactPerson?.email || contactPerson?.name) && (
            <button
              onClick={() => { setContactError(''); setContactOpen(true); }}
              className="min-w-11 min-h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-primary hover:bg-muted"
              title="Tambah ke kontak"
              aria-label="Tambah pengirim ke kontak"
            >
              <UserPlus size={18} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button data-shortcut="reply" onClick={handleReply} className="flex items-center gap-2 px-3 min-h-11 rounded-xl text-muted-foreground hover:bg-muted text-sm font-medium" title="Balas (R)">
            <Reply size={16} /> Balas
          </button>
          <button data-shortcut="forward" onClick={handleForward} className="flex items-center gap-2 px-3 min-h-11 rounded-xl text-muted-foreground hover:bg-muted text-sm font-medium" title="Teruskan (F)">
            <Forward size={16} /> Teruskan
          </button>
        </div>
      </div>

      {/* Message header */}
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground mb-4 leading-tight">{subject}</h1>
        <div className="space-y-1.5 text-sm">
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

      {/* Message body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="email-body" dangerouslySetInnerHTML={{ __html: renderHtml }} />

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
                {totalAttachmentSize(attachments) && (
                  <span className="text-xs font-normal text-muted-foreground">· {totalAttachmentSize(attachments)}</span>
                )}
              </h3>
              {attachments.length > 1 && (
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadingAll}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-60"
                  title="Unduh semua lampiran"
                >
                  {downloadingAll ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  {downloadingAll ? (downloadProgress ? `Mengunduh ${downloadProgress}` : 'Mengunduh…') : 'Unduh Semua'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {attachments.map((att, idx) => {
                const attUrl = toSafeUrl(att.downloadURL, { base: SOGO_BASE, allowExternal: false });
                const kind = getFileKind(att.name, att.contentType);
                const isImage = kind === 'image' || isImageType(att.contentType);
                const isPdf = kind === 'pdf';

                // Image attachments: show thumbnail preview (klik → lightbox)
                if (isImage) {
                  return (
                    <a
                      key={idx}
                      href={attUrl || undefined}
                      onClick={(e) => { e.preventDefault(); openPreview(att); }}
                      className="group relative rounded-xl overflow-hidden border border-border bg-card hover:ring-2 hover:ring-primary/30 transition-all"
                      title="Pratinjau gambar"
                    >
                      <img src={attUrl} alt={att.name} className="w-full h-36 object-cover" loading="lazy" />
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                        <div className="text-white text-sm font-medium truncate">{att.name}</div>
                        <div className="text-white/80 text-xs">{formatFileSize(att.size)}</div>
                      </div>
                      <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye size={14} className="text-white" />
                      </div>
                    </a>
                  );
                }

                // Non-image attachments: file card (PDF → preview lightbox)
                return (
                  <a
                    key={idx}
                    href={attUrl || undefined}
                    target={isPdf ? undefined : '_blank'}
                    rel={isPdf ? undefined : 'noreferrer'}
                    onClick={isPdf ? (e) => { e.preventDefault(); openPreview(att); } : undefined}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted transition-colors group"
                    title={isPdf ? 'Pratinjau PDF' : undefined}
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{att.name}</div>
                      <div className="text-xs text-muted-foreground">{formatFileSize(att.size) || att.contentType || ''}</div>
                    </div>
                    {isPdf
                      ? <Eye size={16} className="text-muted-foreground group-hover:text-primary shrink-0" />
                      : <Download size={16} className="text-muted-foreground group-hover:text-primary shrink-0" />}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Preview lampiran (lightbox) ────────────────────────────────────── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="flex flex-col w-full max-w-5xl max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-white text-sm font-medium truncate flex-1">{lightbox.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => downloadFileBlob(lightbox.url, lightbox.name).catch(() => {})}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                >
                  <Download size={14} /> Unduh
                </button>
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                >
                  <ExternalLink size={14} /> Tab baru
                </a>
                <button
                  onClick={() => setLightbox(null)}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  aria-label="Tutup pratinjau"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-black/40 border border-white/10">
              {lightbox.kind === 'image' ? (
                <img src={lightbox.url} alt={lightbox.name} className="w-full h-[80vh] object-contain" />
              ) : (
                <iframe src={lightbox.url} title={lightbox.name} className="w-full h-[80vh] bg-white" />
              )}
            </div>
          </div>
        </div>
      )}

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
