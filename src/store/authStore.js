import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { loadPrefs, savePrefs } from '../lib/userPrefs';

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

        // SMTP session token disimpan di memory saja (TIDAK dipersist ke localStorage)
        smtpToken: null,   // UUID session token dari /api/auth/smtp

        setUser: (user) => set((state) => {
          // Muat preferensi UI akun ini (jika pernah disimpan); kalau belum ada,
          // biarkan nilai saat ini (tema perangkat) agar tidak berkedip.
          const stored = loadPrefs(user?.email);
          return stored ? { user, isLoggedIn: true, ...stored } : { user, isLoggedIn: true };
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
      // Hanya persist sesi + fallback global — JANGAN persist smtpCreds/smtpToken.
      // Preferensi UI per-akun disimpan terpisah di pcp_prefs_<email>.
      partialize: (state) => ({
        user: state.user,
        isLoggedIn: state.isLoggedIn,
        theme: state.theme,
        themeColor: state.themeColor,
        sortAsc: state.sortAsc,
        conversationView: state.conversationView,
      }),
    }
  )
);
