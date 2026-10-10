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
        const st = get();
        if (!st.user?.email) return;
        const prefs = {};
        for (const k of Object.keys(DEFAULT_PREFS)) prefs[k] = st[k];
        savePrefs(st.user.email, prefs);
      };

      return {
        user: null,        // { email, sogoToken, cn } — dipersist
        isLoggedIn: false, // dipersist
        theme: 'dark',     // preferensi per-akun (fallback global saat belum login) — 'dark' | 'light' | 'auto'
        themeColor: 'blue', // preferensi per-akun — primary accent hue
        sortAsc: false,    // preferensi per-akun — urutan sortir kotak masuk
        conversationView: false, // preferensi per-akun — tampilan percakapan
        // Tata letak ala Outlook (lihat DEFAULT_PREFS di userPrefs.js)
        readingPane: DEFAULT_PREFS.readingPane,
        density: DEFAULT_PREFS.density,
        markReadMode: DEFAULT_PREFS.markReadMode,
        markReadDelaySec: DEFAULT_PREFS.markReadDelaySec,
        paneWidths: DEFAULT_PREFS.paneWidths,
        collapsedFolders: DEFAULT_PREFS.collapsedFolders,
        favoriteFolders: DEFAULT_PREFS.favoriteFolders,

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
        // Setter generik utk preferensi tata letak: setPref('readingPane','bottom'),
        // setPref('paneWidths', { ...get().paneWidths, list: 400 }), dst.
        // Hanya key yang ada di DEFAULT_PREFS yang diterima.
        setPref: (key, value) => {
          if (!(key in DEFAULT_PREFS)) return;
          set({ [key]: value });
          persistPrefs();
        },
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
        readingPane: state.readingPane,
        density: state.density,
        markReadMode: state.markReadMode,
        markReadDelaySec: state.markReadDelaySec,
        paneWidths: state.paneWidths,
        collapsedFolders: state.collapsedFolders,
        favoriteFolders: state.favoriteFolders,
      }),
    }
  )
);
