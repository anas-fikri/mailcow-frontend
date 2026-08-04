import React, { useRef, useCallback, useState } from 'react';
import { Trash2, MailOpen } from 'lucide-react';

const SWIPE_THRESHOLD = 80;
const MAX_SWIPE = 150;
const isMobile = typeof window !== 'undefined' && 'ontouchstart' in window;

/**
 * SwipeableRow — membungkus child dengan gesture swipe untuk mobile.
 *
 * Props:
 *   onSwipeLeft   — callback saat swipe kiri melewati threshold
 *   onSwipeRight  — callback saat swipe kanan melewati threshold
 *   labelLeft     — label tombol kiri (default: "Hapus")
 *   labelRight    — label tombol kanan (default: "Baca")
 *   iconLeft      — icon tombol kiri
 *   iconRight     — icon tombol kanan
 *   className     — additional class
 *   children      — konten yang bisa di-swipe
 */
export default function SwipeableRow({
  onSwipeLeft,
  onSwipeRight,
  labelLeft = 'Hapus',
  labelRight = 'Baca',
  iconLeft: IconLeft = Trash2,
  iconRight: IconRight = MailOpen,
  className = '',
  children,
}) {
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);

  // Semua hooks (useState/useRef/useCallback) harus dipanggil tanpa syarat —
  // early return ditempatkan SETELAH hooks agar sesuai Rules of Hooks.
  const onTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = 0;
    setIsSwiping(true);
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!isSwiping) return;
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = Math.abs(e.touches[0].clientY - startY.current);

    // Jika scroll vertikal lebih dominan, jangan swipe
    if (deltaY > Math.abs(deltaX) * 1.5) {
      setIsSwiping(false);
      setSwipeX(0);
      return;
    }

    const clamped = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, deltaX));
    currentX.current = clamped;
    setSwipeX(clamped);
  }, [isSwiping]);

  const onTouchEnd = useCallback(() => {
    if (!isSwiping) return;
    setIsSwiping(false);

    const absSwipe = Math.abs(currentX.current);
    if (absSwipe >= SWIPE_THRESHOLD) {
      if (currentX.current < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    }

    setSwipeX(0);
    currentX.current = 0;
  }, [isSwiping, onSwipeLeft, onSwipeRight]);

  if (!isMobile) return <div className={className}>{children}</div>;

  const isLeft = swipeX < -20;
  const isRight = swipeX > 20;
  const actionWidth = Math.min(Math.abs(swipeX), 80);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Background kiri (swipe kanan → tandai baca) */}
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-end px-4 bg-primary text-primary-foreground font-medium text-sm gap-2 z-0 transition-opacity"
        style={{
          width: isRight ? actionWidth : 0,
          opacity: isRight ? Math.min(1, Math.abs(swipeX) / SWIPE_THRESHOLD) : 0,
        }}
      >
        <IconRight size={18} />
        <span className="whitespace-nowrap text-xs">{labelRight}</span>
      </div>

      {/* Background kanan (swipe kiri → hapus) */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-start px-4 bg-destructive text-destructive-foreground font-medium text-sm gap-2 z-0 transition-opacity"
        style={{
          width: isLeft ? actionWidth : 0,
          opacity: isLeft ? Math.min(1, Math.abs(swipeX) / SWIPE_THRESHOLD) : 0,
        }}
      >
        <IconLeft size={18} />
        <span className="whitespace-nowrap text-xs">{labelLeft}</span>
      </div>

      {/* Content yang bisa digeser */}
      <div
        className="relative z-10 bg-background"
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
