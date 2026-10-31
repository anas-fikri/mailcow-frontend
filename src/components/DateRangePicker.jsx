import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  WEEK_HEADER, addMonths, dayState, formatLong, formatMonthTitle, formatRangeLabel,
  monthMatrix, monthOf, moveFocus, quickRanges, rangeLength, selectDate, todayYmd,
} from '../lib/calendarGrid';

// Pemilih tanggal (rentang) kustom — pengganti <input type="date"> yang
// tampil beda di tiap browser (ikon kalender nyaris tak terlihat di mode gelap).
// Nilai: string 'YYYY-MM-DD' LOKAL ('' = kosong). Tanggal lampau tidak diblokir
// (auto-reply cuti boleh diedit di tengah periode) — hanya ditampilkan redup.

const MOBILE_QUERY = '(max-width: 639px)';
const isMobileNow = () => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_QUERY).matches;

export default function DateRangePicker({ start = '', end = '', onChange, mode = 'range', min, labelId, describedBy, placeholder }) {
  const today = todayYmd();
  const minYmd = min === undefined ? today : min;
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(start || end || today);
  const [hover, setHover] = useState('');
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });
  const [mobile, setMobile] = useState(isMobileNow);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  // Pindahkan fokus ke sel hanya saat dibuka / navigasi keyboard di grid —
  // bukan saat tombol bulan diklik (fokus tetap di tombol itu).
  const focusGrid = useRef(false);
  const valueId = useId();
  const view = monthOf(focused);
  const pending = mode === 'range' && !!start && !end;

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setHover('');
    setPos((p) => ({ ...p, ready: false }));
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const openPicker = () => { focusGrid.current = true; setFocused(start || end || today); setMobile(isMobileNow()); setOpen(true); };

  // Posisi: di bawah tombol (atau di atas bila tak muat); mobile = bottom sheet (CSS).
  const place = useCallback(() => {
    const t = triggerRef.current; const p = popRef.current;
    if (!t || !p) return;
    if (isMobileNow()) { setMobile(true); setPos({ left: 0, top: 0, ready: true }); return; }
    setMobile(false);
    const r = t.getBoundingClientRect(); const w = p.offsetWidth; const h = p.offsetHeight;
    const vw = window.innerWidth; const vh = window.innerHeight;
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    let top = r.bottom + 6;
    if (top + h > vh - 8 && r.top - h - 6 >= 8) top = r.top - h - 6;
    setPos({ left, top: Math.max(8, Math.min(top, vh - h - 8)), ready: true });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  // Fokus sel SETELAH popover terlihat — focus() pada elemen visibility:hidden diabaikan.
  useEffect(() => {
    if (!open || !pos.ready || !focusGrid.current) return;
    popRef.current?.querySelector(`[data-ymd="${focused}"]`)?.focus({ preventScroll: true });
  }, [open, pos.ready, focused]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      close(false);
    };
    // Esc ditangkap di fase capture: handler global (pintasan aplikasi) tidak ikut bereaksi.
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      close(true);
    };
    const onReflow = () => place();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onEsc, true);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onEsc, true);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, close, place]);

  const pick = (ymd) => {
    const next = selectDate({ start, end }, ymd, mode);
    onChange?.({ start: next.start, end: next.end });
    setFocused(ymd);
    if (next.complete) close(true);
  };

  const applyQuick = (q) => { onChange?.({ start: q.start, end: q.end }); close(true); };

  const onGridKey = (e) => {
    // Enter/Spasi: aktivasi native <button> (onClick → pick) — tidak ditangani di sini
    // agar tidak terpilih dua kali.
    const next = moveFocus(focused, e.key, { shiftKey: e.shiftKey });
    if (!next) return;
    e.preventDefault();
    focusGrid.current = true;
    setFocused(next);
    if (pending) setHover(next);
  };

  const onTriggerKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPicker(); }
  };

  const hasValue = !!(start || end);
  const label = hasValue ? formatRangeLabel(start, end, mode) : (placeholder || formatRangeLabel('', '', mode));
  const days = mode === 'range' ? rangeLength(start, end) : 0;
  const weeks = monthMatrix(view.year, view.month0);
  const quick = mode === 'range' ? quickRanges(today, { start }) : [];

  return (
    <div className="relative flex items-stretch gap-2 min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close(false) : openPicker())}
        onKeyDown={onTriggerKey}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelId ? `${labelId} ${valueId}` : undefined}
        aria-describedby={describedBy}
        className="flex-1 min-w-0 flex items-center gap-2 min-h-11 sm:min-h-9 px-3 rounded-md border border-border bg-background text-left text-sm hover:border-foreground/30 transition-colors"
        data-testid="date-range-trigger"
      >
        <CalendarDays size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span id={valueId} className={`truncate ${hasValue ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
        {days > 1 && <span className="hidden sm:inline shrink-0 ml-auto text-xs text-muted-foreground tabular-nums">{days} hari</span>}
      </button>
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange?.({ start: '', end: '' })}
          aria-label="Hapus tanggal"
          className="shrink-0 inline-flex items-center justify-center min-w-11 min-h-11 sm:min-w-9 sm:min-h-9 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}

      {open && typeof document !== 'undefined' && createPortal(
        <>
          {mobile && <div className="fixed inset-0 z-[69] bg-black/40" aria-hidden="true" />}
          <div
            ref={popRef}
            role="dialog"
            aria-modal="false"
            aria-label={mode === 'range' ? 'Pilih periode tanggal' : 'Pilih tanggal'}
            className={mobile
              ? 'fixed inset-x-0 bottom-0 z-[70] max-h-[90vh] overflow-y-auto bg-popover text-popover-foreground border-t border-border rounded-t-lg shadow-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))]'
              : 'fixed z-[70] w-[304px] bg-popover text-popover-foreground border border-border rounded-lg shadow-md p-3'}
            style={mobile ? { visibility: pos.ready ? 'visible' : 'hidden' } : { left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
            data-testid="date-range-popover"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <button type="button" onClick={() => { focusGrid.current = false; setFocused(addMonths(focused, -1)); }} aria-label="Bulan sebelumnya"
                className="inline-flex items-center justify-center min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <p className="text-sm font-semibold text-foreground" aria-live="polite">{formatMonthTitle(view.year, view.month0)}</p>
              <button type="button" onClick={() => { focusGrid.current = false; setFocused(addMonths(focused, 1)); }} aria-label="Bulan berikutnya"
                className="inline-flex items-center justify-center min-w-11 min-h-11 sm:min-w-8 sm:min-h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>

            <div role="grid" aria-label={formatMonthTitle(view.year, view.month0)} onKeyDown={onGridKey} onMouseLeave={() => setHover('')}>
              <div role="row" className="grid grid-cols-7">
                {WEEK_HEADER.map((w) => (
                  <span key={w.short} role="columnheader" aria-label={w.long} className="h-8 flex items-center justify-center text-[11px] font-medium text-muted-foreground">{w.short}</span>
                ))}
              </div>
              {weeks.map((row) => (
                <div role="row" key={row[0].ymd} className="grid grid-cols-7 mt-0.5">
                  {row.map((cell) => (
                    <DayCell key={cell.ymd} cell={cell} isFocus={cell.ymd === focused}
                      state={dayState(cell.ymd, { start, end, hover: pending ? hover : '', today, min: minYmd })}
                      onPick={pick} onHover={pending ? setHover : undefined} />
                  ))}
                </div>
              ))}
            </div>

            {quick.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-1.5">
                {quick.map((q) => (
                  <button key={q.id} type="button" onClick={() => applyQuick(q)} disabled={q.id === 'clear-end' && !end}
                    className="min-h-11 sm:min-h-7 px-2.5 rounded-md border border-border text-xs text-foreground hover:bg-muted disabled:opacity-50 disabled:pointer-events-none">
                    {q.label}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {mode !== 'range' ? '' : pending ? 'Pilih tanggal selesai (opsional)' : (start && end ? 'Klik tanggal untuk memilih ulang' : 'Pilih tanggal mulai')}
              </p>
              <button type="button" onClick={() => close(true)}
                className="shrink-0 min-h-11 sm:min-h-8 px-3 rounded-md text-sm font-medium text-primary hover:bg-primary/10 max-sm:w-full max-sm:bg-primary max-sm:text-primary-foreground max-sm:hover:bg-primary/90">
                Selesai
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

function DayCell({ cell, state, isFocus, onPick, onHover }) {
  const { isEndpoint, inRange, preview, isToday, isMuted, isStart, isEnd } = state;
  // Pita rentang: latar sel penuh di antara ujung, setengah sel di sisi dalam ujung.
  const half = isEndpoint && !(isStart && isEnd) ? (isStart ? 'left-1/2 right-0' : 'left-0 right-1/2') : '';
  const tone = isEndpoint
    ? (preview && !state.isSelected ? 'bg-primary/20 text-foreground' : 'bg-primary text-primary-foreground font-semibold')
    : `${cell.inMonth ? (isMuted ? 'text-muted-foreground' : 'text-foreground') : 'text-muted-foreground/60'} hover:bg-muted`;
  return (
    <div className={`relative flex justify-center ${inRange ? 'bg-primary/10' : ''}`}>
      {half && <span aria-hidden="true" className={`absolute inset-y-0 ${half} bg-primary/10`} />}
      <button
        type="button"
        role="gridcell"
        data-ymd={cell.ymd}
        tabIndex={isFocus ? 0 : -1}
        aria-selected={state.isSelected || (inRange && !preview)}
        aria-current={isToday ? 'date' : undefined}
        aria-label={formatLong(cell.ymd)}
        onClick={() => onPick(cell.ymd)}
        onMouseEnter={onHover ? () => onHover(cell.ymd) : undefined}
        className={`relative w-full h-11 sm:w-10 sm:h-10 rounded-md text-[13px] tabular-nums transition-colors ${tone} ${isToday && !isEndpoint ? 'ring-1 ring-inset ring-primary font-semibold' : ''}`}
      >
        {cell.day}
      </button>
    </div>
  );
}
