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
        theme: 'dark',     // preferensi per-akun (fallback global saat belum login) — 'dark' | 'light' | 'auto'
        themeColor: 'blue', // preferensi per-akun — primary accent hue
        sortAsc: false,    // preferensi per-akun — urutan sortir kotak masuk
        conversationView: false, // preferensi per-akun — tampilan percakapan

        // Sesi SMTP (UUID dari /api/auth/smtp) kini disimpan sebagai cookie
        // httpOnly oleh server — BUKAN di state JS / localStorage. XSS tidak
        // bisa membaca token; kredensial (user+pass) tetap tidak pernah dipersist.

        setUser: (user) => set(() => {
          // Selalu pilih preferensi berdasarkan akun yang baru login. Jangan
          // mewarisi tema akun sebelumnya saat akun ini belum punya profil prefs.
          const stored = loadPrefs(user?.email);
          const prefs = stored || DEFAULT_PREFS;
          if (!stored && user?.email) savePrefs(user.email, prefs);
          return { user, isLoggedIn: true, ...prefs };
        }),
        // Logout tidak boleh mereset preferensi UI (tema, warna, sortir, percakapan).
        clearUser: () => set({ user: null, isLoggedIn: false }),
        setTheme: (theme) => { set({ theme }); persistPrefs(); },
        toggleTheme: () => { set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })); persistPrefs(); },
        // Siklus tema utk tombol cepat di sidebar: dark → light → auto → dark.
        cycleTheme: () => {
          const order = ['dark', 'light', 'auto'];
          const next = order[(order.indexOf(get().theme) + 1) % order.length];
          set({ theme: next });
          persistPrefs();
        },
        setThemeColor: (themeColor) => { set({ themeColor }); persistPrefs(); },
        setSortAsc: (sortAsc) => { set({ sortAsc }); persistPrefs(); },
        setConversationView: (conversationView) => { set({ conversationView }); persistPrefs(); },
      };
    },
    {
      name: 'pcp-auth',
      // Persist sesi (user + flag). smtpToken TIDAK dipersist — disimpan server
      // sebagai cookie httpOnly. Preferensi UI per-akun terpisah di pcp_prefs_<email>.
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
