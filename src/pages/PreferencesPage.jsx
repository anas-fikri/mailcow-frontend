import React, { useState, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Settings, Lock, FileSignature, Plane, Eye, EyeOff,
  Loader2, CheckCircle2, AlertCircle, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { changePassword, fetchPreferences, savePreferences } from '../lib/api';
import HtmlEditor from '../components/HtmlEditor';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon size={16} className="text-primary" />
        </div>
        <h2 className="font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatusMsg({ status }) {
  if (!status) return null;
  const isOk = status.type === 'success';
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
      isOk ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'
    }`}>
      {isOk ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      {status.message}
    </div>
  );
}

// ─── Change Password ──────────────────────────────────────────────────────────
function ChangePasswordSection() {
  const { user, smtpCreds, setSmtpCreds } = useAuthStore();
  const [form, setForm]   = useState({ old: '', new: '', confirm: '' });
  const [showPw, setShowPw] = useState({ old: false, new: false });
  const [status, setStatus] = useState(null);

  const mutation = useMutation({
    mutationFn: () => changePassword(user.sogoToken, form.old, form.new),
    onSuccess: () => {
      setStatus({ type: 'success', message: 'Password berhasil diubah.' });
      // Update smtpCreds di memory
      if (smtpCreds) setSmtpCreds({ ...smtpCreds, pass: form.new });
      setForm({ old: '', new: '', confirm: '' });
    },
    onError: (err) => setStatus({ type: 'error', message: err.message }),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    if (form.new.length < 8) { setStatus({ type: 'error', message: 'Password baru minimal 8 karakter.' }); return; }
    if (form.new !== form.confirm) { setStatus({ type: 'error', message: 'Konfirmasi password tidak cocok.' }); return; }
    mutation.mutate();
  }

  return (
    <Section icon={Lock} title="Ganti Password">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <StatusMsg status={status} />
        {[
          { key: 'old', label: 'Password Saat Ini', show: showPw.old, toggle: () => setShowPw(p => ({ ...p, old: !p.old })) },
          { key: 'new', label: 'Password Baru', show: showPw.new, toggle: () => setShowPw(p => ({ ...p, new: !p.new })) },
          { key: 'confirm', label: 'Konfirmasi Password Baru', show: showPw.new },
        ].map(f => (
          <div key={f.key} className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{f.label}</label>
            <div className="relative">
              <input
                type={(f.show) ? 'text' : 'password'}
                required
                value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full bg-muted border-none rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
              {f.toggle && (
                <button type="button" onClick={f.toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {f.show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
        >
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
          Ubah Password
        </button>
      </form>
    </Section>
  );
}

// ─── Signature ────────────────────────────────────────────────────────────────
function SignatureSection() {
  const { user } = useAuthStore();
  const [sig, setSig]       = useState('');
  const [status, setStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const initRef = useRef(false); // Hindari overwrite user edits oleh prefs

  /* Load existing signature dari SOGo (hanya init sekali) */
  const { isLoading: loadingPrefs } = useQuery({
    queryKey: ['preferences', user?.sogoToken],
    queryFn: () => fetchPreferences(user?.sogoToken),
    enabled: !!user?.sogoToken,
    staleTime: 5 * 60_000,
    onSuccess: (data) => {
      if (initRef.current) return; // User sudah edit, jangan overwrite
      const saved = data?.defaults?.SOGoMailSignature || '';
      setSig(saved);
      setLoaded(true);
    },
    onError: () => { setLoaded(true); },
  });

  const mutation = useMutation({
    mutationFn: () => savePreferences(user.sogoToken, {
      defaults: {
        SOGoMailSignature: sig,
        SOGoMailSignatureEnabled: sig && sig.trim() ? '1' : '0',
      },
      settings: {},
    }),
    onSuccess: () => setStatus({ type: 'success', message: 'Signature berhasil disimpan.' }),
    onError: (err) => setStatus({ type: 'error', message: err.message }),
  });

  if (!loaded && loadingPrefs) {
    return (
      <Section icon={FileSignature} title="Signature Email">
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </Section>
    );
  }

  return (
    <Section icon={FileSignature} title="Signature Email">
      <div className="space-y-4 max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Tanda tangan HTML yang otomatis ditambahkan di bawah email yang kamu kirim.
          Bisa pakai <strong>tebal</strong>, <em>miring</em>, tautan, dan gambar.
        </p>
        <StatusMsg status={status} />
        <HtmlEditor
          value={sig}
          onChange={v => { initRef.current = true; setSig(v); }}
          minHeight={150}
          placeholder="Tulis signature di sini..."
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setStatus(null); mutation.mutate(); }}
            disabled={mutation.isPending}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />}
            Simpan Signature
          </button>
          {sig && (
            <span className="text-xs text-muted-foreground">
              {(sig.length / 1024).toFixed(1)} KB — {sig.includes('<img') ? 'ada gambar' : 'teks saja'}
            </span>
          )}
        </div>
      </div>
    </Section>
  );
}

// ─── Vacation Auto-Reply ──────────────────────────────────────────────────────
function VacationSection() {
  const { user } = useAuthStore();
  const [enabled, setEnabled] = useState(false);
  const [subject, setSubject] = useState('Saya sedang tidak di tempat');
  const [message, setMessage] = useState('Terima kasih atas email Anda.\n\nSaya sedang dalam masa cuti dan akan membalas email Anda sesegera mungkin.\n\nSalam.');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [status, setStatus]       = useState(null);

  const mutation = useMutation({
    mutationFn: () => savePreferences(user.sogoToken, {
      defaults: {
        Vacation: {
          enabled:  enabled ? '1' : '0',
          subject,
          text:     message,
          startDate: startDate || undefined,
          endDate:   endDate   || undefined,
        },
      },
      settings: {},
    }),
    onSuccess: () => setStatus({ type: 'success', message: `Auto-reply ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.` }),
    onError: (err) => setStatus({ type: 'error', message: err.message }),
  });

  return (
    <Section icon={Plane} title="Auto-Reply Liburan">
      <div className="space-y-4 max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Balas otomatis untuk email masuk ketika kamu sedang tidak di tempat.
        </p>
        <StatusMsg status={status} />

        {/* Toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setEnabled(p => !p)}
            className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-sm font-medium text-foreground">
            {enabled ? 'Auto-reply aktif' : 'Auto-reply nonaktif'}
          </span>
        </label>

        {enabled && (
          <div className="space-y-4 pt-2">
            {/* Tanggal */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Mulai</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Selesai</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Subjek</label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Pesan</label>
              <textarea rows={5} value={message} onChange={e => setMessage(e.target.value)}
                className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none resize-y" />
            </div>
          </div>
        )}

        <button
          onClick={() => { setStatus(null); mutation.mutate(); }}
          disabled={mutation.isPending}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
        >
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plane size={14} />}
          Simpan Pengaturan
        </button>
      </div>
    </Section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PreferencesPage() {
  const { user } = useAuthStore();
  const tabs = [
    { id: 'password', label: 'Password',    icon: Lock },
    { id: 'signature', label: 'Signature',  icon: FileSignature },
    { id: 'vacation', label: 'Auto-Reply',  icon: Plane },
  ];
  const [activeTab, setActiveTab] = useState('password');

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar tabs */}
      <div className="w-52 shrink-0 border-r border-border bg-card flex flex-col hidden sm:flex">
        <div className="px-4 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Settings size={18} className="text-primary" />
            <span className="font-semibold text-foreground">Pengaturan</span>
          </div>
          {user?.email && (
            <div className="text-xs text-muted-foreground mt-2 truncate">{user.email}</div>
          )}
        </div>
        <nav className="p-3 space-y-1">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all ${
                  activeTab === t.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={16} />
                  {t.label}
                </div>
                {activeTab === t.id && <ChevronRight size={14} />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile tab bar */}
      <div className="sm:hidden border-b border-border bg-card flex">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs transition-colors ${
                activeTab === t.id ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {activeTab === 'password'  && <ChangePasswordSection />}
          {activeTab === 'signature' && <SignatureSection />}
          {activeTab === 'vacation'  && <VacationSection />}
        </div>
      </div>
    </div>
  );
}
