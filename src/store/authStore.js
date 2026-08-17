import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from '../lib/userPrefs';

export const useAuthStore = create(
  persist(
    (set, get) => {
      // Simpan preferensi UI ke storage per-akun saat user sedang login.
      // Dengan ini tema/warna/urutan sortir/tampilan percakapan tersimpan
      // bersama profil akun dan tidak hilang saat logout atau ganti akun.
      const persistPrefs = () => {
        const { user, theme, themeColor, sortAsc, conversationView } = get();
        if (user?.email) savePrefs(user.email, { theme, themeColor, sortAsc, conversationView });
      };

      return {
        user: null,        // { email, sogoToken, cn } — dipersist
        isLoggedIn: false, // dipersist
        theme: 'dark',     // preferensi per-akun (fallback global saat belum login)
        themeColor: 'blue', // preferensi per-akun — primary accent hue
        sortAsc: false,    // preferensi per-akun — urutan sortir kotak masuk
        conversationView: false, // preferensi per-akun — tampilan percakapan

        // SMTP session token (UUID dari /api/auth/smtp). Dipersist agar reload
        // tidak kehilangan sesi SMTP: /api/preferences (DB) dan fallback kirim
        // /api/send (SOGo /send 501) tetap jalan setelah refresh. Token tidak
        // berisi password, berumur pendek (8 jam / 30 mnt idle), dan hangus
        // otomatis saat logout / proxy restart. Kredensial (user+pass) tetap
        // TIDAK pernah dipersist.
        smtpToken: null,

        setUser: (user) => set(() => {
          // Selalu pilih preferensi berdasarkan akun yang baru login. Jangan
          // mewarisi tema akun sebelumnya saat akun ini belum punya profil prefs.
          const stored = loadPrefs(user?.email);
          const prefs = stored || DEFAULT_PREFS;
          if (!stored && user?.email) savePrefs(user.email, prefs);
          return { user, isLoggedIn: true, ...prefs };
        }),
        // Logout tidak boleh mereset preferensi UI (tema, warna, sortir, percakapan).
        clearUser: () => set({ user: null, isLoggedIn: false, smtpToken: null }),
        setTheme: (theme) => { set({ theme }); persistPrefs(); },
        toggleTheme: () => { set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })); persistPrefs(); },
        setThemeColor: (themeColor) => { set({ themeColor }); persistPrefs(); },
        setSortAsc: (sortAsc) => { set({ sortAsc }); persistPrefs(); },
        setConversationView: (conversationView) => { set({ conversationView }); persistPrefs(); },
        setSmtpToken: (token) => set({ smtpToken: token }), // UUID string
      };
    },
    {
      name: 'pcp-auth',
      // Persist sesi + smtpToken (UUID sesi proxy, BUKAN kredensial).
      // Preferensi UI per-akun disimpan terpisah di pcp_prefs_<email>.
      partialize: (state) => ({
        user: state.user,
        isLoggedIn: state.isLoggedIn,
        smtpToken: state.smtpToken,
        theme: state.theme,
        themeColor: state.themeColor,
        sortAsc: state.sortAsc,
        conversationView: state.conversationView,
      }),
    }
  )
);
