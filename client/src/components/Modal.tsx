import { useEffect, type ReactNode } from 'react';

export function Modal({ children, onClose, wide = false, label }: { children: ReactNode; onClose?: () => void; wide?: boolean; label: string }) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`max-h-[92dvh] w-full animate-sheet overflow-y-auto rounded-t-3xl border border-white/15 bg-night-800 p-5 shadow-2xl scroll-thin sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}
      >
        {children}
      </div>
    </div>
  );
}
