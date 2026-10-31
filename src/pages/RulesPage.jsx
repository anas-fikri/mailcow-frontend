import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import {
  Plus, Trash2, Filter, AlertCircle, RefreshCw, Zap, Loader2, CheckCircle2,
  AlertTriangle, ArrowUp, ArrowDown, GripVertical, Copy, Pencil, Server, CloudUpload,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fetchFolders, fetchSieveFilters, saveSieveFilters } from '../lib/api';
import { toast } from '../lib/toast';
import { getRules as getLegacyRules, removeRules as removeLegacyRules } from '../lib/autoArchive';
import {
  emptyRule, fromSogoFilters, toSogoFilters, describeRule, moveItem, duplicateRule,
  isRunnable, folderIdToPath, mergeLegacyRules,
} from '../lib/sieveFilters';
import Modal from '../components/rules/Modal';
import RuleEditor from '../components/rules/RuleEditor';
import RunNowDialog from '../components/rules/RunNowDialog';
import { iconBtn, btnPrimary, btnGhost, btnDanger } from '../components/rules/styles';
import { DEFAULT_FOLDERS, STALE_TIMES } from '../lib/constants';

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
  // Draf dari "Buat aturan dari pesan ini" → "Opsi lanjutan…" (router state).
  const location = useLocation();
  const navigate = useNavigate();
  const draftRule = location.state?.draftRule;
  useEffect(() => {
    if (!draftRule || rules === null) return;
    setEditing(draftRule);
    navigate(location.pathname, { replace: true, state: null });
  }, [draftRule, rules, navigate, location.pathname]);
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
          title={editing.name && !list.some((r) => r.key === editing.key) ? 'Aturan baru' : undefined}
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
