import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle, Undo2, Ban, ExternalLink } from 'lucide-react';
import { useToastStore, TOAST_TYPES } from '../lib/toast';

const ICON_MAP = {
  [TOAST_TYPES.SUCCESS]: CheckCircle2,
  [TOAST_TYPES.ERROR]: AlertCircle,
  [TOAST_TYPES.INFO]: Info,
  [TOAST_TYPES.WARNING]: AlertTriangle,
};

// Ikon tombol aksi mengikuti jenis aksinya (action.kind) — bukan selalu
// panah undo: "Batalkan" jadwal = Ban, "Buka" = ExternalLink, "Urungkan" = Undo2.
const ACTION_ICON_MAP = {
  undo: Undo2,
  cancel: Ban,
  open: ExternalLink,
};

// Permukaan toast netral (bg-popover + hairline border); jenis toast hanya
// mewarnai ikonnya — pola "modern clean" (Linear/Notion), bukan panel blok warna.
const ICON_COLOR_MAP = {
  [TOAST_TYPES.SUCCESS]: 'text-green-600 dark:text-green-400',
  [TOAST_TYPES.ERROR]: 'text-destructive',
  [TOAST_TYPES.INFO]: 'text-blue-600 dark:text-blue-400',
  [TOAST_TYPES.WARNING]: 'text-amber-600 dark:text-amber-400',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  // Kontainer live region SELALU ada di DOM (walau kosong) — screen reader
  // hanya mengumumkan perubahan pada region yang sudah ada sebelumnya.
  return (
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions text"
      className="fixed bottom-20 right-3 left-3 sm:left-auto md:bottom-4 md:right-4 z-[9999] flex flex-col gap-2 max-w-sm w-auto pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const Icon = ICON_MAP[t.type] || Info;
          const ActionIcon = t.action?.kind ? ACTION_ICON_MAP[t.action.kind] : null;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
            >
              <Icon size={16} className={`shrink-0 mt-0.5 ${ICON_COLOR_MAP[t.type] || ICON_COLOR_MAP[TOAST_TYPES.INFO]}`} aria-hidden="true" />
              <p className="flex-1 text-[13px] font-medium leading-snug tabular-nums">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action.onClick?.();
                    removeToast(t.id);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-primary hover:bg-primary/10 transition-colors duration-150 text-xs font-semibold shrink-0"
                >
                  {ActionIcon && <ActionIcon size={12} aria-hidden="true" />}
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                aria-label="Tutup notifikasi"
                className="shrink-0 p-0.5 rounded-md hover:bg-muted transition-colors duration-150 text-muted-foreground opacity-60 hover:opacity-100"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
