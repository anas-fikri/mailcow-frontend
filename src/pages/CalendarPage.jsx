import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Loader2, MapPin, Clock, Plus } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fetchCalendarEvents } from '../lib/api';

const DAYS_ID  = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function fmtTime(unix) {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

// Warna event berdasarkan kalender
const CAL_COLORS = [
  'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  'bg-purple-500/20 text-purple-700 dark:text-purple-300',
  'bg-green-500/20 text-green-700 dark:text-green-300',
  'bg-orange-500/20 text-orange-700 dark:text-orange-300',
];

function calColor(calName = '') {
  const idx = calName.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % CAL_COLORS.length;
  return CAL_COLORS[idx];
}

export default function CalendarPage() {
  const { user } = useAuthStore();
  const [current, setCurrent]   = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [detailEv, setDetailEv] = useState(null);

  // Unix timestamps untuk awal & akhir bulan yang ditampilkan (+ buffer minggu)
  const startDate = useMemo(() => Math.floor(
    new Date(current.getFullYear(), current.getMonth() - 1, 20).getTime() / 1000
  ), [current]);
  const endDate = useMemo(() => Math.floor(
    new Date(current.getFullYear(), current.getMonth() + 1, 10).getTime() / 1000
  ), [current]);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendar', user?.sogoToken, startDate, endDate],
    queryFn: () => fetchCalendarEvents(user?.sogoToken, 'personal', startDate, endDate),
    enabled: !!user?.sogoToken,
    staleTime: 5 * 60_000,
  });

  // Build calendar grid
  const firstDay = new Date(current.getFullYear(), current.getMonth(), 1);
  const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  const startPad = firstDay.getDay(); // 0=Sun

  const gridDays = [];
  for (let i = 0; i < startPad; i++) gridDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    gridDays.push(new Date(current.getFullYear(), current.getMonth(), d));
  }

  // Events per hari (dari unix timestamp)
  function eventsForDay(date) {
    if (!date) return [];
    const dayStart = Math.floor(date.getTime() / 1000);
    const dayEnd   = dayStart + 86399;
    return events.filter(ev => {
      const s = Number(ev.start);
      return s >= dayStart && s <= dayEnd;
    });
  }

  const selectedEvents = eventsForDay(selected);

  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ── Kalender Grid ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Header navigasi */}
        <div className="px-5 py-4 border-b border-border bg-card flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <CalIcon size={20} className="text-primary" />
            <h1 className="text-lg font-semibold">Kalender</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => { setCurrent(new Date()); setSelected(new Date()); }}
              className="text-sm font-semibold text-foreground w-40 text-center hover:text-primary transition-colors"
            >
              {MONTHS_ID[current.getMonth()]} {current.getFullYear()}
            </button>
            <button
              onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="w-24" /> {/* spacer */}
        </div>

        {/* Grid header (nama hari) */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {DAYS_ID.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Grid hari */}
        <div className="grid grid-cols-7 flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          )}
          {gridDays.map((date, i) => {
            if (!date) return (
              <div key={`pad-${i}`} className="min-h-[80px] border-b border-r border-border/40 bg-muted/10" />
            );

            const isToday    = date.toDateString() === new Date().toDateString();
            const isSelected = date.toDateString() === selected.toDateString();
            const dayEvs     = eventsForDay(date);

            return (
              <button
                key={date.getTime()}
                onClick={() => setSelected(date)}
                className={`min-h-[80px] border-b border-r border-border/40 p-1.5 flex flex-col text-left hover:bg-muted/50 transition-colors ${
                  isSelected ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''
                }`}
              >
                <span className={`
                  w-7 h-7 text-sm flex items-center justify-center rounded-full font-medium shrink-0
                  ${isToday ? 'bg-primary text-primary-foreground font-bold' : 'text-foreground'}
                `}>
                  {date.getDate()}
                </span>
                <div className="mt-1 space-y-0.5 w-full overflow-hidden">
                  {dayEvs.slice(0, 3).map((ev, idx) => (
                    <div
                      key={idx}
                      className={`text-[10px] px-1.5 py-0.5 rounded truncate w-full ${calColor(ev.calendar)}`}
                      onClick={e => { e.stopPropagation(); setSelected(date); setDetailEv(ev); }}
                    >
                      {ev.isAllDay ? '● ' : `${ev.startHour || ''} `}{ev.title}
                    </div>
                  ))}
                  {dayEvs.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1">+{dayEvs.length - 3} lagi</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Panel samping: acara hari terpilih ─────────────────────────────── */}
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
                key={i}
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
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${calColor(detailEv.calendar)}`}>
                {detailEv.calendar || 'Kalender'}
              </div>
              <button onClick={() => setDetailEv(null)} className="p-1 rounded-full hover:bg-muted text-muted-foreground">
                <ChevronRight size={16} />
              </button>
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
    </div>
  );
}
