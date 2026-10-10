import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Settings, Lock, FileSignature, Plane, Eye, EyeOff,
  Loader2, CheckCircle2, AlertCircle, ChevronRight, BellRing,
  Sparkles, Copy, Globe, Palette, MessageSquare, Reply, Trash2, Plus,
  LayoutPanelLeft, MailOpen, ArrowUpDown, MessagesSquare, Rows3, Volume2,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { registerSmtpSession, changePassword, fetchPreferences, savePreferences } from '../lib/api';
import { loadSignatures, addSignature, updateSignature, removeSignature, setDefaultSignature, getSignatureById, shouldImportSogoSignature } from '../lib/signatures';
import { loadNotifyPrefs, saveNotifyPrefs } from '../lib/notifyPrefs';
import HtmlEditor from '../components/HtmlEditor';
import Skeleton from '../components/Skeleton';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Saklar aksesibel (WAI-ARIA switch): <button role="switch" aria-checked>.
 * Menggantikan pola lama <div onClick> yang tidak bisa difokus keyboard dan
 * tidak diumumkan screen reader. Space/Enter toggle bawaan <button>.
 * - `label`: teks terlihat (dirender di kanan knob, jadi satu target klik).
 * - `description`: teks bantu kecil di bawah label.
 */
function Switch({ checked, onChange, label, description, disabled = false, id, className = '' }) {
  const autoId = React.useId();
  const labelId = id || autoId;
  const descId = description ? `${labelId}-desc` : undefined;
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      {(label || description) && (
        <span className="min-w-0 flex-1">
          {label && <span id={labelId} className="block text-sm font-medium text-foreground">{label}</span>}
          {description && <span id={descId} className="block text-xs text-muted-foreground mt-0.5">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? labelId : undefined}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        // min-h-11 + padding vertikal → target sentuh 44px walau knob 24px
        className="relative shrink-0 inline-flex items-center min-h-11 px-1 -mx-1 rounded-full outline-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
      >
        <span
          aria-hidden="true"
          className={`relative block w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
        </span>
      </button>
    </div>
  );
}

/** Grup pilihan tunggal (radiogroup) ala segmented control — mendukung panah kiri/kanan. */
function ChoiceGroup({ label, value, options, onChange, columns = 3 }) {
  const groupId = React.useId();
  const onKeyDown = (e) => {
    const idx = options.findIndex((o) => o.id === value);
    if (idx < 0) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = options[(idx + 1) % options.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = options[(idx - 1 + options.length) % options.length];
    if (next) { e.preventDefault(); onChange(next.id); e.currentTarget.querySelector(`[data-id="${next.id}"]`)?.focus(); }
  };
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3' }[columns] || 'grid-cols-3';
  return (
    <div className="space-y-2">
      <div id={groupId} className="text-sm font-medium text-foreground">{label}</div>
      <div role="radiogroup" aria-labelledby={groupId} onKeyDown={onKeyDown} className={`grid ${cols} gap-2`}>
        {options.map((o) => {
          const selected = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              data-id={o.id}
              onClick={() => onChange(o.id)}
              className={`flex flex-col items-center gap-1.5 px-2 py-2.5 min-h-11 rounded-xl border text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-foreground'
              }`}
            >
              {o.picto}
              <span className="text-xs font-medium leading-tight">{o.label}</span>
              {o.desc && <span className="text-[11px] text-muted-foreground leading-tight">{o.desc}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Piktogram mini tata letak panel baca (36×24): daftar + panel. */
function PanePicto({ mode }) {
  const stroke = 'currentColor';
  return (
    <svg width="40" height="26" viewBox="0 0 40 26" aria-hidden="true" className="opacity-80">
      <rect x="0.5" y="0.5" width="39" height="25" rx="3" fill="none" stroke={stroke} strokeOpacity="0.5" />
      {mode === 'right' && (
        <>
          <rect x="3" y="4" width="13" height="2.5" rx="1" fill={stroke} />
          <rect x="3" y="9" width="13" height="2.5" rx="1" fill={stroke} opacity="0.6" />
          <rect x="3" y="14" width="13" height="2.5" rx="1" fill={stroke} opacity="0.6" />
          <rect x="3" y="19" width="13" height="2.5" rx="1" fill={stroke} opacity="0.6" />
          <line x1="19.5" y1="1" x2="19.5" y2="25" stroke={stroke} strokeOpacity="0.5" />
          <rect x="22" y="4" width="15" height="18" rx="1.5" fill={stroke} opacity="0.25" />
        </>
      )}
      {mode === 'bottom' && (
        <>
          <rect x="3" y="3" width="34" height="2.5" rx="1" fill={stroke} />
          <rect x="3" y="7.5" width="34" height="2.5" rx="1" fill={stroke} opacity="0.6" />
          <line x1="1" y1="12.5" x2="39" y2="12.5" stroke={stroke} strokeOpacity="0.5" />
          <rect x="3" y="15" width="34" height="8" rx="1.5" fill={stroke} opacity="0.25" />
        </>
      )}
      {mode === 'off' && (
        <>
          <rect x="3" y="3.5" width="34" height="2.5" rx="1" fill={stroke} />
          <rect x="3" y="8" width="34" height="2.5" rx="1" fill={stroke} opacity="0.6" />
          <rect x="3" y="12.5" width="34" height="2.5" rx="1" fill={stroke} opacity="0.6" />
          <rect x="3" y="17" width="34" height="2.5" rx="1" fill={stroke} opacity="0.6" />
          <rect x="3" y="21.5" width="34" height="2" rx="1" fill={stroke} opacity="0.4" />
        </>
      )}
    </svg>
  );
}

/** Piktogram kepadatan: Normal (3 baris tebal) vs Ringkas (5 baris tipis). */
function DensityPicto({ mode }) {
  const rows = mode === 'compact' ? [3, 7.5, 12, 16.5, 21] : [3.5, 10.5, 17.5];
  const h = mode === 'compact' ? 2.5 : 4.5;
  return (
    <svg width="40" height="26" viewBox="0 0 40 26" aria-hidden="true" className="opacity-80">
      <rect x="0.5" y="0.5" width="39" height="25" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.5" />
      {rows.map((y, i) => (
        <rect key={y} x="3" y={y} width="34" height={h} rx="1" fill="currentColor" opacity={i === 0 ? 1 : 0.55} />
      ))}
    </svg>
  );
}

// ─── Tata Letak & Baca (ala Outlook) ─────────────────────────────────────────
// Semua kontrol langsung ditulis ke store (setPref/setConversationView/
// setSortAsc) yang persist per akun — tidak ada tombol Simpan, seperti tema.
function LayoutSection() {
  const {
    readingPane, density, markReadMode, markReadDelaySec,
    conversationView, sortAsc, setPref, setConversationView, setSortAsc,
  } = useAuthStore();
  const [savedTick, setSavedTick] = useState(0);
  const flash = () => setSavedTick((t) => t + 1);
  // Tampilkan "Tersimpan otomatis" sebentar setelah perubahan — bukti visual
  // bahwa tidak perlu tombol Simpan.
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!savedTick) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1800);
    return () => clearTimeout(t);
  }, [savedTick]);

  const set = (key, value) => { setPref(key, value); flash(); };
  const delay = Math.min(60, Math.max(1, Number(markReadDelaySec) || 3));
  const markReadId = React.useId();

  return (
    <Section icon={LayoutPanelLeft} title="Tata Letak & Baca">
      <div className="space-y-6 max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Atur tampilan kotak masuk ala Outlook. Perubahan langsung diterapkan dan disimpan untuk akun ini.
          </p>
          <span
            role="status"
            aria-live="polite"
            className={`shrink-0 inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 transition-opacity ${
              showSaved ? 'opacity-100 bg-green-500/10 text-green-700 dark:text-green-400' : 'opacity-70 text-muted-foreground'
            }`}
          >
            <CheckCircle2 size={12} />
            Tersimpan otomatis
          </span>
        </div>

        <ChoiceGroup
          label="Panel baca"
          value={readingPane}
          onChange={(v) => set('readingPane', v)}
          options={[
            { id: 'right',  label: 'Kanan',     desc: 'Daftar + pesan berdampingan', picto: <PanePicto mode="right" /> },
            { id: 'bottom', label: 'Bawah',     desc: 'Pesan di bawah daftar',       picto: <PanePicto mode="bottom" /> },
            { id: 'off',    label: 'Nonaktif',  desc: 'Pesan dibuka penuh',          picto: <PanePicto mode="off" /> },
          ]}
        />

        <ChoiceGroup
          label="Kepadatan daftar"
          columns={2}
          value={density}
          onChange={(v) => set('density', v)}
          options={[
            { id: 'normal',  label: 'Normal',  desc: 'Dengan cuplikan isi', picto: <DensityPicto mode="normal" /> },
            { id: 'compact', label: 'Ringkas', desc: 'Lebih banyak baris',  picto: <DensityPicto mode="compact" /> },
          ]}
        />

        {/* Tandai dibaca */}
        <fieldset className="space-y-2">
          <legend className="flex items-center gap-2 text-sm font-medium text-foreground">
            <MailOpen size={15} className="text-primary" />
            Tandai dibaca
          </legend>
          {[
            { id: 'instant', label: 'Segera saat dibuka' },
            { id: 'delay',   label: 'Setelah beberapa detik' },
            { id: 'manual',  label: 'Manual saja (tombol / pintasan)' },
          ].map((o) => {
            const id = `${markReadId}-${o.id}`;
            // Radio + label terpisah (bukan input number di dalam <label>) —
            // satu <label> hanya boleh punya satu kontrol berlabel.
            return (
              <div key={o.id} className="flex items-center gap-3 min-h-11 px-2 -mx-2 rounded-lg hover:bg-muted/60">
                <input
                  id={id}
                  type="radio"
                  name="markReadMode"
                  value={o.id}
                  checked={markReadMode === o.id}
                  onChange={() => set('markReadMode', o.id)}
                  className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                />
                <label htmlFor={id} className="text-sm text-foreground flex-1 min-h-11 flex items-center cursor-pointer">{o.label}</label>
                {o.id === 'delay' && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      inputMode="numeric"
                      aria-label="Jeda tandai dibaca (detik)"
                      value={delay}
                      disabled={markReadMode !== 'delay'}
                      onChange={(e) => {
                        const n = Math.min(60, Math.max(1, parseInt(e.target.value, 10) || 1));
                        set('markReadDelaySec', n);
                      }}
                      className="w-16 bg-muted border-none rounded-lg px-2 py-1 text-sm text-foreground text-center focus:ring-2 focus:ring-primary focus:outline-none disabled:opacity-50 tabular-nums"
                    />
                    dtk
                  </span>
                )}
              </div>
            );
          })}
        </fieldset>

        <hr className="border-border" />

        <Switch
          checked={!!conversationView}
          onChange={(v) => { setConversationView(v); flash(); }}
          label={<span className="inline-flex items-center gap-2"><MessagesSquare size={15} className="text-primary" />Tampilan percakapan</span>}
          description="Kelompokkan balasan dengan subjek sama menjadi satu utas."
        />

        <ChoiceGroup
          label={<span className="inline-flex items-center gap-2"><ArrowUpDown size={15} className="text-primary" />Urutan</span>}
          columns={2}
          value={sortAsc ? 'asc' : 'desc'}
          onChange={(v) => { setSortAsc(v === 'asc'); flash(); }}
          options={[
            { id: 'desc', label: 'Terbaru di atas', picto: <Rows3 size={18} /> },
            { id: 'asc',  label: 'Terlama di atas', picto: <Rows3 size={18} className="rotate-180" /> },
          ]}
        />
      </div>
    </Section>
  );
}
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

  // Fisher-Yates shuffle. Indeks acak harus dari array yang sama — memakai
  // `array[i + 4]` membaca melewati ujung Uint32Array → undefined → NaN →
  // swap dengan arr[NaN] yang menghilangkan karakter dari password.
  const arr = pw.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = array[i] % (i + 1);
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
  const { user } = useAuthStore();
  const [form, setForm]   = useState({ old: '', new: '', confirm: '' });
  const [showPw, setShowPw] = useState({ old: false, new: false, confirm: false });
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => changePassword(user.sogoToken, form.old, form.new),
    onSuccess: () => {
      setStatus({ type: 'success', message: 'Password berhasil diubah.' });
      registerSmtpSession(user.email, form.new).catch(() => {});
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

// ─── Signature (pola Outlook — banyak signature per akun) ────────────────────
function SignatureSection() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const email = user?.email || '';

  const [sigList, setSigList]       = useState([]);      // [{id,name,html}]
  const [defaults, setDefaults]     = useState({ new: null, reply: null });
  const [editingId, setEditingId]   = useState(null);    // id yang sedang diedit (null = kosong/tambah)
  const [sigName, setSigName]       = useState('');
  const [sigHtml, setSigHtml]       = useState('');
  const [status, setStatus]         = useState(null);
  const [savingSogo, setSavingSogo] = useState(false);

  // Load signature SOGo yang sudah ada SEKALI — jadikan signature pertama di
  // daftar lokal bila belum pernah dibuat (migrasi mulus).
  const { data: prefs, isLoading: loadingPrefs } = useQuery({
    queryKey: ['preferences', user?.sogoToken],
    queryFn: () => fetchPreferences(user?.sogoToken, user?.email),
    enabled: !!(user?.sogoToken && user?.email),
    staleTime: 0,
  });

  // Daftar signature LOKAL dimuat langsung dari localStorage — TIDAK boleh
  // menunggu network (prefs SOGo). Kalau fetchPreferences lambat/gagal,
  // daftar lokal tetap tampil (regresi: sebelumnya list kosong sampai query
  // prefs sukses → signature lokal hilang saat SOGo down).
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!email) return;
    const fresh = loadSignatures(email);
    setSigList(fresh.list);
    setDefaults(fresh.defaults);
  }, [email]);

  // Import SOGo signature SEKALI: hanya setelah fetchPreferences selesai.
  // Guard migratedRef di-set SETELAH prefs tiba — kalau prefs gagal/lambat,
  // ref tidak pernah terkunci dan import tetap berjalan saat prefs akhirnya
  // datang (deps [email, prefs] men-trigger ulang).
  useEffect(() => {
    if (!email || migratedRef.current) return;
    if (!prefs) return;
    migratedRef.current = true;
    // Guard typeof: nilai dari DB/localStorage tidak dipercaya — bukan-string
    // (hasil parse rusak) tidak boleh sampai ke .trim()/.substring.
    const savedSogo = typeof prefs?.defaults?.SOGoMailSignature === 'string'
      ? prefs.defaults.SOGoMailSignature
      : '';
    if (savedSogo.trim()) {
      const local = loadSignatures(email);
      if (local.list.length === 0) {
        // Migrasi mulus: belum ada signature lokal → jadikan SOGo signature
        // sebagai signature pertama.
        addSignature(email, 'Signature', savedSogo);
      } else if (shouldImportSogoSignature(local.list, savedSogo)) {
        // Reconcile multi-device: SOGoMailSignature adalah sumber bersama
        // yang ditulis syncToSogo dari perangkat mana pun. Tarik ke daftar
        // lokal bila html-nya belum ada (idempotent — tidak menumpuk,
        // tidak menimpa editan lokal).
        addSignature(email, 'Signature SOGo', savedSogo);
      }
      const fresh = loadSignatures(email);
      setSigList(fresh.list);
      setDefaults(fresh.defaults);
    }
  }, [email, prefs]);

  function refresh() {
    const data = loadSignatures(email);
    setSigList(data.list);
    setDefaults(data.defaults);
  }

  function startEdit(sig) {
    setEditingId(sig?.id || null);
    setSigName(sig?.name || '');
    setSigHtml(sig?.html || '');
    setStatus(null);
  }

  function handleSave() {
    if (!editingId) {
      addSignature(email, sigName, sigHtml);
    } else {
      updateSignature(email, editingId, { name: sigName, html: sigHtml });
    }
    refresh();
    setStatus({ type: 'success', message: 'Signature disimpan.' });
    startEdit(null);
  }

  function handleDelete(id) {
    if (!window.confirm('Hapus signature ini?')) return;
    removeSignature(email, id);
    if (editingId === id) startEdit(null);
    refresh();
  }

  // Simpan signature default ke SOGo prefs — agar klien SOGo lain (native,
  // mobile) juga memakai signature utama. Bukan syarat webmail ini (compose
  // memakai daftar lokal), tapi kompatibilitas ekstra.
  async function syncToSogo() {
    const data = loadSignatures(email);
    const main = getSignatureById(email, data.defaults.new);
    // Entri legacy ber-placeholder tidak ikut disinkronkan ke SOGo — hanya
    // dipakai setelah user mengisinya (flag placeholder dihapus saat edit).
    const html = (main?.html && !main?.placeholder) ? main.html : '';
    setSavingSogo(true);
    setStatus(null);
    try {
      await savePreferences(user.sogoToken, {
        defaults: {
          ...(prefs?.defaults || {}),
          SOGoMailSignature: html,
          SOGoMailSignatureEnabled: html && html.trim() ? '1' : '0',
        },
        settings: prefs?.settings || {},
      }, user.email);
      queryClient.invalidateQueries({ queryKey: ['preferences', user?.sogoToken] });
      setStatus({ type: 'success', message: 'Signature utama disinkronkan ke SOGo.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setSavingSogo(false);
    }
  }

  const editingSig = sigList.find((s) => s.id === editingId) || null;

  return (
    <Section icon={FileSignature} title="Signature Email">
      <div className="space-y-5 max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Buat beberapa signature (pola Outlook), lalu pilih mana yang dipakai utk
          email baru dan utk balasan. Bisa pakai <strong>tebal</strong>,{' '}
          <em>miring</em>, tautan, dan gambar.
        </p>
        <StatusMsg status={status} />

        {/* Daftar signature */}
        {sigList.length === 0 ? (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-xl p-6 text-center">
            Belum ada signature. Klik "Tambah Signature" untuk membuat.
          </div>
        ) : (
          <div className="space-y-2">
            {sigList.map((sig) => {
              const isDefaultNew = defaults.new === sig.id;
              const isDefaultReply = defaults.reply === sig.id;
              return (
                <div key={sig.id} className="border border-border rounded-xl p-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => startEdit(sig)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{sig.name}</span>
                      {isDefaultNew && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Utk pesan baru</span>}
                      {isDefaultReply && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Utk balasan</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {/* Entri legacy ber-placeholder (migrasi sekali-jalan di
                          loadSignatures) ditandai agar user tahu harus diisi.
                          Guard optional chaining tetap ada utk jaga-jaga. */}
                      {sig.placeholder
                        ? 'Perlu diisi — klik untuk mengedit'
                        : `${((sig.html?.length || 0) / 1024).toFixed(1)} KB — ${sig.html?.includes('<img') ? 'ada gambar' : 'teks saja'}`}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      value={isDefaultNew ? 'new' : isDefaultReply ? 'reply' : ''}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setDefaultSignature(email, e.target.value, sig.id);
                        refresh();
                      }}
                      className="bg-muted border-none rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none"
                      title="Jadikan signature default"
                    >
                      <option value="">—</option>
                      <option value="new">Default: Pesan Baru</option>
                      <option value="reply">Default: Balasan</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDelete(sig.id)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Hapus signature"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Editor signature aktif */}
        {(editingId || !sigList.length) && (
          <div className="border border-border rounded-xl p-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Nama Signature</label>
              <input
                type="text"
                value={sigName}
                onChange={(e) => setSigName(e.target.value)}
                placeholder="mis. Signature Kantor"
                className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Isi Signature</label>
              <HtmlEditor
                value={sigHtml}
                onChange={setSigHtml}
                minHeight={140}
                placeholder="Tulis signature di sini..."
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium"
              >
                <FileSignature size={14} />
                {editingId ? 'Simpan Perubahan' : 'Tambah Signature'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => startEdit(null)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Batal
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {!editingId && (
            <button
              type="button"
              onClick={() => startEdit(null)}
              className="flex items-center gap-2 border border-border hover:bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Plus size={15} />
              Tambah Signature
            </button>
          )}
          <button
            type="button"
            onClick={syncToSogo}
            disabled={savingSogo || !sigList.length}
            className="flex items-center gap-2 border border-border hover:bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            title="Simpan signature utama ke preferensi SOGo agar dipakai klien SOGo lain (native/mobile)"
          >
            {savingSogo ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
            Sinkronkan ke SOGo
          </button>
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

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['preferences', user?.sogoToken],
    queryFn: () => fetchPreferences(user?.sogoToken, user?.email),
    enabled: !!(user?.sogoToken && user?.email),
    staleTime: 0,
  });

  useEffect(() => {
    if (prefs?.defaults && !initRef.current) {
      const v = prefs.defaults.Vacation || {};
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
      queryClient.invalidateQueries({ queryKey: ['preferences', user?.sogoToken] });
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
    <Section icon={Plane} title="Auto-Reply Cuti">
      <div className="space-y-4 max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Balas otomatis untuk email masuk ketika kamu sedang cuti atau tidak di tempat.
        </p>
        <StatusMsg status={status} />

        {/* Toggle */}
        <Switch
          checked={enabled}
          onChange={setEnabled}
          label={enabled ? 'Auto-reply aktif' : 'Auto-reply nonaktif'}
        />

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

// ─── Preset theme colors ──────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { id: 'blue',   label: 'Biru',      swatch: 'hsl(221, 83%, 53%)' },
  { id: 'indigo',  label: 'Indigo',   swatch: 'hsl(239, 84%, 58%)' },
  { id: 'violet',  label: 'Violet',   swatch: 'hsl(271, 76%, 53%)' },
  { id: 'green',   label: 'Hijau',    swatch: 'hsl(142, 71%, 45%)' },
  { id: 'teal',    label: 'Teal',     swatch: 'hsl(173, 80%, 40%)' },
  { id: 'orange',  label: 'Oranye',   swatch: 'hsl(24, 95%, 53%)' },
  { id: 'rose',    label: 'Merah',    swatch: 'hsl(346, 84%, 61%)' },
  { id: 'slate',   label: 'Abu-abu',  swatch: 'hsl(215, 25%, 55%)' },
];

// ─── Display Preferences ─────────────────────────────────────────────────────
// ─── Notifikasi (desktop) ──────────────────────────────────────────────────
function NotifySection() {
  const { user } = useAuthStore();
  const [rich, setRich] = useState(true);
  const [sound, setSound] = useState(false);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    const p = loadNotifyPrefs(user.email);
    setRich(p.rich !== false);
    setSound(p.sound === true);
  }, [user?.email]);

  // Simpan sebagian (merge) — rich & sound masing-masing bisa diubah terpisah.
  const persist = (patch) => {
    if (!user?.email) return;
    saveNotifyPrefs(user.email, patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    try {
      setPermission(await Notification.requestPermission());
    } catch { /* browser lama — abaikan */ }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">Notifikasi Desktop</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Izin browser: {permission === 'granted' ? 'diizinkan' : permission === 'denied' ? 'ditolak — aktifkan dari setelan browser' : permission === 'unsupported' ? 'tidak didukung browser ini' : 'belum diminta'}
        </p>
        {permission === 'default' && (
          <button
            type="button"
            onClick={requestPermission}
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Minta izin notifikasi
          </button>
        )}
      </div>

      <Switch
        checked={rich}
        onChange={(v) => { setRich(v); persist({ rich: v }); }}
        label="Notifikasi kaya (pengirim + subjek)"
        description="Notifikasi menampilkan pengirim dan subjek email terbaru, bukan hanya jumlah pesan."
      />

      <Switch
        checked={sound}
        onChange={(v) => { setSound(v); persist({ sound: v }); }}
        label={<span className="inline-flex items-center gap-2"><Volume2 size={15} className="text-primary" />Suara notifikasi</span>}
        description="Mainkan bunyi singkat saat email baru masuk. Mengikuti volume perangkat."
      />

      <p className={`text-xs text-primary transition-opacity ${saved ? 'opacity-100' : 'opacity-0'}`} aria-live="polite">
        Tersimpan.
      </p>
    </div>
  );
}

function DisplaySection() {
  const queryClient = useQueryClient();
  const { user, themeColor, setThemeColor, theme, setTheme } = useAuthStore();
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [language, setLanguage] = useState('Indonesian');
  const [dateFormat, setDateFormat] = useState('%d/%m/%Y');
  const [weekStart, setWeekStart] = useState('0');
  const [composeMode, setComposeMode] = useState('html');
  const [replyPlacement, setReplyPlacement] = useState('above');
  const [confirmDelete, setConfirmDelete] = useState('1');
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
      setComposeMode(prefs.defaults.SOGoMailComposeMessageType === 'text' ? 'text' : 'html');
      setReplyPlacement(prefs.defaults.SOGoMailReplyPlacement === 'below' ? 'below' : 'above');
      setConfirmDelete(String(prefs.defaults.SOGoConfirmDelete ?? '1'));
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
          SOGoMailComposeMessageType: composeMode,
          SOGoMailReplyPlacement: replyPlacement,
          SOGoConfirmDelete: parseInt(confirmDelete, 10),
        },
        settings: prefs?.settings || {},
      };
      return savePreferences(user.sogoToken, updatedPrefs, user.email);
    },
    onSuccess: () => {
      initRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['preferences', user?.sogoToken] });
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
      <div className="space-y-4 max-w-md">
        <p className="text-sm text-muted-foreground">
          Preferensi ini disimpan di server dan digunakan oleh webmail serta SOGo.
        </p>
        <StatusMsg status={status} />

        {/* ── Regional ── */}
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

        {/* ── Theme Mode ── */}
        <hr className="border-border my-2" />
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Palette size={15} className="text-primary" />
            Mode Tampilan
          </div>
          <div className="flex gap-2">
            {[
              { id: 'dark', label: 'Gelap', desc: 'Selalu gelap' },
              { id: 'light', label: 'Terang', desc: 'Selalu terang' },
              { id: 'auto', label: 'Otomatis', desc: 'Ikuti perangkat' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setTheme(m.id)}
                className={`flex-1 flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                  theme === m.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <span className="text-sm font-medium">{m.label}</span>
                <span className="text-[11px] text-muted-foreground">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Theme Color ── */}
        <hr className="border-border my-2" />
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Palette size={15} className="text-primary" />
            Warna Tema
          </div>
          <div className="flex flex-wrap gap-3">
            {COLOR_PRESETS.map(c => {
              const selected = themeColor === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setThemeColor(c.id)}
                  className="flex flex-col items-center gap-1.5 group"
                  title={c.label}
                >
                  <span
                    className={`block w-8 h-8 rounded-full transition-all ${
                      selected
                        ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
                        : 'ring-1 ring-border ring-offset-1 ring-offset-transparent group-hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.swatch }}
                  />
                  <span className={`text-[10px] ${selected ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Mail Preferences ── */}
        <hr className="border-border my-2" />
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <MessageSquare size={15} className="text-primary" />
            Preferensi Email
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Mode Tulis Email</label>
            <select value={composeMode} onChange={e => setComposeMode(e.target.value)}
              className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
              <option value="html">Rich Text (HTML)</option>
              <option value="text">Plain Text</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Posisi Balasan</label>
            <select value={replyPlacement} onChange={e => setReplyPlacement(e.target.value)}
              className="w-full bg-muted border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
              <option value="above">Di atas teks yang dikutip</option>
              <option value="below">Di bawah teks yang dikutip</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="text-sm font-medium text-foreground">Hapus Email</div>
            <Switch
              checked={confirmDelete === '1'}
              onChange={(v) => setConfirmDelete(v ? '1' : '0')}
              label={confirmDelete === '1' ? 'Konfirmasi sebelum menghapus' : 'Langsung hapus tanpa konfirmasi'}
              description="Saat aktif, hapus menampilkan notifikasi Urungkan beberapa detik."
            />
          </div>
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
  // Tab "Tata Letak & Baca" PERTAMA dan jadi default — preferensi yang paling
  // sering diubah (ala Outlook), bukan Password.
  const tabs = [
    { id: 'layout',   label: 'Tata Letak & Baca',  short: 'Tata Letak', icon: LayoutPanelLeft },
    { id: 'display',  label: 'Tampilan',           short: 'Tampilan',   icon: Globe },
    { id: 'password', label: 'Password',           short: 'Password',   icon: Lock },
    { id: 'signature', label: 'Signature',         short: 'Signature',  icon: FileSignature },
    { id: 'vacation', label: 'Auto-Reply Cuti',    short: 'Auto-Reply', icon: Plane },
    { id: 'notify',   label: 'Notifikasi',         short: 'Notifikasi', icon: BellRing },
  ];
  const [activeTab, setActiveTab] = useState('layout');
  const mobileTabRefs = useRef({});

  // Pastikan pill tab aktif terlihat di bar yang bisa di-scroll (mobile).
  useEffect(() => {
    mobileTabRefs.current[activeTab]?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [activeTab]);

  // Panah kiri/kanan berpindah tab (pola WAI-ARIA tabs) — berlaku di bar
  // desktop maupun mobile.
  const onTabKeyDown = (e) => {
    const idx = tabs.findIndex((t) => t.id === activeTab);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(idx + 1) % tabs.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(idx - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (next) {
      e.preventDefault();
      setActiveTab(next.id);
      e.currentTarget.querySelector(`[data-tab="${next.id}"]`)?.focus();
    }
  };

  return (
    <div className="flex flex-col sm:flex-row h-full min-w-0 overflow-hidden">
      {/* Sidebar tabs */}
      <div className="w-52 shrink-0 border-r border-border bg-card flex-col hidden sm:flex">
        <div className="px-4 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Settings size={18} className="text-primary" />
            <span className="font-semibold text-foreground">Pengaturan</span>
          </div>
          {user?.email && (
            <div className="text-xs text-muted-foreground mt-2 truncate">{user.email}</div>
          )}
        </div>
        <nav className="p-3 space-y-1" role="tablist" aria-label="Bagian pengaturan" aria-orientation="vertical" onKeyDown={onTabKeyDown}>
          {tabs.map(t => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                data-tab={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center justify-between px-3 min-h-11 rounded-xl text-sm transition-all ${
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{t.label}</span>
                </div>
                {active && <ChevronRight size={14} className="shrink-0" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile tab bar — pill yang bisa di-scroll horizontal (bukan 6 tab
          terjepit text-xs); setiap pill target 44px, scrollbar disembunyikan. */}
      <div
        className="sm:hidden shrink-0 border-b border-border bg-card flex gap-1.5 px-3 py-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Bagian pengaturan"
        onKeyDown={onTabKeyDown}
      >
        {tabs.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-tab={t.id}
              ref={(el) => { mobileTabRefs.current[t.id] = el; }}
              onClick={() => setActiveTab(t.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 min-h-11 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={15} className="shrink-0" />
              {t.short}
            </button>
          );
        })}
      </div>

      {/* Content — masing-masing tab disubung SectionErrorBoundary agar satu
          tab rusak (render error / library eksternal) tidak menjatuhkan seluruh
          halaman Settings dan memicu ErrorBoundary root ("Terjadi Kesalahan"). */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {activeTab === 'layout'    && <SectionErrorBoundary section="Tata Letak & Baca"><LayoutSection /></SectionErrorBoundary>}
          {activeTab === 'display'   && <SectionErrorBoundary section="Tampilan"><DisplaySection /></SectionErrorBoundary>}
          {activeTab === 'password'  && <SectionErrorBoundary section="Ganti Password"><ChangePasswordSection /></SectionErrorBoundary>}
          {activeTab === 'signature' && <SectionErrorBoundary section="Signature"><SignatureSection /></SectionErrorBoundary>}
          {activeTab === 'vacation'  && <SectionErrorBoundary section="Auto-Reply Cuti"><VacationSection /></SectionErrorBoundary>}
          {activeTab === 'notify'    && <SectionErrorBoundary section="Notifikasi"><NotifySection /></SectionErrorBoundary>}
        </div>
      </div>
    </div>
  );
}

// ─── Section-local ErrorBoundary ─────────────────────────────────────────────
//
// Tujuan: error render pada satu section tidak boleh menjatuhkan halaman
// Settings keseluruhan. Sebelumnya, satu anak yang throw akan ditangkap
// ErrorBoundary root, menampilkan "Terjadi Kesalahan" generik yang membuat
// semua 4 tab tidak dapat dipakai.
//
class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // Cetak diagnostik ke console (info berguna untuk developer); tidak
    // menulis ke localStorage karena ErrorBoundary root sudah mencatat
    // error tertinggi.
    try { console.error(`[PreferencesPage/${this.props.section}] render error:`, error, info); } catch {}
  }
  render() {
    if (this.state.hasError) {
      // Detail error disembunyikan secara default (keputusan keamanan yang
      // sama dgn ErrorBoundary root). Opt-in via tombol "Lihat Detail" utk
      // pemilik akun tanpa devtools; detail juga tercatat di console dgn
      // prefix section.
      return (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive space-y-2">
          <div className="font-semibold">Bagian "{this.props.section}" tidak dapat ditampilkan.</div>
          <div className="text-xs text-muted-foreground">
            Terjadi kesalahan saat memuat bagian ini. Detail bisa dibuka lewat tombol di bawah.
          </div>
          {this.state.showDetails && (
            <pre className="bg-background/60 border border-destructive/20 rounded-lg p-2.5 text-[11px] leading-relaxed overflow-auto max-h-40 break-all whitespace-pre-wrap font-mono">
              {String(this.state.error?.message || this.state.error || 'Kesalahan tidak diketahui.')}
            </pre>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
              className="text-xs underline hover:no-underline text-primary"
            >
              {this.state.showDetails ? 'Sembunyikan Detail' : 'Lihat Detail'}
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null, showDetails: false })}
              className="text-xs underline hover:no-underline text-primary"
            >
              Coba lagi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
