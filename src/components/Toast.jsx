import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle, Undo2 } from 'lucide-react';
import { useToastStore, TOAST_TYPES } from '../lib/toast';

const ICON_MAP = {
  [TOAST_TYPES.SUCCESS]: CheckCircle2,
  [TOAST_TYPES.ERROR]: AlertCircle,
  [TOAST_TYPES.INFO]: Info,
  [TOAST_TYPES.WARNING]: AlertTriangle,
};

const STYLE_MAP = {
  [TOAST_TYPES.SUCCESS]: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
  [TOAST_TYPES.ERROR]: 'border-destructive/30 bg-destructive/10 text-destructive',
  [TOAST_TYPES.INFO]: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  [TOAST_TYPES.WARNING]: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-3 left-3 sm:left-auto md:bottom-4 md:right-4 z-[9999] flex flex-col gap-2 max-w-sm w-auto pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const Icon = ICON_MAP[t.type] || Info;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-sm ${STYLE_MAP[t.type] || STYLE_MAP[TOAST_TYPES.INFO]}`}
            >
              <Icon size={18} className="shrink-0 mt-0.5" />
              <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
              {t.action && (
                <button
                  onClick={() => {
                    t.action.onClick?.();
                    removeToast(t.id);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-xs font-bold shrink-0"
                >
                  <Undo2 size={12} />
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 p-0.5 rounded-full hover:bg-black/10 transition-colors opacity-60 hover:opacity-100"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
