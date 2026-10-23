import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import SidePanel from './SidePanel';

/**
 * LAY-04: the desktop right panel (SidePanel) as a slide-over drawer below
 * 1200px — nothing in it is lost on tablet/mobile, it just moves behind a
 * header button.
 *
 * Portaled to <body>: the frosted app panel's backdrop-filter would otherwise
 * become the containing block for these fixed layers (trapping the scrim
 * inside the panel and letting its corner radius clip it). Portal = true
 * viewport overlay, same trick Modal.tsx and Stories.tsx already use.
 *
 * Focus moves to the close button on open, is trapped while open (Tab cycles
 * inside), Esc closes, and focus returns to the trigger on close.
 */
export default function RightDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prevFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close discover panel"
        onClick={onClose}
        className="absolute inset-0 bg-scrim"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Discover"
        className="absolute inset-y-0 right-0 flex w-80 max-w-[86vw] flex-col border-l border-border-subtle bg-surface shadow-2xl motion-safe:transition-transform motion-safe:duration-200"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-bold">Discover</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close discover panel"
            onClick={onClose}
            className="btn-icon absolute right-2 top-2 z-10"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SidePanel />
        </div>
      </div>
    </div>,
    document.body,
  );
}
