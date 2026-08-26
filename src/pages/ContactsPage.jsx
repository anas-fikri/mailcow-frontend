import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Search, Plus, Trash2, Mail, Phone, Building2,
  Loader2, X, Globe, User, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fetchContacts, createContact, deleteContact } from '../lib/api';
import { findDuplicateKind } from '../lib/contactUtils';
import { bumpDomainVersion, watchDomainVersion } from '../lib/crossTab';
import { toast } from '../lib/toast';
import { ContactsListSkeleton } from '../components/Skeleton';
import Avatar from '../components/Avatar';

// ─── Add Contact Modal ────────────────────────────────────────────────────────
function AddContactModal({ onClose, onSave, isLoading, error }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ c_cn: form.name.trim(), c_mail: form.email.trim(), c_telephonenumber: form.phone.trim() });
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold">Tambah Kontak Baru</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>}
          {[
            { key: 'name', label: 'Nama Lengkap', type: 'text', required: true, placeholder: 'John Doe' },
            { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'john@domain.com' },
            { key: 'phone', label: 'No. Telepon', type: 'tel', required: false, placeholder: '+62...' },
          ].map(f => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">{f.label} {f.required && <span className="text-destructive">*</span>}</label>
              <input
                type={f.type} required={f.required} placeholder={f.placeholder}
                value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-muted hover:bg-muted/80 text-foreground py-2 rounded-lg text-sm font-medium">Batal</button>
            <button type="submit" disabled={isLoading} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Contact Detail Panel ─────────────────────────────────────────────────────
function ContactDetail({ contact, onClose, onDelete, isDeleting }) {
  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-sm text-muted-foreground">Detail Kontak</h2>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center gap-3 mb-6">
          <Avatar name={contact.name} email={contact.email} size="lg" />
          <div className="text-center">
            <div className="font-semibold text-foreground text-lg">{contact.name || contact.email}</div>
            {contact.isGAL && (
              <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full mt-1 inline-block">
                GAL — {contact.source}
              </span>
            )}
          </div>
        </div>
        <div className="space-y-3">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors group">
              <Mail size={16} className="text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Email</div>
                <div className="text-sm text-foreground truncate group-hover:text-primary">{contact.email}</div>
              </div>
            </a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
              <Phone size={16} className="text-primary shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Telepon</div>
                <div className="text-sm text-foreground">{contact.phone}</div>
              </div>
            </a>
          )}
          {contact.org && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <Building2 size={16} className="text-muted-foreground shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Organisasi</div>
                <div className="text-sm text-foreground">{contact.org}</div>
              </div>
            </div>
          )}
        </div>
      </div>
      {!contact.isGAL && contact.uid && (
        <div className="p-4 border-t border-border">
          <button
            onClick={() => onDelete(contact.uid, contact.name)}
            disabled={isDeleting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-destructive hover:bg-destructive/10 rounded-lg text-sm font-medium transition-colors"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Hapus Kontak
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState('all'); // all | gal | personal
  const [showModal, setShowModal] = useState(false);
  const [modalError, setModalError] = useState('');
  const [selected, setSelected]   = useState(null);

  const { data: contacts = [], isLoading, error: contactsError } = useQuery({
    queryKey: ['contacts', user?.sogoToken],
    queryFn: () => fetchContacts(user?.sogoToken),
    enabled: !!user?.sogoToken,
    staleTime: 5 * 60_000,
  });

  // Multi-tab: selain invalidate lokal, bump versi domain 'contacts' agar tab
  // lain (mendengar event 'storage') ikut invalidate → refetch. Tanpa ini tab
  // B menampilkan daftar kontak basi sampai staleTime 5 menit.
  React.useEffect(() => {
    if (!user?.email) return;
    return watchDomainVersion('contacts', user?.email, () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', user?.sogoToken] });
    });
  }, [user?.email, user?.sogoToken, queryClient]);

  const createMutation = useMutation({
    mutationFn: (data) => createContact(user.sogoToken, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', user?.sogoToken] });
      bumpDomainVersion('contacts', user?.email);
      setShowModal(false);
      setModalError('');
    },
    onError: (err) => setModalError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteContact(user.sogoToken, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', user?.sogoToken] });
      bumpDomainVersion('contacts', user?.email);
      setSelected(null);
    },
    onError: (err) => toast.error(err.message || 'Gagal menghapus kontak.'),
  });

  function handleDelete(id, name) {
    if (window.confirm(`Hapus kontak "${name}"?`)) deleteMutation.mutate(id);
  }

  // Cegah duplikat kontak pribadi: email yang sudah ada di kontak personal
  // diblokir dengan pesan jelas. Duplikat di GAL TIDAK diblokir — GAL adalah
  // direktori read-only dan user sah menambah salinan personal dari kolega.
  function handleAddContact(data) {
    if (findDuplicateKind(contacts, data.c_mail) === 'personal') {
      setModalError('Kontak dengan email ini sudah ada di kontak pribadi.');
      return;
    }
    setModalError('');
    createMutation.mutate(data);
  }

  // Filter + search
  const filtered = useMemo(() => {
    let list = contacts;
    if (filter === 'gal')      list = list.filter(c => c.isGAL);
    if (filter === 'personal') list = list.filter(c => !c.isGAL);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        [c.name, c.email, c.phone, c.org].filter(Boolean).join(' ').toLowerCase().includes(q)
      );
    }
    return list;
  }, [contacts, filter, search]);

  const galCount      = contacts.filter(c => c.isGAL).length;
  const personalCount = contacts.filter(c => !c.isGAL).length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border bg-card flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-primary" />
            <h1 className="text-lg font-semibold">Kontak</h1>
            {!isLoading && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{contacts.length}</span>}
          </div>
          <button
            onClick={() => { setShowModal(true); setModalError(''); }}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Tambah
          </button>
        </div>

        {/* Search + Filter */}
        <div className="px-4 py-3 border-b border-border bg-card flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <input
              type="text"
              placeholder="Cari nama, email, telepon..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-muted border-none rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {[
              { id: 'all',      label: `Semua (${contacts.length})` },
              { id: 'gal',      label: `GAL (${galCount})` },
              { id: 'personal', label: `Personal (${personalCount})` },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  filter === f.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <ContactsListSkeleton count={8} />
          ) : contactsError ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-destructive text-sm">
              <AlertCircle size={24} />
              <span>{contactsError?.message || 'Gagal memuat kontak.'}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <Users size={40} className="opacity-20" />
              <p className="text-sm">{search ? 'Tidak ada hasil.' : 'Belum ada kontak.'}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((contact, idx) => {
                // Highlight seleksi: uid bisa kosong untuk entri GAL/rusak —
                // kalau kosong, bandingkan identitas objek (jangan match semua
                // baris kosong-uid sekaligus).
                const isSelectedRow = !!selected && (
                  contact.uid ? contact.uid === selected.uid : contact === selected
                );
                return (
                <button
                  key={contact.uid || idx}
                  onClick={() => setSelected(contact)}
                  className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left ${
                    isSelectedRow ? 'bg-muted' : ''
                  }`}
                >
                  <Avatar name={contact.name} email={contact.email} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {contact.name || contact.email}
                      </span>
                      {contact.isGAL && (
                        <span className="shrink-0 text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded-full">GAL</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{contact.email}</div>
                  </div>
                  {contact.phone && (
                    <div className="shrink-0 text-xs text-muted-foreground hidden sm:block">{contact.phone}</div>
                  )}
                </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel (desktop) ───────────────────────────────────────── */}
      {selected && (
        <div className="w-80 shrink-0 hidden md:block">
          <ContactDetail
            contact={selected}
            onClose={() => setSelected(null)}
            onDelete={handleDelete}
            isDeleting={deleteMutation.isPending}
          />
        </div>
      )}

      {/* ── Detail sheet (mobile) — tanpa ini, tap kontak di HP tidak
            menampilkan apa-apa (panel hidden md:block) ────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-card shadow-2xl">
            <ContactDetail
              contact={selected}
              onClose={() => setSelected(null)}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending}
            />
          </div>
        </div>
      )}

      {/* ── Add modal ──────────────────────────────────────────────────────── */}
      {showModal && (
        <AddContactModal
          onClose={() => { setShowModal(false); setModalError(''); }}
          onSave={handleAddContact}
          isLoading={createMutation.isPending}
          error={modalError}
        />
      )}
    </div>
  );
}
