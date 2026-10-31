import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { fetchSieveFilters, saveSieveFilters } from '../../lib/api';
import {
  buildRuleFromMessage, quickRuleContext, quickRuleOptions, quickConditionState,
  toggleQuickCondition, toSogoFilter, folderIdToPath, isRunnable,
} from '../../lib/sieveFilters';
import { toast } from '../../lib/toast';
import RuleEditor from '../rules/RuleEditor';
import RunNowDialog from '../rules/RunNowDialog';
import Modal from '../rules/Modal';
import { btnPrimary, btnGhost } from '../rules/styles';

/**
 * QuickRuleModal — "Buat aturan dari pesan ini" (ala Outlook Create rule).
 * Pembungkus tipis RuleEditor yang SAMA dgn halaman Aturan, diisi dari pesan
 * yang diklik + kondisi cepat (Dari / Subjek / Kepada saya / Cc ke saya).
 * Aturan ditambahkan di AKHIR daftar server (prioritas terendah). Setelah
 * tersimpan → tawarkan "Jalankan sekarang" pada folder pesan itu.
 *
 * Props:
 *  - isOpen, onClose
 *  - message    : baris pesan { from, to, cc?, subject, folderId }
 *  - folders    : daftar folder (flattenMailboxes)
 *  - userEmail  : email akun aktif
 *  - sogoToken  : token sesi SOGo
 *  - onRunDone  : (opsional) dipanggil setelah "Jalankan sekarang" diterapkan
 */
export default function QuickRuleModal({ isOpen, message, ...rest }) {
  if (!isOpen || !message) return null;
  return <QuickRuleFlow message={message} {...rest} />;
}

function QuickRuleFlow({ onClose, message, folders = [], userEmail, sogoToken, onRunDone }) {
  const queryClient = useQueryClient();
  const ctx = useMemo(() => quickRuleContext(message, userEmail), [message, userEmail]);
  const quickOptions = useMemo(() => quickRuleOptions(ctx), [ctx]);
  const initial = useMemo(() => buildRuleFromMessage(message, { userEmail }), [message, userEmail]);
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState('edit'); // edit | offer | run
  const [savedRule, setSavedRule] = useState(null);

  const ruleFolders = useMemo(() => folders
    .map((f) => ({ ...f, path: f.path || folderIdToPath(f.id) }))
    .filter((f) => f.path && f.type !== 'draft'), [folders]);
  const folderLabel = useCallback((p) => ruleFolders.find((f) => f.path === p)?.label || p, [ruleFolders]);
  const sourcePath = folderIdToPath(message.folderId) || 'INBOX';

  async function handleSave(rule) {
    if (!userEmail || !sogoToken) { toast.error('Sesi tidak tersedia — silakan muat ulang halaman.'); return; }
    setSaving(true);
    try {
      // Ambil daftar segar dari server lalu tambahkan di akhir (prioritas terendah).
      const current = await fetchSieveFilters(sogoToken, userEmail);
      const next = [...current, toSogoFilter(rule)];
      await saveSieveFilters(sogoToken, userEmail, next);
      queryClient.setQueryData(['sieveFilters', sogoToken], next);
      queryClient.invalidateQueries({ queryKey: ['preferences', sogoToken] });
      toast.success('Aturan tersimpan di server');
      if (isRunnable(rule)) { setSavedRule(rule); setPhase('offer'); } else onClose();
    } catch (err) {
      toast.error(err?.message || 'Gagal menyimpan aturan.');
    } finally {
      setSaving(false);
    }
  }

  if (phase === 'offer' && savedRule) {
    return (
      <Modal title="Aturan tersimpan" onClose={onClose} size="max-w-sm"
        footer={(
          <>
            <button type="button" onClick={onClose} className={btnGhost}>Nanti saja</button>
            <button type="button" onClick={() => setPhase('run')} className={btnPrimary}>Jalankan sekarang</button>
          </>
        )}>
        <p className="text-sm text-foreground">Jalankan juga pada email lama di folder ini?</p>
        <p className="text-xs text-muted-foreground mt-1">Email baru otomatis diproses server. Email yang sudah ada di {folderLabel(sourcePath)} bisa diperiksa dulu sebelum diterapkan.</p>
      </Modal>
    );
  }

  if (phase === 'run' && savedRule) {
    return (
      <RunNowDialog scope={savedRule.key} rules={[savedRule]} folders={ruleFolders} folderLabel={folderLabel}
        user={{ sogoToken, email: userEmail }} initialFolderPath={sourcePath}
        onClose={onClose}
        onDone={() => { queryClient.invalidateQueries({ queryKey: ['messages', sogoToken] }); onRunDone?.(); }} />
    );
  }

  return (
    <RuleEditor
      initial={initial}
      title="Buat aturan dari pesan ini"
      folders={ruleFolders}
      folderLabel={folderLabel}
      saving={saving}
      onCancel={onClose}
      onSave={handleSave}
      note="Aturan baru ditempatkan paling bawah — ubah urutan di halaman Aturan."
      footerStart={(rule) => (
        <Link to="/rules" state={{ draftRule: rule }} onClick={onClose}
          className="inline-flex items-center min-h-11 sm:min-h-0 text-xs font-medium text-primary hover:underline">
          Opsi lanjutan…
        </Link>
      )}
      renderTop={quickOptions.length ? (rule, setRule) => {
        const state = quickConditionState(rule, ctx);
        return (
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-foreground">Saat email cocok dengan</legend>
            <div className="space-y-0.5">
              {quickOptions.map((o) => (
                <label key={o.id} className="flex items-center gap-2 min-h-11 sm:min-h-8 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={state[o.id]} className="w-4 h-4 shrink-0 accent-primary"
                    onChange={(e) => setRule((r) => toggleQuickCondition(r, o.id, e.target.checked, ctx))} />
                  <span className="min-w-0 break-words">{o.label}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Kondisi lain (Header, Ukuran, operator) bisa diatur di bawah.</p>
          </fieldset>
        );
      } : undefined}
    />
  );
}
