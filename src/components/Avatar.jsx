import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AVATAR_COLORS } from '../lib/constants';
import { getInitials } from '../lib/initials';

export { getInitials }; // re-export agar API publik komponen tetap sama

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-lg',
};

const SHOW_DELAY = 450; // ms sebelum tooltip muncul (meniru tooltip native)
const GAP = 10;         // jarak tooltip dari avatar
const MARGIN = 8;       // jarak aman dari tepi viewport

export default function Avatar({ name, email, size = 'md', className = '', title }) {
  const initials = getInitials(name || email);
  const color = AVATAR_COLORS[(initials.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  // Tooltip disembunyikan untuk placeholder ('?') — tidak ada info tambahan.
  const tip = initials === '?' ? '' : ((title ?? (name || email)) || '').trim();

  const rootRef = useRef(null);
  const tipRef = useRef(null);
  const timerRef = useRef(null);
  const [tipPos, setTipPos] = useState({ visible: false, x: 0, y: 0, side: 'right' });

  // Bersihkan timer saat unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Sembunyikan tooltip saat scroll/resize — posisinya sudah tidak relevan
  useEffect(() => {
    if (!tipPos.visible) return;
    const hide = () => setTipPos((s) => (s.visible ? { ...s, visible: false } : s));
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [tipPos.visible]);

  function handleEnter() {
    if (!tip) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Posisi awal: di kanan avatar, vertikal di tengah avatar.
      // useLayoutEffect mengukur & menggeser agar tidak keluar viewport (sebelum paint).
      setTipPos({ visible: true, x: r.right + GAP, y: r.top + r.height / 2, side: 'right' });
    }, SHOW_DELAY);
  }

  function handleLeave() {
    clearTimeout(timerRef.current);
    setTipPos((s) => (s.visible ? { ...s, visible: false } : s));
  }

  // Ukur tooltip (portal, position fixed) lalu sesuaikan posisi sebelum paint
  useLayoutEffect(() => {
    if (!tipPos.visible) return;
    const el = tipRef.current;
    const root = rootRef.current;
    if (!el || !root) return;
    const r = el.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    let { x, y, side } = tipPos;

    // Vertikal: pusatkan pada avatar, jaga jarak aman atas/bawah
    y = Math.max(MARGIN, Math.min(y - r.height / 2, window.innerHeight - r.height - MARGIN));

    // Horizontal: jika melebihi tepi kanan, pindah ke kiri avatar
    if (side === 'right' && x + r.width > window.innerWidth - MARGIN) {
      side = 'left';
      x = rootRect.left - r.width - GAP;
    }
    x = Math.max(MARGIN, x);

    setTipPos((s) =>
      s.visible && s.x === x && s.y === y && s.side === side ? s : { ...s, x, y, side }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps sengaja hanya `visible`;
    // x/y/side dibaca sekali setelah muncul, mengikutsertakannya akan memicu loop re-measure.
  }, [tipPos.visible]);

  return (
    <>
      <div
        ref={rootRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className={`${SIZES[size] || SIZES.md} ${color} rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none ${className}`}
      >
        {initials}
      </div>

      {tipPos.visible &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="fixed z-[60] pointer-events-none animate-[tooltip-in_0.12s_ease-out]"
            style={{ top: tipPos.y, left: tipPos.x }}
          >
            <div className="relative bg-card border border-border rounded-lg shadow-xl px-2.5 py-1.5 text-xs text-foreground max-w-[260px] break-words whitespace-pre-wrap">
              {tip}
              {/* Caret menunjuk ke arah avatar */}
              <span
                className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-card ${
                  tipPos.side === 'right' ? '-left-1 border-l border-b' : '-right-1 border-r border-t'
                } border-border`}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
