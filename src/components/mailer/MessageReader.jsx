import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Trash2, Mail, MailOpen, ArrowLeft, Reply, ReplyAll, Forward, FileText, Download, FileDown, Paperclip,
  Printer, FolderOpen, Star, AlertTriangle, UserPlus, ExternalLink, Eye, X, ShieldCheck,
  Table2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, TriangleAlert, Folder, Code2, ZoomIn, ZoomOut, Copy,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { fetchMessage, markRead, markFlagged, deleteMessages, moveMessages, markMessagesAsJunk, markMessagesAsNotJunk, createContact, fetchAttachmentData, fetchMessageHeadersRaw } from '../../lib/api';
import { unsnoozeMessages } from '../../lib/snooze';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../lib/toast';
import { MessageReaderSkeleton } from '../Skeleton';
import { PURIFY_CONFIG } from '../../lib/pasteUtils';
import { sanitizeEmailHtml } from '../../lib/emailIsolation';
import { toSafeUrl } from '../../lib/safeUrl';
import { formatAddresses, parseAddressList, formatRecipientSummary } from '../../lib/format';
import { extractHtml, extractAttachments, isInlineBodyImage } from '../../lib/messageHtml';
import { proxyExternalImages } from '../../lib/imageProxy';
import { resolveCidReferences } from '../../lib/cidImages';
import { getFileKind, fileExtension, formatFileSize, totalAttachmentSize } from '../../lib/attachments';
import { convertDocxToHtml } from '../../lib/docPreview';
import { parsePptx, listZip } from '../../lib/packPreview';
import { buildEml, htmlToText, collectInlineCids } from '../../lib/emlUtils';
import { analyzePhishing, RISK_LEVELS } from '../../lib/phishingDetection';
import { buildReplyDataAsync, escapeHtml, formatLongDateId } from '../../lib/replyBuilder';
import { splitQuotedHtml } from '../../lib/quoteCollapse';
import { getInitials } from '../../lib/initials';

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
  // SOGo bisa kirim parts sebagai ARRAY langsung (bukan object {content}) —
  // tanpa guard ini gambar CID tidak pernah terkumpul → tidak tampil di body.
  if (Array.isArray(parts)) {
    parts.forEach((child) => extractInlineImages(child, result));
    return result;
  }
  if (parts.contentType?.startsWith('image/') && parts.downloadURL) {
    result.push({
      name: parts.filename || parts.name || 'image',
      // Content-ID mentah dari SOGo (jika ada) — dipakai resolver CID utk
      // match persis sebelum fallback nama file (lihat lib/cidImages.js).
      contentId: parts.contentId || parts.contentID || parts.cId || '',
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
 * Sanitize and prepare HTML for rendering.
 * Strips <html>/<body>/<head> wrappers, resolves CID images, sanitizes with DOMPurify.
 */
function prepareHtmlContent(rawHtml, inlineImages) {
  if (!rawHtml) return '';

  // Resolve CID images first (murni lib — menangani cid:nama.ext@uuid ala
  // Outlook yang tidak pernah match di resolver lama → signature gambar
  // dari Outlook/Exchange kini tampil).
  let html = resolveCidReferences(rawHtml, inlineImages, toSafeUrl, { base: SOGO_BASE, allowExternal: false });

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
  return sanitizeEmailHtml(DOMPurify, html, EMAIL_PURIFY_CONFIG);
}

function isImageType(ct) {
  return ct?.startsWith('image/');
}
// NOTE: formatFileSize diimpor dari lib/attachments (menangani size STRING
// terformat SOGo "1.2 MB" — versi lokal lama menghasilkan "NaN KB").

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

// ─── Zoom body (Ctrl/Cmd + / − / 0, tombol A−/A+) ────────────────────────────
// Skala disimpan di localStorage (bukan per-akun: ini preferensi perangkat/
// layar, bukan preferensi akun) dan diterapkan via CSS `zoom` supaya email
// dengan font-size px eksplisit ikut membesar (persentase font-size tidak).
const ZOOM_KEY = 'pcp_reader_zoom';
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
function clampZoom(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) * 10) / 10;
}
function readZoom() {
  try { return clampZoom(localStorage.getItem(ZOOM_KEY) ?? 1); } catch { return 1; }
}
function writeZoom(v) {
  try { localStorage.setItem(ZOOM_KEY, String(v)); } catch { /* quota/privasi — abaikan */ }
}

// Tombol ikon toolbar: 44px target sentuh di layar kecil, 32px kompak di desktop.
const TB_BTN = 'min-w-11 min-h-11 md:min-w-8 md:min-h-8 flex items-center justify-center rounded-md transition-colors duration-150 ease-out';

// Warna avatar pengirim deterministik dari alamat (pola Outlook/Gmail).
const AVATAR_COLORS = [
  'bg-sky-600', 'bg-emerald-600', 'bg-violet-600', 'bg-rose-600',
  'bg-amber-600', 'bg-teal-600', 'bg-indigo-600', 'bg-fuchsia-600',
];
function avatarColor(seed) {
  const s = String(seed || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Props:
 * - onMoveComplete({ next }) — dipanggil setelah pindah/spam/bukan-spam; `next`
 *   = uid yang di-auto-advance (hasil navigateAfter) atau null bila reader
 *   ditutup.
 * - onReadStateChange(uid, isRead) — dipanggil setiap reader mengubah status
 *   dibaca (auto-mark / toggle manual) agar daftar bisa update cache-nya
 *   secara optimistis tanpa refetch seluruh daftar.
 */
/**
 * Chip penerima di panel detail (pola Outlook): nama + email muted, title =
 * alamat lengkap, klik = salin alamat (subtle — ikon copy muncul saat hover).
 * Daftar membungkus; penerima sangat banyak di-scroll (max-h-64).
 */
function RecipientChips({ list }) {
  const copyAddr = async (addr) => {
    const text = addr.email || addr.name;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Alamat disalin');
    } catch {
      toast.error('Gagal menyalin alamat.');
    }
  };
  if (!list?.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-wrap gap-1 max-h-64 overflow-y-auto">
      {list.map((a, i) => (
        <li key={i} className="max-w-full">
          <button
            type="button"
            onClick={() => copyAddr(a)}
            className="group/chip inline-flex items-center gap-1 max-w-full min-h-11 md:min-h-7 rounded-full border border-border bg-muted/50 hover:bg-muted px-2 py-0.5 text-left transition-colors"
            title={`${a.name && a.email ? `${a.name} <${a.email}>` : (a.email || a.name)} — klik untuk salin`}
          >
            {a.name && <span className="text-xs text-foreground truncate max-w-[14rem]">{a.name}</span>}
            <span className="text-[11px] text-muted-foreground truncate max-w-[16rem]">{a.email || null}</span>
            <Copy size={10} className="shrink-0 text-muted-foreground opacity-0 group-hover/chip:opacity-100 transition-opacity" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function MessageReader({ folder, msgId, onClose, onReply, folders = [], onMoveComplete, onSnoozeCleared, onReadStateChange, shortcutsEnabled = true, siblingUids = [], siblingTotal, onNavigateTo }) {
  const { user, markReadMode, markReadDelaySec } = useAuthStore();
  const queryClient = useQueryClient();
  const token = user?.sogoToken;
  const [moveOpen, setMoveOpen] = React.useState(false);
  // Header: detail penerima lengkap (Kepada/Cc/Balas ke) & modal header mentah.
  const [showDetails, setShowDetails] = React.useState(false);
  const [headersModal, setHeadersModal] = React.useState(null); // { loading, raw?, error? } | null
  // Konfirmasi hapus permanen (folder Sampah).
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  // Kutipan balasan terlipat ("Tampilkan kutipan").
  const [quoteOpen, setQuoteOpen] = React.useState(false);
  // Zoom body.
  const [zoom, setZoomState] = React.useState(readZoom);
  // Balas/Teruskan sedang disiapkan (forward mengunduh lampiran asli).
  const [composeBusy, setComposeBusy] = React.useState(null); // 'reply'|'replyAll'|'forward'|null
  const [composeProgress, setComposeProgress] = React.useState('');
  // Preview lampiran (gambar/PDF) — lightbox full-screen.
  const [lightbox, setLightbox] = React.useState(null); // { name, url, kind } | null
  // Pratinjau dokumen Word (.docx) in-app: { name, url, loading, html?, error? }.
  const [docPreview, setDocPreview] = React.useState(null);
  // Pratinjau paket (PowerPoint .pptx / arsip .zip) in-app.
  const [packPreview, setPackPreview] = React.useState(null); // { name, url, type, ... }
  // Preview spreadsheet/teks in-app: { name, kind } saat loading, lalu + data.
  const [sheetPreview, setSheetPreview] = React.useState(null); // { name, kind, url, sheets:[{name, rows}], error? }
  const [sheetTab, setSheetTab] = React.useState(0);
  // Tambah ke kontak.
  const [contactOpen, setContactOpen] = React.useState(false);
  const [contactSaving, setContactSaving] = React.useState(false);
  const [contactError, setContactError] = React.useState('');
  const contactNameRef = React.useRef(null);
  const contactEmailRef = React.useRef(null);
  const contactPhoneRef = React.useRef(null);
  // Unduh semua lampiran.
  const [downloadingAll, setDownloadingAll] = React.useState(false);
  // idx lampiran yang sedang diunduh via tombol Unduh per-kartu (spinner).
  const [downloadingIdx, setDownloadingIdx] = React.useState(null);
  const [downloadProgress, setDownloadProgress] = React.useState('');

  const messageKey = ['message', token, folder, msgId];
  const { data: msg, isLoading, error: loadError, refetch } = useQuery({
    queryKey: messageKey,
    // Tandai-dibaca TIDAK di sini: queryFn jalan di setiap refetch (fokus
    // window, invalidasi) → markRead berulang + refetch seluruh daftar.
    // Perilaku ala Outlook (instant/delay/manual) ada di effect di bawah.
    queryFn: () => fetchMessage(token, folder, msgId),
    enabled: !!msgId && !!token,
  });

  // Reset state per-pesan saat berpindah pesan.
  React.useEffect(() => {
    setQuoteOpen(false);
    setShowDetails(false);
    setHeadersModal(null);
    setConfirmDelete(false);
    setMoveOpen(false);
  }, [msgId, folder]);

  // ── Patch cache secara optimistis (tanpa refetch daftar) ───────────────────
  // Daftar pesan: ['messages', token, folder, …] → { messages:[{uid,isRead,isFlagged}] }
  function patchListCache(patch) {
    queryClient.setQueriesData({ queryKey: ['messages', token, folder] }, (old) => {
      if (!old || !Array.isArray(old.messages)) return old;
      let touched = false;
      // String-safe: uid daftar bisa number, msgId dari route/props string.
      const messages = old.messages.map((m) => {
        if (m == null || String(m.uid) !== String(msgId)) return m;
        if (Object.keys(patch).every((k) => m[k] === patch[k])) return m; // sudah sama
        touched = true;
        return { ...m, ...patch };
      });
      return touched ? { ...old, messages } : old;
    });
  }
  function patchMessageCache(patch) {
    queryClient.setQueryData(messageKey, (old) => (old ? { ...old, ...patch } : old));
  }

  // ── Tandai dibaca ala Outlook ──────────────────────────────────────────────
  // instant → saat pesan terbuka; delay → setelah markReadDelaySec detik pesan
  // terbuka (batal bila user pindah lebih dulu); manual → tidak pernah otomatis.
  // uid yang ditandai "belum dibaca" manual tidak boleh langsung ditandai
  // dibaca lagi oleh effect ini (ref, bukan state: tidak perlu render ulang).
  const manualUnreadRef = React.useRef(null);
  // `${folder}/${uid}` yang sudah diproses tandai-dibaca otomatis — cegah
  // percobaan ulang beruntun (mis. rollback optimis setelah gagal) untuk
  // pesan yang sama selama tetap terbuka.
  const autoReadDoneRef = React.useRef(null);
  React.useEffect(() => {
    if (manualUnreadRef.current !== null && manualUnreadRef.current !== msgId) manualUnreadRef.current = null;
    autoReadDoneRef.current = null;
  }, [msgId, folder]);
  const isRead = !!(msg && (msg.isRead === 1 || msg.isRead === true));
  React.useEffect(() => {
    if (!msg || !msgId || !token) return;
    if (isRead) {
      // Detail sudah "dibaca" (mis. SOGo /view menandai \Seen sendiri saat
      // SOGoMailAutoMarkAsReadDelay=0, atau tab lain) tetapi baris daftar bisa
      // masih "belum dibaca" → sinkronkan daftar LOKAL, tanpa request.
      // applyReadLocal di MailPage idempoten (hanya baris yang berubah).
      onReadStateChange?.(msgId, true);
      patchListCache({ isRead: true });
      return;
    }
    if (markReadMode === 'manual') return;
    if (manualUnreadRef.current === msgId) return;
    const doneKey = `${folder}/${msgId}`;
    if (autoReadDoneRef.current === doneKey) return;
    const delayMs = markReadMode === 'delay' ? Math.max(0, Number(markReadDelaySec) || 0) * 1000 : 0;
    const optimistic = markReadMode !== 'delay'; // 'instant' → baris langsung dibaca
    const targetKey = messageKey;
    const targetUid = msgId;
    const targetFolder = folder;
    const patchTargetList = (read) => {
      queryClient.setQueriesData({ queryKey: ['messages', token, targetFolder] }, (old) => {
        if (!old || !Array.isArray(old.messages)) return old;
        let touched = false;
        const messages = old.messages.map((m) => {
          if (m == null || String(m.uid) !== String(targetUid) || !!m.isRead === read) return m;
          touched = true;
          return { ...m, isRead: read };
        });
        return touched ? { ...old, messages } : old;
      });
    };
    const run = () => {
      autoReadDoneRef.current = doneKey;
      if (optimistic) {
        // onReadStateChange DULU (applyReadLocal menghitung baris berubah utk
        // badge unseen), lalu patch cache reader (no-op bila sudah dibaca).
        onReadStateChange?.(targetUid, true);
        patchTargetList(true);
      }
      markRead(token, targetFolder, targetUid, true).then(() => {
        onReadStateChange?.(targetUid, true);
        patchTargetList(true);
        queryClient.setQueryData(targetKey, (old) => (old ? { ...old, isRead: 1 } : old));
        queryClient.invalidateQueries({ queryKey: ['unseen', token] });
      }).catch(() => {
        // Gagal tandai dibaca: tidak kritis; kembalikan baris yang optimis.
        if (optimistic && manualUnreadRef.current !== targetUid) {
          onReadStateChange?.(targetUid, false);
          patchTargetList(false);
        }
      });
    };
    if (delayMs === 0) { run(); return; }
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  }, [msg, isRead, msgId, folder, token, markReadMode, markReadDelaySec]);

  // Toggle dibaca/belum dibaca manual (tombol & tombol 'u') — optimistis.
  const readMutation = useMutation({
    mutationFn: (nextRead) => markRead(token, folder, msgId, nextRead),
    onMutate: (nextRead) => {
      manualUnreadRef.current = nextRead ? null : msgId;
      patchMessageCache({ isRead: nextRead ? 1 : 0 });
      patchListCache({ isRead: nextRead });
      onReadStateChange?.(msgId, nextRead);
      return { prevRead: isRead };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unseen', token] });
    },
    onError: (err, nextRead, ctx) => {
      manualUnreadRef.current = null;
      patchMessageCache({ isRead: ctx?.prevRead ? 1 : 0 });
      patchListCache({ isRead: !!ctx?.prevRead });
      onReadStateChange?.(msgId, !!ctx?.prevRead);
      toast.error(err?.message || 'Gagal mengubah status dibaca.');
    },
  });

  // Auto-advance (pola Gmail/Outlook): setelah hapus/pindah/spam, buka pesan
  // berikutnya di daftar (siblingUids = urutan tampil, flat atau conversation).
  // Fallback ke pesan sebelumnya bila di ujung, baru tutup reader.
  // @returns uid yang dibuka berikutnya, atau null bila reader ditutup.
  function navigateAfter() {
    const idx = siblingUids.indexOf(msgId);
    if (idx >= 0) {
      const next = siblingUids[idx + 1] ?? siblingUids[idx - 1];
      if (next) {
        onNavigateTo?.(next);
        return next;
      }
    }
    onClose();
    return null;
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
      // Pesan keluar dari folder → daftar WAJIB refetch (tidak terhindarkan).
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      navigateAfter();
      toast.success(folder === 'folderTrash' ? 'Pesan dihapus permanen' : 'Pesan dipindah ke Sampah');
    },
    onError: (err) => toast.error(err?.message || 'Gagal menghapus pesan.'),
  });

  // Bintang — optimistis (ikon langsung berubah), rollback + toast bila gagal.
  const flagMutation = useMutation({
    mutationFn: (flagged) => markFlagged(user.sogoToken, folder, msgId, flagged),
    onMutate: (flagged) => {
      const prev = !!msg?.isFlagged;
      patchMessageCache({ isFlagged: flagged });
      patchListCache({ isFlagged: flagged });
      return { prev };
    },
    onError: (err, _flagged, ctx) => {
      patchMessageCache({ isFlagged: !!ctx?.prev });
      patchListCache({ isFlagged: !!ctx?.prev });
      toast.error(err?.message || 'Gagal mengubah tanda bintang.');
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
      const next = navigateAfter();
      onMoveComplete?.({ next });
      toast.success('Pesan dipindahkan');
    },
    onError: (err) => toast.error(err?.message || 'Gagal memindahkan pesan.'),
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
      const next = navigateAfter();
      onMoveComplete?.({ next });
      toast.success('Pesan dilaporkan sebagai spam');
    },
    onError: (err) => toast.error(err?.message || 'Gagal melaporkan spam.'),
  });

  // Bukan Spam — markMessagesAsNotJunk: laporan not-spam (best-effort) +
  // pindah balik ke INBOX bila source folder Junk (perilaku native SOGo).
  const notSpamMutation = useMutation({
    mutationFn: () => markMessagesAsNotJunk(user.sogoToken, folder, [msgId]),
    onSuccess: () => {
      if (user?.email && unsnoozeMessages(user.email, folder, [msgId]) > 0) {
        onSnoozeCleared?.();
      }
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      const next = navigateAfter();
      onMoveComplete?.({ next });
      toast.success('Pesan dikembalikan ke Kotak Masuk');
    },
    onError: (err) => toast.error(err?.message || 'Gagal membatalkan spam.'),
  });

  // Hapus: di folder Sampah = permanen → minta konfirmasi dulu.
  function requestDelete() {
    if (deleteMutation.isPending) return;
    if (folder === 'folderTrash') setConfirmDelete(true);
    else deleteMutation.mutate();
  }

  // Zoom body: simpan ke localStorage + state.
  function setZoom(next) {
    const v = clampZoom(next);
    setZoomState(v);
    writeZoom(v);
  }

  // Cache hasil split+sanitasi ulang kutipan (dipakai di bawah, SETELAH early
  // return). Memakai ref yang dideklarasikan DI SINI — bukan useMemo di bawah —
  // karena hook setelah early return mengubah jumlah hook antar-render dan
  // membuat seluruh app crash (bug QA 2026-10-11: "Rendered more hooks").
  const quotedCacheRef = React.useRef({ key: null, value: null });

  // Banner peringatan keamanan: ringkas default, detail & sembunyikan per pesan
  // (direset saat pindah pesan). Dideklarasikan sebelum early return.
  const [phishingOpen, setPhishingOpen] = React.useState(false);
  const [phishingHidden, setPhishingHidden] = React.useState(false);
  React.useEffect(() => { setPhishingOpen(false); setPhishingHidden(false); }, [msgId, folder]);

  // Hook ini WAJIB dideklarasikan sebelum early return apa pun di bawah.
  // Query berpindah dari loading → loaded menyebabkan render ulang; jika hook
  // berada setelah `if (!msgId)`/`if (isLoading)`, jumlah hook berubah dan
  // React melempar error #310 (Rendered fewer hooks than expected).
  const phishingResult = React.useMemo(() => {
    if (!msg) return null;
    const bodyHtml = extractHtml(msg.parts) || '';
    return analyzePhishing({
      from: formatAddresses(msg.from),
      replyTo: formatAddresses(msg['reply-to']),
      subject: msg.subject || '',
      bodyHtml,
      bodyPlain: '',
    });
  }, [msg]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  // Handler nyata disusun di bawah (setelah guard, karena butuh handleReply/
  // cleanHtml) dan disimpan di ref SETIAP render → listener global selalu
  // memanggil closure terbaru. Tanpa pola ini dependency array mudah basi
  // (bug lama: Esc tidak menutup pratinjau spreadsheet karena sheetPreview
  // tidak ada di deps). Saat pesan belum termuat ref di-null-kan.
  const keyHandlerRef = React.useRef(null);
  keyHandlerRef.current = null;
  React.useEffect(() => {
    if (!msg) return;
    const handler = (e) => keyHandlerRef.current?.(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [msg, deleteMutation.isPending, shortcutsEnabled, lightbox]);

  // Unduh pesan sebagai file .eml (rekonstruksi dari data yang sudah dimuat:
  // header + body + lampiran base64). Valid utk dibuka Outlook/Thunderbird.
  async function handleDownloadEml() {
    try {
      const plainBody = htmlToText(rawHtml || '');
      const atts = [];
      // includeHidden: part inline CID (flag 0) ikut di-export — tanpa itu
      // gambar di body (cid:) tidak ter-resolve di email client penerima .eml.
      const hidden = extractAttachments(msg.parts, [], { includeHidden: true });
      // SOGo /view me-rewrite cid: → URL absolut SEBELUM html sampai ke
      // frontend, dan TIDAK mengekspos Content-ID → collectInlineCids
      // memetakan part ↔ src by basename dan me-rewrite balik ke cid:
      // (bug tertangkap E2E live 2026-09-23: token cid: tak pernah ada di
      // rawHtml, PNG ter-export jadi attachment biasa + URL session bocor).
      const { html: htmlWithCid, cidMap } = collectInlineCids(rawHtml || '', hidden);
      for (const a of hidden) {
        if (!a.downloadURL) continue;
        try {
          const data = await fetchAttachmentData(a.downloadURL);
          if (data) {
            const cid = cidMap.get(a.name) || a.contentId || null;
            atts.push({ filename: a.name, contentType: a.contentType, data, contentId: cid, inline: a.inline || !!cid });
          }
        } catch { /* lampiran gagal diunduh — lewati, .eml tetap terunduh */ }
      }
      const eml = buildEml({
        from, to, cc,
        subject: msg.subject || '',
        date,
        textBody: plainBody,
        htmlBody: htmlWithCid,
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


  if (!msgId) return null;

  if (isLoading) return <MessageReaderSkeleton />;

  if (!msg) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-6 text-center">
        <TriangleAlert size={22} className="text-amber-500" />
        <p className="text-sm">Gagal memuat pesan.</p>
        {loadError?.message && <p className="text-xs text-muted-foreground/80 max-w-sm">{loadError.message}</p>}
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Coba lagi</button>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:underline">Kembali</button>
        </div>
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
  // parseAddressList (format.js): kutip pembungkus nama ('Eko Budi') dibuang,
  // nama ber-koma dalam kutip tidak terbelah — tampilan ala Outlook.
  const fromList = parseAddressList(msg.from);
  const toList = parseAddressList(msg.to);
  const ccList = parseAddressList(msg.cc);
  const replyToList = parseAddressList(msg['reply-to']);
  const sender = fromList[0] || { name: '', email: '' };
  const longDate = formatLongDateId(date);
  // Heuristik Outlook: >1 penerima (To+Cc) → "Balas Semua" lebih mungkin.
  const replyAllLikely = (toList.length + ccList.length) > 1;
  // Posisi di daftar (prev/next + "x dari N").
  const navIdx = siblingUids.indexOf(msgId);
  const navTotal = siblingUids.length;
  const prevUid = navIdx > 0 ? siblingUids[navIdx - 1] : null;
  const nextUid = navIdx >= 0 && navIdx < navTotal - 1 ? siblingUids[navIdx + 1] : null;

  const rawHtml = extractHtml(msg.parts);
  // Gambar yang ke-refer di body (footer/banner/signature — CID atau URL hasil
  // rewrite SOGo) bukan lampiran: sembunyikan dari daftar.
  const attachments = extractAttachments(msg.parts)
    .filter((att) => !isInlineBodyImage(att, rawHtml));
  const inlineImages = extractInlineImages(msg.parts);
  const cleanHtml = rawHtml
    ? prepareHtmlContent(rawHtml, inlineImages)
    : '<p style="color:var(--muted-foreground);font-size:.875rem;margin:0">Tidak ada konten.</p>';
  // Anti tracking-pixel (pola Gmail): gambar eksternal hanya di-proxy pada
  // path RENDER. Quote balasan/forward & editor compose tetap memakai URL
  // asli — konten itu dikirim sebagai email dan harus punya URL valid utk
  // penerima (lihat catatan di src/lib/imageProxy.js).
  const renderHtml = rawHtml ? proxyExternalImages(cleanHtml) : cleanHtml;
  // Lipat kutipan balasan (pola Gmail/Outlook "…"). KEAMANAN: pemisahan
  // berbasis string bisa memotong di TENGAH atribut (marker kutipan di dalam
  // title/alt) sehingga markup inert di dalam atribut "hidup kembali" saat
  // potongan di-parse ulang oleh dangerouslySetInnerHTML — bypass DOMPurify
  // (temuan security review 2026-10-11, PoC terverifikasi). Karena itu KEDUA
  // potongan WAJIB disanitasi ulang tepat sebelum render; split yang jatuh di
  // posisi aman menghasilkan HTML identik, split yang "merusak" dinetralkan.
  // BUKAN hook (kita berada setelah early return) — memo manual via
  // quotedCacheRef yang dideklarasikan sebelum early return.
  const quoted = (() => {
    const key = rawHtml ? renderHtml : null;
    if (quotedCacheRef.current.key === key && quotedCacheRef.current.value) return quotedCacheRef.current.value;
    let value;
    if (!rawHtml) value = { main: renderHtml, quote: '' };
    else {
      const q = splitQuotedHtml(renderHtml);
      value = !q.quote
        ? { main: renderHtml, quote: '' }
        : {
          main: sanitizeEmailHtml(DOMPurify, q.main, EMAIL_PURIFY_CONFIG),
          quote: sanitizeEmailHtml(DOMPurify, q.quote, EMAIL_PURIFY_CONFIG),
        };
    }
    quotedCacheRef.current = { key, value };
    return value;
  })();
  const hasQuote = !!quoted.quote;

  function handlePrint() {
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.');
      return;
    }
    // Semua nilai yang diinterpolasi ke document.write harus di-escape:
    // jendela print (about:blank) berbagi origin dengan opener, jadi HTML
    // berbahaya di sini bisa mengakses halaman induk (cookie/opener).
    const safeSubject = escapeHtml(msg.subject);
    const safeFrom    = escapeHtml(formatAddresses(msg.from));
    const safeTo      = escapeHtml(formatAddresses(msg.to));
    const safeCc      = escapeHtml(formatAddresses(msg.cc));
    const safeDate    = escapeHtml(longDate || msg.date || '');
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
    // Tunggu gambar termuat (maks 4 dtk) — tanpa ini cetak jalan saat gambar
    // masih kosong (bug "gambar hilang di hasil cetak").
    const imgs = Array.from(win.document.images || []);
    const waits = imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })));
    const timeout = new Promise((r) => setTimeout(r, 4000));
    Promise.race([Promise.all(waits), timeout]).then(() => {
      try { win.focus(); win.print(); } catch { /* jendela sudah ditutup user */ }
    });
  }

  // Balas / Balas Semua / Teruskan — semua lewat replyBuilder (To/Cc tanpa
  // diri sendiri, prefix subjek case-insensitive, header kutipan ala Outlook,
  // In-Reply-To/References dari viewsource bila /view tidak membawanya).
  // Teruskan mengunduh lampiran asli dulu (spinner + progres; gagal → toast).
  async function openCompose(mode) {
    if (composeBusy) return;
    setComposeBusy(mode);
    setComposeProgress('');
    try {
      const data = await buildReplyDataAsync(token, folder, msgId, {
        mode,
        message: msg,
        userEmail: [user?.email, user?.sogoToken].filter(Boolean),
        folderId: folder,
        uid: msgId,
        // cleanHtml (sudah disanitasi + CID ter-resolve), BUKAN renderHtml:
        // URL proxy gambar tidak valid utk penerima.
        bodyHtml: cleanHtml,
        onProgress: (done, total) => setComposeProgress(`${done}/${total}`),
      });
      onReply?.(data);
    } catch (err) {
      toast.error(err?.message || (mode === 'forward' ? 'Gagal mengunduh lampiran untuk diteruskan.' : 'Gagal menyiapkan balasan.'));
    } finally {
      setComposeBusy(null);
      setComposeProgress('');
    }
  }
  const handleReply = () => openCompose('reply');
  const handleReplyAll = () => openCompose('replyAll');
  const handleForward = () => openCompose('forward');

  // Header mentah (viewsource) — lazy, hanya saat diminta.
  function openHeaders() {
    setHeadersModal({ loading: true });
    fetchMessageHeadersRaw(token, folder, msgId)
      .then((h) => setHeadersModal({ raw: h.raw, list: h.list }))
      .catch((err) => setHeadersModal({ error: err?.message || 'Gagal memuat header pesan.' }));
  }

  // Handler keyboard terbaru (lihat keyHandlerRef di atas).
  keyHandlerRef.current = (e) => {
    // Mati saat modal lain terbuka di atas reader (mis. ComposeModal reply
    // yang menimpa reader). Tanpa ini 'r' membuka ulang compose / 'Delete'
    // menghapus pesan yang sedang dibalas / Escape menutup reader di balik
    // modal — konflik state antar UI.
    if (!shortcutsEnabled) return;
    // Skip saat user mengetik di input/textarea/select ATAU contentEditable
    // (RichEditor compose — tagName DIV tidak tertangkap guard INPUT/TEXTAREA).
    const t = e.target;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName) || t?.isContentEditable || t?.contentEditable === 'true') return;
    if (e.altKey) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod) {
      // Hanya kombinasi milik reader; Ctrl/Cmd+R/F/S/P dll. tetap ke browser
      // (bug lama: reload/find/save ter-intercept jadi balas/teruskan/bintang).
      if (e.key === ',') { e.preventDefault(); if (prevUid) onNavigateTo?.(prevUid); }
      else if (e.key === '.') { e.preventDefault(); if (nextUid) onNavigateTo?.(nextUid); }
      else if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom + ZOOM_STEP); }
      else if (e.key === '-') { e.preventDefault(); setZoom(zoom - ZOOM_STEP); }
      else if (e.key === '0') { e.preventDefault(); setZoom(1); }
      return;
    }
    const key = e.key;
    if (key === 'r' || key === 'R') { e.preventDefault(); if (e.shiftKey) handleReplyAll(); else handleReply(); }
    else if (key === 'f') { e.preventDefault(); handleForward(); }
    else if (key === 'Delete') { e.preventDefault(); requestDelete(); }
    else if (key === 's') { e.preventDefault(); flagMutation.mutate(!(msg.isFlagged)); }
    else if (key === 'u') { e.preventDefault(); if (!readMutation.isPending) readMutation.mutate(false); }
    else if (key === 'Escape' && (sheetPreview || headersModal || confirmDelete || contactOpen || moveOpen)) {
      // Lapisan di atas reader ditutup dulu (pratinjau spreadsheet dulu tidak
      // ikut dicek → Esc menutup reader di balik pratinjau).
      e.preventDefault();
      if (sheetPreview) setSheetPreview(null);
      else if (headersModal) setHeadersModal(null);
      else if (confirmDelete) setConfirmDelete(false);
      else if (contactOpen) setContactOpen(false);
      else setMoveOpen(false);
    }
    else if (e.key === 'Escape') { e.preventDefault(); if (lightbox) setLightbox(null); else if (docPreview) setDocPreview(null); else if (packPreview) setPackPreview(null); else onClose(); }
  };

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

  // Buka preview lightbox utk gambar/PDF; spreadsheet/teks → in-app preview;
  // file lain → unduh di tab baru.
  function openPreview(att) {
    const url = toSafeUrl(att.viewURL || att.downloadURL, { base: SOGO_BASE, allowExternal: false });
    if (!url) return;
    const kind = getFileKind(att.name, att.contentType);
    if (kind === 'image' || kind === 'pdf') {
      // PDF & gambar → lightbox (PDF dirender iframe + toolbar Unduh/Tab baru).
      setLightbox({ name: att.name, url, kind });
      return;
    }
    if (kind === 'document' && fileExtension(att.name) === 'docx') {
      openDocPreview(att, url);
      return;
    }
    if (kind === 'presentation' && fileExtension(att.name) === 'pptx') {
      openPackPreview(att, url, 'pptx');
      return;
    }
    if (kind === 'archive' && fileExtension(att.name) === 'zip') {
      openPackPreview(att, url, 'zip');
      return;
    }
    if (kind === 'spreadsheet' || kind === 'code' || (kind === 'document' && ['txt', 'md', 'csv'].includes(fileExtension(att.name)))) {
      openSheetPreview(att, url, kind);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // ── Preview spreadsheet/teks in-app ─────────────────────────────────────
  // Spreadsheet di-parse via SheetJS (dynamic import — chunk terpisah, cuma
  // ke-load saat preview dibuka). Text-like file dibaca sbg teks (dibatasi).
  async function openSheetPreview(att, url, kind) {
    setSheetTab(0);
    setSheetPreview({ name: att.name, kind, url, loading: true });
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (kind === 'spreadsheet') {
        const XLSX = await import('xlsx');
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', dense: true });
        const sheets = wb.SheetNames.slice(0, 12).map((nm) => {
          const ws = wb.Sheets[nm];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false });
          const clean = rows.slice(0, 200).map((r) => (Array.isArray(r) ? r.map((v) => (v == null ? '' : String(v))) : []));
          return { name: nm, rows: clean };
        });
        setSheetPreview({ name: att.name, kind, url, sheets });
      } else {
        const text = await res.text();
        setSheetPreview({ name: att.name, kind, url, text: text.slice(0, 60000) });
      }
    } catch (err) {
      setSheetPreview({ name: att.name, kind, url, error: err?.message || 'Gagal memuat pratinjau.' });
    }
  }

  // ── Pratinjau dokumen Word (.docx) in-app ──────────────────────────────
  // Konversi via mammoth (dynamic import → chunk terpisah, cuma ke-load saat
  // pratinjau dibuka) + sanitasi ketat di docPreview.js sebelum render.
  async function openDocPreview(att, url) {
    setDocPreview({ name: att.name, url, loading: true });
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { html } = await convertDocxToHtml(await res.arrayBuffer());
      setDocPreview({ name: att.name, url, html });
    } catch (err) {
      setDocPreview({ name: att.name, url, error: err?.message || 'Gagal memuat pratinjau dokumen.' });
    }
  }

  // ── Pratinjau paket: PowerPoint (.pptx) & arsip (.zip) in-app ──────────
  // Parse via JSZip (dynamic import → chunk terpisah). Output berupa TEKS
  // polos → dirender React (bukan dangerouslySetInnerHTML → tanpa XSS jalur).
  async function openPackPreview(att, url, type) {
    setPackPreview({ name: att.name, url, type, loading: true });
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (type === 'pptx') {
        const { slides, slideCount } = await parsePptx(buf);
        setPackPreview({ name: att.name, url, type, slides, slideCount });
      } else {
        const { entries, totalCount, truncated } = await listZip(buf);
        setPackPreview({ name: att.name, url, type, entries, totalCount, truncated });
      }
    } catch (err) {
      setPackPreview({ name: att.name, url, type, error: err?.message || 'Gagal memuat pratinjau.' });
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
      {/* Toolbar — satu bar ritme .pane-header (h-12 px-4); ikon 44px di
          sentuh, 32px kompak di desktop; tooltip memuat shortcut. */}
      <div className="min-h-12 px-2 py-1 sm:px-4 border-b border-border flex items-center justify-between sticky top-0 bg-background z-10 flex-wrap gap-2">
        <div className="flex items-center gap-0.5 min-w-0">
          <button onClick={onClose} className={`${TB_BTN} md:hidden text-muted-foreground hover:text-foreground hover:bg-muted`} title="Kembali (Esc)" aria-label="Kembali">
            <ArrowLeft size={16} />
          </button>
          {/* Navigasi pesan sebelumnya/berikutnya + posisi */}
          {navTotal > 0 && navIdx >= 0 && (
            <div className="flex items-center gap-0.5 mr-1 pr-1 border-r border-border">
              <button
                onClick={() => prevUid && onNavigateTo?.(prevUid)}
                disabled={!prevUid}
                className={`${TB_BTN} text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent`}
                title="Pesan sebelumnya (Ctrl+,)"
                aria-label="Pesan sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap px-0.5" aria-live="polite">
                {navIdx + 1} dari {navTotal.toLocaleString('id')}
                {siblingTotal > navTotal && (
                  <span className="hidden sm:inline" title={`${siblingTotal.toLocaleString('id')} email di folder; ${navTotal.toLocaleString('id')} sudah dimuat`}> (total {siblingTotal.toLocaleString('id')})</span>
                )}
              </span>
              <button
                onClick={() => nextUid && onNavigateTo?.(nextUid)}
                disabled={!nextUid}
                className={`${TB_BTN} text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent`}
                title="Pesan berikutnya (Ctrl+.)"
                aria-label="Pesan berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <button
            onClick={() => { if (!readMutation.isPending) readMutation.mutate(!isRead); }}
            disabled={readMutation.isPending}
            className={`${TB_BTN} ${isRead ? 'text-muted-foreground hover:text-foreground hover:bg-muted' : 'text-primary bg-primary/10 hover:bg-primary/15'}`}
            title={isRead ? 'Tandai belum dibaca (U)' : 'Tandai sudah dibaca'}
            aria-label="Tandai belum dibaca"
            aria-pressed={!isRead}
          >
            {isRead ? <Mail size={16} /> : <MailOpen size={16} />}
          </button>
          <button
            onClick={() => flagMutation.mutate(!(msg.isFlagged))}
            className={`${TB_BTN} transition-colors ${
              msg.isFlagged ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title={msg.isFlagged ? 'Hapus bintang (S)' : 'Beri bintang (S)'}
            aria-label="Tandai berbintang"
            aria-pressed={!!msg.isFlagged}
          >
            <Star size={16} className={msg.isFlagged ? 'fill-amber-600 dark:fill-amber-400' : ''} />
          </button>
          <button
            onClick={requestDelete}
            disabled={deleteMutation.isPending}
            className={`${TB_BTN} text-muted-foreground hover:text-destructive hover:bg-destructive/10`}
            title={folder === 'folderTrash' ? 'Hapus permanen (Del)' : 'Hapus (Del)'}
            aria-label="Hapus pesan"
          >
            {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          </button>
          {folder !== 'folderJunk' && (
            <button
              onClick={() => spamMutation.mutate()}
              disabled={spamMutation.isPending}
              className={`${TB_BTN} text-muted-foreground hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-500/10`}
              title="Laporkan Spam"
              aria-label="Laporkan spam"
            >
              {spamMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
            </button>
          )}
          {folder === 'folderJunk' && (
            <button
              onClick={() => notSpamMutation.mutate()}
              disabled={notSpamMutation.isPending}
              className={`${TB_BTN} text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10`}
              title="Bukan Spam"
              aria-label="Laporkan bukan spam dan kembalikan ke Kotak Masuk"
            >
              {notSpamMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            </button>
          )}
          {/* Move to folder — click toggle (mobile-friendly) */}
          <div className="relative">
            <button
              onClick={() => setMoveOpen(!moveOpen)}
              className={`${TB_BTN} text-muted-foreground hover:text-foreground hover:bg-muted`}
              title="Pindahkan ke folder"
              aria-label="Pindahkan ke folder lain"
              aria-expanded={moveOpen}
            >
              <FolderOpen size={16} />
            </button>
            {moveOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoveOpen(false)} />
                <div className="absolute top-full left-0 mt-1 bg-popover border border-border shadow-md rounded-lg z-40 min-w-[160px] max-h-72 overflow-y-auto">
                  <div className="p-1.5 space-y-0.5">
                    <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium">Pindahkan ke...</div>
                    {folders.filter((f) => f.id !== folder).map((f) => (
                      <button
                        key={f.id}
                        onClick={() => { moveMutation.mutate(f.id); setMoveOpen(false); }}
                        disabled={moveMutation.isPending}
                        className="w-full text-left px-3 py-2 rounded-md text-[13px] hover:bg-muted transition-colors duration-150 disabled:opacity-50"
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
            className={`${TB_BTN} text-muted-foreground hover:text-foreground hover:bg-muted hidden sm:flex`}
            title="Unduh sebagai file .eml"
            aria-label="Unduh sebagai file .eml"
          >
            <FileDown size={16} />
          </button>
          <button onClick={handlePrint} className={`${TB_BTN} text-muted-foreground hover:text-foreground hover:bg-muted`} title="Cetak" aria-label="Cetak">
            <Printer size={16} />
          </button>
          {(contactPerson?.email || contactPerson?.name) && (
            <button
              onClick={() => { setContactError(''); setContactOpen(true); }}
              className={`${TB_BTN} text-muted-foreground hover:text-primary hover:bg-muted hidden sm:flex`}
              title="Tambah ke kontak"
              aria-label="Tambah pengirim ke kontak"
            >
              <UserPlus size={16} />
            </button>
          )}
        </div>

        {/* Balas / Balas Semua / Teruskan — Balas = aksi primer solid;
            Balas Semua & Teruskan tombol ghost tenang (heuristik replyAllLikely
            tetap dihitung utk konteks, tanpa menukar penekanan visual). */}
        <div className="flex items-center gap-1">
          <button
            data-shortcut="reply"
            onClick={handleReply}
            disabled={!!composeBusy}
            data-reply-all-likely={replyAllLikely || undefined}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 min-h-11 md:min-h-8 rounded-md text-sm font-medium disabled:opacity-60 transition-colors duration-150 ease-out bg-primary text-primary-foreground hover:bg-primary/90"
            title="Balas (R)"
            aria-label="Balas"
          >
            {composeBusy === 'reply' ? <Loader2 size={16} className="animate-spin" /> : <Reply size={16} />}
            <span className="hidden lg:inline">Balas</span>
          </button>
          <button
            data-shortcut="reply-all"
            onClick={handleReplyAll}
            disabled={!!composeBusy}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 min-h-11 md:min-h-8 rounded-md text-sm font-medium disabled:opacity-60 transition-colors duration-150 ease-out text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Balas Semua (Shift+R)"
            aria-label="Balas semua"
          >
            {composeBusy === 'replyAll' ? <Loader2 size={16} className="animate-spin" /> : <ReplyAll size={16} />}
            <span className="hidden lg:inline">Balas Semua</span>
          </button>
          <button
            data-shortcut="forward"
            onClick={handleForward}
            disabled={!!composeBusy}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 min-h-11 md:min-h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted text-sm font-medium disabled:opacity-60 transition-colors duration-150 ease-out"
            title={attachments.length > 0 ? 'Teruskan dengan lampiran (F)' : 'Teruskan (F)'}
            aria-label="Teruskan"
          >
            {composeBusy === 'forward' ? <Loader2 size={16} className="animate-spin" /> : <Forward size={16} />}
            <span className="hidden lg:inline">Teruskan</span>
            {composeBusy === 'forward' && composeProgress && (
              <span className="text-[11px] tabular-nums">{composeProgress}</span>
            )}
          </button>
        </div>
      </div>

      {/* Phishing warning banner */}
      {/* Peringatan keamanan — RINGKAS satu baris (dulu daftar 5 temuan +
          "+N lainnya" memakan ±1/3 panel baca). Detail dibuka sesuai kebutuhan;
          bisa disembunyikan utk pesan ini. Warna mengikuti tingkat risiko. */}
      {phishingResult && phishingResult.level !== 'safe' && !phishingHidden && (() => {
        const risk = RISK_LEVELS[phishingResult.level];
        const findings = [...new Set(phishingResult.findings)];
        const title = phishingResult.level === 'high' ? 'Peringatan keamanan'
          : phishingResult.level === 'medium' ? 'Indikasi phishing' : 'Perlu waspada';
        return (
          <div role="status" className={`mx-4 mt-3 rounded-lg border ${risk.border} ${risk.bg}`}>
            <div className="flex items-center gap-2 px-3 min-h-9 py-1.5">
              <AlertTriangle size={15} className={`${risk.color} shrink-0`} aria-hidden="true" />
              <p className="flex-1 min-w-0 text-[13px] truncate">
                <span className={`font-semibold ${risk.color}`}>{title}</span>
                <span className="text-muted-foreground"> · {findings.length} temuan{findings[0] ? ` · ${findings[0]}` : ''}</span>
              </p>
              <button type="button" onClick={() => setPhishingOpen((v) => !v)} aria-expanded={phishingOpen}
                className="shrink-0 h-8 px-2 rounded-md text-[12px] font-medium text-foreground/80 hover:bg-background/60">
                {phishingOpen ? 'Tutup' : 'Detail'}
              </button>
              <button type="button" onClick={() => setPhishingHidden(true)} aria-label="Sembunyikan peringatan untuk pesan ini"
                title="Sembunyikan untuk pesan ini"
                className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-background/60">
                <X size={14} />
              </button>
            </div>
            {phishingOpen && (
              <ul className="px-3 pb-2.5 pt-0.5 text-xs text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
                {findings.map((f) => (
                  <li key={f} className="flex gap-1.5"><span className="text-foreground/40">•</span><span className="break-all">{f}</span></li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      {/* Message header — avatar pengirim, tanggal manusiawi, ringkasan
          penerima + "Tampilkan detail" (daftar To/Cc/Balas-ke lengkap). */}
      <div className="px-4 sm:px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold tracking-tight text-foreground mb-3 leading-tight break-words">{subject}</h1>
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-full ${avatarColor(sender.email || sender.name)} text-white flex items-center justify-center text-sm font-semibold shrink-0 select-none`}
            aria-hidden="true"
          >
            {getInitials(sender.name ? `${sender.name} <${sender.email}>` : sender.email)}
          </div>
          <div className="flex-1 min-w-0 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-foreground truncate block" title={from}>{sender.name || sender.email || '(tanpa pengirim)'}</span>
                {sender.name && sender.email && (
                  <span className="text-xs text-muted-foreground truncate block">{sender.email}</span>
                )}
              </div>
              <time className="text-muted-foreground text-xs shrink-0 text-right whitespace-nowrap" title={date}>{longDate}</time>
            </div>
            {/* Ringkasan penerima ala Outlook: NAMA saja (kutip dibuang),
                boleh membungkus sampai 2 baris; daftar panjang dipangkas
                "+N lainnya" — daftar LENGKAP ada di panel detail. */}
            <div className="mt-1 flex items-start gap-1.5 text-[13px] text-muted-foreground min-w-0">
              <span className="min-w-0 line-clamp-2 break-words" title={`Kepada: ${to || '—'}${cc ? ` · Cc: ${cc}` : ''}`}>
                Kepada: {formatRecipientSummary(toList, { max: 5, moreSuffix: ' lainnya' }) || '—'}
                {ccList.length > 0 && <> · Cc: {formatRecipientSummary(ccList, { max: 3, moreSuffix: ' lainnya' })}</>}
              </span>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="shrink-0 inline-flex items-center gap-0.5 text-primary hover:underline"
                aria-expanded={showDetails}
              >
                {showDetails ? 'Sembunyikan detail' : 'Tampilkan detail'}
                {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
            {showDetails && (
              <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                  <dt className="text-muted-foreground text-right pt-1">Dari</dt>
                  <dd className="text-foreground min-w-0"><RecipientChips list={fromList} /></dd>
                  <dt className="text-muted-foreground text-right pt-1">Kepada</dt>
                  <dd className="text-foreground min-w-0"><RecipientChips list={toList} /></dd>
                  {ccList.length > 0 && (
                    <>
                      <dt className="text-muted-foreground text-right pt-1">Cc</dt>
                      <dd className="text-foreground min-w-0"><RecipientChips list={ccList} /></dd>
                    </>
                  )}
                  {replyToList.length > 0 && (
                    <>
                      <dt className="text-muted-foreground text-right pt-1">Balas ke</dt>
                      <dd className="text-foreground min-w-0"><RecipientChips list={replyToList} /></dd>
                    </>
                  )}
                  <dt className="text-muted-foreground text-right">Tanggal</dt>
                  <dd className="text-foreground">{longDate}{date && longDate !== date ? <span className="text-muted-foreground"> · {date}</span> : null}</dd>
                  <dt className="text-muted-foreground text-right">Sumber</dt>
                  <dd>
                    <button type="button" onClick={openHeaders} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Code2 size={12} /> Tampilkan header
                    </button>
                  </dd>
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 min-h-0">
        {/* Kontrol zoom body (Ctrl/Cmd + / − / 0) */}
        <div className="flex items-center justify-end gap-0.5 -mt-2 mb-2 text-muted-foreground">
          <button type="button" onClick={() => setZoom(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} className="min-w-8 min-h-8 flex items-center justify-center rounded-md hover:bg-muted hover:text-foreground disabled:opacity-30" title="Perkecil teks (Ctrl+−)" aria-label="Perkecil teks">
            <ZoomOut size={14} />
          </button>
          {/* Zoom tersimpan global (per perangkat) — saat ≠100% chip disorot
              supaya user sadar email baru ikut diperbesar; klik = reset 100%. */}
          <button
            type="button"
            onClick={() => setZoom(1)}
            data-zoom-active={zoom !== 1 || undefined}
            className={`text-[11px] tabular-nums px-1.5 min-h-8 rounded-md transition-colors ${
              zoom !== 1
                ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/15'
                : 'hover:bg-muted hover:text-foreground'
            }`}
            title={zoom !== 1 ? `Zoom ${Math.round(zoom * 100)}% — klik untuk kembali ke 100% (Ctrl+0)` : 'Ukuran normal (Ctrl+0)'}
            aria-label={zoom !== 1 ? `Zoom ${Math.round(zoom * 100)} persen, klik untuk kembali ke 100 persen` : 'Ukuran teks normal'}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => setZoom(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} className="min-w-8 min-h-8 flex items-center justify-center rounded-md hover:bg-muted hover:text-foreground disabled:opacity-30" title="Perbesar teks (Ctrl++)" aria-label="Perbesar teks">
            <ZoomIn size={14} />
          </button>
        </div>
        <div className="email-body" style={zoom !== 1 ? { zoom } : undefined}>
          {!hasQuote && <div dangerouslySetInnerHTML={{ __html: renderHtml }} />}
          {hasQuote && (
            <>
              <div dangerouslySetInnerHTML={{ __html: quoted.main }} />
              <button
                type="button"
                onClick={() => setQuoteOpen((v) => !v)}
                className="my-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:text-foreground text-xs font-medium"
                aria-expanded={quoteOpen}
                title={quoteOpen ? 'Sembunyikan kutipan' : 'Tampilkan kutipan'}
              >
                <span className="tracking-widest leading-none">…</span>
                {quoteOpen ? 'Sembunyikan kutipan' : 'Tampilkan kutipan'}
              </button>
              {/* Kutipan: HTML disanitasi ULANG pasca-split (lihat komentar
                  keamanan di atas pada useMemo quoted) —
                  hanya disembunyikan via atribut hidden, bukan dirender ulang. */}
              <div data-quote hidden={!quoteOpen} dangerouslySetInnerHTML={{ __html: quoted.quote }} />
            </>
          )}
        </div>

        {/* Inline images (CID) TIDAK dirender di sini: sudah tampil di body
            via resolver cid: (prepareHtmlContent) dan flag
            shouldDisplayAttachment=0 membuat mereka tidak masuk daftar
            Lampiran (regresi "gambar footer jadi lampiran"). */}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
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
                      className="group relative rounded-lg overflow-hidden border border-border bg-card hover:border-primary/40 transition-colors duration-150"
                      title="Pratinjau gambar"
                    >
                      <img src={attUrl} alt={att.name} className="w-full h-36 object-cover" loading="lazy" />
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                        <div className="text-white text-[13px] font-medium truncate">{att.name}</div>
                        <div className="text-white/80 text-[11px] whitespace-nowrap">{formatFileSize(att.size)}</div>
                      </div>
                      <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye size={14} className="text-white" />
                      </div>
                    </a>
                  );
                }

                // Non-image attachments: klik kartu = pratinjau in-app
                // (PDF lightbox; spreadsheet/teks parser tabel), tombol
                // Unduh terpisah (blob download, nama file terjaga).
                const previewable = isPdf || kind === 'spreadsheet' || kind === 'code'
                  || (kind === 'document' && ['txt', 'md', 'csv'].includes(fileExtension(att.name)));
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted transition-colors duration-150 group"
                  >
                    <a
                      href={attUrl || undefined}
                      onClick={(e) => { e.preventDefault(); openPreview(att); }}
                      className="flex items-center gap-3 flex-1 min-w-0"
                      title={previewable ? 'Pratinjau' : 'Buka di tab baru'}
                    >
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                        <FileText size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-foreground truncate">{att.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate whitespace-nowrap">{formatFileSize(att.size) || att.contentType || ''}</div>
                      </div>
                      {previewable && <Eye size={16} className="text-muted-foreground group-hover:text-primary shrink-0" />}
                    </a>
                    <button
                      onClick={() => { setDownloadingIdx(idx); downloadFileBlob(attUrl, att.name).catch(() => toast.error('Gagal mengunduh lampiran.')).finally(() => setDownloadingIdx(null)); }}
                      className={`p-2 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary shrink-0 transition-all duration-150 focus-visible:opacity-100 ${downloadingIdx === idx ? '' : 'sm:opacity-0 sm:group-hover:opacity-100'}`}
                      title="Unduh lampiran"
                      aria-label={`Unduh ${att.name}`}
                      disabled={downloadingIdx === idx}
                    >
                      {downloadingIdx === idx ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    </button>
                  </div>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                >
                  <Download size={14} /> Unduh
                </button>
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                >
                  <ExternalLink size={14} /> Tab baru
                </a>
                <button
                  onClick={() => setLightbox(null)}
                  className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                  aria-label="Tutup pratinjau"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-black/40 border border-white/10">
              {lightbox.kind === 'image' ? (
                <img src={lightbox.url} alt={lightbox.name} className="w-full h-[80vh] object-contain" />
              ) : (
                /* PDF: iframe viewer bawaan browser — render cepat, zoom/scroll native. */
                <iframe src={lightbox.url} title={lightbox.name} className="w-full h-[80vh] bg-white" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Preview spreadsheet/teks (in-app) ─────────────────────────────── */}
      {sheetPreview && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4"
          onClick={() => setSheetPreview(null)}
        >
          <div
            className="flex flex-col w-full max-w-6xl max-h-[85vh] bg-card rounded-xl overflow-hidden border border-border shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <FileText size={16} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{sheetPreview.name}</div>
                <div className="text-xs text-muted-foreground">
                  Pratinjau {sheetPreview.kind === 'spreadsheet' ? 'spreadsheet' : 'teks'} — maks 200 baris & 12 sheet
                </div>
              </div>
              <button
                onClick={() => downloadFileBlob(sheetPreview.url, sheetPreview.name).catch(() => {})}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
              >
                <Download size={14} /> Unduh
              </button>
              <button
                onClick={() => setSheetPreview(null)}
                className="p-2 rounded-md hover:bg-muted text-muted-foreground"
                aria-label="Tutup pratinjau"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {sheetPreview.loading && (
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" /> Memuat pratinjau…
                </div>
              )}
              {sheetPreview.error && (
                <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                  <TriangleAlert size={22} className="text-amber-500" /> {sheetPreview.error}
                </div>
              )}
              {!sheetPreview.loading && !sheetPreview.error && sheetPreview.sheets && (
                <div>
                  {sheetPreview.sheets.length > 1 && (
                    <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-border overflow-x-auto">
                      {sheetPreview.sheets.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setSheetTab(i)}
                          className={`px-3 py-1.5 text-xs rounded-t-lg whitespace-nowrap transition-colors ${i === sheetTab ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'}`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {sheetPreview.sheets[sheetTab] && (
                    sheetPreview.sheets[sheetTab].rows.length === 0 ? (
                      <div className="py-16 text-center text-sm text-muted-foreground">Sheet kosong.</div>
                    ) : (
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          {sheetPreview.sheets[sheetTab].rows.map((row, r) => (
                            <tr key={r} className={r === 0 ? 'bg-muted/60 font-medium' : r % 2 ? 'bg-muted/20' : ''}>
                              {row.map((cell, c) => (
                                <td key={c} className="px-3 py-1.5 border-b border-border/60 whitespace-nowrap max-w-[320px] overflow-hidden text-ellipsis text-foreground">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}
                </div>
              )}
              {!sheetPreview.loading && !sheetPreview.error && sheetPreview.text !== undefined && (
                <pre className="p-4 text-xs whitespace-pre-wrap break-words font-mono text-foreground">{sheetPreview.text}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Pratinjau dokumen Word (.docx) in-app ─────────────────────────── */}
      {docPreview && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4"
          onClick={() => setDocPreview(null)}
        >
          <div
            className="flex flex-col w-full max-w-4xl max-h-[85vh] bg-card rounded-xl overflow-hidden border border-border shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <FileText size={16} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{docPreview.name}</div>
                <div className="text-xs text-muted-foreground">Pratinjau dokumen Word — tampilan ringkas (format & gambar asli bisa berbeda)</div>
              </div>
              <button
                onClick={() => downloadFileBlob(docPreview.url, docPreview.name).catch(() => {})}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
              >
                <Download size={14} /> Unduh
              </button>
              <button
                onClick={() => setDocPreview(null)}
                className="p-2 rounded-md hover:bg-muted text-muted-foreground"
                aria-label="Tutup pratinjau"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
              {docPreview.loading && (
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" /> Memuat pratinjau dokumen…
                </div>
              )}
              {docPreview.error && (
                <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                  <TriangleAlert size={22} className="text-amber-500" /> {docPreview.error}
                </div>
              )}
              {!docPreview.loading && !docPreview.error && docPreview.html !== undefined && (
                docPreview.html.trim()
                  ? <div className="docx-preview max-w-none text-sm [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:font-semibold [&_th]:bg-muted/60 [&_img]:max-w-full [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_td_p]:my-0.5 [&_th_p]:my-0 [&_li_p]:my-0 [&_td]:align-top [&_sup]:text-[0.7em]" dangerouslySetInnerHTML={{ __html: docPreview.html }} />
                  : <div className="py-16 text-center text-sm text-muted-foreground">Dokumen kosong / tidak berisi teks yang bisa dipratinjau.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Pratinjau paket: PowerPoint (.pptx) & arsip (.zip) in-app ─────── */}
      {packPreview && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4"
          onClick={() => setPackPreview(null)}
        >
          <div
            className="flex flex-col w-full max-w-4xl max-h-[85vh] bg-card rounded-xl overflow-hidden border border-border shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              {packPreview.type === 'pptx' ? (
                <Table2 size={16} className="text-primary shrink-0" />
              ) : (
                <Folder size={16} className="text-primary shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{packPreview.name}</div>
                <div className="text-xs text-muted-foreground">
                  {packPreview.type === 'pptx'
                    ? `Pratinjau PowerPoint — outline ${packPreview.slides?.length ?? 0} dari ${packPreview.slideCount ?? 0} slide`
                    : `Pratinjau arsip — ${packPreview.totalCount ?? 0} entri`}
                </div>
              </div>
              <button
                onClick={() => downloadFileBlob(packPreview.url, packPreview.name).catch(() => {})}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
              >
                <Download size={14} /> Unduh
              </button>
              <button
                onClick={() => setPackPreview(null)}
                className="p-2 rounded-md hover:bg-muted text-muted-foreground"
                aria-label="Tutup pratinjau"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {packPreview.loading && (
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" /> Memuat pratinjau…
                </div>
              )}
              {packPreview.error && (
                <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                  <TriangleAlert size={22} className="text-amber-500" /> {packPreview.error}
                </div>
              )}
              {/* PPTX: outline slide (judul + bullet) */}
              {!packPreview.loading && !packPreview.error && packPreview.slides && (
                packPreview.slides.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">Tidak ada slide berisi teks.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {packPreview.slides.map((s) => (
                      <div key={s.number} className="px-5 py-4">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold text-muted-foreground bg-muted rounded-md px-1.5 py-0.5">{s.number}</span>
                          <div className="text-sm font-semibold text-foreground">{s.title || '(tanpa judul)'}</div>
                        </div>
                        {s.bullets.length > 0 && (
                          <ul className="mt-2 ml-8 list-disc marker:text-muted-foreground/60 space-y-1">
                            {s.bullets.map((b, bi) => (
                              <li key={bi} className="text-sm text-foreground/90">{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
              {/* ZIP: daftar entri central directory (tanpa ekstraksi) */}
              {!packPreview.loading && !packPreview.error && packPreview.entries && (
                packPreview.entries.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">Arsip kosong.</div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/60 text-left">
                        <th className="px-4 py-2 font-semibold text-foreground">Nama</th>
                        <th className="px-3 py-2 font-semibold text-foreground w-24">Ukuran</th>
                        <th className="px-3 py-2 font-semibold text-foreground w-28">Tanggal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packPreview.entries.map((en, i) => (
                        <tr key={i} className={i % 2 ? 'bg-muted/20' : ''}>
                          <td className="px-4 py-1.5 border-b border-border/60 text-foreground">
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                              {!en.dir && <FileText size={12} className="text-muted-foreground shrink-0" />}
                              <span className="truncate">{en.name}</span>
                            </span>
                          </td>
                          <td className="px-3 py-1.5 border-b border-border/60 text-muted-foreground whitespace-nowrap">{en.dir ? '—' : (en.size || '—')}</td>
                          <td className="px-3 py-1.5 border-b border-border/60 text-muted-foreground whitespace-nowrap">{en.date || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
              {!packPreview.loading && packPreview.truncated && (
                <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
                  Menampilkan 500 entri pertama dari {packPreview.totalCount}.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Konfirmasi hapus permanen (folder Sampah) ─────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)} role="dialog" aria-modal="true" aria-label="Konfirmasi hapus permanen">
          <div className="bg-card w-full max-w-sm rounded-xl shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <Trash2 size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">Hapus permanen?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Pesan ini akan dihapus dari Sampah dan tidak bisa dikembalikan.</p>
                <p className="mt-2 text-xs text-foreground/80 truncate" title={subject}>{subject}</p>
              </div>
            </div>
            <div className="px-5 pb-4 flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 bg-muted hover:bg-muted/80 text-foreground py-2 rounded-md text-sm font-medium" autoFocus>
                Batal
              </button>
              <button
                type="button"
                onClick={() => { setConfirmDelete(false); deleteMutation.mutate(); }}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Hapus permanen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header mentah (viewsource) ─────────────────────────────────────── */}
      {headersModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4" onClick={() => setHeadersModal(null)} role="dialog" aria-modal="true" aria-label="Header pesan">
          <div className="flex flex-col w-full max-w-3xl max-h-[85vh] bg-card rounded-xl overflow-hidden border border-border shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Code2 size={16} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">Header pesan</div>
                <div className="text-xs text-muted-foreground">Sumber mentah RFC 5322 — Message-ID, jalur Received, autentikasi (SPF/DKIM)</div>
              </div>
              {headersModal.raw && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(headersModal.raw).then(() => toast.success('Header disalin')).catch(() => toast.error('Gagal menyalin header.'))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
                >
                  <Copy size={14} /> Salin
                </button>
              )}
              <button onClick={() => setHeadersModal(null)} className="p-2 rounded-md hover:bg-muted text-muted-foreground" aria-label="Tutup header">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {headersModal.loading && (
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" /> Memuat header…
                </div>
              )}
              {headersModal.error && (
                <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                  <TriangleAlert size={22} className="text-amber-500" /> {headersModal.error}
                </div>
              )}
              {headersModal.raw !== undefined && !headersModal.loading && (
                <pre className="p-4 text-xs whitespace-pre-wrap break-words font-mono text-foreground">{headersModal.raw || '(header kosong)'}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tambah ke kontak modal ─────────────────────────────────────────── */}
      {contactOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setContactOpen(false)} role="dialog" aria-modal="true" aria-label="Tambah ke kontak">
          <div
            className="bg-card w-full max-w-md rounded-xl shadow-lg overflow-hidden"
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
                <label htmlFor="contact-name" className="text-sm font-medium text-foreground">Nama Lengkap</label>
                <input
                  ref={contactNameRef}
                  id="contact-name"
                  defaultValue={contactPerson?.name || contactPerson?.email || ''}
                  placeholder="John Doe"
                  className="bg-muted border-none rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="contact-email" className="text-sm font-medium text-foreground">Email</label>
                <input
                  ref={contactEmailRef}
                  id="contact-email"
                  defaultValue={contactPerson?.email || ''}
                  type="email"
                  required
                  placeholder="email@domain.com"
                  className="bg-muted border-none rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">No. Telepon</label>
                <input
                  ref={contactPhoneRef}
                  placeholder="+62..."
                  className="bg-muted border-none rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setContactOpen(false)}
                  className="flex-1 bg-muted hover:bg-muted/80 text-foreground py-2 rounded-md text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={contactSaving}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2"
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
