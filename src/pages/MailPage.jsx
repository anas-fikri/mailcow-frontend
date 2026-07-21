import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Inbox, Send, Trash2, FileText, Loader2, Edit3, Mail, Menu, X,
  AlertCircle, Search, Trash, CheckSquare, Square, MailOpen, RefreshCw,
  Folder,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fetchFolders, fetchMessages, getUnseenCount, deleteMessages, moveMessages, markRead } from '../lib/api';
import MessageReader from '../components/mailer/MessageReader';
import ComposeModal from '../components/mailer/ComposeModal';

// ─── Resize hook ─────────────────────────────────────────────────────────────
import { useRef, useCallback } from 'react';

function useResizable(defaultPx, minPx, maxPx) {
  const [width, setWidth] = React.useState(defaultPx);
  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(defaultPx);

  const onMouseDown = useCallback((e) => {
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = width;
    document.body.style.cursor    = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX.current;
      setWidth(Math.min(maxPx, Math.max(minPx, startW.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width, minPx, maxPx]);

  return [width, onMouseDown];
}

// ─── Drag Handle ─────────────────────────────────────────────────────────────
function DragHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="hidden md:flex w-1.5 shrink-0 h-full items-center justify-center group cursor-col-resize relative z-10 hover:bg-primary/20 transition-colors"
      title="Drag untuk resize"
    >
      <div className="w-0.5 h-8 rounded-full bg-border group-hover:bg-primary transition-colors" />
    </div>
  );
}

// ─── Icon mapping berdasarkan type folder SOGo ────────────────────────────────
const FOLDER_ICONS = {
  inbox:  Inbox,
  sent:   Send,
  draft:  FileText,
  trash:  Trash2,
  junk:   AlertCircle,
  custom: Folder,
};

function getFolderIcon(type) {
  return FOLDER_ICONS[type] || Folder;
}

// Folder standar sebagai fallback jika server tidak bisa dicapai
const DEFAULT_FOLDERS = [
  { id: 'folderINBOX',  label: 'Kotak Masuk', type: 'inbox' },
  { id: 'folderSent',   label: 'Terkirim',     type: 'sent'  },
  { id: 'folderDrafts', label: 'Draf',         type: 'draft' },
  { id: 'folderTrash',  label: 'Sampah',       type: 'trash' },
  { id: 'folderJunk',   label: 'Junk/Spam',    type: 'junk'  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MailPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [selectedFolder, setSelectedFolder] = useState('folderINBOX');
  const [selectedMsgId, setSelectedMsgId] = useState(null);
  const [folderPanelOpen, setFolderPanelOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUids, setSelectedUids] = useState([]);

  // Resize: folder panel (default 220px) dan message list (default 340px)
  const [folderW, onFolderDrag]  = useResizable(220, 160, 320);
  const [listW,   onListDrag]    = useResizable(340, 240, 560);

  // Reset selection ketika folder/search berubah
  useEffect(() => {
    setSelectedUids([]);
    setSelectedMsgId(null);
  }, [selectedFolder, searchQuery]);

  // ── Load folder list dari SOGo secara dinamis ───────────────────────────────
  const { data: folders = DEFAULT_FOLDERS } = useQuery({
    queryKey: ['folders', user?.sogoToken],
    queryFn: () => fetchFolders(user?.sogoToken),
    enabled: !!user?.sogoToken,
    staleTime: 5 * 60_000, // folder list jarang berubah
    // Jika error, gunakan DEFAULT_FOLDERS (sudah jadi initialData)
    onError: () => {},
  });

  // ── Unseen count untuk badge INBOX ─────────────────────────────────────────
  const { data: unseenData } = useQuery({
    queryKey: ['unseen', user?.sogoToken],
    queryFn: () => getUnseenCount(user?.sogoToken),
    enabled: !!user?.sogoToken,
    refetchInterval: 60_000,
  });

  // ── Daftar pesan ────────────────────────────────────────────────────────────
  const { data: msgData, isLoading: loadingMessages, error: msgError, isFetching } = useQuery({
    queryKey: ['messages', user?.sogoToken, selectedFolder, searchQuery],
    queryFn: () => fetchMessages(user?.sogoToken, selectedFolder, { search: searchQuery }),
    enabled: !!user?.sogoToken && !!selectedFolder,
    staleTime: 30_000,
  });

  const messages = msgData?.messages || [];

  // ── Bulk mutations ──────────────────────────────────────────────────────────

  const bulkDeleteMutation = useMutation({
    mutationFn: () => deleteMessages(user.sogoToken, selectedFolder, selectedUids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
      if (selectedUids.includes(selectedMsgId)) setSelectedMsgId(null);
      setSelectedUids([]);
    },
  });

  const bulkMarkReadMutation = useMutation({
    mutationFn: (read) => Promise.all(selectedUids.map(uid => markRead(user.sogoToken, selectedFolder, uid, read))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
      queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
      setSelectedUids([]);
    },
  });

  const bulkMoveMutation = useMutation({
    mutationFn: (targetFolderId) => moveMessages(user.sogoToken, selectedFolder, selectedUids, targetFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken] });
      setSelectedUids([]);
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const isSentOrDraft = ['folderSent', 'folderDrafts'].includes(selectedFolder) ||
    folders.find(f => f.id === selectedFolder)?.type === 'sent' ||
    folders.find(f => f.id === selectedFolder)?.type === 'draft';

  const toggleSelectAll = () => {
    setSelectedUids(prev => prev.length === messages.length && messages.length > 0 ? [] : messages.map(m => m.uid));
  };

  const toggleSelectMsg = (e, uid) => {
    e.stopPropagation();
    setSelectedUids(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, selectedFolder] });
    queryClient.invalidateQueries({ queryKey: ['unseen', user.sogoToken] });
  };

  const getInboxFolder = () => folders.find(f => f.type === 'inbox');

  // ── Render ──────────────────────────────────────────────────────────────────
  const selectedFolderMeta = folders.find(f => f.id === selectedFolder) || { label: selectedFolder, type: 'custom' };

  return (
    <div className="flex h-full w-full bg-background overflow-hidden relative">

      {/* Mobile overlay */}
      {folderPanelOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setFolderPanelOpen(false)} />
      )}

      {/* ── Folder Panel ─────────────────────────────────────────────────────── */}
      <div
        style={{ width: folderW }}
        className={`
          absolute md:relative z-30 h-full border-r border-border bg-card flex flex-col shrink-0
          transition-transform duration-300
          ${folderPanelOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="p-4 border-b border-border flex items-center justify-between gap-2">
          <button
            onClick={() => { setComposeData(null); setComposeOpen(true); setFolderPanelOpen(false); }}
            className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 px-4 rounded-xl transition-colors shadow-sm"
          >
            <Edit3 size={18} />
            <span>Tulis Pesan</span>
          </button>
          <button className="md:hidden p-2 rounded-full hover:bg-muted text-muted-foreground" onClick={() => setFolderPanelOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="p-3 flex-1 overflow-y-auto space-y-1">
          {folders.map(folder => {
            const Icon    = getFolderIcon(folder.type);
            const isActive = selectedFolder === folder.id;
            // Badge hanya untuk folder inbox
            const badge   = folder.type === 'inbox' ? (unseenData?.unseenCount || 0) : 0;

            return (
              <button
                key={folder.id}
                onClick={() => { setSelectedFolder(folder.id); setFolderPanelOpen(false); setSearchQuery(''); setSearchInput(''); }}
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
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Drag handle: folder | message list */}
      <DragHandle onMouseDown={onFolderDrag} />

      {/* ── Message List ─────────────────────────────────────────────────────── */}
      <div
        style={{ width: listW }}
        className={`flex flex-col border-r border-border bg-background shrink-0 transition-all ${selectedMsgId ? 'hidden md:flex' : 'flex'}`}
      >

        {/* Header */}
        <div className="p-3 border-b border-border flex flex-col gap-3 bg-card sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="md:hidden p-2 rounded-md hover:bg-muted text-muted-foreground" onClick={() => setFolderPanelOpen(true)}>
                <Menu size={20} />
              </button>
              <h2 className="text-lg font-semibold text-foreground">{selectedFolderMeta.label}</h2>
              {isFetching && !loadingMessages && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            </div>
            <button onClick={handleRefresh} className="p-2 rounded-full hover:bg-muted text-muted-foreground" title="Refresh">
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Search */}
          <form onSubmit={e => { e.preventDefault(); setSearchQuery(searchInput); }} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              placeholder="Cari pesan..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full bg-muted border-none rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            />
            {searchInput && (
              <button type="button" onClick={() => { setSearchInput(''); setSearchQuery(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
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
                className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none"
                onChange={e => { if (e.target.value) { bulkMoveMutation.mutate(e.target.value); e.target.value = ''; } }}
              >
                <option value="">Pindah ke...</option>
                {folders.filter(f => f.id !== selectedFolder).map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <button onClick={() => bulkMarkReadMutation.mutate(true)} className="p-1.5 text-muted-foreground hover:text-primary rounded" title="Tandai Dibaca">
                <MailOpen size={16} />
              </button>
              <button onClick={() => bulkMarkReadMutation.mutate(false)} className="p-1.5 text-muted-foreground hover:text-primary rounded" title="Tandai Belum Dibaca">
                <Mail size={16} />
              </button>
              <button onClick={() => bulkDeleteMutation.mutate()} className="p-1.5 text-destructive hover:bg-destructive/10 rounded" title="Hapus">
                <Trash size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3">
              <Loader2 size={24} className="animate-spin text-primary" />
              <span className="text-sm">Memuat pesan...</span>
            </div>
          ) : msgError ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <AlertCircle size={24} className="text-destructive" />
              <span className="text-sm text-destructive">Gagal memuat pesan.</span>
              <button onClick={handleRefresh} className="text-xs text-primary hover:underline">Coba lagi</button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3">
              <Mail size={32} className="opacity-30" />
              <p className="text-sm">{searchQuery ? 'Tidak ada hasil pencarian.' : 'Folder kosong.'}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.map(msg => {
                const isActive   = selectedMsgId === msg.uid;
                const isSelected = selectedUids.includes(msg.uid);

                return (
                  <div
                    key={msg.uid}
                    onClick={() => setSelectedMsgId(msg.uid)}
                    className={`group w-full flex items-start text-left p-3 hover:bg-muted/50 transition-colors cursor-pointer border-l-4 ${
                      isActive ? 'bg-muted border-primary' : 'border-transparent'
                    } ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    {/* Checkbox */}
                    <div className="pt-1 pr-3 shrink-0" onClick={e => toggleSelectMsg(e, msg.uid)}>
                      {isSelected
                        ? <CheckSquare size={18} className="text-primary" />
                        : <Square size={18} className="text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity" />
                      }
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className={`text-sm truncate pr-2 ${msg.isRead ? 'text-muted-foreground font-medium' : 'text-foreground font-bold'}`}>
                          {/* Di Sent/Draft tampilkan "To:", di folder lain tampilkan "From:" */}
                          {isSentOrDraft
                            ? (msg.to   || '(Tanpa Penerima)')
                            : (msg.from || 'Unknown Sender')}
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
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Drag handle: message list | reader */}
      {selectedMsgId && <DragHandle onMouseDown={onListDrag} />}

      {/* ── Message Reader ───────────────────────────────────────────────────── */}
      <div className={`flex-1 bg-background flex-col min-w-0 ${selectedMsgId ? 'flex' : 'hidden md:flex'}`}>
        {selectedMsgId ? (
          <MessageReader
            folder={selectedFolder}
            msgId={selectedMsgId}
            onClose={() => setSelectedMsgId(null)}
            onReply={data => { setComposeData(data); setComposeOpen(true); }}
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

      {/* ── Compose Modal ────────────────────────────────────────────────────── */}
      <ComposeModal
        isOpen={composeOpen}
        onClose={() => { setComposeOpen(false); setComposeData(null); }}
        initialData={composeData}
        sogoToken={user?.sogoToken}
        userFrom={user?.cn ? `${user.cn} <${user.email}>` : (user?.email || '')}
      />
    </div>
  );
}
