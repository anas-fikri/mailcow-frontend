// DateRangePicker (form Auto-Reply Cuti) — logika kalender murni + kontrak statis.
process.env.TZ = 'Asia/Jakarta';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const C = await import('../src/lib/calendarGrid.js');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

// ── Grid bulan: Senin dulu, 6×7, batas bulan ─────────────────────────────────
const nov = C.monthMatrix(2026, 10); // November 2026: 1 Nov = Minggu
eq(nov.length, 6, '6 minggu'); ok(nov.every((r) => r.length === 7), '7 hari per minggu');
eq(nov[0][0].ymd, '2026-10-26', 'baris pertama mulai Senin 26 Okt');
eq(nov[0][6], { ymd: '2026-11-01', day: 1, inMonth: true }, '1 Nov (Minggu) di kolom terakhir');
ok(!nov[0][0].inMonth, 'Oktober = di luar bulan');
eq(nov.flat().filter((c) => c.inMonth).length, 30, 'November 30 hari');
eq(C.monthMatrix(2026, 5)[0][0].ymd, '2026-06-01', '1 Jun 2026 = Senin → kolom pertama');
eq(C.monthMatrix(2028, 1).flat().filter((c) => c.inMonth).length, 29, 'Feb 2028 kabisat');
eq(C.monthMatrix(2026, 1).flat().filter((c) => c.inMonth).length, 28, 'Feb 2026 bukan kabisat');
eq(C.monthMatrix(2100, 1).flat().filter((c) => c.inMonth).length, 28, '2100 bukan kabisat');
eq(C.monthMatrix(2026, 11).flat().at(-1).ymd, '2027-01-10', 'Des 2026 menyeberang tahun');
eq(C.WEEK_HEADER.map((w) => w.short).join(' '), 'Sen Sel Rab Kam Jum Sab Min', 'header Senin..Minggu');

// ── Parsing / tanggal lokal ──────────────────────────────────────────────────
eq(C.parseYmd('2026-02-30'), null, 'tanggal mustahil ditolak');
eq(C.parseYmd(''), null);
eq(C.todayYmd(new Date(2026, 10, 3, 23, 59)), '2026-11-03', 'hari ini lokal (bukan UTC)');
eq(C.todayYmd(new Date(2026, 10, 3, 0, 30)), '2026-11-03', 'dini hari WIB tidak mundur sehari');

// ── Logika rentang ───────────────────────────────────────────────────────────
const sel = (st, d, m) => { const r = C.selectDate(st, d, m); return [r.start, r.end, r.complete]; };
eq(sel({}, '2026-11-03'), ['2026-11-03', '', false], 'klik 1 = mulai');
eq(sel({ start: '2026-11-03' }, '2026-11-07'), ['2026-11-03', '2026-11-07', true], 'klik 2 = selesai');
eq(sel({ start: '2026-11-07' }, '2026-11-03'), ['2026-11-03', '2026-11-07', true], 'selesai < mulai → ditukar');
eq(sel({ start: '2026-11-03' }, '2026-11-03'), ['2026-11-03', '2026-11-03', true], 'rentang satu hari');
eq(sel({ start: '2026-11-03', end: '2026-11-07' }, '2026-11-10'), ['2026-11-10', '', false], 'rentang lengkap → mulai baru');
eq(sel({ start: '', end: '2026-11-07' }, '2026-11-02'), ['2026-11-02', '2026-11-07', true], 'data lama: hanya selesai');
eq(sel({ start: '', end: '2026-11-07' }, '2026-11-09'), ['2026-11-09', '', false], 'hanya selesai, klik setelahnya → mulai baru');
eq(sel({ start: '2026-11-03', end: '2026-11-07' }, '2026-12-01', 'single'), ['2026-12-01', '', true], 'mode single');
eq(sel({ start: '2026-11-03' }, 'bukan-tanggal'), ['2026-11-03', '', false], 'input tak valid diabaikan');
eq(C.highlightRange('2026-11-07', '', '2026-11-03'), { from: '2026-11-03', to: '2026-11-07', preview: true }, 'pratinjau hover mundur');
eq(C.highlightRange('', '', '2026-11-03'), null, 'tanpa mulai → tanpa sorotan');
const st = C.dayState('2026-11-05', { start: '2026-11-03', end: '2026-11-07', today: '2026-11-05', min: '2026-11-05' });
ok(st.inRange && !st.isEndpoint && st.isToday && !st.isMuted, 'status sel tengah rentang');
ok(C.dayState('2026-11-01', { min: '2026-11-05' }).isMuted, 'tanggal lampau redup (tidak diblokir)');
ok(C.dayState('2026-11-03', { start: '2026-11-03', end: '2026-11-07' }).isStart, 'ujung mulai');
eq(C.rangeLength('2026-11-03', '2026-11-07'), 5, '3–7 Nov = 5 hari');
eq(C.rangeLength('2026-03-28', '2026-04-02'), 6, 'lintas bulan');

