import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon, Loader2, MapPin, Clock,
  Plus, Pencil, Trash2, List, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fetchCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../lib/api';
import { CalendarGridSkeleton } from '../components/Skeleton';
import { MONTHS_ID, DAYS_ID, CAL_COLORS } from '../lib/constants';
import { toast } from '../lib/toast';
import EventModal from '../components/EventModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(unix) {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDateShort(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()].slice(0, 3)}`;
}

function toDayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDayEnd(date) {
  const d = toDayStart(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function calColor(calName = '') {
  const idx = calName.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % CAL_COLORS.length;
  return CAL_COLORS[idx];
}

function isToday(date) {
  return date.toDateString() === new Date().toDateString();
}

function isSameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

function getWeekDays(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function eventsForDay(events, date) {
  const dayStart = Math.floor(toDayStart(date).getTime() / 1000);
  const dayEnd = dayStart + 86399;
  return events.filter((ev) => {
    const s = Number(ev.start);
    return s >= dayStart && s <= dayEnd;
  });
}

function getEventPosition(ev) {
  const start = Number(ev.start) || 0;
  const end = Number(ev.end) || start + 3600;
  const startDate = new Date(start * 1000);
  const endDate = new Date(end * 1000);
  const topPct = ((startDate.getHours() * 60 + startDate.getMinutes()) / (24 * 60)) * 100;
  const heightPct = Math.max(((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) * 100, 2.5);
  return { top: `${topPct}%`, height: `${heightPct}%` };
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ─── View Switcher ────────────────────────────────────────────────────────────
function ViewSwitcher({ view, onChange }) {
  return (
    <div className="flex gap-1 bg-muted rounded-lg p-0.5">
      {[
        { id: 'month', label: 'Bulan' },
        { id: 'week', label: 'Minggu' },
        { id: 'day', label: 'Hari' },
      ].map((v) => (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            view === v.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [view, setView] = useState('month'); // 'month' | 'week' | 'day'
  const [current, setCurrent] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [detailEv, setDetailEv] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [modalEvent, setModalEvent] = useState(null);

  // Drag & drop state
  const dragEvRef = useRef(null);

  // ── Date range for fetching ────────────────────────────────────────────────
  const { dateRangeStart, dateRangeEnd } = useMemo(() => {
    let start, end;
    if (view === 'month') {
      start = new Date(current.getFullYear(), current.getMonth() - 1, 20);
      end = new Date(current.getFullYear(), current.getMonth() + 1, 10);
    } else if (view === 'week') {
      const weekStart = getWeekDays(current)[0];
      start = new Date(weekStart);
      start.setDate(start.getDate() - 1);
      end = new Date(weekStart);
      end.setDate(end.getDate() + 8);
    } else {
      start = new Date(current);
      start.setDate(start.getDate() - 1);
      end = new Date(current);
      end.setDate(end.getDate() + 2);
    }
    return {
      dateRangeStart: Math.floor(start.getTime() / 1000),
      dateRangeEnd: Math.floor(end.getTime() / 1000),
    };
  }, [view, current]);

  // ── Fetch events ───────────────────────────────────────────────────────────
  const { data: events = [], isLoading, isFetching, error: calError } = useQuery({
    queryKey: ['calendar', user?.sogoToken, dateRangeStart, dateRangeEnd],
    queryFn: () => fetchCalendarEvents(user?.sogoToken, 'personal', dateRangeStart, dateRangeEnd),
    enabled: !!user?.sogoToken,
    staleTime: 5 * 60_000,
  });

  // ── Navigation ─────────────────────────────────────────────────────────────
  function goBack() {
    if (view === 'month') setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1));
    else if (view === 'week') { const d = new Date(current); d.setDate(d.getDate() - 7); setCurrent(d); }
    else { const d = new Date(current); d.setDate(d.getDate() - 1); setCurrent(d); }
  }

  function goForward() {
    if (view === 'month') setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    else if (view === 'week') { const d = new Date(current); d.setDate(d.getDate() + 7); setCurrent(d); }
    else { const d = new Date(current); d.setDate(d.getDate() + 1); setCurrent(d); }
  }

  function goToday() {
    const today = new Date();
    setCurrent(today);
    setSelected(today);
  }

  function getTitle() {
    if (view === 'month') return `${MONTHS_ID[current.getMonth()]} ${current.getFullYear()}`;
    if (view === 'week') {
      const weekDays = getWeekDays(current);
      return `${weekDays[0].getDate()} ${MONTHS_ID[weekDays[0].getMonth()]} — ${weekDays[6].getDate()} ${MONTHS_ID[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`;
    }
    return `${selected.getDate()} ${MONTHS_ID[selected.getMonth()]} ${selected.getFullYear()}`;
  }

  // ── Event CRUD ─────────────────────────────────────────────────────────────
  async function handleCreateEvent(eventData) {
    await createCalendarEvent(user?.sogoToken, eventData);
    queryClient.invalidateQueries({ queryKey: ['calendar', user?.sogoToken] });
    toast.success('Event berhasil dibuat');
  }

  async function handleUpdateEvent(eventData, eventId) {
    await updateCalendarEvent(user?.sogoToken, eventId, eventData);
    queryClient.invalidateQueries({ queryKey: ['calendar', user?.sogoToken] });
    toast.success('Event diperbarui');
  }

  async function handleDeleteEvent(eventId) {
    await deleteCalendarEvent(user?.sogoToken, eventId);
    setDetailEv(null);
    queryClient.invalidateQueries({ queryKey: ['calendar', user?.sogoToken] });
    toast.success('Event dihapus');
  }

  function openCreateModal(date) {
    setModalMode('create');
    setModalEvent(date || null);
    setModalOpen(true);
  }

  function openEditModal(ev) {
    setModalMode('edit');
    setModalEvent(ev);
    setModalOpen(true);
  }

  function openViewModal(ev) {
    if (ev) setDetailEv(ev);
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  function handleDragStart(ev) {
    dragEvRef.current = ev;
  }

  function handleDrop(date, hour = null) {
    if (!dragEvRef.current) return;
    const ev = dragEvRef.current;
    const targetDate = new Date(date);

    if (hour !== null) {
      targetDate.setHours(hour, 0, 0, 0);
    } else {
      targetDate.setHours(9, 0, 0, 0);
    }

    const oldStart = Number(ev.start) || 0;
    const oldEnd = Number(ev.end) || oldStart + 3600;
    const duration = oldEnd - oldStart;

    const newStart = Math.floor(targetDate.getTime() / 1000);
    const newEnd = newStart + (duration > 0 ? duration : 3600);

    const newStartDate = new Date(newStart * 1000);
    const newEndDate = new Date(newEnd * 1000);

    const eventData = {
      title: ev.title,
      startDate: newStartDate.toISOString().slice(0, 10),
      startTime: newStartDate.toTimeString().slice(0, 5),
      endDate: newEndDate.toISOString().slice(0, 10),
      endTime: newEndDate.toTimeString().slice(0, 5),
      location: ev.location || '',
      description: ev.description || '',
      isAllDay: ev.isAllDay || false,
      attendees: '',
    };

    handleUpdateEvent(eventData, ev.id).catch((err) => {
      toast.error(err.message || 'Gagal memindahkan event');
    });
    dragEvRef.current = null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const selectedEvents = eventsForDay(events, selected);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Main Area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border bg-card flex items-center justify-between sticky top-0 z-10 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CalIcon size={20} className="text-primary" />
            <h1 className="text-base font-semibold">Kalender</h1>
          </div>
          <ViewSwitcher view={view} onChange={setView} />
          <div className="flex items-center gap-2">
            <button onClick={goBack} className="p-2 rounded-full hover:bg-muted text-muted-foreground" aria-label="Bulan sebelumnya">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors"
            >
              Hari Ini
            </button>
            <button onClick={goForward} className="p-2 rounded-full hover:bg-muted text-muted-foreground" aria-label="Bulan berikutnya">
              <ChevronRight size={18} />
            </button>
            <span className="text-sm font-semibold text-foreground min-w-[120px] text-center hidden sm:block">
              {getTitle()}
            </span>
            <button
              onClick={() => openCreateModal(selected)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Event</span>
            </button>
          </div>
        </div>

        {/* Loading overlay */}
        {isFetching && (
          <div className="absolute inset-0 bg-background/40 flex items-start justify-center pt-20 z-20 pointer-events-none">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {/* Error state */}
        {calError && !isLoading && (
          <div className="flex items-center justify-center gap-2 p-4 mx-4 mt-2 bg-destructive/10 text-destructive rounded-lg text-sm">
            <AlertCircle size={16} />
            <span>{calError?.message || 'Gagal memuat kalender.'}</span>
            <button onClick={() => queryClient.invalidateQueries({ queryKey: ['calendar'] })} className="ml-2 underline text-xs hover:no-underline">Coba lagi</button>
          </div>
        )}

        {/* ── Month View ──────────────────────────────────────────────────── */}
        {view === 'month' && (
          <MonthView
            current={current}
            selected={selected}
            events={events}
            isLoading={isLoading}
            onSelectDate={setSelected}
            onEventClick={(ev) => { setSelected(new Date(Number(ev.start) * 1000)); setDetailEv(ev); }}
            onCellClick={(date) => openCreateModal(date)}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        )}

        {/* ── Week View ───────────────────────────────────────────────────── */}
        {view === 'week' && (
          <WeekView
            current={current}
            selected={selected}
            events={events}
            isLoading={isLoading}
            onSelectDate={setSelected}
            onEventClick={(ev) => { setSelected(new Date(Number(ev.start) * 1000)); setDetailEv(ev); }}
            onCellClick={(date, hour) => {
              const d = new Date(date);
              d.setHours(hour, 0, 0, 0);
              openCreateModal(d);
            }}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        )}

        {/* ── Day View ────────────────────────────────────────────────────── */}
        {view === 'day' && (
          <DayView
            current={selected}
            events={eventsForDay(events, selected)}
            isLoading={isLoading}
            onEventClick={(ev) => setDetailEv(ev)}
            onCellClick={(hour) => {
              const d = new Date(selected);
              d.setHours(hour, 0, 0, 0);
              openCreateModal(d);
            }}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        )}
      </div>

      {/* ── Side Panel ─────────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col hidden md:flex">
        <div className="px-4 py-4 border-b border-border">
          <div className="text-sm font-semibold text-foreground">
            {selected.getDate()} {MONTHS_ID[selected.getMonth()]} {selected.getFullYear()}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {selectedEvents.length === 0 ? 'Tidak ada acara' : `${selectedEvents.length} acara`}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {selectedEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
              <CalIcon size={28} className="opacity-20" />
              <p className="text-xs">Tidak ada acara</p>
            </div>
          ) : (
            selectedEvents.map((ev, i) => (
              <button
                key={ev.id || i}
                onClick={() => setDetailEv(ev)}
                className={`w-full text-left p-3 rounded-xl border ${
                  detailEv === ev ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:bg-muted'
                } transition-colors`}
              >
                <div className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mb-1.5 ${calColor(ev.calendar)}`}>
                  {ev.calendar || 'Kalender'}
                </div>
                <div className="text-sm font-medium text-foreground leading-snug">{ev.title}</div>
                {!ev.isAllDay && ev.start && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Clock size={11} />
                    {fmtTime(ev.start)} – {fmtTime(ev.end)}
                  </div>
                )}
                {ev.location && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <MapPin size={11} />
                    <span className="truncate">{ev.location}</span>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Event detail popup ─────────────────────────────────────────────── */}
      {detailEv && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetailEv(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${calColor(detailEv.calendar)}`}>
                {detailEv.calendar || 'Kalender'}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEditModal(detailEv)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm('Hapus event ini?')) return;
                    handleDeleteEvent(detailEv.id).catch((err) => {
                      toast.error(err.message || 'Gagal menghapus event');
                    });
                  }}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
                <button onClick={() => setDetailEv(null)} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-4">{detailEv.title}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Clock size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  {detailEv.isAllDay ? (
                    <span className="text-foreground">Sepanjang hari</span>
                  ) : (
                    <>
                      <div>{fmtDate(detailEv.start)}</div>
                      <div className="text-muted-foreground">{fmtTime(detailEv.start)} – {fmtTime(detailEv.end)}</div>
                    </>
                  )}
                </div>
              </div>
              {detailEv.location && (
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-foreground">{detailEv.location}</span>
                </div>
              )}
              {detailEv.description && (
                <div className="mt-3 pt-3 border-t border-border text-muted-foreground text-sm leading-relaxed">
                  {detailEv.description}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Event Modal ────────────────────────────────────────────────────── */}
      <EventModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setModalEvent(null); }}
        onSave={modalMode === 'edit' ? handleUpdateEvent : handleCreateEvent}
        onDelete={handleDeleteEvent}
        event={modalEvent}
        mode={modalMode}
        sogoToken={user?.sogoToken}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MONTH VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function MonthView({ current, selected, events, isLoading, onSelectDate, onEventClick, onCellClick, onDragStart, onDrop }) {
  const firstDay = new Date(current.getFullYear(), current.getMonth(), 1);
  const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  const startPad = firstDay.getDay();

  const gridDays = [];
  for (let i = 0; i < startPad; i++) gridDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    gridDays.push(new Date(current.getFullYear(), current.getMonth(), d));
  }

  if (isLoading && !events.length) return <CalendarGridSkeleton />;

  return (
    <>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {DAYS_ID.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 flex-1">
        {gridDays.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} className="min-h-[80px] border-b border-r border-border/40 bg-muted/10" />;

          const today = isToday(date);
          const sel = isSameDay(date, selected);
          const dayEvs = eventsForDay(events, date);

          return (
            <div
              key={date.getTime()}
              onClick={() => { onSelectDate(date); onCellClick(date); }}
              className={`min-h-[80px] border-b border-r border-border/40 p-1.5 flex flex-col text-left hover:bg-muted/50 transition-colors cursor-pointer ${
                sel ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(date)}
            >
              <span className={`w-7 h-7 text-sm flex items-center justify-center rounded-full font-medium shrink-0 ${
                today ? 'bg-primary text-primary-foreground font-bold' : 'text-foreground'
              }`}>
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-0.5 w-full overflow-hidden">
                {dayEvs.slice(0, 3).map((ev, idx) => (
                  <div
                    key={ev.id || idx}
                    draggable
                    onDragStart={() => onDragStart(ev)}
                    className={`text-[10px] px-1.5 py-0.5 rounded truncate w-full cursor-grab active:cursor-grabbing ${calColor(ev.calendar)}`}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  >
                    {ev.isAllDay ? '● ' : `${ev.startHour || ''} `}{ev.title}
                  </div>
                ))}
                {dayEvs.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{dayEvs.length - 3} lagi</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  WEEK VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function WeekView({ current, selected, events, isLoading, onSelectDate, onEventClick, onCellClick, onDragStart, onDrop }) {
  const weekDays = getWeekDays(current);
  const todayRef = useRef(null);

  // Scroll to current hour on mount
  const scrollRef = useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const hour = now.getHours();
      scrollRef.current.scrollTop = Math.max(0, (hour - 1) * 48);
    }
  }, []);

  const eventsByDay = useMemo(() => {
    const map = {};
    weekDays.forEach((d) => {
      map[d.getTime()] = eventsForDay(events, d);
    });
    return map;
  }, [events, weekDays]);

  if (isLoading && !events.length) return <CalendarGridSkeleton />;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/30 sticky top-0 z-10">
        <div className="py-2" />
        {weekDays.map((d, i) => (
          <button
            key={i}
            onClick={() => onSelectDate(d)}
            className={`py-2 text-center transition-colors ${
              isSameDay(d, selected) ? 'bg-primary/10' : ''
            }`}
          >
            <div className="text-[10px] font-semibold text-muted-foreground uppercase">{DAYS_ID[i]}</div>
            <div className={`text-sm font-bold mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full ${
              isToday(d) ? 'bg-primary text-primary-foreground' : 'text-foreground'
            }`}>
              {d.getDate()}
            </div>
          </button>
        ))}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
          {HOURS.map((hour) => (
            <React.Fragment key={hour}>
              {/* Time label */}
              <div className="border-b border-border/40 text-[10px] text-muted-foreground text-right pr-2 py-3 relative -top-3 h-12">
                {hour === 0 ? '' : `${hour.toString().padStart(2, '0')}:00`}
              </div>
              {/* 7 day cells for this hour */}
              {weekDays.map((d, di) => {
                const dateStr = d.getTime();
                const dayEvs = eventsByDay[dateStr] || [];
                const hourEvents = dayEvs.filter((ev) => {
                  const startHour = ev.start ? new Date(Number(ev.start) * 1000).getHours() : -1;
                  return startHour === hour && !ev.isAllDay;
                });

                return (
                  <div
                    key={di}
                    className="border-b border-r border-border/40 h-12 relative hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => onCellClick(d, hour)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const d2 = new Date(d);
                      d2.setHours(hour);
                      onDrop(d2, hour);
                    }}
                  >
                    {hourEvents.map((ev) => (
                      <div
                        key={ev.id}
                        draggable
                        onDragStart={() => onDragStart(ev)}
                        className={`absolute inset-x-0.5 top-0.5 rounded px-1 py-0.5 text-[10px] font-medium truncate cursor-grab active:cursor-grabbing z-10 shadow-sm ${calColor(ev.calendar)}`}
                        style={{ minHeight: '18px' }}
                        onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      >
                        {ev.startHour ? fmtTime(ev.start) : ''} {ev.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}

          {/* All-day events */}
          {weekDays.some((d) => {
            const dayEvs = eventsForDay(events, d);
            return dayEvs.some((ev) => ev.isAllDay);
          }) && (
            <div className="col-span-8 border-b border-border/60 bg-muted/10 py-1 px-[60px] grid grid-cols-7 gap-0.5">
              {weekDays.map((d, di) => {
                const dayEvs = eventsForDay(events, d).filter((ev) => ev.isAllDay);
                return (
                  <div key={di} className="space-y-0.5 min-h-[20px]">
                    {dayEvs.map((ev) => (
                      <div
                        key={ev.id}
                        draggable
                        onDragStart={() => onDragStart(ev)}
                        className={`text-[9px] px-1 py-0.5 rounded truncate cursor-grab active:cursor-grabbing ${calColor(ev.calendar)}`}
                        onClick={() => onEventClick(ev)}
                      >
                        ● {ev.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DAY VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function DayView({ current, events, isLoading, onEventClick, onCellClick, onDragStart, onDrop }) {
  const scrollRef = useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      scrollRef.current.scrollTop = Math.max(0, (now.getHours() - 1) * 60);
    }
  }, [current]);

  const dayEvents = events.filter((ev) => !ev.isAllDay);
  const allDayEvents = events.filter((ev) => ev.isAllDay);

  if (isLoading && !events.length) return <CalendarGridSkeleton />;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* All-day events bar */}
      {allDayEvents.length > 0 && (
        <div className="border-b border-border/60 bg-muted/10 px-4 py-2 space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground uppercase">Sepanjang Hari</div>
          {allDayEvents.map((ev) => (
            <div
              key={ev.id}
              draggable
              onDragStart={() => onDragStart(ev)}
              className={`text-xs px-2 py-1 rounded-lg cursor-grab active:cursor-grabbing ${calColor(ev.calendar)}`}
              onClick={() => onEventClick(ev)}
            >
              {ev.title}
            </div>
          ))}
        </div>
      )}

      {/* Hourly timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="relative min-h-full">
          {/* Current time indicator */}
          <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${(new Date().getHours() * 60 + new Date().getMinutes()) / (24 * 60) * 100}%` }}>
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
              <div className="flex-1 h-px bg-red-500" />
            </div>
          </div>

          {HOURS.map((hour) => {
            const hourEvents = dayEvents.filter((ev) => {
              const startHour = ev.start ? new Date(Number(ev.start) * 1000).getHours() : -1;
              return startHour === hour;
            });

            return (
              <div
                key={hour}
                className="flex min-h-[60px] border-b border-border/40 hover:bg-muted/10 transition-colors cursor-pointer"
                onClick={() => onCellClick(hour)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const d = new Date(current);
                  d.setHours(hour, 0, 0, 0);
                  onDrop(d, hour);
                }}
              >
                {/* Time label */}
                <div className="w-16 shrink-0 text-[10px] text-muted-foreground text-right pr-3 pt-1">
                  {hour === 0 ? '' : `${hour.toString().padStart(2, '0')}:00`}
                </div>
                {/* Content area */}
                <div className="flex-1 relative p-1">
                  {hourEvents.map((ev) => {
                    const pos = getEventPosition(ev);
                    return (
                      <div
                        key={ev.id}
                        draggable
                        onDragStart={() => onDragStart(ev)}
                        className={`absolute left-1 right-1 rounded-lg px-2 py-1 text-xs font-medium truncate cursor-grab active:cursor-grabbing shadow-sm z-10 ${calColor(ev.calendar)}`}
                        style={{ top: pos.top, height: pos.height, minHeight: '22px' }}
                        onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      >
                        <div className="font-semibold">{ev.title}</div>
                        <div className="opacity-70 text-[10px]">
                          {fmtTime(ev.start)} – {fmtTime(ev.end)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
