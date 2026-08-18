import React, { useEffect, useState } from 'react';
import { Filter, X } from 'lucide-react';
import { addRule } from '../../lib/autoArchive';
import { toast } from '../../lib/toast';

/**
 * QuickRuleModal — buat rule "pindahkan email dari pengirim ini" dalam 1 langkah.
 * Dipicu dari baris email (ikon Filter): pengirim sudah terisi otomatis,
 * user tinggal pilih folder tujuan + simpan. Rule disimpan ke store yang sama
 * dengan RulesPage (localStorage) → dieksekusi otomatis oleh MailPage.
 *
 * Props:
 *  - isOpen, onClose
 *  - sender     : label pengirim (mis. "Budi <budi@x.com>")
 *  - folders    : daftar folder (flattenMailboxes) utk dropdown tujuan
 *  - userEmail  : email akun aktif (key localStorage)
 */
export default function QuickRuleModal({ isOpen, onClose, sender, folders = [], userEmail }) {
  const [name, setName] = useState('');
  const [actionFolder, setActionFolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset tiap buka — default: nama dari pengirim, tujuan = folder Archive (bila ada)
  useEffect(() => {
    if (!isOpen) return;
    const email = extractEmail(sender) || sender || '';
    setName(email ? `Arsip dari ${email}` : 'Aturan baru');
    const archive = folders.find((f) => /(^|\/)archive$/i.test(f.path || f.name || ''));
    setActionFolder(archive?.id || folders.find((f) => f.type === 'trash')?.id || '');
    setError('');
    setSaving(false);
  }, [isOpen, sender, folders]);

  if (!isOpen) return null;

  function extractEmail(text) {
    if (!text) return '';
    const m = String(text).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return m ? m[0] : '';
  }

  function handleSubmit(e) {
    e.preventDefault();
    const email = extractEmail(sender);
    if (!email) {
      setError('Pengirim tidak dikenal — buat rule dari halaman Aturan.');
      return;
    }
    if (!actionFolder) {
      setError('Pilih folder tujuan.');
      return;
    }
    setSaving(true);
    try {
      if (!userEmail) {
        throw new Error('Email pengguna tidak tersedia — silakan muat ulang halaman.');
      }
      addRule(userEmail, {
        name: name.trim() || `Arsip dari ${email}`,
        conditions: [{ field: 'from', operator: 'contains', value: email }],
        matchType: 'all',
        actionFolder,
      });
      toast.success('Aturan dibuat — email dari pengirim ini otomatis dipindahkan.');
      onClose();
    } catch (err) {
      setError(err?.message || 'Gagal menyimpan aturan.');
    } finally {
      setSaving(false);
    }
  }

  const email = extractEmail(sender);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md z-10">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-primary" />
            <h3 className="text-base font-semibold text-foreground">Buat Aturan Otomatis</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Email dari pengirim ini akan <b>otomatis dipindahkan</b> ke folder tujuan.
          </p>

          {/* Pengirim (read-only — kondisi rule) */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Pengirim</label>
            <div className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground truncate">
              {sender}
            </div>
          </div>

          {/* Nama */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nama Aturan</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Folder tujuan */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Pindahkan ke</label>
            <select
              value={actionFolder}
              onChange={(e) => setActionFolder(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— Pilih folder —</option>
              {folders
                .filter((f) => !/^folder(INBOX|Drafts|Sent)$/i.test(f.id))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {'\u00A0'.repeat((f.depth || 0) * 2)}{f.label}
                  </option>
                ))}
            </select>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || !email}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <Filter size={14} />
              {saving ? 'Menyimpan...' : 'Simpan Aturan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
