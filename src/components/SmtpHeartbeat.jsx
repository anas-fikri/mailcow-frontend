import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { fetchSmtpSessionStatus } from '../lib/api';
import { setupSmtpHeartbeat } from '../lib/smtpHeartbeat';

/**
 * Komponen tanpa output. Mount sekali di root layout setelah user login.
 *
 * Ping /api/auth/smtp/status setiap SMTP_HEARTBEAT_INTERVAL_MS (~50 menit)
 * SELAMA document.visibilityState === 'visible'. Panggilan ini me-refresh
 * lastUsed di server (requireSmtpSession middleware selalu update lastUsed).
 * Saat tab inactive (hidden / minimize / tab lain aktif) → tidak ping,
 * idle timer server jadi satu-satunya penentu.
 *
 * 401 dari ping → event SMTP_SESSION_LOST_EVENT → SmtpReauthBanner meminta
 * password untuk membuat sesi baru (sesi SOGo / membaca email tidak terganggu).
 */
export default function SmtpHeartbeat() {
    const sogoToken = useAuthStore((s) => s.user?.sogoToken);

    useEffect(() => {
        if (typeof document === 'undefined' || !sogoToken) return;

        const hb = setupSmtpHeartbeat({
            schedule: () => {
                // 401 → banner re-auth (lihat api.js); error lain diabaikan (offline/cancel).
                fetchSmtpSessionStatus().catch(() => {});
            },
            isVisible: () => document.visibilityState === 'visible',
        });

        const listener = () => hb.onVisibilityChange();
        document.addEventListener('visibilitychange', listener);

        return () => {
            document.removeEventListener('visibilitychange', listener);
            hb.stop();
        };
    }, [sogoToken]);

    return null;
}
