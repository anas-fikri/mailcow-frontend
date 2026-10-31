/**
 * Heartbeat sesi SMTP proxy — ping periodik saat tab aktif agar lastUsed di
 * server selalu di-refresh. idle timer server (default 60 menit via
 * SESSION_IDLE_MS) jadi hanya menghitung waktu ketika tab benar-benar inactive.
 *
 * Pure / testable: tidak pakai DOM langsung. Pemanggil (komponen React atau
 * test runner) mengoper `schedule` (callback ping), `isVisible` (cek
 * visibilitas), dan opsional `setInterval` / `clearInterval` (default ke
 * global). Mengembalikan kontrol .start() / .stop() / .onVisibilityChange()
 * sehingga uji unit bisa memanggil transisi visibilitas secara deterministik.
 */

export const SMTP_HEARTBEAT_INTERVAL_MS = 50 * 60 * 1000; // ~50 menit

export function setupSmtpHeartbeat({
    schedule,
    isVisible,
    setInterval: customSetInterval,
    clearInterval: customClearInterval,
} = {}) {
    const setI = customSetInterval || ((fn, ms) => setInterval(fn, ms));
    const clearI = customClearInterval || ((id) => clearInterval(id));
    let timer = null;

    function start() {
        if (timer != null) return;
        schedule();                                 // ping sekali seketika
        timer = setI(() => schedule(), SMTP_HEARTBEAT_INTERVAL_MS);
    }

    function stop() {
        if (timer != null) {
            clearI(timer);
            timer = null;
        }
    }

    function onVisibilityChange() {
        if (isVisible()) start();
        else stop();
    }

    // Sinkronkan status awal dgn visibilitas saat ini (jeda 1 schedule jika visible).
    onVisibilityChange();

    return {
        start,
        stop,
        onVisibilityChange,
        isRunning: () => timer != null,
    };
}
