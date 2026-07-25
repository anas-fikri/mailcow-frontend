import { create } from 'zustand';

// ─── Toast Types ──────────────────────────────────────────────────────────────
export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning',
};

// ─── Store ─────────────────────────────────────────────────────────────────────
let toastId = 0;

export const useToastStore = create((set) => ({
  toasts: [],

  addToast: ({ type = TOAST_TYPES.INFO, message, duration = 5000, action }) => {
    const id = ++toastId;
    const toast = { id, type, message, duration, action };
    set((s) => ({ toasts: [...s.toasts, toast] }));

    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  clearToasts: () => set({ toasts: [] }),
}));

// Convenience helpers
export const toast = {
  success: (message, duration) =>
    useToastStore.getState().addToast({ type: TOAST_TYPES.SUCCESS, message, duration }),
  error: (message, duration) =>
    useToastStore.getState().addToast({ type: TOAST_TYPES.ERROR, message, duration }),
  info: (message, duration) =>
    useToastStore.getState().addToast({ type: TOAST_TYPES.INFO, message, duration }),
  warning: (message, duration) =>
    useToastStore.getState().addToast({ type: TOAST_TYPES.WARNING, message, duration }),
  undo: (message, onUndo, duration = 6000) =>
    useToastStore.getState().addToast({
      type: TOAST_TYPES.INFO,
      message,
      duration,
      action: { label: 'Urungkan', onClick: onUndo },
    }),
};
