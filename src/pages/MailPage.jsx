import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Inbox, Send, Trash2, FileText, Loader2, Edit3, Mail, Menu, X,
  AlertCircle, Search, Trash, CheckSquare, Square, MailOpen, RefreshCw,
  Folder, Star, Undo2, Filter, ArrowUpDown, MessagesSquare, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fetchFolders, fetchMessages, searchMessages, getUnseenCount, deleteMessages, moveMessages, markRead, markFlagged } from '../lib/api';
import MessageReader from '../components/mailer/MessageReader';
import ComposeModal from '../components/mailer/ComposeModal';
import { MessageListSkeleton, FoldersListSkeleton } from '../components/Skeleton';
import { toast } from '../lib/toast';
import { DEFAULT_FOLDERS, STALE_TIMES } from '../lib/constants';
import KeyboardShortcutsModal from '../components/KeyboardShortcuts';
import SwipeableRow from '../components/SwipeableRow';
import { FLAG_COLORS, FLAG_COLOR_KEYS, getFlagColor, setFlagColor } from '../lib/flagColors';
import { getRuleSummary, executeRules } from '../lib/autoArchive';

// ─── Icon mapping ─────────────────────────────────────────────────────────────
const FOLDER_ICONS = {
  inbox: Inbox, sent: Send, draft: FileText, trash: Trash2, junk: AlertCircle, custom: Folder,
};

