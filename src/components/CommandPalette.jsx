import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Mail, Calendar, Users, SlidersHorizontal, BarChart3, Settings,
  Folder, PenSquare, CheckCheck, MessagesSquare, Rows3, PanelRight,
  PanelBottom, PanelRightClose, Moon, Sun, Monitor, Keyboard,
  RefreshCw, Check, CornerDownLeft,
} from 'lucide-react';
import { flattenCommands, filterCommands } from '../lib/commandRegistry';

// Ikon per COMMAND_ICONS key (registry bebas dependensi UI — map-nya di sini).
const ICONS = {
  mail: Mail, calendar: Calendar, contacts: Users, rules: SlidersHorizontal,
  stats: BarChart3, settings: Settings, folder: Folder, compose: PenSquare,
  search: Search, 'read-all': CheckCheck, conversation: MessagesSquare,
  density: Rows3, 'pane-right': PanelRight, 'pane-bottom': PanelBottom,
  'pane-off': PanelRightClose, 'theme-dark': Moon, 'theme-light': Sun,
  'theme-auto': Monitor, keyboard: Keyboard, refresh: RefreshCw,
};

// Di macOS Ctrl ditampilkan ⌘ (pintasan menerima keduanya) — pola KeyboardShortcuts.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const prettyHint = (hint) => (IS_MAC ? String(hint).replace(/^Ctrl\+/, '⌘') : hint);

/**
 * CommandPalette — palet perintah global (Ctrl/Cmd+K) ala Outlook/Linear.
 * Dimount di AppLayout; `groups` dibangun saat palet dibuka
 * (commandRegistry.buildCommands). Ketik utk menyaring (fuzzy), ↑/↓ pilih,
 * Enter jalankan, Esc tutup.
 */
export default function CommandPalette({ open, groups, onClose }) {
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const boxRef = useRef(null);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const allCommands = useMemo(() => flattenCommands(groups), [groups]);
  const filtered = useMemo(() => filterCommands(allCommands, query), [allCommands, query]);

  // Tampilan dikelompokkan: urutan grup = kemunculan pertama di hasil ranking
  // (grup dgn kecocokan terbaik naik ke atas).
  const sections = useMemo(() => {
    const order = [];
    const byGroup = new Map();
    filtered.forEach((c, idx) => {
      if (!byGroup.has(c.group)) { byGroup.set(c.group, []); order.push(c.group); }
      byGroup.get(c.group).push({ command: c, flatIdx: idx });
    });
    return order.map((title) => ({ title, items: byGroup.get(title) }));
  }, [filtered]);

  // Reset state tiap kali palet dibuka; fokus input (palet dirender langsung
  // visible — tidak ada fase visibility:hidden spt MoveToPicker).
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  // Baris aktif selalu terlihat saat navigasi keyboard.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIdx, open]);

  // Esc SELALU menutup palet walau fokus di luar input — fase capture agar
  // handler global MailPage tidak ikut menutup reader (pola MoveToPicker).
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      onClose?.();
    };
    document.addEventListener('keydown', onEsc, true);
    return () => document.removeEventListener('keydown', onEsc, true);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const runCommand = (command) => {
    if (!command) return;
    onClose?.();
    // Jalankan SETELAH palet ditutup — perintah yang memindahkan fokus
    // (Cari pesan) tidak boleh kalah oleh fokus input palet.
    try { command.run?.(); } catch { /* perintah gagal — palet tetap tertutup */ }
  };

  const onKeyDown = (e) => {
    // Pintasan global MailPage tidak boleh ikut menangkap ketikan palet.
    e.stopPropagation();
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIdx((i) => Math.min(filtered.length - 1, i + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); break;
      case 'Home': if (!query) { e.preventDefault(); setActiveIdx(0); } break;
      case 'End': if (!query) { e.preventDefault(); setActiveIdx(Math.max(0, filtered.length - 1)); } break;
      case 'Enter': e.preventDefault(); runCommand(filtered[activeIdx]); break;
      case 'Escape': e.preventDefault(); onClose?.(); break;
      default: break;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] bg-black/50 flex justify-center items-start p-4"
      onMouseDown={(e) => { if (!boxRef.current?.contains(e.target)) onClose?.(); }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label="Palet perintah"
        onKeyDown={onKeyDown}
        className="mt-[15vh] w-full max-w-lg bg-card border border-border rounded-xl shadow-lg flex flex-col overflow-hidden"
        data-testid="command-palette"
      >
        {/* Input pencarian perintah */}
        <div className="relative border-b border-border">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik perintah atau nama folder…"
            aria-label="Cari perintah"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={filtered[activeIdx] ? `cmd-opt-${activeIdx}` : undefined}
            aria-autocomplete="list"
            maxLength={120}
            className="w-full bg-transparent pl-10 pr-14 py-3 text-sm focus:outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center px-1.5 py-0.5 rounded-md border border-border bg-muted text-[11px] font-mono text-muted-foreground pointer-events-none select-none" aria-hidden="true">
            Esc
          </kbd>
        </div>

        {/* Hasil — dikelompokkan, 13px, ikon + kbd hint */}
        <div ref={listRef} id="command-palette-list" role="listbox" aria-label="Perintah" className="max-h-[50vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">Tidak ada hasil</p>
              <p className="text-[11px] text-muted-foreground mt-1">Coba kata kunci lain — mis. "folder", "tema", atau "tulis".</p>
            </div>
          )}
          {sections.map((section) => (
            <div key={section.title}>
              <div className="px-4 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide" aria-hidden="true">
                {section.title}
              </div>
              {section.items.map(({ command, flatIdx }) => {
                const Icon = ICONS[command.icon] || Folder;
                const active = flatIdx === activeIdx;
                return (
                  <button
                    key={command.id}
                    id={`cmd-opt-${flatIdx}`}
                    data-idx={flatIdx}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => runCommand(command)}
                    className={`w-full flex items-center gap-2.5 px-4 min-h-11 sm:min-h-9 text-left text-[13px] transition-colors ${
                      active ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
                    }`}
                    title={command.label}
                  >
                    <Icon size={15} className="shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate flex-1 min-w-0">{command.label}</span>
                    {command.active && <Check size={14} className="shrink-0 text-primary" aria-label="Aktif" />}
                    {command.hint && (
                      <kbd className="hidden sm:inline-flex shrink-0 items-center px-1.5 py-0.5 rounded-md border border-border bg-muted text-[11px] font-mono text-muted-foreground">
                        {prettyHint(command.hint)}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground flex items-center gap-1.5">
          <CornerDownLeft size={11} aria-hidden />
          <span>Enter jalankan · ↑↓ pilih · Esc tutup</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
