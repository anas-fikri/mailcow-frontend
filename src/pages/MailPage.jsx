import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Inbox, Send, Trash2, FileText, Loader2, Edit3, Mail, Menu, X,
  AlertCircle, Search, Trash, CheckSquare, Square, MailOpen, RefreshCw,
  Folder, FolderPlus, Star, Undo2, Filter, ArrowUpDown, MessagesSquare, AlertTriangle, ChevronDown, ChevronRight,
  Archive, BellRing, CheckCheck, Clock, Paperclip, CalendarClock, Reply, ShieldCheck,
  ReplyAll, Forward, FolderInput, ArrowLeft, Flag, StarOff, MoreHorizontal,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { PURIFY_CONFIG } from '../lib/pasteUtils';
import { useAuthStore } from '../store/authStore';
import { fetchFolders, fetchMessages, fetchMessageHeaders, fetchMessage, fetchAttachmentData, searchMessages, getUnseenCount, deleteMessages, moveMessages, markRead, markReadBulk, markFlaggedBulk, markMessagesAsJunk, markMessagesAsNotJunk, createFolder, deleteFolder, fetchPreferences, getPendingSends, undoScheduledSend, ensureServerMarkReadDisabled, isServerMarkReadDisabled } from '../lib/api';
import { formatAddresses, parseAddressList, formatRecipientSummary } from '../lib/format';
import { extractHtml, extractAttachments } from '../lib/messageHtml';
import { analyzePhishing, RISK_LEVELS } from '../lib/phishingDetection';
import { parseSizeToBytes } from '../lib/attachments';
import MessageReader from '../components/mailer/MessageReader';
import ComposeModal from '../components/mailer/ComposeModal';
import QuickRuleModal from '../components/mailer/QuickRuleModal';
import { MessageListSkeleton, FoldersListSkeleton } from '../components/Skeleton';
import { toast, useToastStore } from '../lib/toast';
import { DEFAULT_FOLDERS, STALE_TIMES, isSentOrDraftFolder } from '../lib/constants';
import { isProtectedFolder } from '../lib/mailboxTree';
import { watchDomainVersion } from '../lib/crossTab';
import KeyboardShortcutsModal from '../components/KeyboardShortcuts';
import SwipeableRow from '../components/SwipeableRow';
import ContextMenu from '../components/mailer/ContextMenu';
import MoveToPicker from '../components/mailer/MoveToPicker';
import { resolveRowClick, resolveTargetUids, nextFocusIndex, toggleSelectAllUids, nextAfterRemoval, removeUids } from '../lib/mailSelection';
import { resolveMailShortcut, MAIL_ACTIONS } from '../lib/keymap';
import { buildReplyDataAsync } from '../lib/replyBuilder';
import Avatar from '../components/Avatar';
import { FLAG_COLORS, FLAG_COLOR_KEYS, getFlagColor, setFlagColor, removeFlagColorsBulk } from '../lib/flagColors';
// Flag-color store adalah FOLDER-SCOPED (schema v3): uid SOGo berlaku
// per-folder, jadi warna harus dibaca/ditulis dgn konteks folder aktif.
// NOTE: helper DI-DEKLARASIKAN DI DALAM komponen (setelah user/selectedFolder
// ada) — di module scope ia mereferensikan user/selectedFolder yang tidak
// terdefinisi → ReferenceError saat chunk dimuat (outage 2026-09-05, ketahuan
// oleh e2e-flagcolor saat halaman mail error boundary).
import { getRuleSummary, executeRules, claimAutoArchiveUids, releaseAutoArchiveClaims, autoArchiveClaimsKey } from '../lib/autoArchive';
import { EMAIL_CATEGORIES, CATEGORY_LABELS, CATEGORY_BADGE_CLASS, classifyEmail, countCategories } from '../lib/emailCategory';
import { SNOOZE_PRESETS, loadSnoozes, snoozeMessage, unsnoozeMessage, unsnoozeMessages, pruneExpired } from '../lib/snooze';
import { updateFaviconBadge, __resetFaviconBadge } from '../lib/faviconBadge';
import { loadNotifyPrefs, saveNotifyPrefs } from '../lib/notifyPrefs';
import { groupMessagesByDate, reorderDateGroups, sortMessagesByDate, parseMessageDate, applyMessageWindow } from '../lib/dateGroups';
import { groupConversations, normalizeSubject as normalizeConversationSubject } from '../lib/conversations';
import { searchAllFolders, mergeSearchResults, folderChipLabel, analyzeEmptyList, FILTER_LABELS_ID } from '../lib/mailSearch';
import { buildRowAriaLabel } from '../lib/messageRows';
import { planToolbar } from '../lib/mailToolbar';

// Batas tampilan Kotak Masuk (bulan) — email lebih lama hanya via pencarian.
const MESSAGE_WINDOW_MONTHS = 5;

// Chip hint palet perintah di input pencarian — di macOS tampil ⌘K.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const PALETTE_HINT = IS_MAC ? '⌘K' : 'Ctrl+K';

// Jalankan tasks dengan concurrency terbatas, toleran gagal (allSettled).
// Dipakai utk batch per-uid (mark-all-read, dll) — SOGo tidak punya endpoint
// batch; request massal paralel penuh memicu 429/500/timeout.
async function batchWithLimit(tasks, limit = 5) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]().then(
        (v) => ({ status: 'fulfilled', value: v }),
        (e) => ({ status: 'rejected', reason: e })
      );
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Icon mapping ─────────────────────────────────────────────────────────────
const FOLDER_ICONS = {
  inbox: Inbox, sent: Send, draft: FileText, trash: Trash2, junk: AlertCircle, custom: Folder,
};

function getFolderIcon(type) {
  return FOLDER_ICONS[type] || Folder;
}

