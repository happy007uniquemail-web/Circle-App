import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/**
 * Dialog accessibility (UI-08): `Esc` closes, Tab is trapped inside the panel,
 * and focus returns to the element that opened it. Used by the shared `Modal`
 * and by hand-rolled dialogs (story viewer) that need their own layout.
 */
export function useDialogA11y(panelRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!items.length) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    // MOD-01 scroll lock: background can't scroll behind the dialog. Saved and
    // restored per-dialog so stacked dialogs unwind in the right order.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [panelRef]);
}

interface ModalProps {
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  children: ReactNode;
  /** Panel classes — `fullscreen`-style dialogs override padding/width here. */
  className?: string;
  /** Close when the backdrop is clicked (default on; story viewer opts out). */
  dismissOnBackdrop?: boolean;
  /** Render the built-in close button (dialogs with their own set it false). */
  showClose?: boolean;
}

/**
 * One modal implementation for the whole app (UI-03/08): portal, backdrop,
 * `role="dialog"`, Esc, focus trap + restore, optional close button.
 */
export default function Modal({
  onClose,
  label,
  children,
  className = '',
  dismissOnBackdrop = true,
  showClose = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-scrim p-4 backdrop-blur-sm"
      onMouseDown={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={`relative w-full rounded-2xl border border-glass-border bg-glass-strong shadow-2xl shadow-black/60 backdrop-blur-2xl focus:outline-none ${className}`}
      >
        {showClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="tap44 absolute right-2 top-2 z-10 rounded-full p-2 text-txt-muted transition hover:bg-hover-wash hover:text-txt-main"
          >
            <X size={18} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
