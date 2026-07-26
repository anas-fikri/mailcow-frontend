import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Settings, Lock, FileSignature, Plane, Eye, EyeOff,
  Loader2, CheckCircle2, AlertCircle, ChevronRight,
  Sparkles, Copy, Globe,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { changePassword, fetchPreferences, savePreferences } from '../lib/api';
import HtmlEditor from '../components/HtmlEditor';
import Skeleton from '../components/Skeleton';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children, loading }) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="p-5 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-10 w-1/2" />
        </div>
      </div>
    );
  }
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

// ─── Password Generator (OWASP compliant) ─────────────────────────────────────
function generatePassword(length = 16) {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const digits  = '0123456789';
  const special = '!@#$%^&*_+-=';
  const all     = upper + lower + digits + special;
  const array   = new Uint32Array(length);
  crypto.getRandomValues(array);

  // Guarantee at least one of each type
  let pw  = upper[array[0] % upper.length];
      pw += lower[array[1] % lower.length];
      pw += digits[array[2] % digits.length];
      pw += special[array[3] % special.length];

  for (let i = 4; i < length; i++) pw += all[array[i] % all.length];

  // Fisher-Yates shuffle
  const arr = pw.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = array[i + 4] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

function getPasswordStrength(pw) {
  let score = 15;
  if (pw.length >= 12) score += 20;
  if (pw.length >= 16) score += 10;
  if (/[a-z]/.test(pw)) score += 10;
  if (/[A-Z]/.test(pw)) score += 15;
  if (/[0-9]/.test(pw)) score += 15;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 15;
  return Math.min(score, 100);
}

function PasswordStrengthBar({ password }) {
  if (!password) return null;
  const score = getPasswordStrength(password);
  const color = score < 40 ? 'bg-red-500'
    : score < 65 ? 'bg-orange-500'
    : score < 85 ? 'bg-yellow-500'
    : 'bg-green-500';
  const label = score < 40 ? 'Lemah'
    : score < 65 ? 'Sedang'
    : score < 85 ? 'Kuat'
    : 'Sangat Kuat';

  return (
    <div className="space-y-1">
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-300`} style={{ width: `${score}%` }} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label} ({score}/100)</span>
        {password.length < 12 && <span className="text-destructive">Min 12 karakter</span>}
      </div>
    </div>
  );
}

// ─── Change Password ──────────────────────────────────────────────────────────
function ChangePasswordSection() {
  const { user, smtpCreds, setSmtpCreds } = useAuthStore();
  const [form, setForm]   = useState({ old: '', new: '', confirm: '' });
  const [showPw, setShowPw] = useState({ old: false, new: false, confirm: false });
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => changePassword(user.sogoToken, form.old, form.new),
    onSuccess: () => {
      setStatus({ type: 'success', message: 'Password berhasil diubah.' });
      if (smtpCreds) setSmtpCreds({ ...smtpCreds, pass: form.new });
      setForm({ old: '', new: '', confirm: '' });
    },
    onError: (err) => setStatus({ type: 'error', message: err.message }),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    if (form.new.length < 12) { setStatus({ type: 'error', message: 'Password baru minimal 12 karakter (rekomendasi OWASP).' }); return; }
    if (form.new !== form.confirm) { setStatus({ type: 'error', message: 'Konfirmasi password tidak cocok.' }); return; }
    mutation.mutate();
  }

  function handleGenerate() {
    const pw = generatePassword(16);
    setForm(p => ({ ...p, new: pw, confirm: pw }));
    setCopied(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(form.new).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const MIN_LABEL = 12;

  return (
    <Section icon={Lock} title="Ganti Password">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <StatusMsg status={status} />

        {[{ key: 'old', label: 'Password Saat Ini', showKey: 'old' }].map(f => (
          <div key={f.key} className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{f.label}</label>
            <div className="relative">
              <input
                type={showPw[f.showKey] ? 'text' : 'password'}
                required
                value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full bg-muted border-none rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <button type="button" onClick={() => setShowPw(p => ({ ...p, [f.showKey]: !p[f.showKey] }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw[f.showKey] ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        ))}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Password Baru</label>
          <div className="relative">
            <input
              type={showPw.new ? 'text' : 'password'}
              required
              minLength={MIN_LABEL}
              value={form.new}
              onChange={e => setForm(p => ({ ...p, new: e.target.value, confirm: '' }))}
              className="w-full bg-muted border-none rounded-lg px-3 py-2 pr-20 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              placeholder={form.new ? '' : `Min ${MIN_LABEL} karakter, huruf + angka + simbol`}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button type="button" onClick={handleGenerate} title="Generate password aman"
                className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                <Sparkles size={15} />
              </button>
              <button type="button" onClick={showPw.new ? undefined : () => setShowPw(p => ({ ...p, new: !p.new }))}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                {showPw.new ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          {form.new && (
            <div className="flex items-center gap-2">
              <PasswordStrengthBar password={form.new} />
              <button type="button" onClick={handleCopy} title="Salin password"
                className="shrink-0 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Konfirmasi Password Baru</label>
          <div className="relative">
            <input
              type={showPw.confirm ? 'text' : 'password'}
              required
              value={form.confirm}
              onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
              className={`w-full bg-muted border-none rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-primary focus:outline-none ${
                form.confirm && form.new !== form.confirm ? 'ring-2 ring-destructive/50' : ''
              }`}
            />
            <button type="button" onClick={() => setShowPw(p => ({ ...p, confirm: !p.confirm }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPw.confirm ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {form.confirm && form.new !== form.confirm && (
            <p className="text-xs text-destructive">Password tidak cocok</p>
          )}
        </div>

        <button
          type="submit"
          disabled={mutation.isPending || (form.confirm && form.new !== form.confirm)}
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
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [sig, setSig]       = useState('');
  const [status, setStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const initRef = useRef(false); // Hindari overwrite user edits oleh prefs

  /* Load existing signature dari SOGo (hanya init sekali) */
  const { data: prefs, isLoading: loadingPrefs } = useQuery({
    queryKey: ['preferences', user?.sogoToken],
    queryFn: () => fetchPreferences(user?.sogoToken, user?.email),
    enabled: !!(user?.sogoToken && user?.email),
    staleTime: 0,
  });

  useEffect(() => {
    if (prefs?.defaults && !initRef.current) {
      const saved = prefs.defaults.SOGoMailSignature || '';
      setSig(saved);
      setLoaded(true);
      initRef.current = true;
    } else if (!loadingPrefs && !prefs) {
      setLoaded(true);
    }
  }, [prefs, loadingPrefs]);

  const mutation = useMutation({
    mutationFn: () => {
      const updatedPrefs = {
        defaults: {
          ...(prefs?.defaults || {}),
          SOGoMailSignature: sig,
          SOGoMailSignatureEnabled: sig && sig.trim() ? '1' : '0',
        },
        settings: prefs?.settings || {},
      };
      return savePreferences(user.sogoToken, updatedPrefs, user.email);
    },
    onSuccess: () => {
      initRef.current = false; // allow re-init on next refetch
      queryClient.invalidateQueries({ queryKey: ['preferences'] });
      setStatus({ type: 'success', message: 'Signature berhasil disimpan.' });
    },
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
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [enabled, setEnabled] = useState(false);
  const [subject, setSubject] = useState('Saya sedang tidak di tempat');
  const [message, setMessage] = useState('Terima kasih atas email Anda.\n\nSaya sedang dalam masa cuti dan akan membalas email Anda sesegera mungkin.\n\nSalam.');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [status, setStatus]       = useState(null);
  const [loaded, setLoaded]       = useState(false);
  const initRef = useRef(false);

  const [debugVal, setDebugVal] = useState('…');

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['preferences', user?.sogoToken],
    queryFn: () => fetchPreferences(user?.sogoToken, user?.email),
    enabled: !!(user?.sogoToken && user?.email),
    staleTime: 0,
  });

  useEffect(() => {
    if (prefs?.defaults && !initRef.current) {
      const v = prefs.defaults.Vacation || {};
      setDebugVal(String(v.enabled ?? 'null'));
      setEnabled(String(v.enabled) === '1' || v.enabled === true);
      if (v.subject) setSubject(v.subject);
      if (v.text) setMessage(v.text);
      if (v.startDate) {
        const d = new Date(parseInt(v.startDate, 10) * 1000);
        if (!isNaN(d.getTime())) setStartDate(d.toISOString().split('T')[0]);
      }
      if (v.endDate) {
        const d = new Date(parseInt(v.endDate, 10) * 1000);
        if (!isNaN(d.getTime())) setEndDate(d.toISOString().split('T')[0]);
      }
      setLoaded(true);
      initRef.current = true;
    } else if (!isLoading && !prefs) {
      setLoaded(true);
    }
  }, [prefs, isLoading]);

  const mutation = useMutation({
    mutationFn: () => {
      const startEpoch = startDate ? String(Math.floor(new Date(startDate).getTime() / 1000)) : undefined;
      const endEpoch = endDate ? String(Math.floor(new Date(endDate).getTime() / 1000) + 86399) : undefined;
      
      const updatedPrefs = {
        defaults: {
          ...(prefs?.defaults || {}),
          Vacation: {
            ...(prefs?.defaults?.Vacation || {}),
            autoReplyEmailAddresses: prefs?.defaults?.Vacation?.autoReplyEmailAddresses || [user.email],
            ignoreLists: prefs?.defaults?.Vacation?.ignoreLists || "0",
            enabled:  enabled ? '1' : '0',
            subject,
            text:     message,
            startDate: startEpoch || '',
            endDate:   endEpoch || '',
          },
        },
        settings: prefs?.settings || {},
      };
      
      if (!updatedPrefs.defaults.Vacation.startDate) delete updatedPrefs.defaults.Vacation.startDate;
      if (!updatedPrefs.defaults.Vacation.endDate) delete updatedPrefs.defaults.Vacation.endDate;
      
      // SOGo might expect startDateEnabled
      if (startEpoch) {
        updatedPrefs.defaults.Vacation.startDateEnabled = 1;
      } else {
        delete updatedPrefs.defaults.Vacation.startDateEnabled;
      }

      return savePreferences(user.sogoToken, updatedPrefs, user.email);
    },
    onSuccess: () => {
      initRef.current = false; // allow re-init on next refetch
      queryClient.invalidateQueries({ queryKey: ['preferences'] });
      setStatus({ type: 'success', message: `Auto-reply ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.` });
    },
    onError: (err) => setStatus({ type: 'error', message: err.message }),
  });

  if (!loaded && isLoading) {
    return (
      <Section icon={Plane} title="Auto-Reply Liburan">
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </Section>
    );
  }

  return (
    <Section icon={Plane} title={
      <div className="flex items-center gap-2">
        Auto-Reply Cuti 
        <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">[{debugVal}]</span>
      </div>
    }>
      <div className="space-y-4 max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Balas otomatis untuk email masuk ketika kamu sedang cuti atau tidak di tempat.
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

// ─── Display Preferences ─────────────────────────────────────────────────────
function DisplaySection() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [language, setLanguage] = useState('Indonesian');
  const [dateFormat, setDateFormat] = useState('%d/%m/%Y');
  const [weekStart, setWeekStart] = useState('0');
  const [status, setStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const initRef = useRef(false);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['preferences', user?.sogoToken],
    queryFn: () => fetchPreferences(user?.sogoToken, user?.email),
    enabled: !!(user?.sogoToken && user?.email),
    staleTime: 0,
  });

  useEffect(() => {
    if (prefs?.defaults && !initRef.current) {
      setTimezone(prefs.defaults.SOGoTimeZone || 'Asia/Jakarta');
      setLanguage(prefs.defaults.SOGoLanguage || 'Indonesian');
      setDateFormat(prefs.defaults.SOGoDateFormat || '%d/%m/%Y');
      setWeekStart(String(prefs.defaults.SOGoFirstDayOfWeek ?? '0'));
      setLoaded(true);
      initRef.current = true;
    } else if (!isLoading && !prefs) {
      setLoaded(true);
    }
  }, [prefs, isLoading]);

  const mutation = useMutation({
    mutationFn: () => {
      const updatedPrefs = {
        defaults: {
          ...(prefs?.defaults || {}),
          SOGoTimeZone: timezone,
          SOGoLanguage: language,
          SOGoDateFormat: dateFormat,
          SOGoFirstDayOfWeek: parseInt(weekStart, 10),
        },
        settings: prefs?.settings || {},
      };
      return savePreferences(user.sogoToken, updatedPrefs, user.email);
    },
    onSuccess: () => {
      initRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['preferences'] });
      setStatus({ type: 'success', message: 'Preferensi tampilan disimpan.' });
    },
    onError: (err) => setStatus({ type: 'error', message: err.message }),
  });

  if (!loaded && isLoading) {
    return (
      <Section icon={Globe} title="Tampilan">
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </Section>
    );
  }

  return (
    <Section icon={Globe} title="Tampilan & Regional">
      <div className="space-y-4 max-w-sm">
        <p className="text-sm text-muted-foreground">
          Preferensi ini disimpan di server dan digunakan oleh webmail serta SOGo.
        </p>
        <StatusMsg status={status} />

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Bahasa</label>
          <select value={language} onChange={e => setLanguage(e.target.value)}
            className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
            <option value="Indonesian">Indonesia</option>
            <option value="English">English</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Zona Waktu</label>
          <select value={timezone} onChange={e => setTimezone(e.target.value)}
            className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
            <option value="Asia/Jakarta">Asia/Jakarta (WIB, UTC+7)</option>
            <option value="Asia/Makassar">Asia/Makassar (WITA, UTC+8)</option>
            <option value="Asia/Jayapura">Asia/Jayapura (WIT, UTC+9)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Format Tanggal</label>
          <select value={dateFormat} onChange={e => setDateFormat(e.target.value)}
            className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
            <option value="%d/%m/%Y">31/12/2026</option>
            <option value="%m/%d/%Y">12/31/2026</option>
            <option value="%Y-%m-%d">2026-12-31</option>
            <option value="%d %b %Y">31 Des 2026</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Awal Minggu</label>
          <select value={weekStart} onChange={e => setWeekStart(e.target.value)}
            className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
            <option value="0">Minggu</option>
            <option value="1">Senin</option>
          </select>
        </div>

        <button onClick={() => { setStatus(null); mutation.mutate(); }}
          disabled={mutation.isPending}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
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
    { id: 'display',  label: 'Tampilan',            icon: Globe },
    { id: 'password', label: 'Password',            icon: Lock },
    { id: 'signature', label: 'Signature',          icon: FileSignature },
    { id: 'vacation', label: 'Auto-Reply Cuti',      icon: Plane },
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
          {activeTab === 'display'   && <DisplaySection />}
          {activeTab === 'password'  && <ChangePasswordSection />}
          {activeTab === 'signature' && <SignatureSection />}
          {activeTab === 'vacation'  && <VacationSection />}
        </div>
      </div>
    </div>
  );
}
