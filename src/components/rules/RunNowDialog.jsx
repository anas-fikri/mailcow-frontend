import React, { useState, useMemo, useId } from 'react';
import { Loader2 } from 'lucide-react';
import {
  fetchMessages, fetchMessageHeaders, fetchMessageHeadersRaw, moveMessages,
  markReadBulk, markFlaggedBulk,
} from '../../lib/api';
import { toast } from '../../lib/toast';
import { claimAutoArchiveUids, releaseAutoArchiveClaims } from '../../lib/autoArchive';
import { matchesMessage, ruleNeedsHeaders, ruleUsesSize, isRunnable, planRun } from '../../lib/sieveFilters';
import { loadSnoozes } from '../../lib/snooze';
import Modal from './Modal';
import { inputCls, btnPrimary, btnGhost } from './styles';

const RUN_LIMIT = 500;       // pesan terbaru yang diperiksa "Jalankan sekarang"
const HEADER_LIMIT = 200;    // maks pesan yang header lengkapnya diunduh (Cc/header lain)

/** Pool paralel kecil (utk unduh header lengkap). */
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; try { await fn(it); } catch { /* biarkan tak-diketahui */ } }
  }));
}

/**
 * Dialog "Jalankan sekarang" — terapkan aturan ke email yang SUDAH ada
 * (hitung dulu, lalu konfirmasi). Dipakai halaman Aturan & QuickRuleModal.
 *
 * Props: scope ('all' | rule.key), rules (model UI), folders, folderLabel,
 *        user ({ sogoToken, email }), onClose, onDone,
 *        initialFolderPath (opsional, default 'INBOX').
 */
export default function RunNowDialog({ scope, rules, folders, folderLabel, user, onClose, onDone, initialFolderPath = 'INBOX' }) {
  // Satu aturan boleh dijalankan manual walau nonaktif (seperti Outlook "Run Rules Now").
  const targetRules = scope === 'all'
    ? rules.filter((r) => r.active)
    : rules.filter((r) => r.key === scope).map((r) => ({ ...r, active: true }));
  const runnable = targetRules.filter(isRunnable);
  const [folderPath, setFolderPath] = useState(initialFolderPath || 'INBOX');
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
            {!folders.some((f) => f.path === folderPath) && <option value={folderPath}>{folderLabel(folderPath)}</option>}
            {folders.map((f) => <option key={f.path} value={f.path}>{' '.repeat((f.depth || 0) * 2)}{f.label}</option>)}
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
