import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Inbox, Send, Trash2, FileText, Loader2, Edit3, Mail, Menu, X,
  AlertCircle, Search, Trash, CheckSquare, Square, MailOpen, RefreshCw,
  Folder, FolderPlus, Star, Undo2, Filter, ArrowUpDown, MessagesSquare, AlertTriangle, ChevronDown, ChevronRight,
  Archive, BellRing, CheckCheck, Clock, Paperclip,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fetchFolders, fetchMessages, fetchMessageHeaders, fetchMessage, fetchAttachmentData, searchMessages, getUnseenCount, deleteMessages, moveMessages, markRead, markFlagged, markMessagesAsJunk, createFolder, deleteFolder } from '../lib/api';
import { formatAddresses } from '../lib/format';
import { extractHtml, extractAttachments } from '../lib/messageHtml';
import { parseSizeToBytes } from '../lib/attachments';
import MessageReader from '../components/mailer/MessageReader';
import ComposeModal from '../components/mailer/ComposeModal';
import QuickRuleModal from '../components/mailer/QuickRuleModal';
import { MessageListSkeleton, FoldersListSkeleton } from '../components/Skeleton';
import { toast } from '../lib/toast';
import { DEFAULT_FOLDERS, STALE_TIMES, isSentOrDraftFolder, isReaderOwnedShortcut } from '../lib/constants';
import KeyboardShortcutsModal from '../components/KeyboardShortcuts';
import SwipeableRow from '../components/SwipeableRow';
import Avatar from '../components/Avatar';
import { FLAG_COLORS, FLAG_COLOR_KEYS, getFlagColor, setFlagColor } from '../lib/flagColors';
import { getRuleSummary, executeRules, claimAutoArchiveUids, releaseAutoArchiveClaims } from '../lib/autoArchive';
import { EMAIL_CATEGORIES, CATEGORY_LABELS, CATEGORY_BADGE_CLASS, classifyEmail, countCategories } from '../lib/emailCategory';
import { SNOOZE_PRESETS, loadSnoozes, snoozeMessage, unsnoozeMessage, unsnoozeMessages, pruneExpired } from '../lib/snooze';
import { groupMessagesByDate, reorderDateGroups, sortMessagesByDate, parseMessageDate, applyMessageWindow } from '../lib/dateGroups';

