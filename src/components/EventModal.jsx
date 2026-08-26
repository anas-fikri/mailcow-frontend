import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Calendar, Clock, MapPin, Users, FileText } from 'lucide-react';
import { validateEventTimes, normalizeRepeatCount } from '../lib/eventValidation';
import { toLocalDateStr, toLocalTimeStr } from '../lib/dateFormat';

const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

const FREQ_UNITS = { daily: 'hari', weekly: 'minggu', monthly: 'bulan', yearly: 'tahun' };

// Kode hari iCal BYDAY (SOGo memakai 2-huruf: MO..SU).
const WEEKDAYS = [
  { code: 'MO', label: 'Sen' },
  { code: 'TU', label: 'Sel' },
  { code: 'WE', label: 'Rab' },
  { code: 'TH', label: 'Kam' },
  { code: 'FR', label: 'Jum' },
  { code: 'SA', label: 'Sab' },
  { code: 'SU', label: 'Min' },
];
// Date.getDay() (0=Minggu..6=Sabtu) → kode BYDAY.
const ISO_DAY_FROM_JS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
function dayCodeFromDate(date) {
  // `date` di sini berupa 'YYYY-MM-DD' dari input type=date. Parsing pakai
  // `new Date('YYYY-MM-DD')` menghasilkan UTC-midnight sehingga getDay() bisa
  // meleset satu hari di timezone di belakang UTC. Parse komponennya manual
  // agar hari yang dipakai selalu hari lokal yang dipilih user.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (m) {
    const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return ISO_DAY_FROM_JS[local.getDay()];
  }
  const d = toValidDate(date) || new Date();
  return ISO_DAY_FROM_JS[d.getDay()];
}
const WEEKDAYS_ONLY = ['MO', 'TU', 'WE', 'TH', 'FR'];

