import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Calendar, Clock, MapPin, Users, FileText } from 'lucide-react';

const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// Hati-hati: event tanpa `start`/`end` yang valid (mis. NaN) membuat
// Date invalid dan toISOString() melempar RangeError → crash halaman.
// Selalu guard dengan isNaN sebelum memformat.
function toValidDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function toDateStr(d) {
  const dt = toValidDate(d);
  return dt ? dt.toISOString().slice(0, 10) : '';
}

function toTimeStr(d) {
  const dt = toValidDate(d);
  return dt ? dt.toTimeString().slice(0, 5) : '';
}

function fmtInputDate(date) {
  const d = toValidDate(date);
  return d ? d.toISOString().slice(0, 10) : '';
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
  const [startDate, setStartDate] = useState(toDateStr(todayAt(9, 0)));
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState(toDateStr(todayAt(10, 0)));
  const [endTime, setEndTime] = useState('10:00');
  const [isAllDay, setIsAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [attendees, setAttendees] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (event instanceof Date) {
        /* ── Create mode: date pre-filled from calendar click ── */
        const start = event;
        const end   = new Date(start.getTime() + 3600000);
        setTitle('');
        setStartDate(toDateStr(start));
        setStartTime(toTimeStr(start));
        setEndDate(toDateStr(end));
        setEndTime(toTimeStr(end));
        setIsAllDay(false);
        setLocation('');
        setDescription('');
        setAttendees('');
        setError('');
      } else if (event && typeof event === 'object') {
        /* ── Edit / View mode ── */
        setTitle(event.title || '');
        const start = event.start ? new Date(Number(event.start) * 1000) : todayAt(9, 0);
        const end   = event.end  ? new Date(Number(event.end)   * 1000) : new Date(start.getTime() + 3600000);
        setStartDate(toDateStr(start));
        setStartTime(toTimeStr(start));
        setEndDate(toDateStr(end));
        setEndTime(toTimeStr(end));
        setIsAllDay(!!event.isAllDay);
        setLocation(event.location || '');
        setDescription(event.description || '');
        setAttendees(event.attendees || '');
        setError('');
      } else {
        /* ── Fresh create (no pre-fill) ── */
        setTitle('');
        setStartDate(toDateStr(todayAt(9, 0)));
        setStartTime('09:00');
        setEndDate(toDateStr(todayAt(10, 0)));
        setEndTime('10:00');
        setIsAllDay(false);
        setLocation('');
        setDescription('');
        setAttendees('');
        setError('');
      }
    }
  }, [isOpen, event]);

  async function handleSave(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Judul event wajib diisi.'); return; }

    setSaving(true);
    setError('');

    try {
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
    }
  }

  async function handleDelete() {
    if (!event?.id) return;
    setSaving(true);
    try {
      await onDelete(event.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal menghapus event.');
    } finally {
      setSaving(false);
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
                        <div>{fmtInputDate(Number(event?.start) * 1000)}</div>
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