// Batas tampilan Kotak Masuk (bulan) — email lebih lama hanya via pencarian.
const MESSAGE_WINDOW_MONTHS = 5;

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
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-0.5 -mx-1 px-1">
      {tabs.map((t) => {
        const active = categoryFilter === t.id;
        return (
          <button
            key={t.id || 'all'}
            type="button"
            onClick={() => onSelect(active ? null : t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Resize hook ──────────────────────────────────────────────────────────────
function useResizable(defaultPx, minPx, maxPx) {
  const [width, setWidth] = useState(defaultPx);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(defaultPx);

  const onMouseDown = useCallback((e) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX.current;
      setWidth(Math.min(maxPx, Math.max(minPx, startW.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width, minPx, maxPx]);

  return [width, onMouseDown];
}

function DragHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="hidden md:flex w-1.5 shrink-0 h-full items-center justify-center group cursor-col-resize relative z-10 hover:bg-primary/20 transition-colors"
    >
      <div className="w-0.5 h-8 rounded-full bg-border group-hover:bg-primary transition-colors" />
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
function normalizeSubject(subject) {
  if (!subject || typeof subject !== 'string') return '';
  const prefixes = [
    /^Re:\s*/i, /^Fwd:\s*/i, /^Fw:\s*/i, /^AW:\s*/i, /^WG:\s*/i, /^Antw:\s*/i,
    /^[\[\(]?RE[\]\)]?[:\-]\s*/i, /^[\[\(]?FWD[\]\)]?[:\-]\s*/i,
    /^Vs:\s*/i, /^Enc:\s*/i, /^RIF:\s*/i, /^TR:\s*/i,
  ];
  let s = subject.trim();
  let prev;
  do {
    prev = s;
    for (const re of prefixes) {
      s = s.replace(re, '');
    }
  } while (s !== prev);
  return s.trim().toLowerCase() || '(tanpa subjek)';
}

function groupMessages(messages, asc = false) {
  const groups = [];
  const map = new Map();
  for (const msg of messages) {
    const key = normalizeSubject(msg.subject) || '(tanpa subjek)';
    if (map.has(key)) {
      map.get(key).messages.push(msg);
    } else {
      const group = { key, subject: String(msg.subject || '') || '(Tanpa Subjek)', messages: [msg] };
      map.set(key, group);
      groups.push(group);
    }
  }
  // Urutkan grup by tanggal pesan TERBARU di dalamnya (date-descending).
  // `asc` = 'terlama dulu' → balik urutan GRUP (thread tertua di atas),
  // sedangkan pesan di dalam tiap grup tetap terbaru-dulu (pola Gmail).
  const latestTs = (g) =>
    g.messages.reduce((max, m) => Math.max(max, parseMessageDate(m.date)?.getTime() || 0), 0);
  groups.sort((a, b) => { const d = latestTs(b) - latestTs(a); return d !== 0 ? d : 0; });
  if (asc) groups.reverse();
  return groups;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function MailPage() {
  const { user, sortAsc, setSortAsc, conversationView, setConversationView } = useAuthStore();
  const queryClient = useQueryClient();

  const [selectedFolder, setSelectedFolder] = useState('folderINBOX');
  const [selectedMsgId, setSelectedMsgId] = useState(null);
  const [folderPanelOpen, setFolderPanelOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
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
  const [flagFilter, setFlagFilter] = useState(null); // color key or null
  const [categoryFilter, setCategoryFilter] = useState(null); // EMAIL_CATEGORIES key or null
  const [unreadOnly, setUnreadOnly] = useState(false); // filter hanya belum dibaca
  const [hasAttachmentOnly, setHasAttachmentOnly] = useState(false); // filter hanya yang berlampiran
  const [snoozePicker, setSnoozePicker] = useState(null); // { uid, x, y } — pilih durasi snooze
  const [quickRuleSender, setQuickRuleSender] = useState(null); // sender label utk QuickRuleModal
  const [snoozeTick, setSnoozeTick] = useState(0); // bump utk re-render setelah prune
  const [expandedConversations, setExpandedConversations] = useState(new Set());
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set()); // folder sidebar yang di-ciutkan
  const prevUnseenRef = useRef(null); // notifikasi email baru — bandingkan unseen count
  const notifGrantedRef = useRef(false); // cegah minta izin berulang
  const [selectionMode, setSelectionMode] = useState(false); // mode seleksi (long-press di layar sentuh)
  const [isTouch] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches
  );
  // Dialog folder: { mode: 'create', parent } | { mode: 'delete', folder } | null
  const [folderDialog, setFolderDialog] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');

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

  // Resize handles
  const [folderW, onFolderDrag] = useResizable(220, 160, 320);
  const [listW, onListDrag] = useResizable(340, 240, 560);

  // Reset selection on folder/search change (keep flagFilter + categoryFilter)
  useEffect(() => {
    setSelectedUids([]);
    setSelectedMsgId(null);
    setSelectionMode(false);
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

  const toggleCollapsed = useCallback((id) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  // Reset header tambahan saat query refetch (delete/move/archive → list berubah).
  useEffect(() => {
    setExtraMessages([]);
    setLoadingMore(false);
    stopFetchingRef.current = false;
  }, [dataUpdatedAt]);
  const ruleSummary = getRuleSummary(user?.email);
  const enabledRules = ruleSummary.enabled;

  // ── Notifikasi email baru ───────────────────────────────────────────────────
  // Tab title badge (selalu) + Notification API (bila diizinkan).
  const unseenCount = unseenData?.unseenCount ?? 0;
  useEffect(() => {
    const prev = prevUnseenRef.current;
    const isNewEmail = prev !== null && unseenCount > prev && selectedFolder === 'folderINBOX';
    prevUnseenRef.current = unseenCount;

    // Tab title: badge "(n)" bila ada belum dibaca
    document.title = unseenCount > 0
      ? `(${unseenCount}) PCP Express Mail`
      : 'PCP Express Mail';

    if (!isNewEmail) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const n = new Notification('Email baru', {
          body: `${unseenCount} pesan belum dibaca di Kotak Masuk`,
          tag: 'sogo-new-mail',
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch { /* Safari/older — abaikan */ }
    }
  }, [unseenCount, selectedFolder]);

  // Minta izin notifikasi sekali saat pertama kali (setelah ada unseen > 0)
  useEffect(() => {
    if (notifGrantedRef.current || typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      notifGrantedRef.current = true;
      return;
    }
    // Default — minta saat user sudah login dan mailbox dimuat
    if (unseenCount > 0 || !loadingMessages) {
      notifGrantedRef.current = true;
      Notification.requestPermission().catch(() => {});
    }
  }, [unseenCount, loadingMessages]);

  // ── Load More (client-side pagination, after messages assignment) ─────────
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleMessages = messagesInWindow.slice(0, visibleCount);

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

  // Folder Arsip — SOGo/Dovecot punya folder root "Archive" (diverifikasi).
  const archiveFolder = (Array.isArray(folders) ? folders : [])
    .find((f) => /(^|\/)archive$/i.test(f.path || f.name || '')) || null;

  // Resolver folder id → objek (moveMessages butuh `path`, bukan id berprefix)
  const folderById = (id) => (Array.isArray(folders) ? folders : []).find((f) => f.id === id) || null;
  const trashFolder = folderById('folderTrash') || { path: 'Trash' };

  // Filter messages by flag color / kategori / belum dibaca / snooze (client-side)
  const displayMessages = visibleMessages.filter((m) => {
    // Di-snooze → sembunyi dari daftar biasa. SAAT MENCARI pesan yang
    // di-snooze TETAP muncul — search adalah satu-satunya jalan menemukannya
    // (pola Gmail). Sebelumnya tersembunyi juga di hasil search → tidak bisa
    // ditemukan sampai waktu wake (bug).
    if (!searchQuery && snoozedUids.has(String(m.uid))) return false;
    if (flagFilter && getFlagColor(user?.email, m.uid) !== flagFilter) return false;
    if (categoryFilter && classifyEmail(m) !== categoryFilter) return false;
    if (unreadOnly && m.isRead) return false;
    if (hasAttachmentOnly && !m.hasAtt) return false;
    return true;
  });

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

  // Sort by DATE (client-side), selalu date-descending untuk semua view.
  // Sebelumnya sort by UID: (1) uid SOGo per-folder tidak dijamin sekuensial
  // dgn waktu → urutan tampil bisa menyimpang dari tanggal; (2) saat sortAsc
  // (terlama dulu) urutan baris terbalik → header date-group muncul terbalik
  // (Lebih Lama di atas, Hari Ini di bawah) + sticky header salah menempel.
  // Sekarang sortAsc hanya membalik urutan GRUP (date-group header / thread
  // conversation), isi tiap grup tetap terbaru-dulu — konsisten dua view.
  const sortedMessages = useMemo(() => {
    return sortMessagesByDate(displayMessages);
  }, [displayMessages]);

  // Conversation grouping
  const conversationGroups = useMemo(() => {
    if (!conversationView) return [];
    return groupMessages(sortedMessages, sortAsc);
  }, [sortedMessages, conversationView, sortAsc]);

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

  const toggleConversation = useCallback((key) => {
    setExpandedConversations(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Masih ada yang bisa ditampilkan/dimuat: reveal client-side ATAU fetch server-side.
  const hasMore = visibleCount < messagesInWindow.length ||
    (remainingUids.length > 0 && !stopFetchingRef.current);

  // Jalankan rules untuk pesan yang baru dimuat
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
      const movedUids = actions.flatMap((a) => a.uids);
      // Lepas klaim utk pesan yang TIDAK jadi dipindah (snooze / tidak match
      // rule / diklaim tab lain) — biar tab lain atau run berikutnya bisa
      // memprosesnya.
      releaseAutoArchiveClaims(
        user.email,
        unprocessed.filter((m) => !movedUids.includes(m.uid)).map((m) => m.uid)
      );
      // Tandai processed HANYA pesan yang benar-benar diproses tab ini.
      // Pesan yang di-skip karena diklaim tab lain TIDAK ditandai — saat
      // klaim kedaluwarsa/rileks, run berikutnya akan mencobanya lagi.
      unprocessed.forEach((m) => {
        if (movedUids.includes(m.uid)) rulesProcessed.current[m.uid] = true;
      });

      if (actions.length > 0) {
        const totalMoved = actions.reduce((sum, a) => sum + a.uids.length, 0);
        toast.success(`${totalMoved} email diarsipkan otomatis oleh aturan`, 4000);
        queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
      }
    }).catch((err) => {
      // Gagal (network/SOGo) — lepas klaim agar run berikutnya bisa coba lagi.
      releaseAutoArchiveClaims(user.email, unprocessed.map((m) => m.uid));
      console.warn('[rules] Gagal menjalankan aturan otomatis:', err?.message || err);
      // Bug fix: tampilkan toast error ke user (bukan hanya console.warn)
      toast.warning('Sebagian aturan gagal dijalankan — coba lagi nanti.');
    });
  }, [messages.length, selectedFolder, user?.email, user?.sogoToken, enabledRules, snoozedUids, searchQuery]);

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
  function scheduleDelete(uids) {
    if (!uids || uids.length === 0) return;
    const key = Date.now().toString();

    pendingTimers.current[key] = setTimeout(() => {
      moveMutation.mutate({ uids, targetFolder: trashFolder });
      delete pendingTimers.current[key];
    }, 6000);

    toast.undo(
      `${uids.length} pesan akan dipindah ke Sampah`,
      () => {
        clearTimeout(pendingTimers.current[key]);
        delete pendingTimers.current[key];
      },
      6000
    );
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  // Bersihkan entri snooze untuk pesan yang dipindah/hapus dari folder asal:
  // pesan pindah folder → UID baru di folder tujuan, entri di folder asal jadi
  // yatim dan bisa menyembunyikan pesan baru yang memakai ulang UID tsb.
  // Bump snoozeTick saat ada yang terhapus agar memo snoozedUids ter-refresh
  // (tanpa itu pesan tetap tersembunyi sampai interval 60 detik berikutnya).
  const clearSnoozesForMoved = (uids) => {
    if (!user?.email || !Array.isArray(uids) || uids.length === 0) return;
    const removed = unsnoozeMessages(user.email, selectedFolder, uids);
    if (removed > 0) setSnoozeTick((t) => t + 1);
  };

  const moveMutation = useMutation({
    mutationFn: ({ uids, targetFolder }) =>
      moveMessages(user.sogoToken, selectedFolder, uids, targetFolder),
    onSuccess: (_data, vars) => {
      clearSnoozesForMoved(vars?.uids || []);
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
      setSelectedUids([]);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => scheduleDelete(selectedUids),
    onSuccess: () => {
      if (selectedUids.includes(selectedMsgId)) setSelectedMsgId(null);
    },
  });

  const bulkMarkReadMutation = useMutation({
    mutationFn: (read) => Promise.all(selectedUids.map((uid) => markRead(user.sogoToken, selectedFolder, uid, read))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      setSelectedUids([]);
    },
  });

  const bulkFlagMutation = useMutation({
    mutationFn: (flagged) => Promise.all(selectedUids.map((uid) => markFlagged(user.sogoToken, selectedFolder, uid, flagged))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
      setSelectedUids([]);
    },
  });

  const quickMoveMutation = useMutation({
    mutationFn: ({ targetFolder }) =>
      moveMessages(user.sogoToken, selectedFolder, selectedUids, targetFolder),
    onSuccess: () => {
      clearSnoozesForMoved(selectedUids);
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      setSelectedUids([]);
      toast.success('Pesan dipindahkan');
    },
  });

  // Laporkan Spam — native SOGo markMessagesAsJunk (set flag + pindah ke Junk).
  const junkMutation = useMutation({
    mutationFn: ({ uids }) => markMessagesAsJunk(user.sogoToken, selectedFolder, uids),
    onSuccess: (_data, vars) => {
      clearSnoozesForMoved(vars?.uids || []);
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      setSelectedUids([]);
      toast.success('Pesan dilaporkan sebagai spam');
    },
    onError: (err) => toast.error(err?.message || 'Gagal melaporkan spam.'),
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

  // Tandai semua pesan di folder aktif sebagai dibaca (batch per-uid)
  const markAllReadMutation = useMutation({
    mutationFn: () =>
      Promise.all(messages.map((m) => markRead(user.sogoToken, selectedFolder, m.uid, true))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      toast.success('Semua pesan ditandai dibaca.');
    },
    onError: () => toast.error('Gagal menandai semua pesan.'),
  });

  // Arsip: pindahkan semua pesan folder aktif ke folder Archive
  const archiveMutation = useMutation({
    mutationFn: () => {
      if (!archiveFolder) throw new Error('Folder Arsip tidak ditemukan.');
      return moveMessages(user.sogoToken, selectedFolder, messages.map((m) => m.uid), archiveFolder);
    },
    onSuccess: () => {
      // Arsip mengubah UID pesan (UID per-folder SOGo) → entri snooze di
      // folder asal menjadi yatim; hapus agar tidak menyembunyikan pesan
      // inbox baru yang kebetulan memakai ulang UID yang sama.
      clearSnoozesForMoved(messages.map((m) => m.uid));
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      toast.success('Pesan dipindahkan ke Arsip.');
    },
    onError: (err) => toast.error(err?.message || 'Gagal mengarsipkan pesan.'),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const isSentOrDraft = isSentOrDraftFolder(selectedFolder, folders);
  // Folder Draf (default maupun custom) — utk tombol hapus cepat per-baris.
  const isDraftFolder = selectedFolder === 'folderDrafts' ||
    folders.some((f) => f.id === selectedFolder && (f.type === 'draft' || f.type === 'drafts'));

  const toggleSelectAll = () => {
    setSelectedUids((prev) =>
      prev.length === messages.length && messages.length > 0 ? [] : messages.map((m) => m.uid)
    );
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
    return sortedMessages.map((m) => m.uid);
  }, [conversationView, conversationGroups, sortedMessages]);

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
        extractAttachments(detail.parts).map(async (att) => {
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

  function handleRowClick(uid) {
    // Klik sintetis browser setelah long-press — jangan buka/toggle dobel
    if (suppressClick.current.delete(uid)) return;
    if (selectionMode) {
      toggleSelect(uid); // di mode seleksi, tap = toggle pilihan (pola Gmail)
      return;
    }
    // Draft: buka editor compose untuk dilanjutkan, bukan reader baca-saja.
    if (isDraftFolder) {
      openDraftForEdit(uid);
      return;
    }
    setSelectedMsgId(uid);
  }

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
  useEffect(() => {
    const handler = (e) => {
      // Skip jika user sedang mengetik di input/textarea/editor
      const tag = e.target.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.contentEditable === 'true') {
        // Kecuali '/' untuk search — pake ctrl+/ atau command+/
        if (e.key === '/' && e.ctrlKey) {
          e.preventDefault();
          searchInputRef.current?.focus();
          return;
        }
        // Escape untuk blur input
        if (e.key === 'Escape') {
          e.target.blur();
          return;
        }
        return;
      }

      // Jangan curi kombinasi browser/OS (cmd/ctrl+C copy, cmd/ctrl+R refresh,
      // cmd+shift+R hard refresh, cmd/ctrl+F find, dll). Shortcut app hanya
      // tombol tunggal (tanpa modifier) — kombo tetap perilaku asli browser.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Jika compose modal atau keyboard help terbuka — hanya escape yang works
      if (composeOpen || keyboardHelpOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (keyboardHelpOpen) setKeyboardHelpOpen(false);
        }
        return;
      }

      // Filter berdasarkan key
      const key = e.key.toLowerCase();

      // Reader terbuka → aksi per-pesan (s/r/f) dimiliki MessageReader (yang
      // juga listen keydown global). Tanpa guard ini 's' toggle flag DUA kali
      // (MailPage bulkFlagMutation + MessageReader flagMutation) = net nol +
      // dua request; 'r'/'f' juga membuka compose dua kali.
      if (isReaderOwnedShortcut(selectedMsgId, key)) return;

      if (key === '?') {
        e.preventDefault();
        setKeyboardHelpOpen(true);
        return;
      }

      if (key === 'escape') {
        e.preventDefault();
        if (selectedMsgId) {
          setSelectedMsgId(null);
        } else if (selectionMode) {
          setSelectionMode(false);
          setSelectedUids([]);
        } else {
          setSelectedUids([]);
        }
        return;
      }

      // Navigasi j/k hanya jika ada pesan dan bukan conversation view.
      // Urutan = sortedMessages (urutan tampil date-desc) — konsisten dgn
      // indeks yang dipakai renderMessageRow utk highlight focus.
      if (!conversationView && sortedMessages.length > 0) {
        if (key === 'j') {
          e.preventDefault();
          const next = Math.min(focusIdx + 1, sortedMessages.length - 1);
          setFocusIdx(next);
          // Scroll ke view
          return;
        }
        if (key === 'k') {
          e.preventDefault();
          const prev = Math.max(0, focusIdx - 1);
          setFocusIdx(prev);
          return;
        }
        if ((key === 'o' || key === 'enter') && focusIdx >= 0) {
          e.preventDefault();
          const msg = sortedMessages[focusIdx];
          if (msg) setSelectedMsgId(msg.uid);
          return;
        }
      }

      if (key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (key === 'c') {
        e.preventDefault();
        setComposeData(null);
        setComposeOpen(true);
        return;
      }

      if (key === 'a') {
        e.preventDefault();
        if (selectedUids.length === messages.length) {
          setSelectedUids([]);
        } else {
          setSelectedUids(messages.map((m) => m.uid));
        }
        return;
      }

      // Aksi pada pesan terpilih atau yang di-focus
      const targetUids = selectedUids.length > 0 ? selectedUids : (focusIdx >= 0 ? [sortedMessages[focusIdx]?.uid] : []);
      if (targetUids.length === 0) return;

      if (key === 's') {
        e.preventDefault();
        const found = messages.find((m) => targetUids.includes(m.uid));
        if (found) bulkFlagMutation.mutate(!found.isFlagged);
        return;
      }

      if (key === 'u') {
        e.preventDefault();
        bulkMarkReadMutation.mutate(false);
        return;
      }

      if (key === 'x') {
        e.preventDefault();
        bulkMarkReadMutation.mutate(true);
        return;
      }

      if (key === 'd' || key === '#') {
        e.preventDefault();
        bulkDeleteMutation.mutate();
        return;
      }

      if (key === '!' && selectedFolder !== 'folderJunk') {
        e.preventDefault();
        junkMutation.mutate({ uids: targetUids });
        return;
      }

      if (key === 'm') {
        e.preventDefault();
        // Buka dropdown move — trigger via simulated click on the select
        const select = document.querySelector('.bulk-move-select');
        if (select) {
          select.focus();
          select.click();
        }
        return;
      }

      if (key === 'r' && selectedMsgId) {
        // Reply — handled oleh MessageReader, trigger klik tombol reply
        e.preventDefault();
        // Focus reply button
        const replyBtn = document.querySelector('[data-shortcut="reply"]');
        replyBtn?.click();
        return;
      }

      if (key === 'f' && selectedMsgId) {
        e.preventDefault();
        const fwdBtn = document.querySelector('[data-shortcut="forward"]');
        fwdBtn?.click();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    messages, sortedMessages, focusIdx, selectedMsgId, selectedUids, selectionMode, composeOpen, keyboardHelpOpen,
    bulkFlagMutation, bulkMarkReadMutation, bulkDeleteMutation,
  ]);

  // Reset focus index saat daftar pesan berubah
  useEffect(() => {
    setFocusIdx(-1);
  }, [selectedFolder, searchQuery, visibleMessages.length]);

  // Scroll message into view when focusIdx changes
  const msgRefs = useRef({});
  useEffect(() => {
    if (focusIdx >= 0) {
      const msg = sortedMessages[focusIdx];
      if (msg) {
        const el = msgRefs.current[msg.uid];
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusIdx, sortedMessages]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const selectedFolderMeta = folders.find((f) => f.id === selectedFolder) || {
    label: selectedFolder,
    type: 'custom',
  };

  // Message row renderer (shared by flat list & conversation groups)
  const renderMessageRow = (msg, idx = -1) => {
    const isActive = selectedMsgId === msg.uid;
    const isSelected = selectedUids.includes(msg.uid);
    const isFocused = !conversationView && focusIdx === idx;
    // Nama yang ditampilkan — dipakai juga untuk inisial avatar
    const senderLabel = isSentOrDraft ? (msg.to || '(Tanpa Penerima)') : (msg.from || 'Unknown Sender');
    const colorKey = getFlagColor(user?.email, msg.uid);
    const hasFlag = !!msg.isFlagged || !!colorKey;
    // Kontrol floating (checkbox + star) menimpa avatar — tidak makan ruang baris.
    // Desktop: muncul saat hover. Layar sentuh: star selalu tampil, checkbox saat mode seleksi.
    const checkboxVisible = isSelected || (isTouch && selectionMode);
    const starVisible = hasFlag || isTouch;

    return (
      <SwipeableRow
        key={msg.uid}
        onSwipe={() => suppressClick.current.add(msg.uid)}
        onSwipeLeft={() => scheduleDelete([msg.uid])}
        onSwipeRight={() => {
          markRead(user.sogoToken, selectedFolder, msg.uid, true).then(() => {
            queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
            queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
          }).catch(() => {});
        }}
      >
        <div
          onClick={() => handleRowClick(msg.uid)}
          ref={(el) => { if (idx >= 0) msgRefs.current[msg.uid] = el; }}
          onTouchStart={(e) => handleRowTouchStart(e, msg.uid)}
          onTouchMove={(e) => handleRowTouchMove(e, msg.uid)}
          onTouchEnd={() => handleRowTouchEnd(msg.uid)}
          onTouchCancel={() => handleRowTouchEnd(msg.uid)}
          className={`group w-full flex items-start text-left p-3 hover:bg-muted/50 transition-colors cursor-pointer border-l-4 select-none [-webkit-touch-callout:none] ${
            isActive ? 'bg-muted border-primary' : isFocused ? 'border-primary/40 bg-muted/30' : 'border-transparent'
          } ${isSelected ? 'bg-primary/5' : ''}`}
        >
          {/* Avatar — saat hover/seleksi diganti checkbox (pola Gmail, tidak menumpuk) */}
          <div className="relative w-8 h-8 shrink-0 mr-2 mt-0.5">
            <div className={`absolute inset-0 rounded-full overflow-hidden transition-opacity duration-150 ${
              checkboxVisible ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
            }`}>
              <Avatar name={senderLabel} size="sm" />
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
                <CheckSquare size={15} className="text-primary" />
              ) : (
                <Square size={15} className="text-muted-foreground" />
              )}
            </button>

            {flagPickerOpen?.msgUid === msg.uid && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFlagPickerOpen(null)} />
                <div
                  className="fixed z-50 bg-card border border-border shadow-xl rounded-xl p-2 flex gap-1.5"
                  style={{ left: Math.min(flagPickerOpen.x, window.innerWidth - 200), top: Math.min(flagPickerOpen.y, window.innerHeight - 80) }}
                >
                  {FLAG_COLOR_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentColor = getFlagColor(user?.email, msg.uid);
                        if (currentColor === key) {
                          setFlagColor(user?.email, msg.uid, null);
                          if (!msg.isFlagged) markFlagged(user.sogoToken, selectedFolder, msg.uid, true).then(() => queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] })).catch(() => {});
                        } else {
                          setFlagColor(user?.email, msg.uid, key);
                          if (!msg.isFlagged) markFlagged(user.sogoToken, selectedFolder, msg.uid, true).then(() => queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] })).catch(() => {});
                        }
                        setFlagPickerOpen(null);
                      }}
                      className={`w-9 h-9 rounded-full ${FLAG_COLORS[key].bg} hover:scale-110 transition-transform ${
                        getFlagColor(user?.email, msg.uid) === key ? 'ring-2 ring-offset-2 ring-border' : ''
                      }`}
                      title={FLAG_COLORS[key].label}
                      aria-label={`Tandai ${FLAG_COLORS[key].label.toLowerCase()}`}
                      aria-pressed={getFlagColor(user?.email, msg.uid) === key}
                    />
                  ))}
                  <div className="w-px bg-border mx-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFlagColor(user?.email, msg.uid, null);
                      if (msg.isFlagged) markFlagged(user.sogoToken, selectedFolder, msg.uid, false).then(() => queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] })).catch(() => {});
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
                  className="fixed z-50 bg-card border border-border shadow-xl rounded-xl p-1.5 min-w-[140px]"
                  style={{ left: Math.min(snoozePicker.x, window.innerWidth - 180), top: Math.min(snoozePicker.y, window.innerHeight - 200) }}
                >
                  {SNOOZE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={(e) => { e.stopPropagation(); handleSnooze(msg.uid, p.hours); }}
                      className="block w-full text-left px-3 min-h-11 flex items-center rounded-lg text-sm hover:bg-muted transition-colors"
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
            <div className="flex justify-between items-baseline mb-1 gap-2">
              <button
                type="button"
                onClick={(e) => searchBySender(senderLabel, e)}
                title={`Cari semua email dari pengirim ini`}
                className={`text-sm truncate text-left hover:underline ${msg.isRead ? 'text-muted-foreground font-medium' : 'text-foreground font-bold'}`}
              >
                {senderLabel}
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Buat aturan utk pengirim ini — hover desktop */}
                {!isTouch && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuickRuleSender(senderLabel);
                    }}
                    tabIndex={-1}
                    className="p-1.5 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto text-muted-foreground hover:text-primary transition-opacity"
                    title="Buat aturan otomatis untuk pengirim ini"
                    aria-label="Buat aturan otomatis untuk pengirim ini"
                  >
                    <Filter size={14} />
                  </button>
                )}
                {/* Snooze per-baris — hover desktop; picker durasi */}
                {selectedFolder === 'folderINBOX' && !isTouch && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSnoozePicker(snoozePicker?.uid === msg.uid ? null : { uid: msg.uid, x: e.clientX, y: e.clientY });
                    }}
                    tabIndex={-1}
                    className="p-1.5 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto text-muted-foreground hover:text-primary transition-opacity"
                    title="Snooze"
                    aria-label="Tunda pesan"
                  >
                    <Clock size={14} />
                  </button>
                )}
                {/* Arsip cepat per-baris — hanya saat hover desktop */}
                {archiveFolder && selectedFolder !== archiveFolder.id && !isTouch && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveMessages(user.sogoToken, selectedFolder, [msg.uid], archiveFolder)
                        .then(() => {
                          queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
                          queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
                        })
                        .catch(() => toast.error('Gagal mengarsipkan pesan.'));
                    }}
                    tabIndex={-1}
                    className="p-1.5 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto text-muted-foreground hover:text-primary transition-opacity"
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
                      scheduleDelete([msg.uid]);
                    }}
                    tabIndex={-1}
                    className="p-1.5 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto text-muted-foreground hover:text-destructive transition-opacity"
                    title="Hapus"
                    aria-label="Hapus pesan"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {/* Star/flag — di kanan (tidak nimpa avatar): berflag atau hover (desktop);
                    selalu tampil di layar sentuh */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlagPickerOpen(flagPickerOpen?.msgUid === msg.uid ? null : { msgUid: msg.uid, x: e.clientX, y: e.clientY });
                  }}
                  tabIndex={starVisible ? 0 : -1}
                  className={`p-1.5 rounded-md transition-opacity ${
                    starVisible ? '' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
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
                <span className="text-xs text-muted-foreground">{msg.date}</span>
              </div>
            </div>
            <div className={`text-sm truncate ${msg.isRead ? 'text-muted-foreground' : 'text-primary font-medium'}`}>
              {typeof msg.subject === 'string' && msg.subject ? msg.subject : '(Tanpa Subjek)'}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {(() => {
                const cat = classifyEmail(msg);
                if (cat === EMAIL_CATEGORIES.UTAMA || cat === EMAIL_CATEGORIES.SPAM) return null;
                return (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_BADGE_CLASS[cat] || ''}`}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                );
              })()}
              {msg.hasAtt && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">📎 Lampiran</span>
              )}
            </div>
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
  const renderFolderRow = (folder) => {
    const children = childrenByParent[folder.id] || [];
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedFolders.has(folder.id);
    const Icon = getFolderIcon(folder.type);
    const isActive = selectedFolder === folder.id && !flagFilter;
    const badge = folder.type === 'inbox'
      ? (unseenData?.unseenCount || 0)
      : (perFolderUnseen.data?.[folder.id] || 0);
    const isDefault = DEFAULT_FOLDERS.some((d) => d.id === folder.id);
    const rowActionsVisible = isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100';

    return (
      <React.Fragment key={folder.id}>
        <div
          className="flex items-center group"
          style={{ paddingLeft: `${(folder.depth || 0) * 16}px` }}
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
            onClick={() => { setSelectedFolder(folder.id); setFlagFilter(null); setFolderPanelOpen(false); setSearchQuery(''); setSearchInput(''); }}
            className={`flex-1 flex items-center justify-between min-w-0 px-2 py-2.5 rounded-xl text-sm transition-all ${
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon size={18} className="shrink-0" />
              <span className="truncate">{folder.label}</span>
            </div>
            {badge > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-1">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
          {/* Aksi folder: buat subfolder (+), hapus (non-default only) */}
          <div className={`flex items-center gap-0.5 shrink-0 pr-1 transition-opacity ${rowActionsVisible}`}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFolderDialog({ mode: 'create', parent: folder }); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted"
              title={`Buat subfolder di ${folder.label}`}
              aria-label={`Buat subfolder di ${folder.label}`}
            >
              <FolderPlus size={14} />
            </button>
            {!isDefault && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFolderDialog({ mode: 'delete', folder }); }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title={`Hapus ${folder.label}`}
                aria-label={`Hapus ${folder.label}`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        {hasChildren && !isCollapsed && children.map(renderFolderRow)}
      </React.Fragment>
    );
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
        {/* Compose button */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-2">
          <button
            onClick={() => { setComposeData(null); setComposeOpen(true); setFolderPanelOpen(false); }}
            className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 px-4 rounded-xl transition-colors shadow-sm"
          >
            <Edit3 size={18} />
            <span>Tulis Pesan</span>
          </button>
          <button
            className="md:hidden p-2 rounded-full hover:bg-muted text-muted-foreground"
            onClick={() => setFolderPanelOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Folder list — tree expand/collapse */}
        <nav className="p-3 flex-1 overflow-y-auto space-y-0.5">
          {loadingFolders ? (
            <FoldersListSkeleton />
          ) : (
            (Array.isArray(folders) ? folders : [])
              .filter((f) => !folderPathOf(f).includes('/'))
              .map(renderFolderRow)
          )}

          {/* ── Flag Color Filter ──────────────────────────────────────── */}
          <div className="pt-3 mt-2 border-t border-border">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Filter Flag
            </div>
            <div className="mt-1 space-y-0.5">
              {FLAG_COLOR_KEYS.map((key) => {
                const colorDef = FLAG_COLORS[key];
                const isActive = flagFilter === key;
                const count = visibleMessages.filter((m) => getFlagColor(user?.email, m.uid) === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setFlagFilter(isActive ? null : key);
                      setFolderPanelOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all ${
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${colorDef.bg}`} />
                      <span>{colorDef.label}</span>
                    </div>
                    {count > 0 && (
                      <span className="text-[10px] text-muted-foreground">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      <DragHandle onMouseDown={onFolderDrag} />

      {/* ── Message List ───────────────────────────────────────────────────── */}
      <div
        style={{ width: listW }}
        className={`flex flex-col border-r border-border bg-background shrink-0 transition-all ${
          selectedMsgId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-border flex flex-col gap-3 bg-card sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                className="md:hidden p-2 rounded-md hover:bg-muted text-muted-foreground"
                onClick={() => setFolderPanelOpen(true)}
              >
                <Menu size={20} />
              </button>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                {selectedFolderMeta.label}
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 tabular-nums">
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
              {isFetchingMessages && !loadingMessages && (
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setConversationView(!conversationView)}
                className={`min-w-11 min-h-11 flex items-center justify-center rounded-full transition-colors ${
                  conversationView ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                }`}
                title={conversationView ? 'Tampilan biasa' : 'Tampilan percakapan'}
                aria-label={conversationView ? 'Tampilan biasa' : 'Tampilan percakapan'}
                aria-pressed={conversationView}
              >
                <MessagesSquare size={16} />
              </button>
              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                className={`min-w-11 min-h-11 flex items-center justify-center rounded-full transition-colors ${
                  sortAsc ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                }`}
                title={sortAsc ? 'Terlama dulu' : 'Terbaru dulu'}
                aria-label={sortAsc ? 'Urutkan terlama dulu' : 'Urutkan terbaru dulu'}
                aria-pressed={sortAsc}
              >
                <ArrowUpDown size={16} className={sortAsc ? 'rotate-180' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setUnreadOnly(!unreadOnly)}
                className={`min-w-11 min-h-11 flex items-center justify-center rounded-full transition-colors ${
                  unreadOnly ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                }`}
                title={unreadOnly ? 'Tampilkan semua' : 'Hanya belum dibaca'}
                aria-label={unreadOnly ? 'Tampilkan semua pesan' : 'Hanya pesan belum dibaca'}
                aria-pressed={unreadOnly}
              >
                <MailOpen size={16} />
              </button>
              <button
                type="button"
                onClick={() => setHasAttachmentOnly(!hasAttachmentOnly)}
                className={`min-w-11 min-h-11 flex items-center justify-center rounded-full transition-colors ${
                  hasAttachmentOnly ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                }`}
                title={hasAttachmentOnly ? 'Tampilkan semua' : 'Hanya email berlampiran'}
                aria-label={hasAttachmentOnly ? 'Tampilkan semua email' : 'Hanya email berlampiran'}
                aria-pressed={hasAttachmentOnly}
              >
                <Paperclip size={16} />
              </button>
              <button
                type="button"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, selectedFolder] })}
                className="min-w-11 min-h-11 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
                title="Muat ulang pesan"
                aria-label="Muat ulang pesan"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* Aksi cepat: tandai semua dibaca + arsip */}
          {messages.length > 0 && (
            <div className="flex items-center gap-1 -mx-1 px-1">
              <button
                onClick={() => markAllReadMutation.mutate()}
                className="flex items-center gap-1.5 px-2.5 min-h-11 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Tandai semua di folder ini sebagai dibaca"
              >
                <CheckCheck size={14} />
                Tandai Semua Dibaca
              </button>
              {archiveFolder && selectedFolder !== archiveFolder.id && (
                <button
                  onClick={() => archiveMutation.mutate()}
                  className="flex items-center gap-1.5 px-2.5 min-h-11 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Pindahkan semua ke Arsip"
                >
                  <Archive size={14} />
                  Arsip
                </button>
              )}
            </div>
          )}

          {/* Category tabs — Utama/Promosi/Sosial/Update (mirip Gmail) */}
          {!searchQuery && (
            <CategoryTabs
              messages={messages}
              categoryFilter={categoryFilter}
              onSelect={setCategoryFilter}
            />
          )}

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
                  className="w-full bg-muted border-none rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                    aria-label="Bersihkan pencarian"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowSearchFilter(!showSearchFilter)}
                className={`min-w-11 min-h-11 flex items-center justify-center rounded-lg transition-colors ${
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
              <div className="absolute top-full left-0 right-12 mt-1 bg-card border border-border shadow-lg rounded-lg z-20 p-1.5 flex gap-1 flex-wrap">
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
        </div>

        {/* Bulk actions toolbar */}
        {selectedUids.length > 0 && (
          <div className="bg-primary/10 px-4 py-2 flex items-center justify-between border-b border-border text-sm flex-wrap gap-2">
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
            <div className="flex items-center gap-2">
              <select
                className="bulk-move-select bg-background border border-border rounded px-2 min-h-11 text-xs text-foreground"
                aria-label="Pindah pesan terpilih ke folder"
                onChange={(e) => { if (e.target.value) { quickMoveMutation.mutate({ targetFolder: folderById(e.target.value) || e.target.value }); e.target.value = ''; } }}
              >
                <option value="">Pindah ke...</option>
                {folders.filter((f) => f.id !== selectedFolder).map((f) => (
                  <option key={f.id} value={f.id}>{'\u00A0'.repeat((f.depth || 0) * 2)}{f.label}</option>
                ))}
              </select>
              <button
                onClick={() => bulkFlagMutation.mutate(true)}
                className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 rounded"
                title="Tandai berbintang"
                aria-label="Tandai berbintang"
              >
                <Star size={16} />
              </button>
              <button
                onClick={() => bulkMarkReadMutation.mutate(true)}
                className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-primary rounded"
                title="Tandai dibaca"
                aria-label="Tandai pesan terpilih sebagai dibaca"
              >
                <MailOpen size={16} />
              </button>
              <button
                onClick={() => bulkMarkReadMutation.mutate(false)}
                className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-primary rounded"
                title="Tandai belum dibaca"
                aria-label="Tandai pesan terpilih sebagai belum dibaca"
              >
                <Mail size={16} />
              </button>
              {selectedFolder !== 'folderJunk' && (
                <button
                  onClick={() => junkMutation.mutate({ uids: selectedUids })}
                  className="min-w-11 min-h-11 flex items-center justify-center text-orange-600 dark:text-orange-500 hover:bg-orange-500/10 rounded"
                  title="Laporkan Spam"
                  aria-label="Laporkan pesan terpilih sebagai spam"
                >
                  <AlertTriangle size={16} />
                </button>
              )}
              <button
                onClick={() => bulkDeleteMutation.mutate()}
                className="min-w-11 min-h-11 flex items-center justify-center text-destructive hover:bg-destructive/10 rounded"
                title="Hapus"
                aria-label="Hapus pesan terpilih"
              >
                <Trash size={16} />
              </button>
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
        <div ref={listRef} className="flex-1 overflow-y-auto">
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
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground gap-4 px-6">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                {searchQuery ? (
                  <Search size={24} className="opacity-40" />
                ) : (
                  <Mail size={24} className="opacity-40" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  {searchQuery ? 'Tidak ada hasil pencarian' : 'Belum ada pesan'}
                </p>
                <p className="text-xs mt-1">
                  {searchQuery
                    ? `Coba ubah kata kunci "${searchQuery}"`
                    : `Folder ${selectedFolderMeta.label} kosong`}
                </p>
              </div>
            </div>            ) : (
            <div className="divide-y divide-border">
              {conversationView && conversationGroups.length > 0
                ? conversationGroups.map((group) => {
                    const isExpanded = expandedConversations.has(group.key);
                    const senders = [...new Set(group.messages.map(m => {
                      const from = m.from || '';
                      const name = from.split('<')[0].trim();
                      return name || from || 'Unknown Sender';
                    }))];
                    return (
                      <div key={group.key} className="border-b border-border last:border-b-0">
                        {/* Group header */}
                        <button
                          onClick={() => toggleConversation(group.key)}
                          className="w-full flex items-center gap-3 p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                        >
                          <MessagesSquare size={16} className="text-muted-foreground shrink-0" />
                          {/* Avatar inisial pengirim pertama */}
                          <Avatar name={senders[0]} size="sm" className="shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">{group.subject}</span>
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                                {group.messages.length}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {senders.join(', ')}
                            </div>
                          </div>
                          <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                        </button>
                        {/* Group messages */}
                        {isExpanded && group.messages.map((msg, idx) => (
                          <div key={msg.uid} className="ml-5 pl-3 border-l-2 border-primary/20 border-t border-border/50">
                            {renderMessageRow(msg, -1)}
                          </div>
                        ))}
                      </div>
                    );
                  })
                : (() => {
                    // Group by tanggal (pola Gmail): Hari Ini / Kemarin / Minggu Ini / Bulan Lalu / Lebih Lama
                    if (conversationView) {
                      return sortedMessages.map((msg, idx) => renderMessageRow(msg, idx));
                    }
                    // sortedMessages selalu date-descending (Hari Ini → Lebih
                    // Lama). Saat sortAsc (terlama dulu), urutan GRUP dibalik
                    // (Lebih Lama → Hari Ini) — isi tiap grup tetap
                    // date-descending. Sebelumnya urutan baris dibalik apa
                    // adanya → header grup terbalik + sticky salah menempel.
                    const dateGroups = reorderDateGroups(
                      groupMessagesByDate(sortedMessages, (m) => m.date),
                      sortAsc
                    );
                    let flatIdx = 0;
                    return dateGroups.map((group) => (
                      <div key={group.key}>
                        <div className="sticky top-0 z-10 px-3 py-1.5 bg-background/95 backdrop-blur-sm text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/60">
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
                    <span className="text-[10px] text-muted-foreground">
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
      </div>

      {/* Drag handle */}
      {selectedMsgId && <DragHandle onMouseDown={onListDrag} />}

      {/* ── Message Reader ─────────────────────────────────────────────────── */}
      <div className={`flex-1 bg-background flex-col min-w-0 ${selectedMsgId ? 'flex' : 'hidden md:flex'}`}>
        {selectedMsgId ? (
          <MessageReader
            folder={selectedFolder}
            msgId={selectedMsgId}
            siblingUids={visibleOrderUids}
            onNavigateTo={(uid) => setSelectedMsgId(uid)}
            onClose={() => setSelectedMsgId(null)}
            onReply={(data) => { setComposeData(data); setComposeOpen(true); }}
            folders={folders}
            shortcutsEnabled={!composeOpen}
            onSnoozeCleared={() => setSnoozeTick((t) => t + 1)}
            onMoveComplete={() => {
              setSelectedMsgId(null);
              queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, selectedFolder] });
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Mail size={24} className="opacity-50" />
            </div>
            <p className="text-sm">Pilih email untuk membaca</p>
          </div>
        )}
      </div>

      {/* ── Compose Modal ──────────────────────────────────────────────────── */}
      <ComposeModal
        isOpen={composeOpen}
        onClose={() => { setComposeOpen(false); setComposeData(null); }}
        initialData={composeData}
        sogoToken={user?.sogoToken}
        userFrom={user?.cn ? `${user.cn} <${user.email}>` : user?.email || ''}
      />

      {/* ── Quick Rule — buat aturan dari baris email ─────────────────────── */}
      <QuickRuleModal
        isOpen={!!quickRuleSender}
        onClose={() => setQuickRuleSender(null)}
        sender={quickRuleSender}
        folders={folders}
        userEmail={user?.email}
      />

      {/* ── Folder Dialog: buat subfolder / hapus folder ──────────────────── */}
      {folderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { setFolderDialog(null); setNewFolderName(''); }}
          />
          <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-5">
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
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setFolderDialog(null); setNewFolderName(''); }}
                      className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={!newFolderName.trim() || createFolderMutation.isPending}
                      className="px-4 py-2 rounded-xl text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
                    className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
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
                    className="px-4 py-2 rounded-xl text-sm bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                  >
                    {deleteFolderMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Hapus'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Keyboard Shortcuts Help ────────────────────────────────────────── */}
      <KeyboardShortcutsModal
        isOpen={keyboardHelpOpen}
        onClose={() => setKeyboardHelpOpen(false)}
      />
    </div>
  );
}