// Hati-hati: event tanpa `start`/`end` yang valid (mis. NaN) membuat
// Date invalid → selalu guard dengan isNaN sebelum memformat.
function toValidDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function todayAt(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export default function EventModal({ isOpen, onClose, onSave, onDelete, event, sogoToken, mode = 'create' }) {
  const isEdit = mode === 'edit';
  const isView = mode === 'view';

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(toLocalDateStr(todayAt(9, 0)));
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState(toLocalDateStr(todayAt(10, 0)));
  const [endTime, setEndTime] = useState('10:00');
  const [isAllDay, setIsAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [attendees, setAttendees] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Guard re-entry: tombol disabled={saving} hanya efektif SETELAH re-render;
  // Enter auto-repeat / klik ganda di tick yang sama bisa memanggil handleSave
  // dua kali → dua event (masing-masing newEventGuid). Ref ini sinkron.
  const savingRef = useRef(false);

  // Recurrence — kirim ke SOGo sebagai objek `repeat` (iCalRepeatableEntityObject+SOGo.m).
  const [freq, setFreq] = useState('never');                 // never|daily|weekly|monthly|yearly
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEnd, setRepeatEnd] = useState('never');        // never|count|until
  const [repeatCount, setRepeatCount] = useState(10);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [weekDays, setWeekDays] = useState([]);               // kode BYDAY terpilih utk weekly
  const [hasCustomRepeat, setHasCustomRepeat] = useState(false);
  const repeatTouchedRef = useRef(false);
  const originalRepeatRef = useRef(null);

  // Terapkan pola pengulangan ke state UI. Pola asli disimpan di ref agar
  // pola kustom/tidak-umum TIDAK hilang saat user hanya mengubah field lain.
  function applyRepeat(repeat) {
    repeatTouchedRef.current = false;
    originalRepeatRef.current = repeat && typeof repeat === 'object' ? repeat : null;
    const r = originalRepeatRef.current;
    if (!r) {
      setFreq('never');
      setRepeatInterval(1);
      setRepeatEnd('never');
      setRepeatCount(10);
      setRepeatUntil('');
      setWeekDays([]);
      setHasCustomRepeat(false);
      return;
    }
    let f = String(r.frequency || '').toLowerCase();
    let iv = Number(r.interval) || 1;
    if (f === 'bi-weekly') { f = 'weekly'; iv = 2; }
    const common = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!common.includes(f)) {
      // custom / every weekday / byday — tidak diedit di UI, tapi dipertahankan.
      setHasCustomRepeat(true);
      f = 'never';
    } else {
      setHasCustomRepeat(false);
    }
    setFreq(f);
    setRepeatInterval(iv);
    // Hari utk weekly (days: [{day:'MO'},...]); pola byday utk monthly/yearly
    // tidak diedit di UI (dipertahankan via originalRepeatRef bila tak disentuh).
    const days = Array.isArray(r.days) ? r.days.map((d) => d?.day).filter(Boolean) : [];
    setWeekDays(f === 'weekly' ? days : []);
    if (r.count) {
      setRepeatEnd('count');
      setRepeatCount(Number(r.count) || 10);
      setRepeatUntil('');
    } else if (r.until) {
      setRepeatEnd('until');
      setRepeatUntil(String(r.until).slice(0, 10));
      setRepeatCount(10);
    } else {
      setRepeatEnd('never');
      setRepeatCount(10);
      setRepeatUntil('');
    }
  }

  useEffect(() => {
    if (isOpen) {
      if (event instanceof Date) {
        /* ── Create mode: date pre-filled from calendar click ── */
        const start = event;
        const end   = new Date(start.getTime() + 3600000);
        setTitle('');
        setStartDate(toLocalDateStr(start));
        setStartTime(toLocalTimeStr(start));
        setEndDate(toLocalDateStr(end));
        setEndTime(toLocalTimeStr(end));
        setIsAllDay(false);
        setLocation('');
        setDescription('');
        setAttendees('');
        setError('');
        applyRepeat(null);
      } else if (event && typeof event === 'object') {
        /* ── Edit / View mode ── */
        setTitle(event.title || '');
        const start = event.start ? new Date(Number(event.start) * 1000) : todayAt(9, 0);
        const end   = event.end  ? new Date(Number(event.end)   * 1000) : new Date(start.getTime() + 3600000);
        setStartDate(toLocalDateStr(start));
        setStartTime(toLocalTimeStr(start));
        setEndDate(toLocalDateStr(end));
        setEndTime(toLocalTimeStr(end));
        setIsAllDay(!!event.isAllDay);
        setLocation(event.location || '');
        setDescription(event.description || '');
        setAttendees(event.attendees || '');
        setError('');
        applyRepeat(event.repeat);
      } else {
        /* ── Fresh create (no pre-fill) ── */
        setTitle('');
        setStartDate(toLocalDateStr(todayAt(9, 0)));
        setStartTime('09:00');
        setEndDate(toLocalDateStr(todayAt(10, 0)));
        setEndTime('10:00');
        setIsAllDay(false);
        setLocation('');
        setDescription('');
        setAttendees('');
        setError('');
        applyRepeat(null);
      }
    }
  }, [isOpen, event]);

  async function handleSave(e) {
    e.preventDefault();
    if (savingRef.current) return; // double-submit (Enter auto-repeat / klik ganda)
    if (!title.trim()) { setError('Judul event wajib diisi.'); return; }

    // Cegah event durasi negatif: SOGo menerima payload end < start dan
    // membuat event rusak / error 500 — validasi di sini (bukan hanya UI input).
    const timeCheck = validateEventTimes({ startDate, startTime, endDate, endTime, isAllDay });
    if (!timeCheck.ok) { setError(timeCheck.message); return; }

    savingRef.current = true;
    setSaving(true);
    setError('');

    try {
      // Bangun objek `repeat` hanya jika user mengubah kontrol pengulangan;
      // selain itu pertahankan pola asli (termasuk pola kustom) apa adanya.
      let repeat = null;
      if (repeatTouchedRef.current) {
        if (freq !== 'never') {
          repeat = { frequency: freq, interval: normalizeRepeatCount(repeatInterval) };
          if (freq === 'weekly') {
            const days = weekDays.length > 0 ? weekDays : [dayCodeFromDate(startDate)];
            repeat.days = days.map((d) => ({ day: d }));
          }
          if (repeatEnd === 'count') repeat.count = normalizeRepeatCount(repeatCount);
          else if (repeatEnd === 'until' && repeatUntil) repeat.until = repeatUntil;
        }
      } else {
        repeat = originalRepeatRef.current;
      }

      const eventData = {
        title: title.trim(),
        startDate,
        startTime: isAllDay ? '' : startTime,
        endDate,
        endTime: isAllDay ? '' : endTime,
        location: location.trim(),
        description: description.trim(),
        isAllDay,
        attendees: attendees.trim(),
        // Pertahankan klasifikasi asli saat edit (detail dari /view).
        classification: event?.classification,
        repeat,
      };

      if (isEdit && event?.id) {
        await onSave(eventData, event.id);
      } else {
        await onSave(eventData);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan event.');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  async function handleDelete() {
    if (!event?.id) return;
    if (savingRef.current) return; // double-click hapus → satu eksekusi
    savingRef.current = true;
    setSaving(true);
    try {
      await onDelete(event.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal menghapus event.');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full sm:max-w-lg bg-background flex flex-col rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
              <h2 className="text-base font-semibold">
                {isView ? 'Detail Event' : isEdit ? 'Edit Event' : 'Event Baru'}
              </h2>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            {isView ? (
              /* ── View Mode ── */
              <div className="px-5 py-4 space-y-4">
                <h3 className="text-lg font-semibold">{event?.title}</h3>

                <div className="flex items-start gap-3 text-sm">
                  <Calendar size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    {event?.isAllDay ? (
                      <span>Sepanjang hari</span>
                    ) : (
                      <>
                        <div>{toLocalDateStr(new Date(Number(event?.start) * 1000))}</div>
                        <div className="text-muted-foreground">
                          {startTime} – {endTime}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {event?.location && (
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <span>{event.location}</span>
                  </div>
                )}

                {event?.attendees && (
                  <div className="flex items-start gap-3 text-sm">
                    <Users size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <span>{event.attendees}</span>
                  </div>
                )}

                {event?.description && (
                  <div className="flex items-start gap-3 text-sm">
                    <FileText size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-muted-foreground whitespace-pre-wrap">{event.description}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-3 border-t border-border">
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg text-sm font-medium transition-colors"
                  >
                    Hapus
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium transition-colors hover:bg-muted/80"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              /* ── Create / Edit Form ── */
              <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
                {error && (
                  <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
                )}

                {/* Title */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Judul</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    placeholder="Nama event"
                    autoFocus
                  />
                </div>

                {/* All day toggle */}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAllDay}
                    onChange={e => setIsAllDay(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary/30"
                  />
                  Sepanjang hari
                </label>

                {/* Recurrence */}
                <div className="space-y-2 border-t border-border pt-3">
                  <label className="text-sm font-medium text-foreground block">Pengulangan</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <select
                        value={freq}
                        onChange={(e) => { setFreq(e.target.value); repeatTouchedRef.current = true; }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      >
                        <option value="never">Tidak berulang</option>
                        <option value="daily">Harian</option>
                        <option value="weekly">Mingguan</option>
                        <option value="monthly">Bulanan</option>
                        <option value="yearly">Tahunan</option>
                      </select>
                    </div>
                    {freq !== 'never' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Setiap</span>
                        <input
                          type="number"
                          min="1"
                          value={repeatInterval}
                          onChange={(e) => { setRepeatInterval(e.target.value); repeatTouchedRef.current = true; }}
                          className="w-16 bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                        <span className="text-xs text-muted-foreground">{FREQ_UNITS[freq] || ''}</span>
                      </div>
                    )}
                  </div>

                  {freq === 'weekly' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Ulangi pada hari:</span>
                        <button
                          type="button"
                          onClick={() => {
                            const allSelected = WEEKDAYS_ONLY.every((c) => weekDays.includes(c));
                            setWeekDays(allSelected ? [] : [...WEEKDAYS_ONLY]);
                            repeatTouchedRef.current = true;
                          }}
                          className={`text-xs font-medium transition-colors ${
                            WEEKDAYS_ONLY.every((c) => weekDays.includes(c)) && weekDays.length === WEEKDAYS_ONLY.length
                              ? 'text-primary'
                              : 'text-primary hover:underline'
                          }`}
                        >
                          Hari kerja saja
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((d) => {
                          const active = weekDays.includes(d.code);
                          return (
                            <button
                              key={d.code}
                              type="button"
                              onClick={() => {
                                setWeekDays((prev) =>
                                  prev.includes(d.code) ? prev.filter((x) => x !== d.code) : [...prev, d.code]
                                );
                                repeatTouchedRef.current = true;
                              }}
                              aria-pressed={active}
                              className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                active
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background text-foreground border-border hover:bg-muted'
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {freq !== 'never' && (
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={repeatEnd}
                        onChange={(e) => { setRepeatEnd(e.target.value); repeatTouchedRef.current = true; }}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      >
                        <option value="never">Tanpa akhir</option>
                        <option value="count">Setelah beberapa kali</option>
                        <option value="until">Sampai tanggal</option>
                      </select>
                      {repeatEnd === 'count' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={repeatCount}
                            onChange={(e) => { setRepeatCount(e.target.value); repeatTouchedRef.current = true; }}
                            className="w-20 bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          />
                          <span className="text-xs text-muted-foreground">kali</span>
                        </div>
                      )}
                      {repeatEnd === 'until' && (
                        <input
                          type="date"
                          value={repeatUntil}
                          onChange={(e) => { setRepeatUntil(e.target.value); repeatTouchedRef.current = true; }}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                      )}
                    </div>
                  )}

                  {hasCustomRepeat && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Pola pengulangan kustom dipertahankan apa adanya (tidak diedit di sini).
                    </p>
                  )}
                </div>

                {/* Start date/time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Mulai tanggal</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  {!isAllDay && (
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Jam</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={e => setStartTime(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                  )}
                </div>

                {/* End date/time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Selesai tanggal</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  {!isAllDay && (
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Jam</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={e => setEndTime(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                  )}
                </div>

                {/* Location */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Lokasi</label>
                  <input
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    placeholder="Ruang meeting, URL, dll"
                  />
                </div>

                {/* Attendees */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Undang peserta</label>
                  <input
                    type="text"
                    value={attendees}
                    onChange={e => setAttendees(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    placeholder="email@domain.com, email2@domain.com"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Pisahkan dengan koma untuk banyak peserta</p>
                </div>

                {/* Description */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Deskripsi</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                    placeholder="Deskripsi event..."
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {isEdit && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={saving}
                      className="px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg text-sm font-medium transition-colors"
                    >
                      Hapus
                    </button>
                  )}
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium transition-colors hover:bg-muted/80"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-colors hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2"
                  >
                    {saving ? <><Loader2 size={14} className="animate-spin" /> Menyimpan...</> : (isEdit ? 'Simpan' : 'Buat Event')}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