// ─── Category tabs (Utama/Promosi/Sosial/Update) ─────────────────────────────
function CategoryTabs({ messages, categoryFilter, onSelect }) {
  const counts = useMemo(() => countCategories(messages), [messages]);
  const tabs = [
    { id: null, label: 'Semua', count: messages.length },
    ...Object.values(EMAIL_CATEGORIES)
      .filter((c) => c !== EMAIL_CATEGORIES.SPAM)
      .map((c) => ({ id: c, label: CATEGORY_LABELS[c], count: counts[c] })),
  ];
  // Overflow tab kategori (list 340px): scrollbar native disembunyikan
  // (QA: scrollbar tebal menimpa label) → overflow ditandai gradien tepi
  // (mask, tidak bergantung warna latar) yang hanya muncul di sisi yang
  // masih bisa di-scroll.
  const scrollerRef = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  useEffect(() => {
    updateEdges();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateEdges, tabs.length, messages.length]);
  const fade = '1.25rem';
  const maskImage = edges.start || edges.end
    ? `linear-gradient(to right, ${edges.start ? 'transparent' : '#000'}, #000 ${fade}, #000 calc(100% - ${fade}), ${edges.end ? 'transparent' : '#000'})`
    : undefined;
  return (
    <div
      ref={scrollerRef}
      onScroll={updateEdges}
      data-category-tabs=""
      data-overflow-start={edges.start || undefined}
      data-overflow-end={edges.end || undefined}
      style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
      className="flex items-center gap-1 overflow-x-auto scrollbar-none snap-x snap-proximity scroll-px-1 pb-0.5 -mx-1 px-1"
    >
      {tabs.map((t) => {
        const active = categoryFilter === t.id;
        return (
          <button
            key={t.id || 'all'}
            type="button"
            onClick={() => onSelect(active ? null : t.id)}
            className={`snap-start shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {t.label}
            <span className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-full ${active ? 'bg-background text-foreground' : 'bg-muted text-muted-foreground'}`}>
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Resize hook ──────────────────────────────────────────────────────────────
// Pointer events (mouse + sentuh) dan keyboard (lihat ResizeHandle). axis 'x'
// = lebar (drag horizontal), 'y' = tinggi (reading pane di bawah). Nilai
// dipersist oleh pemanggil (setPref paneWidths, debounce 300ms).
function useResizable(defaultPx, minPx, maxPx, axis = 'x') {
  const [size, setSize] = useState(defaultPx);
  const startPos = useRef(0);
  const startSize = useRef(defaultPx);
  const clamp = useCallback((v) => Math.min(maxPx, Math.max(minPx, Math.round(v))), [minPx, maxPx]);

  const onPointerDown = useCallback((e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    try { target.setPointerCapture?.(pointerId); } catch { /* browser lama */ }
    startPos.current = axis === 'x' ? e.clientX : e.clientY;
    startSize.current = size;
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev) => {
      const delta = (axis === 'x' ? ev.clientX : ev.clientY) - startPos.current;
      setSize(clamp(startSize.current + delta));
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { target.releasePointerCapture?.(pointerId); } catch { /* abaikan */ }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [size, axis, clamp]);

  // Keyboard: ←/→ (atau ↑/↓ utk axis y) geser 16px, Shift = 48px, Home/End = min/max.
  const onKeyDown = useCallback((e) => {
    const dec = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const inc = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    const step = e.shiftKey ? 48 : 16;
    let next = null;
    if (e.key === dec) next = size - step;
    else if (e.key === inc) next = size + step;
    else if (e.key === 'Home') next = minPx;
    else if (e.key === 'End') next = maxPx;
    if (next == null) return;
    e.preventDefault();
    e.stopPropagation(); // pintasan global (j/k/panah) jangan ikut menangkap
    setSize(clamp(next));
  }, [size, axis, minPx, maxPx, clamp]);

  return [size, { onPointerDown, onKeyDown, value: size, min: minPx, max: maxPx, axis }];
}

// Pegangan resize yang bisa diakses keyboard (role=separator + tabIndex) dan
// bekerja di layar sentuh (pointer events, touch-none).
function ResizeHandle({ handle, label }) {
  const { onPointerDown, onKeyDown, value, min, max, axis } = handle;
  const horizontal = axis === 'x';
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={`hidden md:flex shrink-0 items-center justify-center group relative z-10 touch-none hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-none transition-colors ${
        horizontal ? 'w-1.5 h-full cursor-col-resize' : 'h-1.5 w-full cursor-row-resize'
      }`}
    >
      <div className={`rounded-full bg-border group-hover:bg-primary group-focus-visible:bg-primary transition-colors ${horizontal ? 'w-0.5 h-8' : 'h-0.5 w-8'}`} />
    </div>
  );
}

// Suara notifikasi singkat (WebAudio, tanpa aset) — dipanggil hanya bila
// preferensi notifikasi `sound` aktif. Gagal autoplay/AudioContext → diam.
function playNotifyBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => { try { ctx.close(); } catch { /* abaikan */ } };
  } catch { /* autoplay ditolak / browser lama — abaikan */ }
}

// Mode baris "ringkas" ditentukan CSS lewat <html data-density> (AppLayout);
// kelas .density-* di index.css. Di sini hanya kelas yang perlu ikut.
const ROW_PAD_CLS = 'density-row px-4';

// ─── Pull-to-Refresh (mobile) ────────────────────────────────────────────────
const PULL_THRESHOLD = 80;
function PullToRefresh({ onRefresh, children }) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  const onTouchStart = useCallback((e) => {
    const el = e.currentTarget;
    // Hanya aktif saat scroll di atas (scrollTop 0)
    if (el.scrollTop === 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, [refreshing]);

  const onTouchMove = useCallback((e) => {
    if (!pulling.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      // Rubber-band: kurangi resistance makin jauh ditarik
      setPullY(Math.min(PULL_THRESHOLD * 1.5, delta * 0.5));
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullY >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(PULL_THRESHOLD * 0.6);
      Promise.resolve(onRefresh?.()).finally(() => {
        setRefreshing(false);
        setPullY(0);
      });
    } else {
      setPullY(0);
    }
  }, [pullY, refreshing, onRefresh]);

  const showIndicator = pullY > 10 || refreshing;

  return (
    <div
      // flex-1 + min-h-0: filler sisa space pada parent flex-col; min-h-0
      // WAJIB agar inner absolute-inset + overflow-y-auto bisa scroll.
      className="relative flex-1 min-h-0"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      {showIndicator && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center z-20 transition-all"
          style={{ height: `${pullY}px`, opacity: Math.min(1, pullY / PULL_THRESHOLD) }}
        >
          <RefreshCw
            size={18}
            className={`text-primary ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: refreshing ? undefined : `rotate(${pullY * 3}deg)` }}
          />
          <span className="ml-2 text-xs text-muted-foreground">
            {refreshing ? 'Memperbarui…' : pullY >= PULL_THRESHOLD ? 'Lepas untuk memperbarui' : 'Tarik ke bawah'}
          </span>
        </div>
      )}
      {/* Content */}
      <div style={{ transform: showIndicator && !refreshing ? `translateY(${pullY}px)` : undefined }}>
        {children}
      </div>
    </div>
  );
}

// ─── Search Filter Dropdown ───────────────────────────────────────────────────
const SEARCH_CRITERIA = [
  { id: 'all',     label: 'Semua' },
  { id: 'from',    label: 'Dari' },
  { id: 'to',      label: 'Kepada' },
  { id: 'subject', label: 'Subjek' },
  { id: 'body',    label: 'Isi Email' },
];

// ─── Conversation helpers ────────────────────────────────────────────────────
// normalizeSubject / groupConversations dipindah ke src/lib/conversations.js
// (pure + testable).

// ─── Main Component ──────────────────────────────────────────────────────────
export default function MailPage() {
  const {
    user, sortAsc, setSortAsc, conversationView, setConversationView,
    // Preferensi tata letak ala Outlook (per-akun, dipersist oleh setPref)
    readingPane = 'right', paneWidths, collapsedFolders: collapsedFolderIds = [],
    favoriteFolders = [], setPref,
  } = useAuthStore();
  const queryClient = useQueryClient();

  const [selectedFolder, setSelectedFolder] = useState('folderINBOX');

  // Helper flag-color terikat folder aktif — WAJIB di dalam komponen karena
  // user/selectedFolder adalah state komponen (bukan module scope; bug 2026-09-05).
  // NOTE: selectedFolder WAJIB dideklarasikan SEBELUM helper ini — default
  // parameter `folder = selectedFolder` menghasilkan TDZ bila dibalik
  // (ReferenceError: Cannot access 'q' before initialization, outage 2026-09-24).
  const flagColorOf = (uid, folder = selectedFolder) => getFlagColor(user?.email, uid, folder);
  const setFlagColorOf = (uid, color, folder = selectedFolder) => setFlagColor(user?.email, uid, color, folder);
  const [selectedMsgId, setSelectedMsgId] = useState(null);
  const [folderPanelOpen, setFolderPanelOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [pendingSends, setPendingSends] = useState([]);       // kiriman terjadwal/undo dari queue server
  const [pendingOpen, setPendingOpen] = useState(false);       // panel daftar kiriman terjadwal
  const [composeData, setComposeData] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCriteria, setSearchCriteria] = useState('all');
  const [showSearchFilter, setShowSearchFilter] = useState(false);
  const [selectedUids, setSelectedUids] = useState([]);
  const lastSelectedUid = useRef(null); // anchor utk Shift+klik (range select)
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [flagPickerOpen, setFlagPickerOpen] = useState(null); // { msgUid, anchorEl }
  const [flagTick, setFlagTick] = useState(0); // bump setelah warna flag (localStorage) berubah → re-render/filter
  const [flagFilter, setFlagFilter] = useState(null); // color key or null
  const [categoryFilter, setCategoryFilter] = useState(null); // EMAIL_CATEGORIES key or null
  const [unreadOnly, setUnreadOnly] = useState(false); // filter hanya belum dibaca
  const [hasAttachmentOnly, setHasAttachmentOnly] = useState(false); // filter hanya yang berlampiran
  // Pencarian global: folder aktif dulu; hasil 0 → otomatis paralel ke semua
  // folder. searchedAll menandai bahwa hasil berasal dari seluruh folder
  // (badge folder per baris + scope note di empty state).
  const [searchedAll, setSearchedAll] = useState(false);
  const [globalResults, setGlobalResults] = useState(null); // array merged saat pencarian global aktif
  const [fetchingGlobal, setFetchingGlobal] = useState(false);
  const globalSearchTimerRef = useRef(null);
  // Guard anti-loop: tandai query (folder|query|criteria) yang SUDAH di-fan-out;
  // refetch react-query (identitas array baru) tidak boleh memicu fan-out ulang.
  const lastGlobalQueryRef = useRef(null);

  const [snoozePicker, setSnoozePicker] = useState(null); // { uid, x, y } — pilih durasi snooze
  const [quickRuleMsg, setQuickRuleMsg] = useState(null); // pesan sumber utk QuickRuleModal ("Buat aturan dari pesan ini")
  const [snoozeTick, setSnoozeTick] = useState(0); // bump utk re-render setelah prune
  const [claimsTick, setClaimsTick] = useState(0); // bump utk re-run engine saat klaim berubah di tab lain
  const [expandedConversations, setExpandedConversations] = useState(new Set());
  // Folder sidebar yang di-ciutkan — dari preferensi per-akun (dipersist).
  const collapsedFolders = useMemo(() => new Set(collapsedFolderIds), [collapsedFolderIds]);
  const favoriteSet = useMemo(() => new Set(favoriteFolders), [favoriteFolders]);
  const prevUnseenRef = useRef(null); // notifikasi email baru — bandingkan unseen count
  const newMailToastAtRef = useRef(0); // throttle toast email baru (maks 1 per burst)
  const notifGrantedRef = useRef(false); // cegah minta izin berulang
  // Soft-ask notifikasi: banner in-app (bukan prompt browser otomatis — prompt
  // otomatis sering dibuang user & denied permanen). null = belum diputuskan.
  const [notifAsk, setNotifAsk] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false); // mode seleksi (long-press di layar sentuh)
  const [isTouch] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches
  );
  // Prefetch pesan saat hover baris HANYA utk pointer presisi (mouse/trackpad)
  // — di layar sentuh mouseenter sintetis menyertai tap dan hanya memboroskan request.
  const [isFinePointer] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
  );
  // Dialog folder: { mode: 'create', parent } | { mode: 'delete', folder } | null
  const [folderDialog, setFolderDialog] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  // Menu konteks (klik kanan): { kind:'message'|'folder', x, y, uids, folder, msg }
  const [ctxMenu, setCtxMenu] = useState(null);
  // Menu "Lainnya" (⋯) di toolbar header daftar: { x, y } | null.
  const [toolbarMenu, setToolbarMenu] = useState(null);
  const toolbarMenuClosedAt = useRef(0);
  // Lebar konten header daftar (ResizeObserver) → planToolbar memutuskan ikon
  // mana yang muat dalam SATU baris; sisanya masuk menu "Lainnya".
  const [listHeaderW, setListHeaderW] = useState(0);
  const listHeaderObserver = useRef(null);
  const listHeaderRef = useCallback((el) => {
    listHeaderObserver.current?.disconnect();
    listHeaderObserver.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect?.width || 0);
      setListHeaderW((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    listHeaderObserver.current = ro;
  }, []);
  // Popover "Pindahkan ke…": { uids, sourceFolder, x?, y? }
  const [movePicker, setMovePicker] = useState(null);
  // Konfirmasi "Arsip" seluruh folder (header) — sebelumnya tanpa konfirmasi.
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  // Baris yang disembunyikan OPTIMIS selama jendela undo (hapus/pindah/arsip
  // tertunda) atau saat mutasi berjalan: { [folderId]: Set<string uid> }.
  const [hiddenByFolder, setHiddenByFolder] = useState({});
  // Balas/teruskan dari daftar sedang memuat pesan: { uid, mode }
  const [replyBusy, setReplyBusy] = useState(null);
  // Tumpukan undo (Ctrl/Cmd+Z): { id, kind, undo() }. Entri aksi tertunda
  // dihapus saat commit; entri read/flag tetap bisa dibalik.
  const undoStackRef = useRef([]);
  const undoSeqRef = useRef(0);
  // Aksi tertunda (jendela undo): id → { timer, commit, undo, targetFolderId }
  const deferredRef = useRef(new Map());

  // Refs untuk compose/search
  const searchInputRef = useRef(null);
  const rulesProcessed = useRef({}); // Track UIDs yang sudah diproses rules

  // Long-press (mobile) — timer, posisi sentuhan, dan penekanan klik sintetis per-baris
  const longPressTimers = useRef({});
  const longPressPos = useRef({});
  const longPressPending = useRef(new Set()); // long-press terdeteksi pada sentuhan ini
  const suppressClick = useRef(new Set());    // klik sintetis berikutnya utk baris ini harus ditekan

  // Pending deletes for undo — timers only (state diurus oleh toast)
  const pendingTimers = useRef({});

  // Hover prefetch (reader terasa instan): setelah 120ms hover-intent di baris,
  // prefetch detail pesan ke cache ['message', token, folder, uid] — key yang
  // SAMA dgn useQuery MessageReader, jadi saat dibuka data sudah ada.
  // Side-effect-free: markRead TIDAK ada di queryFn (lihat MessageReader).
  // Guard: pointer presisi saja, maks 1 prefetch in-flight, skip bila cache
  // masih segar (<30 dtk), timer dibatalkan saat mouse keluar baris.
  const hoverPrefetchTimer = useRef(null);
  const prefetchInFlight = useRef(false);
  const schedulePrefetchMessage = useCallback((uid, folder) => {
    if (!isFinePointer) return;
    // GET /view SOGo menandai \Seen di server selama SOGoMailAutoMarkAsReadDelay
    // belum -1 → prefetch hover akan diam-diam menandai email dibaca. Nonaktif
    // sampai ensureServerMarkReadDisabled mengonfirmasi -1.
    if (!isServerMarkReadDisabled()) return;
    const token = user?.sogoToken;
    if (!token || uid == null) return;
    if (hoverPrefetchTimer.current) clearTimeout(hoverPrefetchTimer.current);
    hoverPrefetchTimer.current = setTimeout(() => {
      hoverPrefetchTimer.current = null;
      if (prefetchInFlight.current) return; // maks 1 prefetch berjalan
      const key = ['message', token, folder, uid];
      const state = queryClient.getQueryState(key);
      if (state?.data !== undefined && Date.now() - (state.dataUpdatedAt || 0) < 30_000) return; // masih segar
      prefetchInFlight.current = true;
      queryClient
        .prefetchQuery({ queryKey: key, queryFn: () => fetchMessage(token, folder, uid), staleTime: 30_000 })
        .finally(() => { prefetchInFlight.current = false; });
    }, 120);
  }, [isFinePointer, user?.sogoToken, queryClient]);
  const cancelPrefetchMessage = useCallback(() => {
    if (hoverPrefetchTimer.current) { clearTimeout(hoverPrefetchTimer.current); hoverPrefetchTimer.current = null; }
  }, []);
  useEffect(() => () => cancelPrefetchMessage(), [cancelPrefetchMessage]);

  // Matikan auto-tandai-dibaca SOGo di server (sekali per akun per browser)
  // agar aplikasi yang memiliki status baca (instant/delay/manual). Non-blocking.
  useEffect(() => {
    const email = user?.email;
    const token = user?.sogoToken;
    if (!email || !token) return;
    ensureServerMarkReadDisabled(token, email).catch((err) => {
      console.warn('[mail] gagal menonaktifkan auto-tandai-dibaca server:', err?.message || err);
    });
  }, [user?.email, user?.sogoToken]);

  // Resize handles — nilai awal dari preferensi per-akun; perubahan dipersist
  // (debounce 300ms) lewat setPref('paneWidths'). Baca nilai terbaru dari
  // store saat menyimpan agar tidak menimpa field lain dgn snapshot basi.
  const [folderW, folderHandle] = useResizable(paneWidths?.folders ?? 220, 160, 320, 'x');
  const [listW, listHandle] = useResizable(paneWidths?.list ?? 340, 240, 560, 'x');
  const [listH, listHeightHandle] = useResizable(paneWidths?.listHeight ?? 460, 280, 800, 'y');
  useEffect(() => {
    const t = setTimeout(() => {
      const cur = useAuthStore.getState().paneWidths || {};
      if (cur.folders === folderW && cur.list === listW && cur.listHeight === listH) return;
      setPref('paneWidths', { ...cur, folders: folderW, list: listW, listHeight: listH });
    }, 300);
    return () => clearTimeout(t);
  }, [folderW, listW, listH, setPref]);

  // Reset selection on folder/search change (keep flagFilter + categoryFilter)
  useEffect(() => {
    setSelectedUids([]);
    setSelectedMsgId(null);
    setSelectionMode(false);
    setCtxMenu(null);
    setMovePicker(null);
    setFocusIdx(-1);
    setVisibleCount(PAGE_SIZE); // Bug fix: reset pagination saat ganti folder
    setExtraMessages([]);
    setLoadingMore(false);
    stopFetchingRef.current = false;
    lastSelectedUid.current = null; // range-select anchor ikut di-reset
    // Reset processed cache saat ganti folder
    rulesProcessed.current = {};
    // Bersihkan state long-press per-baris
    Object.values(longPressTimers.current).forEach(clearTimeout);
    longPressTimers.current = {};
    longPressPos.current = {};
    longPressPending.current.clear();
    suppressClick.current.clear();
  }, [selectedFolder, searchQuery]);

  // Cleanup pending timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pendingTimers.current).forEach(clearTimeout);
      Object.values(longPressTimers.current).forEach(clearTimeout);
    };
  }, []);

  // ── Folders ────────────────────────────────────────────────────────────────
  const { 
    data: folders = DEFAULT_FOLDERS, 
    isLoading: loadingFolders, 
    isFetching: isFetchingFolders
  } = useQuery({
    queryKey: ['folders', user?.sogoToken],
    queryFn: () => fetchFolders(user?.sogoToken),
    enabled: !!user?.sogoToken,
    staleTime: STALE_TIMES.FOLDERS,
  });

  // ── Folder tree (expand/collapse sidebar) ──────────────────────────────────
  // Bangun peta anak-per-parent dari daftar flat (id parent = path tanpa segmen
  // terakhir, di-encode sama seperti flattenMailboxes).
  // Path/name dipaksa string — SOGo pernah mengembalikan field sebagai object.
  const folderPathOf = (f) => {
    if (typeof f?.path === 'string' && f.path) return f.path;
    if (typeof f?.name === 'string' && f.name) return f.name;
    return '';
  };
  const childrenByParent = useMemo(() => {
    const map = {};
    const list = Array.isArray(folders) ? folders : [];
    for (const f of list) {
      const p = folderPathOf(f);
      const slash = p.lastIndexOf('/');
      if (slash <= 0) continue;
      const parentId = 'folder' + p.slice(0, slash).replace(/\//g, '%2F');
      (map[parentId] ||= []).push(f);
    }
    return map;
  }, [folders]);

  // Label chip folder per hasil pencarian (folderId → segmen terakhir path).
  const folderLabelById = useMemo(() => {
    const map = new Map();
    for (const f of Array.isArray(folders) ? folders : []) map.set(f.id, folderChipLabel(f));
    return map;
  }, [folders]);

  const toggleCollapsed = useCallback((id) => {
    const cur = useAuthStore.getState().collapsedFolders || [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setPref('collapsedFolders', next);
  }, [setPref]);

  // Favorit: toggle id folder di seksi "Favorit" (pola Outlook).
  const toggleFavorite = useCallback((id) => {
    const cur = useAuthStore.getState().favoriteFolders || [];
    const isFav = cur.includes(id);
    setPref('favoriteFolders', isFav ? cur.filter((x) => x !== id) : [...cur, id]);
    toast.success(isFav ? 'Dihapus dari Favorit' : 'Ditambahkan ke Favorit', 2500);
  }, [setPref]);

  // ── Messages ───────────────────────────────────────────────────────────────
  const { 
    data: msgData, 
    isLoading: loadingMessages, 
    isFetching: isFetchingMessages, 
    error: msgError,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['messages', user?.sogoToken, selectedFolder, searchQuery, searchCriteria],
    queryFn: () => searchQuery
      ? searchMessages(user?.sogoToken, selectedFolder, searchQuery, searchCriteria)
      : fetchMessages(user?.sogoToken, selectedFolder),
    // Tunggu folder benar-benar punya data (bukan array default/kosong) agar tidak nabrak saat pertama load
    enabled: !!user?.sogoToken && !!selectedFolder && folders !== DEFAULT_FOLDERS && !isFetchingFolders,
    staleTime: STALE_TIMES.MESSAGES,
    // Webmail harus menampilkan email terbaru tanpa menunggu ganti folder:
    // kembali ke tab/window (alt-tab) selalu refetch daftar pesan. Nilai ini
    // menimpa default global refetchOnWindowFocus: false (App.jsx) KHUSUS
    // query messages; unseen sudah poll 60s sendiri.
    refetchOnWindowFocus: true,
  });

  // ── Unseen count (INBOX + folder utama lain utk badge sidebar) ─────────────
  const { data: unseenData } = useQuery({
    queryKey: ['unseen', user?.sogoToken],
    queryFn: () => getUnseenCount(user?.sogoToken),
    // Hindari request bersamaan. Tunggu msgData selesai dan punya data valid.
    enabled: !!user?.sogoToken && 
             folders !== DEFAULT_FOLDERS && !isFetchingFolders && 
             msgData !== undefined && !isFetchingMessages,
    refetchInterval: STALE_TIMES.UNSEEN,
  });

  // Badge belum dibaca per folder utama (Junk, Sent, Drafts) — paralel ringan.
  const PER_FOLDER_IDS = ['folderJunk', 'folderSent', 'folderDrafts'];
  const perFolderUnseen = useQuery({
    queryKey: ['unseen-per-folder', user?.sogoToken],
    queryFn: async () => {
      const results = await Promise.allSettled(
        PER_FOLDER_IDS.map((f) => getUnseenCount(user?.sogoToken, f))
      );
      return PER_FOLDER_IDS.reduce((acc, f, i) => {
        acc[f] = results[i]?.status === 'fulfilled' ? results[i].value.unseenCount || 0 : 0;
        return acc;
      }, {});
    },
    enabled: !!user?.sogoToken && folders !== DEFAULT_FOLDERS && !isFetchingFolders,
    refetchInterval: STALE_TIMES.UNSEEN,
  });

  // ── Server-side pagination (auto-load) ─────────────────────────────────────
  // SOGo /view mem-prefetch hanya ~100 header (headersPrefetchMaxSize). UID
  // sisanya dimuat bertahap lewat /headers saat user scroll (pola native SOGo).
  // Bekerja untuk SEMUA folder (INBOX / Sent / Junk / Drafts / Trash) — hanya
  // INBOX yang punya batas waktu 5 bulan tambahan (lihat stopFetchingRef di
  // bawah); folder lain auto-load sampai habis untuk mengangkat paginasi ~100.
  const [extraMessages, setExtraMessages] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const stopFetchingRef = useRef(false);

  const baseMessages = msgData?.messages || [];
  const allUids = Array.isArray(msgData?.uids) ? msgData.uids : null;
  // Gabung header awal (/view) + header tambahan (/headers), dedup by uid,
  // lalu urutkan descending. /headers membalas baris dalam urutan IMAP (bukan
  // urutan yang diminta), jadi tanpa sort ulang visibleCount.slice(0, n) akan
  // me-reveal email lama sebelum email baru di batch yang sama.
  const messages = useMemo(() => {
    if (extraMessages.length === 0) return baseMessages;
    const seen = new Set(baseMessages.map((m) => String(m.uid)));
    const fresh = extraMessages.filter((m) => !seen.has(String(m.uid)));
    return [...baseMessages, ...fresh].sort((a, b) => b.uid - a.uid);
  }, [baseMessages, extraMessages]);

  const totalMessageCount = msgData?.total ?? messages.length;

  // UID yang belum punya header (urut SOGo: terbaru → lama).
  const remainingUids = useMemo(() => {
    if (!allUids) return [];
    const loaded = new Set(messages.map((m) => String(m.uid)));
    return allUids.filter((u) => !loaded.has(String(u)));
  }, [allUids, messages]);

  // Kotak Masuk dibatasi ke N bulan terakhir (sisanya hanya via pencarian).
  // `date` dari SOGo adalah string display; unparseable → dianggap dalam window.
  // SAAT MENCARI window TIDAK berlaku — search adalah satu-satunya jalan
  // menemukan email lama (teks UI: "Email lebih lama bisa dicari"). Sebelumnya
  // hasil pencarian di INBOX ikut dipotong 5 bulan → email lama tetap tak
  // ditemukan (bug).
  const messagesInWindow = useMemo(() => {
    if (searchQuery || selectedFolder !== 'folderINBOX') return messages;
    return applyMessageWindow(messages, { months: MESSAGE_WINDOW_MONTHS });
  }, [messages, selectedFolder, searchQuery]);

  // Pencarian global otomatis: folder aktif dulu → kosong → semua folder.
  // Live search (getHighlightedDates pattern): query GET sudah jalan per
  // keystroke via queryKey; expand global di-schedule dengan delay pendek
  // supaya mengetik cepat tidak memicu fan-out 12 folder per huruf.
  useEffect(() => {
    if (globalSearchTimerRef.current) { clearTimeout(globalSearchTimerRef.current); globalSearchTimerRef.current = null; }
    if (!searchQuery || !user?.sogoToken || !selectedFolder || !folders || folders === DEFAULT_FOLDERS) {
      setSearchedAll(false);
      setGlobalResults(null);
      lastGlobalQueryRef.current = null;
      return;
    }
    if ((messages?.length || 0) > 0) { setSearchedAll(false); setGlobalResults(null); lastGlobalQueryRef.current = null; return; }
    // Folder aktif 0 hasil → jadwalkan pencarian global setelah delay.
    const qKey = `${selectedFolder}|${searchQuery}|${searchCriteria}`;
    if (lastGlobalQueryRef.current === qKey || fetchingGlobal) return;
    globalSearchTimerRef.current = setTimeout(async () => {
      globalSearchTimerRef.current = null;
      try {
        setFetchingGlobal(true);
        lastGlobalQueryRef.current = qKey;
        const { messages: all, searchedAll: flag } = await searchAllFolders(
          user.sogoToken, selectedFolder, searchQuery, searchCriteria, folders
        );
        setGlobalResults(mergeSearchResults(all));
        setSearchedAll(flag);
      } catch {
        setGlobalResults([]);
        setSearchedAll(false);
      } finally {
        setFetchingGlobal(false);
      }
    }, 900);
    return () => { if (globalSearchTimerRef.current) { clearTimeout(globalSearchTimerRef.current); globalSearchTimerRef.current = null; } };
  }, [messages, searchQuery, searchCriteria, selectedFolder, user?.sogoToken, folders, fetchingGlobal]);

  // Simpan email terbaru (urutan sort desc) utk notifikasi rich — ref agar
  // tidak memicu re-render; effect notifikasi membaca saat email baru masuk.
  useEffect(() => {
    newestMessageRef.current = messagesInWindow?.[0] || null;
  }, [messagesInWindow]);

  // Saat query refetch (delete/move/archive/polling), header tambahan hasil
  // loadMore TIDAK boleh langsung dibuang — kalau dibuang, list "loncat" balik
  // ke 50 email pertama di tengah scroll user (gejala list berkedip/mundur).
  // Header lama divalidasi terhadap daftar uids FRESH dari SOGo: uid yang sudah
  // tidak ada di server (dihapus/dipindah) dibuang, sisanya dipertahankan.
  // Tanpa daftar uids (SOGo lama), fallback ke perilaku reset penuh.
  useEffect(() => {
    setExtraMessages((prev) => {
      if (prev.length === 0) return prev;
      if (!allUids) return [];
      const freshUids = new Set(allUids.map((u) => String(u)));
      const stillValid = prev.filter((m) => freshUids.has(String(m.uid)));
      return stillValid.length === prev.length ? prev : stillValid;
    });
    setLoadingMore(false);
    stopFetchingRef.current = false;
  }, [dataUpdatedAt, allUids]);
  const ruleSummary = getRuleSummary(user?.email);
  const enabledRules = ruleSummary.enabled;

  // ── Notifikasi email baru ───────────────────────────────────────────────────
  // Tab title badge (selalu) + Notification API (bila diizinkan).
  const unseenCount = unseenData?.unseenCount ?? 0;
  // Ref utk notif rich: diisi effect setelah messagesInWindow dideklarasikan
  // (lihat catatan TDZ di effect notifikasi di atas).
  const newestMessageRef = useRef(null);
  const notifyPrefsRef = useRef(null);
  useEffect(() => {
    if (user?.email) notifyPrefsRef.current = loadNotifyPrefs(user.email);
  }, [user?.email]);
  useEffect(() => {
    const prev = prevUnseenRef.current;
    const isNewEmail = prev !== null && unseenCount > prev && selectedFolder === 'folderINBOX';
    prevUnseenRef.current = unseenCount;

    // Tab title: badge "(n)" bila ada belum dibaca
    document.title = unseenCount > 0
      ? `(${unseenCount}) PCP Express Mail`
      : 'PCP Express Mail';

    if (!isNewEmail) return;
    // Suara singkat bila preferensi notifikasi `sound` aktif (WebAudio, tanpa
    // aset; autoplay ditolak → diam). Independen dari izin Notification.
    if (notifyPrefsRef.current?.sound === true) playNotifyBeep();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      // Mode rich (default): pengirim+subjek email terbaru — data diambil
      // via ref yang diisi effect SETELAH messagesInWindow dideklarasikan
      // (jangan referensi langsung di sini: TDZ di module chunk → outage
      // kelas 2026-09-05).
      const newest = newestMessageRef.current;
      const rich = notifyPrefsRef.current?.rich !== false;
      const sender = rich && newest ? formatAddresses(newest.from) : '';
      const subj = rich && newest ? (newest.subject || '(Tanpa Subjek)') : '';
      try {
        const n = new Notification(rich && sender ? sender : 'Email baru', {
          body: rich && subj
            ? `${subj}\n${unseenCount} pesan belum dibaca di Kotak Masuk`
            : `${unseenCount} pesan belum dibaca di Kotak Masuk`,
          tag: 'sogo-new-mail',
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch { /* Safari/older — abaikan */ }
    }
    // Toast in-app dgn aksi "Buka" — HANYA saat tab terlihat (tab tersembunyi
    // sudah dilayani Notification API di atas). Throttle: maks 1 toast per
    // burst poll (jendela 30 dtk) agar beberapa email sekaligus tidak menumpuk.
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - newMailToastAtRef.current > 30_000) {
        newMailToastAtRef.current = now;
        const latest = newestMessageRef.current;
        const sender = latest ? formatAddresses(latest.from) : '';
        const subj = latest ? (latest.subject || '(Tanpa Subjek)') : '';
        useToastStore.getState().addToast({
          type: 'info',
          message: sender ? `Email baru dari ${sender}: ${subj}` : 'Email baru di Kotak Masuk',
          duration: 8000,
          action: latest?.uid != null
            ? { label: 'Buka', kind: 'open', onClick: () => { selectFolder('folderINBOX'); openMessage(latest.uid); } }
            : undefined,
        });
      }
    }
  }, [unseenCount, selectedFolder]);

  // ── Auto-refresh daftar pesan saat email baru terdeteksi ──────────────────
  // Root cause "webmail tidak menampilkan email terbaru": badge unseen di-poll
  // tiap 60s, tetapi daftar pesan tidak pernah di-refetch otomatis — user hanya
  // lihat email baru setelah ganti folder / pull-to-refresh. Saat unseen INBOX
  // NAIK antar poll (ada email baru masuk), invalidate query messages INBOX.
  // - refetchType 'active': hanya refetch bila query INBOX sedang ter-mount;
  //   kalau user sedang di folder lain, invalidation menjadi no-op yang aman.
  // - Search aktif tidak diganggu: hasil pencarian harus stabil; email baru
  //   muncul di list normal setelah search dibersihkan.
  const lastUnseenForRefreshRef = useRef(null);
  useEffect(() => {
    const prev = lastUnseenForRefreshRef.current;
    lastUnseenForRefreshRef.current = unseenCount;
    if (prev === null || unseenCount <= prev) return; // tidak ada email baru
    if (searchQuery) return;
    queryClient.invalidateQueries({
      queryKey: ['messages', user?.sogoToken, 'folderINBOX'],
      refetchType: 'active',
    });
  }, [unseenCount, searchQuery, queryClient, user?.sogoToken]);

  // ── Multi-tab sync domain 'mail' ─────────────────────────────────────────
  // Tab lain melakukan mutasi mailbox (delete/move/flag/read/junk/kirim —
  // bump-nya dipasang di layer api.js) → tab ini invalidate query mail agar
  // daftar/badge tidak basi sampai staleTime. Kalau user sedang search,
  // hasil pencarian tetap stabil (invalidate menandai stale, tidak force).
  React.useEffect(() => {
    if (!user?.email || !user?.sogoToken) return;
    return watchDomainVersion('mail', user?.email, () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user?.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['unseen-per-folder', user?.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['folders', user?.sogoToken] });
    });
  }, [user?.email, user?.sogoToken, queryClient]);

  // ── Kiriman terjadwal (badge + panel) ────────────────────────────────────
  // Poll queue server tiap 60 dtk; badge merah muncul saat ada kiriman yang
  // sudah due namun belum sempat di-refresh (mis. tab lain yang menjadwalkan).
  useEffect(() => {
    if (!user?.sogoToken) return;
    let cancelled = false;
    const load = () => {
      getPendingSends()
        .then((items) => { if (!cancelled) setPendingSends(items); })
        .catch(() => { /* polling gagal — jangan ganggu UI */ });
    };
    load();
    const iv = setInterval(load, 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [user?.sogoToken]);

  // Re-fetch pending sends saat panel dibuka (selain polling 60 detik)
  useEffect(() => {
    if (!pendingOpen || !user?.sogoToken) return;
    getPendingSends()
      .then((items) => setPendingSends(items))
      .catch(() => {});
  }, [pendingOpen, user?.sogoToken]);

  // Izin notifikasi — TIDAK auto-request (prompt otomatis sering dibuang &
  // denied permanen). Tampilkan banner soft-ask sekali setelah mailbox dimuat;
  // user yang klik banner yang memicu requestPermission (user gesture).
  useEffect(() => {
    if (notifGrantedRef.current || typeof Notification === 'undefined') return;
    if (Notification.permission === 'default' && !loadingMessages) {
      setNotifAsk(true);
    } else {
      notifGrantedRef.current = true;
    }
  }, [loadingMessages]);

  const handleEnableNotifications = React.useCallback(async () => {
    setNotifAsk(false);
    notifGrantedRef.current = true;
    if (typeof Notification === 'undefined') return;
    try {
      await Notification.requestPermission();
    } catch { /* browser lama — abaikan */ }
  }, []);

  // ── Favicon unread badge (pola Gmail) ─────────────────────────────────
  useEffect(() => {
    updateFaviconBadge(unseenCount);
  }, [unseenCount]);

  // Sidebar (menu akun) mengirim CustomEvent 'pcp:open-shortcuts' → buka
  // modal bantuan pintasan dari sini (modal milik MailPage).
  useEffect(() => {
    const onOpen = () => setKeyboardHelpOpen(true);
    window.addEventListener('pcp:open-shortcuts', onOpen);
    return () => window.removeEventListener('pcp:open-shortcuts', onOpen);
  }, []);

  // Logout/unmount (manual, sesi habis, ganti akun): reset tab title +
  // favicon badge — tanpa ini badge "(n)" dan ikon dot merah akun lama
  // menempel di tab sampai akun berikutnya memuat.
  useEffect(() => {
    return () => {
      document.title = 'PCP Express Mail';
      __resetFaviconBadge();
    };
  }, []);

  // ── Load More (client-side pagination, after messages assignment) ─────────
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ── Snooze (client-side) ───────────────────────────────────────────────────
  // Pesan yang di-snooze disembunyikan dari daftar; muncul lagi saat waktunya.
  // Dideklarasikan SEBELUM displayMessages (dipakai di filter di bawah).
  // pruneExpired: hanya di useEffect (bukan useMemo) utk menghindari side effect saat render.
  // Dipanggil saat user login + saat snoozeTick berubah (auto-prune interval).
  useEffect(() => {
    if (user?.email) pruneExpired(user.email);
  }, [user?.email, snoozeTick]);
  // Snooze adalah FOLDER-SCOPED (schema v3): entri hanya berlaku di folder
  // asal. Pesan yang dipindah (arsip/move) tidak lagi disembunyikan di folder
  // asal — entri yatim dihapus via unsnoozeMessages saat move/delete sukses,
  // sehingga UID yang dipakai ulang oleh pesan baru tidak ikut tersembunyi.
  const snoozedUids = useMemo(() => {
    if (!user?.email) return new Set();
    const folderMap = loadSnoozes(user.email)[selectedFolder];
    return new Set(Object.keys(folderMap || {}));
  }, [user?.email, selectedFolder, snoozeTick]);

  // Sumber hitung kategori: pesan yang BENAR-BENAR terlihat. Pesan yang
  // di-snooze disembunyikan dari daftar → tidak boleh ikut dihitung di tab
  // kategori (kalau tidak: tab "Promosi 5" tapi daftar cuma 3 → membingungkan).
  // HARUS dari messagesInWindow (bukan `messages` mentah): email di luar
  // window 5-bulan INBOX tidak pernah tampil di daftar — menghitungnya membuat
  // badge kategori lebih besar dari isi daftar (audit 2026-09-05). Di luar
  // INBOX / saat search, messagesInWindow === messages → tidak ada perubahan.
  const categorySource = useMemo(
    () => messagesInWindow.filter((m) => !snoozedUids.has(String(m.uid))),
    [messagesInWindow, snoozedUids]
  );

  // Folder Arsip — SOGo/Dovecot punya folder root "Archive" (diverifikasi).
  const archiveFolder = (Array.isArray(folders) ? folders : [])
    .find((f) => /(^|\/)archive$/i.test(f.path || f.name || '')) || null;

  // Resolver folder id → objek (moveMessages butuh `path`, bukan id berprefix)
  const folderById = (id) => (Array.isArray(folders) ? folders : []).find((f) => f.id === id) || null;
  const trashFolder = folderById('folderTrash') || { path: 'Trash' };

  // Folder Terkirim/Draf menampilkan penerima (to) sebagai label baris;
  // dipakai juga untuk header/avatar conversation sebelum memo di bawah.
  const isSentOrDraft = isSentOrDraftFolder(selectedFolder, folders);

  // Filter messages by flag color / kategori / belum dibaca / snooze (client-side)
  const filterMessage = (m) => {
    // Baris yang sedang dalam jendela undo (hapus/pindah tertunda) atau
    // mutasi berjalan disembunyikan optimis — tidak bisa dihapus dua kali.
    if (hiddenByFolder[m.folderId || selectedFolder]?.has(String(m.uid))) return false;
    if (!searchQuery && snoozedUids.has(String(m.uid))) return false;
    if (flagFilter && flagColorOf(m.uid) !== flagFilter) return false;
    if (categoryFilter && classifyEmail(m) !== categoryFilter) return false;
    if (unreadOnly && m.isRead) return false;
    if (hasAttachmentOnly && !m.hasAtt) return false;
    return true;
  };

  // BUG FIX (audit 2026-09-05): filter (flag/kategori/belum-dibaca/lampiran)
  // sebelumnya hanya diterapkan ke `visibleMessages` — irisan window paginasi
  // (visibleCount) dan hasil fetch. Akibatnya header yang dimuat via infinite
  // scroll TIDAK lolos filter: dengan filter "belum dibaca" aktif, scroll
  // memuat email baru yang tak terlihat; kategori "Promosi 12" tapi daftar
  // tampil 4; flag filter menghitung header yang tak pernah dirender.
  // Sekarang: filter diterapkan ke messagesInWindow (seluruh header yang
  // sudah dimuat), paginasi visibleCount memotong HASIL filter — urutan
  // operasi dibalik, hasil keduanya konsisten untuk semua filter.
  const filteredLoadedMessages = useMemo(
    () => messagesInWindow.filter(filterMessage),
    [messagesInWindow, searchQuery, snoozedUids, flagFilter, user?.email, categoryFilter, unreadOnly, hasAttachmentOnly, hiddenByFolder, selectedFolder, flagTick]
  );
  // Pencarian global: saat folder aktif 0 hasil & globalResults terisi,
  // gabungkan ke daftar (hasil lintas folder diberi chip folder per baris).
  const displayMessages = filteredLoadedMessages.slice(0, visibleCount);
  // Hasil lintas folder digabung SETELAH paginasi folder aktif (hasil global
  // sudah dibatasi per folder oleh searchAllFolders). BUG LAMA: gate empty-state
  // di render memeriksa `messages.length === 0` (folder aktif) sehingga hasil
  // global tidak pernah dirender — gate kini memakai sortedMessages.
  const searchEffectiveMessages = useMemo(() => {
    if (!searchQuery || !globalResults || globalResults.length === 0) return displayMessages;
    const visibleGlobal = globalResults.filter((m) => !hiddenByFolder[m.folderId || selectedFolder]?.has(String(m.uid)));
    return mergeSearchResults([...displayMessages, ...visibleGlobal]);
    // displayMessages = slice baru tiap render; identitasnya tidak stabil —
    // deps memakai sumbernya (filteredLoadedMessages + visibleCount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filteredLoadedMessages, visibleCount, globalResults, hiddenByFolder, selectedFolder]);

  // Conversation dibentuk dari SEMUA pesan yang sudah dimuat dan lolos filter
  // (bukan hasil slice paginasi) — thread tetap stabil saat infinite-scroll
  // menambah data. Sumber = messagesInWindow (bukan `messages` mentah): pesan
  // luar window 5-bulan INBOX tidak boleh muncul lewat jalur conversation.
  const filteredMessages = filteredLoadedMessages;

  // Conversation mode memakai satu preview terbaru per grup: baris preview =
  // group.messages[0] (urutan pesan dijamin oleh sort di conversations.js),
  // sehingga email baru selalu tampil tanpa tergantung urutan response SOGo.
  const conversationGroups = useMemo(() => {
    if (!conversationView) return [];
    return groupConversations(filteredMessages, sortAsc, user?.email || '', {
      labelField: isSentOrDraft ? 'to' : 'from',
    });
  }, [filteredMessages, conversationView, sortAsc, user?.email, isSentOrDraft]);

  // Grup yang dirender = grup PENUH dari conversationGroups (preview = pesan
  // terbaru; anggota lama tampil saat expand — pola Gmail/Outlook). Versi lama
  // memotong anggota grup ke uid preview saja → setiap grup selalu berisi 1
  // pesan: header thread, tombol expand, dan chip agregat (jumlah pesan/
  // unread/flag/lampiran) TIDAK PERNAH tampil di produksi (tertangkap E2E
  // live 2026-09-22). Paginasi tetap berlaku lewat SUMBER data —
  // conversationGroups dibangun dari filteredMessages (window 5-bulan INBOX +
  // header hasil infinite-scroll) — bukan lewat pemotongan anggota per-grup.
  const visibleConversationGroups = useMemo(() => {
    if (!conversationView) return [];
    return conversationGroups;
  }, [conversationView, conversationGroups]);

  function handleSnooze(uid, hours) {
    if (!user?.email) return;
    snoozeMessage(user.email, selectedFolder, uid, Math.floor(Date.now() / 1000) + hours * 3600);
    setSnoozePicker(null);
    setSnoozeTick((t) => t + 1);
    toast.success(hours >= 24 ? 'Email di-snooze. Akan kembali lagi nanti.' : 'Email di-snooze sementara.');
  }

  function handleUnsnooze(uid) {
    if (!user?.email) return;
    unsnoozeMessage(user.email, selectedFolder, uid);
    setSnoozeTick((t) => t + 1);
  }

  // Bangun otomatis: cek berkala (menit) — kalau ada snooze yang waktunya lewat,
  // prune + refresh daftar.
  useEffect(() => {
    const iv = setInterval(() => {
      if (!user?.email) return;
      const before = Object.keys(loadSnoozes(user.email)).length;
      pruneExpired(user.email);
      if (before !== Object.keys(loadSnoozes(user.email)).length) {
        setSnoozeTick((t) => t + 1);
      }
    }, 60_000);
    return () => clearInterval(iv);
  }, [user?.email]);

  // Sinkronisasi SNOOZE antar-tab: localStorage dibagi antar tab, tapi event
  // 'storage' hanya ter-fire di tab LAIN (bukan yang menulis). Tanpa listener
  // ini, tab B tidak tahu tab A menynooze/unsnooze pesan → daftar pesan tab B
  // basi sampai interval 60 detik berikutnya (bahkan tanpa batas bila tidak
  // ada perubahan). Bump snoozeTick saat key snooze user berubah di tab lain.
  useEffect(() => {
    if (!user?.email) return;
    const norm = (s) => typeof s === 'string' ? s.trim().toLowerCase() : '';
    const myKey = `pcp_snooze_v3_${norm(user.email)}`;
    const legacyKey = `pcp_snooze_v2_${norm(user.email)}`;
    const onStorage = (e) => {
      const k = e?.key;
      if (k === myKey || k === legacyKey || k === null /* clear() */) {
        setSnoozeTick((t) => t + 1);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.email]);

  // Sinkronisasi KLAIM auto-archive antar-tab: klaim disimpan di localStorage
  // (di-share antar tab). Saat tab lain menulis klaim (claim/release), tab ini
  // re-run engine agar SKIP uid yang sedang diproses tab lain — menutup race
  // klaim berbarengan (keduanya baca kosong sebelum salah satu menulis).
  useEffect(() => {
    if (!user?.email) return;
    const myClaimsKey = autoArchiveClaimsKey(user.email);
    const onStorage = (e) => {
      if (e?.key === myClaimsKey || e?.key === null /* clear() */) {
        setClaimsTick((t) => t + 1);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.email]);

  // Sort by DATE (client-side), selalu date-descending untuk semua view.
  // Sebelumnya sort by UID: (1) uid SOGo per-folder tidak dijamin sekuensial
  // dgn waktu → urutan tampil bisa menyimpang dari tanggal; (2) saat sortAsc
  // (terlama dulu) urutan baris terbalik → header date-group muncul terbalik
  // (Lebih Lama di atas, Hari Ini di bawah) + sticky header salah menempel.
  // Sekarang sortAsc hanya membalik urutan GRUP (date-group header / thread
  // conversation), isi tiap grup tetap terbaru-dulu — konsisten dua view.
  const sortedMessages = useMemo(() => sortMessagesByDate(searchEffectiveMessages), [searchEffectiveMessages]);

  // Grup tanggal dalam URUTAN RENDER: sortAsc membalik urutan grup DAN isi
  // tiap grup (bug lama: label "Terlama dulu" tapi baris di dalam grup tetap
  // terbaru-dulu). focusOrder = baris datar persis urutan tampil — dipakai
  // navigasi keyboard/fokus agar indeks fokus == baris yang dirender.
  const dateGroups = useMemo(() => {
    if (conversationView) return [];
    const groups = reorderDateGroups(groupMessagesByDate(sortedMessages, (m) => m.date), sortAsc);
    return sortAsc ? groups.map((g) => ({ ...g, messages: [...g.messages].reverse() })) : groups;
  }, [sortedMessages, sortAsc, conversationView]);
  const focusOrder = useMemo(
    () => (conversationView ? sortedMessages : dateGroups.flatMap((g) => g.messages)),
    [conversationView, sortedMessages, dateGroups]
  );

  // Urutan SELURUH baris yang sudah dimuat & lolos filter (bukan irisan
  // render visibleCount) — dipakai navigasi reader "N dari M". Bug lama:
  // reader menerima visibleOrderUids (window render 50) → "N dari 50" walau
  // ratusan header sudah dimuat, dan Berikutnya mentok di baris ke-50.
  const loadedFlatOrder = useMemo(() => {
    if (conversationView) return [];
    const visibleGlobal = searchQuery && globalResults && globalResults.length > 0
      ? globalResults.filter((m) => !hiddenByFolder[m.folderId || selectedFolder]?.has(String(m.uid)))
      : [];
    const all = sortMessagesByDate(visibleGlobal.length > 0
      ? mergeSearchResults([...filteredLoadedMessages, ...visibleGlobal])
      : filteredLoadedMessages);
    const groups = reorderDateGroups(groupMessagesByDate(all, (m) => m.date), sortAsc);
    return (sortAsc ? groups.map((g) => [...g.messages].reverse()) : groups.map((g) => g.messages)).flat();
  }, [conversationView, searchQuery, globalResults, hiddenByFolder, selectedFolder, filteredLoadedMessages, sortAsc]);

  // Conversation grouping dibuat setelah displayMessages tersedia di bawah.
  // Jangan grouping seluruh `messages`: pesan yang sedang snooze/filter harus
  // mengikuti daftar yang benar-benar terlihat oleh user agar tidak muncul
  // kembali secara tak terduga saat conversation diaktifkan.

  // Reset expanded set when conversation view toggles
  useEffect(() => {
    setExpandedConversations(new Set());
  }, [conversationView]);

  // Keluar dari mode seleksi otomatis jika tidak ada pesan terpilih lagi
  useEffect(() => {
    if (selectionMode && selectedUids.length === 0) setSelectionMode(false);
  }, [selectionMode, selectedUids.length]);

  // Bug fix: clamp focusIdx saat jumlah messages berubah (cegah out-of-bounds)
  // Catatan: jangan masukkan focusIdx di deps — bisa create loop dgn reset effect
  // focusIdx mengikuti URUTAN TAMPIL (sortedMessages date-desc), bukan messages
  // (uid-sort) — keduanya berbeda sejak sort by date diterapkan.
  useEffect(() => {
    if (focusIdx >= sortedMessages.length) {
      setFocusIdx(Math.max(0, sortedMessages.length - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedMessages.length]);

  // Pastikan thread TERBUKA (idempoten) — dipakai klik header thread.
  // Bukan toggle: klik header saat sudah terbuka (atau klik ganda) dulu
  // menutup thread; kini hanya chevron yang men-toggle.
  const expandConversation = useCallback((key) => {
    setExpandedConversations((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const toggleConversation = useCallback((key) => {
    setExpandedConversations(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Hanya thread dengan >1 pesan yang punya panel anak untuk di-expand.
  // Menghitung singleton membuat tombol expand-all terlihat tidak konsisten.
  const expandableConversationGroups = useMemo(
    () => visibleConversationGroups.filter((group) => group.messages.length > 1).slice(0, 50),
    [visibleConversationGroups]
  );

  // Expand/collapse ALL conversation threads sekaligus.
  // Limit 50 thread saat expand-all utk cegah lag di inbox besar.
  const expandAllConversations = useCallback(() => {
    const keys = expandableConversationGroups.map((g) => g.key);
    setExpandedConversations(new Set(keys));
  }, [expandableConversationGroups]);

  const collapseAllConversations = useCallback(() => {
    setExpandedConversations(new Set());
  }, []);
  const allExpandableConversationsOpen = expandableConversationGroups.length > 0 &&
    expandableConversationGroups.every((group) => expandedConversations.has(group.key));

  // Masih ada yang bisa ditampilkan/dimuat: reveal client-side ATAU fetch server-side.
  const hasMore = visibleCount < messagesInWindow.length ||
    (remainingUids.length > 0 && !stopFetchingRef.current);

  // Jalankan rules LAMA (client-side, localStorage) untuk pesan yang baru
  // dimuat. Aturan baru hidup di SERVER (Sieve — RulesPage/sieveFilters.js)
  // dan dijalankan Dovecot saat email masuk; aturan lama yang sudah
  // dimigrasi dihapus dari localStorage (removeRules) sehingga engine ini
  // hanya memproses aturan yang BELUM dimigrasi → tidak ada double-apply.
  useEffect(() => {
    // Jangan jalankan rules saat mode SEARCH — rules memindahkan pesan dari
    // daftar folder biasa; memindahkan hasil pencarian mengejutkan user
    // (pesan hilang dari hasil cari karena dipindah rule).
    if (searchQuery) return;
    if (!user?.email || !user?.sogoToken || !messages.length || !enabledRules) return;

    const unprocessed = messages.filter((m) => !rulesProcessed.current[m.uid]);
    if (!unprocessed.length) return;

    // MULTI-TAB: klaim uid yg akan diproses tab ini di sessionStorage (TTL 5
    // mnt). Dua tab akun sama menjalankan rule engine independen; tanpa klaim
    // keduanya bisa memindahkan pesan SAMA bersamaan (double-move). Tab yang
    // claim duluan menang; tab lain SKIP uid tsb (claims tetap dianggap
    // unprocessed utk diproses nanti bila masih ada di folder).
    const claimed = claimAutoArchiveUids(user.email, unprocessed.map((m) => m.uid));
    const claimedSet = new Set(claimed);

    executeRules(
      user.email,
      user.sogoToken,
      selectedFolder,
      unprocessed,
      (uids, targetFolder) => moveMessages(user.sogoToken, selectedFolder, uids, targetFolder),
      // Pesan yang sedang di-snooze TIDAK boleh dipindah rule otomatis —
      // user meminta tunda; memindahnya membuat snooze yatim (uid berubah)
      // dan mengabaikan keinginan user. Rules diproses ulang saat wake.
      // Pesan yang DICLAIM tab lain juga di-skip (multi-tab guard).
      (m) => snoozedUids.has(String(m?.uid)) || !claimedSet.has(String(m?.uid))
    ).then((actions) => {
      const movedUids = new Set(actions.flatMap((a) => a.uids).map(String));
      // Lepas klaim MILIK tab ini utk uid yang tidak jadi dipindah (snooze /
      // tidak match rule). Klaim tab lain TIDAK disentuh (ownership-based) —
      // melepas klaim tab lain membuatnya kehilangan proteksi saat move jalan.
      releaseAutoArchiveClaims(
        user.email,
        claimed.filter((uid) => !movedUids.has(String(uid)))
      );
      unprocessed.forEach((m) => {
        // Tandai processed: (1) benar-benar dipindah tab ini, (2) sedang
        // di-snooze. Yang (2) PENTING: pesan yang di-snooze TIDAK boleh
        // di-arsip rule saat bangun — user minta tunda utk DILIHAT; kalau
        // rule jalan lagi saat wake, pesan langsung hilang ke folder tujuan
        // sebelum sempat terlihat (pola Gmail: filter tidak dijalankan ulang
        // saat snooze bangun). Pesan yang di-skip karena diklaim tab lain
        // TIDAK ditandai — run berikutnya mencobanya lagi.
        if (movedUids.has(String(m.uid)) || snoozedUids.has(String(m.uid))) {
          rulesProcessed.current[m.uid] = true;
        }
      });

      if (actions.length > 0) {
        const totalMoved = actions.reduce((sum, a) => sum + a.uids.length, 0);
        toast.success(`${totalMoved} email diarsipkan otomatis oleh aturan`, 4000);
        queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
      }
    }).catch((err) => {
      // Gagal (network/SOGo) — lepas klaim MILIK tab ini agar run berikutnya
      // bisa coba lagi (klaim tab lain dibiarkan).
      releaseAutoArchiveClaims(user.email, claimed);
      console.warn('[rules] Gagal menjalankan aturan otomatis:', err?.message || err);
      // Bug fix: tampilkan toast error ke user (bukan hanya console.warn)
      toast.warning('Sebagian aturan gagal dijalankan — coba lagi nanti.');
    });
  }, [messages.length, selectedFolder, user?.email, user?.sogoToken, enabledRules, snoozedUids, searchQuery, claimsTick]);

  // loadMore dua tahap:
  // 1) reveal header yang SUDAH ada (client-side, instant);
  // 2) bila sudah ter-reveal semua tapi masih ada UID belum di-fetch → /headers.
  const loadMore = useCallback(async () => {
    if (loadingMore) return;

    if (visibleCount < messagesInWindow.length) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, messagesInWindow.length));
      return;
    }

    // Kotak Masuk: berhenti setelah melewati batas 5 bulan.
    if (stopFetchingRef.current) return;

    if (remainingUids.length === 0 || !user?.sogoToken) return;

    setLoadingMore(true);
    try {
      const batch = remainingUids.slice(0, PAGE_SIZE);
      const rows = await fetchMessageHeaders(user.sogoToken, selectedFolder, batch);
      if (rows.length) {
        setExtraMessages((prev) => [...prev, ...rows]);
        setVisibleCount((prev) => prev + rows.length);
      }

      // Kotak Masuk: hentikan fetch lanjutan bila batch sudah menyentuh pesan
      // lebih lama dari cutoff (UID urut terbaru → lama). Cari pesan terlama
      // via uid minimum — /headers tidak menjamin urutan balasan sama dgn request.
      if (selectedFolder === 'folderINBOX') {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - MESSAGE_WINDOW_MONTHS);
        const oldest = rows.reduce((min, r) => ((r?.uid ?? Infinity) < (min?.uid ?? Infinity) ? r : min), rows[0]);
        const d = oldest ? parseMessageDate(oldest.date) : null;
        if (d && d.getTime() < cutoff.getTime()) stopFetchingRef.current = true;
      }

      // UID habis tapi header tidak (mis. pesan terhapus di server) → hentikan.
      if (rows.length < batch.length) stopFetchingRef.current = true;
    } catch (err) {
      console.warn('[mail] Gagal memuat header tambahan:', err?.message || err);
      // Jangan loop retry tanpa henti di sentinel — beri jeda via stop.
      stopFetchingRef.current = true;
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, visibleCount, messagesInWindow.length, remainingUids, user?.sogoToken, selectedFolder]);

  // ── Infinite scroll: auto-load saat sentinel bawah terlihat ────────────────
  const listRef = useRef(null);
  const loadMoreSentinelRef = useRef(null);
  useEffect(() => {
    if (!hasMore) return;
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); },
      { root: listRef.current, rootMargin: '240px' }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  // ── Undo Delete ────────────────────────────────────────────────────────────
  // Preferensi SOGoConfirmDelete: '1' (default) = konfirmasi via toast undo
  // 6 detik (pola Gmail); '0' = "Langsung hapus" → pindah ke Sampah langsung.
  const { data: prefsData } = useQuery({
    queryKey: ['preferences', user?.sogoToken],
    queryFn: () => fetchPreferences(user?.sogoToken, user?.email),
    enabled: !!(user?.sogoToken && user?.email),
    staleTime: 5 * 60_000,
  });
  const confirmDeleteEnabled = String(prefsData?.defaults?.SOGoConfirmDelete ?? '1') === '1';

  // ── Cache optimis (React Query) ───────────────────────────────────────────
  // Semua mutasi daftar (baca/bendera/hapus/pindah/arsip/spam) memperbarui
  // cache ['messages', token, folder, *] + extraMessages + globalResults
  // SEKETIKA; gagal → rollback + toast. Refetch (invalidate) tetap dilakukan
  // setelah commit agar sinkron dgn server. bumpMailVersion (lintas tab)
  // dipanggil di layer api.js per request — tidak diulang di sini.
  const patchMessagesCache = useCallback((folderId, uids, patch) => {
    const set = new Set((uids || []).map(String));
    const apply = (m) => (set.has(String(m?.uid)) ? { ...m, ...patch } : m);
    queryClient.setQueriesData({ queryKey: ['messages', user?.sogoToken, folderId] }, (old) =>
      old && Array.isArray(old.messages) ? { ...old, messages: old.messages.map(apply) } : old
    );
    if (folderId === selectedFolder) setExtraMessages((prev) => (prev.length ? prev.map(apply) : prev));
    setGlobalResults((prev) => (prev ? prev.map((m) => ((m.folderId || selectedFolder) === folderId ? apply(m) : m)) : prev));
  }, [queryClient, user?.sogoToken, selectedFolder]);

  const removeFromCache = useCallback((folderId, uids) => {
    const set = new Set((uids || []).map(String));
    const keep = (m) => !set.has(String(m?.uid));
    queryClient.setQueriesData({ queryKey: ['messages', user?.sogoToken, folderId] }, (old) => {
      if (!old || !Array.isArray(old.messages)) return old;
      const kept = old.messages.filter(keep);
      const removed = old.messages.length - kept.length;
      return {
        ...old,
        messages: kept,
        uids: Array.isArray(old.uids) ? old.uids.filter((u) => !set.has(String(u))) : old.uids,
        total: typeof old.total === 'number' ? Math.max(0, old.total - removed) : old.total,
      };
    });
    if (folderId === selectedFolder) setExtraMessages((prev) => (prev.length ? prev.filter(keep) : prev));
    setGlobalResults((prev) => (prev ? prev.filter((m) => (m.folderId || selectedFolder) !== folderId || keep(m)) : prev));
  }, [queryClient, user?.sogoToken, selectedFolder]);

  // Hitung pesan di cache yang cocok uids + predikat (koreksi badge unseen).
  const countInCache = useCallback((folderId, uids, pred) => {
    const set = new Set((uids || []).map(String));
    const seen = new Set();
    let n = 0;
    const visit = (m) => {
      const k = String(m?.uid);
      if (!set.has(k) || seen.has(k)) return;
      seen.add(k);
      if (pred(m)) n++;
    };
    for (const [, data] of queryClient.getQueriesData({ queryKey: ['messages', user?.sogoToken, folderId] })) {
      (data?.messages || []).forEach(visit);
    }
    if (folderId === selectedFolder) extraMessages.forEach(visit);
    (globalResults || []).filter((m) => (m.folderId || selectedFolder) === folderId).forEach(visit);
    return n;
  }, [queryClient, user?.sogoToken, selectedFolder, extraMessages, globalResults]);

  const adjustUnseen = useCallback((folderId, delta) => {
    if (!delta) return;
    if (folderId === 'folderINBOX') {
      queryClient.setQueryData(['unseen', user?.sogoToken], (old) =>
        old ? { ...old, unseenCount: Math.max(0, (old.unseenCount || 0) + delta) } : old
      );
    } else {
      queryClient.setQueryData(['unseen-per-folder', user?.sogoToken], (old) =>
        old && folderId in old ? { ...old, [folderId]: Math.max(0, (old[folderId] || 0) + delta) } : old
      );
    }
  }, [queryClient, user?.sogoToken]);

  // Status baca lokal (tanpa request) — dipakai reader (onReadStateChange)
  // dan sebagai langkah optimis sebelum request. Mengembalikan jumlah baris
  // yang benar-benar berubah.
  const applyReadLocal = useCallback((folderId, uids, isRead) => {
    const changed = countInCache(folderId, uids, (m) => !!m.isRead !== !!isRead);
    if (changed === 0) return 0;
    patchMessagesCache(folderId, uids, { isRead: !!isRead });
    adjustUnseen(folderId, isRead ? -changed : changed);
    return changed;
  }, [countInCache, patchMessagesCache, adjustUnseen]);

  // Baris tersembunyi optimis (jendela undo / mutasi berjalan).
  const hideRows = useCallback((folderId, uids) => {
    setHiddenByFolder((prev) => {
      const next = new Set(prev[folderId] || []);
      (uids || []).forEach((u) => next.add(String(u)));
      return { ...prev, [folderId]: next };
    });
  }, []);
  const unhideRows = useCallback((folderId, uids) => {
    setHiddenByFolder((prev) => {
      if (!prev[folderId]) return prev;
      const next = new Set(prev[folderId]);
      (uids || []).forEach((u) => next.delete(String(u)));
      return { ...prev, [folderId]: next };
    });
  }, []);

  // ── Tumpukan undo (Ctrl/Cmd+Z) ────────────────────────────────────────────
  const pushUndo = (entry) => {
    const id = ++undoSeqRef.current;
    undoStackRef.current.push({ id, ...entry });
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
    return id;
  };
  const dropUndo = (id) => { undoStackRef.current = undoStackRef.current.filter((e) => e.id !== id); };
  function undoLast() {
    const entry = undoStackRef.current.pop();
    if (!entry) { toast.info('Tidak ada aksi untuk diurungkan.', 2500); return; }
    try { entry.undo(); } catch (err) { console.warn('[undo] gagal:', err?.message || err); }
  }

  // Auto-advance ala Outlook: bila pesan yang terbuka ikut dihapus/dipindah,
  // buka pesan berikutnya di daftar (atau tutup reader bila tidak ada /
  // reading pane mati).
  function advanceAfterRemoval(uids) {
    if (selectedMsgId == null) return;
    const next = nextAfterRemoval(visibleOrderUids, uids, selectedMsgId);
    if (next === selectedMsgId) return;
    setSelectedMsgId(readingPane === 'off' ? null : next);
  }

  // ── Aksi tertunda dgn jendela undo 6 detik (pola Gmail) ──────────────────
  // Baris disembunyikan SEKETIKA, commit setelah timer; Urungkan (toast /
  // Ctrl+Z) membatalkan dan menampilkan kembali baris. Warna flag & snooze
  // TIDAK disentuh sampai commit (purge di onSuccess mutasi commit) — jadi
  // Urungkan mengembalikan pesan lengkap dgn warnanya.
  function scheduleDeferred({ uids, sourceFolder, targetFolderId, label, kind, commit }) {
    if (!uids || uids.length === 0) return;
    const key = `${Date.now()}-${++undoSeqRef.current}`;
    hideRows(sourceFolder, uids);
    setSelectedUids((prev) => removeUids(prev, uids));
    advanceAfterRemoval(uids);
    let undoId = null;
    const finish = () => {
      const entry = deferredRef.current.get(key);
      if (!entry) return;
      clearTimeout(entry.timer);
      deferredRef.current.delete(key);
      delete pendingTimers.current[key];
      if (undoId != null) dropUndo(undoId);
    };
    const doCommit = () => {
      if (!deferredRef.current.has(key)) return;
      finish();
      commit(); // mutasi commit meng-unhide di onSettled
    };
    const undo = () => {
      if (!deferredRef.current.has(key)) return;
      finish();
      unhideRows(sourceFolder, uids);
    };
    const timer = setTimeout(doCommit, 6000);
    pendingTimers.current[key] = timer;
    deferredRef.current.set(key, { timer, commit: doCommit, undo, targetFolderId, sourceFolder, uids, kind });
    undoId = pushUndo({ kind, undo });
    toast.undo(label, undo, 6000);
  }

  // Commit SEMUA aksi tertunda yang menuju folder tertentu — dipanggil saat
  // user membuka folder tujuan supaya pesan sudah ada di sana (tanpa ini
  // pesan "hilang" selama 6 detik).
  function flushDeferredTo(folderId) {
    for (const entry of [...deferredRef.current.values()]) {
      if (entry.targetFolderId === folderId) entry.commit();
    }
  }

  // Hapus (ke Sampah) dari folder tertentu — dipakai hasil pencarian lintas
  // folder (msg.folderId) maupun folder aktif.
  function scheduleDeleteFrom(uids, sourceFolder) {
    if (!uids || uids.length === 0 || !sourceFolder) return;
    if (!confirmDeleteEnabled) {
      // "Langsung hapus tanpa konfirmasi" — tanpa toast undo, tetap optimis.
      hideRows(sourceFolder, uids);
      setSelectedUids((prev) => removeUids(prev, uids));
      advanceAfterRemoval(uids);
      moveMutation.mutate({ uids, sourceFolder, targetFolder: trashFolder });
      return;
    }
    scheduleDeferred({
      uids, sourceFolder, targetFolderId: 'folderTrash', kind: 'delete',
      label: `${uids.length} pesan akan dipindah ke Sampah`,
      commit: () => { moveMutation.mutate({ uids, sourceFolder, targetFolder: trashFolder }); },
    });
  }

  function scheduleDelete(uids) {
    // Kunci folder ASAL saat penjadwalan — timer bisa fire SETELAH user pindah
    // folder (undo toast tetap tampil). moveMutation tanpa sourceFolder eksplisit
    // memakai selectedFolder SAAT INI → UID yang sama di folder baru (berbeda
    // pesan) ikut terhapus. UID bersifat per-folder di SOGo.
    const sourceFolder = selectedFolder;
    scheduleDeleteFrom(uids, sourceFolder);
  }

  // Pindahkan (dgn jendela undo bila SOGoConfirmDelete aktif; selain itu
  // langsung). Dipakai picker, menu konteks, drag-and-drop, arsip per-baris.
  function performMove(uids, sourceFolder, targetFolder, { kind = 'move' } = {}) {
    if (!uids || uids.length === 0 || !targetFolder) return;
    const targetId = typeof targetFolder === 'string' ? targetFolder : targetFolder.id;
    if (targetId && targetId === sourceFolder) { toast.info('Pesan sudah berada di folder itu.', 2500); return; }
    const name = (typeof targetFolder === 'object' && (targetFolder.label || targetFolder.name)) || 'folder tujuan';
    if (!confirmDeleteEnabled) {
      quickMoveMutation.mutate({ uids, sourceFolder, targetFolder });
      return;
    }
    scheduleDeferred({
      uids, sourceFolder, targetFolderId: targetId, kind,
      label: kind === 'archive' ? `${uids.length} pesan diarsipkan` : `${uids.length} pesan dipindahkan ke ${name}`,
      commit: () => { moveMutation.mutate({ uids, sourceFolder, targetFolder }); },
    });
  }

  function archiveUids(uids, sourceFolder = selectedFolder) {
    if (!archiveFolder) { toast.info('Folder Arsip tidak ditemukan.'); return; }
    performMove(uids, sourceFolder, archiveFolder, { kind: 'archive' });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  // Bersihkan entri snooze untuk pesan yang dipindah/hapus dari folder asal:
  // pesan pindah folder → UID baru di folder tujuan, entri di folder asal jadi
  // yatim dan bisa menyembunyikan pesan baru yang memakai ulang UID tsb.
  // Bump snoozeTick saat ada yang terhapus agar memo snoozedUids ter-refresh
  // (tanpa itu pesan tetap tersembunyi sampai interval 60 detik berikutnya).
  const clearSnoozesForMoved = (uids, folder = selectedFolder) => {
    if (!user?.email || !Array.isArray(uids) || uids.length === 0) return;
    const removed = unsnoozeMessages(user.email, folder, uids);
    if (removed > 0) setSnoozeTick((t) => t + 1);
  };

  // sourceFolder WAJIB eksplisit untuk operasi yang ditunda (undo-delete 6s) —
  // user bisa pindah folder sebelum timer fire. UID per-folder: memakai
  // selectedFolder saat ini akan menghapus pesan yang SALAH di folder baru.
  // Setelah pesan benar-benar hilang dari folder asal (move/junk commit):
  // koreksi badge unseen optimis, buang dari cache (tanpa flash saat baris
  // di-unhide), lalu invalidate utk sinkron server.
  const afterRemovedFromFolder = (sourceFolder, uids) => {
    adjustUnseen(sourceFolder, -countInCache(sourceFolder, uids, (m) => !m.isRead));
    removeFromCache(sourceFolder, uids);
    queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
    queryClient.invalidateQueries({ queryKey: ['unseen-per-folder', user.sogoToken] });
  };

  const moveMutation = useMutation({
    mutationFn: ({ uids, sourceFolder = selectedFolder, targetFolder }) =>
      moveMessages(user.sogoToken, sourceFolder, uids, targetFolder),
    onSuccess: (_data, vars) => {
      clearSnoozesForMoved(vars?.uids || [], vars?.sourceFolder);
      // Pindah folder = uid asal tidak berlaku lagi → buang entri flag-color
      // (uid dipakai ulang pesan lain → false positive).
      // Purge folder ASAL (move = uid di folder asal tidak berlaku lagi).
      removeFlagColorsBulk(user?.email, vars?.uids || [], vars?.sourceFolder || selectedFolder);
      afterRemovedFromFolder(vars?.sourceFolder || selectedFolder, vars?.uids || []);
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, vars?.sourceFolder || selectedFolder] });
      setSelectedUids([]);
    },
    onError: (err) => toast.error(err?.message || 'Gagal memindahkan pesan.'),
    // Baris disembunyikan optimis sejak dijadwalkan; sukses → sudah dibuang
    // dari cache, gagal → tampil kembali (rollback).
    onSettled: (_d, _e, vars) => unhideRows(vars?.sourceFolder || selectedFolder, vars?.uids || []),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      // Purge flag-color (removeFlagColorsBulk) TIDAK lagi dilakukan di sini:
      // uid baru benar-benar tidak berlaku saat COMMIT (moveMutation.onSuccess
      // memanggil removeFlagColorsBulk). Bila di-purge sebelum jendela undo,
      // "Urungkan" mengembalikan pesan TANPA warna flag (bug lama).
      // Seleksi bisa lintas folder saat pencarian global → kelompokkan.
      if (searchQuery) forEachFolderGroup(selectedUids, (folder, uids) => scheduleDeleteFrom(uids, folder));
      else scheduleDelete(selectedUids);
    },
    onSuccess: () => {
      // Pesan sudah DIJADWALKAN hapus — bersihkan seleksi sekarang (header
      // tidak boleh tetap "N dipilih"; aksi bulk berikutnya tidak boleh
      // menyentuh uid yang sedang pending delete = double-schedule / race).
      setSelectedUids([]);
    },
  });

  // Tandai dibaca/belum dibaca — optimis (cache + badge) lalu batch request
  // dgn concurrency 5; yang gagal di-rollback + toast. Seleksi dipertahankan
  // (pola Outlook: tandai lalu lanjut aksi lain).
  const bulkMarkReadMutation = useMutation({
    mutationFn: async ({ uids, folder = selectedFolder, read, fromUndo = false }) => {
      const list = (uids || []).filter((u) => u != null);
      applyReadLocal(folder, list, read);
      // markReadBulk: pool concurrency 5 + SATU bumpMailVersion per batch.
      const result = await markReadBulk(user.sogoToken, folder, list, read, { concurrency: 5 });
      const failedSet = new Set((result?.failed || []).map((f) => String(f?.uid ?? f)));
      const failed = list.filter((u) => failedSet.has(String(u)));
      if (failed.length) applyReadLocal(folder, failed, !read); // rollback sebagian
      return { failed, uids: list, folder, read, fromUndo };
    },
    onSuccess: ({ failed, uids, folder, read, fromUndo }) => {
      if (uids.length && failed.length === uids.length) {
        toast.error(read ? 'Gagal menandai dibaca.' : 'Gagal menandai belum dibaca.');
        return;
      }
      if (failed.length) toast.error(`${failed.length} dari ${uids.length} pesan gagal ditandai.`);
      const done = uids.filter((u) => !failed.includes(u));
      if (!fromUndo && done.length) {
        pushUndo({ kind: 'read', undo: () => bulkMarkReadMutation.mutate({ uids: done, folder, read: !read, fromUndo: true }) });
      }
      // Badge saja yang disinkronkan — daftar tidak di-refetch (cache sudah benar).
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
    },
    onError: (err) => toast.error(err?.message || 'Gagal menandai pesan.'),
  });

  const bulkFlagMutation = useMutation({
    mutationFn: async ({ uids, folder = selectedFolder, flagged, fromUndo = false }) => {
      const list = (uids || []).filter((u) => u != null);
      patchMessagesCache(folder, list, { isFlagged: !!flagged });
      const result = await markFlaggedBulk(user.sogoToken, folder, list, flagged, { concurrency: 5 });
      const failedSet = new Set((result?.failed || []).map((f) => String(f?.uid ?? f)));
      const failed = list.filter((u) => failedSet.has(String(u)));
      if (failed.length) patchMessagesCache(folder, failed, { isFlagged: !flagged });
      return { failed, uids: list, folder, flagged, fromUndo };
    },
    onSuccess: ({ failed, uids, folder, flagged, fromUndo }) => {
      if (uids.length && failed.length === uids.length) { toast.error('Gagal mengubah bendera.'); return; }
      if (failed.length) toast.error(`${failed.length} dari ${uids.length} pesan gagal diubah benderanya.`);
      const done = uids.filter((u) => !failed.includes(u));
      if (!fromUndo && done.length) {
        pushUndo({ kind: 'flag', undo: () => bulkFlagMutation.mutate({ uids: done, folder, flagged: !flagged, fromUndo: true }) });
      }
    },
    onError: (err) => toast.error(err?.message || 'Gagal mengubah bendera.'),
  });

  // Laporkan Spam — native SOGo markMessagesAsJunk (set flag + pindah ke Junk).
  const junkMutation = useMutation({
    mutationFn: ({ uids, folder = selectedFolder }) => markMessagesAsJunk(user.sogoToken, folder, uids),
    onMutate: (vars) => {
      hideRows(vars?.folder || selectedFolder, vars?.uids || []);
      setSelectedUids((prev) => removeUids(prev, vars?.uids || []));
      advanceAfterRemoval(vars?.uids || []);
    },
    onSuccess: (_data, vars) => {
      const src = vars?.folder || selectedFolder;
      clearSnoozesForMoved(vars?.uids || [], src);
      // Uid berhenti berlaku setelah pindah ke Junk → entri flag-color dibuang
      // (sama dgn bulkDeleteMutation / clearSnoozesForMoved).
      removeFlagColorsBulk(user?.email, vars?.uids || [], src);
      afterRemovedFromFolder(src, vars?.uids || []);
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      toast.success('Pesan dilaporkan sebagai spam');
    },
    onError: (err) => toast.error(err?.message || 'Gagal melaporkan spam.'),
    onSettled: (_d, _e, vars) => unhideRows(vars?.folder || selectedFolder, vars?.uids || []),
  });

  // Pindah LANGSUNG (tanpa jendela undo) — dipakai performMove saat
  // preferensi "langsung hapus tanpa konfirmasi" aktif.
  const quickMoveMutation = useMutation({
    mutationFn: ({ uids = selectedUids, sourceFolder = selectedFolder, targetFolder }) =>
      moveMessages(user.sogoToken, sourceFolder, uids, targetFolder),
    onMutate: (vars) => {
      hideRows(vars?.sourceFolder || selectedFolder, vars?.uids || selectedUids);
      setSelectedUids((prev) => removeUids(prev, vars?.uids || selectedUids));
      advanceAfterRemoval(vars?.uids || selectedUids);
    },
    onSuccess: (_data, vars) => {
      const src = vars?.sourceFolder || selectedFolder;
      const uids = vars?.uids || selectedUids;
      clearSnoozesForMoved(uids, src);
      removeFlagColorsBulk(user?.email, uids, src);
      afterRemovedFromFolder(src, uids);
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      toast.success('Pesan dipindahkan');
    },
    onError: (err) => toast.error(err?.message || 'Gagal memindahkan pesan.'),
    onSettled: (_d, _e, vars) => unhideRows(vars?.sourceFolder || selectedFolder, vars?.uids || selectedUids),
  });

  // Bukan Spam (folder Junk) — markMessagesAsNotJunk: laporan not-spam
  // (best-effort) + pindahkan balik ke INBOX (perilaku native SOGo).
  const notJunkMutation = useMutation({
    mutationFn: ({ uids, folder = selectedFolder }) => markMessagesAsNotJunk(user.sogoToken, folder, uids),
    onMutate: (vars) => {
      hideRows(vars?.folder || selectedFolder, vars?.uids || []);
      setSelectedUids((prev) => removeUids(prev, vars?.uids || []));
      advanceAfterRemoval(vars?.uids || []);
    },
    onSuccess: (_data, vars) => {
      const src = vars?.folder || selectedFolder;
      clearSnoozesForMoved(vars?.uids || [], src);
      removeFlagColorsBulk(user?.email, vars?.uids || [], src);
      afterRemovedFromFolder(src, vars?.uids || []);
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      toast.success('Pesan dikembalikan ke Kotak Masuk');
    },
    onError: (err) => toast.error(err?.message || 'Gagal membatalkan spam.'),
    onSettled: (_d, _e, vars) => unhideRows(vars?.folder || selectedFolder, vars?.uids || []),
  });

  // Buat subfolder — native SOGo createFolder.
  const createFolderMutation = useMutation({
    mutationFn: ({ parentId, name }) => createFolder(user.sogoToken, parentId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', user.sogoToken] });
      toast.success('Folder berhasil dibuat');
    },
    onError: (err) => toast.error(err?.message || 'Gagal membuat folder.'),
  });

  // Hapus subfolder — native SOGo delete (permanen, tanpaTrash).
  const deleteFolderMutation = useMutation({
    mutationFn: ({ folderId }) => deleteFolder(user.sogoToken, folderId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['folders', user.sogoToken] });
      // Jika folder yang dihapus sedang aktif (atau induknya), reset ke INBOX.
      if (selectedFolder === vars.folderId || selectedFolder.startsWith(`${vars.folderId}%2F`)) {
        setSelectedFolder('folderINBOX');
      }
      toast.success('Folder berhasil dihapus');
    },
    onError: (err) => toast.error(err?.message || 'Gagal menghapus folder.'),
  });

  // Tandai semua pesan di folder aktif sebagai dibaca (batch per-uid).
  // Skip pesan yang SUDAH dibaca; concurrency dibatasi (5) supaya tidak
  // membanjiri SOGo dengan puluhan request paralel (429/500/timeout — akar
  // dari "Gagal menandai semua pesan"). allSettled: kegagalan sebagian
  // tidak menggagalkan sisanya; pesan memakai jumlah yang benar.
  // folderId opsional (menu konteks folder lain): daftar pesannya diambil dulu.
  const markAllReadMutation = useMutation({
    mutationFn: async ({ folderId = selectedFolder } = {}) => {
      const unread = folderId === selectedFolder
        ? messages.filter((m) => !m.isRead)
        : ((await fetchMessages(user.sogoToken, folderId))?.messages || []).filter((m) => !m.isRead);
      if (unread.length === 0) return { total: 0, failed: 0, folderId };
      applyReadLocal(folderId, unread.map((m) => m.uid), true); // optimis
      const results = await batchWithLimit(
        unread.map((m) => () => markRead(user.sogoToken, folderId, m.uid, true)),
        5
      );
      const failedUids = unread.filter((_, i) => results[i]?.status === 'rejected').map((m) => m.uid);
      if (failedUids.length) applyReadLocal(folderId, failedUids, false); // rollback sebagian
      return { total: unread.length, failed: results.filter((r) => r.status === 'rejected').length, folderId };
    },
    onSuccess: ({ total, failed, folderId }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, folderId] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['unseen-per-folder', user.sogoToken] });
      if (total === 0) {
        toast.success('Semua pesan sudah dibaca.');
      } else if (failed === 0) {
        toast.success(`${total} pesan ditandai dibaca.`);
      } else if (failed === total) {
        toast.error('Gagal menandai semua pesan. Coba lagi.');
      } else {
        toast.error(`${total - failed} dari ${total} pesan ditandai dibaca (${failed} gagal). Coba lagi.`);
      }
    },
    onError: () => toast.error('Gagal menandai semua pesan.'),
  });

  // Arsip: pindahkan semua pesan folder aktif ke folder Archive
  // Seluruh folder → dikonfirmasi dulu (dialog dgn jumlah) sebelum dijalankan.
  const archiveMutation = useMutation({
    mutationFn: ({ uids, sourceFolder }) => {
      if (!archiveFolder) throw new Error('Folder Arsip tidak ditemukan.');
      return moveMessages(user.sogoToken, sourceFolder, uids, archiveFolder);
    },
    onMutate: (vars) => {
      hideRows(vars.sourceFolder, vars.uids);
      setSelectedUids([]);
      setSelectedMsgId(null);
    },
    onSuccess: (_data, vars) => {
      // Arsip mengubah UID pesan (UID per-folder SOGo) → entri snooze di
      // folder asal menjadi yatim; hapus agar tidak menyembunyikan pesan
      // inbox baru yang kebetulan memakai ulang UID yang sama.
      const movedUids = vars.uids;
      clearSnoozesForMoved(movedUids, vars.sourceFolder);
      // Purge flag-color folder asal juga — kelas bug sama (audit 2026-09-05).
      removeFlagColorsBulk(user?.email, movedUids, vars.sourceFolder);
      afterRemovedFromFolder(vars.sourceFolder, movedUids);
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, vars.sourceFolder] });
      toast.success(`${movedUids.length} pesan dipindahkan ke Arsip.`);
    },
    onError: (err) => toast.error(err?.message || 'Gagal mengarsipkan pesan.'),
    onSettled: (_d, _e, vars) => unhideRows(vars?.sourceFolder || selectedFolder, vars?.uids || []),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  // (isSentOrDraft dideklarasikan di atas — dipakai juga oleh conversationGroups)
  // Folder Draf (default maupun custom) — utk tombol hapus cepat per-baris.
  const isDraftFolder = selectedFolder === 'folderDrafts' ||
    folders.some((f) => f.id === selectedFolder && (f.type === 'draft' || f.type === 'drafts'));

  // Select-all hanya memilih pesan YANG TAMPIL di daftar (sudah difilter
  // oleh flag/category/unread/attachment/snooze + dipaginasi visibleCount).
  // Sebelumnya pakai `messages` (SEMUA pesan di folder) — saat user filter
  // "belum dibaca" lalu klik "Pilih Semua", SEMUA pesan terpilih termasuk
  // yang sudah dibaca → aksi bulk (tandai baca/hapus) berdampak tak terduga.
  const toggleSelectAll = () => {
    const visible = sortedMessages;
    setSelectedUids((prev) => toggleSelectAllUids(prev, visible.map((m) => m.uid)));
  };

  const toggleSelect = (uid) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  // Urutan baris yang TAMPIL (flat atau conversation) — dipakai utk range
  // select, auto-advance reader, dan navigasi keyboard. Fallback ke
  // sortedMessages bila conversation view TIDAK menghasilkan grup (semua
  // subjek unik → tiap pesan grup sendiri; sebelumnya fallback ini kosong →
  // range select / auto-advance mati di kondisi tsb).
  const visibleOrderUids = useMemo(() => {
    if (conversationView && conversationGroups.length > 0) {
      return conversationGroups.flatMap((g) => g.messages.map((m) => m.uid));
    }
    return focusOrder.map((m) => m.uid);
  }, [conversationView, conversationGroups, focusOrder]);

  // Urutan navigasi reader = semua baris TERMUAT (conversation: grup sudah
  // dibangun dari seluruh header termuat; datar: loadedFlatOrder).
  const readerOrderUids = useMemo(() => {
    if (conversationView && conversationGroups.length > 0) return visibleOrderUids;
    return loadedFlatOrder.map((m) => m.uid);
  }, [conversationView, conversationGroups, visibleOrderUids, loadedFlatOrder]);
  // Total folder (server) — hanya bermakna tanpa pencarian/filter (selain itu
  // M = jumlah termuat yang lolos filter, total folder menyesatkan).
  const readerTotalCount = !searchQuery && filteredLoadedMessages.length === messagesInWindow.length
    && totalMessageCount > readerOrderUids.length ? totalMessageCount : undefined;

  // Shift+klik = range select (pola Gmail): pilih semua antara anchor terakhir
  // dan baris yang diklik (termasuk keduanya), union dgn seleksi yang ada.
  const selectRangeFromAnchor = (uid) => {
    const anchor = lastSelectedUid.current;
    if (anchor == null || anchor === uid) {
      toggleSelect(uid);
      lastSelectedUid.current = uid;
      return;
    }
    const order = visibleOrderUids;
    const a = order.indexOf(anchor);
    const b = order.indexOf(uid);
    if (a === -1 || b === -1) {
      toggleSelect(uid);
      lastSelectedUid.current = uid;
      return;
    }
    const [from, to] = a < b ? [a, b] : [b, a];
    const rangeUids = order.slice(from, to + 1);
    setSelectedUids((prev) => {
      const next = new Set(prev);
      rangeUids.forEach((id) => next.add(id));
      return [...next];
    });
    lastSelectedUid.current = uid;
  };

  const toggleSelectMsg = (e, uid) => {
    e.stopPropagation();
    if (e.shiftKey) {
      selectRangeFromAnchor(uid);
      return;
    }
    toggleSelect(uid);
    lastSelectedUid.current = uid;
  };

  // ── Long-press (mobile) → mode seleksi ────────────────────────────────────
  function enterSelectionMode(uid) {
    setSelectionMode(true);
    toggleSelect(uid);
  }

  function handleRowTouchStart(e, uid) {
    // Sentuhan baru = intent baru; hapus sisa penekanan klik dari sentuhan lama
    suppressClick.current.delete(uid);
    const t = e.touches[0];
    longPressPos.current[uid] = { x: t.clientX, y: t.clientY };
    clearTimeout(longPressTimers.current[uid]);
    longPressTimers.current[uid] = setTimeout(() => {
      delete longPressPos.current[uid];
      longPressPending.current.add(uid);
      enterSelectionMode(uid);
    }, 450);
  }

  function handleRowTouchMove(e, uid) {
    const pos = longPressPos.current[uid];
    if (!pos) return;
    const t = e.touches[0];
    // Bergerak = scroll/swipe → batalkan long-press
    if (Math.abs(t.clientX - pos.x) > 10 || Math.abs(t.clientY - pos.y) > 10) {
      clearTimeout(longPressTimers.current[uid]);
      delete longPressPos.current[uid];
    }
  }

  function handleRowTouchEnd(uid) {
    clearTimeout(longPressTimers.current[uid]);
    delete longPressPos.current[uid];
    // Jika long-press terdeteksi pada sentuhan ini, tekan klik sintetis browser
    // (click browser tiba setelah touchend — berapa pun lama penahanan)
    if (longPressPending.current.delete(uid)) {
      suppressClick.current.add(uid);
    }
  }

  // Draft di folder Draf dibuka ke editor compose (bukan reader) agar bisa
  // dilanjutkan — isi diambil dari detail pesan, autosave menyimpan ke draft
  // baru, dan draft lama dihapus saat terkirim (lihat ComposeModal).
  async function openDraftForEdit(uid) {
    try {
      const detail = await fetchMessage(user?.sogoToken, selectedFolder, uid);
      // Restorasi lampiran draft: unduh tiap part (base64) agar ikut terkirim
      // dan tidak hilang saat autosave berikutnya. Gagal satu → lewati, jangan
      // blokir seluruh pembukaan draft.
      const restoredAttachments = [];
      const restored = await Promise.allSettled(
        // includeHidden: part inline CID (flag 0) tetap diunduh — datanya
        // dibutuhkan agar gambar tidak hilang saat draft dikirim, walau UI
        // tidak menampilkannya sebagai lampiran.
        extractAttachments(detail.parts, [], { includeHidden: true }).map(async (att) => {
          const data = await fetchAttachmentData(att.downloadURL);
          if (!data) throw new Error('tidak ada data');
          return {
            name: att.name,
            type: att.contentType || 'application/octet-stream',
            size: parseSizeToBytes(att.size) || 0,
            data,
          };
        })
      );
      for (const r of restored) {
        if (r.status === 'fulfilled') restoredAttachments.push(r.value);
        else console.warn('[Draft] Gagal merestorasi lampiran:', r.reason?.message || r.reason);
      }
      setComposeData({
        composeMode: 'draft',
        to: formatAddresses(detail.to),
        cc: formatAddresses(detail.cc),
        bcc: formatAddresses(detail.bcc),
        subject: detail.subject || '',
        body: extractHtml(detail.parts),
        draftUid: uid,
        attachments: restoredAttachments,
      });
      setComposeOpen(true);
    } catch (err) {
      console.warn('[Draft] Gagal membuka draft untuk diedit:', err);
      setSelectedMsgId(uid); // fallback: tampilkan lewat reader biasa
    }
  }

  // Cari header pesan di daftar tampil (termasuk hasil lintas folder) atau
  // daftar folder aktif; folder asal = msg.folderId (hasil pencarian global)
  // atau folder aktif.
  const findMsg = (uid) => sortedMessages.find((m) => m.uid === uid) || messages.find((m) => m.uid === uid) || null;
  const folderOfUid = (uid) => findMsg(uid)?.folderId || selectedFolder;
  // Jalankan aksi per kelompok folder (target bisa campur folder saat search
  // global) — fn(folderId, uids).
  function forEachFolderGroup(uids, fn) {
    const groups = new Map();
    for (const uid of uids || []) {
      const f = folderOfUid(uid);
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f).push(uid);
    }
    for (const [f, list] of groups) fn(f, list);
  }

  function openMessage(uid) {
    // Draft: buka editor compose untuk dilanjutkan, bukan reader baca-saja.
    if (isDraftFolder) { openDraftForEdit(uid); return; }
    setSelectedMsgId(uid);
  }

  function openMovePicker(uids, pos) {
    if (!uids || uids.length === 0) return;
    setCtxMenu(null);
    setMovePicker({ uids, sourceFolder: folderOfUid(uids[0]), x: pos?.x, y: pos?.y });
  }

  // Klik pada BARIS (pola Outlook — logika di lib/mailSelection.js):
  // klik = buka + fokus; Ctrl/Cmd+klik = toggle multi; Shift+klik = rentang.
  function handleRowClick(e, uid, idx = -1) {
    // Klik sintetis browser setelah long-press — jangan buka/toggle dobel
    if (suppressClick.current.delete(uid)) return;
    if (selectionMode) {
      toggleSelect(uid); // di mode seleksi, tap = toggle pilihan (pola Gmail)
      return;
    }
    const r = resolveRowClick(
      { selected: selectedUids, anchor: lastSelectedUid.current, current: selectedMsgId },
      uid,
      { ctrl: e?.ctrlKey, meta: e?.metaKey, shift: e?.shiftKey },
      visibleOrderUids
    );
    lastSelectedUid.current = r.anchor;
    if (idx >= 0) setFocusIdx(idx);
    if (r.open == null) { setSelectedUids(r.selected); return; }
    if (selectedUids.length > 0) setSelectedUids([]);
    // Draft: buka editor compose untuk dilanjutkan, bukan reader baca-saja.
    if (isDraftFolder) {
      openDraftForEdit(uid);
      return;
    }
    setSelectedMsgId(uid);
  }

  // Klik kanan pada baris: baris yang belum terpilih menjadi target tunggal
  // (seleksi multi lama dibuang — perilaku Outlook); baris yang sudah ada di
  // seleksi → menu berlaku utk seluruh seleksi.
  function handleRowContextMenu(e, msg, idx = -1) {
    e.preventDefault();
    e.stopPropagation();
    const uid = msg.uid;
    let uids;
    if (selectedUids.includes(uid)) {
      uids = selectedUids;
    } else {
      uids = [uid];
      if (selectedUids.length > 0) setSelectedUids([]);
    }
    lastSelectedUid.current = uid;
    if (idx >= 0) setFocusIdx(idx);
    setCtxMenu({ kind: 'message', x: e.clientX, y: e.clientY, uids, msg });
  }

  function handleFolderContextMenu(e, folder) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ kind: 'folder', x: e.clientX, y: e.clientY, folder });
  }

  // ── Drag-and-drop pesan → folder (HTML5 DnD, desktop) ─────────────────────
  const DND_TYPE = 'application/x-pcp-mail';
  const dragImageRef = useRef(null);
  function handleRowDragStart(e, msg) {
    const uids = selectedUids.includes(msg.uid) ? selectedUids : [msg.uid];
    const payload = { uids, sourceFolder: msg.folderId || selectedFolder };
    try {
      e.dataTransfer.setData(DND_TYPE, JSON.stringify(payload));
      e.dataTransfer.setData('text/plain', `${uids.length} pesan`);
      e.dataTransfer.effectAllowed = 'move';
    } catch { /* browser lama */ }
    // Drag image: badge jumlah pesan (dibuang setelah browser mengambil snapshot).
    try {
      const ghost = document.createElement('div');
      ghost.textContent = uids.length > 1 ? `${uids.length} pesan` : (msg.subject || '1 pesan');
      ghost.setAttribute('style', 'position:fixed;top:-1000px;left:-1000px;padding:6px 12px;border-radius:9999px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font:600 12px system-ui;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 12px rgba(0,0,0,.25)');
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 16, 16);
      dragImageRef.current = ghost;
      setTimeout(() => { ghost.remove(); if (dragImageRef.current === ghost) dragImageRef.current = null; }, 0);
    } catch { /* abaikan */ }
    setDragging(true);
  }
  function handleRowDragEnd() { setDragging(false); setDropTargetId(null); }
  const [dragging, setDragging] = useState(false);
  const [dropTargetId, setDropTargetId] = useState(null);
  function readDropPayload(e) {
    try {
      const raw = e.dataTransfer.getData(DND_TYPE);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return Array.isArray(p?.uids) && p.uids.length ? p : null;
    } catch { return null; }
  }
  function handleFolderDragOver(e, folder) {
    if (!dragging && !Array.from(e.dataTransfer?.types || []).includes(DND_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetId !== folder.id) setDropTargetId(folder.id);
  }
  function handleFolderDrop(e, folder) {
    e.preventDefault();
    setDropTargetId(null);
    setDragging(false);
    const payload = readDropPayload(e);
    if (!payload) return;
    performMove(payload.uids, payload.sourceFolder, folder);
  }

  // Quick reply — ambil detail pesan & langsung buka compose (pola Gmail:
  // klik Reply di baris email tanpa buka reader). Fetch detail perlu utk
  // memperoleh body, from, dan reply-to (header /view hanya punya ringkasan).
  // Balas / Balas Semua / Teruskan dari daftar, menu konteks, atau pintasan —
  // data compose disusun lib/replyBuilder (threading In-Reply-To/References,
  // lampiran utk teruskan). Toast "Menyiapkan…" tampil selama fetch.
  async function openReplyFor(uid, mode = 'reply', folder = selectedFolder) {
    if (replyBusy) return;
    setReplyBusy({ uid, mode });
    const toastId = toast.info(mode === 'forward' ? 'Menyiapkan teruskan…' : 'Menyiapkan balasan…', 15000);
    try {
      const detail = await fetchMessage(user?.sogoToken, folder, uid);
      // Sanitasi di SUMBER (bukan bergantung pada editor tujuan): body email
      // adalah input pengirim. Jalur MessageReader membersihkan via
      // prepareHtmlContent sebelum dipakai, tetapi jalur ini menyuntik ke
      // compose — editor hanya mensanitasi SETELAH user mengetik (dirtyRef),
      // jadi quote dari email berbahaya bisa lolos utuh ke textarea "HTML
      // Source" atau strip plain-text. PURIFY_CONFIG = config yang sama
      // dipakai editor compose & chokepoint sendMessage.
      const bodyHtml = DOMPurify.sanitize(extractHtml(detail.parts) || '', PURIFY_CONFIG);
      const data = await buildReplyDataAsync(user?.sogoToken, folder, uid, {
        mode, userEmail: user?.email, folderId: folder, uid, message: detail, bodyHtml,
      });
      setComposeData(data);
      setComposeOpen(true);
    } catch (err) {
      console.warn('[QuickReply] Gagal memuat pesan:', err?.message || err);
      toast.error(mode === 'forward' ? 'Gagal menyiapkan teruskan.' : 'Gagal membuka balasan cepat.');
    } finally {
      useToastStore.getState().removeToast(toastId);
      setReplyBusy(null);
    }
  }
  const quickReply = (uid, folder = selectedFolder) => openReplyFor(uid, 'reply', folder);

  // Search submit handler — pake server-side search
  function handleSearchSubmit(e) {
    e.preventDefault();
    // Reset filter kategori — tab kategori disembunyikan saat search (lihat
    // render), jadi filter yang tersisa akan menyaring hasil secara tak terlihat
    // tanpa cara membersihkannya. Search = pencarian global di folder.
    setCategoryFilter(null);
    setSearchQuery(searchInput.trim());
  }

  // Cari semua email dari satu pengirim (klik nama pengirim di baris)
  function searchBySender(senderText, e) {
    if (e) e.stopPropagation();
    const match = String(senderText || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    const email = match ? match[0] : senderText;
    setCategoryFilter(null); // sama seperti handleSearchSubmit (filter tak terlihat saat search)
    setSearchInput(email);
    setSearchQuery(email);
    setSearchCriteria('from');
  }

  // ── Keyboard Shortcuts ─────────────────────────────────────────────────────
  // Resolusi tombol → aksi ada di src/lib/keymap.js (murni, teruji); di sini
  // hanya eksekusi. Handler disimpan di ref SETIAP render → listener global
  // selalu memanggil closure terbaru (bug lama: dependency array basi —
  // archiveFolder/selectedFolder/searchQuery tidak ada di deps).
  function runShortcut({ action, step }, { targetUids, focusedMsg }) {
    const A = MAIL_ACTIONS;
    switch (action) {
      case A.HELP: setKeyboardHelpOpen(true); break;
      case A.CLOSE_MODAL:
        // Compose/menu konteks/picker/dialog folder/QuickRule menangani Esc
        // sendiri; sisanya ditutup di sini.
        if (keyboardHelpOpen) setKeyboardHelpOpen(false);
        else if (archiveConfirmOpen) setArchiveConfirmOpen(false);
        else if (pendingOpen) setPendingOpen(false);
        break;
      case A.ESCAPE:
        if (selectedMsgId) setSelectedMsgId(null); // reader juga menutup — idempoten
        else if (selectionMode) { setSelectionMode(false); setSelectedUids([]); }
        else if (selectedUids.length > 0) setSelectedUids([]);
        else if (searchQuery) clearSearch();
        break;
      case A.FOCUS_SEARCH:
        searchInputRef.current?.focus();
        searchInputRef.current?.select?.();
        break;
      case A.COMPOSE: setComposeData(null); setComposeOpen(true); break;
      case A.SELECT_ALL:
        // Pakai sortedMessages (bukan messages) supaya konsisten dgn
        // toggleSelectAll — 'Pilih Semua' hanya pilih yang TAMPIL.
        setSelectedUids((prev) => toggleSelectAllUids(prev, sortedMessages.map((m) => m.uid)));
        break;
      case A.MOVE_FOCUS: {
        const openIdx = selectedMsgId != null ? focusOrder.findIndex((m) => m.uid === selectedMsgId) : -1;
        const next = nextFocusIndex(focusIdx, step, focusOrder.length, openIdx);
        if (next < 0) break;
        setFocusIdx(next);
        const msg = focusOrder[next];
        // Panah/j/k membuka pesan di panel baca (Outlook). Tidak di folder
        // Draf (draf dibuka ke compose lewat Enter) & tidak saat reading
        // pane mati (Enter/o yang membuka tampilan penuh).
        if (msg && readingPane !== 'off' && !isDraftFolder && !selectionMode) setSelectedMsgId(msg.uid);
        break;
      }
      case A.OPEN: {
        const uid = focusedMsg?.uid ?? selectedMsgId ?? targetUids[0];
        if (uid != null) openMessage(uid);
        break;
      }
      case A.DELETE: forEachFolderGroup(targetUids, (folder, uids) => scheduleDeleteFrom(uids, folder)); break;
      case A.MARK_READ: forEachFolderGroup(targetUids, (folder, uids) => bulkMarkReadMutation.mutate({ uids, folder, read: true })); break;
      case A.MARK_UNREAD: forEachFolderGroup(targetUids, (folder, uids) => bulkMarkReadMutation.mutate({ uids, folder, read: false })); break;
      case A.TOGGLE_FLAG: {
        const first = findMsg(targetUids[0]);
        const flagged = !first?.isFlagged;
        forEachFolderGroup(targetUids, (folder, uids) => bulkFlagMutation.mutate({ uids, folder, flagged }));
        break;
      }
      case A.ARCHIVE: forEachFolderGroup(targetUids, (folder, uids) => archiveUids(uids, folder)); break;
      case A.SPAM_TOGGLE:
        forEachFolderGroup(targetUids, (folder, uids) =>
          (folder === 'folderJunk' ? notJunkMutation : junkMutation).mutate({ uids, folder })
        );
        break;
      case A.MOVE_PICKER: openMovePicker(targetUids); break;
      case A.REPLY:
      case A.REPLY_ALL:
      case A.FORWARD: {
        const uid = focusedMsg?.uid ?? selectedMsgId ?? targetUids[0];
        if (uid != null) openReplyFor(uid, action, folderOfUid(uid));
        break;
      }
      case A.UNDO: undoLast(); break;
      // Fallback: normalnya Ctrl/Cmd+K sudah ditangkap AppLayout di fase capture.
      case A.OPEN_PALETTE: window.dispatchEvent(new CustomEvent('pcp:open-palette')); break;
      default: break;
    }
  }

  const keyHandlerRef = useRef(null);
  keyHandlerRef.current = (e) => {
    // Skip jika user sedang mengetik di input/textarea/editor
    const tag = e.target?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.contentEditable === 'true') {
      // Kecuali '/' untuk search — pake ctrl+/ atau command+/
      if (e.key === '/' && e.ctrlKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      // Jangan curi kombinasi browser/OS di dalam input (cmd/ctrl+C copy,
      // cmd/ctrl+A select-all teks, dll) — kombo tetap perilaku asli.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Escape untuk blur input
      if (e.key === 'Escape') {
        e.target.blur();
        return;
      }
      return;
    }

    // Modal apa pun yang menutupi layar → shortcut pesan dibungkam
    // (bug audit 2026-09-07: dulu hanya compose+help — modal Buat/Hapus
    // Subfolder & QuickRule masih bolong, tekan 'd' = bulk delete di
    // belakang modal). Menu konteks & picker punya handler keyboard sendiri.
    const modalOpen = composeOpen || keyboardHelpOpen || !!folderDialog || !!quickRuleMsg
      || archiveConfirmOpen || !!movePicker || !!ctxMenu || pendingOpen;
    const focusedMsg = focusIdx >= 0 ? focusOrder[focusIdx] : null;
    // Target aksi: seleksi multi → kalau tidak, baris fokus → pesan terbuka
    // (FIX: s/u/x/d/e dulu hanya membaca selectedUids).
    const targetUids = resolveTargetUids({ selected: selectedUids, focusedUid: focusedMsg?.uid, openUid: selectedMsgId });
    const resolved = resolveMailShortcut(e, {
      inInput: false,
      modalOpen,
      readerOpen: !!selectedMsgId,
      hasSelection: selectedUids.length > 0,
      hasTarget: targetUids.length > 0,
      listLength: focusOrder.length,
    });
    // null = kombinasi browser/OS (cmd+C, cmd+shift+R, …) atau milik reader →
    // biarkan perilaku asli.
    if (!resolved) return;
    e.preventDefault();
    runShortcut(resolved, { targetUids, focusedMsg });
  };
  useEffect(() => {
    const handler = (ev) => keyHandlerRef.current?.(ev);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Palet perintah (AppLayout) → aksi mail ─────────────────────────────────
  // SATU listener CustomEvent 'pcp:palette' memetakan detail.action ke handler
  // yang SUDAH ada (tanpa alur baru; dialog konfirmasi tetap berlaku). Handler
  // disimpan di ref tiap render (pola keyHandlerRef) agar closure tidak basi.
  const paletteActionRef = useRef(null);
  paletteActionRef.current = (detail) => {
    switch (detail?.action) {
      case 'compose': setComposeData(null); setComposeOpen(true); break;
      case 'focus-search':
        searchInputRef.current?.focus();
        searchInputRef.current?.select?.();
        break;
      case 'goto-folder': if (detail.folderId) selectFolder(detail.folderId); break;
      case 'mark-all-read':
        if (!markAllReadMutation.isPending) markAllReadMutation.mutate({ folderId: selectedFolder });
        break;
      case 'refresh':
        queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, selectedFolder], refetchType: 'active' });
        queryClient.invalidateQueries({ queryKey: ['unseen', user?.sogoToken] });
        queryClient.invalidateQueries({ queryKey: ['unseen-per-folder', user?.sogoToken] });
        break;
      case 'toggle-conversation': setConversationView(!conversationView); break;
      case 'open-shortcuts': setKeyboardHelpOpen(true); break;
      default: break;
    }
  };
  useEffect(() => {
    const onPalette = (e) => paletteActionRef.current?.(e.detail);
    window.addEventListener('pcp:palette', onPalette);
    return () => window.removeEventListener('pcp:palette', onPalette);
  }, []);

  // Fokus TIDAK di-reset saat panjang daftar berubah (bug lama: hapus baris
  // via keyboard → fokus hilang). Reset hanya saat ganti folder/search (lihat
  // effect reset di atas); indeks di luar jangkauan dijepit oleh effect clamp.

  // Scroll message into view when focusIdx changes
  const msgRefs = useRef({});
  useEffect(() => {
    if (focusIdx >= 0) {
      const msg = focusOrder[focusIdx];
      if (msg) {
        const el = msgRefs.current[msg.uid];
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          // Roving focus: bila fokus DOM sedang di baris lain (navigasi
          // keyboard / Shift+F10), pindahkan ke baris baru agar pembaca layar
          // & menu konteks keyboard mengikuti.
          const active = document.activeElement;
          if (active && active !== el && active.hasAttribute?.('data-mail-row')) {
            try { el.focus({ preventScroll: true }); } catch { /* abaikan */ }
          }
        }
      }
    }
  }, [focusIdx, focusOrder]);

  // ── Render ─────────────────────────────────────────────────────────────────
  // Jumlah filter aktif (belum-dibaca/lampiran/kategori/bintang) — dipakai
  // empty-state pintar & tombol reset.
  const activeFilterCount = [
    unreadOnly, hasAttachmentOnly, !!categoryFilter, !!flagFilter,
  ].filter(Boolean).length;

  // Pesan yang sedang dibuka di reader — dipakai utk menerka folder asal
  // hasil pencarian lintas folder (reader butuh folder yg benar).
  const activeMessage = useMemo(
    () => searchEffectiveMessages.find((m) => m.uid === selectedMsgId)
      || (sortedMessages || []).find((m) => m.uid === selectedMsgId)
      || null,
    [searchEffectiveMessages, sortedMessages, selectedMsgId]
  );

  const resetAllFilters = () => {
    setUnreadOnly(false);
    setHasAttachmentOnly(false);
    setCategoryFilter(null);
    setFlagFilter(null);
  };

  // Bersihkan pencarian lengkap: input, hasil global, state scope.
  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
    setGlobalResults(null);
    setSearchedAll(false);
  };

  const selectedFolderMeta = folders.find((f) => f.id === selectedFolder) || {
    label: selectedFolder,
    type: 'custom',
  };

  // Tombol bulk dinonaktifkan selama ada mutasi bulk berjalan (pending state).
  const bulkBusy = bulkMarkReadMutation.isPending || bulkFlagMutation.isPending
    || junkMutation.isPending || notJunkMutation.isPending || quickMoveMutation.isPending;

  // Pindah folder: commit aksi tertunda yang menuju folder itu, reset
  // pencarian DAN semua filter (bug lama: kategori/belum-dibaca/lampiran
  // tertinggal saat ganti folder → daftar tersaring diam-diam).
  function selectFolder(folderId) {
    flushDeferredTo(folderId);
    setSelectedFolder(folderId);
    resetAllFilters();
    setFolderPanelOpen(false);
    setSearchQuery('');
    setSearchInput('');
  }

  // Bendera dari menu konteks: set warna (localStorage, folder-scoped) +
  // pastikan flag aktif. keepColor=true → hanya pastikan flag (tanpa warna).
  function setFlagForUids(uids, colorKey, keepColor = false) {
    const unflagged = [];
    for (const uid of uids) {
      const f = folderOfUid(uid);
      if (!keepColor) setFlagColorOf(uid, colorKey, f);
      if (!findMsg(uid)?.isFlagged) unflagged.push(uid);
    }
    forEachFolderGroup(unflagged, (folder, list) => bulkFlagMutation.mutate({ uids: list, folder, flagged: true }));
    setFlagTick((t) => t + 1);
  }
  function clearFlagForUids(uids) {
    const flagged = [];
    for (const uid of uids) {
      setFlagColorOf(uid, null, folderOfUid(uid));
      if (findMsg(uid)?.isFlagged) flagged.push(uid);
    }
    forEachFolderGroup(flagged, (folder, list) => bulkFlagMutation.mutate({ uids: list, folder, flagged: false }));
    setFlagTick((t) => t + 1);
  }

  // Item menu konteks baris pesan (urutan ala Outlook).
  const buildMessageMenuItems = (menu) => {
    const { uids, msg } = menu;
    const n = uids.length;
    const single = n === 1;
    const folder = msg.folderId || selectedFolder;
    const anyUnread = uids.some((u) => !findMsg(u)?.isRead);
    const isJunk = folder === 'folderJunk';
    const pos = { x: menu.x, y: menu.y };
    return [
      { id: 'open', label: single ? 'Buka' : `Buka (${n} pesan terpilih)`, icon: MailOpen, disabled: !single, shortcut: '↵', onSelect: () => openMessage(msg.uid) },
      { id: 'reply', label: 'Balas', icon: Reply, disabled: !single, shortcut: 'Ctrl+R', onSelect: () => openReplyFor(msg.uid, 'reply', folder) },
      { id: 'replyAll', label: 'Balas Semua', icon: ReplyAll, disabled: !single, shortcut: 'Ctrl+Shift+R', onSelect: () => openReplyFor(msg.uid, 'replyAll', folder) },
      { id: 'forward', label: 'Teruskan', icon: Forward, disabled: !single, shortcut: 'Ctrl+F', onSelect: () => openReplyFor(msg.uid, 'forward', folder) },
      // Cari per pengirim — dulu lewat klik nama di baris (membajak klik
      // "buka pesan"); kini hanya di menu konteks. Folder Terkirim/Draf
      // menampilkan penerima, bukan pengirim → item disembunyikan.
      ...(!isSentOrDraft && single && msg.from
        ? [{ id: 'searchSender', label: 'Cari email dari pengirim ini', icon: Search, onSelect: () => searchBySender(msg.from) }]
        : []),
      ...(single
        ? [{ id: 'createRule', label: 'Buat aturan…', icon: Filter, onSelect: () => setQuickRuleMsg({ ...msg, folderId: folder }) }]
        : []),
      { separator: true },
      anyUnread
        ? { id: 'read', label: single ? 'Tandai dibaca' : `Tandai ${n} dibaca`, icon: MailOpen, shortcut: 'Ctrl+Q', onSelect: () => forEachFolderGroup(uids, (f, l) => bulkMarkReadMutation.mutate({ uids: l, folder: f, read: true })) }
        : { id: 'unread', label: single ? 'Tandai belum dibaca' : `Tandai ${n} belum dibaca`, icon: Mail, shortcut: 'Ctrl+U', onSelect: () => forEachFolderGroup(uids, (f, l) => bulkMarkReadMutation.mutate({ uids: l, folder: f, read: false })) },
      {
        id: 'flag', label: 'Bendera', icon: Flag, shortcut: 'Ctrl+Shift+G',
        children: [
          ...FLAG_COLOR_KEYS.map((key) => ({
            id: `flag-${key}`, label: FLAG_COLORS[key].label, dot: FLAG_COLORS[key].bg,
            checked: single && flagColorOf(msg.uid, folder) === key,
            onSelect: () => setFlagForUids(uids, key),
          })),
          { separator: true },
          { id: 'flag-plain', label: 'Bendera tanpa warna', icon: Star, onSelect: () => setFlagForUids(uids, null, true) },
          { id: 'flag-clear', label: 'Hapus bendera', icon: StarOff, onSelect: () => clearFlagForUids(uids) },
        ],
      },
      ...(folder === 'folderINBOX' && single
        ? [{ id: 'snooze', label: 'Tunda', icon: Clock, children: SNOOZE_PRESETS.map((p) => ({ id: `snooze-${p.id}`, label: p.label, onSelect: () => handleSnooze(msg.uid, p.hours) })) }]
        : []),
      { separator: true },
      { id: 'move', label: 'Pindahkan ke…', icon: FolderInput, shortcut: 'Ctrl+Shift+V', onSelect: () => openMovePicker(uids, pos) },
      ...(archiveFolder && folder !== archiveFolder.id
        ? [{ id: 'archive', label: 'Arsip', icon: Archive, shortcut: 'e', onSelect: () => forEachFolderGroup(uids, (f, l) => archiveUids(l, f)) }]
        : []),
      isJunk
        ? { id: 'notjunk', label: 'Bukan spam', icon: ShieldCheck, onSelect: () => forEachFolderGroup(uids, (f, l) => notJunkMutation.mutate({ uids: l, folder: f })) }
        : { id: 'junk', label: 'Spam', icon: AlertTriangle, onSelect: () => forEachFolderGroup(uids, (f, l) => junkMutation.mutate({ uids: l, folder: f })) },
      { id: 'delete', label: single ? 'Hapus' : `Hapus ${n} pesan`, icon: Trash2, danger: true, shortcut: 'Del', onSelect: () => forEachFolderGroup(uids, (f, l) => scheduleDeleteFrom(l, f)) },
    ];
  };

  // Item menu konteks baris folder.
  const buildFolderMenuItems = (folder) => {
    const isDefault = isProtectedFolder(folder); // folder sistem SOGo (termasuk Templates) tidak bisa dihapus
    const isFav = favoriteSet.has(folder.id);
    return [
      { id: 'open', label: 'Buka folder', icon: Folder, onSelect: () => selectFolder(folder.id) },
      { id: 'sub', label: 'Buat subfolder', icon: FolderPlus, onSelect: () => setFolderDialog({ mode: 'create', parent: folder }) },
      { id: 'readall', label: 'Tandai semua dibaca', icon: CheckCheck, disabled: markAllReadMutation.isPending, onSelect: () => markAllReadMutation.mutate({ folderId: folder.id }) },
      { id: 'fav', label: isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit', icon: isFav ? StarOff : Star, checked: isFav, onSelect: () => toggleFavorite(folder.id) },
      { separator: true },
      { id: 'del', label: 'Hapus folder', icon: Trash2, danger: true, disabled: isDefault, onSelect: () => setFolderDialog({ mode: 'delete', folder }) },
    ];
  };

  // Message row renderer (shared by flat list & conversation groups)
  const renderMessageRow = (msg, idx = -1, nested = false) => {
    // Folder asal baris: hasil pencarian lintas folder membawa folderId
    // sendiri — SEMUA aksi baris & key React memakai rowFolder, bukan folder aktif.
    const rowFolder = msg.folderId || selectedFolder;
    const isActive = selectedMsgId === msg.uid;
    const isSelected = selectedUids.includes(msg.uid);
    const isFocused = !conversationView && focusIdx === idx;
    // Di dalam percakapan, garis kiri berasal dari thread line wrapper
    // (border-l-2). Baris tidak memakai border-l-4 sendiri → tidak ada
    // dua garis kiri yang bertumpuk; aktif cukup ditandai bg + teks.
    const leftBorderCls = nested ? '' : 'border-l-2 ';
    const activeCls = nested
      ? (isActive ? 'bg-muted/80' : isFocused ? 'bg-muted/30' : '')
      : (isActive ? 'bg-muted border-primary' : isFocused ? 'border-primary/40 bg-muted/30' : 'border-transparent');
    // Nama yang ditampilkan — dipakai juga untuk inisial avatar
    const senderLabel = isSentOrDraft ? (msg.to || '(Tanpa Penerima)') : (msg.from || 'Unknown Sender');
    // Baris anak percakapan (nested): tampilkan NAMA saja ala Outlook —
    // kutip pembungkus dibuang, alamat email disembunyikan (header thread
    // sudah membawa subjek + konteks; baris anak cukup nama + waktu).
    // Baris datar (non-thread) juga ala Outlook: NAMA saja, alamat lengkap di
    // title (hover). Fallback ke alamat/raw bila nama kosong.
    let displayLabel = senderLabel;
    {
      const parsed = parseAddressList(senderLabel);
      displayLabel = isSentOrDraft
        ? (formatRecipientSummary(parsed, { max: 2 }) || '(Tanpa Penerima)')
        : (parsed[0]?.name || parsed[0]?.email || senderLabel);
    }
    const colorKey = flagColorOf(msg.uid, rowFolder);
    const hasFlag = !!msg.isFlagged || !!colorKey;
    // Lightweight phishing check: From/Reply-To domain mismatch (hanya header, tanpa body)
    // NOTE: sengaja TANPA useMemo — renderMessageRow bukan React component,
    // useMemo di sini melanggar Rules of Hooks (causes React #310).
    let phishingCheck = null;
    if (!isSentOrDraft && msg['reply-to']) {
      const fromStr = formatAddresses(msg.from || '');
      const replyToStr = formatAddresses(msg['reply-to']);
      const fromDomain = (fromStr.match(/@([a-zA-Z0-9.-]+)/) || [])[1] || '';
      const replyDomain = (replyToStr.match(/@([a-zA-Z0-9.-]+)/) || [])[1] || '';
      if (fromDomain && replyDomain && fromDomain.toLowerCase() !== replyDomain.toLowerCase()) {
        phishingCheck = { level: 'low', finding: `From/Reply-To berbeda: ${fromDomain} vs ${replyDomain}` };
      }
    }
    // Kontrol floating (checkbox + star) menimpa avatar — tidak makan ruang baris.
    // Desktop: muncul saat hover. Layar sentuh: star selalu tampil, checkbox saat mode seleksi.
    const checkboxVisible = isSelected || (isTouch && selectionMode);
    const starVisible = hasFlag || isTouch;
    // Nama aksesibel baris: "<pengirim>, <subjek>, <waktu>, belum dibaca".
    const rowAriaLabel = buildRowAriaLabel({
      sender: displayLabel,
      subject: typeof msg.subject === 'string' ? msg.subject : '',
      date: msg.date,
      unread: !msg.isRead,
      flagged: hasFlag,
      hasAttachment: !!msg.hasAtt,
    });
    // Tombol aksi hover: abaikan klik ganda/tripel (klik ke-2 dobel-klik
    // baris dulu mendarat di "Balas cepat" → compose terbuka tak sengaja).
    // detail 0 = aktivasi keyboard (Enter/Spasi) → tetap diizinkan.
    const stopDbl = (e) => { e.stopPropagation(); e.preventDefault(); };
    const isDeliberateClick = (e) => e.detail <= 1;
    // Roving: aksi hover hanya bisa di-Tab dari baris yang sedang fokus.
    const actionTab = isFocused ? 0 : -1;
    const renderStarButton = (tabIndex) => (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setFlagPickerOpen(flagPickerOpen?.msgUid === msg.uid ? null : { msgUid: msg.uid, x: e.clientX, y: e.clientY });
        }}
        onDoubleClick={stopDbl}
        tabIndex={tabIndex}
        className={`p-1.5 rounded-md transition-colors ${
          starVisible ? '' : 'text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400'
        }`}
        aria-label="Tandai penting"
      >
        {(() => {
          if (colorKey && FLAG_COLORS[colorKey]) {
            return <Star size={14} className={`${FLAG_COLORS[colorKey].text} ${FLAG_COLORS[colorKey].fill}`} />;
          }
          if (msg.isFlagged) {
            return <Star size={14} className="text-amber-600 fill-amber-600 dark:text-amber-400 dark:fill-amber-400" />;
          }
          return <Star size={14} className="text-muted-foreground" />;
        })()}
      </button>
    );

    return (
      <SwipeableRow
        key={`${rowFolder}:${msg.uid}`}
        onSwipe={() => suppressClick.current.add(msg.uid)}
        onSwipeLeft={() => {
          // Inbox: swipe kiri = reply. Folder lain: swipe kiri = hapus.
          if (rowFolder === 'folderINBOX') {
            quickReply(msg.uid, rowFolder);
          } else {
            scheduleDeleteFrom([msg.uid], rowFolder);
          }
        }}
        onSwipeRight={() => bulkMarkReadMutation.mutate({ uids: [msg.uid], folder: rowFolder, read: true })}
        labelLeft={rowFolder === 'folderINBOX' ? 'Balas' : 'Hapus'}
        iconLeft={rowFolder === 'folderINBOX' ? Reply : Trash}
      >
        <div
          onClick={(e) => handleRowClick(e, msg.uid, idx)}
          onContextMenu={(e) => handleRowContextMenu(e, msg, idx)}
          onMouseEnter={() => schedulePrefetchMessage(msg.uid, rowFolder)}
          onMouseLeave={cancelPrefetchMessage}
          draggable={!isTouch}
          onDragStart={(e) => handleRowDragStart(e, msg)}
          onDragEnd={handleRowDragEnd}
          // Roving tabindex: baris fokus bisa menerima fokus DOM (Shift+F10
          // membuka menu konteks, pembaca layar mengikuti navigasi panah).
          tabIndex={isFocused ? 0 : -1}
          role="button"
          aria-label={rowAriaLabel}
          data-mail-row={msg.uid}
          data-selected={isSelected || isActive || undefined}
          onFocus={() => { if (idx >= 0 && focusIdx !== idx) setFocusIdx(idx); }}
          ref={(el) => { if (idx >= 0) msgRefs.current[msg.uid] = el; }}
          onTouchStart={(e) => handleRowTouchStart(e, msg.uid)}
          onTouchMove={(e) => handleRowTouchMove(e, msg.uid)}
          onTouchEnd={() => handleRowTouchEnd(msg.uid)}
          onTouchCancel={() => handleRowTouchEnd(msg.uid)}
          className={`mail-row group w-full flex items-start text-left ${nested ? 'px-3 py-2 min-h-11' : ROW_PAD_CLS} hover:bg-muted/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${leftBorderCls}select-none [-webkit-touch-callout:none] ${activeCls} ${isSelected ? 'bg-primary/10' : ''} ${replyBusy?.uid === msg.uid ? 'opacity-70' : ''}`}
        >
          {/* Avatar — saat hover/seleksi diganti checkbox (pola Gmail, tidak menumpuk).
              Baris anak percakapan: avatar 24px (lebih ringkas, konteks di header). */}
          <div className={`relative ${nested ? 'w-6 h-6' : 'w-8 h-8'} shrink-0 mr-2 mt-0.5`}>
            <div className={`absolute inset-0 rounded-full overflow-hidden transition-opacity duration-150 ${
              checkboxVisible ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
            }`}>
              <Avatar name={senderLabel} size="sm" className={nested ? 'w-6! h-6! text-[10px]!' : ''} />
            </div>
            <button
              onClick={(e) => toggleSelectMsg(e, msg.uid)}
              tabIndex={checkboxVisible ? 0 : -1}
              className={`absolute inset-0 flex items-center justify-center rounded-full bg-background border border-border shadow-sm transition-opacity duration-150 ${
                checkboxVisible
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
              }`}
              aria-label="Pilih pesan"
            >
              {isSelected ? (
                <CheckSquare size={nested ? 13 : 15} className="text-primary" />
              ) : (
                <Square size={nested ? 13 : 15} className="text-muted-foreground" />
              )}
            </button>

            {flagPickerOpen?.msgUid === msg.uid && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFlagPickerOpen(null)} />
                <div
                  className="fixed z-50 bg-card border border-border shadow-md rounded-lg p-2 flex gap-1.5"
                  style={{ left: Math.min(flagPickerOpen.x, window.innerWidth - 200), top: Math.min(flagPickerOpen.y, window.innerHeight - 80) }}
                >
                  {FLAG_COLOR_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentColor = flagColorOf(msg.uid, rowFolder);
                        const nextColor = currentColor === key ? null : key;
                        setFlagColorOf(msg.uid, nextColor, rowFolder);
                        // Set warna → tandai sebagai flagged (star aktif).
                        // Kalau set warna NULL, flag tetap aktif (user bisa punya
                        // star tanpa warna — sama seperti Outlook).
                        if (!msg.isFlagged) {
                          bulkFlagMutation.mutate({ uids: [msg.uid], folder: rowFolder, flagged: true });
                        }
                        setFlagTick((t) => t + 1);
                        setFlagPickerOpen(null);
                      }}
                      className={`w-9 h-9 rounded-full ${FLAG_COLORS[key].bg} hover:scale-110 transition-transform ${
                        flagColorOf(msg.uid, rowFolder) === key ? 'ring-2 ring-offset-2 ring-border' : ''
                      }`}
                      title={FLAG_COLORS[key].label}
                      aria-label={`Tandai ${FLAG_COLORS[key].label.toLowerCase()}`}
                      aria-pressed={flagColorOf(msg.uid, rowFolder) === key}
                    />
                  ))}
                  <div className="w-px bg-border mx-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFlagColorOf(msg.uid, null, rowFolder);
                      if (msg.isFlagged) bulkFlagMutation.mutate({ uids: [msg.uid], folder: rowFolder, flagged: false });
                      setFlagTick((t) => t + 1);
                      setFlagPickerOpen(null);
                    }}
                    className="w-9 h-9 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-xs text-muted-foreground"
                    title="Hapus flag"
                    aria-label="Hapus flag"
                  >
                    ✕
                  </button>
                </div>
              </>
            )}

            {snoozePicker?.uid === msg.uid && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSnoozePicker(null)} />
                <div
                  className="fixed z-50 bg-card border border-border shadow-md rounded-lg p-1.5 min-w-[140px]"
                  style={{ left: Math.min(snoozePicker.x, window.innerWidth - 180), top: Math.min(snoozePicker.y, window.innerHeight - 200) }}
                >
                  {SNOOZE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={(e) => { e.stopPropagation(); handleSnooze(msg.uid, p.hours); }}
                      className="block w-full text-left px-3 min-h-11 flex items-center rounded-[4px] text-[13px] hover:bg-muted transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* items-center: cluster ikon (snooze/arsip/star/date) tetap sejajar
                vertikal dengan baris pengirim walau lebar list berubah-ubah */}
            <div className="relative flex justify-between items-center mb-1 gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {/* Nama = teks biasa (klik baris = buka pesan). Cari per
                    pengirim pindah ke menu konteks (klik kanan). */}
                <span
                  title={senderLabel}
                  className={`text-sm truncate ${msg.isRead ? 'text-foreground font-normal' : 'text-foreground font-semibold'}`}
                >
                  {displayLabel}
                </span>
                {phishingCheck && (
                  <span className="shrink-0 text-amber-500 dark:text-amber-400" title={`⚠️ ${phishingCheck.finding}`}>
                    <AlertTriangle size={13} />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Aksi hover (Gmail-like). Dulu `hidden group-hover:flex`
                    menggantikan tanggal SEKETIKA saat hover → klik kedua
                    dobel-klik mendarat di "Balas cepat". */}
                {/* row-quick-actions (index.css): HANYA pointer presisi
                    (hover:hover & pointer:fine), muncul ~250ms setelah
                    hover menetap (klik pertama/dobel-klik tidak mendarat di
                    aksi), langsung tampil saat fokus keyboard. Overlay
                    absolut di kanan baris → tidak reserve ruang pengirim. */}
                <div
                  className="row-quick-actions absolute right-0 top-1/2 -translate-y-1/2 z-[1] items-center gap-1.5 rounded-md border border-border bg-background px-0.5 shadow-sm"
                  onDoubleClick={stopDbl}
                >
                  {/* Quick reply — hover desktop, fetch detail & buka compose */}
                  {!isTouch && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDeliberateClick(e)) return;
                        quickReply(msg.uid, rowFolder);
                      }}
                      tabIndex={actionTab}
                      onDoubleClick={stopDbl}
                      disabled={!!replyBusy}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                      title="Balas cepat"
                      aria-label="Balas cepat"
                    >
                      {replyBusy?.uid === msg.uid ? <Loader2 size={14} className="animate-spin" /> : <Reply size={14} />}
                    </button>
                  )}
                  {/* Buat aturan dari pesan ini (ala Outlook) — hover desktop */}
                  {!isTouch && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDeliberateClick(e)) return;
                        setQuickRuleMsg({ ...msg, folderId: rowFolder });
                      }}
                      tabIndex={actionTab}
                      onDoubleClick={stopDbl}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary transition-colors"
                      title="Buat aturan dari pesan ini"
                      aria-label="Buat aturan dari pesan ini"
                    >
                      <Filter size={14} />
                    </button>
                  )}
                  {/* Snooze per-baris — hover desktop; picker durasi */}
                  {rowFolder === 'folderINBOX' && !isTouch && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDeliberateClick(e)) return;
                        setSnoozePicker(snoozePicker?.uid === msg.uid ? null : { uid: msg.uid, x: e.clientX, y: e.clientY });
                      }}
                      tabIndex={actionTab}
                      onDoubleClick={stopDbl}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary transition-colors"
                      title="Snooze"
                      aria-label="Tunda pesan"
                    >
                      <Clock size={14} />
                    </button>
                  )}
                  {/* Arsip cepat per-baris — hanya saat hover desktop */}
                  {archiveFolder && rowFolder !== archiveFolder.id && !isTouch && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDeliberateClick(e)) return;
                        // Lewat archiveUids → performMove (jendela undo +
                        // purge snooze/flag-color saat commit) — uid folder
                        // asal tidak berlaku setelah pindah (audit 2026-09-05).
                        archiveUids([msg.uid], rowFolder);
                      }}
                      tabIndex={actionTab}
                      onDoubleClick={stopDbl}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary transition-colors"
                      title="Arsip"
                      aria-label="Arsipkan pesan"
                    >
                      <Archive size={14} />
                    </button>
                  )}
                  {/* Hapus cepat per-baris — hanya folder Draf (hover desktop) */}
                  {isDraftFolder && !isTouch && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDeliberateClick(e)) return;
                        scheduleDeleteFrom([msg.uid], rowFolder);
                      }}
                      tabIndex={actionTab}
                      onDoubleClick={stopDbl}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors"
                      title="Hapus"
                      aria-label="Hapus pesan"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {/* Bukan Spam per-baris — hanya folder Junk (hover desktop):
                      laporan not-spam + pindahkan balik ke INBOX. */}
                  {rowFolder === 'folderJunk' && !isTouch && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDeliberateClick(e)) return;
                        notJunkMutation.mutate({ uids: [msg.uid], folder: rowFolder });
                      }}
                      tabIndex={actionTab}
                      onDoubleClick={stopDbl}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                      title="Bukan Spam"
                      aria-label="Laporkan bukan spam dan kembalikan ke Kotak Masuk"
                    >
                      <ShieldCheck size={14} />
                    </button>
                  )}
                  {!starVisible && !isTouch && renderStarButton(actionTab)}
                </div>
                {/* Star/flag — SELALU tampil (in-flow) bila berflag atau layar
                    sentuh; desktop & tidak berflag: ada di overlay aksi hover. */}
                {starVisible && renderStarButton(0)}
                {msg.hasAtt && <Paperclip size={12} className="text-muted-foreground shrink-0" aria-label="Berlampiran" />}
                <span className="text-xs text-muted-foreground tabular-nums">{msg.date}</span>
              </div>
            </div>
            {/* Baris anak percakapan: subjek TIDAK diulang — header thread
                sudah membawanya (Outlook); mengulang "RE: …" di tiap anak
                hanya menenggelamkan nama pengirim. */}
            {!nested && (
              <div className={`text-[13px] truncate ${msg.isRead ? 'text-muted-foreground' : 'text-foreground font-medium'}`} title={typeof msg.subject === 'string' ? msg.subject : ''}>
                {searchedAll && msg.folderId && msg.folderId !== selectedFolder && folderLabelById.get(msg.folderId) && (
                  <span className="inline-flex items-center mr-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground align-middle" title={`Dari folder ${folderLabelById.get(msg.folderId)}`}>
                    {folderLabelById.get(msg.folderId)}
                  </span>
                )}
                {typeof msg.subject === 'string' && msg.subject ? msg.subject : '(Tanpa Subjek)'}
              </div>
            )}
            {/* density-hide: baris chip disembunyikan saat mode ringkas (ikon
                lampiran tetap tampil di cluster tanggal). */}
            {!nested && (
              <div className="mt-1 flex items-center gap-1.5 density-hide">
                {(() => {
                  const cat = classifyEmail(msg);
                  if (cat === EMAIL_CATEGORIES.UTAMA || cat === EMAIL_CATEGORIES.SPAM) return null;
                  return (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_BADGE_CLASS[cat] || ''}`}>
                      {CATEGORY_LABELS[cat]}
                    </span>
                  );
                })()}
                {msg.hasAtt && (
                  <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">📎 Lampiran</span>
                )}
              </div>
            )}
          </div>

          {!msg.isRead && (
            <div className="shrink-0 ml-2 pt-2">
              <span className="block w-2 h-2 rounded-full bg-primary" />
            </div>
          )}
        </div>
      </SwipeableRow>
    );
  };

  // Render satu baris folder + anaknya (rekursif) — chevron toggle utk parent.
  // opts.favorite: baris di seksi "Favorit" — tanpa chevron/anak/indentasi,
  // key berbeda supaya tidak bentrok dgn baris pohon utama.
  const renderFolderRow = (folder, opts = {}) => {
    const favorite = !!opts.favorite;
    const children = favorite ? [] : (childrenByParent[folder.id] || []);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedFolders.has(folder.id);
    const Icon = getFolderIcon(folder.type);
    const isActive = selectedFolder === folder.id && !flagFilter;
    const badge = folder.type === 'inbox'
      ? (unseenData?.unseenCount || 0)
      : (perFolderUnseen.data?.[folder.id] || 0);
    const isDefault = isProtectedFolder(folder); // folder sistem SOGo (termasuk Templates) tidak bisa dihapus
    const isFav = favoriteSet.has(folder.id);
    const isDropTarget = dropTargetId === folder.id;
    const rowActionsVisible = isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100';

    return (
      <React.Fragment key={favorite ? `fav:${folder.id}` : folder.id}>
        <div
          className={`flex items-center group rounded-md transition-colors ${isDropTarget ? 'ring-2 ring-primary bg-primary/10' : ''}`}
          style={{ paddingLeft: favorite ? 0 : `${(folder.depth || 0) * 16}px` }}
          onContextMenu={(e) => handleFolderContextMenu(e, folder)}
          onDragEnter={(e) => handleFolderDragOver(e, folder)}
          onDragOver={(e) => handleFolderDragOver(e, folder)}
          onDragLeave={() => { if (dropTargetId === folder.id) setDropTargetId(null); }}
          onDrop={(e) => handleFolderDrop(e, folder)}
          data-drop-folder={folder.id}
        >
          <button
            type="button"
            onClick={() => toggleCollapsed(folder.id)}
            disabled={!hasChildren}
            aria-expanded={hasChildren ? !isCollapsed : undefined}
            aria-label={hasChildren ? (isCollapsed ? `Perluas ${folder.label}` : `Ciutkan ${folder.label}`) : undefined}
            className={`p-1 rounded-md shrink-0 transition-colors ${
              hasChildren ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'invisible'
            }`}
          >
            {hasChildren && (isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
          </button>
          <button
            type="button"
            onClick={() => selectFolder(folder.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-1 flex items-center justify-between min-w-0 px-2 py-2.5 rounded-md text-[13px] transition-colors ${
              isActive
                ? 'relative bg-muted text-primary font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon size={16} className="shrink-0" />
              <span className="truncate" title={favorite ? (folder.path || folder.label) : folder.label}>{folder.label}</span>
            </div>
            {badge > 0 && (
              <span className={`${folder.type === 'inbox' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-full shrink-0 ml-1`}>
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
          {/* Aksi folder: favorit (★), buat subfolder (+), hapus (non-default only) */}
          <div className={`flex items-center gap-0.5 shrink-0 pr-1 transition-opacity ${isFav ? 'opacity-100' : rowActionsVisible}`}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleFavorite(folder.id); }}
              className={`p-1.5 rounded-md hover:bg-muted ${isFav ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'}`}
              title={isFav ? `Hapus ${folder.label} dari Favorit` : `Tambah ${folder.label} ke Favorit`}
              aria-label={isFav ? `Hapus ${folder.label} dari Favorit` : `Tambah ${folder.label} ke Favorit`}
              aria-pressed={isFav}
            >
              <Star size={14} className={isFav ? 'fill-current' : ''} />
            </button>
            {!favorite && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFolderDialog({ mode: 'create', parent: folder }); }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted"
                title={`Buat subfolder di ${folder.label}`}
                aria-label={`Buat subfolder di ${folder.label}`}
              >
                <FolderPlus size={14} />
              </button>
            )}
            {!isDefault && !favorite && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFolderDialog({ mode: 'delete', folder }); }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title={`Hapus ${folder.label}`}
                aria-label={`Hapus ${folder.label}`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        {hasChildren && !isCollapsed && children.map((child) => renderFolderRow(child))}
      </React.Fragment>
    );
  };


  // ── Toolbar header daftar (satu baris + menu "Lainnya") ────────────────────
  const toolbarPlan = planToolbar(listHeaderW, {
    hamburger: typeof window !== 'undefined' && window.innerWidth < 768,
    fixedSlots: pendingSends.length > 0 ? 3 : 2,
  });
  const toolbarShown = new Set(toolbarPlan.visible);
  const refreshMessageList = () => queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, selectedFolder] });
  const openToolbarMenu = (e) => {
    // Klik pada tombol saat menu terbuka: mousedown (di luar menu) sudah
    // menutupnya → jangan langsung dibuka lagi (toggle).
    if (toolbarMenu || Date.now() - toolbarMenuClosedAt.current < 250) { setToolbarMenu(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setToolbarMenu({ x: Math.max(8, r.right - 220), y: r.bottom + 4 });
  };
  const closeToolbarMenu = () => { toolbarMenuClosedAt.current = Date.now(); setToolbarMenu(null); };
  const buildToolbarMenuItems = () => {
    const items = [];
    const overflowDefs = {
      unread: { id: 'unread', label: 'Hanya belum dibaca', icon: MailOpen, checked: unreadOnly, onSelect: () => setUnreadOnly(!unreadOnly) },
      refresh: { id: 'refresh', label: 'Muat ulang pesan', icon: RefreshCw, onSelect: refreshMessageList },
      sort: { id: 'sort', label: 'Terlama dulu', icon: ArrowUpDown, checked: sortAsc, onSelect: () => setSortAsc(!sortAsc) },
      attachment: { id: 'attachment', label: 'Hanya email berlampiran', icon: Paperclip, checked: hasAttachmentOnly, onSelect: () => setHasAttachmentOnly(!hasAttachmentOnly) },
    };
    toolbarPlan.overflow.forEach((k) => { if (overflowDefs[k]) items.push(overflowDefs[k]); });
    if (items.length) items.push({ separator: true });
    if (conversationView && visibleConversationGroups.length > 0) {
      items.push({
        id: 'conv-expand',
        label: allExpandableConversationsOpen ? 'Ciutkan semua' : 'Perluas semua',
        icon: allExpandableConversationsOpen ? ChevronRight : ChevronDown,
        disabled: expandableConversationGroups.length === 0,
        onSelect: allExpandableConversationsOpen ? collapseAllConversations : expandAllConversations,
      });
    }
    items.push({
      id: 'mark-all-read',
      label: 'Tandai semua dibaca',
      icon: CheckCheck,
      disabled: messages.length === 0 || markAllReadMutation.isPending,
      onSelect: () => markAllReadMutation.mutate({ folderId: selectedFolder }),
    });
    if (archiveFolder && selectedFolder !== archiveFolder.id) {
      items.push({
        id: 'archive-folder',
        label: 'Arsipkan folder',
        icon: Archive,
        disabled: messages.length === 0 || archiveMutation.isPending,
        // Arsip SELURUH folder → konfirmasi dulu (dialog dgn jumlah).
        onSelect: () => setArchiveConfirmOpen(true),
      });
    }
    return items;
  };

  return (
    <div className="flex h-full w-full bg-background overflow-hidden relative">
      {/* Mobile overlay */}
      {folderPanelOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setFolderPanelOpen(false)} />
      )}

      {/* ── Folder Panel ───────────────────────────────────────────────────── */}
      <div
        style={{ width: folderW }}
        className={`absolute md:relative z-30 h-full border-r border-border bg-card flex flex-col shrink-0 transition-transform duration-300 ${
          folderPanelOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Compose button — baris header pane (ritme .pane-header, h-12) */}
        <div className="pane-header justify-between gap-2">
          <button
            onClick={() => { setComposeData(null); setComposeOpen(true); setFolderPanelOpen(false); }}
            className="flex-1 flex items-center justify-center gap-2 h-11 md:h-9 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-4 rounded-md transition-colors"
          >
            <Edit3 size={16} />
            <span>Tulis Pesan</span>
          </button>
          <button
            className="md:hidden p-2 rounded-md hover:bg-muted text-muted-foreground"
            onClick={() => setFolderPanelOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Folder list — tree expand/collapse */}
        <nav className="p-3 flex-1 overflow-y-auto space-y-0.5">
          {/* Favorit (pola Outlook): pintasan folder pilihan di atas pohon;
              juga target drag-and-drop pesan. */}
          {!loadingFolders && favoriteFolders.length > 0 && (
            <div className="mb-2 pb-2 border-b border-border" data-folder-section="favorites">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Star size={10} className="fill-current text-amber-500" aria-hidden /> Favorit
              </div>
              {favoriteFolders
                .map((id) => folderById(id))
                .filter(Boolean)
                .map((f) => renderFolderRow(f, { favorite: true }))}
            </div>
          )}
          {loadingFolders ? (
            <FoldersListSkeleton />
          ) : (
            (Array.isArray(folders) ? folders : [])
              .filter((f) => !folderPathOf(f).includes('/'))
              .map((f) => renderFolderRow(f))
          )}

          {/* ── Flag Color Filter ──────────────────────────────────────── */}
          <div className="pt-3 mt-2 border-t border-border">
            <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Filter Flag
            </div>
            <div className="mt-1 space-y-0.5">
              {FLAG_COLOR_KEYS.map((key) => {
                const colorDef = FLAG_COLORS[key];
                const isActive = flagFilter === key;
                const count = messagesInWindow.filter((m) => flagColorOf(m.uid) === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setFlagFilter(isActive ? null : key);
                      setFolderPanelOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-[13px] transition-colors ${
                      isActive
                        ? 'relative bg-muted text-primary font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${colorDef.bg}`} />
                      <span>{colorDef.label}</span>
                    </div>
                    {count > 0 && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      <ResizeHandle handle={folderHandle} label="Ubah lebar panel folder" />

      {/* ── Daftar pesan + reader: tata letak mengikuti preferensi readingPane
          ('right' = berdampingan, 'bottom' = daftar di atas reader,
          'off' = daftar penuh; pesan terbuka memakai seluruh panel). ──── */}
      <div className={`flex-1 min-w-0 min-h-0 flex ${readingPane === 'bottom' ? 'flex-col' : 'flex-row'}`} data-reading-pane={readingPane}>
      {/* ── Message List ───────────────────────────────────────────────────── */}
      {/* Lebar/tinggi via CSS var hanya di md+ (bug lama: inline width ikut
          dipasang di mobile → overflow di ≤339px). */}
      <div
        style={{ '--list-w': `${listW}px`, '--list-h': `${listH}px` }}
        className={`flex-col bg-background w-full ${
          readingPane === 'right'
            ? 'md:w-[var(--list-w)] md:shrink-0 border-r border-border'
            : readingPane === 'bottom'
              ? 'flex-1 md:flex-none md:h-[var(--list-h)] md:shrink-0 border-b border-border'
              : 'flex-1'
        } ${
          selectedMsgId ? (readingPane === 'off' ? 'hidden' : 'hidden md:flex') : 'flex'
        }`}
      >
        {/* Header */}
        {/* z-20 (bukan z-10): header ini membentuk stacking context utk dropdown
            kriteria pencarian di dalamnya; header grup tanggal (z-10, lebih akhir
            di DOM) tidak boleh menutupi dropdown tsb. */}
        <div ref={listHeaderRef} data-list-header className="px-4 pt-1 pb-2 border-b border-border flex flex-col gap-2 bg-background sticky top-0 z-20">
          {/* Baris 1 (ala Outlook): judul + jumlah (kiri, truncate) · toolbar
              ikon SATU baris (kanan). Toolbar tidak pernah wrap — ikon
              berprioritas rendah pindah ke menu "Lainnya" saat sempit
              (planToolbar). Jumlah percakapan = teks meta kecil di bawah judul. */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-x-2">
            {/* min-w-0 + truncate: judul folder menyusut duluan saat lebar panel
                list menyempit (dynamic sizing), tombol aksi di kanan tetap utuh */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                className="md:hidden min-w-11 min-h-11 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground shrink-0"
                onClick={() => setFolderPanelOpen(true)}
                aria-label="Buka daftar folder"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0 flex flex-col justify-center min-h-12">
                <h2 className="text-base font-semibold leading-tight text-foreground flex items-center gap-2 min-w-0">
                  <span className="truncate">{selectedFolderMeta.label}</span>
                  <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 tabular-nums shrink-0">
                    {messages.length < totalMessageCount ? (
                      <>
                        <span>{messages.length.toLocaleString('id')}</span>
                        <span className="opacity-50">/</span>
                        <span>{totalMessageCount.toLocaleString('id')}</span>
                      </>
                    ) : (
                      <span>{totalMessageCount.toLocaleString('id')}</span>
                    )}
                    {loadingMore && <Loader2 size={10} className="animate-spin text-muted-foreground flex-none" />}
                  </span>
                </h2>
                {conversationView && (
                  <p
                    className="mt-0.5 text-xs leading-tight text-muted-foreground tabular-nums truncate"
                    data-conversation-meta
                    title={`${visibleConversationGroups.length} grup percakapan, ${expandableConversationGroups.length} berisi lebih dari satu pesan`}
                  >
                    {visibleConversationGroups.length} percakapan · {expandableConversationGroups.length} thread
                  </p>
                )}
              </div>
              {isFetchingMessages && !loadingMessages && (
                <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0" />
              )}
            </div>
            <div
              role="toolbar"
              aria-label="Aksi daftar pesan"
              className="flex flex-nowrap items-center justify-end gap-0.5 min-w-0 overflow-hidden"
              data-mailbox-toolbar="actions"
            >
              <button
                type="button"
                onClick={() => setConversationView(!conversationView)}
                className={`min-w-11 min-h-11 shrink-0 flex items-center justify-center rounded-md transition-colors ${
                  conversationView ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                }`}
                title={conversationView ? 'Tampilan biasa' : 'Tampilan percakapan'}
                aria-label={conversationView ? 'Tampilan biasa' : 'Tampilan percakapan'}
                aria-pressed={conversationView}
              >
                <MessagesSquare size={16} />
                <span className="sr-only">{conversationView ? 'Conversation aktif' : 'Aktifkan conversation'}</span>
              </button>
              {toolbarShown.has('unread') && (
                <button
                  type="button"
                  onClick={() => setUnreadOnly(!unreadOnly)}
                  className={`min-w-11 min-h-11 shrink-0 flex items-center justify-center rounded-md transition-colors ${
                    unreadOnly ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                  }`}
                  title={unreadOnly ? 'Tampilkan semua' : 'Hanya belum dibaca'}
                  aria-label={unreadOnly ? 'Tampilkan semua pesan' : 'Hanya pesan belum dibaca'}
                  aria-pressed={unreadOnly}
                >
                  <MailOpen size={16} />
                </button>
              )}
              {toolbarShown.has('refresh') && (
                <button
                  type="button"
                  onClick={refreshMessageList}
                  className="min-w-11 min-h-11 shrink-0 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
                  title="Muat ulang pesan"
                  aria-label="Muat ulang pesan"
                >
                  <RefreshCw size={16} />
                </button>
              )}
              {toolbarShown.has('sort') && (
                <button
                  type="button"
                  onClick={() => setSortAsc(!sortAsc)}
                  className={`min-w-11 min-h-11 shrink-0 flex items-center justify-center rounded-md transition-colors ${
                    sortAsc ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                  }`}
                  title={sortAsc ? 'Terlama dulu' : 'Terbaru dulu'}
                  aria-label={sortAsc ? 'Urutkan terlama dulu' : 'Urutkan terbaru dulu'}
                  aria-pressed={sortAsc}
                >
                  <ArrowUpDown size={16} className={sortAsc ? 'rotate-180' : ''} />
                </button>
              )}
              {toolbarShown.has('attachment') && (
                <button
                  type="button"
                  onClick={() => setHasAttachmentOnly(!hasAttachmentOnly)}
                  className={`min-w-11 min-h-11 shrink-0 flex items-center justify-center rounded-md transition-colors ${
                    hasAttachmentOnly ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                  }`}
                  title={hasAttachmentOnly ? 'Tampilkan semua' : 'Hanya email berlampiran'}
                  aria-label={hasAttachmentOnly ? 'Tampilkan semua email' : 'Hanya email berlampiran'}
                  aria-pressed={hasAttachmentOnly}
                >
                  <Paperclip size={16} />
                </button>
              )}
              {pendingSends.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPendingOpen(true)}
                  className="relative min-w-11 min-h-11 shrink-0 flex items-center justify-center rounded-md text-primary hover:bg-primary/10 transition-colors"
                  title={`${pendingSends.length} kiriman terjadwal — klik untuk kelola`}
                >
                  <CalendarClock size={16} />
                  <span aria-hidden="true" className="absolute top-1 right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[11px] leading-4 font-medium tabular-nums text-center">
                    {pendingSends.length}
                  </span>
                  <span className="sr-only">Terjadwal ({pendingSends.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={openToolbarMenu}
                className={`min-w-11 min-h-11 shrink-0 flex items-center justify-center rounded-md transition-colors ${
                  toolbarMenu ? 'bg-muted text-foreground' : 'hover:bg-muted text-muted-foreground'
                }`}
                title="Lainnya"
                aria-label="Aksi lainnya"
                aria-haspopup="menu"
                aria-expanded={!!toolbarMenu}
                data-mailbox-toolbar="more"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>

          {/* Search with filter */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  type="text"
                  placeholder="Cari pesan..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  ref={searchInputRef}
                  maxLength={300}
                  className="w-full bg-muted border border-transparent rounded-md pl-9 pr-10 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
                />
                {searchInput && (
                  <button
                    type="button"
                  onClick={clearSearch}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label="Bersihkan pencarian"
                  >
                    <X size={14} />
                  </button>
                )}
                {/* Hint palet perintah — desktop saja; saat ada teks digantikan tombol X */}
                {!searchInput && (
                  <kbd
                    className="hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center px-1.5 py-0.5 rounded-md border border-border bg-background text-[11px] font-mono text-muted-foreground pointer-events-none select-none"
                    aria-hidden="true"
                  >
                    {PALETTE_HINT}
                  </kbd>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowSearchFilter(!showSearchFilter)}
                className={`min-w-11 min-h-11 flex items-center justify-center rounded-md transition-colors ${
                  searchCriteria !== 'all' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'
                }`}
                title="Filter pencarian"
                aria-label="Filter pencarian"
                aria-expanded={showSearchFilter}
              >
                <Filter size={16} />
              </button>
            </div>

            {/* Search criteria dropdown */}
            {showSearchFilter && (
              <div className="absolute top-full left-0 right-12 mt-1 bg-card border border-border shadow-md rounded-lg z-20 p-1.5 flex gap-1 flex-wrap">
                {SEARCH_CRITERIA.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSearchCriteria(c.id); setShowSearchFilter(false); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      searchCriteria === c.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </form>

          {/* Info hasil pencarian: jumlah + scope + clear cepat */}
          {searchQuery && (
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <span>
                {sortedMessages.length} hasil
                {fetchingGlobal && !searchedAll
                  ? ' • mencari folder lain…'
                  : searchedAll ? ' • semua folder' : ` • di ${selectedFolderMeta.label}`}
              </span>
              <button type="button" onClick={clearSearch} className="text-primary hover:underline min-h-11">
                Bersihkan
              </button>
            </div>
          )}

          {/* Category tabs — Utama/Promosi/Sosial/Update (mirip Gmail) */}
          {!searchQuery && (
            <CategoryTabs
              messages={categorySource}
              categoryFilter={categoryFilter}
              onSelect={setCategoryFilter}
            />
          )}

          {/* Soft-ask notifikasi — SATU baris tipis, bisa ditutup; klik = enable.
              Tombol tampak 28px; area sentuh diperluas ke ≥44px via ::after. */}
          {notifAsk && (
            <div className="flex items-center gap-2 h-9 pl-3 pr-1 rounded-md bg-primary/10 border border-primary/20 text-xs" data-notif-ask>
              <BellRing size={14} className="text-primary shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0 truncate text-foreground" title="Aktifkan notifikasi agar tahu saat ada email baru masuk">
                Aktifkan notifikasi email baru
              </span>
              <button
                type="button"
                onClick={handleEnableNotifications}
                className="relative shrink-0 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0"
              >
                Aktifkan
              </button>
              <button
                type="button"
                onClick={() => { setNotifAsk(false); notifGrantedRef.current = true; }}
                aria-label="Jangan tampilkan lagi"
                title="Jangan tampilkan lagi"
                className="relative shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted after:content-[''] after:absolute after:-inset-2"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Bulk actions toolbar */}
        {selectedUids.length > 0 && (
          <div className="px-3 py-2 border-b border-border bg-background">
          <div className="rounded-lg border border-border bg-muted/40 px-2 py-1 flex items-center justify-between text-sm flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {selectionMode && (
                <button
                  onClick={() => { setSelectedUids([]); setSelectionMode(false); }}
                  className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-foreground rounded"
                  title="Keluar dari mode seleksi"
                  aria-label="Keluar dari mode seleksi"
                >
                  <X size={16} />
                </button>
              )}
              <button onClick={toggleSelectAll} className="min-w-11 min-h-11 flex items-center justify-center text-primary hover:opacity-80" aria-label="Pilih semua pesan">
                <CheckSquare size={18} />
              </button>
              <span className="font-medium text-primary">{selectedUids.length} terpilih</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {bulkBusy && <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label="Memproses\u2026" />}
              {/* Pindahkan ke\u2026 \u2192 MoveToPicker (ketik utk menyaring, panah, Enter) */}
              <button
                type="button"
                onClick={(e) => openMovePicker(selectedUids, { x: e.clientX, y: e.clientY })}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 px-2.5 min-h-11 rounded-md text-xs font-medium bg-background border border-border text-foreground hover:bg-muted disabled:opacity-50"
                aria-label="Pindah pesan terpilih ke folder"
                aria-haspopup="dialog"
                title="Pindahkan ke folder\u2026 (Ctrl+Shift+V)"
              >
                <FolderInput size={14} />
                Pindah ke\u2026
              </button>
              <button
                onClick={() => forEachFolderGroup(selectedUids, (folder, uids) => bulkFlagMutation.mutate({ uids, folder, flagged: true }))}
                disabled={bulkBusy}
                className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 rounded disabled:opacity-50"
                title="Tandai berbintang"
                aria-label="Tandai berbintang"
              >
                <Star size={16} />
              </button>
              <button
                onClick={() => forEachFolderGroup(selectedUids, (folder, uids) => bulkMarkReadMutation.mutate({ uids, folder, read: true }))}
                disabled={bulkBusy}
                className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-primary rounded disabled:opacity-50"
                title="Tandai dibaca (Ctrl+Q)"
                aria-label="Tandai pesan terpilih sebagai dibaca"
              >
                <MailOpen size={16} />
              </button>
              <button
                onClick={() => forEachFolderGroup(selectedUids, (folder, uids) => bulkMarkReadMutation.mutate({ uids, folder, read: false }))}
                disabled={bulkBusy}
                className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-primary rounded disabled:opacity-50"
                title="Tandai belum dibaca (Ctrl+U)"
                aria-label="Tandai pesan terpilih sebagai belum dibaca"
              >
                <Mail size={16} />
              </button>
              {selectedFolder !== 'folderJunk' && (
                <button
                  onClick={() => forEachFolderGroup(selectedUids, (folder, uids) => junkMutation.mutate({ uids, folder }))}
                  disabled={bulkBusy}
                  className="min-w-11 min-h-11 flex items-center justify-center text-orange-600 dark:text-orange-500 hover:bg-orange-500/10 rounded disabled:opacity-50"
                  title="Laporkan Spam"
                  aria-label="Laporkan pesan terpilih sebagai spam"
                >
                  <AlertTriangle size={16} />
                </button>
              )}
              {selectedFolder === 'folderJunk' && (
                <button
                  onClick={() => forEachFolderGroup(selectedUids, (folder, uids) => notJunkMutation.mutate({ uids, folder }))}
                  disabled={bulkBusy}
                  className="min-w-11 min-h-11 flex items-center justify-center text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500/10 rounded disabled:opacity-50"
                  title="Bukan Spam"
                  aria-label="Laporkan pesan terpilih bukan spam dan kembalikan ke Kotak Masuk"
                >
                  <ShieldCheck size={16} />
                </button>
              )}
              <button
                onClick={() => bulkDeleteMutation.mutate()}
                disabled={bulkBusy}
                className="min-w-11 min-h-11 flex items-center justify-center text-destructive hover:bg-destructive/10 rounded disabled:opacity-50"
                title="Hapus (Delete)"
                aria-label="Hapus pesan terpilih"
              >
                <Trash size={16} />
              </button>
            </div>
          </div>
          </div>
        )}

        {/* FAB: Tulis Pesan (mobile) */}
        {!selectedMsgId && (
          <button
            onClick={() => { setComposeData(null); setComposeOpen(true); }}
            className="md:hidden fixed bottom-20 right-4 z-20 w-14 h-14 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95"
            aria-label="Tulis Pesan"
          >
            <Edit3 size={22} />
          </button>
        )}

        {/* Message list */}
        <PullToRefresh onRefresh={() => queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, selectedFolder] })}>
        {/* absolute inset-0: tinggi definitif mengikuti wrapper (relative +
            flex-1 min-h-0) sehingga overflow-y-auto SELALU aktif walau
            struktur flex di atasnya berubah — regresi "inbox tak bisa discroll". */}
        <div ref={listRef} className="absolute inset-0 overflow-y-auto">
          {loadingMessages ? (
            <MessageListSkeleton count={8} />
          ) : msgError ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 px-4 text-center">
              <AlertCircle size={24} className="text-destructive" />
              <span className="text-sm text-destructive">{msgError?.message || 'Gagal memuat pesan.'}</span>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, selectedFolder] })}
                disabled={isFetchingMessages}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
              >
                {isFetchingMessages ? (
                  <><Loader2 size={12} className="animate-spin" /> Memuat ulang...</>
                ) : (
                  <><RefreshCw size={12} /> Coba lagi</>
                )}
              </button>
            </div>
          ) : sortedMessages.length === 0 && !(hasMore && !searchQuery) ? (
            // Gate memakai sortedMessages (hasil filter + hasil pencarian
            // global), bukan messages.length — bug lama: hasil lintas folder
            // tidak pernah dirender & empty-state filter tak terjangkau saat
            // folder punya pesan tapi filter menyembunyikan semua. Bila masih
            // ada header yang bisa dimuat (hasMore) daftar tetap dirender
            // agar sentinel infinite-scroll terus memuat.
            (() => {
              // Empty state pintar: bedakan "folder kosong", "filter terlalu
              // sempit", dan "pencarian tanpa hasil" — beri jalan keluar satu
              // klik untuk masing-masing.
              const empty = analyzeEmptyList({
                searchQuery,
                activeFilters: {
                  unread: unreadOnly,
                  attachment: hasAttachmentOnly,
                  category: !!categoryFilter,
                  flag: !!flagFilter,
                },
                scopeNote: searchedAll ? 'Sudah dicari di semua folder.' : null,
              });
              const filterNames = empty.filters.map((f) => FILTER_LABELS_ID[f] || f).join(', ');
              return (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground gap-4 px-6">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                    {searchQuery ? <Search size={24} className="opacity-40" /> : <Mail size={24} className="opacity-40" />}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      {empty.kind === 'search' ? 'Tidak ada hasil pencarian'
                        : empty.kind === 'filters' ? 'Tidak ada pesan yang cocok dengan filter'
                        : 'Belum ada pesan'}
                    </p>
                    <p className="text-[13px] mt-1">
                      {empty.kind === 'search'
                        ? `Tidak ada hasil untuk "${searchQuery}"${empty.scopeNote ? ' — ' + empty.scopeNote : ''}`
                        : empty.kind === 'filters'
                        ? `Filter aktif: ${filterNames}`
                        : `Folder ${selectedFolderMeta.label} kosong`}
                    </p>
                    {fetchingGlobal && empty.kind === 'search' && (
                      <p className="text-xs mt-1 inline-flex items-center gap-1 justify-center">
                        <Loader2 size={12} className="animate-spin" /> Mencari di semua folder…
                      </p>
                    )}
                  </div>
                  {empty.kind === 'search' && (
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <button
                        onClick={clearSearch}
                        className="px-3 min-h-11 rounded-md text-xs font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors"
                      >
                        Bersihkan pencarian
                      </button>
                    </div>
                  )}
                  {empty.kind === 'filters' && (
                    <button
                      onClick={resetAllFilters}
                      className="px-3 min-h-11 rounded-md text-xs font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors"
                    >
                      Reset semua filter
                    </button>
                  )}
                </div>
              );
            })()            ) : (
            <div className="divide-y divide-border">
              {conversationView && visibleConversationGroups.length > 0
                ? visibleConversationGroups.map((group) => {
                    // Email tunggal (1 pesan, bukan thread sungguhan) — tampil
                    // sebagai baris biasa, tanpa header percakapan (pola
                    // Gmail/Outlook: hanya thread yang diberi penanda
                    // percakapan; header + badge "1" utk email tunggal hanya
                    // membuat daftar terlihat seperti thread palsu).
                    if (group.messages.length === 1) {
                      return renderMessageRow(group.messages[0], -1, false);
                    }
                    const isExpanded = expandedConversations.has(group.key);
                    const senders = group.senders;
                    const latest = group.latest;
                    // Warna bintang header = flag pesan TERBARU yang ditandai
                    // (konsisten dgn baris; flagColor butuh email+folder →
                    // dihitung di sini, bukan di lib murni conversations.js).
                    let headerFlagCls = '';
                    if (group.hasFlagged) {
                      const firstFlagged = group.messages.find((msg) => msg.isFlagged);
                      const k = firstFlagged ? flagColorOf(firstFlagged.uid) : null;
                      headerFlagCls = k && FLAG_COLORS[k]
                        ? `${FLAG_COLORS[k].text} ${FLAG_COLORS[k].fill}`
                        : 'text-amber-600 fill-amber-600 dark:text-amber-400 dark:fill-amber-400';
                    }
                    return (
                      // Parent list pakai divide-y → pemisah antar grup cukup
                      // dari situ; border-b di sini bikin garis ganda.
                      <div key={group.key} className="relative">
                        {/* Group header (Outlook-like): baris 1 = SUBJEK
                            ternormalisasi (tebal bila ada belum dibaca),
                            baris 2 = ringkasan NAMA peserta. Kanan: waktu
                            terbaru + badge angka belum-dibaca + bintang +
                            paperclip. Klik header = expand + buka pesan
                            TERBARU di panel baca (perilaku Outlook); chevron
                            terpisah = expand/collapse saja. Semua line
                            min-w-0/truncate/shrink-0 agar tidak menimpa. */}
                        <div className="@container flex items-stretch bg-muted/30 hover:bg-muted/50 transition-colors">
                          <button
                            onClick={() => {
                              // Header = SELALU buka pesan terbaru + pastikan
                              // terbuka (tidak pernah menutup). Toggle = chevron.
                              expandConversation(group.key);
                              if (selectionMode) return;
                              if (selectedUids.length > 0) setSelectedUids([]);
                              if (group.latest) openMessage(group.latest.uid);
                            }}
                            aria-label={`Buka pesan terbaru percakapan ${group.subject}`}
                            className="flex-1 min-w-0 flex items-center gap-2.5 pl-3 pr-2 density-row text-left"
                          >
                            {/* Avatar stack: maks 2 di daftar sempit, 3 bila
                                kontainer ≥ 28rem (container query). */}
                            <div className="flex -space-x-1.5 shrink-0">
                              {senders.slice(0, 3).map((s, i) => (
                                <Avatar
                                  key={i}
                                  name={s}
                                  size="sm"
                                  className={`w-6! h-6! text-[10px]! ring-2 ring-background ${i > 0 ? 'relative' : ''} ${i === 2 ? 'hidden! @md:flex!' : ''}`}
                                />
                              ))}
                            </div>
                            {/* Dua baris (QA: subjek terpotong ~7 karakter di
                                340px): baris 1 = subjek (lebar penuh) + waktu;
                                baris 2 = peserta · N pesan + badge/ikon. */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`flex-1 min-w-0 text-sm truncate ${group.hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`} title={group.subject}>
                                  {group.displaySubject || group.subject}
                                </span>
                                {latest?.date && (
                                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">{latest.date}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
                                <span className="flex-1 min-w-0 text-[11px] text-muted-foreground truncate">
                                  {formatRecipientSummary(senders.map((s) => ({ name: s })), { max: 3 })}
                                  {group.messages.length > 1 && ` · ${group.messages.length} pesan`}
                                </span>
                                {/* Belum dibaca: badge ANGKA saja (aksen) — detail di title. */}
                                {group.unreadCount > 0 && (
                                  <span
                                    className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold tabular-nums shrink-0"
                                    title={`${group.unreadCount} belum dibaca`}
                                  >
                                    {group.unreadCount}
                                  </span>
                                )}
                                {/* Flag thread: bintang warna flag pesan terbaru yang ditandai. */}
                                {group.hasFlagged && (
                                  <span className="shrink-0 inline-flex" title={`${group.flaggedCount} pesan ditandai dalam percakapan`}>
                                    <Star size={12} className={headerFlagCls} aria-hidden />
                                  </span>
                                )}
                                {/* Lampiran thread: saat collapsed hanya baris terbaru
                                    yang dirender — ikon agregat menutup celah itu
                                    (pola Gmail/Outlook: paperclip di baris thread). */}
                                {group.hasAttachment && (
                                  <span className="shrink-0 inline-flex" title={`${group.attachmentCount} pesan berlampiran dalam percakapan`}>
                                    <Paperclip size={12} className="text-muted-foreground" aria-hidden />
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={() => toggleConversation(group.key)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Ciutkan' : 'Perluas'} percakapan ${group.subject}`}
                            className="shrink-0 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronDown size={14} className={`shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                          </button>
                        </div>
                        {/* Preview pesan terbaru selalu terlihat, seperti Outlook.
                            Saat collapsed hanya pesan terbaru dirender; saat
                            expanded pesan lama ikut ditampilkan. Jadi collapse
                            hanya menyederhanakan tampilan, tidak membuat seluruh
                            email terasa hilang. */}
                        <div className="ml-4 border-l-2 border-primary/15">
                          <div className="border-t border-border/40">
                            {renderMessageRow(group.messages[0], -1, true)}
                          </div>
                          {isExpanded && group.messages.slice(1).map((msg) => (
                            <div key={msg.uid} className="border-t border-border/40">
                              {renderMessageRow(msg, -1, true)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                : (() => {
                    // Group by tanggal (pola Gmail): Hari Ini / Kemarin / Minggu Ini / Bulan Ini / Bulan Lalu / Lebih Lama
                    if (conversationView) {
                      return sortedMessages.map((msg, idx) => renderMessageRow(msg, idx));
                    }
                    // dateGroups (memo di atas): sortAsc membalik urutan grup
                    // DAN isi tiap grup — label "Terlama dulu" kini konsisten
                    // sampai ke baris. idx = urutan render datar = focusOrder.
                    let flatIdx = 0;
                    return dateGroups.map((group) => (
                      <div key={group.key}>
                        <div className="sticky top-0 z-10 px-4 py-1.5 bg-background text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                          {group.label}
                        </div>
                        {group.messages.map((msg) => {
                          const idx = flatIdx++;
                          return renderMessageRow(msg, idx);
                        })}
                      </div>
                    ));
                  })()}
              {hasMore ? (
                <div ref={loadMoreSentinelRef} className="px-4 py-3 flex justify-center min-h-[28px]">
                  {loadingMore ? (
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin flex-none" />
                      Memuat {Math.min(PAGE_SIZE, remainingUids.length).toLocaleString('id')} email…
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Scroll untuk memuat lagi…</span>
                  )}
                </div>
              ) : (
                (selectedFolder === 'folderINBOX' || totalMessageCount > messages.length) && (
                  <div className="px-4 py-3 flex justify-center border-t border-border">
                    <span className="text-[11px] text-muted-foreground">
                      {selectedFolder === 'folderINBOX'
                        ? `Menampilkan ${messagesInWindow.length} email (5 bulan terakhir). Email lebih lama bisa dicari.`
                        : `Menampilkan ${messages.length} dari ${totalMessageCount} email terbaru. Cari email lama via pencarian.`}
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
        </PullToRefresh>
      </div>

      {/* Pegangan resize (keyboard: role=separator + panah; sentuh: pointer events) */}
      {readingPane === 'right' && <ResizeHandle handle={listHandle} label="Ubah lebar daftar pesan" />}
      {readingPane === 'bottom' && <ResizeHandle handle={listHeightHandle} label="Ubah tinggi daftar pesan" />}

      {/* ── Message Reader ─────────────────────────────────────────────────── */}
      <div className={`flex-1 bg-background flex-col min-w-0 min-h-0 ${
        selectedMsgId ? 'flex' : readingPane === 'off' ? 'hidden' : 'hidden md:flex'
      }`}>
        {/* readingPane 'off' di desktop: reader memakai seluruh panel → bar
            "Kembali" (di mobile reader sudah punya tombol Kembali sendiri). */}
        {selectedMsgId && readingPane === 'off' && (
          <div className="hidden md:flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
            <button
              type="button"
              onClick={() => setSelectedMsgId(null)}
              className="flex items-center gap-1.5 px-3 min-h-9 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="Kembali ke daftar pesan"
            >
              <ArrowLeft size={16} /> Kembali ke daftar
            </button>
          </div>
        )}
        {selectedMsgId ? (
          <MessageReader
            folder={searchQuery && activeMessage?.folderId ? activeMessage.folderId : selectedFolder}
            msgId={selectedMsgId}
            siblingUids={readerOrderUids}
            siblingTotal={readerTotalCount}
            onNavigateTo={(uid) => setSelectedMsgId(uid)}
            onClose={() => setSelectedMsgId(null)}
            onReply={(data) => { setComposeData(data); setComposeOpen(true); }}
            folders={folders}
            shortcutsEnabled={!composeOpen}
            // Saat ada seleksi MULTI, pintasan per-pesan (s/u/r/f/Delete)
            // diambil alih MailPage utk seluruh seleksi → matikan di reader
            // supaya tidak double-fire. (Spread terpisah: baris
            // `shortcutsEnabled={!composeOpen}` di atas adalah kontrak uji
            // test-state-combination.)
            {...(selectedUids.length > 0 ? { shortcutsEnabled: false } : null)}
            onSnoozeCleared={() => setSnoozeTick((t) => t + 1)}
            // Reader sudah auto-advance; `next` = uid yang dibuka (null = habis).
            // Jangan di-null-kan tanpa syarat (bug lama mematikan auto-advance).
            onMoveComplete={({ next } = {}) => {
              setSelectedMsgId(next ?? null);
              queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, selectedFolder] });
              queryClient.invalidateQueries({ queryKey: ['unseen', user?.sogoToken] });
              queryClient.invalidateQueries({ queryKey: ['unseen-per-folder', user?.sogoToken] });
            }}
            // Status baca dari reader → patch cache OPTIMIS (bukan refetch daftar).
            onReadStateChange={(uid, isRead) => {
              const f = searchQuery && activeMessage?.folderId ? activeMessage.folderId : selectedFolder;
              applyReadLocal(f, [uid], isRead);
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Mail size={24} className="opacity-50" />
            </div>
            <p className="text-sm">Pilih email untuk membaca</p>
          </div>
        )}
      </div>
      </div>{/* /daftar + reader */}

      {/* ── Compose Modal ──────────────────────────────────────────────────── */}
      <ComposeModal
        isOpen={composeOpen}
        onClose={() => { setComposeOpen(false); setComposeData(null); }}
        initialData={composeData}
        sogoToken={user?.sogoToken}
        userFrom={user?.cn ? `${user.cn} <${user.email}>` : user?.email || ''}
        onReopen={(data) => { setComposeData(data); setComposeOpen(true); }}
      />

      {/* ── Quick Rule — buat aturan dari baris email ─────────────────────── */}
      <QuickRuleModal
        isOpen={!!quickRuleMsg}
        onClose={() => setQuickRuleMsg(null)}
        message={quickRuleMsg}
        folders={folders}
        userEmail={user?.email}
        sogoToken={user?.sogoToken}
      />

      {/* ── Folder Dialog: buat subfolder / hapus folder ──────────────────── */}
      {folderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { setFolderDialog(null); setNewFolderName(''); }}
          />
          <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-sm p-5">
            {folderDialog.mode === 'create' ? (
              <>
                <h3 className="text-base font-semibold mb-1">Buat Subfolder</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Folder baru di dalam <span className="font-medium text-foreground">{folderDialog.parent.label}</span>
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newFolderName.trim()) return;
                    createFolderMutation.mutate(
                      { parentId: folderDialog.parent.id, name: newFolderName.trim() },
                      { onSuccess: () => { setFolderDialog(null); setNewFolderName(''); } }
                    );
                  }}
                >
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Nama folder"
                    className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-2 focus:ring-primary/20 mb-4"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setFolderDialog(null); setNewFolderName(''); }}
                      className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={!newFolderName.trim() || createFolderMutation.isPending}
                      className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {createFolderMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Buat Folder'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold mb-1">Hapus Folder</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Hapus <span className="font-medium text-foreground">{folderDialog.folder.label}</span> beserta isinya?
                  Tindakan ini permanen (tidak masuk Sampah).
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setFolderDialog(null)}
                    className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={deleteFolderMutation.isPending}
                    onClick={() => {
                      deleteFolderMutation.mutate(
                        { folderId: folderDialog.folder.id },
                        { onSuccess: () => setFolderDialog(null) }
                      );
                    }}
                    className="px-4 py-2 rounded-md text-sm bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                  >
                    {deleteFolderMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Hapus'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Konfirmasi Arsip seluruh folder ──────────────────────────────── */}
      {archiveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="archive-confirm-title">
          <div className="absolute inset-0 bg-black/50" onClick={() => setArchiveConfirmOpen(false)} />
          <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-sm p-5">
            <h3 id="archive-confirm-title" className="text-base font-semibold mb-1">Arsipkan seluruh folder?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{messages.length.toLocaleString('id')} pesan</span> di{' '}
              <span className="font-medium text-foreground">{selectedFolderMeta.label}</span> akan dipindahkan ke{' '}
              <span className="font-medium text-foreground">{archiveFolder?.label || 'Arsip'}</span>.
              {messages.length < totalMessageCount && (
                <> Hanya {messages.length.toLocaleString('id')} dari {totalMessageCount.toLocaleString('id')} pesan yang sudah dimuat yang ikut diarsipkan.</>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setArchiveConfirmOpen(false)}
                className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={archiveMutation.isPending || messages.length === 0}
                onClick={() => {
                  setArchiveConfirmOpen(false);
                  archiveMutation.mutate({ uids: messages.map((m) => m.uid), sourceFolder: selectedFolder });
                }}
                className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {archiveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Arsipkan semua'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Menu konteks (klik kanan baris pesan / folder) ────────────────── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.kind === 'folder' ? buildFolderMenuItems(ctxMenu.folder) : buildMessageMenuItems(ctxMenu)}
          onClose={() => setCtxMenu(null)}
          ariaLabel={ctxMenu.kind === 'folder' ? `Menu folder ${ctxMenu.folder?.label || ''}` : 'Menu pesan'}
        />
      )}

      {toolbarMenu && (
        <ContextMenu
          x={toolbarMenu.x}
          y={toolbarMenu.y}
          items={buildToolbarMenuItems()}
          onClose={closeToolbarMenu}
          ariaLabel="Aksi lainnya daftar pesan"
        />
      )}

      {/* ── Pindahkan ke… (picker folder) ─────────────────────────────────── */}
      {movePicker && (
        <MoveToPicker
          folders={folders}
          excludeId={movePicker.sourceFolder}
          count={movePicker.uids.length}
          x={movePicker.x}
          y={movePicker.y}
          busy={quickMoveMutation.isPending}
          onClose={() => setMovePicker(null)}
          onSelect={(folder) => {
            const { uids } = movePicker;
            setMovePicker(null);
            forEachFolderGroup(uids, (src, list) => performMove(list, src, folder));
          }}
        />
      )}

      {/* ── Keyboard Shortcuts Help ────────────────────────────────────────── */}
      <KeyboardShortcutsModal
        isOpen={keyboardHelpOpen}
        onClose={() => setKeyboardHelpOpen(false)}
      />

      {/* ── Panel Kiriman Terjadwal ────────────────────────────────────────── */}
      {pendingOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPendingOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-lg w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CalendarClock size={16} className="text-primary" />
                <h2 className="text-base font-semibold">Kiriman Terjadwal</h2>
              </div>
              <button onClick={() => setPendingOpen(false)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto">
              {pendingSends.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Tidak ada kiriman terjadwal.</p>
              )}
              {pendingSends.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.subject || '(Tanpa Subjek)'}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.to}</p>
                    <p className="text-xs text-primary mt-0.5">
                      {p.dueSoon ? 'Akan terkirim sebentar lagi' : `Terjadwal ${new Date(p.sendAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      undoScheduledSend(p.id)
                        .then(() => {
                          toast.success('Jadwal kirim dibatalkan.');
                          setPendingSends((prev) => prev.filter((x) => x.id !== p.id));
                        })
                        .catch((err) => toast.error(err.message || 'Gagal membatalkan.'));
                    }}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    Batalkan
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
