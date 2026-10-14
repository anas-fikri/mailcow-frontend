import React, { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Filter, AlertCircle, RefreshCw, Zap, Loader2, CheckCircle2,
  AlertTriangle, ArrowUp, ArrowDown, GripVertical, Copy, Pencil, Server, CloudUpload, X,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import {
  fetchFolders, fetchMessages, fetchMessageHeaders, fetchMessageHeadersRaw, moveMessages,
  markReadBulk, markFlaggedBulk, fetchSieveFilters, saveSieveFilters,
} from '../lib/api';
import { toast } from '../lib/toast';
import {
  getRules as getLegacyRules, removeRules as removeLegacyRules,
  claimAutoArchiveUids, releaseAutoArchiveClaims,
} from '../lib/autoArchive';
import {
  FIELD_OPTIONS, MATCH_OPTIONS, ACTION_OPTIONS, operatorsFor, fieldKind,
  emptyRule, emptyCondition, fromSogoFilters, toSogoFilters, validateRule,
  describeRule, moveItem, duplicateRule, matchesMessage, ruleNeedsHeaders, ruleUsesSize,
  isRunnable, planRun, folderIdToPath, mergeLegacyRules,
} from '../lib/sieveFilters';
import { loadSnoozes } from '../lib/snooze';
import { DEFAULT_FOLDERS, STALE_TIMES } from '../lib/constants';

const RUN_LIMIT = 500;       // pesan terbaru yang diperiksa "Jalankan sekarang"
const HEADER_LIMIT = 200;    // maks pesan yang header lengkapnya diunduh (Cc/header lain)

const inputCls = 'h-11 sm:h-9 bg-background border border-border rounded-md px-2.5 text-sm sm:text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary min-w-0';
const iconBtn = 'inline-flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/** Pool paralel kecil (utk unduh header lengkap). */
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; try { await fn(it); } catch { /* biarkan tak-diketahui */ } }
  }));
}

// ─── Saklar (WAI-ARIA switch) ────────────────────────────────────────────────
function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 inline-flex items-center min-h-11 px-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span aria-hidden="true" className={`relative block w-10 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

// ─── Modal dasar ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, size = 'max-w-lg', footer }) {
  const titleId = useId();
  const ref = useRef(null);
  const bodyRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Sekali saat mount: fokus ke field pertama, Escape menutup, fokus kembali
  // ke pemicu saat ditutup. (onClose via ref → effect tidak re-run tiap render.)
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); } };
    document.addEventListener('keydown', onKey);
    const first = bodyRef.current?.querySelector('input, select, textarea') || ref.current?.querySelector('button');
    first?.focus();
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] px-4 pb-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`relative bg-card border border-border rounded-xl shadow-lg w-full ${size} max-h-[88vh] flex flex-col z-10`}>
        <div className="h-12 px-4 border-b border-border flex items-center justify-between gap-2 shrink-0">
          <h2 id={titleId} className="text-sm font-semibold text-foreground truncate">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className={iconBtn}><X size={16} /></button>
        </div>
        <div ref={bodyRef} className="p-4 sm:p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-4 sm:px-5 py-3 border-t border-border flex flex-wrap items-center justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

const btnPrimary = 'inline-flex items-center justify-center gap-2 h-11 sm:h-9 px-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium transition-colors disabled:opacity-50';
const btnGhost = 'inline-flex items-center justify-center gap-2 h-11 sm:h-9 px-4 text-sm text-foreground bg-muted hover:bg-muted/80 rounded-md transition-colors disabled:opacity-50';
const btnDanger = 'inline-flex items-center justify-center gap-2 h-11 sm:h-9 px-4 text-sm font-medium text-destructive-foreground bg-destructive hover:bg-destructive/90 rounded-md transition-colors disabled:opacity-50';

// ─── Folder picker ───────────────────────────────────────────────────────────
function FolderSelect({ value, onChange, folders, id, label }) {
  const known = folders.some((f) => f.path === value);
  return (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} flex-1`}>
      <option value="">— Pilih folder —</option>
      {!known && value && <option value={value}>{value} (tidak ditemukan)</option>}
      {folders.map((f) => (
        <option key={f.path} value={f.path}>{' '.repeat((f.depth || 0) * 2)}{f.label}</option>
      ))}
    </select>
  );
}