function getFolderIcon(type) {
  return FOLDER_ICONS[type] || Folder;
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
  if (!subject) return '';
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

function groupMessages(messages) {
  const groups = [];
  const map = new Map();
  for (const msg of messages) {
    const key = normalizeSubject(msg.subject) || '(tanpa subjek)';
    if (map.has(key)) {
      map.get(key).push(msg);
    } else {
      const group = { key, subject: msg.subject || '(Tanpa Subjek)', messages: [msg] };
      map.set(key, group);
      groups.push(group);
    }
  }
  groups.sort((a, b) => {
    const lastA = a.messages.reduce((max, m) => Math.max(max, m.uid), 0);
    const lastB = b.messages.reduce((max, m) => Math.max(max, m.uid), 0);
    return lastB - lastA;
  });
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
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [flagPickerOpen, setFlagPickerOpen] = useState(null); // { msgUid, anchorEl }
  const [flagFilter, setFlagFilter] = useState(null); // color key or null
  const [expandedConversations, setExpandedConversations] = useState(new Set());

  // Refs untuk compose/search
  const searchInputRef = useRef(null);
  const rulesProcessed = useRef({}); // Track UIDs yang sudah diproses rules

  // Pending deletes for undo — timers only (state diurus oleh toast)
  const pendingTimers = useRef({});

  // Resize handles
  const [folderW, onFolderDrag] = useResizable(220, 160, 320);
  const [listW, onListDrag] = useResizable(340, 240, 560);

  // Reset selection on folder/search change (keep flagFilter)
  useEffect(() => {
    setSelectedUids([]);
    setSelectedMsgId(null);
    // Reset processed cache saat ganti folder
    rulesProcessed.current = {};
  }, [selectedFolder, searchQuery]);

  // Cleanup pending timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pendingTimers.current).forEach(clearTimeout);
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

  // ── Messages ───────────────────────────────────────────────────────────────
  const { 
    data: msgData, 
    isLoading: loadingMessages, 
    isFetching: isFetchingMessages, 
    error: msgError 
  } = useQuery({
    queryKey: ['messages', user?.sogoToken, selectedFolder, searchQuery, searchCriteria],
    queryFn: () => searchQuery
      ? searchMessages(user?.sogoToken, selectedFolder, searchQuery, searchCriteria)
      : fetchMessages(user?.sogoToken, selectedFolder, { limit: 250 }),
    // Tunggu folder benar-benar punya data (bukan array default/kosong) agar tidak nabrak saat pertama load
    enabled: !!user?.sogoToken && !!selectedFolder && folders !== DEFAULT_FOLDERS && !isFetchingFolders,
    staleTime: STALE_TIMES.MESSAGES,
  });

  // ── Unseen count ───────────────────────────────────────────────────────────
  const { data: unseenData } = useQuery({
    queryKey: ['unseen', user?.sogoToken],
    queryFn: () => getUnseenCount(user?.sogoToken),
    // Hindari request bersamaan. Tunggu msgData selesai dan punya data valid.
    enabled: !!user?.sogoToken && 
             folders !== DEFAULT_FOLDERS && !isFetchingFolders && 
             msgData !== undefined && !isFetchingMessages,
    refetchInterval: STALE_TIMES.UNSEEN,
  });

  const messages = msgData?.messages || [];
  const totalMessageCount = msgData?.total ?? messages.length;
  const ruleSummary = getRuleSummary(user?.email);
  const enabledRules = ruleSummary.enabled;

  // ── Load More (client-side pagination, after messages assignment) ─────────
  const PAGE_SIZE = 50;
  const SERVER_PAGE_LIMIT = 250;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleMessages = messages.slice(0, visibleCount);

  // Filter messages by flag color (client-side) — replaces visibleMessages in render
  const displayMessages = flagFilter
    ? visibleMessages.filter((m) => getFlagColor(user?.email, m.uid) === flagFilter)
    : visibleMessages;

  // Sort by date (client-side)
  const sortedMessages = useMemo(() => {
    return [...displayMessages].sort((a, b) =>
      sortAsc ? a.uid - b.uid : b.uid - a.uid
    );
  }, [displayMessages, sortAsc]);

  // Conversation grouping
  const conversationGroups = useMemo(() => {
    if (!conversationView) return [];
    return groupMessages(sortedMessages);
  }, [sortedMessages, conversationView]);

  // Reset expanded set when conversation view toggles
  useEffect(() => {
    setExpandedConversations(new Set());
  }, [conversationView]);

  const toggleConversation = useCallback((key) => {
    setExpandedConversations(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const hasMore = visibleCount < messages.length;

  // Jalankan rules untuk pesan yang baru dimuat
  useEffect(() => {
    if (!user?.email || !user?.sogoToken || !messages.length || !enabledRules) return;

    const unprocessed = messages.filter((m) => !rulesProcessed.current[m.uid]);
    if (!unprocessed.length) return;

    executeRules(
      user.email,
      user.sogoToken,
      selectedFolder,
      unprocessed,
      (uids, targetFolder) => moveMessages(user.sogoToken, selectedFolder, uids, targetFolder)
    ).then((actions) => {
      unprocessed.forEach((m) => { rulesProcessed.current[m.uid] = true; });

      if (actions.length > 0) {
        const totalMoved = actions.reduce((sum, a) => sum + a.uids.length, 0);
        toast.success(`${totalMoved} email diarsipkan otomatis oleh aturan`, 4000);
        queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
      }
    }).catch((err) => {
      console.warn('[rules] Gagal menjalankan aturan otomatis:', err?.message || err);
    });
  }, [messages.length, selectedFolder, user?.email, user?.sogoToken]);

  function loadMore() {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, messages.length));
  }

  // ── Undo Delete ────────────────────────────────────────────────────────────
  function scheduleDelete(uids) {
    const key = Date.now().toString();

    pendingTimers.current[key] = setTimeout(() => {
      moveMutation.mutate({ uids, targetFolder: 'folderTrash' });
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
  const moveMutation = useMutation({
    mutationFn: ({ uids, targetFolder }) =>
      moveMessages(user.sogoToken, selectedFolder, uids, targetFolder),
    onSuccess: () => {
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
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      setSelectedUids([]);
      toast.success('Pesan dipindahkan');
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const isSentOrDraft = ['folderSent', 'folderDrafts'].includes(selectedFolder) ||
    folders.find((f) => f.id === selectedFolder)?.type === 'sent' ||
    folders.find((f) => f.id === selectedFolder)?.type === 'draft';

  const toggleSelectAll = () => {
    setSelectedUids((prev) =>
      prev.length === messages.length && messages.length > 0 ? [] : messages.map((m) => m.uid)
    );
  };

  const toggleSelectMsg = (e, uid) => {
    e.stopPropagation();
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  // Search submit handler — pake server-side search
  function handleSearchSubmit(e) {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
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

      if (key === '?') {
        e.preventDefault();
        setKeyboardHelpOpen(true);
        return;
      }

      if (key === 'escape') {
        e.preventDefault();
        if (selectedMsgId) {
          setSelectedMsgId(null);
        } else {
          setSelectedUids([]);
        }
        return;
      }

      // Navigasi j/k hanya jika ada pesan dan bukan conversation view
      if (!conversationView && messages.length > 0) {
        if (key === 'j') {
          e.preventDefault();
          const next = Math.min(focusIdx + 1, messages.length - 1);
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
          const msg = messages[focusIdx];
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
      const targetUids = selectedUids.length > 0 ? selectedUids : (focusIdx >= 0 ? [messages[focusIdx]?.uid] : []);
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
        moveMutation.mutate({ uids: targetUids, targetFolder: 'folderJunk' });
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
    messages, focusIdx, selectedMsgId, selectedUids, composeOpen, keyboardHelpOpen,
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
      const msg = messages[focusIdx];
      if (msg) {
        const el = msgRefs.current[msg.uid];
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusIdx, messages]);

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

    return (
      <SwipeableRow
        key={msg.uid}
        onSwipeLeft={() => scheduleDelete([msg.uid])}
        onSwipeRight={() => {
          markRead(user.sogoToken, selectedFolder, msg.uid, true).then(() => {
            queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
            queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
          }).catch(() => {});
        }}
      >
        <div
          onClick={() => setSelectedMsgId(msg.uid)}
          ref={(el) => { if (idx >= 0) msgRefs.current[msg.uid] = el; }}
          className={`group w-full flex items-start text-left p-3 hover:bg-muted/50 transition-colors cursor-pointer border-l-4 ${
            isActive ? 'bg-muted border-primary' : isFocused ? 'border-primary/40 bg-muted/30' : 'border-transparent'
          } ${isSelected ? 'bg-primary/5' : ''}`}
        >
          {/* Checkbox */}
          <div className="pt-1 pr-3 shrink-0" onClick={(e) => toggleSelectMsg(e, msg.uid)}>
            {isSelected ? (
              <CheckSquare size={18} className="text-primary" />
            ) : (
              <Square size={18} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>

          {/* Star/Flag dengan warna */}
          <div className="pt-1 pr-2 shrink-0 relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFlagPickerOpen(flagPickerOpen?.msgUid === msg.uid ? null : { msgUid: msg.uid, x: e.clientX, y: e.clientY });
              }}
              className="focus:outline-none"
            >
              {(() => {
                const colorKey = getFlagColor(user?.email, msg.uid);
                if (colorKey && FLAG_COLORS[colorKey]) {
                  return <Star size={14} className={`${FLAG_COLORS[colorKey].text} ${FLAG_COLORS[colorKey].fill}`} />;
                }
                if (msg.isFlagged) {
                  return <Star size={14} className="text-amber-500 fill-amber-500" />;
                }
                return <Star size={14} className="text-muted-foreground opacity-0 group-hover:opacity-40 transition-opacity" />;
              })()}
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
                      className={`w-7 h-7 rounded-full ${FLAG_COLORS[key].bg} hover:scale-110 transition-transform ${
                        getFlagColor(user?.email, msg.uid) === key ? 'ring-2 ring-offset-2 ring-border' : ''
                      }`}
                      title={FLAG_COLORS[key].label}
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
                    className="w-7 h-7 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-xs text-muted-foreground"
                    title="Hapus flag"
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-1">
              <span className={`text-sm truncate pr-2 ${msg.isRead ? 'text-muted-foreground font-medium' : 'text-foreground font-bold'}`}>
                {isSentOrDraft ? (msg.to || '(Tanpa Penerima)') : (msg.from || 'Unknown Sender')}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">{msg.date}</span>
            </div>
            <div className={`text-sm truncate ${msg.isRead ? 'text-muted-foreground' : 'text-primary font-medium'}`}>
              {msg.subject || '(Tanpa Subjek)'}
            </div>
            {msg.hasAtt && (
              <div className="mt-1">
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">📎 Lampiran</span>
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

        {/* Folder list */}
        <nav className="p-3 flex-1 overflow-y-auto space-y-1">
          {loadingFolders ? (
            <FoldersListSkeleton />
          ) : (
            folders.map((folder) => {
              const Icon = getFolderIcon(folder.type);
              const isActive = selectedFolder === folder.id && !flagFilter;
              const badge = folder.type === 'inbox' ? (unseenData?.unseenCount || 0) : 0;

              return (
                <button
                  key={folder.id}
                  onClick={() => { setSelectedFolder(folder.id); setFlagFilter(null); setFolderPanelOpen(false); setSearchQuery(''); setSearchInput(''); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate">{folder.label}</span>
                  </div>
                  {badge > 0 && (
                    <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-1">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              );
            })
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
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {totalMessageCount}
                </span>
                {enabledRules > 0 && selectedFolder === 'folderINBOX' && (
                  <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-normal">
                    {enabledRules} aturan
                  </span>
                )}
              </h2>
              {isFetchingMessages && !loadingMessages && (
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setConversationView(!conversationView)}
                className={`p-2 rounded-full transition-colors ${
                  conversationView ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                }`}
                title={conversationView ? 'Tampilan biasa' : 'Tampilan percakapan'}
              >
                <MessagesSquare size={16} />
              </button>
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className={`p-2 rounded-full transition-colors ${
                  sortAsc ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                }`}
                title={sortAsc ? 'Terlama dulu' : 'Terbaru dulu'}
              >
                <ArrowUpDown size={16} className={sortAsc ? 'rotate-180' : ''} />
              </button>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['messages', user?.sogoToken, selectedFolder] })}
                className="p-2 rounded-full hover:bg-muted text-muted-foreground"
                title="Refresh"
              >
                <RefreshCw size={16} />
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
                  className="w-full bg-muted border-none rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowSearchFilter(!showSearchFilter)}
                className={`p-2 rounded-lg transition-colors ${
                  searchCriteria !== 'all' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'
                }`}
                title="Filter pencarian"
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
              <button onClick={toggleSelectAll} className="text-primary hover:opacity-80">
                <CheckSquare size={18} />
              </button>
              <span className="font-medium text-primary">{selectedUids.length} terpilih</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="bulk-move-select bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none"
                onChange={(e) => { if (e.target.value) { quickMoveMutation.mutate({ targetFolder: e.target.value }); e.target.value = ''; } }}
              >
                <option value="">Pindah ke...</option>
                {folders.filter((f) => f.id !== selectedFolder).map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <button
                onClick={() => bulkFlagMutation.mutate(true)}
                className="p-1.5 text-muted-foreground hover:text-amber-500 rounded"
                title="Tandai berbintang"
              >
                <Star size={16} />
              </button>
              <button
                onClick={() => bulkMarkReadMutation.mutate(true)}
                className="p-1.5 text-muted-foreground hover:text-primary rounded"
                title="Tandai Dibaca"
              >
                <MailOpen size={16} />
              </button>
              <button
                onClick={() => bulkMarkReadMutation.mutate(false)}
                className="p-1.5 text-muted-foreground hover:text-primary rounded"
                title="Tandai Belum Dibaca"
              >
                <Mail size={16} />
              </button>
              {selectedFolder !== 'folderJunk' && (
                <button
                  onClick={() => moveMutation.mutate({ uids: selectedUids, targetFolder: 'folderJunk' })}
                  className="p-1.5 text-orange-500 hover:bg-orange-500/10 rounded"
                  title="Laporkan Spam"
                >
                  <AlertTriangle size={16} />
                </button>
              )}
              <button
                onClick={() => bulkDeleteMutation.mutate()}
                className="p-1.5 text-destructive hover:bg-destructive/10 rounded"
                title="Hapus"
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
        <div className="flex-1 overflow-y-auto">
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
                    const senders = [...new Set(group.messages.map(m =>
                      m.from.split('<')[0].trim() || m.from
                    ))];
                    return (
                      <div key={group.key} className="border-b border-border last:border-b-0">
                        {/* Group header */}
                        <button
                          onClick={() => toggleConversation(group.key)}
                          className="w-full flex items-center gap-3 p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                        >
                          <MessagesSquare size={16} className="text-muted-foreground shrink-0" />
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
                : sortedMessages.map((msg, idx) => renderMessageRow(msg, idx))}
              {hasMore ? (
                <div className="px-4 py-3 flex justify-center border-t border-border">
                  <button
                    onClick={loadMore}
                    className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-lg text-xs font-medium transition-colors"
                  >
                    Muat {Math.min(PAGE_SIZE, messages.length - visibleCount)} lainnya ({messages.length - visibleCount} tersisa)
                  </button>
                </div>
              ) : totalMessageCount > messages.length && (
                <div className="px-4 py-3 flex justify-center border-t border-border">
                  <span className="text-[10px] text-muted-foreground">
                    Menampilkan {messages.length} dari {totalMessageCount} email terbaru. Cari email lama via pencarian.
                  </span>
                </div>
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
            onClose={() => setSelectedMsgId(null)}
            onReply={(data) => { setComposeData(data); setComposeOpen(true); }}
            folders={folders}
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

      {/* ── Keyboard Shortcuts Help ────────────────────────────────────────── */}
      <KeyboardShortcutsModal
        isOpen={keyboardHelpOpen}
        onClose={() => setKeyboardHelpOpen(false)}
      />
    </div>
  );
}
