import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,        // { email, sogoToken, cn } — dipersist
      isLoggedIn: false, // dipersist
      theme: 'dark',     // dipersist
      themeColor: 'blue', // dipersist — primary accent hue (blue, green, violet, etc.)
      sortAsc: false,    // dipersist — urutan sortir kotak masuk
      conversationView: false, // dipersist — tampilan percakapan

      // SMTP creds disimpan di memory saja (TIDAK dipersist ke localStorage)
      smtpCreds: null,   // { user: email, pass: password }

      setUser: (user) => set({ user, isLoggedIn: true }),
      clearUser: () => set({ user: null, isLoggedIn: false, sortAsc: false, conversationView: false, smtpCreds: null }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      setThemeColor: (themeColor) => set({ themeColor }),
      setSortAsc: (sortAsc) => set({ sortAsc }),
      setConversationView: (conversationView) => set({ conversationView }),
      setSmtpCreds: (creds) => set({ smtpCreds: creds }), // { user, pass }
    }),
    {
      name: 'pcp-auth',
      // Hanya persist user, isLoggedIn, theme — JANGAN persist smtpCreds
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