// ─── Editor aturan ───────────────────────────────────────────────────────────
function RuleEditor({ initial, folders, folderLabel, onCancel, onSave, saving }) {
  const [rule, setRule] = useState(() => JSON.parse(JSON.stringify(initial)));
  const [showErrors, setShowErrors] = useState(false);
  const errors = useMemo(() => validateRule(rule), [rule]);
  const nameId = useId();
  const set = (patch) => setRule((r) => ({ ...r, ...patch }));
  const setCond = (i, patch) => set({ conditions: rule.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setAct = (i, patch) => set({ actions: rule.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const hasDiscard = rule.actions.some((a) => a.type === 'discard');

  const submit = (e) => {
    e.preventDefault();
    if (errors.length) { setShowErrors(true); return; }
    onSave(rule);
  };

  return (
    <Modal
      title={initial.name ? `Edit aturan: ${initial.name}` : 'Aturan baru'}
      onClose={onCancel}
      size="max-w-2xl"
      footer={(
        <>
          <button type="button" onClick={onCancel} className={btnGhost}>Batal</button>
          <button type="submit" form="rule-editor-form" disabled={saving} className={btnPrimary}>
            {saving && <Loader2 size={14} className="animate-spin" />} Simpan ke server
          </button>
        </>
      )}
    >
      <form id="rule-editor-form" onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <label htmlFor={nameId} className="block text-xs font-medium text-muted-foreground mb-1.5">Nama aturan</label>
          <input id={nameId} type="text" value={rule.name} onChange={(e) => set({ name: e.target.value })}
            placeholder="Misal: Proyek dari Bayu" className={`${inputCls} w-full`} maxLength={120} />
        </div>

        {/* Jika */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-foreground mb-1.5">Jika</legend>
          <div role="radiogroup" aria-label="Cara pencocokan" className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {MATCH_OPTIONS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={rule.match === m.id}
                onClick={() => set({ match: m.id })}
                className={`h-11 sm:h-9 px-3 rounded-md text-xs font-medium transition-colors ${rule.match === m.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {m.label}
              </button>
            ))}
          </div>
          {rule.match !== 'allmessages' && (
            <div className="space-y-2">
              {rule.conditions.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-border bg-background/50">
                  <select aria-label={`Kolom kondisi ${i + 1}`} value={c.field}
                    onChange={(e) => {
                      const field = e.target.value;
                      const kindChanged = fieldKind(field) !== fieldKind(c.field) && (fieldKind(field) === 'size' || fieldKind(c.field) === 'size');
                      setCond(i, kindChanged ? { ...emptyCondition(field) } : { field });
                    }}
                    className={inputCls}>
                    {FIELD_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  {c.field === 'header' && (
                    <input aria-label={`Nama header kondisi ${i + 1}`} value={c.header} onChange={(e) => setCond(i, { header: e.target.value })}
                      placeholder="List-Id" className={`${inputCls} w-28`} />
                  )}
                  <select aria-label={`Operator kondisi ${i + 1}`} value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value })} className={inputCls}>
                    {operatorsFor(c.field).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  {c.field === 'size' ? (
                    <span className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                      <input aria-label={`Ukuran kondisi ${i + 1}`} type="number" min="1" inputMode="numeric" value={c.value}
                        onChange={(e) => setCond(i, { value: e.target.value })} className={`${inputCls} flex-1 w-20`} />
                      <select aria-label={`Satuan ukuran kondisi ${i + 1}`} value={c.unit} onChange={(e) => setCond(i, { unit: e.target.value })} className={inputCls}>
                        <option value="KB">KB</option><option value="MB">MB</option>
                      </select>
                    </span>
                  ) : (
                    <input aria-label={`Nilai kondisi ${i + 1}`} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })}
                      placeholder={fieldKind(c.field) === 'address' ? 'nama@domain.com atau bagian alamat' : 'teks…'}
                      className={`${inputCls} flex-1 min-w-[140px]`} />
                  )}
                  <button type="button" aria-label={`Hapus kondisi ${i + 1}`} disabled={rule.conditions.length <= 1}
                    onClick={() => set({ conditions: rule.conditions.filter((_, j) => j !== i) })}
                    className={`${iconBtn} hover:text-destructive`}><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set({ conditions: [...rule.conditions, emptyCondition('from')] })}
                className="inline-flex items-center gap-1.5 h-11 sm:h-8 text-xs font-medium text-primary hover:underline">
                <Plus size={14} /> Tambah kondisi
              </button>
              <p className="text-[11px] text-muted-foreground">
                Kolom alamat (Dari/Kepada/Cc) dicocokkan dengan alamat email, bukan nama tampilan. Pola: <code>*</code> = teks apa pun, <code>?</code> = satu karakter.
              </p>
            </div>
          )}
        </fieldset>

        {/* Lakukan */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-foreground mb-1.5">Lakukan</legend>
          {rule.actions.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-border bg-background/50">
              {a.type === 'other' ? (
                <span className="flex-1 text-xs text-muted-foreground">Tindakan dari klien lain: <code>{a.raw?.method}</code> {a.argument} (dipertahankan)</span>
              ) : (
                <select aria-label={`Jenis tindakan ${i + 1}`} value={a.type} onChange={(e) => setAct(i, { type: e.target.value, argument: '' })} className={inputCls}>
                  {ACTION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              )}
              {a.type === 'fileinto' && (
                <FolderSelect label={`Folder tujuan tindakan ${i + 1}`} value={a.argument} onChange={(v) => setAct(i, { argument: v })} folders={folders} />
              )}
              {a.type === 'redirect' && (
                <input aria-label={`Alamat penerusan tindakan ${i + 1}`} type="email" value={a.argument} onChange={(e) => setAct(i, { argument: e.target.value })}
                  placeholder="nama@domain.com" className={`${inputCls} flex-1 min-w-[160px]`} />
              )}
              <button type="button" aria-label={`Hapus tindakan ${i + 1}`} onClick={() => set({ actions: rule.actions.filter((_, j) => j !== i) })}
                className={`${iconBtn} hover:text-destructive`}><Trash2 size={14} /></button>
            </div>
          ))}
          {hasDiscard && (
            <p role="alert" className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Email yang cocok akan DIBUANG permanen di server — tidak masuk Sampah dan tidak bisa dipulihkan.
            </p>
          )}
          <button type="button" onClick={() => set({ actions: [...rule.actions, { type: 'mark_seen', argument: '' }] })}
            className="inline-flex items-center gap-1.5 h-11 sm:h-8 text-xs font-medium text-primary hover:underline">
            <Plus size={14} /> Tambah tindakan
          </button>
          <label className="flex items-center gap-2 min-h-11 sm:min-h-8 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={rule.stop} onChange={(e) => set({ stop: e.target.checked })} className="w-4 h-4 accent-primary" />
            Berhenti memproses aturan lain
          </label>
        </fieldset>

        <div className="rounded-lg bg-muted px-3 py-2.5" aria-live="polite">
          <div className="text-[11px] font-medium text-muted-foreground mb-0.5">Pratinjau</div>
          <p className="text-sm text-foreground break-words">{describeRule(rule, folderLabel)}</p>
        </div>

        {showErrors && errors.length > 0 && (
          <ul role="alert" className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md space-y-0.5 list-disc pl-6">
            {errors.map((er) => <li key={er}>{er}</li>)}
          </ul>
        )}
      </form>
    </Modal>
  );
}

// ─── Konfirmasi ──────────────────────────────────────────────────────────────
function ConfirmDialog({ title, children, confirmLabel, onConfirm, onClose, danger, busy }) {
  return (
    <Modal title={title} onClose={onClose} size="max-w-sm"
      footer={(
        <>
          <button type="button" onClick={onClose} className={btnGhost}>Batal</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={danger ? btnDanger : btnPrimary}>
            {busy && <Loader2 size={14} className="animate-spin" />}{confirmLabel}
          </button>
        </>
      )}>
      <div className="text-sm text-muted-foreground space-y-2">{children}</div>
    </Modal>
  );
}

// ─── Dialog "Jalankan sekarang" ──────────────────────────────────────────────
function RunNowDialog({ scope, rules, folders, folderLabel, user, onClose, onDone }) {
  // Satu aturan boleh dijalankan manual walau nonaktif (seperti Outlook "Run Rules Now").
  const targetRules = scope === 'all'
    ? rules.filter((r) => r.active)
    : rules.filter((r) => r.key === scope).map((r) => ({ ...r, active: true }));
  const runnable = targetRules.filter(isRunnable);
  const [folderPath, setFolderPath] = useState('INBOX');
  const [phase, setPhase] = useState('idle'); // idle | counting | ready | applying
  const [plan, setPlan] = useState(null);
  const [note, setNote] = useState('');
  const folderSelId = useId();
  const folderId = useMemo(() => folders.find((f) => f.path === folderPath)?.id || `folder${folderPath.replace(/\//g, '%2F')}`, [folders, folderPath]);

  const count = async () => {
    setPhase('counting'); setPlan(null); setNote('');
    try {
      const { messages, uids } = await fetchMessages(user.sogoToken, folderId, {});
      let list = [...messages];
      if (Array.isArray(uids) && uids.length > list.length && list.length < RUN_LIMIT) {
        const have = new Set(list.map((m) => String(m.uid)));
        const rest = uids.filter((u) => !have.has(String(u))).slice(0, RUN_LIMIT - list.length);
        for (let i = 0; i < rest.length; i += 100) list.push(...await fetchMessageHeaders(user.sogoToken, folderId, rest.slice(i, i + 100)));
      }
      const truncated = (uids?.length || list.length) > RUN_LIMIT;
      list = list.slice(0, RUN_LIMIT);
      // Cc / header lain tidak ada di baris daftar → unduh header lengkap HANYA
      // utk pesan yang hasilnya belum pasti (hemat request).
      if (runnable.some(ruleNeedsHeaders)) {
        const pending = list.filter((m) => runnable.some((r) => matchesMessage(r, m) === null)).slice(0, HEADER_LIMIT);
        await pool(pending, 5, async (m) => {
          const h = await fetchMessageHeadersRaw(user.sogoToken, folderId, m.uid);
          m.cc = h.get('cc');
          m.headers = h;
        });
      }
      // Pesan yang sedang di-snooze tidak disentuh (konsisten dgn engine lama).
      const snoozed = new Set(Object.keys(loadSnoozes(user.email)[folderId] || {}));
      const p = planRun(runnable, list, { sourcePath: folderPath, isExcluded: (m) => snoozed.has(String(m.uid)) });
      const notes = [];
      if (truncated) notes.push(`Hanya ${RUN_LIMIT} email terbaru yang diperiksa.`);
      if (p.unknown) notes.push(`${p.unknown} email tidak bisa dipastikan (kondisi Ukuran/Cc hanya dievaluasi penuh di server).`);
      if (runnable.some(ruleUsesSize)) notes.push('Kondisi Ukuran tidak dievaluasi di sini.');
      if (p.skippedActions) notes.push('Teruskan/Hapus/Simpan tidak dijalankan pada email lama.');
      setNote(notes.join(' '));
      setPlan(p);
      setPhase('ready');
    } catch (err) {
      toast.error(err?.message || 'Gagal memeriksa email.');
      setPhase('idle');
    }
  };

  const apply = async () => {
    if (!plan) return;
    setPhase('applying');
    let claimed = [];
    const results = { moved: 0, seen: 0, flagged: 0, failed: 0 };
    try {
      // Tandai dulu, baru pindahkan (uid berubah setelah pindah folder).
      if (plan.markSeen.length) {
        const r = await markReadBulk(user.sogoToken, folderId, plan.markSeen, true);
        results.seen = r.ok.length; results.failed += r.failed.length;
      }
      if (plan.markFlagged.length) {
        const r = await markFlaggedBulk(user.sogoToken, folderId, plan.markFlagged, true);
        results.flagged = r.ok.length; results.failed += r.failed.length;
      }
      const matchedUids = Object.values(plan.moves).flat().map(String);
      // Klaim multi-tab (sama dgn engine lama) — uid yg sedang diproses tab lain di-skip.
      claimed = claimAutoArchiveUids(user.email, matchedUids);
      const claimedSet = new Set(claimed);
      for (const [target, uids] of Object.entries(plan.moves)) {
        const mine = uids.filter((u) => claimedSet.has(String(u)));
        if (!mine.length) continue;
        try {
          await moveMessages(user.sogoToken, folderId, mine, { path: target });
          results.moved += mine.length;
        } catch (err) {
          results.failed += mine.length;
          console.warn('[rules] run-now move gagal:', target, err?.message || err);
        }
      }
      const parts = [];
      if (results.moved) parts.push(`${results.moved} dipindahkan`);
      if (results.seen) parts.push(`${results.seen} ditandai dibaca`);
      if (results.flagged) parts.push(`${results.flagged} ditandai bendera`);
      if (parts.length) toast.success(`Aturan dijalankan: ${parts.join(', ')}.`);
      else toast.info('Tidak ada perubahan.');
      if (results.failed) toast.warning(`${results.failed} tindakan gagal — coba lagi.`);
      onDone();
    } finally {
      if (claimed.length > 0) releaseAutoArchiveClaims(user.email, claimed);
      // Rencana lama sudah basi (uid pindah) — periksa ulang bila perlu.
      setPlan(null);
      setPhase('idle');
    }
  };

  const total = plan ? plan.matched.length : 0;
  const moveCount = plan ? Object.values(plan.moves).reduce((s, u) => s + u.length, 0) : 0;
  const title = scope === 'all' ? 'Jalankan semua aturan sekarang' : `Jalankan sekarang: ${targetRules[0]?.name || ''}`;

  return (
    <Modal title={title} onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className={btnGhost}>Tutup</button>
          {phase === 'ready' && total > 0 ? (
            <button type="button" onClick={apply} className={btnPrimary}>Terapkan ke {total} email</button>
          ) : (
            <button type="button" onClick={count} disabled={!runnable.length || phase === 'counting' || phase === 'applying'} className={btnPrimary}>
              {(phase === 'counting' || phase === 'applying') && <Loader2 size={14} className="animate-spin" />} Periksa email
            </button>
          )}
        </>
      )}>
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground text-xs">
          Terapkan aturan ke email yang SUDAH ada (email baru otomatis diproses server). Hanya tindakan
          Pindahkan, Tandai dibaca, dan Tandai bendera yang dijalankan.
        </p>
        {!runnable.length && (
          <p className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">Tidak ada aturan aktif dengan tindakan yang bisa dijalankan.</p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={folderSelId} className="text-xs font-medium text-muted-foreground">Folder yang diperiksa</label>
          <select id={folderSelId} value={folderPath} onChange={(e) => { setFolderPath(e.target.value); setPlan(null); setPhase('idle'); }} className={`${inputCls} w-full`}>
            {folders.map((f) => <option key={f.path} value={f.path}>{' '.repeat((f.depth || 0) * 2)}{f.label}</option>)}
          </select>
        </div>
        {plan && (
          <div className="rounded-lg border border-border p-3 space-y-1" aria-live="polite">
            <p className="font-medium text-foreground">{total} email cocok di {folderLabel(folderPath)}</p>
            {total > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {moveCount > 0 && Object.entries(plan.moves).map(([p, u]) => <li key={p}>Pindahkan {u.length} ke {folderLabel(p)}</li>)}
                {plan.markSeen.length > 0 && <li>Tandai dibaca: {plan.markSeen.length}</li>}
                {plan.markFlagged.length > 0 && <li>Tandai bendera: {plan.markFlagged.length}</li>}
              </ul>
            )}
            {note && <p className="text-[11px] text-muted-foreground pt-1">{note}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Kartu aturan ────────────────────────────────────────────────────────────
function RuleItem({ rule, index, count, busy, folderLabel, missingFolder, onToggle, onMove, onEdit, onDuplicate, onDelete, onRun, dragProps }) {
  const name = rule.name || `Aturan ${index + 1}`;
  return (
    <li {...dragProps}
      className={`group bg-card border ${rule.active ? 'border-border' : 'border-dashed border-border'} rounded-lg shadow-sm px-2 sm:px-3 py-2 flex items-start gap-1.5 sm:gap-2 ${dragProps['data-dragging'] ? 'opacity-50' : ''}`}>
      <span aria-hidden="true" title="Seret untuk mengubah urutan" className="hidden sm:flex items-center h-11 text-muted-foreground/60 cursor-grab active:cursor-grabbing">
        <GripVertical size={16} />
      </span>
      <span aria-hidden="true" className="mt-3 text-[11px] font-semibold text-muted-foreground w-5 text-center shrink-0">{index + 1}</span>
      <div className="min-w-0 flex-1 py-1.5">
        <div className={`text-sm font-medium truncate ${rule.active ? 'text-foreground' : 'text-muted-foreground'}`}>
          {name}{!rule.active && <span className="ml-2 text-[11px] font-normal">(nonaktif)</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 break-words">{describeRule(rule, folderLabel)}</p>
        {missingFolder && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle size={12} /> Folder tujuan tidak ditemukan.</p>
        )}
        <div className="flex flex-wrap items-center gap-0.5 mt-1 -ml-1.5">
          <button type="button" onClick={onEdit} className={iconBtn} aria-label={`Edit aturan ${name}`} title="Edit"><Pencil size={14} /></button>
          <button type="button" onClick={onDuplicate} disabled={busy} className={iconBtn} aria-label={`Duplikat aturan ${name}`} title="Duplikat"><Copy size={14} /></button>
          <button type="button" onClick={onRun} disabled={!isRunnable(rule)} className={`${iconBtn} hover:text-amber-600`} aria-label={`Jalankan sekarang aturan ${name}`} title="Jalankan sekarang pada email yang sudah ada"><Zap size={14} /></button>
          <button type="button" onClick={onDelete} disabled={busy} className={`${iconBtn} hover:text-destructive hover:bg-destructive/10`} aria-label={`Hapus aturan ${name}`} title="Hapus"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-center shrink-0">
        <button type="button" onClick={() => onMove(-1)} disabled={busy || index === 0} className={iconBtn} aria-label={`Naikkan prioritas ${name}`} title="Naikkan"><ArrowUp size={14} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={busy || index === count - 1} className={iconBtn} aria-label={`Turunkan prioritas ${name}`} title="Turunkan"><ArrowDown size={14} /></button>
        <Switch checked={rule.active} onChange={onToggle} disabled={busy} label={`Aktifkan aturan ${name}`} />
      </div>
    </li>
  );
}

// ─── Halaman ─────────────────────────────────────────────────────────────────
export default function RulesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const token = user?.sogoToken;
  const email = user?.email;

  const { data: folderData = DEFAULT_FOLDERS } = useQuery({
    queryKey: ['folders', token],
    queryFn: () => fetchFolders(token),
    enabled: !!token,
    staleTime: STALE_TIMES.FOLDERS,
  });

  // Folder → { path, id, label, depth } (path = argumen fileinto SOGo).
  const folders = useMemo(() => {
    const list = [...DEFAULT_FOLDERS.filter((df) => !folderData.some((f) => f.id === df.id)), ...folderData];
    return list
      .map((f) => ({ ...f, path: f.path || folderIdToPath(f.id) }))
      .filter((f) => f.path && f.type !== 'draft');
  }, [folderData]);
  const folderLabel = useCallback((p) => folders.find((f) => f.path === p)?.label || p, [folders]);

  const filtersQuery = useQuery({
    queryKey: ['sieveFilters', token],
    queryFn: () => fetchSieveFilters(token, email),
    enabled: !!(token && email),
    staleTime: 30_000,
    retry: 1,
  });

  const [rules, setRules] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const savingRef = useRef(false);
  const rulesRef = useRef(null);
  rulesRef.current = rules;
  useEffect(() => {
    if (!filtersQuery.data || savingRef.current) return;
    // Data server sama dgn state lokal (mis. hasil save sendiri) → jangan
    // regenerasi key (remount daftar = fokus keyboard hilang).
    const cur = rulesRef.current;
    if (cur && JSON.stringify(toSogoFilters(cur)) === JSON.stringify(filtersQuery.data)) return;
    setRules(fromSogoFilters(filtersQuery.data));
  }, [filtersQuery.data]);

  const [editing, setEditing] = useState(null);   // model aturan / null
  const [confirmDel, setConfirmDel] = useState(null);
  const [runScope, setRunScope] = useState(null);  // 'all' | rule.key
  const [legacyTick, setLegacyTick] = useState(0);
  const [migrating, setMigrating] = useState(false);
  const [confirmLegacyDelete, setConfirmLegacyDelete] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const legacyRules = useMemo(() => getLegacyRules(email), [email, legacyTick]);

  const busy = saveState === 'saving';

  /**
   * Simpan daftar lengkap ke server (optimistic). Gagal → rollback ke data
   * server (refetch) + toast. @returns {Promise<boolean>}
   */
  const persist = useCallback(async (next, successMsg) => {
    if (savingRef.current || !token || !email) return false;
    const prev = rules;
    savingRef.current = true;
    setRules(next);
    setSaveState('saving');
    try {
      const sogo = toSogoFilters(next);
      await saveSieveFilters(token, email, sogo);
      queryClient.setQueryData(['sieveFilters', token], sogo);
      // Halaman Preferensi (Vacation/Tampilan) harus memuat defaults terbaru,
      // kalau tidak save berikutnya di sana menimpa aturan ini.
      queryClient.invalidateQueries({ queryKey: ['preferences', token] });
      setSaveState('saved');
      if (successMsg) toast.success(successMsg);
      return true;
    } catch (err) {
      setSaveState('error');
      toast.error(err?.message || 'Gagal menyimpan aturan ke server.');
      if (!err?.sieveFailed) setRules(prev);
      savingRef.current = false; // izinkan sinkron ulang dari refetch di bawah
      queryClient.invalidateQueries({ queryKey: ['sieveFilters', token] });
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [rules, token, email, queryClient]);

  const list = rules || [];
  const folderPaths = useMemo(() => new Set(folders.map((f) => f.path)), [folders]);

  const handleSaveEditor = async (rule) => {
    const exists = list.some((r) => r.key === rule.key);
    const next = exists ? list.map((r) => (r.key === rule.key ? rule : r)) : [...list, rule];
    const ok = await persist(next, exists ? 'Aturan diperbarui di server.' : `Aturan "${rule.name}" dibuat di server.`);
    if (ok) setEditing(null);
  };

  const handleMove = (i, delta) => persist(moveItem(list, i, i + delta));
  const handleToggle = (i, active) => persist(list.map((r, j) => (j === i ? { ...r, active } : r)),
    active ? 'Aturan diaktifkan.' : 'Aturan dinonaktifkan.');
  const handleDuplicate = (i) => {
    const copy = duplicateRule(list[i]);
    persist([...list.slice(0, i + 1), copy, ...list.slice(i + 1)], 'Aturan diduplikat.');
  };
  const handleDelete = async () => {
    if (!confirmDel) return;
    const ok = await persist(list.filter((r) => r.key !== confirmDel.key), `Aturan "${confirmDel.name}" dihapus.`);
    if (ok) setConfirmDel(null);
  };

  const handleMigrate = async () => {
    if (!legacyRules.length || !rules) return;
    setMigrating(true);
    try {
      const { rules: merged, migratedIds, skipped } = mergeLegacyRules(list, legacyRules);
      if (!migratedIds.length) { toast.warning('Tidak ada aturan lama yang bisa dipindahkan.'); return; }
      const ok = await persist(merged);
      if (!ok) return;
      // Hapus dari localStorage → engine client-side di MailPage berhenti
      // menjalankannya (tidak dobel dengan server).
      removeLegacyRules(email, migratedIds);
      setLegacyTick((t) => t + 1);
      toast.success(`${migratedIds.length} aturan lama dipindahkan ke server${skipped ? ` (${skipped} tidak bisa dipindah)` : ''}.`);
    } finally {
      setMigrating(false);
    }
  };

  const dragPropsFor = (i) => ({
    draggable: !busy,
    'data-dragging': dragIndex === i || undefined,
    onDragStart: (e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* ignore */ } },
    onDragOver: (e) => { if (dragIndex !== null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } },
    onDrop: (e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== i) persist(moveItem(list, dragIndex, i)); setDragIndex(null); },
    onDragEnd: () => setDragIndex(null),
  });

  const loading = filtersQuery.isLoading || (filtersQuery.data && rules === null);
  const loadError = filtersQuery.isError && rules === null;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="min-h-12 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
              Aturan
              <span className="text-[11px] font-medium text-muted-foreground" aria-live="polite">
                {saveState === 'saving' && <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Menyimpan…</span>}
                {saveState === 'saved' && <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle2 size={12} />Tersimpan ke server</span>}
                {saveState === 'error' && <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle size={12} />Gagal menyimpan</span>}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Server size={12} className="shrink-0" />
              Aturan berjalan di server — berlaku di webmail, Outlook, dan HP, walau browser ditutup.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setRunScope('all')} disabled={!list.some((r) => r.active && isRunnable(r))} className={btnGhost}>
              <Zap size={14} /> <span className="hidden sm:inline">Jalankan semua</span><span className="sm:hidden">Jalankan</span>
            </button>
            <button type="button" onClick={() => setEditing(emptyRule())} disabled={!rules} className={btnPrimary}>
              <Plus size={16} /> Aturan baru
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-3">
          {legacyRules.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 text-xs text-foreground">
                <p className="font-medium flex items-center gap-1.5"><AlertTriangle size={14} className="text-amber-600" /> {legacyRules.length} aturan lama hanya berjalan saat webmail terbuka</p>
                <p className="text-muted-foreground mt-0.5">Pindahkan ke server agar berlaku juga di Outlook dan HP. Setelah dipindah, aturan lama di browser dinonaktifkan supaya tidak dijalankan dua kali.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => setConfirmLegacyDelete(true)} className={btnGhost}>Hapus</button>
                <button type="button" onClick={handleMigrate} disabled={migrating || busy || !rules} className={btnPrimary}>
                  {migrating ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                  Pindahkan {legacyRules.length} aturan lama ke server
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground" role="status">
              <Loader2 size={20} className="animate-spin" /><span className="sr-only">Memuat aturan…</span>
            </div>
          )}

          {loadError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="flex-1 flex items-start gap-2"><AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />{filtersQuery.error?.message || 'Gagal memuat aturan dari server.'}</span>
              <button type="button" onClick={() => filtersQuery.refetch()} className={btnGhost}><RefreshCw size={14} /> Coba lagi</button>
            </div>
          )}

          {rules && list.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[280px] text-center gap-4 px-6 text-muted-foreground">
              <div className="w-14 h-14 rounded-lg border border-border bg-muted flex items-center justify-center"><Filter size={24} className="opacity-40" /></div>
              <div>
                <p className="text-sm font-medium text-foreground">Belum ada aturan</p>
                <p className="text-xs mt-1 max-w-xs">Pindahkan, tandai, atau teruskan email otomatis berdasarkan Dari, Kepada, Cc, subjek, dan lainnya.</p>
              </div>
              <button type="button" onClick={() => setEditing(emptyRule())} className={btnPrimary}><Plus size={16} /> Buat aturan</button>
            </div>
          )}

          {list.length > 0 && (
            <>
              <p className="text-[11px] text-muted-foreground px-1">Aturan teratas dijalankan lebih dulu. Seret atau pakai tombol panah untuk mengubah urutan.</p>
              <ol className="space-y-2" aria-label="Daftar aturan (urut prioritas)">
                {list.map((rule, i) => (
                  <RuleItem
                    key={rule.key}
                    rule={rule}
                    index={i}
                    count={list.length}
                    busy={busy}
                    folderLabel={folderLabel}
                    missingFolder={folderData !== DEFAULT_FOLDERS && rule.actions.some((a) => a.type === 'fileinto' && a.argument && !folderPaths.has(a.argument))}
                    onToggle={(active) => handleToggle(i, active)}
                    onMove={(d) => handleMove(i, d)}
                    onEdit={() => setEditing(rule)}
                    onDuplicate={() => handleDuplicate(i)}
                    onDelete={() => setConfirmDel({ key: rule.key, name: rule.name || `Aturan ${i + 1}` })}
                    onRun={() => setRunScope(rule.key)}
                    dragProps={dragPropsFor(i)}
                  />
                ))}
              </ol>
            </>
          )}
        </div>
      </div>

      {editing && (
        <RuleEditor initial={editing} folders={folders} folderLabel={folderLabel} saving={busy}
          onCancel={() => setEditing(null)} onSave={handleSaveEditor} />
      )}

      {confirmDel && (
        <ConfirmDialog title="Hapus aturan?" danger busy={busy} confirmLabel="Hapus"
          onClose={() => setConfirmDel(null)} onConfirm={handleDelete}>
          <p>Aturan <strong className="text-foreground">"{confirmDel.name}"</strong> akan dihapus dari server dan tidak lagi berlaku di webmail, Outlook, maupun HP.</p>
        </ConfirmDialog>
      )}

      {confirmLegacyDelete && (
        <ConfirmDialog title="Hapus aturan lama?" danger confirmLabel="Hapus"
          onClose={() => setConfirmLegacyDelete(false)}
          onConfirm={() => { removeLegacyRules(email, legacyRules.map((r) => r.id)); setLegacyTick((t) => t + 1); setConfirmLegacyDelete(false); toast.success('Aturan lama dihapus.'); }}>
          <p>{legacyRules.length} aturan lama di browser ini akan dihapus tanpa dipindah ke server.</p>
        </ConfirmDialog>
      )}

      {runScope && rules && (
        <RunNowDialog scope={runScope} rules={list} folders={folders} folderLabel={folderLabel} user={user}
          onClose={() => setRunScope(null)}
          onDone={() => queryClient.invalidateQueries({ queryKey: ['messages', token] })} />
      )}
    </div>
  );
}
