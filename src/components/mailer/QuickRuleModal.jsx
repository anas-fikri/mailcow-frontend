import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Filter, X, Loader2 } from 'lucide-react';
import { fetchSieveFilters, saveSieveFilters } from '../../lib/api';
import { emptyRule, emptyCondition, toSogoFilter, validateRule, describeRule, folderIdToPath } from '../../lib/sieveFilters';
import { toast } from '../../lib/toast';

/**
 * QuickRuleModal — buat ATURAN SERVER (Sieve) dari baris email dalam 1 langkah.
 * Kondisi: Dari mengandung <alamat pengirim> (+ opsional "dikirim ke saya"
 * = Kepada atau Cc mengandung alamat akun). Aturan ditambahkan di urutan
 * terakhir daftar server → berlaku di webmail, Outlook, dan HP.
 *
 * Props:
 *  - isOpen, onClose
 *  - sender     : label pengirim (mis. "Budi <budi@x.com>")
 *  - folders    : daftar folder (flattenMailboxes) utk dropdown tujuan
 *  - userEmail  : email akun aktif
 *  - sogoToken  : token sesi SOGo (simpan ke Preferences/save)
 */
export default function QuickRuleModal({ isOpen, onClose, sender, folders = [], userEmail, sogoToken }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [toMe, setToMe] = useState(false);
  const [markRead, setMarkRead] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const options = folders
    .map((f) => ({ ...f, path: f.path || folderIdToPath(f.id) }))
    .filter((f) => f.path && !/^folder(INBOX|Drafts|Sent)$/i.test(f.id));

  // Reset tiap buka — default: nama dari pengirim, tujuan = folder Archive (bila ada)
  useEffect(() => {
    if (!isOpen) return;
    const email = extractEmail(sender) || sender || '';
    setName(email ? `Dari ${email}` : 'Aturan baru');
    const archive = options.find((f) => /(^|\/)archive$/i.test(f.path || ''));
    setTarget(archive?.path || '');
    setToMe(false);
    setMarkRead(false);
    setError('');
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sender, folders]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const email = extractEmail(sender);
  const rule = emptyRule({
    name: name.trim(),
    conditions: [
      { ...emptyCondition('from'), value: email },
      ...(toMe && userEmail ? [{ ...emptyCondition('to_or_cc'), value: userEmail }] : []),
    ],
    actions: [
      { type: 'fileinto', argument: target },
      ...(markRead ? [{ type: 'mark_seen', argument: '' }] : []),
    ],
    stop: true,
  });
  const label = (p) => options.find((f) => f.path === p)?.label || p;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email) { setError('Pengirim tidak dikenal — buat aturan dari halaman Aturan.'); return; }
    const errs = validateRule(rule);
    if (errs.length) { setError(errs[0]); return; }
    if (!userEmail || !sogoToken) { setError('Sesi tidak tersedia — silakan muat ulang halaman.'); return; }
    setSaving(true);
    setError('');
    try {
      // Ambil daftar segar dari server lalu tambahkan di akhir (prioritas terendah).
      const current = await fetchSieveFilters(sogoToken, userEmail);
      const next = [...current, toSogoFilter(rule)];
      await saveSieveFilters(sogoToken, userEmail, next);
      queryClient.setQueryData(['sieveFilters', sogoToken], next);
      queryClient.invalidateQueries({ queryKey: ['preferences', sogoToken] });
      toast.success('Aturan dibuat di server — berlaku juga di Outlook dan HP.');
      onClose();
    } catch (err) {
      setError(err?.message || 'Gagal menyimpan aturan.');
    } finally {
      setSaving(false);
    }
  }

  const fieldCls = 'w-full h-11 sm:h-9 bg-muted border border-border rounded-md px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-primary/20';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="quick-rule-title" className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-md z-10 max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-primary" />
            <h3 id="quick-rule-title" className="text-base font-semibold text-foreground">Buat Aturan</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="w-11 h-11 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Aturan disimpan di server — berlaku di webmail, Outlook, dan HP, walau browser ditutup.
          </p>

          <div>
            <span className="block text-xs font-medium text-muted-foreground mb-1.5">Dari (pengirim)</span>
            <div className="bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground truncate">{email || sender}</div>
          </div>

          <label className="flex items-center gap-2 min-h-11 sm:min-h-8 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={toMe} onChange={(e) => setToMe(e.target.checked)} className="w-4 h-4 accent-primary" />
            Hanya jika dikirim ke saya (Kepada atau Cc)
          </label>

          <div>
            <label htmlFor="quick-rule-name" className="block text-xs font-medium text-muted-foreground mb-1.5">Nama aturan</label>
            <input id="quick-rule-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} maxLength={120} />
          </div>

          <div>
            <label htmlFor="quick-rule-folder" className="block text-xs font-medium text-muted-foreground mb-1.5">Pindahkan ke</label>
            <select id="quick-rule-folder" value={target} onChange={(e) => setTarget(e.target.value)} className={fieldCls}>
              <option value="">— Pilih folder —</option>
              {options.map((f) => (
                <option key={f.path} value={f.path}>{' '.repeat((f.depth || 0) * 2)}{f.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 min-h-11 sm:min-h-8 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={markRead} onChange={(e) => setMarkRead(e.target.checked)} className="w-4 h-4 accent-primary" />
            Tandai sebagai dibaca
          </label>

          {email && target && (
            <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">{describeRule(rule, label)}</p>
          )}

          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Link to="/rules" onClick={onClose} className="text-xs text-primary hover:underline min-h-11 sm:min-h-0 inline-flex items-center">Opsi lanjutan…</Link>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="h-11 sm:h-9 px-4 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted">Batal</button>
              <button type="submit" disabled={saving || !email} className="inline-flex items-center gap-1.5 h-11 sm:h-9 bg-primary hover:bg-primary/90 text-primary-foreground px-4 rounded-md text-sm font-medium disabled:opacity-50 transition-colors">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Filter size={14} />}
                {saving ? 'Menyimpan...' : 'Simpan aturan'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function extractEmail(text) {
  if (!text) return '';
  const m = String(text).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : '';
}
