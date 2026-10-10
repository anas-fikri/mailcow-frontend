import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Check } from 'lucide-react';
import { clampMenuPosition, submenuPosition, nextMenuIndex } from '../../lib/contextMenuPosition';

/**
 * ContextMenu — menu klik kanan ala Outlook desktop.
 *
 * Props:
 *   x, y        : posisi kursor (viewport px); menu di-clamp/flip agar muat.
 *   items       : Array<{ id, label, icon?, shortcut?, onSelect?, disabled?,
 *                 danger?, checked?, dot? (kelas warna bulatan), separator?,
 *                 children?: items (submenu) }>
 *   onClose     : dipanggil saat Esc / klik di luar / item dipilih.
 *   ariaLabel   : label menu utk pembaca layar.
 *
 * Keyboard: ↑/↓ pindah item (lewati separator/disabled, wrap), Home/End,
 * → buka submenu, ← tutup submenu, Enter/Space pilih, Esc tutup.
 * Fokus dikembalikan ke elemen aktif sebelumnya saat menu ditutup.
 */
export default function ContextMenu({ x = 0, y = 0, items = [], onClose, ariaLabel = 'Menu konteks' }) {
  const menuRef = useRef(null);
  const previousFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  const [activeIdx, setActiveIdx] = useState(-1);
  const [openSub, setOpenSub] = useState(null); // indeks item yang submenunya terbuka
  const itemRefs = useRef([]);

  // Posisi: ukur ukuran menu setelah mount lalu clamp/flip di viewport.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = clampMenuPosition({
      x, y, width: rect.width, height: rect.height,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    });
    setPos({ left: p.left, top: p.top, ready: true });
  }, [x, y, items.length]);

  const close = useCallback(() => {
    onClose?.();
    const prev = previousFocus.current;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
      try { prev.focus({ preventScroll: true }); } catch { /* abaikan */ }
    }
  }, [onClose]);

  // Tutup saat klik/klik-kanan di luar, scroll, atau resize.
  useEffect(() => {
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) close(); };
    const onScroll = () => close();
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('contextmenu', onDown, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('contextmenu', onDown, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [close]);

  // Fokus ke menu SETELAH posisi siap (elemen masih tersembunyi sebelum itu,
  // dan focus() pada elemen hidden diabaikan browser) supaya keyboard langsung bekerja.
  useEffect(() => {
    if (pos.ready) menuRef.current?.focus({ preventScroll: true });
  }, [pos.ready]);

  // Esc harus SELALU menutup menu walau fokus tidak berada di dalamnya
  // (mis. fokus masih di baris pesan setelah klik-kanan). Ditangkap di fase
  // capture agar handler global MailPage tidak ikut bereaksi.
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (menuRef.current && menuRef.current.contains(e.target)) return; // ditangani onKeyDown menu
      e.preventDefault(); e.stopPropagation();
      close();
    };
    document.addEventListener('keydown', onEsc, true);
    return () => document.removeEventListener('keydown', onEsc, true);
  }, [close]);

  // Fokus item aktif (roving).
  useEffect(() => {
    if (activeIdx >= 0) itemRefs.current[activeIdx]?.focus({ preventScroll: true });
  }, [activeIdx]);

  const select = (item) => {
    if (!item || item.disabled || item.separator) return;
    if (item.children?.length) { setOpenSub(items.indexOf(item)); return; }
    close();
    try { item.onSelect?.(); } catch (err) { console.warn('[ContextMenu] aksi gagal:', err?.message || err); }
  };

  const onKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); e.stopPropagation(); setOpenSub(null); setActiveIdx((i) => nextMenuIndex(items, i, 1)); break;
      case 'ArrowUp': e.preventDefault(); e.stopPropagation(); setOpenSub(null); setActiveIdx((i) => nextMenuIndex(items, i, -1)); break;
      case 'Home': e.preventDefault(); e.stopPropagation(); setActiveIdx(nextMenuIndex(items, -1, 'home')); break;
      case 'End': e.preventDefault(); e.stopPropagation(); setActiveIdx(nextMenuIndex(items, -1, 'end')); break;
      case 'ArrowRight': {
        e.preventDefault(); e.stopPropagation();
        const it = items[activeIdx];
        if (it?.children?.length) setOpenSub(activeIdx);
        break;
      }
      case 'ArrowLeft': e.preventDefault(); e.stopPropagation(); setOpenSub(null); break;
      case 'Enter':
      case ' ': e.preventDefault(); e.stopPropagation(); select(items[activeIdx]); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); if (openSub != null) setOpenSub(null); else close(); break;
      case 'Tab': e.preventDefault(); e.stopPropagation(); close(); break;
      default: break;
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[70] min-w-[200px] max-w-[280px] py-1 bg-card border border-border rounded-xl shadow-xl text-sm outline-none select-none"
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      data-testid="context-menu"
    >
      {items.map((item, idx) => {
        if (item.separator) return <div key={`sep-${idx}`} role="separator" className="my-1 border-t border-border" />;
        const Icon = item.icon;
        const hasChildren = !!item.children?.length;
        const active = idx === activeIdx;
        return (
          <div key={item.id || idx} className="relative">
            <button
              ref={(el) => { itemRefs.current[idx] = el; }}
              type="button"
              role={item.checked != null ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={item.checked != null ? !!item.checked : undefined}
              aria-haspopup={hasChildren ? 'menu' : undefined}
              aria-expanded={hasChildren ? openSub === idx : undefined}
              aria-disabled={item.disabled || undefined}
              disabled={item.disabled}
              tabIndex={active ? 0 : -1}
              onMouseEnter={() => { setActiveIdx(idx); setOpenSub(hasChildren ? idx : null); }}
              onClick={(e) => { e.stopPropagation(); select(item); }}
              className={`flex items-center gap-2.5 px-3 min-h-9 text-left rounded-lg mx-1 w-[calc(100%-0.5rem)] transition-colors
                ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${active ? 'bg-muted' : ''}
                ${item.danger ? 'text-destructive' : 'text-foreground'}`}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground">
                {item.dot ? <span className={`w-2.5 h-2.5 rounded-full ${item.dot}`} aria-hidden /> : Icon ? <Icon size={15} /> : null}
              </span>
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
              {item.checked ? <Check size={14} className="text-primary shrink-0" aria-hidden /> : null}
              {item.shortcut ? <kbd className="text-[10px] text-muted-foreground font-mono shrink-0">{item.shortcut}</kbd> : null}
              {hasChildren ? <ChevronRight size={14} className="text-muted-foreground shrink-0" aria-hidden /> : null}
            </button>
            {hasChildren && openSub === idx && (
              <SubMenu
                parentEl={itemRefs.current[idx]}
                items={item.children}
                onSelect={(child) => { close(); try { child.onSelect?.(); } catch (err) { console.warn('[ContextMenu] aksi gagal:', err?.message || err); } }}
                onBack={() => { setOpenSub(null); itemRefs.current[idx]?.focus({ preventScroll: true }); }}
                onEscape={close}
                label={item.label}
              />
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );
}

function SubMenu({ parentEl, items, onSelect, onBack, onEscape, label }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });
  const [activeIdx, setActiveIdx] = useState(-1);
  const itemRefs = useRef([]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pr = parentEl?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
    const sr = el.getBoundingClientRect();
    const p = submenuPosition(
      { left: pr.left, top: pr.top, width: pr.width, height: pr.height },
      { width: sr.width, height: sr.height },
      { width: window.innerWidth, height: window.innerHeight }
    );
    setPos({ left: p.left, top: p.top, ready: true });
  }, [parentEl, items.length]);

  useEffect(() => {
    // Fokus item pertama saat submenu dibuka lewat keyboard.
    const first = nextMenuIndex(items, -1, 'home');
    setActiveIdx(first);
  }, [items]);

  useEffect(() => {
    if (activeIdx >= 0) itemRefs.current[activeIdx]?.focus({ preventScroll: true });
  }, [activeIdx]);

  const onKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); e.stopPropagation(); setActiveIdx((i) => nextMenuIndex(items, i, 1)); break;
      case 'ArrowUp': e.preventDefault(); e.stopPropagation(); setActiveIdx((i) => nextMenuIndex(items, i, -1)); break;
      case 'ArrowLeft': e.preventDefault(); e.stopPropagation(); onBack(); break;
      case 'Enter':
      case ' ': {
        e.preventDefault(); e.stopPropagation();
        const it = items[activeIdx];
        if (it && !it.disabled && !it.separator) onSelect(it);
        break;
      }
      case 'Escape': e.preventDefault(); e.stopPropagation(); onEscape(); break;
      default: break;
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[71] min-w-[180px] py-1 bg-card border border-border rounded-xl shadow-xl text-sm outline-none select-none"
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
    >
      {items.map((item, idx) => {
        if (item.separator) return <div key={`sep-${idx}`} role="separator" className="my-1 border-t border-border" />;
        const Icon = item.icon;
        const active = idx === activeIdx;
        return (
          <button
            key={item.id || idx}
            ref={(el) => { itemRefs.current[idx] = el; }}
            type="button"
            role={item.checked != null ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={item.checked != null ? !!item.checked : undefined}
            disabled={item.disabled}
            tabIndex={active ? 0 : -1}
            onMouseEnter={() => setActiveIdx(idx)}
            onClick={(e) => { e.stopPropagation(); if (!item.disabled) onSelect(item); }}
            className={`flex items-center gap-2.5 px-3 min-h-9 text-left rounded-lg mx-1 w-[calc(100%-0.5rem)] transition-colors
              ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${active ? 'bg-muted' : ''}
              ${item.danger ? 'text-destructive' : 'text-foreground'}`}
          >
            <span className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground">
              {item.dot ? <span className={`w-2.5 h-2.5 rounded-full ${item.dot}`} aria-hidden /> : Icon ? <Icon size={15} /> : null}
            </span>
            <span className="flex-1 min-w-0 truncate">{item.label}</span>
            {item.checked ? <Check size={14} className="text-primary shrink-0" aria-hidden /> : null}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
