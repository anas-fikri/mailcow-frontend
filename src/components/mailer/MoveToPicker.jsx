import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Folder, Inbox, Send, FileText, Trash2, AlertCircle, X, Loader2 } from 'lucide-react';
import { clampMenuPosition, centerPosition } from '../../lib/contextMenuPosition';
import { filterFoldersForPicker } from '../../lib/mailSearch';

const ICONS = { inbox: Inbox, sent: Send, draft: FileText, drafts: FileText, trash: Trash2, junk: AlertCircle };

/**
 * MoveToPicker — popover "Pindahkan ke…" ala Outlook: ketik utk menyaring,
 * ↑/↓ pilih, Enter pindahkan, Esc tutup. Dipakai toolbar bulk, menu konteks,
 * Ctrl/Cmd+Shift+V dan pintasan `m`.
 *
 * Props:
 *   folders     : daftar folder (hasil fetchFolders)
 *   excludeId   : folder sumber (disembunyikan)
 *   count       : jumlah pesan yang akan dipindah (utk judul)
 *   x, y        : posisi jangkar (viewport px); tanpa x/y → di tengah viewport
 *   onSelect(folder) : dipanggil saat folder dipilih
 *   onClose     : tutup tanpa aksi
 *   busy        : true saat pemindahan sedang diproses (tombol nonaktif)
 */
export default function MoveToPicker({ folders = [], excludeId = null, count = 1, x, y, onSelect, onClose, busy = false }) {
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const previousFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });

  const filtered = useMemo(() => filterFoldersForPicker(folders, query, excludeId), [folders, query, excludeId]);

  // Posisi: di kursor (clamp) atau tengah viewport bila dibuka dari keyboard.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const p = (typeof x === 'number' && typeof y === 'number')
      ? clampMenuPosition({ x, y, width: rect.width, height: rect.height, viewportWidth: viewport.width, viewportHeight: viewport.height })
      : centerPosition({ width: rect.width, height: rect.height }, viewport);
    setPos({ left: p.left, top: p.top, ready: true });
  }, [x, y]);

  // Fokus input SETELAH posisi siap (elemen masih visibility:hidden sebelum itu,
  // dan focus() pada elemen hidden diabaikan browser).
  useEffect(() => { if (pos.ready) inputRef.current?.focus({ preventScroll: true }); }, [pos.ready]);
  useEffect(() => { setActiveIdx(0); }, [query]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIdx]);

  const close = () => {
    onClose?.();
    const prev = previousFocus.current;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
      try { prev.focus({ preventScroll: true }); } catch { /* abaikan */ }
    }
  };

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) close(); };
    // Esc harus SELALU menutup picker walau fokus tidak berada di dalamnya
    // (mis. dibuka via Ctrl+Shift+V saat fokus masih di baris pesan). Ditangkap
    // di fase capture agar handler global MailPage tidak ikut menutup reader.
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (boxRef.current && boxRef.current.contains(e.target)) return; // ditangani onKeyDown picker
      e.preventDefault(); e.stopPropagation();
      close();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onEsc, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onEsc, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (folder) => {
    if (!folder || busy) return;
    onSelect?.(folder);
  };

  const onKeyDown = (e) => {
    // Hentikan propagasi: pintasan global MailPage tidak boleh ikut menangkap.
    e.stopPropagation();
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIdx((i) => Math.min(filtered.length - 1, i + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); break;
      case 'Home': if (!query) { e.preventDefault(); setActiveIdx(0); } break;
      case 'End': if (!query) { e.preventDefault(); setActiveIdx(Math.max(0, filtered.length - 1)); } break;
      case 'Enter': e.preventDefault(); choose(filtered[activeIdx]); break;
      case 'Escape': e.preventDefault(); close(); break;
      default: break;
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="false"
      aria-label="Pindahkan ke folder"
      onKeyDown={onKeyDown}
      className="fixed z-[70] w-[min(92vw,320px)] bg-card border border-border rounded-lg shadow-md flex flex-col overflow-hidden"
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      data-testid="move-to-picker"
    >
      <div className="px-3 pt-3 pb-2 border-b border-border">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Pindahkan {count > 1 ? `${count} pesan` : 'pesan'} ke…
          </span>
          <button type="button" onClick={close} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Tutup">
            <X size={14} />
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik nama folder…"
            aria-label="Cari folder tujuan"
            aria-controls="move-to-picker-list"
            aria-activedescendant={filtered[activeIdx] ? `move-opt-${activeIdx}` : undefined}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            className="w-full bg-muted border border-transparent rounded-md pl-8 pr-2 py-1.5 text-sm focus:border-ring focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
          />
        </div>
      </div>
      <div ref={listRef} id="move-to-picker-list" role="listbox" aria-label="Folder tujuan" className="max-h-[50vh] overflow-y-auto py-1">
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Tidak ada folder yang cocok</div>
        )}
        {filtered.map((f, idx) => {
          const Icon = ICONS[f.type] || Folder;
          const active = idx === activeIdx;
          const depth = Number(f.depth) || 0;
          return (
            <button
              key={f.id}
              id={`move-opt-${idx}`}
              data-idx={idx}
              type="button"
              role="option"
              aria-selected={active}
              disabled={busy}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => choose(f)}
              className={`w-full flex items-center gap-2 px-3 min-h-9 text-left text-[13px] transition-colors disabled:opacity-60 ${
                active ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
              }`}
              style={{ paddingLeft: `${12 + depth * 14}px` }}
              title={f.path || f.label}
            >
              <Icon size={15} className="shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{f.label || f.name}</span>
            </button>
          );
        })}
      </div>
      <div className="px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground flex items-center gap-2">
        {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
        <span>↑↓ pilih · Enter pindahkan · Esc batal</span>
      </div>
    </div>,
    document.body
  );
}
