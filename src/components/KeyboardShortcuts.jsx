import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';
import { SHORTCUT_GROUPS } from '../lib/keymap';

// Di macOS tombol Ctrl ditampilkan sebagai ⌘ (pintasan menerima keduanya).
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const prettyKey = (key) => {
  let k = key;
  if (IS_MAC) k = k.replace(/^Ctrl\+/, '⌘');
  return k === 'Escape' ? 'Esc' : k === 'Enter' ? '↵' : k;
};

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="kbd-help-title"
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Keyboard size={16} className="text-primary" />
                </div>
                <h2 id="kbd-help-title" className="text-base font-semibold">Pintasan Keyboard</h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors" aria-label="Tutup bantuan pintasan">
                <X size={18} />
              </button>
            </div>

            {/* Shortcut groups — dua kolom di layar lebar, ala Outlook */}
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 max-h-[65vh] overflow-y-auto">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {group.title}
                  </h3>
                  <div className="space-y-1.5">
                    {group.shortcuts.map((s) => (
                      <div key={s.desc} className="flex items-center justify-between gap-3 py-1">
                        <span className="text-sm text-foreground min-w-0">{s.desc}</span>
                        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                          {s.keys.map((key, i) => (
                            <React.Fragment key={key}>
                              {i > 0 && <span className="text-xs text-muted-foreground">/</span>}
                              <kbd className="px-2 py-0.5 bg-muted border border-border rounded-md text-xs font-mono text-foreground shadow-sm whitespace-nowrap">
                                {prettyKey(key)}
                              </kbd>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Tekan <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">?</kbd> kapan saja untuk membuka bantuan ini.
                Saat pesan terbuka, <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">r</kbd>/<kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">f</kbd>/<kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">s</kbd>/<kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">u</kbd>/<kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">Del</kbd> berlaku pada pesan itu.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
