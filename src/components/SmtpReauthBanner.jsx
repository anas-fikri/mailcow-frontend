import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { registerSmtpSession, SMTP_SESSION_LOST_EVENT } from '../lib/api';
import { toast } from '../lib/toast';

/**
 * Banner pemulihan sesi pengiriman (SMTP proxy).
 *
 * Muncul saat api.js mendeteksi 401 dari /api/* (sesi SMTP habis, server.js
 * restart, atau pendaftaran saat login gagal). User cukup memasukkan password
 * di tempat — halaman, compose, dan draf tidak ditinggalkan.
 */
export default function SmtpReauthBanner() {
  const email = useAuthStore((s) => s.user?.email);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const onLost = () => setOpen(true);
    window.addEventListener(SMTP_SESSION_LOST_EVENT, onLost);
    return () => window.removeEventListener(SMTP_SESSION_LOST_EVENT, onLost);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open || !email) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await registerSmtpSession(email, password);
      setOpen(false);
      setPassword('');
      toast.success('Sesi pengiriman aktif kembali. Silakan kirim ulang.');
    } catch (err) {
      setError(err?.message || 'Gagal memulihkan sesi pengiriman.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="alert" className="anim-rise-in fixed z-[60] left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 w-[calc(100%-2rem)] max-w-md rounded-lg border border-amber-500/40 bg-card text-card-foreground shadow-lg p-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <KeyRound size={18} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Sesi pengiriman email berakhir</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Masukkan password untuk melanjutkan mengirim. Email &amp; draf Anda tetap aman.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Tutup"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-2">
          <label htmlFor="smtp-reauth-password" className="sr-only">Password</label>
          <input
            id="smtp-reauth-password"
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 min-w-0 h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Password"
          />
          <button type="submit" disabled={busy || !password}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />}
            Lanjutkan
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    </div>
  );
}
