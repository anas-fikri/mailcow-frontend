import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Trash2, Mail, ArrowLeft, Reply, Forward, FileText, Download, Paperclip,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { fetchMessage, markRead, deleteMessages } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

const SOGO_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_SOGO_BASE_URL || '');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * SOGo single message (GET /Mail/0/{folder}/{uid}/view):
 * {
 *   from: [{name, email}],
 *   to:   [{name, email}],
 *   subject: "...",
 *   date: "...",
 *   isRead: 1,
 *   parts: {
 *     type: "UIxMailPartAlternativeViewer",
 *     preferredPart: "text/html",
 *     content: [
 *       { type: "UIxMailPartTextViewer", contentType: "text/plain", content: "..." },
 *       { type: "UIxMailPartHTMLViewer", contentType: "text/html", content: "..." },
 *       // attachments (e.g. image, pdf) will have downloadURL and filename
 *     ]
 *   }
 * }
 */

/** Rekursif: cari konten HTML atau plaintext dari parts tree */
function extractHtml(parts) {
  if (!parts) return '';

  // Leaf node dengan contentType
  if (parts.contentType === 'text/html' && parts.content) {
    return parts.content;
  }
  if (parts.contentType === 'text/plain' && parts.content) {
    // Jika tidak ada HTML, render plaintext dengan <pre>
    return `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${
      parts.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }</pre>`;
  }

  if (Array.isArray(parts.content)) {
    // Prioritaskan HTML
    const htmlPart = parts.content.find(c => c.contentType === 'text/html');
    if (htmlPart) return extractHtml(htmlPart);

    // Rekursi ke tiap child
    for (const child of parts.content) {
      const html = extractHtml(child);
      if (html) return html;
    }
  }

  return '';
}

/** Kumpulkan semua attachment dari parts tree */
function extractAttachments(parts, result = []) {
  if (!parts) return result;

  const ct = parts.contentType || '';
  const isInline = ct === 'text/html' || ct === 'text/plain';
  const isMultipart = ct.startsWith('multipart/') || (parts.type || '').includes('Alternative') || (parts.type || '').includes('Mixed');

  // Node yang punya downloadURL dan bukan inline text = attachment
  if (parts.downloadURL && !isInline) {
    result.push({
      name: parts.filename || parts.name || `attachment`,
      size: parts.size || 0,
      contentType: ct,
      downloadURL: parts.downloadURL,
    });
  }

  if (Array.isArray(parts.content)) {
    parts.content.forEach(child => extractAttachments(child, result));
  }

  return result;
}

/** Format array [{name, email}] → "Name <email>" string */
function formatAddresses(arr) {
  if (!arr) return '';
  if (typeof arr === 'string') return arr;
  return arr.map(a => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', ');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MessageReader({ folder, msgId, onClose, onReply }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: msg, isLoading } = useQuery({
    queryKey: ['message', user?.sogoToken, folder, msgId],
    queryFn: async () => {
      const data = await fetchMessage(user?.sogoToken, folder, msgId);
      // Mark as read optimistically
      markRead(user?.sogoToken, folder, msgId, true).then(() => {
        queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, folder] });
        queryClient.invalidateQueries({ queryKey: ['unseen', user?.sogoToken] });
      });
      return data;
    },
    enabled: !!msgId && !!user?.sogoToken,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMessages(user.sogoToken, folder, [msgId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, folder] });
      onClose();
    },
  });

  // Keyboard shortcuts
  React.useEffect(() => {
    if (!msg) return;
    const handler = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleReply();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleForward();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (!deleteMutation.isPending) deleteMutation.mutate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [msg, deleteMutation.isPending]);

  if (!msgId) return null;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <Loader2 size={24} className="animate-spin text-primary" />
        <span className="text-sm">Memuat isi pesan...</span>
      </div>
    );
  }

  if (!msg) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Gagal memuat pesan.</p>
      </div>
    );
  }

  // ── Parse data dari format SOGo baru ────────────────────────────────────────
  const from    = formatAddresses(msg.from);
  const to      = formatAddresses(msg.to);
  const cc      = formatAddresses(msg.cc);
  const replyTo = formatAddresses(msg['reply-to']);
  const subject = msg.subject || '(Tanpa Subjek)';
  const date    = msg.date || '';

  const rawHtml    = extractHtml(msg.parts);
  const cleanHtml  = rawHtml
    ? DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target'], FORCE_BODY: true, ADD_TAGS: ['style'] })
    : '<p style="color:var(--muted-foreground);font-size:.875rem">Tidak ada konten.</p>';

  const attachments = extractAttachments(msg.parts);

  function handleReply() {
    onReply?.({
      to: replyTo || from,
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      body: `<br><br><blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:0;color:#666">
        <b>Dari:</b> ${from}<br>
        <b>Tanggal:</b> ${date}<br>
        <b>Kepada:</b> ${to}<br>
        <b>Subjek:</b> ${subject}<br><br>
        ${rawHtml}
      </blockquote>`,
    });
  }

  function handleForward() {
    onReply?.({
      subject: subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`,
      body: `<br><br><blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:0;color:#666">
        <b>---------- Pesan Diteruskan ----------</b><br>
        <b>Dari:</b> ${from}<br>
        <b>Tanggal:</b> ${date}<br>
        <b>Kepada:</b> ${to}<br>
        <b>Subjek:</b> ${subject}<br><br>
        ${rawHtml}
      </blockquote>`,
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background w-full">

      {/* Toolbar */}
      <div className="p-3 border-b border-border flex items-center justify-between sticky top-0 bg-background z-10">
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="md:hidden p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Kembali"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={() => markRead(user.sogoToken, folder, msgId, false).then(() => {
              queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, folder] });
              queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
            })}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Tandai belum dibaca (U)"
          >
            <Mail size={18} />
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Hapus (Del)"
          >
            {deleteMutation.isPending
              ? <Loader2 size={18} className="animate-spin" />
              : <Trash2 size={18} />}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleReply}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-muted-foreground hover:bg-muted text-sm font-medium"
            title="Balas (R)"
          >
            <Reply size={16} /> Balas
          </button>
          <button
            onClick={handleForward}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-muted-foreground hover:bg-muted text-sm font-medium"
            title="Teruskan (F)"
          >
            <Forward size={16} /> Teruskan
          </button>
        </div>
      </div>

      {/* Message header info */}
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground mb-4 leading-tight">{subject}</h1>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex gap-2">
                <span className="text-muted-foreground shrink-0 w-12 text-right">Dari:</span>
                <span className="font-medium text-foreground truncate">{from}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground shrink-0 w-12 text-right">Kepada:</span>
                <span className="text-foreground truncate">{to}</span>
              </div>
              {cc && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground shrink-0 w-12 text-right">Cc:</span>
                  <span className="text-foreground truncate">{cc}</span>
                </div>
              )}
            </div>
            <div className="text-muted-foreground text-xs shrink-0 text-right">{date}</div>
          </div>
        </div>
      </div>

      {/* Message body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div
          className="prose dark:prose-invert max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="mt-8 pt-6 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Paperclip size={16} />
              Lampiran ({attachments.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {attachments.map((att, idx) => (
                <a
                  key={idx}
                  href={att.downloadURL.startsWith('/SOGo') ? `${SOGO_BASE}${att.downloadURL}` : att.downloadURL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{att.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {att.size ? (att.size > 1024 * 1024
                        ? `${(att.size / 1024 / 1024).toFixed(1)} MB`
                        : `${Math.round(att.size / 1024)} KB`)
                        : att.contentType || ''}
                    </div>
                  </div>
                  <Download size={16} className="text-muted-foreground group-hover:text-primary shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
