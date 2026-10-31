import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { iconBtn } from './styles';

/**
 * Modal dasar aturan — role=dialog + aria-modal, Esc menutup, fokus ke field
 * pertama saat buka dan kembali ke pemicu saat ditutup.
 * `footerStart` (opsional) ditaruh di kiri footer (mis. tautan sekunder).
 */
export default function Modal({ title, onClose, children, size = 'max-w-lg', footer, footerStart }) {
  const titleId = useId();
  const ref = useRef(null);
  const bodyRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Sekali saat mount: fokus ke field pertama, Escape menutup, fokus kembali
  // ke pemicu saat ditutup. (onClose via ref → effect tidak re-run tiap render.)
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); } };
    document.addEventListener('keydown', onKey);
    const first = bodyRef.current?.querySelector('input, select, textarea') || ref.current?.querySelector('button');
    first?.focus();
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] px-4 pb-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`relative bg-card border border-border rounded-xl shadow-lg w-full ${size} max-h-[88vh] flex flex-col z-10`}>
        <div className="h-12 px-4 border-b border-border flex items-center justify-between gap-2 shrink-0">
          <h2 id={titleId} className="text-sm font-semibold text-foreground truncate">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className={iconBtn}><X size={16} /></button>
        </div>
        <div ref={bodyRef} className="p-4 sm:p-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-4 sm:px-5 py-3 border-t border-border flex flex-wrap items-center justify-end gap-2 shrink-0">
            {footerStart && <div className="mr-auto">{footerStart}</div>}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
