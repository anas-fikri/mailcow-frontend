import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon, Loader2, MapPin, Clock,
  Plus, Pencil, Trash2, List, AlertCircle, Repeat,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fetchCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, fetchCalendarEventDetail, fetchPreferences } from '../lib/api';
import { bumpDomainVersion, watchDomainVersion } from '../lib/crossTab';
import { CalendarGridSkeleton } from '../components/Skeleton';
import { MONTHS_ID, DAYS_ID, CAL_COLORS } from '../lib/constants';
import { toast } from '../lib/toast';
import EventModal from '../components/EventModal';
import { buildDroppedEventData } from '../lib/calendarDrop';
import { eventsOnDay as eventsForDay, layoutOverlappingEvents } from '../lib/calendarEvents';

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

// weekStartsOn: 0 = Minggu, 1 = Senin (SOGoFirstDayOfWeek).
function getWeekDays(date, weekStartsOn = 0) {
  const start = new Date(date);
  start.setDate(start.getDate() - ((start.getDay() - weekStartsOn + 7) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

// Label hari sesuai awal minggu (rotasi DAYS_ID yang dimulai Minggu).
function dayLabelsFor(weekStartsOn) {
  return weekStartsOn === 1 ? [...DAYS_ID.slice(1), DAYS_ID[0]] : DAYS_ID;
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
  const [deleteTarget, setDeleteTarget] = useState(null); // event yang menunggu pilihan scope hapus
  const [deletingEv, setDeletingEv] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [modalEvent, setModalEvent] = useState(null);
  const [editingId, setEditingId] = useState(null); // id event yang detailnya sedang di-fetch

  // Drag & drop state
  const dragEvRef = useRef(null);

  // Preferensi SOGoFirstDayOfWeek (0 = Minggu, 1 = Senin) — dipakai grid
  // bulan/minggu + label hari. Fallback Minggu bila prefs belum tiba.
  // PENTING: deklarasi ini HARUS di atas useMemo dateRange — di build produksi
  // referensi `weekStartsOn` di dependency array dievaluasi segera (TDZ),
  // beda dengan di dev. Salah urutan = crash "Cannot access before
  // initialization" (bug produksi 2026-09-03 di CalendarPage).
  const { data: prefs } = useQuery({
    queryKey: ['preferences', user?.sogoToken],
    queryFn: () => fetchPreferences(user?.sogoToken, user?.email),
    enabled: !!(user?.sogoToken && user?.email),
    staleTime: 5 * 60_000,
  });
  const weekStartsOn = String(prefs?.defaults?.SOGoFirstDayOfWeek ?? '0') === '1' ? 1 : 0;

  // ── Date range for fetching ────────────────────────────────────────────────
  const { dateRangeStart, dateRangeEnd } = useMemo(() => {
    let start, end;
    if (view === 'month') {
      start = new Date(current.getFullYear(), current.getMonth() - 1, 20);
      end = new Date(current.getFullYear(), current.getMonth() + 1, 10);
    } else if (view === 'week') {
      const weekStart = getWeekDays(current, weekStartsOn)[0];
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
  }, [view, current, weekStartsOn]);

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
      const weekDays = getWeekDays(current, weekStartsOn);
      return `${weekDays[0].getDate()} ${MONTHS_ID[weekDays[0].getMonth()]} — ${weekDays[6].getDate()} ${MONTHS_ID[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`;
    }
    return `${selected.getDate()} ${MONTHS_ID[selected.getMonth()]} ${selected.getFullYear()}`;
  }

  // ── Event CRUD ─────────────────────────────────────────────────────────────
  // Multi-tab: selain invalidate lokal, bump versi domain 'calendar' agar tab
  // lain (yang mendengar event 'storage') ikut invalidate → refetch. Tanpa ini
  // tab B menampilkan event basi sampai staleTime 5 menit.
  const bumpCalendar = () => bumpDomainVersion('calendar', user?.email);

  // Tab lain melakukan mutasi kalender → invalidate query kalender tab ini.
  React.useEffect(() => {
    if (!user?.email) return;
    return watchDomainVersion('calendar', user?.email, () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', user?.sogoToken] });
    });
  }, [user?.email, user?.sogoToken, queryClient]);

  async function handleCreateEvent(eventData) {
    await createCalendarEvent(user?.sogoToken, eventData);
    queryClient.invalidateQueries({ queryKey: ['calendar', user?.sogoToken] });
    bumpCalendar();
    toast.success('Event berhasil dibuat');
  }

  async function handleUpdateEvent(eventData, eventId) {
    let payload = eventData;
    // Scope 'single' = edit SATU occurrence: save ke segmen occurence{ts}
    // (recurrence_id) — server menciptakan exception RECURRENCE-ID, master +
    // pola seri TIDAK disentuh. repeat WAJIB null di scope ini (mengirim
    // repeat justru mengubah pola SERI), dan safety net recurrence di bawah
    // TIDAK berlaku (payload sengaja tanpa repeat).
    if (eventData?.editScope === 'single' && eventData?.occurrenceId) {
      await updateCalendarEvent(
        user?.sogoToken, eventId, { ...payload, repeat: null },
        'personal', eventData.occurrenceId
      );
      queryClient.invalidateQueries({ queryKey: ['calendar', user?.sogoToken] });
      bumpCalendar();
      toast.success('Kejadian diperbarui');
      return;
    }
    // Safety net recurrence (semua jalur edit seri): event berulang yang payload-nya
    // TIDAK membawa repeat dan user TIDAK menyentuh kontrol pengulangan →
    // resolve repeat asli via /view sebelum save. SOGo menimpa recurrence saat
    // save tanpa repeat (pola hilang diam-diam) — komentar di handleDrop
    // mengonfirmasi perilaku ini. Menutup celah: detail /view gagal saat
    // openEditModal (dulu fallback ke grid tanpa repeat), dan /view yang tidak
    // mengembalikan field repeat.
    if (eventData.isRecurring && !eventData.repeat && !eventData.repeatTouched) {
      let resolvedRepeat = null;
      try {
        const detail = await fetchCalendarEventDetail(user?.sogoToken, eventId);
        resolvedRepeat = detail?.repeat && typeof detail.repeat === 'object' ? detail.repeat : null;
      } catch { /* ditangani di bawah */ }
      if (!resolvedRepeat) {
        // Repeat tidak bisa di-resolve → JANGAN save (menghancurkan pola).
        throw new Error('Tidak dapat memuat pola pengulangan event. Perubahan dibatalkan agar recurrence tidak rusak — coba lagi.');
      }
      payload = { ...eventData, repeat: resolvedRepeat };
    }
    await updateCalendarEvent(user?.sogoToken, eventId, payload);
    queryClient.invalidateQueries({ queryKey: ['calendar', user?.sogoToken] });
    bumpCalendar();
    toast.success('Event diperbarui');
  }

  async function handleDeleteEvent(eventId, opts = {}) {
    // scope 'single' + occurrenceId → hapus SATU occurrence (EXDATE di master,
    // via segmen occurence{ts}); tanpa itu → hapus seluruh event/seri.
    const scopeSingle = opts?.scope === 'single' && !!opts?.occurrenceId;
    await deleteCalendarEvent(user?.sogoToken, eventId, 'personal', scopeSingle ? opts.occurrenceId : null);
    setDetailEv(null);
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ['calendar', user?.sogoToken] });
    bumpCalendar();
    toast.success(scopeSingle ? 'Kejadian dihapus' : 'Event dihapus');
  }

  // hour = null → klik sel bulan / tombol "Event" (tanggal midnight) — default
  // jam 09:00 supaya event baru tidak tercipta tengah malam. Week/Day view
  // mengirim hour asli (jam 0 pun dihormati).
  function openCreateModal(date, hour = null) {
    let d = date instanceof Date ? new Date(date) : (date || null);
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      d.setHours(hour !== null ? hour : 9, 0, 0, 0);
    }
    setModalMode('create');
    setModalEvent(d);
    setModalOpen(true);
  }

  // Ambil detail lengkap via /view (attendees, classification, dll) sebelum
  // membuka editor, agar edit tidak menghapus peserta/detail yang tidak ada di
  // data ringkas `eventsblocks`. Untuk occurrence recurring, /view memakai
  // segmen occurence{ts} agar yang diambil detail SATU occurrence (bukan master).
  async function openEditModal(ev) {
    if (!ev?.id) return;
    setEditingId(ev.id);
    try {
      const detail = await fetchCalendarEventDetail(user?.sogoToken, ev.id, 'personal', ev?.occurrenceId || null);
      setModalMode('edit');
      setModalEvent(detail ? { ...ev, ...detail } : ev);
      setModalOpen(true);
    } catch (err) {
      // Event BERULANG MASTER: data grid (eventsblocks) tidak memuat pola
      // repeat. Kalau editor dibuka dengan repeat=null lalu di-save, SOGo
      // menimpa recurrence → seluruh pola hilang diam-diam. Blokir edit
      // (bukan fallback diam-diam) agar pola tidak bisa rusak.
      // UNTUK SATU OCCURRENCE (occurrenceId): repeat memang TIDAK diperlukan
      // (save jadi exception RECURRENCE-ID, bukan sentuh seri) → fallback ke
      // data grid aman.
      if (ev.isRecurring && !ev.occurrenceId) {
        toast.error('Gagal memuat detail event berulang. Edit dibatalkan agar pola pengulangan tidak rusak — coba lagi.');
        setEditingId(null);
        return;
      }
      // Fallback ke data ringkas (attendees sudah ada dari c_partmails).
      toast.error(err.message || 'Gagal memuat detail event.');
      setModalMode('edit');
      setModalEvent(ev);
      setModalOpen(true);
    } finally {
      setEditingId(null);
    }
  }

  function openViewModal(ev) {
    if (ev) setDetailEv(ev);
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  // ref = { ev, series }: `series=true` (Shift+drag) → pindahkan SELURUH seri;
  // false (default) → drag SATU occurrence (event berulang) hanya memindahkan
  // kejadian itu (exception RECURRENCE-ID via occurence{ts}), pola seri utuh.
  function handleDragStart(ev, e) {
    dragEvRef.current = { ev, series: !!(e?.shiftKey) };
  }

  async function handleDrop(date, hour = null) {
    if (!dragEvRef.current) return;
    const { ev, series } = dragEvRef.current;
    let eventData = buildDroppedEventData(ev, new Date(date), hour);
    if (!eventData) return;

    const isOccurrence = ev.isRecurring && ev.occurrenceId;
    if (isOccurrence && !series) {
      // Drag occurrence (default) = pindah SATU kejadian: save ke segmen
      // occurence{ts} membuat exception RECURRENCE-ID. repeat WAJIB null
      // (mengirim repeat mengubah pola SERI) — dan safety net repeat di bawah
      // TIDAK berlaku (payload sengaja tanpa repeat).
      eventData = {
        ...eventData,
        editScope: 'single',
        occurrenceId: ev.occurrenceId,
        repeat: null,
        repeatTouched: false,
      };
    } else if (ev.isRecurring && !ev.repeat) {
      // Drag SERI (Shift+drag) / event berulang: pola repeat tidak ada di data
      // grid (eventsblocks hanya c_iscycle boolean). Kalau simpan tanpa repeat,
      // SOGo menimpa recurrence → pola hilang diam-diam. Ambil pola asli via
      // /view dulu.
      try {
        const detail = await fetchCalendarEventDetail(user?.sogoToken, ev.id);
        if (detail?.repeat && typeof detail.repeat === 'object') {
          eventData = { ...eventData, repeat: detail.repeat };
        }
      } catch {
        // Gagal ambil detail → pindah tanpa repeat (jarang); tak perlu blokir.
      }
    }

    try {
      await handleUpdateEvent(eventData, ev.id);
    } catch (err) {
      toast.error(err.message || 'Gagal memindahkan event');
    } finally {
      dragEvRef.current = null;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const selectedEvents = eventsForDay(events, selected);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Main Area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto">
        {/* Header */}
        <div className="min-h-12 px-4 py-2 border-b border-border bg-card flex items-center justify-between sticky top-0 z-10 flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CalIcon size={20} className="text-primary shrink-0" />
            <h1 className="text-base font-semibold truncate">Kalender</h1>
          </div>
          <div className="shrink-0">
            <ViewSwitcher view={view} onChange={setView} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={goBack} className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150" aria-label="Bulan sebelumnya">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToday}
              className="h-8 px-3 rounded-md text-xs font-medium border border-border hover:bg-muted text-foreground transition-colors duration-150"
            >
              Hari Ini
            </button>
            <button onClick={goForward} className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150" aria-label="Bulan berikutnya">
              <ChevronRight size={18} />
            </button>
            <span className="text-sm font-semibold text-foreground min-w-[120px] text-center hidden sm:block shrink-0 whitespace-nowrap">
              {getTitle()}
            </span>
            <button
              onClick={() => openCreateModal(selected)}
              className="flex items-center gap-1.5 h-8 px-3 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors duration-150"
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
            weekStartsOn={weekStartsOn}
          />
        )}

        {/* ── Week View ───────────────────────────────────────────────────── */}
        {view === 'week' && (
          <WeekView
            current={current}
            selected={selected}
            weekStartsOn={weekStartsOn}
            events={events}
            isLoading={isLoading}
            onSelectDate={setSelected}
            onEventClick={(ev) => { setSelected(new Date(Number(ev.start) * 1000)); setDetailEv(ev); }}
            onCellClick={(date, hour) => {
              const d = new Date(date);
              d.setHours(hour, 0, 0, 0);
              openCreateModal(d, hour);
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
              openCreateModal(d, hour);
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
                className={`w-full text-left p-3 rounded-lg border ${
                  detailEv === ev ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:bg-muted'
                } transition-colors`}
              >
                <div className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mb-1.5 ${calColor(ev.calendar)}`}>
                  {ev.calendar || 'Kalender'}
                </div>
                <div className="text-sm font-medium text-foreground leading-snug flex items-center gap-1">
                  {ev.isRecurring && <Repeat size={12} className="shrink-0 text-muted-foreground" aria-label="Berulang" />}
                  <span className="truncate">{ev.title}</span>
                </div>
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
          <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${calColor(detailEv.calendar)}`}>
                {detailEv.calendar || 'Kalender'}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(detailEv)}
                  disabled={editingId === detailEv.id}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Edit"
                >
                  {editingId === detailEv.id ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                </button>
                <button
                  onClick={() => {
                    // Hapus bisa SATU occurrence (EXDATE) atau SELURUH seri —
                    // pilih scope dulu (khusus event berulang). Sebelumnya
                    // window.confirm generik menyesatkan: hapus satu occurrence
                    // = hapus SELURUH seri diam-diam.
                    setDeleteTarget(detailEv);
                  }}
                  disabled={deletingEv}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
                <button onClick={() => setDetailEv(null)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors">
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

      {/* ── Scope chooser hapus (event berulang) ──────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-foreground mb-1">Hapus event?</h4>
            <p className="text-xs text-muted-foreground mb-4 truncate">{deleteTarget.title}</p>
            {deleteTarget.isRecurring && deleteTarget.occurrenceId ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    if (deletingEv) return;
                    setDeletingEv(true);
                    try {
                      await handleDeleteEvent(deleteTarget.id, { occurrenceId: deleteTarget.occurrenceId, scope: 'single' });
                      toast.success('Kejadian ini saja dihapus');
                    } catch (err) {
                      toast.error(err.message || 'Gagal menghapus kejadian');
                    } finally {
                      setDeletingEv(false);
                    }
                  }}
                  disabled={deletingEv}
                  className="px-4 py-2.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md text-sm font-medium transition-colors duration-150 text-left"
                >
                  Hapus kejadian ini saja
                  <span className="block text-[11px] font-normal opacity-80">Kejadian lain tetap ada</span>
                </button>
                <button
                  onClick={async () => {
                    if (deletingEv) return;
                    setDeletingEv(true);
                    try {
                      await handleDeleteEvent(deleteTarget.id, { scope: 'all' });
                      toast.success('Semua kejadian dihapus');
                    } catch (err) {
                      toast.error(err.message || 'Gagal menghapus rangkaian');
                    } finally {
                      setDeletingEv(false);
                    }
                  }}
                  disabled={deletingEv}
                  className="px-4 py-2.5 bg-destructive text-white hover:bg-destructive/90 rounded-md text-sm font-medium transition-colors duration-150 text-left"
                >
                  Hapus semua kejadian
                  <span className="block text-[11px] font-normal opacity-80">Seluruh rangkaian pengulangan dihapus</span>
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (deletingEv) return;
                    setDeletingEv(true);
                    try {
                      await handleDeleteEvent(deleteTarget.id, { scope: 'all' });
                    } catch (err) {
                      toast.error(err.message || 'Gagal menghapus event');
                    } finally {
                      setDeletingEv(false);
                    }
                  }}
                  disabled={deletingEv}
                  className="flex-1 px-4 py-2.5 bg-destructive text-white hover:bg-destructive/90 rounded-md text-sm font-medium transition-colors duration-150"
                >
                  {deletingEv ? 'Menghapus...' : 'Hapus'}
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 px-4 py-2.5 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors duration-150"
                >
                  Batal
                </button>
              </div>
            )}
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
function MonthView({ current, selected, events, isLoading, onSelectDate, onEventClick, onCellClick, onDragStart, onDrop, weekStartsOn = 0 }) {
  const firstDay = new Date(current.getFullYear(), current.getMonth(), 1);
  const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  const startPad = (firstDay.getDay() - weekStartsOn + 7) % 7;
  const dayLabels = dayLabelsFor(weekStartsOn);

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
        {dayLabels.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 flex-1">
        {gridDays.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} className="min-h-[80px] border-b border-r border-border/60 bg-muted/10" />;

          const today = isToday(date);
          const sel = isSameDay(date, selected);
          const dayEvs = eventsForDay(events, date);

          return (
            <div
              key={date.getTime()}
              onClick={() => onSelectDate(date)}
              className={`group relative min-h-[80px] border-b border-r border-border/60 p-1.5 flex flex-col text-left hover:bg-muted/50 transition-colors cursor-pointer ${
                sel ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(date)}
            >
              <div className="flex items-center justify-between">
                <span className={`w-7 h-7 text-sm flex items-center justify-center rounded-full font-medium shrink-0 ${
                  today ? 'bg-primary text-primary-foreground font-semibold' : 'text-foreground'
                }`}>
                  {date.getDate()}
                </span>
                {/* Tombol buat event: muncul saat hover atau hari terpilih/hari ini */}
                <button
                  onClick={(e) => { e.stopPropagation(); onCellClick(date); }}
                  title="Buat event di tanggal ini"
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    sel || today
                      ? 'opacity-100 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'
                      : 'opacity-0 group-hover:opacity-100 bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground'
                  }`}
                >
                  +
                </button>
              </div>
              <div className="mt-1 space-y-0.5 w-full overflow-hidden">
                {dayEvs.slice(0, 3).map((ev, idx) => (
                  <div
                    key={ev.id || idx}
                    draggable
                    onDragStart={(e) => onDragStart(ev, e)}
                    className={`text-[11px] px-1.5 py-0.5 rounded-md truncate w-full cursor-grab active:cursor-grabbing ${calColor(ev.calendar)}`}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  >
                    {ev.isRecurring && <Repeat size={9} className="inline-block shrink-0 align-[-1px] mr-0.5" aria-label="Berulang" />}
                    {ev.isAllDay ? '● ' : `${ev.startHour || ''} `}{ev.title}
                  </div>
                ))}
                {dayEvs.length > 3 && (
                  <div className="text-[11px] text-muted-foreground px-1">+{dayEvs.length - 3} lagi</div>
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
function WeekView({ current, selected, events, isLoading, onSelectDate, onEventClick, onCellClick, onDragStart, onDrop, weekStartsOn = 0 }) {
  const weekDays = getWeekDays(current, weekStartsOn);
  const dayLabels = dayLabelsFor(weekStartsOn);
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
            <div className="text-[11px] font-medium text-muted-foreground uppercase">{dayLabels[i]}</div>
            <div className={`text-sm font-semibold mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full ${
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
              <div className="border-b border-border/60 text-[11px] text-muted-foreground text-right pr-2 py-3 relative -top-3 h-12">
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
                // Side-by-side bila beberapa event overlap di slot jam yang
                // sama — tanpa ini semuanya full-width & saling menimpa.
                const slotLayouts = layoutOverlappingEvents(hourEvents);

                return (
                  <div
                    key={di}
                    className="border-b border-r border-border/60 h-12 relative hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => onCellClick(d, hour)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const d2 = new Date(d);
                      d2.setHours(hour);
                      onDrop(d2, hour);
                    }}
                  >
                    {hourEvents.map((ev, eidx) => {
                      const layout = slotLayouts[eidx];
                      return (
                        <div
                          key={ev.id}
                          draggable
                          onDragStart={(e) => onDragStart(ev, e)}
                          className={`absolute top-0.5 rounded-md px-1 py-0.5 text-[11px] font-medium truncate cursor-grab active:cursor-grabbing z-10 shadow-sm ${calColor(ev.calendar)}`}
                          style={{
                            left: `calc(${layout.leftPct}% + 2px)`,
                            width: `calc(${layout.widthPct}% - 4px)`,
                            minHeight: '18px',
                          }}
                          onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                        >
                          {ev.isRecurring && <Repeat size={9} className="inline-block shrink-0 align-[-1px] mr-0.5" aria-label="Berulang" />}
                          {ev.startHour ? fmtTime(ev.start) : ''} {ev.title}
                        </div>
                      );
                    })}
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
                        onDragStart={(e) => onDragStart(ev, e)}
                        className={`text-[11px] px-1 py-0.5 rounded-md truncate cursor-grab active:cursor-grabbing ${calColor(ev.calendar)}`}
                        onClick={() => onEventClick(ev)}
                      >
                        {ev.isRecurring && <Repeat size={9} className="inline-block shrink-0 align-[-1px] mr-0.5" aria-label="Berulang" />}● {ev.title}
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
          <div className="text-[11px] font-medium text-muted-foreground uppercase">Sepanjang Hari</div>
          {allDayEvents.map((ev) => (
            <div
              key={ev.id}
              draggable
              onDragStart={(e) => onDragStart(ev, e)}
              className={`text-xs px-2 py-1 rounded-md cursor-grab active:cursor-grabbing ${calColor(ev.calendar)}`}
              onClick={() => onEventClick(ev)}
            >
              {ev.isRecurring && <Repeat size={11} className="inline-block shrink-0 align-[-1px] mr-1" aria-label="Berulang" />}{ev.title}
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
            const slotLayouts = layoutOverlappingEvents(hourEvents);

            return (
              <div
                key={hour}
                className="flex min-h-[60px] border-b border-border/60 hover:bg-muted/10 transition-colors cursor-pointer"
                onClick={() => onCellClick(hour)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const d = new Date(current);
                  d.setHours(hour, 0, 0, 0);
                  onDrop(d, hour);
                }}
              >
                {/* Time label */}
                <div className="w-16 shrink-0 text-[11px] text-muted-foreground text-right pr-3 pt-1">
                  {hour === 0 ? '' : `${hour.toString().padStart(2, '0')}:00`}
                </div>
                {/* Content area */}
                <div className="flex-1 relative p-1">
                  {hourEvents.map((ev, eidx) => {
                    const pos = getEventPosition(ev);
                    const layout = slotLayouts[eidx];
                    return (
                      <div
                        key={ev.id}
                        draggable
                        onDragStart={(e) => onDragStart(ev, e)}
                        className={`absolute rounded-md px-2 py-1 text-xs font-medium truncate cursor-grab active:cursor-grabbing shadow-sm z-10 ${calColor(ev.calendar)}`}
                        style={{
                          top: pos.top,
                          height: pos.height,
                          left: `calc(${layout.leftPct}% + 2px)`,
                          width: `calc(${layout.widthPct}% - 4px)`,
                          minHeight: '22px',
                        }}
                        onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      >
                        <div className="font-semibold flex items-center gap-1">
                          {ev.isRecurring && <Repeat size={11} className="shrink-0" aria-label="Berulang" />}
                          <span className="truncate">{ev.title}</span>
                        </div>
                        <div className="opacity-70 text-[11px]">
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