// Kosongkan (clear) & pintasan
const q = Object.fromEntries(C.quickRanges('2026-11-04', { start: '2026-11-04' }).map((x) => [x.id, [x.start, x.end]]));
eq(q.today, ['2026-11-04', '2026-11-04']);
eq(q.tomorrow, ['2026-11-05', '2026-11-05']);
eq(q['this-week'], ['2026-11-04', '2026-11-08'], 'Minggu ini = hari ini → Minggu');
eq(q['plus-week'], ['2026-11-04', '2026-11-10'], '+1 minggu = hari ini + 6');
eq(q['clear-end'], ['2026-11-04', ''], 'Kosongkan selesai');

// ── Format Indonesia ─────────────────────────────────────────────────────────
eq(C.formatShort('2026-11-03'), 'Sel, 3 Nov 2026');
eq(C.formatLong('2026-11-02'), 'Senin, 2 November 2026');
eq(C.formatMonthTitle(2026, 10), 'November 2026');
eq(C.formatRangeLabel('2026-11-02', '2026-11-06'), 'Sen, 2 Nov 2026 – Jum, 6 Nov 2026');
eq(C.formatRangeLabel('2026-11-02', ''), 'Mulai 2 Nov 2026 · tanpa tanggal selesai');
eq(C.formatRangeLabel('', ''), 'Pilih tanggal mulai');
eq(C.formatRangeLabel('2026-11-02', '2026-11-02'), 'Sen, 2 Nov 2026', 'satu hari tanpa tanda –');
eq(C.formatRangeLabel('', '2026-11-06'), 'Sampai 6 Nov 2026');
eq(C.formatShort('2026-08-17'), 'Sen, 17 Agu 2026', 'Agustus = Agu');

// ── Navigasi keyboard ────────────────────────────────────────────────────────
eq(C.moveFocus('2026-11-30', 'ArrowRight'), '2026-12-01', '+1 hari lintas bulan');
eq(C.moveFocus('2026-01-01', 'ArrowLeft'), '2025-12-31', '-1 hari lintas tahun');
eq(C.moveFocus('2026-11-03', 'ArrowDown'), '2026-11-10', '+7');
eq(C.moveFocus('2026-11-03', 'ArrowUp'), '2026-10-27', '-7');
eq(C.moveFocus('2026-01-31', 'PageDown'), '2026-02-28', 'bulan berikut di-clamp');
eq(C.moveFocus('2028-03-31', 'PageUp'), '2028-02-29', 'clamp ke 29 Feb kabisat');
eq(C.moveFocus('2026-11-03', 'PageDown', { shiftKey: true }), '2027-11-03', 'Shift+PageDown = tahun');
eq(C.moveFocus('2026-11-05', 'Home'), '2026-11-02', 'Home = Senin');
eq(C.moveFocus('2026-11-05', 'End'), '2026-11-08', 'End = Minggu');
eq(C.moveFocus('2026-11-08', 'Home'), '2026-11-02', 'Minggu → Senin minggu yang sama');
eq(C.moveFocus('2026-11-05', 'Tab'), null, 'tombol lain bukan navigasi');

// ── Kontrak statis ───────────────────────────────────────────────────────────
const prefs = readFileSync(new URL('../src/pages/PreferencesPage.jsx', import.meta.url), 'utf8');
const vac = prefs.slice(prefs.indexOf('function VacationSection('), prefs.indexOf('// ─── Preset theme colors'));
ok(vac.length > 500, 'VacationSection ditemukan');
ok(/<DateRangePicker[\s\S]*start=\{startDate\}[\s\S]*end=\{endDate\}/.test(vac), 'VacationSection memakai DateRangePicker');
ok(!vac.includes('type="date"'), 'tidak ada input tanggal native di VacationSection');
ok(vac.includes('Kosongkan tanggal selesai untuk auto-reply tanpa batas waktu.'), 'teks bantuan');
ok(vac.includes('buildVacationPayload(') && vac.includes('validateVacationForm('), 'jalur simpan/validasi tetap');
const comp = readFileSync(new URL('../src/components/DateRangePicker.jsx', import.meta.url), 'utf8');
ok(comp.includes('role="grid"') && comp.includes('role="gridcell"') && comp.includes('aria-selected='), 'grid ARIA');
ok(comp.includes('role="dialog"') && comp.includes('aria-modal="false"'), 'dialog non-modal');
ok(/addEventListener\('keydown', onEsc, true\)/.test(comp) && comp.includes('e.stopPropagation()'), 'Esc ditangkap fase capture');
ok(comp.includes('pos.ready') && comp.includes("visibility: pos.ready ? 'visible' : 'hidden'"), 'fokus setelah popover terlihat');
ok(!comp.includes('.toISOString(') && !readFileSync(new URL('../src/lib/calendarGrid.js', import.meta.url), 'utf8').includes('.toISOString('), 'tanpa UTC');
ok(!/#[0-9a-fA-F]{3,6}\b/.test(comp), 'tanpa warna hex mentah');
ok(comp.includes('aria-label="Bulan sebelumnya"') && comp.includes('aria-label="Bulan berikutnya"'), 'navigasi bulan berlabel');

console.log(`PASS test-date-range-picker (${n} asserts)`);
