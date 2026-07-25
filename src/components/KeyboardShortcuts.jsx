import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

const SHORTCUT_GROUPS = [
  {
    title: 'Navigasi',
    shortcuts: [
      { keys: ['j'], desc: 'Pesan berikutnya' },
      { keys: ['k'], desc: 'Pesan sebelumnya' },
      { keys: ['o', 'Enter'], desc: 'Buka pesan terpilih' },
      { keys: ['Escape'], desc: 'Tutup panel / batal pilih' },
    ],
  },
  {
    title: 'Aksi Pesan',
    shortcuts: [
      { keys: ['r'], desc: 'Balas pesan' },
      { keys: ['f'], desc: 'Teruskan pesan' },
      { keys: ['s'], desc: 'Tandai berbintang / batal' },
      { keys: ['u'], desc: 'Tandai belum dibaca' },
      { keys: ['d', '#'], desc: 'Hapus / pindah ke sampah' },
      { keys: ['m'], desc: 'Pindahkan ke folder' },
    ],
  },
  {
    title: 'Seleksi',
    shortcuts: [
      { keys: ['a'], desc: 'Pilih semua / batal pilih' },
      { keys: ['x'], desc: 'Tandai dibaca' },
    ],
  },
  {
    title: 'Lainnya',
    shortcuts: [
      { keys: ['c'], desc: 'Tulis pesan baru' },
      { keys: ['/'], desc: 'Fokus ke pencarian' },
      { keys: ['?'], desc: 'Tampilkan bantuan ini' },
    ],
  },
];

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
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Keyboard size={16} className="text-primary" />
                </div>
                <h2 className="text-base font-semibold">Pintasan Keyboard</h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Shortcut groups */}
            <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {group.title}
                  </h3>
                  <div className="space-y-1.5">
                    {group.shortcuts.map((s) => (
                      <div key={s.keys[0]} className="flex items-center justify-between py-1">
                        <span className="text-sm text-foreground">{s.desc}</span>
                        <div className="flex items-center gap-1">
                          {s.keys.map((key, i) => (
                            <React.Fragment key={key}>
                              {i > 0 && <span className="text-xs text-muted-foreground">/</span>}
                              <kbd className="px-2 py-0.5 bg-muted border border-border rounded-md text-xs font-mono text-foreground shadow-sm">
                                {key === 'Escape' ? 'Esc' : key === 'Enter' ? '↵' : key}
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
                Tekan <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">?</kbd> kapan saja untuk membuka bantuan ini
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
