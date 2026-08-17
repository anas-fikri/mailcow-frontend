import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Trash2, Mail, ArrowLeft, Reply, Forward, FileText, Download, Paperclip,
  Flag, Printer, FolderOpen, Star,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { fetchMessage, markRead, markFlagged, deleteMessages, moveMessages } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../lib/toast';
import { MessageReaderSkeleton } from '../Skeleton';
import Avatar from '../Avatar';
import { isSentOrDraftFolder } from '../../lib/constants';
import { PURIFY_CONFIG } from '../../lib/pasteUtils';
import { toSafeUrl } from '../../lib/safeUrl';

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

function escapeHtml(str) {
  return String(str).replace(/[<>&"']/g, c => {
    const m = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return m[c];
  });
}

// Pola tag HTML umum — dipakai utk mendeteksi pesan text/plain yang berisi
// markup (mis. bounce mail "Mail delivery failed" dari SOGo): tampilkan
// sebagai HTML yang di-sanitize, bukan sumber mentah yang di-escape.
const HTML_IN_PLAIN_RE = /<(?:div|p|br|table|tr|td|th|ul|ol|li|h[1-6]|a|span|font|b|strong|i|em|u|center|img|blockquote|pre|code|html|body|head|title)[\s>]/i;

function extractHtml(parts) {
  if (!parts) return '';
  if (parts.contentType === 'text/html' && parts.content) return parts.content;
  if (parts.contentType === 'text/plain' && parts.content) {
    // text/plain tetap harus diperlakukan sebagai teks, bukan HTML. Escape
    // markup yang dikirim pengirim agar tag palsu tidak menjadi DOM aktif.
    // Kecuali kontennya jelas berisi markup HTML (bounce/delivery report) —
    // render sebagai HTML; DOMPurify tetap memfilter tag/atribut berbahaya.
    if (HTML_IN_PLAIN_RE.test(parts.content)) return parts.content;
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

export default function MessageReader({ folder, msgId, onClose, onReply, folders = [], onMoveComplete }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [moveOpen, setMoveOpen] = React.useState(false);

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
      onClose();
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
      onClose();
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
    });
  }

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
        </div>

        <div className="flex items-center gap-1">
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
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Paperclip size={16} />
              Lampiran ({attachments.length})
            </h3>
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
    </div>
  );
}
